# AgentGate

AgentGate is a local-first prototype for authorising AI coding-agent actions on GitHub. The gateway evaluates the requested action and caller-supplied change evidence, then allows it, requests human approval, or blocks it before calling an integration adapter.

**Start with `npm run demo:fixture`.** It exercises the real gateway routes with in-memory fixture adapters and demonstrates all three decisions without credentials, a listening server, or GitHub/Slack traffic.

This is an experimental approval gateway. Its controls apply to calls routed through it; independent agent credentials can bypass it. Change evidence is not yet verified against GitHub, and approval binding has limits. Read the [security boundary](docs/security-boundary.md) before using real adapters.

## Quick start

Use Node.js 22.13 or newer within the Node 22 release line (CI uses Node 22) and npm 11.6.2. From a fresh checkout:

```bash
npm ci
npm run demo:fixture
npm run check
```

The demo exits nonzero if a decision, execution result, approval state or audit record is unexpected. Its application output is:

```text
AgentGate fixture demo (no live GitHub or Slack calls)
docs-only PR creation | HTTP 200 | allow | execution=fixture | approval=none
auth-code PR update | HTTP 202 | approval_required | execution=none | approval=pending
direct branch push | HTTP 403 | block | execution=none | approval=none
Audit decisions: allow -> approval_required -> block
PASS: 3 scenarios; audit chain verified.
```

See the [demo walkthrough](docs/fixture-demo.md) for what these results establish and how to inspect the separate HTTP demo and audit endpoint.

## Implemented today

- **Policy decisions:** explicit block takes precedence over approval, then allow; unmatched actions default to block. The gateway currently embeds its policy in `apps/gateway/src/routes.ts`.
- **Change-risk heuristics:** supplied file paths, deleted tests and secret-like diff text influence low/medium/high risk. These are deterministic rules, not semantic code analysis.
- **Approval workflow:** pending requests hold the action to execute. Signed Slack callbacks approve or deny them; tokens are hashed at rest and omitted from public approval responses. Expired tokens and already-decided approvals are rejected in the sequential workflow.
- **GitHub adapters:** create PRs, update PR metadata and merge PRs. They do not write commits or push branch content. The real merge adapter requires a passing configured status on `expectedHeadSha` and sends that SHA to GitHub's merge endpoint.
- **Status publication:** successful create/update requests can publish an authorisation status on a supplied `github.headSha`. That SHA is not independently correlated with the reviewed evidence.
- **Audit and display:** audit records include decisions, risk reasons and callback outcomes, with key-based redaction and a hash chain. Storage is in memory by default or a JSON file when configured. The dashboard reads `/v1/audit`.
- **SDK and MCP helpers:** a TypeScript client, guarded tool definitions, and JSON-RPC request/line handlers for initialise/list/call. These are integration building blocks, not an installed standalone MCP server.
- **Fixture and opt-in real adapters:** normal tests use fixtures or mocked HTTP. Real GitHub/Slack validation is still pending.

`agentgate.policy.yaml` and its parser illustrate policy configuration; editing that file does **not** change the running gateway policy. The standalone prompt-pattern detector is a four-regex heuristic and is **not wired into gateway authorisation**. It is not a general prompt-injection defence.

## Review the work

| Start here                                                          | What to inspect                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Architecture](docs/architecture.md)                                | Request flow, components and actual storage                   |
| [Fixture demo](docs/fixture-demo.md)                                | Repeatable allow / approval / block demonstration             |
| [Security boundary](docs/security-boundary.md)                      | Enforced checks, bypass assumptions and approval-binding gaps |
| [Validation](docs/validation.md)                                    | Commands run, evidence scope and pending live checks          |
| [Contribution and scope](docs/contributions.md)                     | Project attribution and development assistance                |
| [Policy evaluator](packages/core/src/policy.ts)                     | Rule precedence and default denial                            |
| [Gateway fixture test](apps/gateway/src/codeChangeGate.e2e.test.ts) | Decisions and chained audit records                           |
| [Live runbook](docs/live-integration-testing.md)                    | Opt-in sandbox setup, not proof of a completed live test      |

## Commands

```bash
npm run demo:fixture     # self-contained, asserted fixture demonstration
npm run check           # lint, workspace typechecks, Vitest
npm run build           # workspace builds, including dashboard
npm run dev:gateway     # HTTP server; see network-exposure warning below
npm run dev:dashboard   # read-only audit dashboard
npm run demo            # existing SDK demo against a running HTTP gateway
```

The HTTP gateway binds to `0.0.0.0` and has no application-level caller authentication. Keep it on an isolated development machine/network; do not expose the whole API through a public tunnel. For real callbacks, expose only the necessary signed webhook routes with appropriate ingress controls. See the [security boundary](docs/security-boundary.md).

## Repository layout

```text
apps/
  dashboard/     read-only audit UI
  demo-agent/    fixture demo, HTTP demo and opt-in live smoke script
  gateway/       policy orchestration, approvals, stores and adapters
  internal-api/  sample API; not part of the GitHub approval path
packages/
  core/          policy, risk, approval and audit helpers
  integrations/  shared integration contracts
  mcp/           guarded tools and JSON-RPC handlers
  sdk/           TypeScript gateway client
```

The [PRD](docs/product/agentgate-prd.md) describes product intent. For current behaviour, use the implementation, [progress note](docs/implementation-progress.md), and validation record above.
