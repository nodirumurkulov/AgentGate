import { describe, expect, it } from "vitest";
import { createAuditEvent, redactValue } from "./audit";

describe("redactValue", () => {
  it("redacts sensitive keys recursively", () => {
    const redacted = redactValue({
      credential: "github-app",
      nested: {
        privateKey: "key",
        token: "abc",
      },
      password: "secret",
      safe: "visible",
    });

    expect(redacted).toEqual({
      credential: "[REDACTED]",
      nested: {
        privateKey: "[REDACTED]",
        token: "[REDACTED]",
      },
      password: "[REDACTED]",
      safe: "visible",
    });
  });
});

describe("createAuditEvent", () => {
  it("creates a hash-chained code-change audit event with redacted payload evidence", () => {
    const event = createAuditEvent({
      action: "pull_requests.update",
      changedFiles: ["src/auth/session.ts"],
      decision: "approval_required",
      id: "audit_1",
      payload: {
        token: "abc",
      },
      previousHash: "genesis",
      repository: "nodirumurkulov/AgentGate",
      requestId: "req_1",
      riskLevel: "high",
      riskReasons: ["Authentication or authorization code changed."],
      timestamp: "2026-06-21T00:00:00.000Z",
    });

    expect(event).toMatchObject({
      action: "pull_requests.update",
      changedFiles: ["src/auth/session.ts"],
      decision: "approval_required",
      id: "audit_1",
      payload: {
        token: "[REDACTED]",
      },
      previousHash: "genesis",
      repository: "nodirumurkulov/AgentGate",
      requestId: "req_1",
      riskLevel: "high",
      riskReasons: ["Authentication or authorization code changed."],
      timestamp: "2026-06-21T00:00:00.000Z",
    });
    expect(event.hash).toHaveLength(64);
  });
});

