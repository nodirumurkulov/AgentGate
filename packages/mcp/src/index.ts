export interface GuardedMcpTool {
  action: string;
  description: string;
  integration: string;
  name: string;
}

export const guardedMcpTools: GuardedMcpTool[] = [
  {
    action: "pull_requests.create",
    description: "Create a low-risk GitHub pull request through AgentGate authorization.",
    integration: "github",
    name: "agentgate.github.create_pull_request",
  },
  {
    action: "pull_requests.update",
    description: "Update a GitHub pull request through AgentGate authorization.",
    integration: "github",
    name: "agentgate.github.update_pull_request",
  },
  {
    action: "pull_requests.merge",
    description: "Merge a GitHub pull request after AgentGate authorization.",
    integration: "github",
    name: "agentgate.github.merge_pull_request",
  },
  {
    action: "messages.post",
    description: "Send a Slack approval notification for high-risk code changes.",
    integration: "slack",
    name: "agentgate.slack.request_code_change_approval",
  },
];
