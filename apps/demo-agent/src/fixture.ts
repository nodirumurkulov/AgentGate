import { runFixtureDemo } from "./fixtureDemo";

try {
  const result = await runFixtureDemo();
  console.log("AgentGate fixture demo (no live GitHub or Slack calls)");
  for (const scenario of result.scenarios) {
    console.log(
      `${scenario.name} | HTTP ${scenario.statusCode} | ${scenario.outcome} | execution=${scenario.execution} | approval=${scenario.approval}`,
    );
  }
  console.log(`Audit decisions: ${result.auditDecisions.join(" -> ")}`);
  console.log(`PASS: ${result.scenarios.length} scenarios; audit chain verified.`);
} catch (error) {
  console.error(
    "FAIL:",
    error instanceof Error ? error.message : "Unexpected fixture demo failure.",
  );
  process.exitCode = 1;
}
