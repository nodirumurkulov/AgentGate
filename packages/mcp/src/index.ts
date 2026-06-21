export interface GuardedMcpTool {
  action: string;
  description: string;
  integration: string;
  name: string;
}

export const guardedMcpTools: GuardedMcpTool[] = [
  {
    action: "issues.read",
    description: "Read a GitHub issue through AgentGate authorization.",
    integration: "github",
    name: "agentgate.github.read_issue",
  },
  {
    action: "messages.post",
    description: "Post a Slack message through AgentGate authorization.",
    integration: "slack",
    name: "agentgate.slack.post_message",
  },
  {
    action: "pages.read",
    description: "Read a Notion page through AgentGate authorization.",
    integration: "notion",
    name: "agentgate.notion.read_page",
  },
  {
    action: "incidents.escalate",
    description: "Escalate an incident through AgentGate authorization.",
    integration: "internal-api",
    name: "agentgate.internal.escalate_incident",
  },
];

