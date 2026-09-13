# Artifact Readiness Implementation Plan

**Goal:** Make the implemented AgentGate scope, three-decision demo and validation limits independently reviewable.

**Architecture:** Reuse the gateway and existing scenarios through Fastify injection. Construct fixture adapters and an in-memory store explicitly so the demo does not inherit live adapter or persistence settings. Keep gateway production behaviour unchanged; document its actual security guarantees and gaps.

**Tech Stack:** TypeScript, Fastify injection, Vitest, npm workspaces, Markdown.

The user's five requested changes approve this scope. Execute inline and verify before opening a PR.

## Tasks

- [x] Add `apps/demo-agent/src/fixtureDemo.test.ts`: check the real three-decision flow, audit sequence, isolation from live environment settings, and rejection of unexpected outcomes.
- [x] Run `npm test -- apps/demo-agent/src/fixtureDemo.test.ts` and observe failure before adding the runner.
- [x] Add `apps/demo-agent/src/fixtureDemo.ts` and a small CLI entry point. Reuse `scenario.ts`, close the gateway in `finally`, assert response and audit outcomes, and print a stable summary with no random IDs, timestamps or tokens.
- [x] Add `demo:fixture` npm scripts. Preserve the existing HTTP demo command. Run the focused test and the new command twice; compare output.
- [x] Rewrite `README.md` and `docs/architecture.md`; add `docs/fixture-demo.md`, `docs/security-boundary.md`, `docs/validation.md`, and `docs/contributions.md`. Correct the stale SQLite claim, distinguish metadata updates from branch writes, describe approval binding and trust assumptions, and avoid unsupported personal authorship claims.
- [x] Update `docs/implementation-progress.md` and the live runbook with links and an explicit unperformed-live-validation status.
- [x] Run `npm run check`, `npm run build`, formatting and relative-link checks. Record actual results and environment in the validation note. Review the diff.
- [ ] Commit, push the branch and open a PR using the repository template.

## Verification notes

The initial clean install exposed an optional-dependency lockfile mismatch; repairing that entry made `npm ci` succeed. The new runner was observed failing before implementation, then both focused tests passed. Full checks passed with 115 tests, and all workspace builds passed. Two CLI runs produced identical output. CI now also runs the fixture demo. Independent review found the README needed Node 22.13 rather than 22.12 for the installed ESLint toolchain; this is corrected. Live integration remains pending.
