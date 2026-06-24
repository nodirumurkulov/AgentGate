import type { ActionRequest } from "@agentgate/core";
import type { IntegrationAdapter, IntegrationResult } from "@agentgate/integrations";

interface GitHubPullRequestAdapterOptions {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
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

interface GitHubUpdatePullRequestInput {
  base?: string;
  body?: string;
  maintainerCanModify?: boolean;
  pullNumber: number;
  state?: "open" | "closed";
  title?: string;
}

const githubApiVersion = "2022-11-28";

export class GitHubPullRequestAdapter implements IntegrationAdapter {
  integration = "github";

  private readonly apiBaseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly tokenProvider: () => Promise<string>;

  constructor(options: GitHubPullRequestAdapterOptions) {
    this.apiBaseUrl = options.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.github.com";
    this.fetcher = options.fetcher ?? fetch;
    this.tokenProvider = options.tokenProvider;
  }

  async execute(request: ActionRequest): Promise<IntegrationResult> {
    if (request.action === "pull_requests.create") {
      return this.createPullRequest(request);
    }

    if (request.action === "pull_requests.update") {
      return this.updatePullRequest(request);
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
    const repository = readString(request.input?.repository);
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
    const repository = readString(request.input?.repository);
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
