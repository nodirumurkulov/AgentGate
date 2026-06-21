import type { ActionRequest, Decision, PolicyRule, PolicyDocument } from "./types";

export function evaluateAction(request: ActionRequest, policy: PolicyDocument): Decision {
  const matchingRules = policy.rules.filter((rule) => matchesRule(request, rule));
  const blockRule = matchingRules.find((rule) => rule.effect === "block");

  if (blockRule) {
    return decisionForRule(request, blockRule);
  }

  const approvalRule = matchingRules.find((rule) => rule.effect === "approval_required");

  if (approvalRule) {
    return decisionForRule(request, approvalRule);
  }

  const allowRule = matchingRules.find((rule) => rule.effect === "allow");

  if (allowRule) {
    return decisionForRule(request, allowRule);
  }

  return {
    evidence: ["No policy rule matched this action request."],
    outcome: policy.defaultDecision,
    reason: "Default block decision applied.",
    request,
  };
}

function decisionForRule(request: ActionRequest, rule: PolicyRule): Decision {
  return {
    evidence: [`Matched policy rule '${rule.id}'.`],
    outcome: rule.effect,
    reason: `Policy rule '${rule.id}' returned '${rule.effect}'.`,
    request,
  };
}

function matchesRule(request: ActionRequest, rule: PolicyRule): boolean {
  return (
    rule.agents.includes(request.agentId) &&
    rule.integrations.includes(request.integration) &&
    rule.actions.includes(request.action) &&
    (!rule.resources || rule.resources.includes(request.target))
  );
}

