import { parse } from "yaml";
import type { DecisionOutcome, PolicyDocument, PolicyRule } from "./types";

const effects: DecisionOutcome[] = ["allow", "block", "approval_required"];

export function parsePolicyYaml(text: string): PolicyDocument {
  const value = parse(text) as unknown;
  const record = asRecord(value, "Policy must be a YAML object.");

  if (record.version !== 1) {
    throw new Error("Policy version must be 1.");
  }

  if (record.defaultDecision !== "block") {
    throw new Error("Policy defaultDecision must be 'block'.");
  }

  return {
    defaultDecision: "block",
    rules: parseRules(record.rules),
    version: 1,
  };
}

function parseRules(value: unknown): PolicyRule[] {
  if (!Array.isArray(value)) {
    throw new Error("Policy rules must be an array.");
  }

  return value.map(parseRule);
}

function parseRule(value: unknown): PolicyRule {
  const rule = asRecord(value, "Policy rule must be an object.");
  const id = assertString(rule.id, "Policy rule id must be a string.");
  const policyRule: PolicyRule = {
    actions: assertStringArray(
      rule.actions,
      `Policy rule '${id}' must include at least one action.`,
    ),
    agents: assertStringArray(rule.agents, `Policy rule '${id}' must include at least one agent.`),
    effect: assertEffect(rule.effect, `Policy rule '${id}' has an invalid effect.`),
    id,
    integrations: assertStringArray(
      rule.integrations,
      `Policy rule '${id}' must include at least one integration.`,
    ),
  };

  const resources = optionalStringArray(rule.resources, `Policy rule '${id}' resources must be strings.`);

  if (resources) {
    policyRule.resources = resources;
  }

  return policyRule;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }

  return value;
}

function assertStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new Error(message);
  }

  return value;
}

function optionalStringArray(value: unknown, message: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return assertStringArray(value, message);
}

function assertEffect(value: unknown, message: string): DecisionOutcome {
  if (!effects.includes(value as DecisionOutcome)) {
    throw new Error(message);
  }

  return value as DecisionOutcome;
}
