import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ApprovalRecord, AuditEvent } from "@agentgate/core";
import type { GatewayStore } from "./types";

interface JsonStoreState {
  approvals: ApprovalRecord[];
  auditEvents: AuditEvent[];
}

export class JsonFileStore implements GatewayStore {
  private state: JsonStoreState;

  constructor(private readonly filePath: string) {
    this.state = readState(filePath);
  }

  appendApproval(approval: ApprovalRecord): void {
    this.state.approvals.push(approval);
    this.persist();
  }

  findApproval(id: string): ApprovalRecord | undefined {
    return this.state.approvals.find((approval) => approval.id === id);
  }

  listApprovals(): ApprovalRecord[] {
    return [...this.state.approvals];
  }

  replaceApproval(approval: ApprovalRecord): void {
    const index = this.state.approvals.findIndex((item) => item.id === approval.id);

    if (index === -1) {
      throw new Error(`Approval '${approval.id}' does not exist.`);
    }

    this.state.approvals.splice(index, 1, approval);
    this.persist();
  }

  appendAuditEvent(event: AuditEvent): void {
    this.state.auditEvents.push(event);
    this.persist();
  }

  listAuditEvents(): AuditEvent[] {
    return [...this.state.auditEvents];
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });

    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.filePath);
  }
}

function readState(filePath: string): JsonStoreState {
  if (!existsSync(filePath)) {
    return createEmptyState();
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<JsonStoreState>;

  return {
    approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
    auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
  };
}

function createEmptyState(): JsonStoreState {
  return {
    approvals: [],
    auditEvents: [],
  };
}
