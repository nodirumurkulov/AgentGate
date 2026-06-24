import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GatewayAdapters } from "./adapters/types";
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

  it("approves a pending approval from a signed Slack interaction payload", async () => {
    const app = createGatewayApp({ slackSigningSecret });
    const approval = await createPendingApproval(app);
    const body = createSlackInteractionBody({
      actions: [
        {
          action_id: "agentgate.approve",
          value: approval.id,
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

function signedSlackRawBodyHeaders(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${createHmac("sha256", slackSigningSecret)
      .update(`v0:${timestamp}:${body}`)
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
