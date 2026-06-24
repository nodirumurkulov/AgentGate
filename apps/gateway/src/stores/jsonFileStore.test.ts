import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApprovalRecord, AuditEvent } from "@agentgate/core";
import { describe, expect, it } from "vitest";
import { JsonFileStore } from "./jsonFileStore";

const approval: ApprovalRecord = {
  action: "pull_requests.update",
  id: "approval_1",
  repository: "nodirumurkulov/AgentGate",
  requestedAt: "2026-06-24T00:00:00.000Z",
  riskLevel: "high",
  riskReasons: ["Authentication or authorization code changed."],
  status: "pending",
};

const auditEvent: AuditEvent = {
  action: "pull_requests.update",
  changedFiles: ["src/auth/session.ts"],
  decision: "approval_required",
  hash: "hash_1",
  id: "audit_1",
  payload: {
    action: "pull_requests.update",
  },
  previousHash: "genesis",
  repository: "nodirumurkulov/AgentGate",
  requestId: "request_1",
  riskLevel: "high",
  riskReasons: ["Authentication or authorization code changed."],
  timestamp: "2026-06-24T00:00:00.000Z",
};

describe("JsonFileStore", () => {
  it("persists approvals and audit events across store instances", () => {
    const filePath = createStorePath();
    const store = new JsonFileStore(filePath);

    store.appendApproval(approval);
    store.appendAuditEvent(auditEvent);

    const reloadedStore = new JsonFileStore(filePath);

    expect(reloadedStore.listApprovals()).toEqual([approval]);
    expect(reloadedStore.listAuditEvents()).toEqual([auditEvent]);
  });

  it("persists replaced approvals", () => {
    const filePath = createStorePath();
    const store = new JsonFileStore(filePath);
    const approved: ApprovalRecord = {
      ...approval,
      decidedAt: "2026-06-24T00:01:00.000Z",
      decidedBy: "U123",
      status: "approved",
    };

    store.appendApproval(approval);
    store.replaceApproval(approved);

    const reloadedStore = new JsonFileStore(filePath);

    expect(reloadedStore.findApproval(approval.id)).toEqual(approved);
  });
});

function createStorePath(): string {
  return join(mkdtempSync(join(tmpdir(), "agentgate-store-")), "store.json");
}
