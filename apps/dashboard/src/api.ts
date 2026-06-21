export type DashboardDecision = "allow" | "block" | "approval_required";
export type DashboardRiskLevel = "low" | "medium" | "high";

export interface DashboardAuditEvent {
  action: string;
  changedFiles: string[];
  decision: DashboardDecision;
  id: string;
  repository: string;
  riskLevel: DashboardRiskLevel;
  riskReasons: string[];
  timestamp: string;
}
