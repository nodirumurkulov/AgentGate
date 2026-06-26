import type { ActionRequest } from "@agentgate/core";
import type { IntegrationResult } from "@agentgate/integrations";
import type { AgentGateCommitStatus, GitHubAdapter } from "./types";

interface GitHubPullRequestAdapterOptions {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  requiredStatusContext?: string;
  tokenProvider: () => Promise<string>;
}

interface GitHubCreatePullRequestInput {
  base: string;
  body?: string;
  draft?: boolean;
  head: string;
  maintainerCanModify?: boolean;
  title: string;
}

interface GitHubCreatePullRequestResponse {
  html_url?: string;
  number?: number;
}

interface GitHubMergePullRequestInput {
  commitMessage?: string;
  commitTitle?: string;
  expectedHeadSha: string;
  mergeMethod?: "merge" | "squash" | "rebase";
  pullNumber: number;
}

interface GitHubMergePullRequestResponse {
  merged?: boolean;
  message?: string;
  sha?: string;
}

interface GitHubCommitStatus {
  context?: unknown;
  state?: unknown;
  target_url?: unknown;
  url?: unknown;
}

interface GitHubCombinedStatusResponse {
  statuses?: unknown;
}

interface GitHubUpdatePullRequestInput {
  base?: string;
  body?: string;
  maintainerCanModify?: boolean;
  pullNumber: number;
  state?: "open" | "closed";
  title?: string;
}

const githubApiVersion = "2022-11-28";
const defaultRequiredStatusContext = "agentgate/authorization";

export class GitHubPullRequestAdapter implements GitHubAdapter {
  integration = "github";

  private readonly apiBaseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly requiredStatusContext: string;
  private readonly tokenProvider: () => Promise<string>;

  constructor(options: GitHubPullRequestAdapterOptions) {
    this.apiBaseUrl = options.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.github.com";
    this.fetcher = options.fetcher ?? fetch;
    this.requiredStatusContext =
      options.requiredStatusContext?.trim() || defaultRequiredStatusContext;
    this.tokenProvider = options.tokenProvider;
  }

  async publishAgentGateStatus(status: AgentGateCommitStatus): Promise<IntegrationResult> {
    try {
      const repository = readRepositoryPath(status.repository);
      const headSha = readString(status.headSha);

      if (!repository || !headSha) {
        return {
          data: {
            error: "missing_github_commit_status_input",
            fields: [...(repository ? [] : ["repository"]), ...(headSha ? [] : ["headSha"])],
          },
          ok: false,
        };
      }

      const token = await this.tokenProvider();
      const response = await this.fetcher(
        `${this.apiBaseUrl}/repos/${repository}/statuses/${headSha}`,
        {
          body: JSON.stringify(toGitHubStatusBody(status, this.requiredStatusContext)),
          headers: createGitHubHeaders(token),
          method: "POST",
        },
      );
      const payload = (await response.json()) as GitHubCommitStatus;

      return toCommitStatusResult(response, payload, this.requiredStatusContext, status.state);
    } catch {
      return githubRequestFailure("github_commit_status_failed");
    }
  }

  async execute(request: ActionRequest): Promise<IntegrationResult> {
    try {
      if (request.action === "pull_requests.create") {
        return await this.createPullRequest(request);
      }

      if (request.action === "pull_requests.update") {
        return await this.updatePullRequest(request);
      }

      if (request.action === "pull_requests.merge") {
        return await this.mergePullRequest(request);
      }
    } catch {
      return githubRequestFailure(githubRequestErrorForAction(request.action));
    }

    return {
      data: {
        action: request.action,
        error: "unsupported_action",
      },
      ok: false,
    };
  }

