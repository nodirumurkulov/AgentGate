# AgentGate Implementation Progress

## Problem

AgentGate is being built to stop AI coding agents from landing risky repository changes without runtime authorization. A shallow gate around "create a pull request" is not enough, because the security decision depends on the actual code-change evidence: changed files, deleted files, diff content, requested GitHub action, approval state, and audit history.

The MVP therefore focuses on GitHub pull request create, update, and merge workflows. Low-risk changes can execute automatically. High-risk changes require human approval through Slack. Explicitly forbidden actions, such as direct branch pushes, secret updates, or required-check bypasses, must be blocked before any adapter executes.

## How We Approached The Problem

The implementation has followed small, test-first PRs. Core authorization behavior stays in pure TypeScript modules where possible, while the gateway owns orchestration: risk classification, policy evaluation, approval creation, adapter execution, callback handling, and audit persistence.

The real integration path remains opt-in. Fixture adapters stay the default for local development and tests. Real GitHub and Slack adapters are enabled only through explicit environment configuration, and normal CI does not use live tokens or network calls.

Security work has focused on fail-closed behavior, least privilege, and auditability:

- Blocked actions do not call GitHub or Slack adapters.
- Approval-required actions do not execute GitHub until approval succeeds.
- Slack callbacks require valid signatures and callback tokens.
- Callback tokens are redacted from public responses and hashed at rest.
- Adapter failures are returned as sanitized integration results instead of leaking exception details.
- Audit events record approval outcomes and rejected callback attempts.

## What We Have Done

Core MVP foundations are in place:

- Added engineering guardrails, CI, TDD guidance, code-design guidance, and security principles.
- Added pure policy evaluation with deny-by-default behavior.
- Added deterministic code-change risk classification for high-risk repository areas.
- Added audit helpers with redaction and hash chaining.
- Added gateway authorization and execution routes.
- Added approval state transitions and fixture GitHub/Slack adapters.
- Added Slack signature verification and Slack interactive approval callbacks.
- Added SDK and MCP-facing guarded tool request shapes.
- Added a read-only dashboard for audit events and approval outcomes.
- Added a live integration runbook for sandbox GitHub and Slack testing.

Recent security hardening merged into `main`:

- PR #28 records approved and denied Slack approval callbacks as audit events and dashboard metrics.
- PR #29 converts real GitHub and Slack adapter exceptions into sanitized `ok: false` integration results.
- PR #30 validates GitHub repository input as a strict `owner/repo` path before token retrieval or network calls.
- PR #31 requires callback tokens for approvals that have stored token material, closing the signed JSON callback bypass.
- PR #32 adds dashboard polling from `/v1/audit` and introduces this progress document.
- PR #33 adds a dependency-free MCP JSON-RPC handler for `initialize`, `tools/list`, and `tools/call`, keeping MCP tool execution routed through the existing AgentGate SDK client.
- PR #34 requires a passing AgentGate commit status for the exact merge `expectedHeadSha` before the real GitHub adapter can call the merge endpoint.
- PR #35 publishes the configured AgentGate commit status after successful PR create/update execution when the request includes `github.headSha`.

Current implementation slice:

- Run the live sandbox smoke test against a sandbox GitHub repository and Slack approval channel.
- Use local-only GitHub App and Slack credentials; do not commit `.env`, private keys, tokens, screenshots, or raw API responses with sensitive headers.
- Verify the real create-PR path, Slack approval path, AgentGate status publication, and merge status-check precondition with a known sandbox head SHA.
- Record only sanitized outputs: decision outcome, draft PR URL, Slack channel/timestamp if useful, and status context/state.

The implementation is ready for this run, but the run itself requires credentials and sandbox resources that should stay outside the repository.

## What We Are Going To Do Next

The next steps should continue in small reviewable PRs:

1. Create or confirm a sandbox repository and a non-sensitive branch containing a test README change.
2. Provide local-only GitHub App values: app ID, installation ID, private-key path under `.secrets/`, API base URL, and webhook secret if webhooks are enabled.
3. Provide local-only Slack values: bot token, signing secret, approval channel ID, and public tunnel URL.
4. Run the live smoke command with `AGENTGATE_LIVE_PR_HEAD_SHA` set to the sandbox branch head commit.
5. Use the smoke-test result to decide whether update and merge need more runtime constraints before broader testing.

The final goal is a clean MVP path where an AI coding agent calls AgentGate before GitHub repository-changing actions, AgentGate classifies risk and enforces policy, Slack reviewers approve high-risk changes, and maintainers can inspect a durable audit trail without exposing secrets.
