import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApprovalRecord } from "@agentgate/core";
import { describe, expect, it } from "vitest";
import type { GatewayAdapters } from "./adapters/types";
import { createGatewayApp } from "./app";

const slackSigningSecret = "test_slack_signing_secret";
const githubWebhookSecret = "test_github_webhook_secret";

describe("gateway app", () => {
  it("allows low-risk pull request creation", async () => {
    const app = createGatewayApp();

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.create",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/authorize",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      decision: {
        outcome: "allow",
      },
      risk: {
        level: "low",
      },
    });
  });

  it("requires approval for high-risk pull request updates", async () => {
    const app = createGatewayApp();

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.update",
        agentId: "coding-agent",
        changedFiles: ["src/auth/session.ts"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/authorize",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      decision: {
        outcome: "approval_required",
      },
      risk: {
        level: "high",
      },
    });
  });

  it("blocks forbidden repository actions", async () => {
    const app = createGatewayApp();

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "branches.push_direct",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/authorize",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      decision: {
        outcome: "block",
      },
    });
  });

  it("lists audit events after authorization decisions", async () => {
    const app = createGatewayApp();

    await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.update",
        agentId: "coding-agent",
        changedFiles: ["src/auth/session.ts"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/authorize",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/audit",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0]).toMatchObject({
      action: "pull_requests.update",
      decision: "approval_required",
      riskLevel: "high",
    });
  });

  it("records signed GitHub pull request webhook deliveries as audit events", async () => {
    const app = createGatewayApp({
      env: {
        GITHUB_WEBHOOK_SECRET: githubWebhookSecret,
      },
    });
    const bodyText = `{
  "action": "opened",
  "repository": {
    "full_name": "nodirumurkulov/AgentGate"
  },
  "pull_request": {
    "number": 12
  }
}`;

    const response = await app.inject({
      headers: {
        ...signedGitHubHeaders(bodyText),
        "content-type": "application/json",
        "x-github-delivery": "delivery_1",
        "x-github-event": "pull_request",
      },
      method: "POST",
      payload: bodyText,
      url: "/v1/github/webhooks",
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      auditEventId: "audit_1",
      ok: true,
    });

    const auditResponse = await app.inject({
      method: "GET",
      url: "/v1/audit",
    });

    expect(auditResponse.json().events).toHaveLength(1);
    expect(auditResponse.json().events[0]).toMatchObject({
      action: "github.webhook.pull_request.opened",
      decision: "allow",
      payload: {
        deliveryId: "delivery_1",
        event: "pull_request",
        pullRequestNumber: 12,
      },
      repository: "nodirumurkulov/AgentGate",
      requestId: "github_delivery_1",
      riskLevel: "low",
    });
  });

  it("rejects duplicate GitHub webhook deliveries without duplicating audit events", async () => {
    const app = createGatewayApp({
      env: {
        GITHUB_WEBHOOK_SECRET: githubWebhookSecret,
      },
    });
    const bodyText = JSON.stringify({
      action: "opened",
      pull_request: {
        number: 12,
      },
      repository: {
        full_name: "nodirumurkulov/AgentGate",
      },
    });
    const request = {
      headers: {
        ...signedGitHubHeaders(bodyText),
        "content-type": "application/json",
        "x-github-delivery": "delivery_1",
        "x-github-event": "pull_request",
      },
      method: "POST" as const,
      payload: bodyText,
      url: "/v1/github/webhooks",
    };

    const firstResponse = await app.inject(request);
    const duplicateResponse = await app.inject(request);

    expect(firstResponse.statusCode).toBe(202);
    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toEqual({
      error: "github_delivery_already_processed",
    });

    const auditResponse = await app.inject({
      method: "GET",
      url: "/v1/audit",
    });

    expect(auditResponse.json().events).toHaveLength(1);
  });

  it("rejects GitHub webhook deliveries with invalid signatures", async () => {
    const app = createGatewayApp({
      env: {
        GITHUB_WEBHOOK_SECRET: githubWebhookSecret,
      },
    });
    const bodyText = JSON.stringify({
      action: "opened",
      repository: {
        full_name: "nodirumurkulov/AgentGate",
      },
    });

    const response = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery_1",
        "x-github-event": "pull_request",
        "x-hub-signature-256": "sha256=invalid",
      },
      method: "POST",
      payload: bodyText,
      url: "/v1/github/webhooks",
    });

    expect(response.statusCode).toBe(401);

    const auditResponse = await app.inject({
      method: "GET",
      url: "/v1/audit",
    });

    expect(auditResponse.json().events).toEqual([]);
  });

  it("executes allowed low-risk pull request actions", async () => {
    const app = createGatewayApp();

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.create",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/execute",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      decision: {
        outcome: "allow",
      },
      execution: {
        ok: true,
      },
      risk: {
        level: "low",
      },
    });
  });

  it("passes GitHub create pull request input to the GitHub adapter", async () => {
    const githubInputs: unknown[] = [];
    const app = createGatewayApp({
      adapters: createCapturingGitHubAdapters(githubInputs),
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.create",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        github: {
          base: "main",
          draft: true,
          head: "agentgate-smoke",
          title: "AgentGate smoke test",
        },
        integration: "github",
        repository: "nodirumurkulov/agentgate-sandbox",
      },
      url: "/v1/actions/execute",
    });

    expect(response.statusCode).toBe(200);
    expect(githubInputs).toEqual([
      {
        base: "main",
        draft: true,
        head: "agentgate-smoke",
        title: "AgentGate smoke test",
      },
    ]);
  });

  it("fails closed when allowed GitHub execution fails", async () => {
    const app = createGatewayApp({
      adapters: createFailingGitHubAdapters(),
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.create",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/agentgate-sandbox",
      },
      url: "/v1/actions/execute",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      decision: {
        outcome: "allow",
      },
      execution: {
        data: {
          error: "github_create_pull_request_failed",
        },
        ok: false,
      },
    });
  });

  it("creates a pending approval for high-risk pull request actions", async () => {
    const app = createGatewayApp();

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.update",
        agentId: "coding-agent",
        changedFiles: ["src/auth/session.ts"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/execute",
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      approval: {
        action: "pull_requests.update",
        repository: "nodirumurkulov/AgentGate",
        riskLevel: "high",
        status: "pending",
      },
      decision: {
        outcome: "approval_required",
      },
    });
    expect(response.json().approval.callbackToken).toBeUndefined();
    expect(response.json().execution).toBeUndefined();
  });

  it("fails closed when the approval notification cannot be sent", async () => {
    const githubExecutions: string[] = [];
    const app = createGatewayApp({
      adapters: createFailingSlackAdapters(githubExecutions),
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "pull_requests.update",
        agentId: "coding-agent",
        changedFiles: ["src/auth/session.ts"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/execute",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      decision: {
        outcome: "approval_required",
      },
      notification: {
        data: {
          error: "slack_unavailable",
        },
        ok: false,
      },
    });
    expect(response.json().execution).toBeUndefined();
    expect(githubExecutions).toEqual([]);
  });

  it("does not execute blocked repository actions", async () => {
    const app = createGatewayApp();

    const response = await app.inject({
      method: "POST",
      payload: {
        action: "branches.push_direct",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
      url: "/v1/actions/execute",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      decision: {
        outcome: "block",
      },
    });
    expect(response.json().execution).toBeUndefined();
  });

  it("approves a pending approval from a signed Slack callback", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const approval = await createPendingApproval(app);
    const payload = {
      approvalId: approval.id,
      decidedBy: "security-reviewer",
      decision: "approve",
    };

    const response = await app.inject({
      headers: signedSlackHeaders(payload),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().approval).toMatchObject({
      decidedBy: "security-reviewer",
      id: approval.id,
      status: "approved",
    });
    expect(response.json().approval.callbackToken).toBeUndefined();
  });

  it("executes the stored action after a signed Slack approval", async () => {
    const githubRequests: unknown[] = [];
    const app = createGatewayApp({
      adapters: createRecordingAdapters(githubRequests),
      slackSigningSecret,
    });
    const approval = await createPendingApproval(app, {
      github: {
        pullNumber: 7,
        title: "Approved auth update",
      },
    });
    const payload = {
      approvalId: approval.id,
      decidedBy: "security-reviewer",
      decision: "approve",
    };

    const response = await app.inject({
      headers: signedSlackHeaders(payload),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      approval: {
        id: approval.id,
        status: "approved",
      },
      execution: {
        ok: true,
      },
    });
    expect(githubRequests).toEqual([
      {
        action: "pull_requests.update",
        input: {
          changedFiles: ["src/auth/session.ts"],
          deletedFiles: [],
          github: {
            pullNumber: 7,
            title: "Approved auth update",
          },
          repository: "nodirumurkulov/AgentGate",
        },
        integration: "github",
        target: "risk:high",
      },
    ]);
  });

  it("persists pending approvals when a store path is configured", async () => {
    const env = {
      AGENTGATE_STORE_PATH: createStorePath(),
    };
    const firstApp = createGatewayApp({ env, slackSigningSecret });
    const approval = await createPendingApproval(firstApp);
    const secondApp = createGatewayApp({ env, slackSigningSecret });
    const payload = {
      approvalId: approval.id,
      decidedBy: "security-reviewer",
      decision: "approve",
    };

    const response = await secondApp.inject({
      headers: signedSlackHeaders(payload),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().approval).toMatchObject({
      decidedBy: "security-reviewer",
      id: approval.id,
      status: "approved",
    });
  });

  it("persists approval callback token hashes without storing raw callback tokens", async () => {
    const env = {
      AGENTGATE_STORE_PATH: createStorePath(),
    };
    const githubRequests: unknown[] = [];
    const slackApprovals: ApprovalRecord[] = [];
    const firstApp = createGatewayApp({
      adapters: createRecordingAdapters(githubRequests, slackApprovals),
      env,
      slackSigningSecret,
    });
    const approval = await createPendingApproval(firstApp);
    const callbackToken = requireCallbackToken(slackApprovals);
    const storedApproval = readStoredApproval(env.AGENTGATE_STORE_PATH);

    expect(storedApproval.callbackToken).toBeUndefined();
    expect(storedApproval.callbackTokenHash).toEqual(expect.any(String));
    expect(storedApproval.callbackTokenHash).not.toContain(callbackToken);

    const secondApp = createGatewayApp({
      adapters: createRecordingAdapters(githubRequests),
      env,
      slackSigningSecret,
    });
    const body = createSlackInteractionBody({
      actions: [
        {
          action_id: "agentgate.approve",
          value: `${approval.id}:${callbackToken}`,
        },
      ],
      user: {
        id: "U123",
      },
    });

    const response = await secondApp.inject({
      headers: {
        ...signedSlackRawBodyHeaders(body),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      payload: body,
      url: "/v1/slack/interactions",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().approval).toMatchObject({
      id: approval.id,
      status: "approved",
    });
    expect(githubRequests).toHaveLength(1);
  });

  it("uses the configured approval callback token TTL", async () => {
    const env = {
      AGENTGATE_APPROVAL_TOKEN_TTL_SECONDS: "1",
      AGENTGATE_STORE_PATH: createStorePath(),
    };
    const app = createGatewayApp({
      adapters: createRecordingAdapters([]),
      env,
      slackSigningSecret,
    });

    await createPendingApproval(app);

    const storedApproval = readStoredApproval(env.AGENTGATE_STORE_PATH);
    const ttlMs =
      Date.parse(requireStoredField(storedApproval, "callbackTokenExpiresAt")) -
      Date.parse(requireStoredField(storedApproval, "requestedAt"));

    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(1000);
  });

  it("denies a pending approval from a signed Slack callback", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const approval = await createPendingApproval(app);
    const payload = {
      approvalId: approval.id,
      decidedBy: "security-reviewer",
      decision: "deny",
      reason: "Auth change needs owner review.",
    };

    const response = await app.inject({
      headers: signedSlackHeaders(payload),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().approval).toMatchObject({
      decisionReason: "Auth change needs owner review.",
      id: approval.id,
      status: "denied",
    });
  });

  it("does not execute the stored action after a signed Slack denial", async () => {
    const githubRequests: unknown[] = [];
    const app = createGatewayApp({
      adapters: createRecordingAdapters(githubRequests),
      slackSigningSecret,
    });
    const approval = await createPendingApproval(app);
    const payload = {
      approvalId: approval.id,
      decidedBy: "security-reviewer",
      decision: "deny",
      reason: "Needs owner review.",
    };

    const response = await app.inject({
      headers: signedSlackHeaders(payload),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().approval).toMatchObject({
      id: approval.id,
      status: "denied",
    });
    expect(response.json().execution).toBeUndefined();
    expect(githubRequests).toEqual([]);
  });

  it("approves a pending approval from a signed Slack interaction payload", async () => {
    const slackApprovals: ApprovalRecord[] = [];
    const app = createGatewayApp({
      adapters: createRecordingAdapters([], slackApprovals),
      slackSigningSecret,
    });
    const approval = await createPendingApproval(app);
    const callbackToken = requireCallbackToken(slackApprovals);
    const body = createSlackInteractionBody({
      actions: [
        {
          action_id: "agentgate.approve",
          value: `${approval.id}:${callbackToken}`,
        },
      ],
      user: {
        id: "U123",
      },
    });

    const response = await app.inject({
      headers: {
        ...signedSlackRawBodyHeaders(body),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      payload: body,
      url: "/v1/slack/interactions",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().approval).toMatchObject({
      decidedBy: "U123",
      id: approval.id,
      status: "approved",
    });
    expect(response.json().approval.callbackToken).toBeUndefined();
  });

  it("rejects Slack interaction callbacks with invalid approval tokens", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const approval = await createPendingApproval(app);
    const body = createSlackInteractionBody({
      actions: [
        {
          action_id: "agentgate.approve",
          value: `${approval.id}:wrong-token`,
        },
      ],
      user: {
        id: "U123",
      },
    });

    const response = await app.inject({
      headers: {
        ...signedSlackRawBodyHeaders(body),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      payload: body,
      url: "/v1/slack/interactions",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_approval_token" });

    const auditResponse = await app.inject({
      method: "GET",
      url: "/v1/audit",
    });
    const events = auditResponse.json().events;

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      action: "slack.approval.invalid_token",
      changedFiles: ["src/auth/session.ts"],
      decision: "block",
      payload: {
        approvalId: approval.id,
        status: "pending",
      },
      repository: "nodirumurkulov/AgentGate",
      riskLevel: "high",
      riskReasons: ["Invalid approval callback token."],
    });
    expect(JSON.stringify(events[1].payload)).not.toContain("wrong-token");
  });

  it("rejects replayed Slack approval callbacks without executing twice", async () => {
    const githubRequests: unknown[] = [];
    const slackApprovals: ApprovalRecord[] = [];
    const app = createGatewayApp({
      adapters: createRecordingAdapters(githubRequests, slackApprovals),
      slackSigningSecret,
    });
    const approval = await createPendingApproval(app);
    const callbackToken = requireCallbackToken(slackApprovals);
    const body = createSlackInteractionBody({
      actions: [
        {
          action_id: "agentgate.approve",
          value: `${approval.id}:${callbackToken}`,
        },
      ],
      user: {
        id: "U123",
      },
    });
    const headers = {
      ...signedSlackRawBodyHeaders(body),
      "content-type": "application/x-www-form-urlencoded",
    };

    await app.inject({
      headers,
      method: "POST",
      payload: body,
      url: "/v1/slack/interactions",
    });

    const replayResponse = await app.inject({
      headers,
      method: "POST",
      payload: body,
      url: "/v1/slack/interactions",
    });

    expect(replayResponse.statusCode).toBe(409);
    expect(replayResponse.json()).toMatchObject({
      error: "approval_already_decided",
      approval: {
        id: approval.id,
        status: "approved",
      },
    });
    expect(replayResponse.json().approval.callbackToken).toBeUndefined();
    expect(githubRequests).toHaveLength(1);

    const auditResponse = await app.inject({
      method: "GET",
      url: "/v1/audit",
    });
    const events = auditResponse.json().events;

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      action: "slack.approval.replayed",
      changedFiles: ["src/auth/session.ts"],
      decision: "block",
      payload: {
        approvalId: approval.id,
        status: "approved",
      },
      repository: "nodirumurkulov/AgentGate",
      riskLevel: "high",
      riskReasons: ["Approval callback was already decided."],
    });
  });

  it("expires stale Slack interaction callbacks without executing GitHub", async () => {
    const env = {
      AGENTGATE_STORE_PATH: createStorePath(),
    };
    const githubRequests: unknown[] = [];
    const slackApprovals: ApprovalRecord[] = [];
    const firstApp = createGatewayApp({
      adapters: createRecordingAdapters(githubRequests, slackApprovals),
      env,
      slackSigningSecret,
    });
    const approval = await createPendingApproval(firstApp);
    const callbackToken = requireCallbackToken(slackApprovals);
    expireStoredApprovalCallbackToken(env.AGENTGATE_STORE_PATH);
    const secondApp = createGatewayApp({
      adapters: createRecordingAdapters(githubRequests),
      env,
      slackSigningSecret,
    });
    const body = createSlackInteractionBody({
      actions: [
        {
          action_id: "agentgate.approve",
          value: `${approval.id}:${callbackToken}`,
        },
      ],
      user: {
        id: "U123",
      },
    });

    const response = await secondApp.inject({
      headers: {
        ...signedSlackRawBodyHeaders(body),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      payload: body,
      url: "/v1/slack/interactions",
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      approval: {
        id: approval.id,
        status: "expired",
      },
      error: "approval_expired",
    });
    expect(githubRequests).toEqual([]);

    const auditResponse = await secondApp.inject({
      method: "GET",
      url: "/v1/audit",
    });
    const events = auditResponse.json().events;

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      action: "slack.approval.expired",
      changedFiles: ["src/auth/session.ts"],
      decision: "block",
      payload: {
        approvalId: approval.id,
        status: "expired",
      },
      repository: "nodirumurkulov/AgentGate",
      riskLevel: "high",
      riskReasons: ["Approval callback token expired."],
    });
  });

  it("rejects malformed Slack interaction payloads", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const body = new URLSearchParams({
      payload: JSON.stringify({
        actions: [],
        user: {
          id: "U123",
        },
      }),
    }).toString();

    const response = await app.inject({
      headers: {
        ...signedSlackRawBodyHeaders(body),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      payload: body,
      url: "/v1/slack/interactions",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_slack_payload" });
  });

  it("rejects Slack approval callbacks with invalid signatures", async () => {
    const app = createGatewayApp({ slackSigningSecret });

    const response = await app.inject({
      headers: {
        "x-slack-request-timestamp": "1782000000",
        "x-slack-signature": "v0=invalid",
      },
      method: "POST",
      payload: {
        approvalId: "approval_1",
        decidedBy: "security-reviewer",
        decision: "approve",
      },
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects Slack approval callbacks with stale timestamps", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const payload = {
      approvalId: "approval_1",
      decidedBy: "security-reviewer",
      decision: "approve",
    };

    const response = await app.inject({
      headers: signedSlackHeaders(payload, staleTimestamp),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects Slack approval callbacks with unsupported decisions", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const approval = await createPendingApproval(app);
    const payload = {
      approvalId: approval.id,
      decidedBy: "security-reviewer",
      decision: "archive",
    };

    const response = await app.inject({
      headers: signedSlackHeaders(payload),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_slack_payload" });
  });

  it("rejects Slack approval callbacks without an approval actor", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const approval = await createPendingApproval(app);
    const payload = {
      approvalId: approval.id,
      decision: "approve",
    };

    const response = await app.inject({
      headers: signedSlackHeaders(payload),
      method: "POST",
      payload,
      url: "/v1/slack/approvals",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_slack_payload" });
  });
});

async function createPendingApproval(
  app: ReturnType<typeof createGatewayApp>,
  overrides: Partial<{
    github: Record<string, unknown>;
  }> = {},
) {
  const response = await app.inject({
    method: "POST",
    payload: {
      action: "pull_requests.update",
      agentId: "coding-agent",
      changedFiles: ["src/auth/session.ts"],
      ...(overrides.github ? { github: overrides.github } : {}),
      integration: "github",
      repository: "nodirumurkulov/AgentGate",
    },
    url: "/v1/actions/execute",
  });

  return response.json().approval;
}

function signedSlackHeaders(
  payload: Record<string, string>,
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  const body = JSON.stringify(payload);

  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${createHmac("sha256", slackSigningSecret)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`,
  };
}

function signedSlackRawBodyHeaders(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${createHmac("sha256", slackSigningSecret)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`,
  };
}

function signedGitHubHeaders(body: string) {
  return {
    "x-hub-signature-256": `sha256=${createHmac("sha256", githubWebhookSecret)
      .update(body)
      .digest("hex")}`,
  };
}

function createSlackInteractionBody(payload: Record<string, unknown>): string {
  return new URLSearchParams({
    payload: JSON.stringify(payload),
  }).toString();
}

function createStorePath(): string {
  return join(mkdtempSync(join(tmpdir(), "agentgate-app-store-")), "store.json");
}

function requireCallbackToken(approvals: ApprovalRecord[]): string {
  const token = approvals[0]?.callbackToken;

  if (!token) {
    throw new Error("Expected Slack approval callback token to be captured.");
  }

  return token;
}

function readStoredApproval(storePath: string): Record<string, string | undefined> {
  const state = JSON.parse(readFileSync(storePath, "utf8")) as {
    approvals?: Record<string, string | undefined>[];
  };
  const approval = state.approvals?.[0];

  if (!approval) {
    throw new Error("Expected approval to be persisted.");
  }

  return approval;
}

function requireStoredField(approval: Record<string, string | undefined>, field: string): string {
  const value = approval[field];

  if (!value) {
    throw new Error(`Expected stored approval field '${field}'.`);
  }

  return value;
}

function expireStoredApprovalCallbackToken(storePath: string): void {
  const state = JSON.parse(readFileSync(storePath, "utf8")) as {
    approvals?: Array<Record<string, string | undefined>>;
  };
  const approval = state.approvals?.[0];

  if (!approval) {
    throw new Error("Expected approval to be persisted.");
  }

  approval.callbackTokenExpiresAt = "1970-01-01T00:00:00.000Z";
  writeFileSync(storePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function createFailingSlackAdapters(githubExecutions: string[]): GatewayAdapters {
  return {
    github: {
      integration: "github",
      async execute(request) {
        githubExecutions.push(request.action);

        return {
          data: {
            action: request.action,
          },
          ok: true,
        };
      },
    },
    slack: {
      integration: "slack",
      async notifyApprovalRequired() {
        return {
          data: {
            error: "slack_unavailable",
          },
          ok: false,
        };
      },
    },
  };
}

function createRecordingAdapters(
  githubRequests: unknown[],
  slackApprovals: ApprovalRecord[] = [],
): GatewayAdapters {
  return {
    github: {
      integration: "github",
      async execute(request) {
        githubRequests.push({
          action: request.action,
          input: request.input,
          integration: request.integration,
          target: request.target,
        });

        return {
          data: {
            action: request.action,
          },
          ok: true,
        };
      },
    },
    slack: {
      integration: "slack",
      async notifyApprovalRequired(approval) {
        slackApprovals.push(approval);

        return {
          data: {},
          ok: true,
        };
      },
    },
  };
}

function createCapturingGitHubAdapters(githubInputs: unknown[]): GatewayAdapters {
  return {
    github: {
      integration: "github",
      async execute(request) {
        githubInputs.push(request.input?.github);

        return {
          data: {
            action: request.action,
          },
          ok: true,
        };
      },
    },
    slack: {
      integration: "slack",
      async notifyApprovalRequired() {
        return {
          data: {},
          ok: true,
        };
      },
    },
  };
}

function createFailingGitHubAdapters(): GatewayAdapters {
  return {
    github: {
      integration: "github",
      async execute() {
        return {
          data: {
            error: "github_create_pull_request_failed",
          },
          ok: false,
        };
      },
    },
    slack: {
      integration: "slack",
      async notifyApprovalRequired() {
        return {
          data: {},
          ok: true,
        };
      },
    },
  };
}
