import type { DashboardAuditEvent } from "./api";

interface AppProps {
  initialAuditEvents?: DashboardAuditEvent[];
}

export function App({ initialAuditEvents = [] }: AppProps) {
  const decisionCounts = countDecisions(initialAuditEvents);
  const sortedAuditEvents = sortAuditEventsNewestFirst(initialAuditEvents);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AgentGate</p>
          <h1>Approval gates for AI-generated code changes</h1>
          <p className="summary">
            Review pull request risk decisions, approval outcomes, changed-file evidence, and
            audit history from one read-only surface.
          </p>
        </div>
      </section>

      <section className="grid">
        {decisionCounts.map((item) => (
          <article className="metric" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Recent code-change decisions</h2>
          <p>Read-only audit evidence for pull request risk decisions.</p>
        </div>

        {initialAuditEvents.length === 0 ? (
          <p className="empty-state">Pull request risk decisions will appear here once the API is connected.</p>
        ) : (
          <div className="decision-list">
            {sortedAuditEvents.map((event) => (
              <article className="decision-row" key={event.id}>
                <div className="decision-main">
                  <div className="decision-labels">
                    <span className={`badge decision-${event.decision}`}>{event.decision}</span>
                    <span className={`badge risk-${event.riskLevel}`}>{event.riskLevel}</span>
                  </div>
                  <h3>{event.action}</h3>
                  <p>{event.repository}</p>
                  <dl className="audit-meta">
                    <div>
                      <dt>Audit ID</dt>
                      <dd>{event.id}</dd>
                    </div>
                    <div>
                      <dt>Recorded</dt>
                      <dd>
                        <time dateTime={event.timestamp}>{event.timestamp}</time>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="evidence-group">
                  <span>Changed files</span>
                  <ul className="file-list">
                    {event.changedFiles.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                </div>

                <div className="evidence-group">
                  <span>Risk reasons</span>
                  <ul className="reason-list">
                    {event.riskReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function sortAuditEventsNewestFirst(events: DashboardAuditEvent[]): DashboardAuditEvent[] {
  return [...events].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}

function countDecisions(events: DashboardAuditEvent[]) {
  return [
    { label: "Low risk allowed", value: countBy(events, "allow") },
    { label: "High risk approval", value: countBy(events, "approval_required") },
    { label: "Blocked changes", value: countBy(events, "block") },
    { label: "Expired approvals", value: countByAction(events, "slack.approval.expired") },
    { label: "Invalid tokens", value: countByAction(events, "slack.approval.invalid_token") },
    { label: "Replayed callbacks", value: countByAction(events, "slack.approval.replayed") },
  ];
}

function countBy(events: DashboardAuditEvent[], decision: DashboardAuditEvent["decision"]): number {
  return events.filter((event) => event.decision === decision).length;
}

function countByAction(events: DashboardAuditEvent[], action: string): number {
  return events.filter((event) => event.action === action).length;
}
