import Fastify from "fastify";
import cors from "@fastify/cors";
import { evaluateAction, type ActionRequest, type PolicyDocument } from "@agentgate/core";

const policy: PolicyDocument = {
  defaultDecision: "block",
  rules: [
    {
      actions: ["issues.read"],
      agents: ["security-triage-agent"],
      effect: "allow",
      id: "allow-security-triage-issue-read",
      integrations: ["github"],
    },
  ],
  version: 1,
};

export function createGatewayServer() {
  const server = Fastify({ logger: true });

  void server.register(cors, {
    origin: true,
  });

  server.get("/health", async () => ({
    service: "agentgate-gateway",
    status: "ok",
  }));

  server.post<{ Body: ActionRequest }>("/v1/actions/authorize", async (request) =>
    evaluateAction(request.body, policy),
  );

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.AGENTGATE_PORT ?? "4010");
  const server = createGatewayServer();

  await server.listen({
    host: "0.0.0.0",
    port,
  });
}

