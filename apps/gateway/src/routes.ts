import {
  approveApproval,
  classifyCodeChangeRisk,
  createAuditEvent,
  denyApproval,
  evaluateAction,
  expireApproval,
  type ActionRequest,
  type ApprovalRecord,
  type AuditEvent,
  type CodeChangeRisk,
  type PolicyDocument,
} from "@agentgate/core";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { GatewayAdapters } from "./adapters/types";
import { verifyGitHubSignature } from "./githubSignature";
import { verifySlackSignature } from "./slackSignature";
import type { GatewayStore } from "./stores/types";

interface CodeChangeActionBody {
  action: string;
  agentId: string;
  changedFiles?: string[];
  deletedFiles?: string[];
  diffText?: string;
  github?: unknown;
  integration: string;
  repository: string;
}

interface SlackApprovalCallbackBody {
  approvalId: string;
  callbackToken?: string;
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

const defaultApprovalCallbackTokenTtlMs = 15 * 60 * 1000;

export function registerRoutes(
  server: FastifyInstance,
  store: GatewayStore,
  adapters: GatewayAdapters,
  slackSigningSecret: string,
  githubWebhookSecret: string,
  approvalCallbackTokenTtlMs = defaultApprovalCallbackTokenTtlMs,
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
      const approval = createPendingApproval(
        request.body,
        store,
        result.risk,
        approvalCallbackTokenTtlMs,
      );
      const notification = await adapters.slack.notifyApprovalRequired(approval);

      if (!notification.ok) {
        return reply.code(502).send({
          auditEventId: result.auditEvent.id,
          decision: result.decision,
          notification,
          risk: result.risk,
        });
      }

      store.appendApproval(toStoredApproval(approval));

      return reply.code(202).send({
        approval: toPublicApproval(approval),
        auditEventId: result.auditEvent.id,
        decision: result.decision,
        risk: result.risk,
      });
    }

    const execution = await adapters.github.execute(result.actionRequest);

    if (!execution.ok) {
      return reply.code(502).send({
        auditEventId: result.auditEvent.id,
        decision: result.decision,
        execution,
        risk: result.risk,
      });
    }

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

  server.post<{ Body: unknown }>("/v1/github/webhooks", async (request, reply) => {
    const signature = readHeader(request.headers["x-hub-signature-256"]);
    const event = readHeader(request.headers["x-github-event"]);
    const deliveryId = readHeader(request.headers["x-github-delivery"]);
    const bodyText = readRawBody(request);

    if (!signature || !githubWebhookSecret || !bodyText) {
      return reply.code(401).send({ error: "invalid_github_signature" });
    }

    const signatureValid = verifyGitHubSignature({
      body: bodyText,
      signature,
      webhookSecret: githubWebhookSecret,
    });

    if (!signatureValid) {
      return reply.code(401).send({ error: "invalid_github_signature" });
    }

    if (!event || !deliveryId || !isRecord(request.body)) {
      return reply.code(400).send({ error: "invalid_github_payload" });
    }

    if (githubDeliveryWasProcessed(store, deliveryId)) {
      return reply.code(409).send({ error: "github_delivery_already_processed" });
    }

    const auditEvent = appendGitHubWebhookAuditEvent({
      deliveryId,
      event,
      payload: request.body,
      store,
    });

    return reply.code(202).send({
      auditEventId: auditEvent.id,
      ok: true,
    });
  });

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

    if (!approvalTokenIsValid(approval, callback)) {
      appendApprovalCallbackAuditEvent(store, approval, "invalid_token");

      return reply.code(401).send({ error: "invalid_approval_token" });
    }

    if (approval.status !== "pending") {
      appendApprovalCallbackAuditEvent(store, approval, "replayed");

      return reply.code(409).send({
        approval: toPublicApproval(approval),
        error: "approval_already_decided",
      });
    }

    const expiredApproval = expireApprovalIfCallbackTokenExpired(approval);

