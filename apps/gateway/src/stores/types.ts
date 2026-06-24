import type { ApprovalRecord, AuditEvent } from "@agentgate/core";

export interface GatewayStore {
  appendApproval(approval: ApprovalRecord): void;
  appendAuditEvent(event: AuditEvent): void;
  findApproval(id: string): ApprovalRecord | undefined;
  listApprovals(): ApprovalRecord[];
  listAuditEvents(): AuditEvent[];
  replaceApproval(approval: ApprovalRecord): void;
}
