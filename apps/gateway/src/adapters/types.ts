import type {
  ApprovalNotificationAdapter,
  IntegrationAdapter,
  IntegrationResult,
} from "@agentgate/integrations";

export type GitHubCommitStatusState = "error" | "failure" | "pending" | "success";

export interface AgentGateCommitStatus {
  description: string;
  headSha: string;
  repository: string;
  state: GitHubCommitStatusState;
  targetUrl?: string;
}

export interface GitHubAdapter extends IntegrationAdapter {
  publishAgentGateStatus(status: AgentGateCommitStatus): Promise<IntegrationResult>;
}

export interface GatewayAdapters {
  github: GitHubAdapter;
  slack: ApprovalNotificationAdapter;
}
