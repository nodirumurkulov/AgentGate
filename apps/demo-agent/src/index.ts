import { AgentGateClient } from "@agentgate/sdk";

const client = new AgentGateClient({
  baseUrl: process.env.AGENTGATE_BASE_URL ?? "http://localhost:4010",
});

const decision = await client.authorize({
  action: "pull_requests.create",
  agentId: "coding-agent",
  integration: "github",
  target: "risk:low",
});

console.log("AgentGate decision:", decision.outcome, decision.reason);
