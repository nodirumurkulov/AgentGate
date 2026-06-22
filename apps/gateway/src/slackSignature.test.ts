import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySlackSignature } from "./slackSignature";

describe("verifySlackSignature", () => {
  it("returns true for a valid Slack HMAC signature", () => {
    const body = JSON.stringify({ action: "approve", approvalId: "approval_1" });
    const signingSecret = "slack_signing_secret";
    const timestamp = "1782000000";
    const signature = createSignature(signingSecret, timestamp, body);

    expect(
      verifySlackSignature({
        body,
        nowSeconds: 1782000000,
        signature,
        signingSecret,
        timestamp,
      }),
    ).toBe(true);
  });

  it("returns false for an invalid Slack HMAC signature", () => {
    expect(
      verifySlackSignature({
        body: JSON.stringify({ action: "approve", approvalId: "approval_1" }),
        nowSeconds: 1782000000,
        signature: "v0=invalid",
        signingSecret: "slack_signing_secret",
        timestamp: "1782000000",
      }),
    ).toBe(false);
  });

  it("returns false for a stale Slack timestamp", () => {
    const body = JSON.stringify({ action: "approve", approvalId: "approval_1" });
    const signingSecret = "slack_signing_secret";
    const timestamp = "1782000000";
    const signature = createSignature(signingSecret, timestamp, body);

    expect(
      verifySlackSignature({
        body,
        nowSeconds: 1782000301,
        signature,
        signingSecret,
        timestamp,
      }),
    ).toBe(false);
  });
});

function createSignature(signingSecret: string, timestamp: string, body: string): string {
  return `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
}
