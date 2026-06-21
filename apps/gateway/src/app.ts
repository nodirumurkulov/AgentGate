import cors from "@fastify/cors";
import Fastify from "fastify";
import { createFixtureAdapters } from "./adapters/fixtureAdapters";
import { registerRoutes } from "./routes";
import { MemoryStore } from "./stores/memoryStore";

export function createGatewayApp() {
  const server = Fastify({ logger: false });
  const adapters = createFixtureAdapters();
  const store = new MemoryStore();

  void server.register(cors, {
    origin: true,
  });

  registerRoutes(server, store, adapters);

  return server;
}