    if (expiredApproval) {
      store.replaceApproval(expiredApproval);
      appendApprovalCallbackAuditEvent(store, expiredApproval, "expired");

      return reply.code(410).send({
        approval: toPublicApproval(expiredApproval),
        error: "approval_expired",
      });
    }

    const result = await transitionApprovalFromCallback(approval, callback, adapters);
    const responseBody = toApprovalCallbackResponse(result);

    store.replaceApproval(result.approval);
    appendApprovalCallbackAuditEvent(store, result.approval, approvalCallbackAuditOutcome(result.approval));

    if (result.execution && !result.execution.ok) {
      return reply.code(502).send(responseBody);
    }

    return responseBody;
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

    if (!approvalTokenIsValid(approval, callback)) {
      appendApprovalCallbackAuditEvent(store, approval, "invalid_token");

      return reply.code(401).send({ error: "invalid_approval_token" });
    }

    if (approval.status !== "pending") {
      appendApprovalCallbackAuditEvent(store, approval, "replayed");

      return reply.code(409).send({
        approval: toPublicApproval(approval),
        error: "approval_already_decided",
      });
    }

    const expiredApproval = expireApprovalIfCallbackTokenExpired(approval);

    if (expiredApproval) {
      store.replaceApproval(expiredApproval);
      appendApprovalCallbackAuditEvent(store, expiredApproval, "expired");

      return reply.code(410).send({
        approval: toPublicApproval(expiredApproval),
        error: "approval_expired",
      });
    }

    const result = await transitionApprovalFromCallback(approval, callback, adapters);
    const responseBody = toApprovalCallbackResponse(result);

    store.replaceApproval(result.approval);
    appendApprovalCallbackAuditEvent(store, result.approval, approvalCallbackAuditOutcome(result.approval));

    if (result.execution && !result.execution.ok) {
      return reply.code(502).send(responseBody);
    }

    return responseBody;
  });
}

interface GitHubWebhookAuditInput {
  deliveryId: string;
  event: string;
  payload: Record<string, unknown>;
  store: GatewayStore;
}

type ApprovalCallbackAuditOutcome = "approved" | "denied" | "expired" | "invalid_token" | "replayed";

type ApprovalCallbackResult = {
  approval: ApprovalRecord;
  execution?: Awaited<ReturnType<GatewayAdapters["github"]["execute"]>>;
};

type PublicApprovalRecord = Omit<ApprovalRecord, "callbackToken" | "callbackTokenHash">;

type ApprovalCallbackResponse = Omit<ApprovalCallbackResult, "approval"> & {
  approval: PublicApprovalRecord;
};

function authorizeCodeChange(body: CodeChangeActionBody, store: GatewayStore) {
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
      ...(body.github ? { github: body.github } : {}),
      repository: body.repository,
    },
    integration: body.integration,
    target: `risk:${riskLevel}`,
  };
}

