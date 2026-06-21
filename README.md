# AgentGate

AgentGate prevents AI coding agents from landing high-risk repository changes without policy approval.

The idea is simple: before an agent creates, updates, or merges a pull request, AgentGate inspects the requested GitHub action, changed files, and diff risk. It can allow low-risk changes, block forbidden changes, or ask a human to approve high-risk changes first.

The first version focuses on GitHub repository changes, Slack approval, and an auditable read-only dashboard.

## What it will do

- Inspect proposed code changes before GitHub PR actions run.
- Classify changed files and diffs as low, medium, or high risk.
- Allow low-risk PR creation and update actions.
- Require Slack approval for high-risk code changes.
- Block forbidden changes by default.
- Keep an audit log of what changed, what risk was found, and why AgentGate decided.
- Show recent decisions and approval outcomes in a read-only dashboard.

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
  gateway/       API service for code-change checks and approvals
  internal-api/  later sample API for non-GitHub workflows
packages/
  core/          policy, diff risk, and decision logic
  integrations/  GitHub and Slack adapter seams
  mcp/           MCP tool wrapper for coding agents
  sdk/           TypeScript client
```

## Example flow

An AI coding agent proposes a pull request. AgentGate inspects the diff and changed files, notices the change touches authentication and deletes a test, requests Slack approval, and records the decision trail. A low-risk documentation-only PR can proceed without approval.
