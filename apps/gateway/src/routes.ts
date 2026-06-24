import {
  approveApproval,
  classifyCodeChangeRisk,
  createAuditEvent,
  denyApproval,
  evaluateAction,
  type ActionRequest,
  type ApprovalRecord,
  type AuditEvent,
  type CodeChangeRisk,
  type PolicyDocument,
} from "@agentgate/core";
import type { FastifyInstance } from "fastify";
import type { GatewayAdapters } from "./adapters/types";
import { verifySlackSignature } from "./slackSignature";
import type { MemoryStore } from "./stores/memoryStore";

interface CodeChangeActionBody {
  action: string;
  agentId: string;
  changedFiles?: string[];
  deletedFiles?: string[];
  diffText?: string;
  integration: string;
  repository: string;
}

interface SlackApprovalCallbackBody {
  approvalId: string;
  decidedBy: string;
  decision: "approve" | "deny";
  reason?: string;
}

const policy: PolicyDocument = {
  defaultDecision: "block",
  rules: [
    {
      actions: ["pull_requests.create", "pull_requests.update"],
      agents: ["coding-agent"],
      effect: "allow",
      id: "allow-low-risk-pr-actions",
      integrations: ["github"],
      resources: ["risk:low"],
    },
    {
      actions: ["pull_requests.create", "pull_requests.update", "pull_requests.merge"],
      agents: ["coding-agent"],
      effect: "approval_required",
      id: "approve-risky-code-changes",
      integrations: ["github"],
      resources: ["risk:medium", "risk:high"],
    },
    {
      actions: ["branches.push_direct", "secrets.update", "checks.bypass"],
      agents: ["coding-agent"],
      effect: "block",
      id: "block-forbidden-code-changes",
      integrations: ["github"],
    },
  ],
  version: 1,
};

export function registerRoutes(
  server: FastifyInstance,
  store: MemoryStore,
  adapters: GatewayAdapters,
  slackSigningSecret: string,
): void {
  server.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => done(null, body),
  );

  server.get("/health", async () => ({
    service: "agentgate-gateway",
    status: "ok",
  }));

  server.post<{ Body: CodeChangeActionBody }>("/v1/actions/authorize", async (request) => {
    const result = authorizeCodeChange(request.body, store);

    return {
      auditEventId: result.auditEvent.id,
      decision: result.decision,
      risk: result.risk,
    };
  });

  server.post<{ Body: CodeChangeActionBody }>("/v1/actions/execute", async (request, reply) => {
    const result = authorizeCodeChange(request.body, store);

    if (result.decision.outcome === "block") {
      return reply.code(403).send({
        auditEventId: result.auditEvent.id,
        decision: result.decision,
        risk: result.risk,
      });
    }

    if (result.decision.outcome === "approval_required") {
      const approval = createPendingApproval(request.body, store, result.risk);
      const notification = await adapters.slack.notifyApprovalRequired(approval);

      if (!notification.ok) {
        return reply.code(502).send({
          auditEventId: result.auditEvent.id,
          decision: result.decision,
          notification,
          risk: result.risk,
        });
      }

      store.appendApproval(approval);

      return reply.code(202).send({
        approval,
        auditEventId: result.auditEvent.id,
        decision: result.decision,
        risk: result.risk,
      });
    }

    const execution = await adapters.github.execute(result.actionRequest);

    return {
      auditEventId: result.auditEvent.id,
      decision: result.decision,
      execution,
      risk: result.risk,
    };
  });

  server.get("/v1/audit", async () => ({
    events: store.listAuditEvents(),
  }));

  server.post<{ Body: unknown }>("/v1/slack/approvals", async (request, reply) => {
    const signature = readHeader(request.headers["x-slack-signature"]);
    const timestamp = readHeader(request.headers["x-slack-request-timestamp"]);
    const bodyText = JSON.stringify(request.body);

    if (!signature || !timestamp || !slackSigningSecret) {
      return reply.code(401).send({ error: "invalid_slack_signature" });
    }

    const signatureValid = verifySlackSignature({
      body: bodyText,
      signature,
      signingSecret: slackSigningSecret,
      timestamp,
    });

    if (!signatureValid) {
      return reply.code(401).send({ error: "invalid_slack_signature" });
    }

    const callback = parseSlackApprovalCallback(request.body);

    if (!callback) {
      return reply.code(400).send({ error: "invalid_slack_payload" });
    }

    const approval = store.findApproval(callback.approvalId);

    if (!approval) {
      return reply.code(404).send({ error: "approval_not_found" });
    }

    const updatedApproval = transitionApprovalFromCallback(approval, callback);

    store.replaceApproval(updatedApproval);

    return { approval: updatedApproval };
  });

  server.post<{ Body: string }>("/v1/slack/interactions", async (request, reply) => {
    const signature = readHeader(request.headers["x-slack-signature"]);
    const timestamp = readHeader(request.headers["x-slack-request-timestamp"]);
    const bodyText = typeof request.body === "string" ? request.body : "";

    if (!signature || !timestamp || !slackSigningSecret) {
      return reply.code(401).send({ error: "invalid_slack_signature" });
    }

    const signatureValid = verifySlackSignature({
      body: bodyText,
      signature,
      signingSecret: slackSigningSecret,
      timestamp,
    });

    if (!signatureValid) {
      return reply.code(401).send({ error: "invalid_slack_signature" });
    }

    const callback = parseSlackInteractionCallback(bodyText);

    if (!callback) {
      return reply.code(400).send({ error: "invalid_slack_payload" });
    }

    const approval = store.findApproval(callback.approvalId);

    if (!approval) {
      return reply.code(404).send({ error: "approval_not_found" });
    }

    const updatedApproval = transitionApprovalFromCallback(approval, callback);

    store.replaceApproval(updatedApproval);

    return { approval: updatedApproval };
  });
}

