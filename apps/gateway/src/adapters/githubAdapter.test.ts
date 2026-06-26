import type { ActionRequest } from "@agentgate/core";
import { describe, expect, it } from "vitest";
import { GitHubPullRequestAdapter } from "./githubAdapter";

describe("GitHubPullRequestAdapter", () => {
  it("publishes a successful AgentGate commit status", async () => {
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
          context: "agentgate/authorization",
          state: "success",
          target_url: "https://agentgate.example.test/audit/audit_1",
          url: "https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/statuses/abc123",
        });
      },
      tokenProvider: async () => "installation-token",
    });

    const result = await adapter.publishAgentGateStatus({
      description: "AgentGate authorized this repository change.",
      headSha: "abc123",
      repository: "nodirumurkulov/agentgate-sandbox",
      state: "success",
      targetUrl: "https://agentgate.example.test/audit/audit_1",
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (!request) {
      throw new Error("Expected one GitHub status request.");
    }

    expect(request.url).toBe("https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/statuses/abc123");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer installation-token");
    expect(request.body).toEqual({
      context: "agentgate/authorization",
      description: "AgentGate authorized this repository change.",
      state: "success",
      target_url: "https://agentgate.example.test/audit/audit_1",
    });
    expect(result).toEqual({
      data: {
        context: "agentgate/authorization",
        state: "success",
        targetUrl: "https://agentgate.example.test/audit/audit_1",
      },
      externalRequestId: "https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/statuses/abc123",
      ok: true,
    });
  });

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

  it("refuses create PR execution with a malformed repository name", async () => {
    let tokenRequests = 0;
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => {
        throw new Error("GitHub should not be called for malformed repositories.");
      },
      tokenProvider: async () => {
        tokenRequests += 1;

        return "installation-token";
      },
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        input: {
          github: {
            base: "main",
            head: "agentgate-smoke",
            title: "AgentGate smoke test",
          },
          repository: "nodirumurkulov/agentgate-sandbox/pulls/7",
        },
      }),
    ).resolves.toEqual({
      data: {
        error: "missing_github_pull_request_input",
        fields: ["repository"],
      },
      ok: false,
    });
    expect(tokenRequests).toBe(0);
  });

  it("returns a sanitized integration failure when GitHub auth fails", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => {
        throw new Error("installation-token-should-not-leak");
      },
    });

    const result = await adapter.execute(createPullRequestAction());

    expect(result).toEqual({
      data: {
        error: "github_create_pull_request_failed",
      },
      ok: false,
    });
    expect(JSON.stringify(result)).not.toContain("installation-token-should-not-leak");
  });

  it("returns a sanitized integration failure when GitHub cannot be reached", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => {
        throw new Error("github-network-secret-should-not-leak");
      },
      tokenProvider: async () => "installation-token",
    });

    const result = await adapter.execute(createPullRequestAction());

    expect(result).toEqual({
      data: {
        error: "github_create_pull_request_failed",
      },
      ok: false,
    });
    expect(JSON.stringify(result)).not.toContain("github-network-secret-should-not-leak");
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
        const requestUrl = String(url);
        requests.push({
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url: requestUrl,
        });

        if (requestUrl.endsWith("/commits/abc123/status")) {
          return Response.json({
            statuses: [
              {
                context: "agentgate/authorization",
                state: "success",
              },
            ],
          });
        }

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

    expect(requests).toHaveLength(2);
    const statusRequest = requests[0];
    const mergeRequest = requests[1];

    if (!statusRequest || !mergeRequest) {
      throw new Error("Expected one GitHub status request and one merge request.");
    }

    expect(statusRequest.url).toBe(
      "https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/commits/abc123/status",
    );
    expect(statusRequest.method).toBe("GET");
    expect(statusRequest.headers.get("authorization")).toBe("Bearer installation-token");
    expect(mergeRequest.url).toBe("https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/pulls/7/merge");
    expect(mergeRequest.method).toBe("PUT");
    expect(mergeRequest.headers.get("authorization")).toBe("Bearer installation-token");
    expect(mergeRequest.body).toEqual({
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

  it("refuses merge execution without a passing AgentGate status check", async () => {
    const requests: string[] = [];
    const adapter = new GitHubPullRequestAdapter({
      apiBaseUrl: "https://api.github.test",
      fetcher: async (url) => {
        requests.push(String(url));

        return Response.json({
          statuses: [
            {
              context: "agentgate/authorization",
              state: "failure",
            },
          ],
        });
      },
      tokenProvider: async () => "installation-token",
    });

    const result = await adapter.execute({
      ...createPullRequestAction(),
      action: "pull_requests.merge",
      input: {
        github: {
          expectedHeadSha: "abc123",
          pullNumber: 7,
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
    });

    expect(requests).toEqual([
      "https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/commits/abc123/status",
    ]);
    expect(result).toEqual({
      data: {
        context: "agentgate/authorization",
        error: "github_merge_status_check_failed",
      },
      ok: false,
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