  private async createPullRequest(request: ActionRequest): Promise<IntegrationResult> {
    const repository = readRepositoryPath(request.input?.repository);
    const pullRequestInput = readCreatePullRequestInput(request.input?.github);

    if (!repository) {
      return {
        data: {
          error: "missing_github_pull_request_input",
          fields: ["repository"],
        },
        ok: false,
      };
    }

    if (!pullRequestInput.ok) {
      return {
        data: {
          error: "missing_github_pull_request_input",
          fields: pullRequestInput.fields,
        },
        ok: false,
      };
    }

    const token = await this.tokenProvider();
    const response = await this.fetcher(`${this.apiBaseUrl}/repos/${repository}/pulls`, {
      body: JSON.stringify(toGitHubCreatePullRequestBody(pullRequestInput.value)),
      headers: createGitHubHeaders(token),
      method: "POST",
    });
    const payload = (await response.json()) as GitHubCreatePullRequestResponse;

    return toPullRequestResult(response, payload, "github_create_pull_request_failed");
  }

  private async updatePullRequest(request: ActionRequest): Promise<IntegrationResult> {
    const repository = readRepositoryPath(request.input?.repository);
    const pullRequestInput = readUpdatePullRequestInput(request.input?.github);

    if (!repository) {
      return {
        data: {
          error: "missing_github_pull_request_input",
          fields: ["repository"],
        },
        ok: false,
      };
    }

    if (!pullRequestInput.ok) {
      return {
        data: {
          error: "missing_github_pull_request_input",
          fields: pullRequestInput.fields,
        },
        ok: false,
      };
    }

    const token = await this.tokenProvider();
    const response = await this.fetcher(
      `${this.apiBaseUrl}/repos/${repository}/pulls/${pullRequestInput.value.pullNumber}`,
      {
        body: JSON.stringify(toGitHubUpdatePullRequestBody(pullRequestInput.value)),
        headers: createGitHubHeaders(token),
        method: "PATCH",
      },
    );
    const payload = (await response.json()) as GitHubCreatePullRequestResponse;

    return toPullRequestResult(response, payload, "github_update_pull_request_failed");
  }

  private async mergePullRequest(request: ActionRequest): Promise<IntegrationResult> {
    const repository = readRepositoryPath(request.input?.repository);
    const pullRequestInput = readMergePullRequestInput(request.input?.github);

    if (!repository) {
      return {
        data: {
          error: "missing_github_pull_request_input",
          fields: ["repository"],
        },
        ok: false,
      };
    }

    if (!pullRequestInput.ok) {
      return {
        data: {
          error: "missing_github_pull_request_input",
          fields: pullRequestInput.fields,
        },
        ok: false,
      };
    }

    const token = await this.tokenProvider();
    const statusCheckPassed = await this.agentGateStatusCheckPassed(
      repository,
      pullRequestInput.value.expectedHeadSha,
      token,
    );

    if (!statusCheckPassed) {
      return githubMergeStatusCheckFailure(this.requiredStatusContext);
    }

    const response = await this.fetcher(
      `${this.apiBaseUrl}/repos/${repository}/pulls/${pullRequestInput.value.pullNumber}/merge`,
      {
        body: JSON.stringify(toGitHubMergePullRequestBody(pullRequestInput.value)),
        headers: createGitHubHeaders(token),
        method: "PUT",
      },
    );
    const payload = (await response.json()) as GitHubMergePullRequestResponse;

    return toMergeResult(response, payload);
  }

  private async agentGateStatusCheckPassed(
    repository: string,
    expectedHeadSha: string,
    token: string,
  ): Promise<boolean> {
    const response = await this.fetcher(
      `${this.apiBaseUrl}/repos/${repository}/commits/${expectedHeadSha}/status`,
      {
        headers: createGitHubHeaders(token),
        method: "GET",
      },
    );

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as GitHubCombinedStatusResponse;

    return hasPassingStatusContext(payload, this.requiredStatusContext);
  }
}

function githubRequestFailure(error: string): IntegrationResult {
  return {
    data: {
      error,
    },
    ok: false,
  };
}

function githubRequestErrorForAction(action: string): string {
  if (action === "pull_requests.update") {
    return "github_update_pull_request_failed";
  }

  if (action === "pull_requests.merge") {
    return "github_merge_pull_request_failed";
  }

  return "github_create_pull_request_failed";
}

