# Code Design

AgentGate code should be easy to review under security pressure.

## Rules

- Keep functions small and named after the behavior they perform.
- Keep modules narrow. Split by responsibility, not by technical layer.
- Prefer explicit types and plain control flow.
- Avoid generic helpers until duplication appears in at least two real places.
- Prefer a readable 20-line function over a clever 5-line abstraction.
- Keep side effects outside `@agentgate/core`.
- Delete speculative code instead of preserving it for possible future use.

## Review Standard

A reviewer should be able to answer these questions quickly:

- What decision is this code making?
- What input controls that decision?
- What happens when the input is invalid?
- What test proves the behavior?

