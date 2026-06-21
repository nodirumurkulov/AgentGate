# SDLC

AgentGate work moves from product intent to test-first implementation.

## Flow

1. Start from the PRD or an approved implementation plan.
2. Identify the smallest behavior that delivers value.
3. Write the failing test at the highest useful seam.
4. Implement the minimal code to pass.
5. Refactor only while tests remain green.
6. Run focused tests, then `npm run check`.
7. Commit the task with a clear message.
8. Open a pull request against `main`.

## Change Control

- Update the PRD or add an ADR before changing product direction.
- Keep pull requests small enough to review in one sitting.
- Do not mix behavior changes with unrelated refactors.
- Do not merge without test evidence and security review notes.

