import { describe, expect, it } from "vitest";
import { evaluateAction } from "./policy";
import type { PolicyDocument } from "./types";

const policy: PolicyDocument = {
  defaultDecision: "block",
  rules: [
    {
      actions: ["pull_requests.create", "pull_requests.update"],
      agents: ["coding-agent"],
      effect: "allow",
      id: "allow-low-risk-pr-actions",
      integrations: ["github"],
      resources: ["risk:low"],
    },
    {
      actions: ["pull_requests.create", "pull_requests.update", "pull_requests.merge"],
      agents: ["coding-agent"],
      effect: "approval_required",
      id: "approve-high-risk-code-changes",
      integrations: ["github"],
      resources: ["risk:high"],
    },
    {
      actions: ["branches.push_direct", "secrets.update", "checks.bypass"],
      agents: ["coding-agent"],
      effect: "block",
      id: "block-forbidden-code-changes",
      integrations: ["github"],
    },
  ],
  version: 1,
};

describe("evaluateAction", () => {
  it("allows low-risk pull request creation", () => {
    const decision = evaluateAction(
      {
        action: "pull_requests.create",
        agentId: "coding-agent",
        integration: "github",
        target: "risk:low",
      },
      policy,
    );

    expect(decision.outcome).toBe("allow");
  });

  it("requires approval for high-risk pull request updates", () => {
    const decision = evaluateAction(
      {
        action: "pull_requests.update",
        agentId: "coding-agent",
        integration: "github",
        target: "risk:high",
      },
      policy,
    );

    expect(decision.outcome).toBe("approval_required");
  });

  it("blocks forbidden direct pushes", () => {
    const decision = evaluateAction(
      {
        action: "branches.push_direct",
        agentId: "coding-agent",
        integration: "github",
        target: "risk:low",
      },
      policy,
    );

    expect(decision.outcome).toBe("block");
  });

  it("blocks unknown actions by default", () => {
    const decision = evaluateAction(
      {
        action: "repos.delete",
        agentId: "coding-agent",
        integration: "github",
        target: "nodirumurkulov/AgentGate",
      },
      policy,
    );

    expect(decision.outcome).toBe("block");
    expect(decision.reason).toBe("Default block decision applied.");
  });
});

