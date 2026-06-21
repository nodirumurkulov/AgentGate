import { describe, expect, it } from "vitest";
import { createGatewayApp } from "./app";

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
});
