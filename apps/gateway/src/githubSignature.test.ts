import { describe, expect, it } from "vitest";
import { verifyGitHubSignature } from "./githubSignature";

describe("verifyGitHubSignature", () => {
  it("validates GitHub's documented SHA-256 webhook signature", () => {
    expect(
      verifyGitHubSignature({
        body: "Hello, World!",
        signature:
          "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
        webhookSecret: "It's a Secret to Everybody",
      }),
    ).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(
      verifyGitHubSignature({
        body: "Hello, World!",
        signature: "sha256=invalid",
        webhookSecret: "It's a Secret to Everybody",
      }),
    ).toBe(false);
  });
});
