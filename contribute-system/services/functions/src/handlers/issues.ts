/**
 * GitHub Issue Event Handler
 *
 * Handles:
 * - Issue labeled with "bounty" → create bounty
 * - Issue labeled with bounty value (e.g., "$100") → set value
 * - Issue unlabeled "bounty" → cancel bounty
 * - Issue closed → update bounty status
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';
import { COLLECTIONS } from '@contribute/core';

interface IssuePayload {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    labels: Array<{ name: string }>;
    state: string;
    user: { login: string };
  };
  label?: { name: string };
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  sender: { login: string };
}

// Patterns to extract bounty value from labels
const VALUE_PATTERNS = [
  /^\$(\d+(?:,\d{3})*(?:\.\d{2})?)$/,           // $100, $1,000, $100.00
  /^bounty[:\s]+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)$/i,  // bounty: $100
  /^(\d+(?:,\d{3})*)\s*(?:USD|usd)$/            // 100 USD
];

function extractValueFromLabel(label: string): number | null {
  for (const pattern of VALUE_PATTERNS) {
    const match = label.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

function hasBountyLabel(labels: Array<{ name: string }>): boolean {
  return labels.some(l =>
    l.name.toLowerCase() === 'bounty' ||
    l.name.toLowerCase().startsWith('bounty:') ||
    l.name.startsWith('$')
  );
}

function extractBountyValue(labels: Array<{ name: string }>): number {
  for (const label of labels) {
    const value = extractValueFromLabel(label.name);
    if (value !== null) {
      return value;
    }
  }
  // Default value if only "bounty" label present
  return 0;
}

function generateContributionId(repo: string, issue: number): string {
  const repoSlug = repo.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `gh-${repoSlug}-${issue}`;
}

export async function handleIssueEvent(db: Firestore, payload: IssuePayload): Promise<void> {
  const { action, issue, label, repository } = payload;
  const repo = repository.full_name;
  const contributionId = generateContributionId(repo, issue.number);

  console.log(`Issue event: ${action} on ${repo}#${issue.number}`);

  switch (action) {
    case 'labeled':
      await handleIssueLabeled(db, contributionId, issue, label, repo);
      break;

    case 'unlabeled':
      await handleIssueUnlabeled(db, contributionId, issue, label, repo);
      break;

    case 'closed':
      await handleIssueClosed(db, contributionId, issue, repo);
      break;

    case 'reopened':
      await handleIssueReopened(db, contributionId, issue, repo);
      break;

    case 'edited':
      await handleIssueEdited(db, contributionId, issue, repo);
      break;

    default:
      console.log(`Ignoring issue action: ${action}`);
  }
}

async function handleIssueLabeled(
  db: Firestore,
  contributionId: string,
  issue: IssuePayload['issue'],
  label: { name: string } | undefined,
  repo: string
): Promise<void> {
  if (!label) return;

  const isBountyLabel = label.name.toLowerCase() === 'bounty' ||
                        label.name.toLowerCase().startsWith('bounty:');
  const isValueLabel = extractValueFromLabel(label.name) !== null;

  if (!isBountyLabel && !isValueLabel) {
    return;
  }

  const bountyRef = db.collection(COLLECTIONS.CONTRIBUTIONS).doc(contributionId);
  const existing = await bountyRef.get();

  if (existing.exists) {
    // Update value if value label was added
    if (isValueLabel) {
      const value = extractValueFromLabel(label.name);
      if (value) {
        await bountyRef.update({
          value,
          updatedAt: new Date().toISOString(),
          timeline: FieldValue.arrayUnion({
            timestamp: new Date().toISOString(),
            message: `Value updated to $${value}`,
            type: 'value_change'
          })
        });
        console.log(`Updated contribution value: ${contributionId} → $${value}`);
      }
    }
    return;
  }

  // Create new bounty
  const now = new Date().toISOString();
  const value = extractBountyValue(issue.labels);

  const bounty = {
    id: contributionId,
    title: issue.title,
    description: issue.body?.slice(0, 2000) || '',
    value,
    currency: 'USD',
    status: 'open',
    source: 'github',
    repo,
    issue: issue.number,
    issueUrl: issue.html_url,
    domainId: 'default',
    labels: issue.labels.map(l => l.name),
    technologies: [],
    timeline: [{
      timestamp: now,
      message: 'Contribution created from GitHub label',
      type: 'status_change'
    }],
    createdAt: now,
    updatedAt: now
  };

  await bountyRef.set(bounty);
  console.log(`Created contribution: ${contributionId} ($${value})`);
}

async function handleIssueUnlabeled(
  db: Firestore,
  contributionId: string,
  issue: IssuePayload['issue'],
  label: { name: string } | undefined,
  repo: string
): Promise<void> {
  if (!label) return;

  const isBountyLabel = label.name.toLowerCase() === 'bounty';

  if (!isBountyLabel) {
    return;
  }

  // Check if any bounty-related labels remain
  const stillHasBounty = hasBountyLabel(issue.labels.filter(l => l.name !== label.name));

  if (stillHasBounty) {
    return;
  }

  const bountyRef = db.collection(COLLECTIONS.CONTRIBUTIONS).doc(contributionId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    return;
  }

  const bounty = existing.data();

  // Only cancel if still open
  if (bounty?.status === 'open') {
    await bountyRef.update({
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
      timeline: FieldValue.arrayUnion({
        timestamp: new Date().toISOString(),
        message: 'Contribution cancelled - label removed',
        type: 'status_change'
      })
    });
    console.log(`Cancelled contribution: ${contributionId}`);
  }
}

async function handleIssueClosed(
  db: Firestore,
  contributionId: string,
  issue: IssuePayload['issue'],
  repo: string
): Promise<void> {
  const bountyRef = db.collection(COLLECTIONS.CONTRIBUTIONS).doc(contributionId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    return;
  }

  const bounty = existing.data();

  // If issue closed and bounty has a linked PR, mark as completed
  if (bounty?.pr && ['in_progress', 'submitted', 'vetting'].includes(bounty?.status)) {
    await bountyRef.update({
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: FieldValue.arrayUnion({
        timestamp: new Date().toISOString(),
        message: 'Issue closed with linked PR - bounty completed',
        type: 'status_change'
      })
    });
    console.log(`Completed contribution: ${contributionId}`);
  }
}

async function handleIssueReopened(
  db: Firestore,
  contributionId: string,
  issue: IssuePayload['issue'],
  repo: string
): Promise<void> {
  const bountyRef = db.collection(COLLECTIONS.CONTRIBUTIONS).doc(contributionId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    return;
  }

  const bounty = existing.data();

  // If reopened and was cancelled, restore to open
  if (bounty?.status === 'cancelled' && hasBountyLabel(issue.labels)) {
    await bountyRef.update({
      status: 'open',
      updatedAt: new Date().toISOString(),
      timeline: FieldValue.arrayUnion({
        timestamp: new Date().toISOString(),
        message: 'Issue reopened - bounty restored',
        type: 'status_change'
      })
    });
    console.log(`Restored contribution: ${contributionId}`);
  }
}

async function handleIssueEdited(
  db: Firestore,
  contributionId: string,
  issue: IssuePayload['issue'],
  repo: string
): Promise<void> {
  const bountyRef = db.collection(COLLECTIONS.CONTRIBUTIONS).doc(contributionId);
  const existing = await bountyRef.get();

  if (!existing.exists) {
    return;
  }

  // Update title and description
  await bountyRef.update({
    title: issue.title,
    description: issue.body?.slice(0, 2000) || '',
    labels: issue.labels.map(l => l.name),
    updatedAt: new Date().toISOString()
  });
  console.log(`Updated contribution: ${contributionId}`);
}