function authorizeCodeChange(body: CodeChangeActionBody, store: MemoryStore) {
  const risk = classifyCodeChangeRisk(createRiskInput(body));
  const actionRequest = createActionRequest(body, risk.level);
  const decision = evaluateAction(actionRequest, policy);
  const auditEvent = appendAuditEvent(body, store, risk, decision.outcome);

  return { actionRequest, auditEvent, decision, risk };
}

function createRiskInput(body: CodeChangeActionBody) {
  const input = {
    changedFiles: body.changedFiles ?? [],
  };

  return {
    ...input,
    ...(body.deletedFiles ? { deletedFiles: body.deletedFiles } : {}),
    ...(body.diffText ? { diffText: body.diffText } : {}),
  };
}

function createActionRequest(body: CodeChangeActionBody, riskLevel: string): ActionRequest {
  return {
    action: body.action,
    agentId: body.agentId,
    input: {
      changedFiles: body.changedFiles ?? [],
      deletedFiles: body.deletedFiles ?? [],
      repository: body.repository,
    },
    integration: body.integration,
    target: `risk:${riskLevel}`,
  };
}

function appendAuditEvent(
  body: CodeChangeActionBody,
  store: MemoryStore,
  risk: CodeChangeRisk,
  decision: "allow" | "block" | "approval_required",
): AuditEvent {
  const previousEvent = store.listAuditEvents().at(-1);
  const sequence = store.listAuditEvents().length + 1;
  const event = createAuditEvent({
    action: body.action,
    changedFiles: body.changedFiles ?? [],
    decision,
    id: `audit_${sequence}`,
    payload: body,
    previousHash: previousEvent?.hash ?? "genesis",
    repository: body.repository,
    requestId: `request_${sequence}`,
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    timestamp: new Date().toISOString(),
  });

  store.appendAuditEvent(event);

  return event;
}

function createPendingApproval(
  body: CodeChangeActionBody,
  store: MemoryStore,
  risk: CodeChangeRisk,
): ApprovalRecord {
  return {
    action: body.action,
    id: `approval_${store.listApprovals().length + 1}`,
    repository: body.repository,
    requestedAt: new Date().toISOString(),
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    status: "pending",
  };
}

function transitionApprovalFromCallback(
  approval: ApprovalRecord,
  body: SlackApprovalCallbackBody,
): ApprovalRecord {
  const input = {
    decidedAt: new Date().toISOString(),
    decidedBy: body.decidedBy,
    ...(body.reason ? { reason: body.reason } : {}),
  };

  if (body.decision === "approve") {
    return approveApproval(approval, input);
  }

  return denyApproval(approval, input);
}

function readHeader(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function parseSlackApprovalCallback(value: unknown): SlackApprovalCallbackBody | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const approvalId = readRequiredString(value.approvalId);
  const decidedBy = readRequiredString(value.decidedBy);
  const decision = value.decision;

  if (!approvalId || !decidedBy || (decision !== "approve" && decision !== "deny")) {
    return undefined;
  }

  return {
    approvalId,
    decidedBy,
    decision,
    ...(typeof value.reason === "string" && value.reason.trim()
      ? { reason: value.reason.trim() }
      : {}),
  };
}

function readRequiredString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseSlackInteractionCallback(bodyText: string): SlackApprovalCallbackBody | undefined {
  const encodedPayload = new URLSearchParams(bodyText).get("payload");

  if (!encodedPayload) {
    return undefined;
  }

  const payload = parseJsonRecord(encodedPayload);
  const user = isRecord(payload?.user) ? payload.user : undefined;
  const action = Array.isArray(payload?.actions) ? payload.actions[0] : undefined;

  if (!isRecord(action)) {
    return undefined;
  }

  const approvalId = readRequiredString(action.value);
  const decidedBy = readRequiredString(user?.id);
  const actionId = action.action_id;

  if (!approvalId || !decidedBy) {
    return undefined;
  }

  if (actionId === "agentgate.approve") {
    return {
      approvalId,
      decidedBy,
      decision: "approve",
    };
  }

  if (actionId === "agentgate.deny") {
    return {
      approvalId,
      decidedBy,
      decision: "deny",
    };
  }

  return undefined;
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text) as unknown;

    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
