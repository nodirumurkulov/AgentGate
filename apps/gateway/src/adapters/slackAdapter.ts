import type { ApprovalRecord } from "@agentgate/core";
import type { ApprovalNotificationAdapter, IntegrationResult } from "@agentgate/integrations";

interface SlackApprovalAdapterOptions {
  botToken: string;
  channelId: string;
  fetcher?: typeof fetch;
  publicUrl: string;
}

interface SlackPostMessageResponse {
  channel?: string;
  error?: string;
  ok?: boolean;
  ts?: string;
}

export class SlackApprovalAdapter implements ApprovalNotificationAdapter {
  integration = "slack";

  private readonly botToken: string;
  private readonly channelId: string;
  private readonly fetcher: typeof fetch;
  private readonly publicUrl: string;

  constructor(options: SlackApprovalAdapterOptions) {
    this.botToken = options.botToken;
    this.channelId = options.channelId;
    this.fetcher = options.fetcher ?? fetch;
    this.publicUrl = options.publicUrl.replace(/\/$/, "");
  }

  async notifyApprovalRequired(approval: ApprovalRecord): Promise<IntegrationResult> {
    const response = await this.fetcher("https://slack.com/api/chat.postMessage", {
      body: JSON.stringify(createApprovalMessage(this.channelId, this.publicUrl, approval)),
      headers: {
        authorization: `Bearer ${this.botToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json()) as SlackPostMessageResponse;

    if (!response.ok || payload.ok !== true || !payload.ts) {
      return {
        data: {
          error: payload.error ?? "slack_post_failed",
        },
        ok: false,
      };
    }

    return {
      data: {
        channel: payload.channel ?? this.channelId,
        messageTs: payload.ts,
      },
      externalRequestId: payload.ts,
      ok: true,
    };
  }
}

function createApprovalMessage(channel: string, publicUrl: string, approval: ApprovalRecord) {
  return {
    blocks: [
      {
        text: {
          text: `*${approval.action}* in \`${approval.repository}\` requires approval.`,
          type: "mrkdwn",
        },
        type: "section",
      },
      {
        fields: [
          {
            text: `*Risk level*\n${approval.riskLevel}`,
            type: "mrkdwn",
          },
          {
            text: `*Approval ID*\n${approval.id}`,
            type: "mrkdwn",
          },
        ],
        type: "section",
      },
      {
        text: {
          text: `*Reasons*\n${approval.riskReasons.join("\n")}`,
          type: "mrkdwn",
        },
        type: "section",
      },
      {
        elements: [
          {
            action_id: "agentgate.approve",
            style: "primary",
            text: {
              text: "Approve",
              type: "plain_text",
            },
            type: "button",
            value: approval.id,
          },
          {
            action_id: "agentgate.deny",
            style: "danger",
            text: {
              text: "Deny",
              type: "plain_text",
            },
            type: "button",
            value: approval.id,
          },
        ],
        type: "actions",
      },
      {
        text: {
          text: `Callback: ${publicUrl}/v1/slack/interactions`,
          type: "mrkdwn",
        },
        type: "context",
      },
    ],
    channel,
    text: `AgentGate approval required for ${approval.action} in ${approval.repository}.`,
  };
}
