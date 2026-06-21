import type { ActionRequest, Decision } from "@agentgate/core";

export interface AgentGateClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
}

export class AgentGateClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AgentGateClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async authorize(request: ActionRequest): Promise<Decision> {
    const response = await this.fetcher(`${this.baseUrl}/v1/actions/authorize`, {
      body: JSON.stringify(request),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`AgentGate authorization failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as Decision;
  }
}

