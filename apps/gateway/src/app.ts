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
  const approvalCallbackTokenTtlMs = readApprovalCallbackTokenTtlMs(options.env ?? process.env);

  server.removeContentTypeParser("application/json");
  server.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      const bodyText = Buffer.isBuffer(body) ? body.toString("utf8") : body;
      (request as { rawBody?: string }).rawBody = bodyText;

      try {
        done(null, bodyText ? JSON.parse(bodyText) : null);
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  void server.register(cors, {
    origin: true,
  });

  registerRoutes(
    server,
    store,
    adapters,
    options.slackSigningSecret ?? options.env?.SLACK_SIGNING_SECRET ?? "",
    options.env?.GITHUB_WEBHOOK_SECRET ?? process.env.GITHUB_WEBHOOK_SECRET ?? "",
    approvalCallbackTokenTtlMs,
  );

  return server;
}

function createGatewayStore(env: Record<string, string | undefined>): GatewayStore {
  const storePath = env.AGENTGATE_STORE_PATH?.trim();

  return storePath ? new JsonFileStore(storePath) : new MemoryStore();
}

function readApprovalCallbackTokenTtlMs(env: Record<string, string | undefined>): number {
  const rawValue = env.AGENTGATE_APPROVAL_TOKEN_TTL_SECONDS?.trim();

  if (!rawValue) {
    return 15 * 60 * 1000;
  }

  const seconds = Number(rawValue);

  return Number.isInteger(seconds) && seconds > 0 ? seconds * 1000 : 15 * 60 * 1000;
}
