import {
  callGuardedTool,
  guardedMcpTools,
  type AgentGateMcpClient,
  type GuardedMcpToolArguments,
} from "./index";

type JsonRpcId = number | string | null;

interface McpJsonRpcRequest {
  id?: JsonRpcId;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface McpJsonRpcResponse {
  error?: {
    code: number;
    message: string;
  };
  id: JsonRpcId;
  jsonrpc: "2.0";
  result?: unknown;
}

export async function handleMcpJsonRpcRequest(
  request: McpJsonRpcRequest,
  client: AgentGateMcpClient,
): Promise<McpJsonRpcResponse | undefined> {
  if (request.id === undefined) {
    return undefined;
  }

  try {
    if (request.method === "initialize") {
      return jsonRpcResult(request.id, {
        capabilities: {
          tools: {},
        },
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "agentgate",
          version: "0.1.0",
        },
      });
    }

    if (request.method === "tools/list") {
      return jsonRpcResult(request.id, {
        tools: guardedMcpTools.map(toMcpToolDescriptor),
      });
    }

    if (request.method === "tools/call") {
      const params = readToolCallParams(request.params);
      const result = await callGuardedTool(params.name, params.arguments, client);

      return jsonRpcResult(request.id, {
        content: [
          {
            text: JSON.stringify(result),
            type: "text",
          },
        ],
      });
    }

    return jsonRpcError(request.id, -32601, "Method not found.");
  } catch (error) {
    return jsonRpcError(
      request.id,
      -32000,
      error instanceof Error ? error.message : "AgentGate MCP request failed.",
    );
  }
}

export async function handleMcpJsonRpcLine(
  line: string,
  client: AgentGateMcpClient,
): Promise<string | undefined> {
  const request = JSON.parse(line) as McpJsonRpcRequest;
  const response = await handleMcpJsonRpcRequest(request, client);

  return response ? JSON.stringify(response) : undefined;
}

function toMcpToolDescriptor(tool: (typeof guardedMcpTools)[number]) {
  return {
    description: tool.description,
    inputSchema: {
      properties: {
        agentId: {
          type: "string",
        },
        changedFiles: {
          items: {
            type: "string",
          },
          type: "array",
        },
        deletedFiles: {
          items: {
            type: "string",
          },
          type: "array",
        },
        diffText: {
          type: "string",
        },
        github: {
          type: "object",
        },
        repository: {
          type: "string",
        },
      },
      required: ["agentId", "repository"],
      type: "object",
    },
    name: tool.name,
  };
}

function readToolCallParams(value: unknown): {
  arguments: GuardedMcpToolArguments;
  name: string;
} {
  if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.arguments)) {
    throw new Error("Invalid MCP tool call parameters.");
  }

  return {
    arguments: value.arguments as unknown as GuardedMcpToolArguments,
    name: value.name,
  };
}

function jsonRpcResult(id: JsonRpcId, result: unknown): McpJsonRpcResponse {
  return {
    id,
    jsonrpc: "2.0",
    result,
  };
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): McpJsonRpcResponse {
  return {
    error: {
      code,
      message,
    },
    id,
    jsonrpc: "2.0",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
