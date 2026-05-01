/**
 * Repo Rules Profile System
 *
 * Mandatory enforcement of repo contribution guidelines.
 * Fetches CONTRIBUTING.md, PR templates, CLA/DCO requirements.
 * Hard gates plan/draft/submit unless rules are acknowledged.
 */

import { createHash } from 'crypto';
import { getDb } from './db';
import { sendSlackNotification, type SlackMessage } from './slack';

// TTL for rules cache (7 days in milliseconds)
const RULES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RepoRules {
  // Core requirements
  cla: {
    required: boolean;
    url?: string;
    type?: 'cla' | 'dco';
    provider?: string;  // easycla, cla-assistant, etc.
    instructions?: string;
  };
  dco: {
    required: boolean;
    signoffRequired: boolean;
  };
  tests: {
    required: boolean;
    framework?: string;
    command?: string;
  };
  lint: {
    required: boolean;
    command?: string;
  };
  commits: {
    conventional: boolean;
    format?: string;
    examples?: string[];
  };
  pr: {
    template?: string;
    titleFormat?: string;
    bodyRequired?: boolean;
  };
  review: {
    required: boolean;
    minApprovals?: number;
    codeowners?: boolean;
  };
  // Metadata
  version: number;
  fetchedAt: string;
  contentHash: string;
}

export interface RepoProfile {
  repo: string;
  contributingMd: string | null;
  contentHash: string | null;
  etag: string | null;
  rulesJson: string | null;
  rulesSummary: string | null;
  rulesVersion: number;
  rulesAcknowledgedAt: string | null;
  rulesAcknowledgedHash: string | null;
  lastFetched: string | null;
}

/**
 * Ensure repo profile is fresh and rules are parsed
 * Returns the rules or throws if unable to fetch
 */
export async function ensureRepoRules(
  repo: string,
  token: string,
  options: { force?: boolean; skipSlack?: boolean } = {}
): Promise<{ rules: RepoRules; profile: RepoProfile; changed: boolean }> {
  const db = getDb();
  const now = new Date();

  // Get existing profile
  const existing = await db.execute({
    sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
    args: [repo]
  });

  let profile: RepoProfile | null = null;
  if (existing.rows.length > 0) {
    const row = existing.rows[0] as unknown as any;
    profile = {
      repo: row.repo,
      contributingMd: row.contributing_md,
      contentHash: row.content_hash,
      etag: row.etag,
      rulesJson: row.rules_json,
      rulesSummary: row.rules_summary,
      rulesVersion: row.rules_version || 1,
      rulesAcknowledgedAt: row.rules_acknowledged_at,
      rulesAcknowledgedHash: row.rules_acknowledged_hash,
      lastFetched: row.last_fetched
    };
  }

  // Check if refresh needed
  const needsRefresh = options.force ||
    !profile ||
    !profile.rulesJson ||
    !profile.lastFetched ||
    (now.getTime() - new Date(profile.lastFetched).getTime() > RULES_TTL_MS);

  let changed = false;

  if (needsRefresh) {
    const [owner, repoName] = repo.split('/');

    // Fetch all rule sources
    const contributing = await fetchContributingMd(owner, repoName, token, profile?.etag ?? null);
    const prTemplate = await fetchPRTemplate(owner, repoName, token);

    // Calculate content hash
    const content = (contributing.content || '') + (prTemplate || '');
    const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    // Check if content changed
    changed = profile?.contentHash !== null && profile?.contentHash !== contentHash;

    // Parse rules
    const rules = parseRules(contributing.content, prTemplate, contentHash);

    // Generate summary
    const summary = generateRulesSummary(rules);

    // Sync CLA status to cla_status table
    await syncCLAStatus(repo, rules);

    // Update database
    await db.execute({
      sql: `INSERT INTO repo_profiles
            (repo, contributing_md, content_hash, etag, rules_json, rules_summary, rules_version, last_fetched, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(repo) DO UPDATE SET
              contributing_md = ?,
              content_hash = ?,
              etag = ?,
              rules_json = ?,
              rules_summary = ?,
              rules_version = rules_version + 1,
              last_fetched = ?,
              updated_at = ?`,
      args: [
        repo, contributing.content, contentHash, contributing.etag,
        JSON.stringify(rules), summary, 1, now.toISOString(), now.toISOString(), now.toISOString(),
        contributing.content, contentHash, contributing.etag,
        JSON.stringify(rules), summary, now.toISOString(), now.toISOString()
      ]
    });

    // Log event
    await db.execute({
      sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
            VALUES ('repo', ?, ?, ?, ?)`,
      args: [repo, changed ? 'rules_changed' : 'rules_refreshed', now.toISOString(), JSON.stringify({
        contentHash,
        previousHash: profile?.contentHash,
        changed
      })]
    });

    // Post Slack alert if rules changed
    if (changed && !options.skipSlack) {
      await sendSlackNotification({
        type: 'competition_alert',
        content: `*REPO RULES CHANGED*\n\nRepo: *${repo}*\n\nContribution rules have been updated. Review and acknowledge before submitting.\n\nRun: \`bounty rules acknowledge ${repo}\``
      } as SlackMessage);
    }

    // Refetch profile
    const refreshed = await db.execute({
      sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
      args: [repo]
    });
    const row = refreshed.rows[0] as unknown as any;
    profile = {
      repo: row.repo,
      contributingMd: row.contributing_md,
      contentHash: row.content_hash,
      etag: row.etag,
      rulesJson: row.rules_json,
      rulesSummary: row.rules_summary,
      rulesVersion: row.rules_version || 1,
      rulesAcknowledgedAt: row.rules_acknowledged_at,
      rulesAcknowledgedHash: row.rules_acknowledged_hash,
      lastFetched: row.last_fetched
    };

    return {
      rules,
      profile,
      changed
    };
  }

  // Return cached rules
  return {
    rules: JSON.parse(profile!.rulesJson!),
    profile: profile!,
    changed: false
  };
}

