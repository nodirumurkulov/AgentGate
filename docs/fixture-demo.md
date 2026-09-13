# Reproducible fixture demo

The demo runs the real Fastify gateway routes in-process with explicitly selected fixture adapters and a new `MemoryStore`. It does not start a listener or require a GitHub repository, Slack workspace, token, `.env` file or separate gateway process. Dependency installation needs access to the npm registry; the demo itself does not make external requests.

## Run from a clean checkout

Use Node.js 22.13+ within the Node 22 release line and npm 11.6.2:

```bash
npm ci
npm run demo:fixture
```

After npm's script headers, expect:

```text
AgentGate fixture demo (no live GitHub or Slack calls)
docs-only PR creation | HTTP 200 | allow | execution=fixture | approval=none
auth-code PR update | HTTP 202 | approval_required | execution=none | approval=pending
direct branch push | HTTP 403 | block | execution=none | approval=none
Audit decisions: allow -> approval_required -> block
PASS: 3 scenarios; audit chain verified.
```

Each invocation starts fresh, so this summary is repeatable. The CLI exits nonzero on an assertion or runtime failure. It uses `node --import tsx` to avoid the extra IPC listener used by the `tsx` CLI.

## What each scenario establishes

| Supplied action and evidence                  | Expected result                               | Adapter side effects                                |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `pull_requests.create`, `README.md`           | HTTP 200, `allow`                             | One fixture GitHub execution, no Slack notification |
| `pull_requests.update`, `src/auth/session.ts` | HTTP 202, `approval_required`, pending record | One fixture Slack notification, no GitHub execution |
| `branches.push_direct`, `README.md`           | HTTP 403, `block`                             | Neither adapter executes                            |

The runner asserts status, decision, pending-approval state and per-scenario adapter call counts. It checks that the public approval omits callback tokens/hashes, that audit decisions follow the same sequence, and that event hashes and chain links match. It closes the gateway in `finally`.

The unit/integration test sets real-adapter, persistence and base-URL environment values and replaces `fetch` with a failing stub. The demo still runs without calling it or using the configured persistent store. Another test deliberately changes a scenario so its decision no longer matches the expectation; the runner must reject it.

```bash
npm test -- apps/demo-agent/src/fixtureDemo.test.ts
npm test -- apps/gateway/src/codeChangeGate.e2e.test.ts
```

## Limits

The fixture GitHub adapter reports a simulated execution. No PR is created or code pushed. Its permissive input contract does not prove a corresponding real GitHub call would succeed. The fixture Slack adapter simulates notification only: the pending scenario does not click an approval button or run a callback. Existing callback tests cover signatures, tokens, expiry, sequential replay, approval, denial and stored-action execution separately.

This demo establishes these examples and checks, not a general safety rate, complete evidence binding, concurrency safety or live GitHub/Slack operation. See [security boundary](security-boundary.md) and [validation](validation.md).

## Existing HTTP demo

For the separate SDK-over-HTTP example, use an isolated development environment. The server listens on all interfaces and does not authenticate action/audit requests. In terminal one, from the repository root:

```bash
AGENTGATE_ADAPTER_MODE=fixture AGENTGATE_STORE_PATH='' npm run dev:gateway
```

In terminal two:

```bash
AGENTGATE_BASE_URL=http://localhost:4010 npm run demo
curl --fail http://localhost:4010/v1/audit
```

This older command prints an SDK HTTP 403 error for the deliberately blocked action and catches errors without asserting the expected results. Use `demo:fixture` for the repeatable pass/fail check. The in-process demo's audit data is separate from the HTTP server's store.

The dashboard reads `/v1/audit` on its own origin. Starting Vite on port 5173 and the gateway on 4010 alone does not connect them: a same-origin proxy is not currently configured. The standalone fixture demo does not depend on dashboard setup.
