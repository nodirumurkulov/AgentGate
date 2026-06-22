import { describe, expect, it } from "vitest";
import { createGatewayApp } from "./app";

describe("code-change gate fixture flow", () => {
  it("covers allow, approval, and block outcomes for PR risk actions", async () => {
    const app = createGatewayApp();

    const docsOnly = await app.inject({
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

    expect(docsOnly.statusCode).toBe(200);
    expect(docsOnly.json()).toMatchObject({
      decision: {
        outcome: "allow",
      },
      execution: {
        ok: true,
      },
    });

    const authUpdate = await app.inject({
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

    expect(authUpdate.statusCode).toBe(202);
    expect(authUpdate.json()).toMatchObject({
      approval: {
        status: "pending",
      },
      decision: {
        outcome: "approval_required",
      },
    });
    expect(authUpdate.json().execution).toBeUndefined();

    const branchPush = await app.inject({
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

    expect(branchPush.statusCode).toBe(403);
    expect(branchPush.json()).toMatchObject({
      decision: {
        outcome: "block",
      },
    });
    expect(branchPush.json().execution).toBeUndefined();

    const auditTrail = await app.inject({
      method: "GET",
      url: "/v1/audit",
    });

    const auditEvents = auditTrail.json().events;

    expect(auditTrail.statusCode).toBe(200);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents).toMatchObject([
      {
        action: "pull_requests.create",
        changedFiles: ["README.md"],
        decision: "allow",
        id: docsOnly.json().auditEventId,
        previousHash: "genesis",
        riskLevel: "low",
      },
      {
        action: "pull_requests.update",
        changedFiles: ["src/auth/session.ts"],
        decision: "approval_required",
        id: authUpdate.json().auditEventId,
        previousHash: auditEvents[0].hash,
        riskLevel: "high",
        riskReasons: ["Authentication or authorization code changed."],
      },
      {
        action: "branches.push_direct",
        changedFiles: ["README.md"],
        decision: "block",
        id: branchPush.json().auditEventId,
        previousHash: auditEvents[1].hash,
        riskLevel: "low",
      },
    ]);
  });
});
