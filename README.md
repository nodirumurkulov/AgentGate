# AgentGate

AgentGate is a small security layer for AI agents.

The idea is simple: before an agent uses a tool, AgentGate checks if that action is allowed. It can allow the action, block it, or ask a human to approve it first.

The first version will focus on GitHub, Slack, Notion, and a sample internal API.

## What it will do

- Check agent actions before they run.
- Use simple policy rules from `agentgate.policy.yaml`.
- Block risky actions by default.
- Send approval requests to Slack when a human should decide.
- Keep an audit log of what happened and why.
- Show recent decisions in a read-only dashboard.

## Current repo setup

This repo is a TypeScript monorepo using npm workspaces.

The code is still early. Right now the setup includes the app/package folders, basic tooling, and the first small policy evaluator in `packages/core`.

## Setup

```bash
npm install
npm run check
```

## Commands

```bash
npm run build
npm run lint
npm run typecheck
npm run test
npm run dev:gateway
npm run dev:dashboard
npm run dev:internal-api
```

## Project layout

```text
apps/
  dashboard/     read-only UI for logs and status
  gateway/       API service for checks and approvals
  internal-api/  local sample API with sensitive actions
packages/
  core/          policy and decision logic
  integrations/  external service adapters
  mcp/           MCP tool wrapper
  sdk/           TypeScript client
```

## Example flow

The agent will read a suspicious GitHub issue, check related Notion notes, post a Slack update, and try to call a sensitive internal API. AgentGate will decide which steps are safe and which ones need approval.
