import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerRoutes } from "./routes";
import { MemoryStore } from "./stores/memoryStore";

export function createGatewayApp() {
  const server = Fastify({ logger: false });
  const store = new MemoryStore();

  void server.register(cors, {
    origin: true,
  });

  registerRoutes(server, store);

  return server;
}

