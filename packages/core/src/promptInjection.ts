import type { InjectionCategory, InjectionFinding } from "./types";

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

