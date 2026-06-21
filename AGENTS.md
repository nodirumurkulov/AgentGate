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

## Implementation Flow

1. Read the PRD and current tests.
2. Write one failing test for one behavior.
3. Run the focused test and confirm it fails for the expected reason.
4. Write the smallest implementation that passes.
5. Run the focused test.
6. Refactor only while tests stay green.
7. Run `npm run check`.
8. Commit the task.

