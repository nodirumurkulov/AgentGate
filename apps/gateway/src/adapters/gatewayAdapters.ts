import { createFixtureAdapters } from "./fixtureAdapters";
import { SlackApprovalAdapter } from "./slackAdapter";
import type { GatewayAdapters } from "./types";

interface CreateGatewayAdaptersOptions {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
}

export function createGatewayAdapters(options: CreateGatewayAdaptersOptions = {}): GatewayAdapters {
  const env = options.env ?? process.env;
  const mode = env.AGENTGATE_ADAPTER_MODE ?? "fixture";

  if (mode === "fixture") {
    return createFixtureAdapters();
  }

  if (mode !== "real") {
    throw new Error("AGENTGATE_ADAPTER_MODE must be 'fixture' or 'real'.");
  }

  const fixtureAdapters = createFixtureAdapters();

  return {
    github: fixtureAdapters.github,
    slack: new SlackApprovalAdapter({
      botToken: readRequiredEnv(env, "SLACK_BOT_TOKEN"),
      channelId: readRequiredEnv(env, "SLACK_APPROVAL_CHANNEL_ID"),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      publicUrl: readRequiredEnv(env, "AGENTGATE_PUBLIC_URL"),
    }),
  };
}

function readRequiredEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error("Real adapter mode requires SLACK_BOT_TOKEN, SLACK_APPROVAL_CHANNEL_ID, and AGENTGATE_PUBLIC_URL.");
  }

  return value;
}
