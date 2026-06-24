# Live Integration Testing

This runbook verifies the opt-in real adapter path with a GitHub sandbox repository and Slack approval channel. Normal tests stay fixture-only and do not make network calls.

## Safety Rules

- Run live tests only against a sandbox repository.
- Do not commit `.env`, private keys, Slack tokens, signing secrets, screenshots with secrets, or raw API responses with headers.
- Keep the GitHub App installed only on the sandbox repository while testing.
- Use `.secrets/` for local private-key files. The directory is ignored by git.
- Leave `AGENTGATE_ADAPTER_MODE=fixture` for local development unless you are actively testing real adapters.

## GitHub App Setup

1. Create a GitHub App from the GitHub developer settings.
2. Give the app the minimum permissions for the smoke test:
   - Metadata: read-only
   - Pull requests: read and write
   - Contents: read-only
3. Install the app on the sandbox repository only.
4. Generate a private key and save it locally:

```bash
mkdir -p .secrets
cp ~/Downloads/agentgate-app.private-key.pem .secrets/github-app.private-key.pem
```

5. Note the app ID and installation ID. Use placeholders in docs and examples; never paste private-key material into tracked files.

## Slack App Setup

1. Create or reuse a Slack app for the test workspace.
2. Add bot scope `chat:write`.
3. Install the app to the workspace.
4. Invite the bot to the approval channel.
5. Enable interactivity and set the request URL to:

```text
https://<your-public-tunnel>/v1/slack/interactions
```

6. Keep the bot token and signing secret in your local shell or `.env` only.

## Gateway Environment

Export these values into the gateway process with your shell or secret manager, then start the gateway with real adapters only for the smoke test:

```bash
export AGENTGATE_ADAPTER_MODE=real
export AGENTGATE_PUBLIC_URL=https://<your-public-tunnel>
export GITHUB_APP_ID=<github-app-id>
export GITHUB_APP_PRIVATE_KEY_PATH=.secrets/github-app.private-key.pem
export GITHUB_INSTALLATION_ID=<github-installation-id>
export GITHUB_API_BASE_URL=https://api.github.com
export SLACK_BOT_TOKEN=<slack-bot-token>
export SLACK_SIGNING_SECRET=<slack-signing-secret>
export SLACK_APPROVAL_CHANNEL_ID=<slack-channel-id>

npm run dev:gateway
```

## Sandbox Repository Prep

The smoke script creates a draft pull request from an existing branch. Create the branch before running the script:

```bash
git clone https://github.com/<owner>/<sandbox-repo>.git /tmp/agentgate-sandbox
cd /tmp/agentgate-sandbox
git switch -c agentgate-smoke
printf "\nAgentGate smoke test\n" >> README.md
git add README.md
git commit -m "test: prepare agentgate smoke branch"
git push -u origin agentgate-smoke
```

## Run The Smoke Script

From the AgentGate repo:

```bash
AGENTGATE_ENABLE_LIVE_TESTS=true \
AGENTGATE_BASE_URL=http://localhost:4010 \
AGENTGATE_LIVE_REPOSITORY=<owner>/<sandbox-repo> \
AGENTGATE_LIVE_PR_BASE=main \
AGENTGATE_LIVE_PR_HEAD=agentgate-smoke \
AGENTGATE_LIVE_PR_TITLE="AgentGate smoke test" \
npm run smoke:live -w @agentgate/demo-agent
```

Expected output includes the authorization decision and the created draft PR URL. It must not include tokens, private keys, signing secrets, or request headers.

## Cleanup

1. Close the draft smoke PR.
2. Delete the `agentgate-smoke` branch from the sandbox repository.
3. Stop the public tunnel and gateway process.
4. Rotate any token that may have been exposed in terminal history or screenshots.
5. Return local development to fixture mode.
