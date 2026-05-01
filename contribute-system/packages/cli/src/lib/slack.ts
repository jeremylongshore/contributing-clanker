/**
 * Slack Notification Service
 *
 * Sends formatted messages to Slack via BountyBot webhook.
 * Supports bounty notifications, workflow gates, and payment alerts.
 *
 * STRICT MODE (default):
 * - If slack.enabled && slack.strict (default true):
 *   - Missing webhook or post error => command fails
 * - Use --no-slack to explicitly bypass
 */

import chalk from 'chalk';
import { getConfig, setConfig } from './config';

// Slack configuration interface
export interface SlackConfig {
  enabled: boolean;      // default true
  webhookUrl?: string;
  strict: boolean;       // default true - fail command if Slack fails
}

// Get Slack configuration with defaults
export async function getSlackConfig(): Promise<SlackConfig> {
  const config = await getConfig();
  return {
    enabled: config.slackEnabled !== false,
    webhookUrl: config.slackBountyBotWebhook || process.env.SLACK_BOUNTYBOT_WEBHOOK_URL,
    strict: config.slackStrict !== false  // default true
  };
}

// Message types for different notification scenarios
export type MessageType =
  | 'hunt_results'         // Hunt results summary
  | 'bounty_qualified'     // Step 1: Bounty passed scoring, show CONTRIBUTING.md
  | 'bounty_plan'          // Step 2: Implementation plan for review
  | 'bounty_draft'         // Step 3: Draft claim comment for review
  | 'bounty_submitted'     // Step 4: Claim posted to GitHub
  | 'bounty_claimed'       // Someone claimed a bounty
  | 'bounty_pr_opened'     // PR opened for bounty
  | 'bounty_merged'        // PR merged, bounty completed
  | 'competition_alert'    // New competing PR/claimant detected
  | 'payment_due'          // Payment due reminder
  | 'payment_received'     // Payment confirmed
  | 'payment_overdue';     // Payment past due

export interface SlackMessage {
  type: MessageType;
  bountyId?: string;
  repo?: string;
  title?: string;
  value?: number;
  grade?: string;
  score?: number;
  content?: string;          // Main message content
  contributingMd?: string;   // CONTRIBUTING.md content
  plan?: string;             // Implementation plan
  draft?: string;            // Draft claim comment
  url?: string;              // GitHub URL
  threadTs?: string;         // Thread timestamp for replies
  paymentMethod?: string;
  paymentTerms?: string;
  paymentDueDate?: string;
  paymentAmount?: number;
  paymentCurrency?: string;
}

export interface SlackResponse {
  ok: boolean;
  ts?: string;               // Message timestamp (for threading)
  error?: string;
}

/**
 * Send a notification to Slack via webhook
 *
 * @param message - The message to send
 * @param options - Options for this send
 * @param options.strict - Override strict mode for this call
 * @returns SlackResponse with ok status
 * @throws Error if strict mode enabled and send fails
 */
export async function sendSlackNotification(
  message: SlackMessage,
  options?: { strict?: boolean }
): Promise<SlackResponse> {
  const slackConfig = await getSlackConfig();

  // Determine if we should use strict mode
  const strict = options?.strict ?? slackConfig.strict;

  if (!slackConfig.enabled) {
    return { ok: true };  // Slack disabled, silently succeed
  }

  if (!slackConfig.webhookUrl) {
    const errorMsg = 'Slack webhook not configured';
    if (strict) {
      console.error(chalk.red(`✗ ${errorMsg}`));
      console.error(chalk.dim('Set with: bounty config set slackBountyBotWebhook <url>'));
      console.error(chalk.dim('Or use --no-slack to bypass'));
      throw new Error(errorMsg);
    } else {
      console.log(chalk.yellow('Slack webhook not configured'));
      console.log(chalk.dim('Set with: bounty config set slackBountyBotWebhook <url>'));
      return { ok: false, error: errorMsg };
    }
  }

  const payload = buildSlackPayload(message);

  try {
    const response = await fetch(slackConfig.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      if (strict) {
        console.error(chalk.red(`✗ Slack post failed: ${error}`));
        throw new Error(`Slack post failed: ${error}`);
      }
      return { ok: false, error };
    }

    // Webhooks return 'ok' on success, not JSON
    return { ok: true };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (strict && !errorMsg.includes('Slack')) {
      console.error(chalk.red(`✗ Slack error: ${errorMsg}`));
      throw error;
    }
    return { ok: false, error: errorMsg };
  }
}

/**
 * Check if Slack is properly configured for strict mode
 */
