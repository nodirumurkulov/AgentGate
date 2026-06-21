import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePolicyYaml } from "./policySchema";

describe("parsePolicyYaml", () => {
  it("parses the sample AgentGate policy", () => {
    const policyText = readFileSync(new URL("../../../agentgate.policy.yaml", import.meta.url), {
      encoding: "utf8",
    });

    const policy = parsePolicyYaml(policyText);

    expect(policy.defaultDecision).toBe("block");
    expect(policy.rules.map((rule) => rule.id)).toContain("allow-low-risk-pr-actions");
  });

  it("rejects policies that do not block by default", () => {
    expect(() =>
      parsePolicyYaml(`
version: 1
defaultDecision: allow
rules: []
`),
    ).toThrow("Policy defaultDecision must be 'block'.");
  });

  it("rejects rules without agents", () => {
    expect(() =>
      parsePolicyYaml(`
version: 1
defaultDecision: block
rules:
  - id: broken-rule
    effect: allow
    agents: []
    integrations: [github]
    actions: [pull_requests.create]
`),
    ).toThrow("Policy rule 'broken-rule' must include at least one agent.");
  });

  it("rejects rules without actions", () => {
    expect(() =>
      parsePolicyYaml(`
version: 1
defaultDecision: block
rules:
  - id: missing-actions
    effect: allow
    agents: [coding-agent]
    integrations: [github]
`),
    ).toThrow("Policy rule 'missing-actions' must include at least one action.");
  });
});

