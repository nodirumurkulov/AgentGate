import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGatewayApp } from "./app";

const slackSigningSecret = "test_slack_signing_secret";

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
    expect(response.json().execution).toBeUndefined();
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
});

async function createPendingApproval(app: ReturnType<typeof createGatewayApp>) {
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
