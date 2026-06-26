import type { ActionRequest, ApprovalRecord } from "@agentgate/core";
import type {
  ApprovalNotificationAdapter,
  IntegrationResult,
} from "@agentgate/integrations";
import type { AgentGateCommitStatus, GatewayAdapters, GitHubAdapter } from "./types";

const pullRequestActions = [
  "pull_requests.create",
  "pull_requests.update",
  "pull_requests.merge",
];

export function createFixtureAdapters(): GatewayAdapters {
  return {
    github: new FixtureGitHubAdapter(),
    slack: new FixtureSlackApprovalAdapter(),
  };
}

class FixtureGitHubAdapter implements GitHubAdapter {
  integration = "github";

  async execute(request: ActionRequest): Promise<IntegrationResult> {
    if (!pullRequestActions.includes(request.action)) {
      return {
        data: {
          action: request.action,
          error: "unsupported_action",
        },
        ok: false,
      };
    }

    return {
      data: {
        action: request.action,
        repository: request.input?.repository,
      },
      externalRequestId: `fixture_github_${request.action}`,
      ok: true,
    };
  }

  async publishAgentGateStatus(status: AgentGateCommitStatus): Promise<IntegrationResult> {
    return {
      data: {
        headSha: status.headSha,
        repository: status.repository,
        state: status.state,
      },
      externalRequestId: `fixture_github_status_${status.headSha}`,
      ok: true,
    };
  }
}

class FixtureSlackApprovalAdapter implements ApprovalNotificationAdapter {
  integration = "slack";

  async notifyApprovalRequired(approval: ApprovalRecord): Promise<IntegrationResult> {
    return {
      data: {
        action: approval.action,
        approvalId: approval.id,
        repository: approval.repository,
      },
      externalRequestId: `fixture_slack_${approval.id}`,
      ok: true,
    };
  }
}
