import { describe, expect, it } from "vitest";
import { buildCodeChangeScenarios } from "./scenario";

describe("buildCodeChangeScenarios", () => {
  it("returns the fixture PR risk actions", () => {
    expect(buildCodeChangeScenarios()).toEqual([
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
    ]);
  });
});