/**
 * Check if rules need acknowledgement
 */
export function rulesNeedAcknowledgement(profile: RepoProfile): boolean {
  if (!profile.contentHash) return false;
  if (!profile.rulesAcknowledgedHash) return true;
  return profile.rulesAcknowledgedHash !== profile.contentHash;
}

/**
 * Acknowledge current rules
 */
export async function acknowledgeRules(repo: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: `UPDATE repo_profiles
          SET rules_acknowledged_at = ?, rules_acknowledged_hash = content_hash, updated_at = ?
          WHERE repo = ?`,
    args: [now, now, repo]
  });

  await db.execute({
    sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
          VALUES ('repo', ?, 'rules_acknowledged', ?, '{}')`,
    args: [repo, now]
  });
}

/**
 * Gate check: ensure rules exist and are acknowledged
 */
export async function checkRulesGate(
  repo: string,
  operation: 'plan' | 'draft' | 'submit'
): Promise<{ passed: boolean; reason?: string; profile?: RepoProfile }> {
  const db = getDb();

  const result = await db.execute({
    sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
    args: [repo]
  });

  if (result.rows.length === 0) {
    return {
      passed: false,
      reason: `No rules profile for ${repo}. Run: bounty qualify <issue-url>`
    };
  }

  const row = result.rows[0] as unknown as any;
  const profile: RepoProfile = {
    repo: row.repo,
    contributingMd: row.contributing_md,
    contentHash: row.content_hash,
    etag: row.etag,
    rulesJson: row.rules_json,
    rulesSummary: row.rules_summary,
    rulesVersion: row.rules_version || 1,
    rulesAcknowledgedAt: row.rules_acknowledged_at,
    rulesAcknowledgedHash: row.rules_acknowledged_hash,
    lastFetched: row.last_fetched
  };

  // Check if rules exist
  if (!profile.rulesJson) {
    return {
      passed: false,
      reason: `Rules not parsed for ${repo}. Run: bounty rules refresh ${repo}`,
      profile
    };
  }

  // Check TTL
  if (profile.lastFetched) {
    const age = Date.now() - new Date(profile.lastFetched).getTime();
    if (age > RULES_TTL_MS) {
      return {
        passed: false,
        reason: `Rules stale for ${repo} (last fetched: ${profile.lastFetched}). Run: bounty rules refresh ${repo}`,
        profile
      };
    }
  }

  // Check acknowledgement for submit
  if (operation === 'submit' && rulesNeedAcknowledgement(profile)) {
    return {
      passed: false,
      reason: `Rules changed for ${repo}. Review and run: bounty rules acknowledge ${repo}`,
      profile
    };
  }

  return { passed: true, profile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetching Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchContributingMd(
  owner: string,
  repo: string,
  token: string,
  etag: string | null
): Promise<{ content: string | null; etag: string | null }> {
  const paths = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md'];

  for (const path of paths) {
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3.raw',
        'User-Agent': 'bounty-system-cli/0.2.0'
      };

      if (etag) {
        headers['If-None-Match'] = etag;
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers }
      );

      if (response.status === 304) {
        // Not modified
        return { content: null, etag };
      }

      if (response.ok) {
        const content = await response.text();
        const newEtag = response.headers.get('etag');
        return { content, etag: newEtag };
      }
    } catch {
      continue;
    }
  }

  return { content: null, etag: null };
}

async function fetchPRTemplate(owner: string, repo: string, token: string): Promise<string | null> {
  const paths = [
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
    'docs/PULL_REQUEST_TEMPLATE.md'
  ];

  for (const path of paths) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'bounty-system-cli/0.2.0'
          }
        }
      );

      if (response.ok) {
        return await response.text();
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseRules(contributing: string | null, prTemplate: string | null, contentHash: string): RepoRules {
  const lower = (contributing || '').toLowerCase();
  const prLower = (prTemplate || '').toLowerCase();
  const content = contributing || '';

  const rules: RepoRules = {
    cla: { required: false },
    dco: { required: false, signoffRequired: false },
    tests: { required: false },
    lint: { required: false },
    commits: { conventional: false },
    pr: {},
    review: { required: false },
    version: 1,
    fetchedAt: new Date().toISOString(),
    contentHash
  };

  // CLA Detection (various patterns)
  if (lower.includes('cla') || lower.includes('contributor license agreement')) {
    rules.cla.required = true;
    rules.cla.type = 'cla';

    // Try to find CLA URL
    const claUrls = [
      content.match(/https?:\/\/[^\s)]+cla[^\s)]*/i),
      content.match(/https?:\/\/cla\.[^\s)]+/i),
      content.match(/https?:\/\/[^\s)]*contributor-?agreement[^\s)]*/i),
    ];
    for (const match of claUrls) {
      if (match) {
        rules.cla.url = match[0];
        break;
      }
    }

    // Detect CLA provider
    if (lower.includes('easycla')) {
      rules.cla.provider = 'easycla';
    } else if (lower.includes('cla-assistant')) {
      rules.cla.provider = 'cla-assistant';
    } else if (lower.includes('cla-bot') || lower.includes('clabot')) {
      rules.cla.provider = 'cla-bot';
    } else if (lower.includes('google cla')) {
      rules.cla.provider = 'google-cla';
    }

    // Try to extract instructions
    const claSection = content.match(/##?\s*(?:cla|contributor license)[^#]*/i);
    if (claSection) {
      rules.cla.instructions = claSection[0].slice(0, 500);
    }
  }

  // DCO Detection (separate from CLA)
  if (lower.includes('dco') || lower.includes('developer certificate of origin')) {
    rules.dco.required = true;
    // If DCO is required, CLA type should be DCO
    if (!rules.cla.required) {
      rules.cla.required = true;
      rules.cla.type = 'dco';
    }
  }

  // Sign-off detection
  if (lower.includes('sign-off') || lower.includes('signed-off-by') ||
      lower.includes('signoff') || lower.includes('git commit -s')) {
    rules.dco.signoffRequired = true;
    if (!rules.dco.required) {
      rules.dco.required = true;
    }
  }

  // Tests
  if (lower.includes('test')) {
    rules.tests.required = true;
    if (lower.includes('pytest')) {
      rules.tests.framework = 'pytest';
      rules.tests.command = 'pytest';
    } else if (lower.includes('jest')) {
      rules.tests.framework = 'jest';
      rules.tests.command = 'npm test';
    } else if (lower.includes('vitest')) {
      rules.tests.framework = 'vitest';
      rules.tests.command = 'npm test';
    } else if (lower.includes('cargo test')) {
      rules.tests.framework = 'cargo';
      rules.tests.command = 'cargo test';
    } else if (lower.includes('go test')) {
      rules.tests.framework = 'go';
      rules.tests.command = 'go test ./...';
    }
  }

  // Lint
  if (lower.includes('lint')) {
    rules.lint.required = true;
    if (lower.includes('eslint')) rules.lint.command = 'npm run lint';
    if (lower.includes('ruff')) rules.lint.command = 'ruff check .';
    if (lower.includes('prettier')) rules.lint.command = 'npm run format';
  }

  // Commits
  if (lower.includes('conventional commit') || (contributing || '').match(/feat\(|fix\(/)) {
    rules.commits.conventional = true;
    rules.commits.format = 'type(scope): description';
    rules.commits.examples = ['feat(api): add new endpoint', 'fix(auth): resolve token issue'];
  }

  // PR Template
  if (prTemplate) {
    rules.pr.template = prTemplate;
    rules.pr.bodyRequired = prTemplate.length > 100;
  }

  // Review
  if (lower.includes('review') || lower.includes('approval')) {
    rules.review.required = true;
    const approvalMatch = lower.match(/(\d+)\s*(?:approvals?|reviews?)/);
    if (approvalMatch) {
      rules.review.minApprovals = parseInt(approvalMatch[1], 10);
    }
  }
  if (lower.includes('codeowners')) {
    rules.review.codeowners = true;
  }

  return rules;
}

function generateRulesSummary(rules: RepoRules): string {
  const lines: string[] = [];

  if (rules.cla.required) {
    let claLine = `CLA: ${rules.cla.type?.toUpperCase() || 'Required'}`;
    if (rules.cla.provider) claLine += ` (${rules.cla.provider})`;
    if (rules.cla.url) claLine += ` - ${rules.cla.url}`;
    lines.push(claLine);
  }

  if (rules.dco.required || rules.dco.signoffRequired) {
    lines.push(`DCO: Sign-off required (git commit -s)`);
  }

  if (rules.tests.required) {
    lines.push(`Tests: ${rules.tests.framework || 'Required'}${rules.tests.command ? ` (${rules.tests.command})` : ''}`);
  }

  if (rules.lint.required) {
    lines.push(`Lint: Required${rules.lint.command ? ` (${rules.lint.command})` : ''}`);
  }

  if (rules.commits.conventional) {
    lines.push(`Commits: Conventional (${rules.commits.format || 'type: description'})`);
  }

  if (rules.review.required) {
    let reviewLine = 'Review: Required';
    if (rules.review.minApprovals) reviewLine += ` (${rules.review.minApprovals} approvals)`;
    if (rules.review.codeowners) reviewLine += ' + CODEOWNERS';
    lines.push(reviewLine);
  }

  if (rules.pr.bodyRequired) {
    lines.push('PR: Body required (template available)');
  }

  return lines.length > 0 ? lines.join('\n') : 'No specific rules detected';
}

/**
 * Sync CLA status from rules to cla_status table
 */
export async function syncCLAStatus(repo: string, rules: RepoRules): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if entry exists
  const existing = await db.execute({
    sql: 'SELECT * FROM cla_status WHERE repo = ?',
    args: [repo]
  });

  if (existing.rows.length === 0) {
    // Insert new
    await db.execute({
      sql: `INSERT INTO cla_status
            (repo, cla_required, cla_url, cla_type, cla_provider,
             dco_required, signoff_required, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        repo,
        rules.cla.required ? 1 : 0,
        rules.cla.url || null,
        rules.cla.type || null,
        rules.cla.provider || null,
        rules.dco.required ? 1 : 0,
        rules.dco.signoffRequired ? 1 : 0,
        now,
        now
      ]
    });
  } else {
    // Only update requirement fields, preserve completion status
    await db.execute({
      sql: `UPDATE cla_status
            SET cla_required = ?, cla_url = ?, cla_type = ?, cla_provider = ?,
                dco_required = ?, signoff_required = ?, updated_at = ?
            WHERE repo = ?`,
      args: [
        rules.cla.required ? 1 : 0,
        rules.cla.url || null,
        rules.cla.type || null,
        rules.cla.provider || null,
        rules.dco.required ? 1 : 0,
        rules.dco.signoffRequired ? 1 : 0,
        now,
        repo
      ]
    });
  }
}

