# AgentGate MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AgentGate MVP that prevents AI coding agents from creating, updating, or merging high-risk GitHub repository changes without policy approval.

**Architecture:** Keep code-risk classification and policy decisions pure in `@agentgate/core`. The gateway orchestrates authorization, approvals, audit persistence, and GitHub/Slack adapters. The SDK and MCP packages are the agent-facing boundary, and the dashboard is read-only.

**Tech Stack:** TypeScript, npm workspaces, Fastify, React/Vite, Vitest, YAML policies, local SQLite persistence, fixture GitHub/Slack adapters.

---

## Engineering Rules

- Start every behavior change with a failing test.
- Keep functions small and explicit.
- Keep modules narrow: policy, risk, audit, approval, gateway routes, adapters, SDK, MCP, and dashboard are separate seams.
- Deny by default. Explicit block wins over approval. Approval wins over allow.
- Do not add Notion or internal API behavior to the MVP.
- Run focused tests after each change and `npm run check` before each commit.

## Task 1: Add Engineering Guardrails

**Files:**
- Create: `AGENTS.md`
- Create: `docs/engineering/sdlc.md`
- Create: `docs/engineering/tdd.md`
- Create: `docs/engineering/code-design.md`
- Create: `docs/engineering/security-principles.md`
- Create: `.github/pull_request_template.md`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add `AGENTS.md`**

```markdown
# AgentGate Engineering Rules

## Non-Negotiables

- Write the failing test before production behavior.
- Keep functions small and named after the behavior they perform.
- Keep modules narrow. One module should have one reason to change.
- Prefer explicit control flow over clever abstraction.
- Delete speculative code.
- Run `npm run check` before claiming work is complete.

## Product Invariants

- Unknown repository actions are blocked.
- High-risk code changes require approval.
- Forbidden repository actions are blocked.
- Approval-required changes cannot execute before approval.
- GitHub adapters never bypass AgentGate decisions.
- Audit logs redact sensitive values before storage.
```

- [ ] **Step 2: Add engineering docs**

Create concise docs for SDLC, TDD, code design, and security principles. Each doc should fit on one screen and reinforce: PRD first, failing test first, small functions, deny-by-default, approval before high-risk execution.

- [ ] **Step 3: Add PR template and CI**

Add a PR template requiring focused test evidence, `npm run check`, security impact, and approval-gate review. Add CI that runs `npm ci`, `npm run check`, and `npm run build`.

- [ ] **Step 4: Verify and commit**

Run: `npm run check`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Commit:

```bash
git add AGENTS.md docs/engineering .github
git commit -m "docs: add engineering guardrails"
```

## Task 2: Split Core Into Pure Modules

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/policy.ts`
- Create: `packages/core/src/policy.test.ts`
- Create: `packages/core/src/codeRisk.ts`
- Create: `packages/core/src/codeRisk.test.ts`

- [ ] **Step 1: Write failing policy module test**

Create `policy.test.ts` that verifies:
- low-risk PR create returns `allow`
- high-risk PR update returns `approval_required`
- forbidden direct push returns `block`
- unknown action returns default `block`

Run: `npx vitest run packages/core/src/policy.test.ts`
Expected: FAIL because `policy.ts` and `types.ts` do not exist.

- [ ] **Step 2: Extract types and policy evaluator**

Move shared types to `types.ts`, policy evaluation to `policy.ts`, and make `index.ts` export only public APIs. Keep current behavior generic but use GitHub PR action examples in tests.

Run: `npx vitest run packages/core/src/policy.test.ts`
Expected: PASS.

- [ ] **Step 3: Write failing code-risk tests**

Create `codeRisk.test.ts` with cases:
- `README.md` only returns `low`
- `src/auth/session.ts` returns `high`
- `.github/workflows/ci.yml` returns `high`
- `package-lock.json` returns `medium`
- deleting a test file returns `high`

Run: `npx vitest run packages/core/src/codeRisk.test.ts`
Expected: FAIL because `classifyCodeChangeRisk` does not exist.

- [ ] **Step 4: Implement deterministic risk classifier**

Implement:

```typescript
classifyCodeChangeRisk(input: {
  changedFiles: string[];
  deletedFiles?: string[];
  diffText?: string;
}): {
  level: "low" | "medium" | "high";
  reasons: string[];
}
```

Keep this deterministic and path-based for MVP. No LLM classifier.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run packages/core/src/policy.test.ts packages/core/src/codeRisk.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add packages/core/src
git commit -m "feat: add code change risk classification"
```

## Task 3: Validate YAML Policy For Code-Change Rules

