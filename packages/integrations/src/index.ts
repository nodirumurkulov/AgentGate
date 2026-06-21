import type { ActionRequest, ApprovalRecord } from "@agentgate/core";

export interface IntegrationAdapter {
  execute(request: ActionRequest): Promise<IntegrationResult>;
  integration: string;
}

export interface IntegrationResult {
  data: Record<string, unknown>;
  externalRequestId?: string;
  ok: boolean;
}

export interface ApprovalNotificationAdapter {
  integration: string;
  notifyApprovalRequired(approval: ApprovalRecord): Promise<IntegrationResult>;
}

export const plannedIntegrations = ["github", "slack"] as const;

export type PlannedIntegration = (typeof plannedIntegrations)[number];
