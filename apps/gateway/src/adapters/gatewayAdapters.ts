import { readFileSync } from "node:fs";
import { createFixtureAdapters } from "./fixtureAdapters";
import { GitHubPullRequestAdapter } from "./githubAdapter";
import { getGitHubInstallationAccessToken } from "./githubAuth";
import { SlackApprovalAdapter } from "./slackAdapter";
import type { GatewayAdapters } from "./types";

interface CreateGatewayAdaptersOptions {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  readTextFile?: (path: string) => string;
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

  const botToken = readRequiredSlackEnv(env, "SLACK_BOT_TOKEN");
  const channelId = readRequiredSlackEnv(env, "SLACK_APPROVAL_CHANNEL_ID");
  const publicUrl = readRequiredSlackEnv(env, "AGENTGATE_PUBLIC_URL");
  const appId = readRequiredGitHubEnv(env, "GITHUB_APP_ID");
  const installationId = readRequiredGitHubEnv(env, "GITHUB_INSTALLATION_ID");
  const privateKeyPath = readRequiredGitHubEnv(env, "GITHUB_APP_PRIVATE_KEY_PATH");
  const readTextFile = options.readTextFile ?? ((path: string) => readFileSync(path, "utf8"));
  const privateKeyPem = readTextFile(privateKeyPath);
  const apiBaseUrl = env.GITHUB_API_BASE_URL?.trim();
  const requiredStatusContext = env.AGENTGATE_GITHUB_STATUS_CONTEXT?.trim();

  return {
    github: new GitHubPullRequestAdapter({
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      ...(requiredStatusContext ? { requiredStatusContext } : {}),
      tokenProvider: () =>
        getGitHubInstallationAccessToken({
          ...(apiBaseUrl ? { apiBaseUrl } : {}),
          appId,
          ...(options.fetcher ? { fetcher: options.fetcher } : {}),
          installationId,
          privateKeyPem,
        }),
    }),
    slack: new SlackApprovalAdapter({
      botToken,
      channelId,
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      publicUrl,
    }),
  };
}

function readRequiredSlackEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error("Real adapter mode requires SLACK_BOT_TOKEN, SLACK_APPROVAL_CHANNEL_ID, and AGENTGATE_PUBLIC_URL.");
  }

  return value;
}

function readRequiredGitHubEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error("Real adapter mode requires GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH, and GITHUB_INSTALLATION_ID.");
  }

  return value;
}
