const decisionCounts = [
  { label: "Allowed", value: 12 },
  { label: "Approval required", value: 3 },
  { label: "Blocked", value: 5 },
];

export function App() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AgentGate</p>
          <h1>Runtime authorization for AI-agent actions</h1>
          <p className="summary">
            Review policy decisions, pending approvals, integration health, and audit evidence from
            one read-only surface.
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
        <div>
          <h2>Recent decision trail</h2>
          <p>Gateway audit events will appear here once the API is connected.</p>
        </div>
      </section>
    </main>
  );
}

