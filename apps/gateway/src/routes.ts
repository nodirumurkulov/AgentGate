import {
  classifyCodeChangeRisk,
  createAuditEvent,
  evaluateAction,
  type ActionRequest,
  type ApprovalRecord,
  type AuditEvent,
  type CodeChangeRisk,
  type PolicyDocument,
} from "@agentgate/core";
import type { FastifyInstance } from "fastify";
import type { GatewayAdapters } from "./adapters/fixtureAdapters";
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
): void {
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

      store.appendApproval(approval);
      await adapters.slack.notifyApprovalRequired(approval);

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
