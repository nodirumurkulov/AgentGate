import { describe, expect, it } from "vitest";
import { callGuardedTool, guardedMcpTools } from "./index";

describe("guardedMcpTools", () => {
  it("exposes GitHub pull request tools", () => {
    expect(guardedMcpTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "agentgate.github.create_pull_request",
        "agentgate.github.update_pull_request",
        "agentgate.github.merge_pull_request",
      ]),
    );
  });
});

describe("callGuardedTool", () => {
  it.each([
    ["agentgate.github.create_pull_request", "pull_requests.create"],
    ["agentgate.github.update_pull_request", "pull_requests.update"],
    ["agentgate.github.merge_pull_request", "pull_requests.merge"],
  ])("forwards %s through the AgentGate client", async (toolName, action) => {
    const calls: unknown[] = [];
    const client = {
      async execute(request: unknown) {
        calls.push(request);
        return {
          decision: {
            outcome: "allow",
          },
        };
      },
    };

    await callGuardedTool(
      toolName,
      {
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        repository: "nodirumurkulov/AgentGate",
      },
      client,
    );

    expect(calls).toEqual([
      {
        action,
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
    ]);
  });

  it("forwards GitHub create pull request input", async () => {
    const calls: unknown[] = [];
    const client = {
      async execute(request: unknown) {
        calls.push(request);

        return {
          decision: {
            outcome: "allow",
          },
        };
      },
    };

    await callGuardedTool(
      "agentgate.github.create_pull_request",
      {
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        github: {
          base: "main",
          draft: true,
          head: "agentgate-smoke",
          title: "AgentGate smoke test",
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
      client,
    );

    expect(calls).toEqual([
      {
        action: "pull_requests.create",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        github: {
          base: "main",
          draft: true,
          head: "agentgate-smoke",
          title: "AgentGate smoke test",
        },
        integration: "github",
        repository: "nodirumurkulov/agentgate-sandbox",
      },
    ]);
  });

  it("forwards GitHub update pull request input", async () => {
    const calls: unknown[] = [];
    const client = {
      async execute(request: unknown) {
        calls.push(request);

        return {
          decision: {
            outcome: "allow",
          },
        };
      },
    };

    await callGuardedTool(
      "agentgate.github.update_pull_request",
      {
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        github: {
          body: "Updated by AgentGate.",
          pullNumber: 7,
          title: "Updated smoke PR",
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
      client,
    );

    expect(calls).toEqual([
      {
        action: "pull_requests.update",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        github: {
          body: "Updated by AgentGate.",
          pullNumber: 7,
          title: "Updated smoke PR",
        },
        integration: "github",
        repository: "nodirumurkulov/agentgate-sandbox",
      },
    ]);
  });

  it("forwards GitHub merge pull request input", async () => {
    const calls: unknown[] = [];
    const client = {
      async execute(request: unknown) {
        calls.push(request);

        return {
          decision: {
            outcome: "allow",
          },
        };
      },
    };

    await callGuardedTool(
      "agentgate.github.merge_pull_request",
      {
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        github: {
          expectedHeadSha: "abc123",
          mergeMethod: "squash",
          pullNumber: 7,
        },
        repository: "nodirumurkulov/agentgate-sandbox",
      },
      client,
    );

    expect(calls).toEqual([
      {
        action: "pull_requests.merge",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        github: {
          expectedHeadSha: "abc123",
          mergeMethod: "squash",
          pullNumber: 7,
        },
        integration: "github",
        repository: "nodirumurkulov/agentgate-sandbox",
      },
    ]);
  });

  it("throws for unknown tool names", async () => {
    await expect(
      callGuardedTool(
        "agentgate.github.close_issue",
        {
          agentId: "coding-agent",
          repository: "nodirumurkulov/AgentGate",
        },
        {
          async execute() {
            return {};
          },
        },
      ),
    ).rejects.toThrow("Unknown AgentGate MCP tool.");
  });
});
