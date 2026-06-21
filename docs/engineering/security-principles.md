# Security Principles

AgentGate is a security product first. Correctness and auditability matter more than convenience.

## Invariants

- Deny by default.
- Explicit block rules win over approval rules.
- Approval rules win over allow rules.
- High-risk code changes require approval before GitHub execution.
- Forbidden repository actions are blocked.
- GitHub adapters never execute before an AgentGate decision.
- Slack approval callbacks must be signed and verified.
- Audit events must redact sensitive values before storage.

## MVP Boundary

The MVP protects GitHub pull request create, update, and merge flows for AI coding agents. Notion and internal API workflows are post-MVP.

