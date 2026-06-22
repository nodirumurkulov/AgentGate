# TDD

Every AgentGate behavior change starts with a failing test.

## Rules

- Write one test for one behavior.
- Run the focused test and confirm it fails for the expected reason.
- Implement the smallest code that makes the test pass.
- Run the focused test again.
- Refactor only after the test is green.
- Run `npm run check` before committing.

## Preferred Seams

- Core decisions: public functions in `@agentgate/core`.
- Gateway behavior: Fastify injection tests.
- SDK behavior: fake `fetch` at the transport boundary.
- MCP behavior: guarded tool handler tests.
- Dashboard behavior: visible rendered content.

## Mocking

Mock only external boundaries such as GitHub, Slack, HTTP transport, and local persistence. Do not mock the policy or risk engine when testing gateway behavior.

