import type { AgentGateActionRequest } from "@agentgate/sdk";

export interface GuardedMcpTool {
  action: string;
  description: string;
  integration: string;
  name: string;
}

export interface GuardedMcpToolArguments {
  agentId: string;
  changedFiles?: string[];
  deletedFiles?: string[];
  diffText?: string;
  repository: string;
}

export interface AgentGateMcpClient {
  execute(request: AgentGateActionRequest): Promise<unknown>;
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

export async function callGuardedTool(
  name: string,
  args: GuardedMcpToolArguments,
  client: AgentGateMcpClient,
): Promise<unknown> {
  const tool = guardedMcpTools.find((item) => item.name === name);

  if (!tool) {
    throw new Error("Unknown AgentGate MCP tool.");
  }

  return client.execute(createActionRequest(tool, args));
}

function createActionRequest(
  tool: GuardedMcpTool,
  args: GuardedMcpToolArguments,
): AgentGateActionRequest {
  return {
    action: tool.action,
    agentId: args.agentId,
    ...(args.changedFiles ? { changedFiles: args.changedFiles } : {}),
    ...(args.deletedFiles ? { deletedFiles: args.deletedFiles } : {}),
    ...(args.diffText ? { diffText: args.diffText } : {}),
    integration: tool.integration,
    repository: args.repository,
  };
}