function toCommitStatusResult(
  response: Response,
  payload: GitHubCommitStatus,
  context: string,
  state: AgentGateCommitStatus["state"],
): IntegrationResult {
  if (!response.ok) {
    return githubRequestFailure("github_commit_status_failed");
  }

  return {
    data: {
      context: typeof payload.context === "string" ? payload.context : context,
      state: typeof payload.state === "string" ? payload.state : state,
      ...(typeof payload.target_url === "string" ? { targetUrl: payload.target_url } : {}),
    },
    ...(typeof payload.url === "string" ? { externalRequestId: payload.url } : {}),
    ok: true,
  };
}

function githubMergeStatusCheckFailure(context: string): IntegrationResult {
  return {
    data: {
      context,
      error: "github_merge_status_check_failed",
    },
    ok: false,
  };
}

function hasPassingStatusContext(
  payload: GitHubCombinedStatusResponse,
  context: string,
): boolean {
  if (!Array.isArray(payload.statuses)) {
    return false;
  }

  return payload.statuses.some((status) => statusContextPassed(status, context));
}

function statusContextPassed(status: unknown, context: string): boolean {
  if (!isRecord(status)) {
    return false;
  }

  const value = status as GitHubCommitStatus;

  return value.context === context && value.state === "success";
}

function toPullRequestResult(
  response: Response,
  payload: GitHubCreatePullRequestResponse,
  error: string,
): IntegrationResult {
  if (!response.ok || !payload.html_url) {
    return {
      data: {
        error,
      },
      ok: false,
    };
  }

  return {
    data: {
      number: payload.number,
      url: payload.html_url,
    },
    externalRequestId: payload.html_url,
    ok: true,
  };
}

function toMergeResult(
  response: Response,
  payload: GitHubMergePullRequestResponse,
): IntegrationResult {
  if (!response.ok || payload.merged !== true || !payload.sha) {
    return {
      data: {
        error: "github_merge_pull_request_failed",
      },
      ok: false,
    };
  }

  return {
    data: {
      merged: payload.merged,
      message: payload.message,
      sha: payload.sha,
    },
    externalRequestId: payload.sha,
    ok: true,
  };
}

function createGitHubHeaders(token: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": githubApiVersion,
  };
}

function toGitHubCreatePullRequestBody(input: GitHubCreatePullRequestInput) {
  return {
    base: input.base,
    ...(input.body ? { body: input.body } : {}),
    ...(typeof input.draft === "boolean" ? { draft: input.draft } : {}),
    head: input.head,
    ...(typeof input.maintainerCanModify === "boolean"
      ? { maintainer_can_modify: input.maintainerCanModify }
      : {}),
    title: input.title,
  };
}

function toGitHubMergePullRequestBody(input: GitHubMergePullRequestInput) {
  return {
    ...(input.commitMessage ? { commit_message: input.commitMessage } : {}),
    ...(input.commitTitle ? { commit_title: input.commitTitle } : {}),
    ...(input.mergeMethod ? { merge_method: input.mergeMethod } : {}),
    sha: input.expectedHeadSha,
  };
}

function toGitHubStatusBody(input: AgentGateCommitStatus, context: string) {
  return {
    context,
    description: input.description,
    state: input.state,
    ...(input.targetUrl ? { target_url: input.targetUrl } : {}),
  };
}

function toGitHubUpdatePullRequestBody(input: GitHubUpdatePullRequestInput) {
  return {
    ...(input.base ? { base: input.base } : {}),
    ...(input.body ? { body: input.body } : {}),
    ...(typeof input.maintainerCanModify === "boolean"
      ? { maintainer_can_modify: input.maintainerCanModify }
      : {}),
    ...(input.state ? { state: input.state } : {}),
    ...(input.title ? { title: input.title } : {}),
  };
}

