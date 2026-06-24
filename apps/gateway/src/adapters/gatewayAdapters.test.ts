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
});
