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
    if (request.action !== "pull_requests.create") {
      return {
        data: {
          action: request.action,
          error: "unsupported_action",
        },
        ok: false,
      };
    }

    const repository = readString(request.input?.repository);
    const pullRequestInput = readPullRequestInput(request.input?.github);

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
      body: JSON.stringify(toGitHubPullRequestBody(pullRequestInput.value)),
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": githubApiVersion,
      },
      method: "POST",
    });
    const payload = (await response.json()) as GitHubCreatePullRequestResponse;

    if (!response.ok || !payload.html_url) {
      return {
        data: {
          error: "github_create_pull_request_failed",
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
}

function toGitHubPullRequestBody(input: GitHubCreatePullRequestInput) {
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

function readPullRequestInput(value: unknown):
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