function appendAuditEvent(
  body: CodeChangeActionBody,
  store: GatewayStore,
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

function appendGitHubWebhookAuditEvent(input: GitHubWebhookAuditInput): AuditEvent {
  const previousEvent = input.store.listAuditEvents().at(-1);
  const sequence = input.store.listAuditEvents().length + 1;
  const repository = readRepositoryFullName(input.payload) ?? "unknown";
  const webhookAction = readRequiredString(input.payload.action) ?? "unknown";
  const pullRequestNumber = readPullRequestNumber(input.payload);
  const requestId = createGitHubDeliveryRequestId(input.deliveryId);
  const event = createAuditEvent({
    action: `github.webhook.${input.event}.${webhookAction}`,
    changedFiles: [],
    decision: "allow",
    id: `audit_${sequence}`,
    payload: {
      action: webhookAction,
      deliveryId: input.deliveryId,
      event: input.event,
      ...(pullRequestNumber ? { pullRequestNumber } : {}),
    },
    previousHash: previousEvent?.hash ?? "genesis",
    repository,
    requestId,
    riskLevel: "low",
    riskReasons: [],
    timestamp: new Date().toISOString(),
  });

  input.store.appendAuditEvent(event);

  return event;
}

function appendApprovalCallbackAuditEvent(
  store: GatewayStore,
  approval: ApprovalRecord,
  outcome: ApprovalCallbackAuditOutcome,
): AuditEvent {
  const previousEvent = store.listAuditEvents().at(-1);
  const sequence = store.listAuditEvents().length + 1;
  const event = createAuditEvent({
    action: `slack.approval.${outcome}`,
    changedFiles: readApprovalChangedFiles(approval),
    decision: approvalCallbackAuditDecision(outcome),
    id: `audit_${sequence}`,
    payload: {
      approvalId: approval.id,
      ...(approval.decidedBy ? { decidedBy: approval.decidedBy } : {}),
      status: approval.status,
    },
    previousHash: previousEvent?.hash ?? "genesis",
    repository: approval.repository,
    requestId: `approval_${approval.id}_${outcome}_${sequence}`,
    riskLevel: approval.riskLevel,
    riskReasons: [approvalCallbackAuditReason(outcome)],
    timestamp: new Date().toISOString(),
  });

  store.appendAuditEvent(event);

  return event;
}

function approvalCallbackAuditDecision(
  outcome: ApprovalCallbackAuditOutcome,
): AuditEvent["decision"] {
  return outcome === "approved" ? "allow" : "block";
}

function approvalCallbackAuditOutcome(approval: ApprovalRecord): ApprovalCallbackAuditOutcome {
  return approval.status === "approved" ? "approved" : "denied";
}

function approvalCallbackAuditReason(outcome: ApprovalCallbackAuditOutcome): string {
  if (outcome === "approved") {
    return "Approval granted by reviewer.";
  }

  if (outcome === "denied") {
    return "Approval denied by reviewer.";
  }

  if (outcome === "invalid_token") {
    return "Invalid approval callback token.";
  }

  if (outcome === "replayed") {
    return "Approval callback was already decided.";
  }

  return "Approval callback token expired.";
}

function readApprovalChangedFiles(approval: ApprovalRecord): string[] {
  const changedFiles = approval.actionRequest?.input?.changedFiles;

  return Array.isArray(changedFiles) && changedFiles.every((file) => typeof file === "string")
    ? changedFiles
    : [];
}

function githubDeliveryWasProcessed(store: GatewayStore, deliveryId: string): boolean {
  const requestId = createGitHubDeliveryRequestId(deliveryId);

  return store.listAuditEvents().some((event) => event.requestId === requestId);
}

function createGitHubDeliveryRequestId(deliveryId: string): string {
  return `github_${deliveryId}`;
}

function toApprovalCallbackResponse(result: ApprovalCallbackResult): ApprovalCallbackResponse {
  return {
    ...result,
    approval: toPublicApproval(result.approval),
  };
}

function toPublicApproval(approval: ApprovalRecord): PublicApprovalRecord {
  const publicApproval = { ...approval };
  delete publicApproval.callbackToken;
  delete publicApproval.callbackTokenHash;

  return publicApproval;
}

function toStoredApproval(approval: ApprovalRecord): ApprovalRecord {
  const storedApproval = { ...approval };
  delete storedApproval.callbackToken;

  return storedApproval;
}

function createPendingApproval(
  body: CodeChangeActionBody,
  store: GatewayStore,
  risk: CodeChangeRisk,
  callbackTokenTtlMs: number,
): ApprovalRecord {
  const actionRequest = createActionRequest(body, risk.level);
  const callbackToken = randomUUID();
  const requestedAt = new Date();

  return {
    action: body.action,
    actionRequest,
    callbackToken,
    callbackTokenExpiresAt: new Date(requestedAt.getTime() + callbackTokenTtlMs).toISOString(),
    callbackTokenHash: hashApprovalCallbackToken(callbackToken),
    id: `approval_${store.listApprovals().length + 1}`,
    repository: body.repository,
    requestedAt: requestedAt.toISOString(),
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    status: "pending",
  };
}

function approvalTokenIsValid(
  approval: ApprovalRecord,
  callback: SlackApprovalCallbackBody,
): boolean {
  if (!callback.callbackToken) {
    return true;
  }

  if (approval.callbackTokenHash) {
    return approvalTokenHashMatches(approval.callbackTokenHash, callback.callbackToken);
  }

  return approval.callbackToken === callback.callbackToken;
}

function hashApprovalCallbackToken(callbackToken: string): string {
  return createHash("sha256").update(callbackToken).digest("hex");
}

function approvalTokenHashMatches(expectedHash: string, callbackToken: string): boolean {
  const actualHash = hashApprovalCallbackToken(callbackToken);

  if (!isSha256Hex(expectedHash)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function expireApprovalIfCallbackTokenExpired(approval: ApprovalRecord): ApprovalRecord | undefined {
  if (!approval.callbackTokenExpiresAt) {
    return undefined;
  }

  const expiresAt = Date.parse(approval.callbackTokenExpiresAt);

  if (Number.isNaN(expiresAt) || expiresAt > Date.now()) {
    return undefined;
  }

  return expireApproval(approval, {
    decidedAt: new Date().toISOString(),
    decidedBy: "agentgate",
    reason: "Approval callback token expired.",
  });
}

function transitionApprovalFromCallback(
  approval: ApprovalRecord,
  body: SlackApprovalCallbackBody,
  adapters: GatewayAdapters,
): Promise<ApprovalCallbackResult> {
  const input = {
    decidedAt: new Date().toISOString(),
    decidedBy: body.decidedBy,
    ...(body.reason ? { reason: body.reason } : {}),
  };

  if (body.decision === "approve") {
    return executeApprovedAction(approveApproval(approval, input), adapters);
  }

  return Promise.resolve({ approval: denyApproval(approval, input) });
}

async function executeApprovedAction(
  approval: ApprovalRecord,
  adapters: GatewayAdapters,
): Promise<ApprovalCallbackResult> {
  if (!approval.actionRequest) {
    return { approval };
  }

  const execution = await adapters.github.execute(approval.actionRequest);

  return {
    approval,
    execution,
  };
}

function readHeader(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function readRawBody(request: unknown): string | undefined {
  return isRecord(request) && typeof request.rawBody === "string" ? request.rawBody : undefined;
}

function readRepositoryFullName(payload: Record<string, unknown>): string | undefined {
  const repository = isRecord(payload.repository) ? payload.repository : undefined;

  return readRequiredString(repository?.full_name);
}

function readPullRequestNumber(payload: Record<string, unknown>): number | undefined {
  const pullRequest = isRecord(payload.pull_request) ? payload.pull_request : undefined;
  const number = pullRequest?.number;

  return typeof number === "number" && Number.isInteger(number) && number > 0 ? number : undefined;
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
    ...(typeof value.callbackToken === "string" && value.callbackToken.trim()
      ? { callbackToken: value.callbackToken.trim() }
      : {}),
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

  const approvalValue = parseApprovalCallbackValue(action.value);
  const decidedBy = readRequiredString(user?.id);
  const actionId = action.action_id;

  if (!approvalValue || !decidedBy) {
    return undefined;
  }

  if (actionId === "agentgate.approve") {
    return {
      approvalId: approvalValue.approvalId,
      callbackToken: approvalValue.callbackToken,
      decidedBy,
      decision: "approve",
    };
  }

  if (actionId === "agentgate.deny") {
    return {
      approvalId: approvalValue.approvalId,
      callbackToken: approvalValue.callbackToken,
      decidedBy,
      decision: "deny",
    };
  }

  return undefined;
}

function parseApprovalCallbackValue(
  value: unknown,
): { approvalId: string; callbackToken: string } | undefined {
  const text = readRequiredString(value);

  if (!text) {
    return undefined;
  }

  const separatorIndex = text.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === text.length - 1) {
    return undefined;
  }

  return {
    approvalId: text.slice(0, separatorIndex),
    callbackToken: text.slice(separatorIndex + 1),
  };
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text) as unknown;

    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
