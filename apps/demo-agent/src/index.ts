import { AgentGateClient } from "@agentgate/sdk";
import { buildCodeChangeScenarios } from "./scenario";

const client = new AgentGateClient({
  baseUrl: process.env.AGENTGATE_BASE_URL ?? "http://localhost:4010",
});

for (const scenario of buildCodeChangeScenarios()) {
  try {
    const result = await client.execute(scenario);

    console.log("AgentGate scenario:", scenario.action, result.decision.outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AgentGate error.";

    console.log("AgentGate scenario:", scenario.action, message);
  }
}
