import { describe, expect, it } from "vitest";
import { buildLiveSmokeRequest, readLiveSmokeConfig } from "./liveSmoke";

describe("readLiveSmokeConfig", () => {
  it("refuses to run unless live tests are explicitly enabled", () => {
    expect(() => readLiveSmokeConfig({})).toThrow("Live smoke tests are disabled.");
  });

  it("requires sandbox pull request inputs", () => {
    expect(() =>
      readLiveSmokeConfig({
        AGENTGATE_ENABLE_LIVE_TESTS: "true",
      }),
    ).toThrow("Missing live smoke env vars: AGENTGATE_LIVE_REPOSITORY, AGENTGATE_LIVE_PR_BASE, AGENTGATE_LIVE_PR_HEAD, AGENTGATE_LIVE_PR_TITLE.");
  });

  it("reads a minimal live smoke config without secret values", () => {
    expect(
      readLiveSmokeConfig({
        AGENTGATE_ENABLE_LIVE_TESTS: "true",
        AGENTGATE_LIVE_PR_BASE: "main",
        AGENTGATE_LIVE_PR_HEAD: "agentgate-smoke",
        AGENTGATE_LIVE_PR_TITLE: "AgentGate smoke test",
        AGENTGATE_LIVE_REPOSITORY: "nodirumurkulov/agentgate-sandbox",
      }),
    ).toEqual({
      agentId: "coding-agent",
      baseUrl: "http://localhost:4010",
      changedFiles: ["README.md"],
      pullRequest: {
        base: "main",
        body: "Created by AgentGate live smoke testing.",
        head: "agentgate-smoke",
        title: "AgentGate smoke test",
      },
      repository: "nodirumurkulov/agentgate-sandbox",
    });
  });

  it("reads an optional pull request head SHA for status publishing", () => {
    expect(
      readLiveSmokeConfig({
        AGENTGATE_ENABLE_LIVE_TESTS: "true",
        AGENTGATE_LIVE_PR_BASE: "main",
        AGENTGATE_LIVE_PR_HEAD: "agentgate-smoke",
        AGENTGATE_LIVE_PR_HEAD_SHA: "abc123",
        AGENTGATE_LIVE_PR_TITLE: "AgentGate smoke test",
        AGENTGATE_LIVE_REPOSITORY: "nodirumurkulov/agentgate-sandbox",
      }).pullRequest,
    ).toMatchObject({
      headSha: "abc123",
    });
  });
});

describe("buildLiveSmokeRequest", () => {
  it("builds a draft create-pr request for a sandbox repository", () => {
    expect(
      buildLiveSmokeRequest({
        agentId: "coding-agent",
        baseUrl: "http://localhost:4010",
        changedFiles: ["README.md", "docs/live.md"],
        pullRequest: {
          base: "main",
          body: "Created by smoke testing.",
          head: "agentgate-smoke",
          headSha: "abc123",
          title: "AgentGate smoke test",
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      }),
    ).toEqual({
      action: "pull_requests.create",
      agentId: "coding-agent",
      changedFiles: ["README.md", "docs/live.md"],
      github: {
        base: "main",
        body: "Created by smoke testing.",
        draft: true,
        head: "agentgate-smoke",
        headSha: "abc123",
        maintainerCanModify: false,
        title: "AgentGate smoke test",
      },
      integration: "github",
      repository: "nodirumurkulov/agentgate-sandbox",
    });
  });
});
