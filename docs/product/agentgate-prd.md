# AgentGate PRD

## Problem Statement

AI coding agents can modify repositories faster than humans can review the security impact. Most current workflows gate the final GitHub action, such as creating or merging a pull request, but they do not understand whether the code change itself is risky. A pull request that edits authentication, changes CI, removes tests, touches secrets, or modifies infrastructure should not be treated the same as a documentation-only change.

Developers and security teams need a runtime approval layer that evaluates proposed repository changes before an AI coding agent can create, update, or merge a pull request. The layer should classify code-change risk, enforce least-privilege policy, require human approval for high-risk changes, block forbidden changes, and produce an audit trail that explains every decision.

## Solution

AgentGate will prevent AI coding agents from landing high-risk repository changes without policy approval. Agents call AgentGate through a TypeScript SDK or MCP-compatible tool before GitHub PR actions. AgentGate evaluates the requested GitHub action, changed files, diff summary, risk rules, source trust, and approval state before allowing the action to proceed.

The MVP will focus on GitHub code-change workflows. A low-risk documentation or README PR can proceed automatically. A high-risk change, such as editing authentication, CI, database migrations, security policy, package dependencies, or deleting tests, requires Slack approval. A forbidden action, such as direct branch push, secret update, or bypassing required checks, is blocked. The dashboard shows the decision trail and approval outcomes.

## User Stories

1. As a developer, I want AgentGate to inspect AI-generated repository changes before GitHub PR actions run, so that risky changes do not land silently.
2. As a developer, I want low-risk documentation changes to proceed without approval, so that the agent remains useful.
3. As a security engineer, I want high-risk code changes to require approval, so that sensitive repository areas get human review.
4. As a security engineer, I want forbidden actions to be blocked, so that agents cannot directly push, edit secrets, or bypass checks.
5. As a reviewer, I want approval requests to show changed files, risk reasons, and requested action, so that I can make a fast decision.
6. As a reviewer, I want to approve or deny high-risk changes from Slack, so that decisions happen in the team workflow.
7. As a maintainer, I want every decision to include evidence, so that authorization behavior can be audited.
8. As a maintainer, I want audit logs to redact secrets, so that security logs do not become a leak.
9. As a maintainer, I want policy rules in a readable file, so that repo-specific risk policy is reviewable.
10. As an AI-tooling user, I want an MCP-compatible tool boundary, so that coding agents cannot bypass AgentGate when asking GitHub to create or update PRs.
11. As an SDK user, I want a simple TypeScript client, so that coding tools can call AgentGate before GitHub actions.
12. As a demo viewer, I want a dashboard showing allowed, approval-required, and blocked code changes, so that the product value is obvious.
13. As a security engineer, I want risk rules for auth, security, infra, CI, migrations, dependencies, tests, and secrets, so that common high-risk code paths are covered.
14. As a security engineer, I want prompt-injection checks to stay explainable, so that suspicious issue or PR text can influence approval decisions without relying on opaque classifiers.
15. As a maintainer, I want behavior built test-first, so that policy and risk decisions are not guessed after implementation.

## Implementation Decisions

- The MVP wedge is GitHub repository-change approval for AI coding agents.
- GitHub and Slack are first-class MVP integrations. Notion and the sample internal API are post-MVP extensions.
- GitHub should use a GitHub App model for installation-scoped permissions.
- Slack is the first human approval surface.
- The core package owns pure policy evaluation, diff risk classification, prompt-injection checks, and audit helpers.
- The gateway owns request orchestration, approval creation, audit persistence, and integration execution.
- The SDK and MCP packages expose the agent-facing boundary.
- The dashboard remains read-only in the MVP.
- Policy remains deny-by-default. Explicit block wins over approval, and approval wins over allow.
- Code-change risk classification should be deterministic in the MVP. It should use file paths, action names, diff metadata, and simple diff signals.
- High-risk path categories include authentication, authorization, security, CI, infrastructure, migrations, dependencies, tests, and secrets.
- Forbidden actions include direct branch push, secret update, required-check bypass, and merge without a passing AgentGate decision.
- Audit events should include requested action, changed files, risk level, risk reasons, decision, approval actor, and redacted payload evidence.
- Fixture mode must demonstrate the full flow without live credentials.

## Testing Decisions

- Core tests should cover risk classification and policy decisions through public functions.
- Gateway tests should use Fastify injection and fixture adapters.
- SDK tests should use a fake `fetch` implementation.
- MCP tests should verify tool calls route through the AgentGate client.
- Approval tests should cover approve, deny, invalid signature, expired approval, and replay attempts.
- Dashboard tests should assert visible audit/risk content, not component internals.
- End-to-end fixture tests should cover three flows: low-risk PR allowed, high-risk PR approval-required, forbidden action blocked.
- Each behavior change starts with a failing test, then minimal implementation, then refactor.

## Out of Scope

- Broad GitHub API coverage beyond PR create, PR update, and merge gating.
- Notion workflows.
- Internal API workflows.
- Full SaaS multi-tenancy.
- Billing.
- Browser-based policy editing.
- LLM-based code-risk classification.
- Production deployment hardening beyond local-first demo support.

## Further Notes

The strongest product story is not "approve PR creation." It is "approve the risk of the code change before PR creation, PR update, or merge." AgentGate should therefore make changed files, diff risk, and approval evidence the center of the MVP.
