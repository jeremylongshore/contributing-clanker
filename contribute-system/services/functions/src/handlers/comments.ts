/**
 * GitHub Issue Comment Event Handler
 *
 * Handles slash commands in issue comments:
 * - /bounty claim - Claim the bounty
 * - /bounty unclaim - Release the bounty
 * - /bounty status - Check bounty status
 * - /bounty help - Show available commands
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';
import { COLLECTIONS } from '@contribute/core';

interface CommentPayload {
  action: string;
  comment: {
    id: number;
    body: string;
    html_url: string;
    user: { login: string };
    created_at: string;
  };
  issue: {
    number: number;
    title: string;
    html_url: string;
    labels: Array<{ name: string }>;
    state: string;
  };
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  sender: { login: string };
}

interface BountyCommand {
  command: string;
  args: string[];
}

function parseCommand(body: string): BountyCommand | null {
  const lines = body.split('\n');

  for (const line of lines) {
    const match = line.trim().match(/^\/bounty\s+(\w+)(?:\s+(.*))?$/i);
    if (match) {
      return {
        command: match[1].toLowerCase(),
        args: match[2] ? match[2].split(/\s+/) : []
      };
    }
  }

  return null;
}

function generateBountyId(repo: string, issue: number): string {
  const repoSlug = repo.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `gh-${repoSlug}-${issue}`;
}

export async function handleIssueCommentEvent(db: Firestore, payload: CommentPayload): Promise<void> {
  const { action, comment, issue, repository } = payload;

  // Only process new comments
  if (action !== 'created') {
    return;
  }

  const command = parseCommand(comment.body);
  if (!command) {
    return;
  }

  const repo = repository.full_name;
  const bountyId = generateBountyId(repo, issue.number);
  const user = comment.user.login;

  console.log(`Bounty command: /${command.command} from ${user} on ${repo}#${issue.number}`);

  switch (command.command) {
    case 'claim':
      await handleClaimCommand(db, bountyId, user, issue.number, repo);
      break;

    case 'unclaim':
      await handleUnclaimCommand(db, bountyId, user);
      break;

    case 'status':
      await handleStatusCommand(db, bountyId);
      break;

    case 'value':
      if (command.args[0]) {
        await handleValueCommand(db, bountyId, command.args[0], user);
      }
      break;

    case 'help':
      console.log('Help command - would post comment with available commands');
      break;

    default:
      console.log(`Unknown command: ${command.command}`);
  }
}

async function handleClaimCommand(
  db: Firestore,
  bountyId: string,
  user: string,
  issueNumber: number,
  repo: string
): Promise<void> {
  const bountyRef = db.collection(COLLECTIONS.BOUNTIES).doc(bountyId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    console.log(`No bounty found for issue - cannot claim`);
    return;
  }

  const bounty = existing.data();

  if (bounty?.status !== 'open') {
    console.log(`Bounty is not open (status: ${bounty?.status}) - cannot claim`);
    return;
  }

  const now = new Date().toISOString();

  await bountyRef.update({
    status: 'claimed',
    claimedBy: user,
    claimedAt: now,
    updatedAt: now,
    timeline: FieldValue.arrayUnion({
      timestamp: now,
      message: `Claimed by ${user} via /bounty claim`,
      type: 'status_change'
    })
  });

  console.log(`Bounty ${bountyId} claimed by ${user}`);
}

async function handleUnclaimCommand(
  db: Firestore,
  bountyId: string,
  user: string
): Promise<void> {
  const bountyRef = db.collection(COLLECTIONS.BOUNTIES).doc(bountyId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    console.log(`No bounty found - cannot unclaim`);
    return;
  }

  const bounty = existing.data();

  if (bounty?.status !== 'claimed') {
    console.log(`Bounty is not claimed (status: ${bounty?.status}) - cannot unclaim`);
    return;
  }

  // Only allow the claimer or maintainers to unclaim
  if (bounty?.claimedBy !== user) {
    console.log(`Only ${bounty?.claimedBy} can unclaim this bounty`);
    return;
  }

  const now = new Date().toISOString();

  await bountyRef.update({
    status: 'open',
    claimedBy: FieldValue.delete(),
    claimedAt: FieldValue.delete(),
    updatedAt: now,
    timeline: FieldValue.arrayUnion({
      timestamp: now,
      message: `Unclaimed by ${user} via /bounty unclaim`,
      type: 'status_change'
    })
  });

  console.log(`Bounty ${bountyId} unclaimed by ${user}`);
}

async function handleStatusCommand(
  db: Firestore,
  bountyId: string
): Promise<void> {
  const bountyRef = db.collection(COLLECTIONS.BOUNTIES).doc(bountyId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    console.log(`No bounty found for this issue`);
    return;
  }

  const bounty = existing.data();
  console.log(`Bounty status: ${bounty?.status}, value: $${bounty?.value}`);

  // In production, would post a comment with status details
}

async function handleValueCommand(
  db: Firestore,
  bountyId: string,
  valueStr: string,
  user: string
): Promise<void> {
  // Parse value (e.g., "$100", "100", "100 USD")
  const match = valueStr.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (!match) {
    console.log(`Invalid value format: ${valueStr}`);
    return;
  }

  const value = parseFloat(match[1].replace(/,/g, ''));

  const bountyRef = db.collection(COLLECTIONS.BOUNTIES).doc(bountyId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    console.log(`No bounty found - cannot set value`);
    return;
  }

  const now = new Date().toISOString();

  await bountyRef.update({
    value,
    updatedAt: now,
    timeline: FieldValue.arrayUnion({
      timestamp: now,
      message: `Value set to $${value} by ${user}`,
      type: 'value_change'
    })
  });

  console.log(`Bounty ${bountyId} value set to $${value}`);
}
