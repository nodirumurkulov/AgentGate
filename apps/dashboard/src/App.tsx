const decisionCounts = [
  { label: "Low risk allowed", value: 12 },
  { label: "High risk approval", value: 3 },
  { label: "Blocked changes", value: 5 },
];

export function App() {
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
        <div>
          <h2>Recent code-change decisions</h2>
          <p>Pull request risk decisions will appear here once the API is connected.</p>
        </div>
      </section>
    </main>
  );
}
