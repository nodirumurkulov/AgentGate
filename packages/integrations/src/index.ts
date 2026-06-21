import type { ActionRequest } from "@agentgate/core";

export interface IntegrationAdapter {
  execute(request: ActionRequest): Promise<IntegrationResult>;
  integration: string;
}

export interface IntegrationResult {
  data: Record<string, unknown>;
  externalRequestId?: string;
  ok: boolean;
}

export const plannedIntegrations = ["github", "slack"] as const;

export type PlannedIntegration = (typeof plannedIntegrations)[number];
