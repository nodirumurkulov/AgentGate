import { describe, expect, it } from "vitest";
import { handleMcpJsonRpcLine, handleMcpJsonRpcRequest } from "./stdio";

describe("handleMcpJsonRpcRequest", () => {
  it("returns MCP server capabilities during initialize", async () => {
    const response = await handleMcpJsonRpcRequest(
      {
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
      },
      createClient(),
    );

    expect(response).toEqual({
      id: 1,
      jsonrpc: "2.0",
      result: {
        capabilities: {
          tools: {},
        },
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "agentgate",
          version: "0.1.0",
        },
      },
    });
  });

  it("lists guarded AgentGate tools", async () => {
    const response = await handleMcpJsonRpcRequest(
      {
        id: "tools",
        jsonrpc: "2.0",
        method: "tools/list",
      },
      createClient(),
    );

    expect(response).toMatchObject({
      id: "tools",
      jsonrpc: "2.0",
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            description: "Create a low-risk GitHub pull request through AgentGate authorization.",
            name: "agentgate.github.create_pull_request",
          }),
        ]),
      },
    });
  });

  it("calls guarded tools through the AgentGate client", async () => {
    const calls: unknown[] = [];
    const response = await handleMcpJsonRpcRequest(
      {
        id: 2,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            agentId: "coding-agent",
            changedFiles: ["README.md"],
            repository: "nodirumurkulov/AgentGate",
          },
          name: "agentgate.github.create_pull_request",
        },
      },
      createClient(calls),
    );

    expect(calls).toEqual([
      {
        action: "pull_requests.create",
        agentId: "coding-agent",
        changedFiles: ["README.md"],
        integration: "github",
        repository: "nodirumurkulov/AgentGate",
      },
    ]);
    expect(response).toEqual({
      id: 2,
      jsonrpc: "2.0",
      result: {
        content: [
          {
            text: JSON.stringify({
              decision: {
                outcome: "allow",
              },
            }),
            type: "text",
          },
        ],
      },
    });
  });

  it("handles line-delimited JSON-RPC messages for stdio", async () => {
    const response = await handleMcpJsonRpcLine(
      JSON.stringify({
        id: "list",
        jsonrpc: "2.0",
        method: "tools/list",
      }),
      createClient(),
    );

    expect(JSON.parse(response ?? "")).toMatchObject({
      id: "list",
      jsonrpc: "2.0",
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "agentgate.github.create_pull_request",
          }),
        ]),
      },
    });
  });
});

function createClient(calls: unknown[] = []) {
  return {
    async execute(request: unknown) {
      calls.push(request);

      return {
        decision: {
          outcome: "allow",
        },
      };
    },
  };
}
