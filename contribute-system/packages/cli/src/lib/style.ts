/**
 * Repo Style Profile System (Culture Sampler)
 *
 * Samples merged PR descriptions and maintainer comments to learn
 * repo-native writing style. Generates style guide for draft compliance.
 */

import { getDb } from './db';
import { sendSlackNotification, type SlackMessage } from './slack';

// TTL for style cache (30 days default)
const DEFAULT_STYLE_TTL_DAYS = 30;

export interface PRStyleSample {
  title: string;
  bodyExcerpt: string;
  url: string;
  mergedAt: string;
}

export interface CommentSample {
  author: string;
  excerpt: string;
  url: string;
}

export interface StyleCorpus {
  prs: PRStyleSample[];
  comments: CommentSample[];
  sampledAt: string;
}

export interface StyleGuide {
  prBodyStyle: {
    lengthTarget: 'short' | 'medium' | 'long';
    usesHeadings: 'none' | 'minimal' | 'standard';
    commonHeadings: string[];
    bulletDensity: 'low' | 'medium' | 'high';
    tone: 'terse' | 'neutral' | 'friendly' | 'formal';
    firstLinePattern?: string;
  };
  testingSection: {
    present: boolean;
    format?: string;
  };
  linkingBehavior: {
    issueRefStyle: 'Fixes' | 'Refs' | 'Closes' | 'mixed';
  };
  commitNaming: {
    conventional: boolean;
    format?: string;
  };
  redFlags: string[];
  examples: string[];
  version: number;
  generatedAt: string;
}

export interface StyleProfile {
  repo: string;
  styleSampledAt: string | null;
  styleTtlDays: number;
  styleGuideJson: string | null;
  styleGuideSummary: string | null;
  styleCorpusJson: string | null;
  styleVersion: number;
}

/**
 * Ensure style profile is fresh
 */