/**
 * Get CLA status for a repo
 */
export async function getCLAStatus(repo: string): Promise<{
  claRequired: boolean;
  claCompleted: boolean;
  claUrl: string | null;
  dcoRequired: boolean;
  dcoEnabled: boolean;
}> {
  const db = getDb();

  const result = await db.execute({
    sql: 'SELECT * FROM cla_status WHERE repo = ?',
    args: [repo]
  });

  if (result.rows.length === 0) {
    return {
      claRequired: false,
      claCompleted: false,
      claUrl: null,
      dcoRequired: false,
      dcoEnabled: false
    };
  }

  const row = result.rows[0] as unknown as any;
  return {
    claRequired: !!row.cla_required,
    claCompleted: row.cla_status === 'completed',
    claUrl: row.cla_url,
    dcoRequired: !!row.dco_required,
    dcoEnabled: row.dco_status === 'enabled'
  };
}

/**
 * Format rules for Slack
 */
export function formatRulesForSlack(profile: RepoProfile): string {
  const lines: string[] = [];

  lines.push(`*REPO RULES: ${profile.repo}*`);
  lines.push('');

  if (profile.rulesSummary) {
    for (const line of profile.rulesSummary.split('\n')) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push('  No rules detected');
  }

  lines.push('');
  lines.push(`_Last updated: ${profile.lastFetched || 'unknown'}_`);

  return lines.join('\n');
}
