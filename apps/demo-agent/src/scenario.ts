import type { AgentGateActionRequest } from "@agentgate/sdk";

export function buildCodeChangeScenarios(): AgentGateActionRequest[] {
  return [
    {
      action: "pull_requests.create",
      agentId: "coding-agent",
      changedFiles: ["README.md"],
      integration: "github",
      repository: "nodirumurkulov/AgentGate",
    },
    {
      action: "pull_requests.update",
      agentId: "coding-agent",
      changedFiles: ["src/auth/session.ts"],
      integration: "github",
      repository: "nodirumurkulov/AgentGate",
    },
    {
      action: "branches.push_direct",
      agentId: "coding-agent",
      changedFiles: ["README.md"],
      integration: "github",
      repository: "nodirumurkulov/AgentGate",
    },
  ];
}