export async function ensureRepoStyle(
  repo: string,
  token: string,
  options: { force?: boolean; limitPRs?: number; limitComments?: number; skipSlack?: boolean } = {}
): Promise<{ guide: StyleGuide; profile: StyleProfile; changed: boolean }> {
  const db = getDb();
  const now = new Date();
  const limitPRs = options.limitPRs || 20;
  const limitComments = options.limitComments || 30;

  // Get existing profile
  const existing = await db.execute({
    sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
    args: [repo]
  });

  let profile: StyleProfile | null = null;
  if (existing.rows.length > 0) {
    const row = existing.rows[0] as unknown as any;
    profile = {
      repo: row.repo,
      styleSampledAt: row.style_sampled_at,
      styleTtlDays: row.style_ttl_days || DEFAULT_STYLE_TTL_DAYS,
      styleGuideJson: row.style_guide_json,
      styleGuideSummary: row.style_guide_summary,
      styleCorpusJson: row.style_corpus_json,
      styleVersion: row.style_version || 1
    };
  }

  // Check if refresh needed
  const ttlMs = (profile?.styleTtlDays || DEFAULT_STYLE_TTL_DAYS) * 24 * 60 * 60 * 1000;
  const needsRefresh = options.force ||
    !profile ||
    !profile.styleGuideJson ||
    !profile.styleSampledAt ||
    (now.getTime() - new Date(profile.styleSampledAt).getTime() > ttlMs);

  if (!needsRefresh && profile?.styleGuideJson) {
    return {
      guide: JSON.parse(profile.styleGuideJson),
      profile,
      changed: false
    };
  }

  const [owner, repoName] = repo.split('/');

  // Sample merged PRs
  const prs = await sampleMergedPRs(owner, repoName, token, limitPRs);

  // Sample maintainer comments
  const comments = await sampleMaintainerComments(owner, repoName, token, limitComments);

  // Build corpus
  const corpus: StyleCorpus = {
    prs,
    comments,
    sampledAt: now.toISOString()
  };

  // Generate style guide
  const guide = generateStyleGuide(corpus);

  // Generate summary
  const summary = generateStyleSummary(guide);

  // Check if changed
  const previousVersion = profile?.styleVersion || 0;
  const changed = profile?.styleGuideJson !== null &&
    JSON.stringify(guide) !== profile.styleGuideJson;

  // Update database
  await db.execute({
    sql: `UPDATE repo_profiles SET
            style_sampled_at = ?,
            style_guide_json = ?,
            style_guide_summary = ?,
            style_corpus_json = ?,
            style_version = style_version + 1,
            updated_at = ?
          WHERE repo = ?`,
    args: [
      now.toISOString(),
      JSON.stringify(guide),
      summary,
      JSON.stringify(corpus),
      now.toISOString(),
      repo
    ]
  });

  // If no row updated, insert
  const updateResult = await db.execute({
    sql: 'SELECT changes() as c'
  });
  if ((updateResult.rows[0] as unknown as { c: number }).c === 0) {
    await db.execute({
      sql: `INSERT INTO repo_profiles
            (repo, style_sampled_at, style_guide_json, style_guide_summary, style_corpus_json, style_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [repo, now.toISOString(), JSON.stringify(guide), summary, JSON.stringify(corpus), now.toISOString(), now.toISOString()]
    });
  }

  // Log event
  await db.execute({
    sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
          VALUES ('repo', ?, 'style_sampled', ?, ?)`,
    args: [repo, now.toISOString(), JSON.stringify({
      prsSampled: prs.length,
      commentsSampled: comments.length,
      changed
    })]
  });

  // Post Slack if changed
  if (changed && !options.skipSlack) {
    await sendSlackNotification({
      type: 'bounty_qualified',
      content: `*STYLE GUIDE UPDATED: ${repo}*\n\n${summary}\n\n_Sampled ${prs.length} PRs, ${comments.length} comments_`
    } as SlackMessage);
  }

  // Refetch profile
  const refreshed = await db.execute({
    sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
    args: [repo]
  });
  const row = refreshed.rows[0] as unknown as any;

  return {
    guide,
    profile: {
      repo: row.repo,
      styleSampledAt: row.style_sampled_at,
      styleTtlDays: row.style_ttl_days || DEFAULT_STYLE_TTL_DAYS,
      styleGuideJson: row.style_guide_json,
      styleGuideSummary: row.style_guide_summary,
      styleCorpusJson: row.style_corpus_json,
      styleVersion: row.style_version || 1
    },
    changed
  };
}

/**
 * Check style gate
 */
export async function checkStyleGate(repo: string): Promise<{ passed: boolean; reason?: string }> {
  const db = getDb();

  const result = await db.execute({
    sql: 'SELECT style_guide_json, style_sampled_at, style_ttl_days FROM repo_profiles WHERE repo = ?',
    args: [repo]
  });

  if (result.rows.length === 0) {
    return { passed: false, reason: `No style profile for ${repo}. Run: bounty style fetch ${repo}` };
  }

  const row = result.rows[0] as unknown as any;

  if (!row.style_guide_json) {
    return { passed: false, reason: `Style guide not generated for ${repo}. Run: bounty style fetch ${repo}` };
  }

  // Check TTL
  if (row.style_sampled_at) {
    const ttlMs = (row.style_ttl_days || DEFAULT_STYLE_TTL_DAYS) * 24 * 60 * 60 * 1000;
    const age = Date.now() - new Date(row.style_sampled_at).getTime();
    if (age > ttlMs) {
      return { passed: false, reason: `Style guide stale for ${repo}. Run: bounty style fetch ${repo}` };
    }
  }

  return { passed: true };
}

/**
 * Lint content against style guide
 */
export function lintAgainstStyle(content: string, guide: StyleGuide): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check length
  const wordCount = content.split(/\s+/).length;
  if (guide.prBodyStyle.lengthTarget === 'short' && wordCount > 150) {
    issues.push(`Too long: ${wordCount} words (target: short, <150)`);
  } else if (guide.prBodyStyle.lengthTarget === 'medium' && wordCount > 400) {
    issues.push(`Too long: ${wordCount} words (target: medium, <400)`);
  }

  // Check testing section
  if (guide.testingSection.present) {
    const hasTestSection = /test/i.test(content) &&
      (content.includes('##') || content.toLowerCase().includes('testing'));
    if (!hasTestSection) {
      issues.push('Missing testing section (expected for this repo)');
    }
  }

  // Check bullet density
  const bulletCount = (content.match(/^[\s]*[-*•]/gm) || []).length;
  if (guide.prBodyStyle.bulletDensity === 'low' && bulletCount > 5) {
    issues.push(`Too many bullets: ${bulletCount} (repo prefers low density)`);
  }

  // Check headings
  const headingCount = (content.match(/^#+\s/gm) || []).length;
  if (guide.prBodyStyle.usesHeadings === 'none' && headingCount > 0) {
    issues.push(`Has ${headingCount} headings (repo doesn't use headings)`);
  }

  // Check for AI red flags
  const aiPatterns = [
    /i'd be happy to/i,
    /i'd like to help/i,
    /let me know if you have/i,
    /hope this helps/i,
    /feel free to/i,
    /please don't hesitate/i
  ];

  for (const pattern of aiPatterns) {
    if (pattern.test(content)) {
      issues.push(`AI-ish pattern detected: "${pattern.source}"`);
    }
  }

  return { passed: issues.length === 0, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sampling Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function sampleMergedPRs(
  owner: string,
  repo: string,
  token: string,
  limit: number
): Promise<PRStyleSample[]> {
  const samples: PRStyleSample[] = [];

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'bounty-system-cli/0.2.0'
        }
      }
    );

    if (!response.ok) return samples;

    const prs = await response.json();

    for (const pr of prs) {
      if (!pr.merged_at) continue;

      samples.push({
        title: pr.title,
        bodyExcerpt: truncate(pr.body || '', 1500),
        url: pr.html_url,
        mergedAt: pr.merged_at
      });

      if (samples.length >= limit) break;
    }
  } catch {
    // Ignore errors
  }

  return samples;
}

