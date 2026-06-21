import Fastify from "fastify";

export function createInternalApiServer() {
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({
    service: "agentgate-internal-api",
    status: "ok",
  }));

  server.post("/v1/incidents/:incidentId/escalate", async (request) => ({
    incidentId: (request.params as { incidentId: string }).incidentId,
    status: "escalated",
  }));

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createInternalApiServer();

  await server.listen({
    host: "0.0.0.0",
    port: 4020,
  });
}

