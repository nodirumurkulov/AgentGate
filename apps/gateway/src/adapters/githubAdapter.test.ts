import type { ActionRequest } from "@agentgate/core";
import { describe, expect, it } from "vitest";
import { GitHubPullRequestAdapter } from "./githubAdapter";

describe("GitHubPullRequestAdapter", () => {
  it("creates a pull request with a GitHub App installation token", async () => {
    const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = [];
    const adapter = new GitHubPullRequestAdapter({
      apiBaseUrl: "https://api.github.test",
      fetcher: async (url, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url: String(url),
        });

        return Response.json({
          html_url: "https://github.com/nodirumurkulov/agentgate-sandbox/pull/7",
          number: 7,
        });
      },
      tokenProvider: async () => "installation-token",
    });

    const result = await adapter.execute(createPullRequestAction());

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (!request) {
      throw new Error("Expected one GitHub create PR request.");
    }

    expect(request.url).toBe("https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/pulls");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer installation-token");
    expect(request.headers.get("accept")).toBe("application/vnd.github+json");
    expect(request.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(request.body).toEqual({
      base: "main",
      body: "Created by AgentGate live smoke testing.",
      draft: true,
      head: "agentgate-smoke",
      maintainer_can_modify: false,
      title: "AgentGate smoke test",
    });
    expect(result).toEqual({
      data: {
        number: 7,
        url: "https://github.com/nodirumurkulov/agentgate-sandbox/pull/7",
      },
      externalRequestId: "https://github.com/nodirumurkulov/agentgate-sandbox/pull/7",
      ok: true,
    });
  });

  it("refuses create PR execution without required GitHub fields", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => "installation-token",
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        input: {
          github: {
            base: "main",
            head: "agentgate-smoke",
          },
          repository: "nodirumurkulov/agentgate-sandbox",
        },
      }),
    ).resolves.toEqual({
      data: {
        error: "missing_github_pull_request_input",
        fields: ["title"],
      },
      ok: false,
    });
  });

  it("updates a pull request with an installation token", async () => {
    const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = [];
    const adapter = new GitHubPullRequestAdapter({
      apiBaseUrl: "https://api.github.test",
      fetcher: async (url, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url: String(url),
        });

        return Response.json({
          html_url: "https://github.com/nodirumurkulov/agentgate-sandbox/pull/7",
          number: 7,
        });
      },
      tokenProvider: async () => "installation-token",
    });

    const result = await adapter.execute({
      ...createPullRequestAction(),
      action: "pull_requests.update",
      input: {
        github: {
          base: "release",
          body: "Updated by AgentGate.",
          maintainerCanModify: false,
          pullNumber: 7,
          state: "open",
          title: "Updated smoke PR",
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (!request) {
      throw new Error("Expected one GitHub update PR request.");
    }

    expect(request.url).toBe("https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/pulls/7");
    expect(request.method).toBe("PATCH");
    expect(request.headers.get("authorization")).toBe("Bearer installation-token");
    expect(request.body).toEqual({
      base: "release",
      body: "Updated by AgentGate.",
      maintainer_can_modify: false,
      state: "open",
      title: "Updated smoke PR",
    });
    expect(result).toEqual({
      data: {
        number: 7,
        url: "https://github.com/nodirumurkulov/agentgate-sandbox/pull/7",
      },
      externalRequestId: "https://github.com/nodirumurkulov/agentgate-sandbox/pull/7",
      ok: true,
    });
  });

  it("refuses update PR execution without a pull number", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => "installation-token",
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        action: "pull_requests.update",
        input: {
          github: {
            title: "Updated smoke PR",
          },
          repository: "nodirumurkulov/agentgate-sandbox",
        },
      }),
    ).resolves.toEqual({
      data: {
        error: "missing_github_pull_request_input",
        fields: ["pullNumber"],
      },
      ok: false,
    });
  });

  it("refuses update PR execution without any update fields", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => "installation-token",
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        action: "pull_requests.update",
        input: {
          github: {
            pullNumber: 7,
          },
          repository: "nodirumurkulov/agentgate-sandbox",
        },
      }),
    ).resolves.toEqual({
      data: {
        error: "missing_github_pull_request_input",
        fields: ["base", "body", "maintainerCanModify", "state", "title"],
      },
      ok: false,
    });
  });

  it("refuses update PR execution with an unsupported state", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => "installation-token",
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        action: "pull_requests.update",
        input: {
          github: {
            pullNumber: 7,
            state: "merged",
          },
          repository: "nodirumurkulov/agentgate-sandbox",
        },
      }),
    ).resolves.toEqual({
      data: {
        error: "missing_github_pull_request_input",
        fields: ["state"],
      },
      ok: false,
    });
  });

  it("merges a pull request with an expected head SHA", async () => {
    const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = [];
    const adapter = new GitHubPullRequestAdapter({
      apiBaseUrl: "https://api.github.test",
      fetcher: async (url, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url: String(url),
        });

        return Response.json({
          merged: true,
          message: "Pull Request successfully merged",
          sha: "abc123",
        });
      },
      tokenProvider: async () => "installation-token",
    });

    const result = await adapter.execute({
      ...createPullRequestAction(),
      action: "pull_requests.merge",
      input: {
        github: {
          commitMessage: "Reviewed by AgentGate.",
          commitTitle: "Merge smoke PR",
          expectedHeadSha: "abc123",
          mergeMethod: "squash",
          pullNumber: 7,
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (!request) {
      throw new Error("Expected one GitHub merge PR request.");
    }

    expect(request.url).toBe("https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/pulls/7/merge");
    expect(request.method).toBe("PUT");
    expect(request.headers.get("authorization")).toBe("Bearer installation-token");
    expect(request.body).toEqual({
      commit_message: "Reviewed by AgentGate.",
      commit_title: "Merge smoke PR",
      merge_method: "squash",
      sha: "abc123",
    });
    expect(result).toEqual({
      data: {
        merged: true,
        message: "Pull Request successfully merged",
        sha: "abc123",
      },
      externalRequestId: "abc123",
      ok: true,
    });
  });

  it("refuses merge execution without an expected head SHA", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => "installation-token",
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        action: "pull_requests.merge",
        input: {
          github: {
            pullNumber: 7,
          },
          repository: "nodirumurkulov/agentgate-sandbox",
        },
      }),
    ).resolves.toEqual({
      data: {
        error: "missing_github_pull_request_input",
        fields: ["expectedHeadSha"],
      },
      ok: false,
    });
  });

  it("refuses merge execution with an unsupported merge method", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => "installation-token",
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        action: "pull_requests.merge",
        input: {
          github: {
            expectedHeadSha: "abc123",
            mergeMethod: "fast-forward",
            pullNumber: 7,
          },
          repository: "nodirumurkulov/agentgate-sandbox",
        },
      }),
    ).resolves.toEqual({
      data: {
        error: "missing_github_pull_request_input",
        fields: ["mergeMethod"],
      },
      ok: false,
    });
  });
});

function createPullRequestAction(): ActionRequest {
  return {
    action: "pull_requests.create",
    agentId: "coding-agent",
    input: {
      github: {
        base: "main",
        body: "Created by AgentGate live smoke testing.",
        draft: true,
        head: "agentgate-smoke",
        maintainerCanModify: false,
        title: "AgentGate smoke test",
      },
      repository: "nodirumurkulov/agentgate-sandbox",
    },
    integration: "github",
    target: "risk:low",
  };
}
