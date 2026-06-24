import cors from "@fastify/cors";
import Fastify from "fastify";
import { createGatewayAdapters } from "./adapters/gatewayAdapters";
import type { GatewayAdapters } from "./adapters/types";
import { registerRoutes } from "./routes";
import { JsonFileStore } from "./stores/jsonFileStore";
import { MemoryStore } from "./stores/memoryStore";
import type { GatewayStore } from "./stores/types";

interface GatewayAppOptions {
  adapters?: GatewayAdapters;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  slackSigningSecret?: string;
  store?: GatewayStore;
}

export function createGatewayApp(options: GatewayAppOptions = {}) {
  const server = Fastify({ logger: false });
  const adapters =
    options.adapters ??
    createGatewayAdapters({
      ...(options.env ? { env: options.env } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    });
  const store = options.store ?? createGatewayStore(options.env ?? process.env);

  void server.register(cors, {
    origin: true,
  });

  registerRoutes(server, store, adapters, options.slackSigningSecret ?? options.env?.SLACK_SIGNING_SECRET ?? "");

  return server;
}

function createGatewayStore(env: Record<string, string | undefined>): GatewayStore {
  const storePath = env.AGENTGATE_STORE_PATH?.trim();

  return storePath ? new JsonFileStore(storePath) : new MemoryStore();
}
