export type DecisionOutcome = "allow" | "block" | "approval_required";

export type SourceTrust = "trusted" | "untrusted";

export interface ActionRequest {
  action: string;
  agentId: string;
  input?: Record<string, unknown>;
  integration: string;
  sourceTrust?: SourceTrust;
  target: string;
}

export interface PolicyRule {
  actions: string[];
  agents: string[];
  effect: DecisionOutcome;
  id: string;
  integrations: string[];
  resources?: string[];
}

export interface PolicyDocument {
  defaultDecision: "block";
  rules: PolicyRule[];
  version: 1;
}

export interface Decision {
  evidence: string[];
  outcome: DecisionOutcome;
  reason: string;
  request: ActionRequest;
}

export type InjectionCategory =
  | "credential_exfiltration"
  | "policy_bypass"
  | "tool_redirection"
  | "unsafe_autonomy";

export interface InjectionFinding {
  category: InjectionCategory;
  evidence: string;
  severity: "medium" | "high";
}

const injectionPatterns: Array<{
  category: InjectionCategory;
  pattern: RegExp;
  severity: "medium" | "high";
}> = [
  {
    category: "policy_bypass",
    pattern: /\b(ignore|override|disregard)\b.{0,40}\b(instructions|policy|rules)\b/i,
    severity: "high",
  },
  {
    category: "tool_redirection",
    pattern: /\b(use|call|invoke)\b.{0,40}\b(tool|api|function)\b/i,
    severity: "medium",
  },
  {
    category: "credential_exfiltration",
    pattern: /\b(secret|token|password|private key|credential)s?\b/i,
    severity: "high",
  },
  {
    category: "unsafe_autonomy",
    pattern: /\b(without asking|do not ask|no approval|silently)\b/i,
    severity: "high",
  },
];

export function detectPromptInjection(text: string): InjectionFinding[] {
  return injectionPatterns.flatMap((rule) => {
    const match = rule.pattern.exec(text);

    if (!match) {
      return [];
    }

    return [
      {
        category: rule.category,
        evidence: match[0],
        severity: rule.severity,
      },
    ];
  });
}

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

