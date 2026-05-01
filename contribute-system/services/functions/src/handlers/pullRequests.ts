/**
 * GitHub Pull Request Event Handler
 *
 * Handles:
 * - PR opened with issue reference → link to bounty
 * - PR merged → update bounty status to completed
 * - PR closed without merge → update bounty status
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';
import { COLLECTIONS } from '@contribute/core';

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    merged: boolean;
    merged_at: string | null;
    user: { login: string };
    head: { sha: string };
    additions: number;
    deletions: number;
    changed_files: number;
  };
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  sender: { login: string };
}

// Patterns to extract issue references
const ISSUE_PATTERNS = [
  /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*#(\d+)/gi,
  /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(\w+\/\w+)#(\d+)/gi,
  /#(\d+)/g
];

function extractIssueNumbers(text: string): number[] {
  const issues = new Set<number>();

  for (const pattern of ISSUE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      // Last capture group is always the issue number
      const issueNum = parseInt(match[match.length - 1], 10);
      if (!isNaN(issueNum)) {
        issues.add(issueNum);
      }
    }
  }

  return Array.from(issues);
}

function generateContributionId(repo: string, issue: number): string {
  const repoSlug = repo.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `gh-${repoSlug}-${issue}`;
}

export async function handlePullRequestEvent(db: Firestore, payload: PullRequestPayload): Promise<void> {
  const { action, pull_request: pr, repository } = payload;
  const repo = repository.full_name;

  console.log(`PR event: ${action} on ${repo}#${pr.number}`);

  switch (action) {
    case 'opened':
    case 'edited':
      await handlePROpened(db, pr, repo);
      break;

    case 'closed':
      if (pr.merged) {
        await handlePRMerged(db, pr, repo);
      } else {
        await handlePRClosed(db, pr, repo);
      }
      break;

    case 'synchronize':
      // PR updated with new commits
      await handlePRUpdated(db, pr, repo);
      break;

    default:
      console.log(`Ignoring PR action: ${action}`);
  }
}

async function handlePROpened(
  db: Firestore,
  pr: PullRequestPayload['pull_request'],
  repo: string
): Promise<void> {
  // Extract issue references from title and body
  const searchText = `${pr.title} ${pr.body || ''}`;
  const issueNumbers = extractIssueNumbers(searchText);

  if (issueNumbers.length === 0) {
    console.log(`No issue references found in PR #${pr.number}`);
    return;
  }

  console.log(`PR #${pr.number} references issues: ${issueNumbers.join(', ')}`);

  for (const issueNum of issueNumbers) {
    const contributionId = generateContributionId(repo, issueNum);
    const bountyRef = db.collection(COLLECTIONS.CONTRIBUTIONS).doc(contributionId);
    const existing = await bountyRef.get();

    if (!existing.exists) {
      console.log(`No contribution found for issue #${issueNum}`);
      continue;
    }

    const bounty = existing.data();
    const now = new Date().toISOString();

    // Link PR to bounty
    await bountyRef.update({
      pr: pr.number,
      prUrl: pr.html_url,
      prAuthor: pr.user.login,
      status: bounty?.status === 'open' ? 'claimed' : bounty?.status,
      updatedAt: now,
      timeline: FieldValue.arrayUnion({
        timestamp: now,
        message: `PR #${pr.number} linked by ${pr.user.login}`,
        type: 'pr_linked'
      })
    });

    console.log(`Linked PR #${pr.number} to bounty ${contributionId}`);
  }
}

async function handlePRMerged(
  db: Firestore,
  pr: PullRequestPayload['pull_request'],
  repo: string
): Promise<void> {
  // Find bounties linked to this PR
  const bountiesRef = db.collection(COLLECTIONS.CONTRIBUTIONS);
  const snapshot = await bountiesRef
    .where('repo', '==', repo)
    .where('pr', '==', pr.number)
    .get();

  if (snapshot.empty) {
    console.log(`No bounties linked to merged PR #${pr.number}`);
    return;
  }

  const now = new Date().toISOString();
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const bounty = doc.data();

    // Update bounty to completed
    batch.update(doc.ref, {
      status: 'completed',
      completedAt: now,
      mergedAt: pr.merged_at,
      linesAdded: pr.additions,
      linesDeleted: pr.deletions,
      filesChanged: pr.changed_files,
      commitSha: pr.head.sha,
      updatedAt: now,
      timeline: FieldValue.arrayUnion({
        timestamp: now,
        message: `PR #${pr.number} merged - bounty completed`,
        type: 'status_change'
      })
    });

    console.log(`Marked bounty ${doc.id} as completed`);
  }

  await batch.commit();
}

async function handlePRClosed(
  db: Firestore,
  pr: PullRequestPayload['pull_request'],
  repo: string
): Promise<void> {
  // Find bounties linked to this PR
  const bountiesRef = db.collection(COLLECTIONS.CONTRIBUTIONS);
  const snapshot = await bountiesRef
    .where('repo', '==', repo)
    .where('pr', '==', pr.number)
    .get();

  if (snapshot.empty) {
    return;
  }

  const now = new Date().toISOString();
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const bounty = doc.data();

    // If PR closed without merge, revert to open if not already completed
    if (!['completed', 'paid'].includes(bounty?.status)) {
      batch.update(doc.ref, {
        status: 'open',
        pr: FieldValue.delete(),
        prUrl: FieldValue.delete(),
        prAuthor: FieldValue.delete(),
        updatedAt: now,
        timeline: FieldValue.arrayUnion({
          timestamp: now,
          message: `PR #${pr.number} closed without merge - bounty reopened`,
          type: 'status_change'
        })
      });

      console.log(`Reopened bounty ${doc.id} after PR closed`);
    }
  }

  await batch.commit();
}

async function handlePRUpdated(
  db: Firestore,
  pr: PullRequestPayload['pull_request'],
  repo: string
): Promise<void> {
  // Find bounties linked to this PR
  const bountiesRef = db.collection(COLLECTIONS.CONTRIBUTIONS);
  const snapshot = await bountiesRef
    .where('repo', '==', repo)
    .where('pr', '==', pr.number)
    .get();

  if (snapshot.empty) {
    return;
  }

  const now = new Date().toISOString();
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      linesAdded: pr.additions,
      linesDeleted: pr.deletions,
      filesChanged: pr.changed_files,
      commitSha: pr.head.sha,
      updatedAt: now,
      timeline: FieldValue.arrayUnion({
        timestamp: now,
        message: `PR #${pr.number} updated (+${pr.additions}/-${pr.deletions})`,
        type: 'pr_updated'
      })
    });
  }

  await batch.commit();
  console.log(`Updated stats for PR #${pr.number}`);
}