**Files:**
- Modify: `packages/core/package.json`
- Modify: `package-lock.json`
- Create: `packages/core/src/policySchema.ts`
- Create: `packages/core/src/policySchema.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Install YAML parser**

Run: `npm install yaml --workspace @agentgate/core`
Expected: `yaml` is added to the core package.

- [ ] **Step 2: Write failing parser tests**

Create tests that verify valid `agentgate.policy.yaml` parses, `defaultDecision: allow` is rejected, empty rule agents are rejected, and missing actions are rejected.

Run: `npx vitest run packages/core/src/policySchema.test.ts`
Expected: FAIL because `parsePolicyYaml` does not exist.

- [ ] **Step 3: Implement minimal schema validation**

Implement `parsePolicyYaml(text: string): PolicyDocument`. Validate only the MVP fields already used by policy evaluation: version, defaultDecision, rules, agents, integrations, actions, resources, and effect.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run packages/core/src/policySchema.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add packages/core package-lock.json
git commit -m "feat: validate code-change policies"
```

## Task 4: Add Audit Evidence For Code-Change Decisions

**Files:**
- Create: `packages/core/src/audit.ts`
- Create: `packages/core/src/audit.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing audit tests**

Test that audit event creation stores requested action, changed files, risk level, risk reasons, decision, timestamp, previous hash, and redacts sensitive keys such as token, secret, password, privateKey, and credential.

Run: `npx vitest run packages/core/src/audit.test.ts`
Expected: FAIL because `audit.ts` does not exist.

- [ ] **Step 2: Implement audit helpers**

Implement redaction and SHA-256 hash chaining with `node:crypto`. Keep persistence out of core.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run packages/core/src/audit.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add packages/core/src
git commit -m "feat: add code-change audit helpers"
```

## Task 5: Add Gateway Authorization For PR Risk

**Files:**
- Create: `apps/gateway/src/app.ts`
- Create: `apps/gateway/src/routes.ts`
- Create: `apps/gateway/src/stores/memoryStore.ts`
- Create: `apps/gateway/src/app.test.ts`
- Modify: `apps/gateway/src/index.ts`

- [ ] **Step 1: Write failing HTTP tests**

Test `POST /v1/actions/authorize` for:
- low-risk PR create returns 200 and `allow`
- high-risk PR update returns 200 and `approval_required`
- direct branch push returns 200 and `block`
- `GET /v1/audit` returns the recorded decisions

Run: `npx vitest run apps/gateway/src/app.test.ts`
Expected: FAIL because `createGatewayApp` and audit routes do not exist.

- [ ] **Step 2: Implement gateway app composition**

Move Fastify creation into `app.ts`. Keep `index.ts` limited to env reads and server start. Use an in-memory store for tests. Authorization should classify risk from `changedFiles`, evaluate policy using `target: risk:<level>`, append audit, and return the decision.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run apps/gateway/src/app.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add apps/gateway/src
git commit -m "feat: authorize pull request risk"
```

## Task 6: Add Execute Flow And Approval Creation

**Files:**
- Modify: `packages/integrations/src/index.ts`
- Create: `apps/gateway/src/adapters/fixtureAdapters.ts`
- Create: `packages/core/src/approvals.ts`
- Create: `packages/core/src/approvals.test.ts`
- Modify: `apps/gateway/src/routes.ts`
- Modify: `apps/gateway/src/app.test.ts`

- [ ] **Step 1: Write failing approval tests**

Test pure transitions: pending to approved, pending to denied, pending to expired, and non-pending transitions throw.

Run: `npx vitest run packages/core/src/approvals.test.ts`
Expected: FAIL because `approvals.ts` does not exist.

- [ ] **Step 2: Implement approval transitions**

Keep approval state transitions pure and side-effect free.

- [ ] **Step 3: Write failing execute route tests**

Test `POST /v1/actions/execute`:
- allowed low-risk PR executes fixture GitHub adapter
- high-risk PR creates pending approval and does not execute adapter
- blocked forbidden action does not execute adapter

Run: `npx vitest run apps/gateway/src/app.test.ts`
Expected: FAIL because execute route and fixture adapters do not exist.

- [ ] **Step 4: Implement fixture adapters and execute route**

Add GitHub fixture adapter for PR create/update/merge and Slack fixture adapter for approval notification. Execute only `allow`. Return HTTP 202 for `approval_required`. Return HTTP 403 for `block`.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run packages/core/src/approvals.test.ts apps/gateway/src/app.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add packages/core/src packages/integrations/src apps/gateway/src
git commit -m "feat: gate pr execution behind approvals"
```

## Task 7: Add Slack Approval Callback Boundary

**Files:**
- Create: `apps/gateway/src/slackSignature.ts`
- Create: `apps/gateway/src/slackSignature.test.ts`
- Modify: `apps/gateway/src/routes.ts`
- Modify: `apps/gateway/src/app.test.ts`

