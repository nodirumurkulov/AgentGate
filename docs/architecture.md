# AgentGate Architecture

AgentGate sits between an agent and every external tool action. Agents call the SDK or MCP gateway, AgentGate evaluates policy and risk, and only allowed actions reach GitHub, Slack, Notion, or the internal API.

```mermaid
flowchart LR
  Agent[AI Agent] --> SDK[TypeScript SDK]
  Agent --> MCP[MCP Gateway]
  SDK --> Gateway[AgentGate Gateway]
  MCP --> Gateway
  Gateway --> Core[Policy and Risk Core]
  Gateway --> Audit[(SQLite Audit Log)]
  Gateway --> Approvals[Slack Approvals]
  Gateway --> Integrations[Integration Adapters]
  Integrations --> GitHub[GitHub App]
  Integrations --> Slack[Slack API]
  Integrations --> Notion[Notion API]
  Integrations --> Internal[Internal API]
  Dashboard[Read-only Dashboard] --> Gateway
```

The first version is local-first. OAuth callbacks and Slack interactivity use a tunnel URL, while SQLite keeps audit data and approval state durable between runs.