export async function checkSlackConfig(): Promise<{ ready: boolean; reason?: string }> {
  const config = await getSlackConfig();

  if (!config.enabled) {
    return { ready: true };  // Disabled is valid
  }

  if (!config.webhookUrl) {
    return {
      ready: false,
      reason: 'Slack webhook not configured. Set with: bounty config set slackBountyBotWebhook <url>'
    };
  }

  return { ready: true };
}

/**
 * Build Slack Block Kit payload for different message types
 */
function buildSlackPayload(message: SlackMessage): Record<string, unknown> {
  const blocks: unknown[] = [];

  switch (message.type) {
    case 'hunt_results':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎯 BOUNTY HUNT RESULTS', emoji: true }
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message.content || 'No results' }
        }
      );
      break;

    case 'bounty_qualified':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎯 BOUNTY QUALIFIED', emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Repo:*\n${message.repo}` },
            { type: 'mrkdwn', text: `*Value:*\n$${message.value || 0}` },
            { type: 'mrkdwn', text: `*Grade:*\n${message.grade} (${message.score}/100)` },
            { type: 'mrkdwn', text: `*Title:*\n${truncate(message.title || '', 50)}` }
          ]
        },
        { type: 'divider' }
      );

      if (message.contributingMd) {
        blocks.push(
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*📋 CONTRIBUTING.md Summary:*\n\`\`\`${truncate(message.contributingMd, 2000)}\`\`\``
            }
          }
        );
      }

      if (message.url) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `<${message.url}|View on GitHub>` }
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: '⚠️ Review guidelines above. Reply *plan* when ready to proceed.' }
        ]
      });
      break;

    case 'bounty_plan':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '📝 IMPLEMENTATION PLAN', emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Bounty:*\n${message.repo}#${message.bountyId}` },
            { type: 'mrkdwn', text: `*Title:*\n${truncate(message.title || '', 50)}` }
          ]
        },
        { type: 'divider' }
      );

      if (message.plan) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: message.plan }
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Reply *draft* to proceed, or *revise: <feedback>* to request changes.' }
        ]
      });
      break;

    case 'bounty_draft':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '✏️ CLAIM DRAFT', emoji: true }
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `Ready to post claim for *${message.repo}#${message.bountyId}*` }
        },
        { type: 'divider' }
      );

      if (message.draft) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `\`\`\`${truncate(message.draft, 2500)}\`\`\`` }
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Reply *submit* to post to GitHub, or *revise: <feedback>*.' }
        ]
      });
      break;

    case 'bounty_submitted':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '✅ BOUNTY CLAIMED', emoji: true }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Successfully claimed *${message.repo}#${message.bountyId}*\n<${message.url}|View on GitHub>`
          }
        }
      );

      // Payment info if available
      if (message.paymentMethod || message.paymentTerms) {
        blocks.push(
          { type: 'divider' },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Payment Method:*\n${message.paymentMethod || 'TBD'}` },
              { type: 'mrkdwn', text: `*Payment Terms:*\n${message.paymentTerms || 'On merge'}` }
            ]
          }
        );
      }

      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Start work with: `bounty work start <id>`' }
        ]
      });
      break;

    case 'competition_alert':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '⚠️ COMPETITION ALERT', emoji: true }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `New activity detected on *${message.repo}#${message.bountyId}*\n${message.content}`
          }
        }
      );

      if (message.url) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `<${message.url}|View on GitHub>` }
        });
      }
      break;

    case 'payment_due':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '💰 PAYMENT DUE', emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Bounty:*\n${message.repo}#${message.bountyId}` },
            { type: 'mrkdwn', text: `*Amount:*\n${formatCurrency(message.paymentAmount, message.paymentCurrency)}` },
            { type: 'mrkdwn', text: `*Due Date:*\n${message.paymentDueDate || 'N/A'}` },
            { type: 'mrkdwn', text: `*Method:*\n${message.paymentMethod || 'TBD'}` }
          ]
        }
      );

      if (message.url) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `<${message.url}|View bounty>` }
        });
      }
      break;

    case 'payment_received':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎉 PAYMENT RECEIVED', emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Bounty:*\n${message.repo}#${message.bountyId}` },
            { type: 'mrkdwn', text: `*Amount:*\n${formatCurrency(message.paymentAmount, message.paymentCurrency)}` },
            { type: 'mrkdwn', text: `*Title:*\n${truncate(message.title || '', 50)}` }
          ]
        }
      );
      break;

    case 'payment_overdue':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 PAYMENT OVERDUE', emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Bounty:*\n${message.repo}#${message.bountyId}` },
            { type: 'mrkdwn', text: `*Amount:*\n${formatCurrency(message.paymentAmount, message.paymentCurrency)}` },
            { type: 'mrkdwn', text: `*Due Date:*\n${message.paymentDueDate || 'N/A'}` },
            { type: 'mrkdwn', text: `*Days Overdue:*\n${calculateDaysOverdue(message.paymentDueDate)}` }
          ]
        }
      );

      if (message.url) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `<${message.url}|View bounty>` }
        });
      }
      break;

    case 'bounty_merged':
      blocks.push(
        {
          type: 'header',
          text: { type: 'plain_text', text: '🏆 BOUNTY COMPLETED', emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Bounty:*\n${message.repo}#${message.bountyId}` },
            { type: 'mrkdwn', text: `*Value:*\n$${message.value || 0}` },
            { type: 'mrkdwn', text: `*Title:*\n${truncate(message.title || '', 50)}` }
          ]
        }
      );

      if (message.paymentMethod || message.paymentTerms) {
        blocks.push(
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Next:* Payment via ${message.paymentMethod || 'TBD'} (${message.paymentTerms || 'as per agreement'})`
            }
          }
        );
      }

      if (message.url) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `<${message.url}|View PR>` }
        });
      }
      break;

    default:
      // Generic message
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: message.content || 'Notification' }
      });
  }

  // Add thread_ts if replying to a thread
  const payload: Record<string, unknown> = { blocks };
  if (message.threadTs) {
    payload.thread_ts = message.threadTs;
  }

  return payload;
}

/**
 * Format currency amount
 */
function formatCurrency(amount?: number, currency?: string): string {
  if (amount === undefined) return 'N/A';
  const curr = currency || 'USD';
  return `${amount.toLocaleString()} ${curr}`;
}

/**
 * Calculate days overdue from due date
 */
function calculateDaysOverdue(dueDate?: string): string {
  if (!dueDate) return 'N/A';
  const due = new Date(dueDate);
  const now = new Date();
  const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return days > 0 ? `${days} days` : 'Not overdue';
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Quick helpers for common notifications
 */
export async function notifyBountyQualified(
  bounty: {
    repo: string;
    title: string;
    value: number;
    grade: string;
    score: number;
    url: string;
  },
  contributingMd?: string
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'bounty_qualified',
    repo: bounty.repo,
    title: bounty.title,
    value: bounty.value,
    grade: bounty.grade,
    score: bounty.score,
    url: bounty.url,
    contributingMd
  });
}

export async function notifyPlan(
  bountyId: string,
  repo: string,
  title: string,
  plan: string,
  threadTs?: string
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'bounty_plan',
    bountyId,
    repo,
    title,
    plan,
    threadTs
  });
}

export async function notifyDraft(
  bountyId: string,
  repo: string,
  draft: string,
  threadTs?: string
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'bounty_draft',
    bountyId,
    repo,
    draft,
    threadTs
  });
}

export async function notifySubmitted(
  bountyId: string,
  repo: string,
  url: string,
  paymentInfo?: { method?: string; terms?: string }
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'bounty_submitted',
    bountyId,
    repo,
    url,
    paymentMethod: paymentInfo?.method,
    paymentTerms: paymentInfo?.terms
  });
}

export async function notifyCompetition(
  bountyId: string,
  repo: string,
  content: string,
  url?: string
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'competition_alert',
    bountyId,
    repo,
    content,
    url
  });
}

export async function notifyPaymentDue(
  bountyId: string,
  repo: string,
  amount: number,
  dueDate: string,
  method?: string,
  currency?: string
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'payment_due',
    bountyId,
    repo,
    paymentAmount: amount,
    paymentDueDate: dueDate,
    paymentMethod: method,
    paymentCurrency: currency
  });
}

export async function notifyPaymentReceived(
  bountyId: string,
  repo: string,
  title: string,
  amount: number,
  currency?: string
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'payment_received',
    bountyId,
    repo,
    title,
    paymentAmount: amount,
    paymentCurrency: currency
  });
}

export async function notifyPaymentOverdue(
  bountyId: string,
  repo: string,
  amount: number,
  dueDate: string,
  url?: string,
  currency?: string
): Promise<SlackResponse> {
  return sendSlackNotification({
    type: 'payment_overdue',
    bountyId,
    repo,
    paymentAmount: amount,
    paymentDueDate: dueDate,
    paymentCurrency: currency,
    url
  });
}
