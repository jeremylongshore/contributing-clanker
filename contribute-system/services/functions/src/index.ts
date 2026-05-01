/**
 * GitHub Webhook Handler
 *
 * Cloud Function that processes GitHub webhooks to:
 * - Auto-create bounties when issues are labeled with "bounty"
 * - Link PRs to bounties when they reference issue numbers
 * - Update bounty status when PRs are merged
 */

import * as functions from '@google-cloud/functions-framework';
import { Firestore } from '@google-cloud/firestore';
import { Webhooks } from '@octokit/webhooks';
import { handleIssueEvent } from './handlers/issues';
import { handlePullRequestEvent } from './handlers/pullRequests';
import { handleIssueCommentEvent } from './handlers/comments';

// Initialize Firestore
const db = new Firestore();

// Initialize webhook handler with secret verification
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET || 'development-secret'
});

// Register event handlers
webhooks.on('issues', async ({ payload }) => {
  await handleIssueEvent(db, payload as any);
});

webhooks.on('pull_request', async ({ payload }) => {
  await handlePullRequestEvent(db, payload as any);
});

webhooks.on('issue_comment', async ({ payload }) => {
  await handleIssueCommentEvent(db, payload as any);
});

// Error handler
webhooks.onError((error) => {
  console.error('Webhook error:', error);
});

// Cloud Function HTTP handler
functions.http('githubWebhook', async (req, res) => {
  // Health check
  if (req.method === 'GET') {
    res.status(200).json({
      status: 'ok',
      service: 'bounty-system-github-webhook',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Only accept POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Get GitHub headers
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  if (!signature || !event) {
    res.status(400).json({ error: 'Missing required headers' });
    return;
  }

  console.log(`Received webhook: ${event} (${deliveryId})`);

  try {
    // Verify and process the webhook
    await webhooks.verifyAndReceive({
      id: deliveryId,
      name: event as any,
      signature,
      payload: JSON.stringify(req.body)
    });

    res.status(200).json({
      status: 'processed',
      event,
      deliveryId
    });
  } catch (error) {
    console.error('Webhook processing failed:', error);

    if ((error as Error).message.includes('signature')) {
      res.status(401).json({ error: 'Invalid signature' });
    } else {
      res.status(500).json({ error: 'Processing failed' });
    }
  }
});
