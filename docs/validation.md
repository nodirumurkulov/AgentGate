# Validation record

## Local checks on 13 September 2026

The checks below were run on macOS with Node.js **25.1.0** and npm **11.6.2**, using baseline commit `3bdd98feda0e2cd60ef25ab92bf0c691dcc0a645` plus the documentation/demo changes in this pull request. This is a local record; see the PR's checks for independent CI results on Node 22/Linux.

| Check                                                                       | Observed result                                                            | What it covers                                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                    | Passed after the lockfile repair below                                     | Clean dependency installation in this environment                                                            |
| `npm test -- apps/demo-agent/src/fixtureDemo.test.ts` before implementation | Two tests failed with the unimplemented runner                             | The new demo behaviour was absent before implementation                                                      |
| Same focused command after implementation                                   | 2 tests passed                                                             | Three decisions, audit results, environment/network isolation, repeatability and unexpected-result rejection |
| `npm run demo:fixture`, twice                                               | Both runs succeeded; captured outputs matched                              | Executable walkthrough and stable summary                                                                    |
| `npm run check`                                                             | Lint and all workspace typechecks passed; **115 tests in 23 files passed** | Core, gateway, adapters with mocked HTTP, SDK/MCP helpers, demo and dashboard tests                          |
| `npm run build`                                                             | All workspace builds passed                                                | TypeScript checks and dashboard Vite build                                                                   |

The initial `npm ci` failed because the locked optional `@emnapi/wasi-threads` 1.2.2 did not satisfy the 1.2.3 resolution required by npm's dependency graph. `npm install --package-lock-only --ignore-scripts` updated only that entry's version, URL and integrity; the subsequent clean install passed. This was necessary to verify the documented fresh-checkout command. No direct dependency versions changed.

The installed ESLint toolchain requires at least Node 22.13 within Node 22. The quick start therefore specifies that version even though the root package's broader `>=22` engine declaration has not been narrowed here.

## Fixture and mocked evidence

- [Self-contained demo tests](../apps/demo-agent/src/fixtureDemo.test.ts) assert the displayed scenarios and reject an intentionally wrong outcome. They force live-mode environment values and a failing `fetch` stub while exercising the explicitly injected fixtures.
- [Gateway fixture flow](../apps/gateway/src/codeChangeGate.e2e.test.ts) verifies allow / pending approval / block and linked audit records through Fastify injection.
- [Gateway tests](../apps/gateway/src/app.test.ts) cover approval and denial, stored-action execution, signature/token rejection, token expiry, sequential callback replay, persistence and status publication.
- [GitHub adapter tests](../apps/gateway/src/adapters/githubAdapter.test.ts) exercise real adapter code with mocked HTTP/token providers: request construction, expected merge SHA, status preconditions and sanitised failures. They do not contact GitHub.
- [Slack signature tests](../apps/gateway/src/slackSignature.test.ts) verify HMAC and timestamp handling. [Slack adapter tests](../apps/gateway/src/adapters/slackAdapter.test.ts) use mocked responses.

The new demo stops at the pending approval request. Successful callback execution is covered separately by tests, not by an actual Slack button click in the demo.

## Live checks still pending

No live GitHub or Slack integration run was performed for this update. In particular, the following remain unverified against external services:

- GitHub App authentication, draft PR creation and status publication in the sandbox.
- Actual Slack message delivery, signed button callbacks, approval and denial.
- PR metadata update and merge behaviour, including a moved head or missing required status.
- Credential scopes, branch/ruleset configuration, ingress restrictions and operator deployment controls.

The [live runbook](live-integration-testing.md) describes setup and evidence to record. The provided live smoke script covers draft PR creation and optional status publication only; it is not a full approval/update/merge suite. Running that script would require separately configured sandbox resources and credentials.

## What passing tests do not establish

These hand-selected cases do not measure general agent-safety effectiveness, prompt-injection detection accuracy, complete approval-to-code binding, production durability or concurrent exactly-once execution. They do not prove malicious callers cannot bypass the gateway. See [security boundary](security-boundary.md) for the concrete implementation gaps and assumptions.
