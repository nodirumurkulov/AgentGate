import { describe, expect, it } from "vitest";
import { AgentGateClient, type AgentGateActionRequest } from "./index";

describe("AgentGateClient", () => {
  it("posts authorization requests to the gateway", async () => {
    const calls: FetchCall[] = [];
    const client = new AgentGateClient({
      baseUrl: "http://agentgate.test/",
      fetcher: createFetcher(calls, {
        decision: {
          evidence: [],
          outcome: "allow",
          reason: "Allowed.",
          request: {
            action: "pull_requests.create",
            agentId: "coding-agent",
            integration: "github",
            target: "risk:low",
          },
        },
      }),
    });
    const request = createPullRequestPayload("pull_requests.create");

    await client.authorize(request);

    expect(calls).toEqual([
      {
        body: request,
        method: "POST",
        url: "http://agentgate.test/v1/actions/authorize",
      },
    ]);
  });

  it("posts execution requests to the gateway", async () => {
    const calls: FetchCall[] = [];
    const client = new AgentGateClient({
      baseUrl: "http://agentgate.test",
      fetcher: createFetcher(calls, {
        decision: {
          outcome: "allow",
        },
        execution: {
          ok: true,
        },
      }),
    });
    const request = createPullRequestPayload("pull_requests.update");

    await client.execute(request);

    expect(calls).toEqual([
      {
        body: request,
        method: "POST",
        url: "http://agentgate.test/v1/actions/execute",
      },
    ]);
  });
});

interface FetchCall {
  body: unknown;
  method: string;
  url: string;
}

function createPullRequestPayload(action: string): AgentGateActionRequest {
  return {
    action,
    agentId: "coding-agent",
    changedFiles: ["README.md"],
    integration: "github",
    repository: "nodirumurkulov/AgentGate",
  };
}

function createFetcher(calls: FetchCall[], responseBody: unknown): typeof fetch {
  return async (input, init) => {
    calls.push({
      body: JSON.parse(String(init?.body)),
      method: init?.method ?? "GET",
      url: String(input),
    });

    return new Response(JSON.stringify(responseBody), {
      headers: {
        "content-type": "application/json",
      },
      status: 200,
    });
  };
}