function readMergePullRequestInput(value: unknown):
  | { ok: true; value: GitHubMergePullRequestInput }
  | { fields: string[]; ok: false } {
  if (!isRecord(value)) {
    return {
      fields: ["pullNumber", "expectedHeadSha"],
      ok: false,
    };
  }

  const pullNumber = readPositiveInteger(value.pullNumber);
  const expectedHeadSha = readString(value.expectedHeadSha);
  const commitMessage =
    typeof value.commitMessage === "string" ? value.commitMessage.trim() : undefined;
  const commitTitle = readString(value.commitTitle);
  const mergeMethod = readMergeMethod(value.mergeMethod);
  const fields = [
    ...(pullNumber ? [] : ["pullNumber"]),
    ...(expectedHeadSha ? [] : ["expectedHeadSha"]),
  ];

  if (!pullNumber || !expectedHeadSha) {
    return {
      fields,
      ok: false,
    };
  }

  if (value.mergeMethod !== undefined && !mergeMethod) {
    return {
      fields: ["mergeMethod"],
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      ...(commitMessage ? { commitMessage } : {}),
      ...(commitTitle ? { commitTitle } : {}),
      expectedHeadSha,
      ...(mergeMethod ? { mergeMethod } : {}),
      pullNumber,
    },
  };
}

function readCreatePullRequestInput(value: unknown):
  | { ok: true; value: GitHubCreatePullRequestInput }
  | { fields: string[]; ok: false } {
  if (!isRecord(value)) {
    return {
      fields: ["base", "head", "title"],
      ok: false,
    };
  }

  const base = readString(value.base);
  const head = readString(value.head);
  const title = readString(value.title);
  const fields = [
    ...(base ? [] : ["base"]),
    ...(head ? [] : ["head"]),
    ...(title ? [] : ["title"]),
  ];

  if (!base || !head || !title) {
    return {
      fields,
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      base,
      ...(typeof value.body === "string" && value.body.trim() ? { body: value.body.trim() } : {}),
      ...(typeof value.draft === "boolean" ? { draft: value.draft } : {}),
      head,
      ...(typeof value.maintainerCanModify === "boolean"
        ? { maintainerCanModify: value.maintainerCanModify }
        : {}),
      title,
    },
  };
}

function readUpdatePullRequestInput(value: unknown):
  | { ok: true; value: GitHubUpdatePullRequestInput }
  | { fields: string[]; ok: false } {
  if (!isRecord(value)) {
    return {
      fields: ["pullNumber"],
      ok: false,
    };
  }

  const pullNumber = readPositiveInteger(value.pullNumber);
  const base = readString(value.base);
  const body = typeof value.body === "string" ? value.body.trim() : undefined;
  const maintainerCanModify =
    typeof value.maintainerCanModify === "boolean" ? value.maintainerCanModify : undefined;
  const state = readPullRequestState(value.state);
  const title = readString(value.title);

  if (!pullNumber) {
    return {
      fields: ["pullNumber"],
      ok: false,
    };
  }

  if (value.state !== undefined && !state) {
    return {
      fields: ["state"],
      ok: false,
    };
  }

  if (!base && !body && typeof maintainerCanModify !== "boolean" && !state && !title) {
    return {
      fields: ["base", "body", "maintainerCanModify", "state", "title"],
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      ...(base ? { base } : {}),
      ...(body ? { body } : {}),
      ...(typeof maintainerCanModify === "boolean" ? { maintainerCanModify } : {}),
      pullNumber,
      ...(state ? { state } : {}),
      ...(title ? { title } : {}),
    },
  };
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function readPullRequestState(value: unknown): "open" | "closed" | undefined {
  return value === "open" || value === "closed" ? value : undefined;
}

function readMergeMethod(value: unknown): "merge" | "squash" | "rebase" | undefined {
  return value === "merge" || value === "squash" || value === "rebase" ? value : undefined;
}

function readRepositoryPath(value: unknown): string | undefined {
  const repository = readString(value);

  if (!repository) {
    return undefined;
  }

  const [owner, name, extra] = repository.split("/");

  if (extra !== undefined || !owner || !name) {
    return undefined;
  }

  if (!githubOwnerNameIsValid(owner) || !githubRepositoryNameIsValid(name)) {
    return undefined;
  }

  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function githubOwnerNameIsValid(value: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
}

function githubRepositoryNameIsValid(value: string): boolean {
  return value !== "." && value !== ".." && /^[A-Za-z0-9._-]+$/.test(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
