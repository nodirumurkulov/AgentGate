import cors from "@fastify/cors";
import Fastify from "fastify";
import { createGatewayAdapters } from "./adapters/gatewayAdapters";
import type { GatewayAdapters } from "./adapters/types";
import { registerRoutes } from "./routes";
import { MemoryStore } from "./stores/memoryStore";

interface GatewayAppOptions {
  adapters?: GatewayAdapters;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  slackSigningSecret?: string;
}

export function createGatewayApp(options: GatewayAppOptions = {}) {
  const server = Fastify({ logger: false });
  const adapters =
    options.adapters ??
    createGatewayAdapters({
      ...(options.env ? { env: options.env } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    });
  const store = new MemoryStore();

  void server.register(cors, {
    origin: true,
  });

  registerRoutes(server, store, adapters, options.slackSigningSecret ?? options.env?.SLACK_SIGNING_SECRET ?? "");

  return server;
}
