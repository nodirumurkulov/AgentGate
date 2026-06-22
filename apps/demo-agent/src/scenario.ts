import type { AgentGateActionRequest } from "@agentgate/sdk";

export type ScenarioOutcome = "allow" | "approval_required" | "block";

export interface CodeChangeScenario {
  expectedOutcome: ScenarioOutcome;
  name: string;
  request: AgentGateActionRequest;
}

export function buildCodeChangeScenarios(): CodeChangeScenario[] {
  return [
    {
      expectedOutcome: "allow",
      name: "docs-only PR creation",
      request: {
        action: "pull_requests.create",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
    },
    {
      expectedOutcome: "approval_required",
      name: "auth-code PR update",
      request: {
        action: "pull_requests.update",
        agentId: "coding-agent",
        changedFiles: ["src/auth/session.ts"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
    },
    {
      expectedOutcome: "block",
      name: "direct branch push",
      request: {
        action: "branches.push_direct",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
    },
  ];
}
