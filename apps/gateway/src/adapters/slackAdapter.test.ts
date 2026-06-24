import type { ApprovalRecord } from "@agentgate/core";
import { describe, expect, it } from "vitest";
import { SlackApprovalAdapter } from "./slackAdapter";

const approval: ApprovalRecord = {
  action: "pull_requests.update",
  id: "approval_1",
  repository: "nodirumurkulov/AgentGate",
  requestedAt: "2026-06-24T00:00:00.000Z",
  riskLevel: "high",
  riskReasons: ["Authentication or authorization code changed."],
  status: "pending",
};

describe("SlackApprovalAdapter", () => {
  it("posts an approval request with approve and deny buttons", async () => {
    const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
    const adapter = new SlackApprovalAdapter({
      botToken: "xoxb-test-token",
      channelId: "C123",
      fetcher: async (url, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
          url: String(url),
        });

        return Response.json({
          channel: "C123",
          ok: true,
          ts: "1782000000.000100",
        });
      },
      publicUrl: "https://agentgate.example.test",
    });

    const result = await adapter.notifyApprovalRequired(approval);

    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (!request) {
      throw new Error("Expected one Slack request.");
    }

    expect(request.url).toBe("https://slack.com/api/chat.postMessage");
    expect(request.headers.get("authorization")).toBe("Bearer xoxb-test-token");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.body).toMatchObject({
      channel: "C123",
      text: "AgentGate approval required for pull_requests.update in nodirumurkulov/AgentGate.",
    });
    expect(JSON.stringify(request.body)).toContain("agentgate.approve");
    expect(JSON.stringify(request.body)).toContain("agentgate.deny");
    expect(JSON.stringify(request.body)).toContain("approval_1");
    expect(JSON.stringify(request.body)).toContain("Authentication or authorization code changed.");
    expect(JSON.stringify(request.body)).toContain("https://agentgate.example.test/v1/slack/interactions");
    expect(result).toEqual({
      data: {
        channel: "C123",
        messageTs: "1782000000.000100",
      },
      externalRequestId: "1782000000.000100",
      ok: true,
    });
  });
});
