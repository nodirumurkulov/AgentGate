import type { AuditEvent } from "@agentgate/core";

export class MemoryStore {
  private readonly auditEvents: AuditEvent[] = [];

  appendAuditEvent(event: AuditEvent): void {
    this.auditEvents.push(event);
  }

  listAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }
}