- [ ] **Step 1: Write failing signature tests**

Test valid Slack HMAC signature returns true and invalid signature returns false.

Run: `npx vitest run apps/gateway/src/slackSignature.test.ts`
Expected: FAIL because `slackSignature.ts` does not exist.

- [ ] **Step 2: Implement Slack signature verification**

Use `node:crypto`, Slack's `v0:${timestamp}:${body}` base string, and timing-safe comparison.

- [ ] **Step 3: Add approval callback tests**

Test signed approve and signed deny callbacks. Test invalid signature returns 401.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run apps/gateway/src/slackSignature.test.ts apps/gateway/src/app.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add apps/gateway/src
git commit -m "feat: handle slack code-change approvals"
```

## Task 8: Add SDK And MCP PR Risk APIs

**Files:**
- Create: `packages/sdk/src/index.test.ts`
- Modify: `packages/sdk/src/index.ts`
- Create: `packages/mcp/src/index.test.ts`
- Modify: `packages/mcp/src/index.ts`

- [ ] **Step 1: Write failing SDK tests**

Test that `authorize` posts to `/v1/actions/authorize` and `execute` posts to `/v1/actions/execute` with PR risk payloads.

Run: `npx vitest run packages/sdk/src/index.test.ts`
Expected: FAIL because `execute` does not exist.

- [ ] **Step 2: Implement SDK helper**

Extract a private `postJson` helper. Keep public methods tiny.

- [ ] **Step 3: Write failing MCP tests**

Test MCP tools for `agentgate.github.create_pull_request`, `agentgate.github.update_pull_request`, and `agentgate.github.merge_pull_request`. Test handler forwards through `client.execute`.

Run: `npx vitest run packages/mcp/src/index.test.ts`
Expected: FAIL because `callGuardedTool` does not exist.

- [ ] **Step 4: Implement MCP handler**

Resolve tool metadata by name and forward to the SDK. Unknown tool names throw `Error("Unknown AgentGate MCP tool.")`.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run packages/sdk/src/index.test.ts packages/mcp/src/index.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add packages/sdk/src packages/mcp/src
git commit -m "feat: expose pr risk gates to agents"
```

## Task 9: Add Read-Only Dashboard For Code-Change Decisions

**Files:**
- Create: `apps/dashboard/src/api.ts`
- Create: `apps/dashboard/src/App.test.tsx`
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `apps/dashboard/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install UI test dependencies**

Run: `npm install --save-dev @testing-library/react jsdom --workspace @agentgate/dashboard`
Expected: dashboard test dependencies are added.

- [ ] **Step 2: Write failing render test**

Test that a blocked code-change audit event renders its risk level, changed file, and reason.

Run: `npx vitest run apps/dashboard/src/App.test.tsx --environment jsdom`
Expected: FAIL because `App` does not accept initial audit events.

- [ ] **Step 3: Implement small dashboard data seam**

Add `DashboardAuditEvent` and render decision, risk level, changed files, and reason. Do not add charts.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run apps/dashboard/src/App.test.tsx --environment jsdom`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Commit:

```bash
git add apps/dashboard package-lock.json
git commit -m "feat: show code-change decisions"
```

## Task 10: Add Fixture Vertical Slice

**Files:**
- Create: `apps/gateway/src/codeChangeGate.e2e.test.ts`
- Modify: `apps/demo-agent/src/index.ts`
- Create: `apps/demo-agent/src/scenario.ts`
- Create: `apps/demo-agent/src/scenario.test.ts`

- [ ] **Step 1: Write failing vertical-slice test**

Test three fixture flows:
- docs-only PR create returns allow and executes
- auth file PR update returns approval_required and creates pending approval
- direct branch push returns block and does not execute

Run: `npx vitest run apps/gateway/src/codeChangeGate.e2e.test.ts`
Expected: FAIL until all seams are wired.

- [ ] **Step 2: Add demo scenario builder**

Create a pure scenario builder returning the three action requests. Keep network execution in `index.ts`.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run apps/gateway/src/codeChangeGate.e2e.test.ts apps/demo-agent/src/scenario.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Commit:

```bash
git add apps/gateway/src apps/demo-agent/src
git commit -m "test: cover code-change approval wedge"
```

## Post-MVP Follow-Up Order

1. GitHub App installation flow.
2. Real GitHub PR create/update/merge adapter.
3. Real Slack approval message formatting.
4. GitHub status check enforcement for merge blocking.
5. Dashboard polling from `/v1/audit`.
6. MCP stdio server using the stable guarded-tool handler.
7. Notion and internal API workflows after the repository-change wedge is solid.
