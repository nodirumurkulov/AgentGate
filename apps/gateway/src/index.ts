import { createGatewayApp } from "./app";

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.AGENTGATE_PORT ?? "4010");
  const server = createGatewayApp();

  await server.listen({
    host: "0.0.0.0",
    port,
  });
}

