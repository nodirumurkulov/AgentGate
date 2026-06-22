import type { ApprovalRecord, AuditEvent } from "@agentgate/core";

export class MemoryStore {
  private readonly approvals: ApprovalRecord[] = [];
  private readonly auditEvents: AuditEvent[] = [];

  appendApproval(approval: ApprovalRecord): void {
    this.approvals.push(approval);
  }

  findApproval(id: string): ApprovalRecord | undefined {
    return this.approvals.find((approval) => approval.id === id);
  }

  listApprovals(): ApprovalRecord[] {
    return [...this.approvals];
  }

  replaceApproval(approval: ApprovalRecord): void {
    const index = this.approvals.findIndex((item) => item.id === approval.id);

    if (index === -1) {
      throw new Error(`Approval '${approval.id}' does not exist.`);
    }

    this.approvals.splice(index, 1, approval);
  }

  appendAuditEvent(event: AuditEvent): void {
    this.auditEvents.push(event);
  }

  listAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }
}
