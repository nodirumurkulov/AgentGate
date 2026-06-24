import type { ActionRequest, CodeRiskLevel } from "./types";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ApprovalRecord {
  action: string;
  actionRequest?: ActionRequest;
  callbackToken?: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  id: string;
  repository: string;
  requestedAt: string;
  riskLevel: CodeRiskLevel;
  riskReasons: string[];
  status: ApprovalStatus;
}

export interface ApprovalTransitionInput {
  decidedAt: string;
  decidedBy: string;
  reason?: string;
}

export function approveApproval(
  approval: ApprovalRecord,
  input: ApprovalTransitionInput,
): ApprovalRecord {
  return transitionApproval(approval, "approved", input);
}

export function denyApproval(
  approval: ApprovalRecord,
  input: ApprovalTransitionInput,
): ApprovalRecord {
  return transitionApproval(approval, "denied", input);
}

export function expireApproval(
  approval: ApprovalRecord,
  input: ApprovalTransitionInput,
): ApprovalRecord {
  return transitionApproval(approval, "expired", input);
}

function transitionApproval(
  approval: ApprovalRecord,
  status: Exclude<ApprovalStatus, "pending">,
  input: ApprovalTransitionInput,
): ApprovalRecord {
  if (approval.status !== "pending") {
    throw new Error("Only pending approvals can transition.");
  }

  return {
    ...approval,
    decidedAt: input.decidedAt,
    decidedBy: input.decidedBy,
    ...(input.reason ? { decisionReason: input.reason } : {}),
    status,
  };
}
