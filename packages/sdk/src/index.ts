import type { ActionRequest, ApprovalRecord, CodeChangeRisk, Decision } from "@agentgate/core";

export interface AgentGateClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
}

export interface AgentGateActionRequest {
  action: string;
  agentId: string;
  changedFiles?: string[];
  deletedFiles?: string[];
  diffText?: string;
  github?: GitHubPullRequestInput;
  input?: ActionRequest["input"];
  integration: string;
  repository?: string;
  sourceTrust?: ActionRequest["sourceTrust"];
  target?: string;
}

export type GitHubPullRequestInput = GitHubCreatePullRequestInput | GitHubUpdatePullRequestInput;

export interface GitHubCreatePullRequestInput {
  base: string;
  body?: string;
  draft?: boolean;
  head: string;
  maintainerCanModify?: boolean;
  title: string;
}

export interface GitHubUpdatePullRequestInput {
  base?: string;
  body?: string;
  maintainerCanModify?: boolean;
  pullNumber: number;
  state?: "open" | "closed";
  title?: string;
}

export interface AgentGateAuthorizeResponse {
  auditEventId?: string;
  decision: Decision;
  risk?: CodeChangeRisk;
}

export interface AgentGateExecuteResponse extends AgentGateAuthorizeResponse {
  approval?: ApprovalRecord;
  execution?: {
    data: Record<string, unknown>;
    externalRequestId?: string;
    ok: boolean;
  };
}

export class AgentGateClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AgentGateClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async authorize(request: AgentGateActionRequest): Promise<Decision> {
    const response = await this.postJson<AgentGateAuthorizeResponse | Decision>(
      "/v1/actions/authorize",
      request,
      "authorization",
    );

    return "decision" in response ? response.decision : response;
  }

  async execute(request: AgentGateActionRequest): Promise<AgentGateExecuteResponse> {
    return this.postJson("/v1/actions/execute", request, "execution");
  }

  private async postJson<T>(
    path: string,
    body: AgentGateActionRequest,
    failureLabel: string,
  ): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`AgentGate ${failureLabel} failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}
