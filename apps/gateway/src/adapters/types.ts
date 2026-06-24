import type { ApprovalNotificationAdapter, IntegrationAdapter } from "@agentgate/integrations";

export interface GatewayAdapters {
  github: IntegrationAdapter;
  slack: ApprovalNotificationAdapter;
}
