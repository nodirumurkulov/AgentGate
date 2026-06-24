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

  it("does not support pull request update or merge yet", async () => {
    const adapter = new GitHubPullRequestAdapter({
      fetcher: async () => Response.json({}),
      tokenProvider: async () => "installation-token",
    });

    await expect(
      adapter.execute({
        ...createPullRequestAction(),
        action: "pull_requests.merge",
      }),
    ).resolves.toEqual({
      data: {
        action: "pull_requests.merge",
        error: "unsupported_action",
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
