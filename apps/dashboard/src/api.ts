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

interface FetchAuditEventsOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

interface AuditEventsResponse {
  events?: DashboardAuditEvent[];
}

export async function fetchAuditEvents(
  options: FetchAuditEventsOptions = {},
): Promise<DashboardAuditEvent[]> {
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${baseUrl}/v1/audit`);

  if (!response.ok) {
    throw new Error(`Failed to load audit events with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as AuditEventsResponse;

  return Array.isArray(payload.events) ? payload.events : [];
}
