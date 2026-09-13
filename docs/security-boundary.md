# Security boundary and current limits

AgentGate demonstrates policy enforcement for actions routed through its gateway. It is not yet a hardened boundary for a hostile agent. This document separates checks implemented in code from deployment assumptions and unfinished controls.

## What the gateway enforces

The embedded policy denies unmatched requests and explicitly blocks direct branch pushes, secret updates and check bypasses. Medium/high-risk PR create, metadata update and merge requests require approval. Low-risk create/update requests may proceed; low-risk merges currently have no allow rule and default to block.

The execute route returns before the GitHub adapter for blocked and pending requests. Approval callbacks look up a stored request and validate Slack signatures, callback tokens, token expiry and pending state. A callback supplies a decision, not a replacement GitHub action. A denial does not execute the stored action. These properties have fixture/mock test coverage; see [validation](validation.md).

The rule evaluator checks the supplied `agentId`, not an authenticated principal. The embedded policy matches risk labels, not a repository allowlist. A valid repository path is a syntax check, not permission to access that repository.

## Bypass prevention requires deployment controls

The SDK and MCP helpers do not revoke an agent's other tools or credentials. To make gateway mediation meaningful, an operator would need to:

- Keep GitHub App keys, tokens and Slack signing secrets outside the agent's environment and filesystem access.
- Restrict the agent's available write tools and network paths to the intended gateway interface.
- Install the GitHub App only on intended repositories and enforce GitHub branch/ruleset protections, required checks and appropriately restricted bypass permissions.
- Authenticate and authorise callers and reviewers at a trusted boundary, with repository scope and request validation.
- Protect gateway configuration, code and stored approval/audit data from the agent.

Those are deployment requirements, not controls automatically installed by this repository. The HTTP API has no application-level caller authentication, no full request schema validation, and permissive CORS. The development server listens on `0.0.0.0`. Keep it isolated; a public tunnel must not expose the unrestricted action/audit routes. Signed callbacks authenticate the Slack application but there is no configured per-repository reviewer allowlist in the gateway.

## How an approval is bound today

`createPendingApproval` stores `actionRequest`, including action, agent, integration, risk target, repository, changed/deleted file lists and any supplied GitHub parameters. The callback resolves this stored action by approval ID. It does not accept a new action payload. Tokens are hashed in storage and excluded from public approval responses; newly created tokens expire after 15 minutes by default.

This is **binding to a stored request**, not full proof that the executed code is the code the reviewer examined:

- The gateway trusts caller-supplied file lists and diff text. It does not fetch the actual diff, resolve refs, or verify that the evidence belongs to the requested repository/PR. `diffText` is used for classification and audit but is not retained in the stored execution request.
- PR creation uses branch/ref inputs that can move. PR metadata updates are not pinned to an immutable content digest. There is no general revalidation of code evidence immediately before execution.
- The real merge adapter is narrower: it requires `github.expectedHeadSha`, checks for the configured passing status at that SHA, then includes the SHA in the GitHub merge request. This is a useful stale-head constraint, but it does not fix untrusted evidence or authenticate the issuer of the status context.
- Create/update status publication uses the supplied `github.headSha`. It does not independently verify that SHA against the PR, files or diff. A success status here records that the requested action succeeded after authorisation; it is not a verified code-safety attestation.
- Already-decided callbacks are rejected sequentially, but the state transition and external execution are not atomic. Concurrent callbacks are not guaranteed to execute only once. An approval may remain approved after an adapter failure, so retries and recovery need an explicit design.

To claim complete binding, a future implementation must obtain authoritative repository evidence, bind approval to immutable repository/PR/base/head/diff and policy identity, revalidate before execution, verify the trusted status source, and make approval consumption atomic. These are not implemented by this documentation/demo update.

## Prompt-pattern and risk heuristics

[`detectPromptInjection`](../packages/core/src/promptInjection.ts) has four regular-expression patterns for policy-bypass wording, tool redirection, credential words and unsafe-autonomy wording. It is exported from the core package but not called by the gateway's authorisation path. The risk classifier separately checks diff text for credential-related words.

These rules can flag benign discussion of passwords or tools and miss paraphrases, obfuscation, indirect attacks or harmful intent without matching words. There is no measured general prompt-injection detection rate, robust semantic classifier or demonstrated general defence. The project's useful demonstration is explicit action policy and approval handling, not solving prompt injection.

File-path risk rules are also heuristics, not proof of code safety. A low-risk label means the supplied evidence matched the implemented rules.

## Audit guarantees

Audit events are hash-chained with recursive sensitive-key redaction. Key-based redaction is not a general secret scanner: free-text diffs or text under unrecognised keys may still contain sensitive material. Avoid submitting real secrets as evidence.

A hash chain supports consistency checks over the retained events, but it has no external anchor and is not tamper-proof against someone who can rewrite the whole store and recompute the chain. Memory storage is ephemeral; JSON-file storage is not a transactional, multi-worker database. Protect access and permissions accordingly.
