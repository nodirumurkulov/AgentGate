import { describe, expect, it } from "vitest";
import {
  approveApproval,
  denyApproval,
  expireApproval,
  type ApprovalRecord,
} from "./approvals";

const pendingApproval: ApprovalRecord = {
  action: "pull_requests.update",
  id: "approval_1",
  repository: "nodirumurkulov/AgentGate",
  requestedAt: "2026-06-21T00:00:00.000Z",
  riskLevel: "high",
  riskReasons: ["Authentication or authorization code changed."],
  status: "pending",
};

describe("approval transitions", () => {
  it("approves a pending approval", () => {
    const approval = approveApproval(pendingApproval, {
      decidedAt: "2026-06-21T00:01:00.000Z",
      decidedBy: "security-reviewer",
    });

    expect(approval).toMatchObject({
      decidedAt: "2026-06-21T00:01:00.000Z",
      decidedBy: "security-reviewer",
      status: "approved",
    });
  });

  it("denies a pending approval", () => {
    const approval = denyApproval(pendingApproval, {
      decidedAt: "2026-06-21T00:02:00.000Z",
      decidedBy: "security-reviewer",
      reason: "Auth changes need a human patch.",
    });

    expect(approval).toMatchObject({
      decisionReason: "Auth changes need a human patch.",
      status: "denied",
    });
  });

  it("expires a pending approval", () => {
    const approval = expireApproval(pendingApproval, {
      decidedAt: "2026-06-21T01:00:00.000Z",
      decidedBy: "system",
    });

    expect(approval).toMatchObject({
      decidedBy: "system",
      status: "expired",
    });
  });

  it("throws when transitioning a non-pending approval", () => {
    const approved = approveApproval(pendingApproval, {
      decidedAt: "2026-06-21T00:01:00.000Z",
      decidedBy: "security-reviewer",
    });

    expect(() =>
      denyApproval(approved, {
        decidedAt: "2026-06-21T00:02:00.000Z",
        decidedBy: "security-reviewer",
      }),
    ).toThrow("Only pending approvals can transition.");
  });
});
