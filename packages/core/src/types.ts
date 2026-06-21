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

