# Contribution and project scope

AgentGate is maintained by [Nodirjon Umurkulov](https://github.com/nodirumurkulov). Its repository history records work on the policy evaluator, change-risk rules, approval workflow, GitHub/Slack adapters, SDK/MCP helpers, audit storage and dashboard. Review [commits](https://github.com/nodirumurkulov/AgentGate/commits/main/) and [pull requests](https://github.com/nodirumurkulov/AgentGate/pulls?q=is%3Apr) for individual changes and their tests.

The project demonstrates the engineering of an explicit approval gateway: deciding when to allow, request review or block a proposed repository action, and recording the decision. It builds on Fastify, React, TypeScript and established GitHub/Slack interfaces. It does not claim a novel general alignment algorithm or a general solution to prompt injection.

## Development assistance and attribution

This documentation and self-contained fixture-demo update was prepared with OpenAI Codex at the maintainer's request. Codex inspected the implementation, added the demo and tests, repaired the clean-install lockfile mismatch, and ran the checks recorded in [validation](validation.md). This note does not imply that all project code was independently handwritten or establish the extent of assistance on earlier commits.

When presenting this project, distinguish project ownership, personal design/implementation decisions, tool assistance and results actually reproduced. Commit attribution helps reviewers locate changes; it is not by itself evidence of unaided authorship. The maintainer can explain specific decisions and contributions alongside those artifacts without attributing framework or generated work as original research.

## Current evidence

The strongest readily reproducible example is the [fixture demo](fixture-demo.md). The [security-boundary document](security-boundary.md) explains what is enforced and what remains an assumption or a gap, including caller-supplied evidence, independent-credential bypass, incomplete immutable approval binding and heuristic prompt-pattern detection. Live GitHub/Slack validation remains pending.