async function sampleMaintainerComments(
  owner: string,
  repo: string,
  token: string,
  limit: number
): Promise<CommentSample[]> {
  const samples: CommentSample[] = [];

  try {
    // Get recent issue comments
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/comments?sort=updated&direction=desc&per_page=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'bounty-system-cli/0.2.0'
        }
      }
    );

    if (!response.ok) return samples;

    const comments = await response.json();

    for (const comment of comments) {
      // Filter for likely maintainers (MEMBER or OWNER association)
      if (comment.author_association === 'MEMBER' ||
          comment.author_association === 'OWNER' ||
          comment.author_association === 'COLLABORATOR') {
        samples.push({
          author: comment.user?.login || 'unknown',
          excerpt: truncate(comment.body || '', 500),
          url: comment.html_url
        });
      }

      if (samples.length >= limit) break;
    }
  } catch {
    // Ignore errors
  }

  return samples;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style Guide Generation
// ─────────────────────────────────────────────────────────────────────────────

function generateStyleGuide(corpus: StyleCorpus): StyleGuide {
  const guide: StyleGuide = {
    prBodyStyle: {
      lengthTarget: 'medium',
      usesHeadings: 'minimal',
      commonHeadings: [],
      bulletDensity: 'medium',
      tone: 'neutral'
    },
    testingSection: { present: false },
    linkingBehavior: { issueRefStyle: 'mixed' },
    commitNaming: { conventional: false },
    redFlags: [],
    examples: [],
    version: 1,
    generatedAt: new Date().toISOString()
  };

  if (corpus.prs.length === 0) return guide;

  // Analyze PR body lengths
  const lengths = corpus.prs.map(pr => pr.bodyExcerpt.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  if (avgLength < 200) guide.prBodyStyle.lengthTarget = 'short';
  else if (avgLength > 800) guide.prBodyStyle.lengthTarget = 'long';

  // Check for headings
  const headingCount = corpus.prs.filter(pr =>
    /^#+\s/m.test(pr.bodyExcerpt)
  ).length;
  const headingRatio = headingCount / corpus.prs.length;

  if (headingRatio < 0.2) guide.prBodyStyle.usesHeadings = 'none';
  else if (headingRatio > 0.7) guide.prBodyStyle.usesHeadings = 'standard';

  // Extract common headings
  const headings: Record<string, number> = {};
  for (const pr of corpus.prs) {
    const matches = pr.bodyExcerpt.match(/^#+\s*(.+)$/gm) || [];
    for (const match of matches) {
      const heading = match.replace(/^#+\s*/, '').toLowerCase().trim();
      headings[heading] = (headings[heading] || 0) + 1;
    }
  }
  guide.prBodyStyle.commonHeadings = Object.entries(headings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([h]) => h);

  // Check for bullet density
  const bulletCounts = corpus.prs.map(pr =>
    (pr.bodyExcerpt.match(/^[\s]*[-*•]/gm) || []).length
  );
  const avgBullets = bulletCounts.reduce((a, b) => a + b, 0) / bulletCounts.length;
  if (avgBullets < 2) guide.prBodyStyle.bulletDensity = 'low';
  else if (avgBullets > 8) guide.prBodyStyle.bulletDensity = 'high';

  // Check for testing section
  const testingSectionCount = corpus.prs.filter(pr =>
    /test/i.test(pr.bodyExcerpt) &&
    (/^#+.*test/im.test(pr.bodyExcerpt) || /testing:/i.test(pr.bodyExcerpt))
  ).length;
  guide.testingSection.present = testingSectionCount / corpus.prs.length > 0.3;

  // Check for conventional commits
  const conventionalCount = corpus.prs.filter(pr =>
    /^(feat|fix|docs|chore|refactor|test|style|perf)\(?.*\)?:/i.test(pr.title)
  ).length;
  guide.commitNaming.conventional = conventionalCount / corpus.prs.length > 0.5;
  if (guide.commitNaming.conventional) {
    guide.commitNaming.format = 'type(scope): description';
  }

  // Check issue ref style
  const fixesCount = corpus.prs.filter(pr => /fixes\s+#\d+/i.test(pr.bodyExcerpt)).length;
  const closesCount = corpus.prs.filter(pr => /closes\s+#\d+/i.test(pr.bodyExcerpt)).length;
  const refsCount = corpus.prs.filter(pr => /refs?\s+#\d+/i.test(pr.bodyExcerpt)).length;

  if (fixesCount > closesCount && fixesCount > refsCount) {
    guide.linkingBehavior.issueRefStyle = 'Fixes';
  } else if (closesCount > fixesCount && closesCount > refsCount) {
    guide.linkingBehavior.issueRefStyle = 'Closes';
  } else if (refsCount > fixesCount && refsCount > closesCount) {
    guide.linkingBehavior.issueRefStyle = 'Refs';
  }

  // Analyze tone from comments
  if (corpus.comments.length > 0) {
    const terseIndicators = corpus.comments.filter(c => c.excerpt.length < 100).length;
    const friendlyIndicators = corpus.comments.filter(c =>
      /thanks|awesome|great|lgtm/i.test(c.excerpt)
    ).length;

    if (terseIndicators / corpus.comments.length > 0.6) {
      guide.prBodyStyle.tone = 'terse';
    } else if (friendlyIndicators / corpus.comments.length > 0.4) {
      guide.prBodyStyle.tone = 'friendly';
    }
  }

  // Red flags to avoid
  guide.redFlags = [
    'avoid lengthy introductions',
    'no AI-generated templates',
    'keep explanations concise'
  ];

  // Extract examples (short excerpts)
  guide.examples = corpus.prs
    .slice(0, 3)
    .map(pr => truncate(pr.title + ': ' + pr.bodyExcerpt.split('\n')[0], 100));

  return guide;
}

function generateStyleSummary(guide: StyleGuide): string {
  const lines: string[] = [];

  lines.push(`Tone: ${guide.prBodyStyle.tone} | Length: ${guide.prBodyStyle.lengthTarget}`);

  if (guide.commitNaming.conventional) {
    lines.push(`Commits: Conventional (${guide.commitNaming.format})`);
  }

  if (guide.prBodyStyle.usesHeadings !== 'none' && guide.prBodyStyle.commonHeadings.length > 0) {
    lines.push(`Common headings: ${guide.prBodyStyle.commonHeadings.slice(0, 3).join(', ')}`);
  }

  if (guide.testingSection.present) {
    lines.push('Testing section: Expected');
  }

  lines.push(`Issue refs: ${guide.linkingBehavior.issueRefStyle} #123`);

  lines.push('');
  lines.push('Do:');
  lines.push('  - Match repo length/format');
  lines.push('  - Use their heading style');
  lines.push('');
  lines.push("Don't:");
  for (const flag of guide.redFlags.slice(0, 2)) {
    lines.push(`  - ${flag}`);
  }

  return lines.join('\n');
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

/**
 * Format style guide for Slack
 */
export function formatStyleForSlack(repo: string, summary: string | null, version: number): string {
  const lines: string[] = [];

  lines.push(`*STYLE CARD: ${repo}*`);
  lines.push(`_v${version}_`);
  lines.push('');

  if (summary) {
    for (const line of summary.split('\n')) {
      lines.push(line);
    }
  } else {
    lines.push('No style guide available');
  }

  return lines.join('\n');
}
