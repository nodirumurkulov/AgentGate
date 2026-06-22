import type { ApprovalRecord, AuditEvent } from "@agentgate/core";

export class MemoryStore {
  private readonly approvals: ApprovalRecord[] = [];
  private readonly auditEvents: AuditEvent[] = [];

  appendApproval(approval: ApprovalRecord): void {
    this.approvals.push(approval);
  }

  listApprovals(): ApprovalRecord[] {
    return [...this.approvals];
  }

  appendAuditEvent(event: AuditEvent): void {
    this.auditEvents.push(event);
  }

  listAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }
}
