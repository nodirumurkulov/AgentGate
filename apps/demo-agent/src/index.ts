import { AgentGateClient } from "@agentgate/sdk";

const client = new AgentGateClient({
  baseUrl: process.env.AGENTGATE_BASE_URL ?? "http://localhost:4010",
});

const decision = await client.authorize({
  action: "issues.read",
  agentId: "security-triage-agent",
  integration: "github",
  target: "nodirumurkulov/AgentGate#1",
});

console.log("AgentGate decision:", decision.outcome, decision.reason);

