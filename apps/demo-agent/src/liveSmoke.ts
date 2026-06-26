import { AgentGateClient, type AgentGateActionRequest, type GitHubPullRequestInput } from "@agentgate/sdk";

type LiveSmokeEnv = Record<string, string | undefined>;

interface LiveSmokePullRequestConfig {
  base: string;
  body: string;
  head: string;
  headSha?: string;
  title: string;
}

export interface LiveSmokeConfig {
  agentId: string;
  baseUrl: string;
  changedFiles: string[];
  pullRequest: LiveSmokePullRequestConfig;
  repository: string;
}

export function readLiveSmokeConfig(env: LiveSmokeEnv): LiveSmokeConfig {
  if (env.AGENTGATE_ENABLE_LIVE_TESTS !== "true") {
    throw new Error("Live smoke tests are disabled.");
  }

  const missing = [
    ["AGENTGATE_LIVE_REPOSITORY", env.AGENTGATE_LIVE_REPOSITORY],
    ["AGENTGATE_LIVE_PR_BASE", env.AGENTGATE_LIVE_PR_BASE],
    ["AGENTGATE_LIVE_PR_HEAD", env.AGENTGATE_LIVE_PR_HEAD],
    ["AGENTGATE_LIVE_PR_TITLE", env.AGENTGATE_LIVE_PR_TITLE],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing live smoke env vars: ${missing.join(", ")}.`);
  }

  return {
    agentId: env.AGENTGATE_LIVE_AGENT_ID ?? "coding-agent",
    baseUrl: env.AGENTGATE_BASE_URL ?? "http://localhost:4010",
    changedFiles: splitChangedFiles(env.AGENTGATE_LIVE_CHANGED_FILES),
    pullRequest: {
      base: readRequiredEnv(env, "AGENTGATE_LIVE_PR_BASE"),
      body: env.AGENTGATE_LIVE_PR_BODY ?? "Created by AgentGate live smoke testing.",
      head: readRequiredEnv(env, "AGENTGATE_LIVE_PR_HEAD"),
      ...(env.AGENTGATE_LIVE_PR_HEAD_SHA ? { headSha: env.AGENTGATE_LIVE_PR_HEAD_SHA } : {}),
      title: readRequiredEnv(env, "AGENTGATE_LIVE_PR_TITLE"),
    },
    repository: readRequiredEnv(env, "AGENTGATE_LIVE_REPOSITORY"),
  };
}

export function buildLiveSmokeRequest(config: LiveSmokeConfig): AgentGateActionRequest {
  return {
    action: "pull_requests.create",
    agentId: config.agentId,
    changedFiles: config.changedFiles,
    github: buildPullRequestInput(config.pullRequest),
    integration: "github",
    repository: config.repository,
  };
}

async function run(): Promise<void> {
  const config = readLiveSmokeConfig(process.env);
  const client = new AgentGateClient({ baseUrl: config.baseUrl });
  const result = await client.execute(buildLiveSmokeRequest(config));
  const url = result.execution?.externalRequestId ?? result.execution?.data.url;

  console.log("AgentGate live smoke decision:", result.decision.outcome);
  console.log("AgentGate live smoke PR:", typeof url === "string" ? url : "created");
}

function buildPullRequestInput(config: LiveSmokePullRequestConfig): GitHubPullRequestInput {
  return {
    base: config.base,
    body: config.body,
    draft: true,
    head: config.head,
    ...(config.headSha ? { headSha: config.headSha } : {}),
    maintainerCanModify: false,
    title: config.title,
  };
}

function splitChangedFiles(value: string | undefined): string[] {
  if (!value) {
    return ["README.md"];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRequiredEnv(env: LiveSmokeEnv, name: string): string {
  const value = env[name];

  if (!value) {
    throw new Error(`Missing live smoke env var: ${name}.`);
  }

  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}
