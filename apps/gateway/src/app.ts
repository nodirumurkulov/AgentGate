import cors from "@fastify/cors";
import Fastify from "fastify";
import { createFixtureAdapters } from "./adapters/fixtureAdapters";
import { registerRoutes } from "./routes";
import { MemoryStore } from "./stores/memoryStore";

interface GatewayAppOptions {
  slackSigningSecret?: string;
}

export function createGatewayApp(options: GatewayAppOptions = {}) {
  const server = Fastify({ logger: false });
  const adapters = createFixtureAdapters();
  const store = new MemoryStore();

  void server.register(cors, {
    origin: true,
  });

  registerRoutes(server, store, adapters, options.slackSigningSecret ?? "");

  return server;
}
