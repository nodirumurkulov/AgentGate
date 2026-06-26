import { generateKeyPairSync } from "node:crypto";
import type { ApprovalRecord } from "@agentgate/core";
import { describe, expect, it } from "vitest";
import { createGatewayAdapters } from "./gatewayAdapters";

const approval: ApprovalRecord = {
  action: "pull_requests.update",
  id: "approval_1",
  repository: "nodirumurkulov/AgentGate",
  requestedAt: "2026-06-24T00:00:00.000Z",
  riskLevel: "high",
  riskReasons: ["Authentication or authorization code changed."],
  status: "pending",
};
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs1" }).toString();

describe("createGatewayAdapters", () => {
  it("uses fixture adapters by default", async () => {
    const adapters = createGatewayAdapters({
      env: {},
      fetcher: async () => {
        throw new Error("Fixture mode should not call fetch.");
      },
    });

    await expect(adapters.slack.notifyApprovalRequired(approval)).resolves.toMatchObject({
      externalRequestId: "fixture_slack_approval_1",
      ok: true,
    });
  });

  it("uses the real Slack adapter in real mode", async () => {
    const requests: Array<{ headers: Headers; url: string }> = [];
    const adapters = createGatewayAdapters({
      env: {
        AGENTGATE_ADAPTER_MODE: "real",
        AGENTGATE_PUBLIC_URL: "https://agentgate.example.test",
        GITHUB_APP_ID: "12345",
        GITHUB_INSTALLATION_ID: "999",
        GITHUB_APP_PRIVATE_KEY_PATH: ".secrets/agentgate-test.pem",
        SLACK_APPROVAL_CHANNEL_ID: "C123",
        SLACK_BOT_TOKEN: "xoxb-test-token",
      },
      fetcher: async (url, init) => {
        requests.push({
          headers: new Headers(init?.headers),
          url: String(url),
        });

        return Response.json({
          ok: true,
          ts: "1782000000.000100",
        });
      },
      readTextFile: () => privateKeyPem,
    });

    await adapters.slack.notifyApprovalRequired(approval);

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (!request) {
      throw new Error("Expected one Slack request.");
    }

    expect(request.url).toBe("https://slack.com/api/chat.postMessage");
    expect(request.headers.get("authorization")).toBe("Bearer xoxb-test-token");
  });

  it("rejects real mode without Slack credentials", () => {
    expect(() =>
      createGatewayAdapters({
        env: {
          AGENTGATE_ADAPTER_MODE: "real",
        },
      }),
    ).toThrow("Real adapter mode requires SLACK_BOT_TOKEN, SLACK_APPROVAL_CHANNEL_ID, and AGENTGATE_PUBLIC_URL.");
  });

  it("uses the real GitHub adapter in real mode", async () => {
    const requests: Array<{ body?: unknown; headers: Headers; url: string }> = [];
    const adapters = createGatewayAdapters({
      env: {
        AGENTGATE_ADAPTER_MODE: "real",
        AGENTGATE_PUBLIC_URL: "https://agentgate.example.test",
        GITHUB_API_BASE_URL: "https://api.github.test",
        GITHUB_APP_ID: "12345",
        GITHUB_INSTALLATION_ID: "999",
        GITHUB_APP_PRIVATE_KEY_PATH: ".secrets/agentgate-test.pem",
        SLACK_APPROVAL_CHANNEL_ID: "C123",
        SLACK_BOT_TOKEN: "xoxb-test-token",
      },
      fetcher: async (url, init) => {
        requests.push({
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
          headers: new Headers(init?.headers),
          url: String(url),
        });

        if (String(url).endsWith("/access_tokens")) {
          return Response.json({
            token: "installation-token",
          });
        }

        return Response.json({
          html_url: "https://github.com/nodirumurkulov/agentgate-sandbox/pull/7",
          number: 7,
        });
      },
      readTextFile: () => privateKeyPem,
    });

    await adapters.github.execute({
      action: "pull_requests.create",
      agentId: "coding-agent",
      input: {
        github: {
          base: "main",
          head: "agentgate-smoke",
          title: "AgentGate smoke test",
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
      integration: "github",
      target: "risk:low",
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.github.test/app/installations/999/access_tokens",
      "https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/pulls",
    ]);
    expect(requests[1]?.headers.get("authorization")).toBe("Bearer installation-token");
    expect(requests[1]?.body).toMatchObject({
      base: "main",
      head: "agentgate-smoke",
      title: "AgentGate smoke test",
    });
  });

  it("passes the configured GitHub status context to the real adapter", async () => {
    const requests: string[] = [];
    const adapters = createGatewayAdapters({
      env: {
        AGENTGATE_ADAPTER_MODE: "real",
        AGENTGATE_GITHUB_STATUS_CONTEXT: "agentgate/custom",
        AGENTGATE_PUBLIC_URL: "https://agentgate.example.test",
        GITHUB_API_BASE_URL: "https://api.github.test",
        GITHUB_APP_ID: "12345",
        GITHUB_INSTALLATION_ID: "999",
        GITHUB_APP_PRIVATE_KEY_PATH: ".secrets/agentgate-test.pem",
        SLACK_APPROVAL_CHANNEL_ID: "C123",
        SLACK_BOT_TOKEN: "xoxb-test-token",
      },
      fetcher: async (url) => {
        const requestUrl = String(url);
        requests.push(requestUrl);

        if (requestUrl.endsWith("/access_tokens")) {
          return Response.json({
            token: "installation-token",
          });
        }

        if (requestUrl.endsWith("/commits/abc123/status")) {
          return Response.json({
            statuses: [
              {
                context: "agentgate/custom",
                state: "success",
              },
            ],
          });
        }

        return Response.json({
          merged: true,
          message: "Pull Request successfully merged",
          sha: "merge-sha",
        });
      },
      readTextFile: () => privateKeyPem,
    });

    const result = await adapters.github.execute({
      action: "pull_requests.merge",
      agentId: "coding-agent",
      input: {
        github: {
          expectedHeadSha: "abc123",
          pullNumber: 7,
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
      integration: "github",
      target: "risk:high",
    });

    expect(result.ok).toBe(true);
    expect(requests).toEqual([
      "https://api.github.test/app/installations/999/access_tokens",
      "https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/commits/abc123/status",
      "https://api.github.test/repos/nodirumurkulov/agentgate-sandbox/pulls/7/merge",
    ]);
  });
});
