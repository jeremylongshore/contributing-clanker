/**
 * Rep Command - Reputation PR Mode
 *
 * Track and manage reputation-building PRs (non-paid contributions)
 * that build credibility for future bounty work.
 *
 * Credibility factors:
 * - Repo visibility (stars/activity)
 * - Maintainer score
 * - Impact type (security > perf > tests > docs)
 * - Merge velocity
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const repCommand = new Command('rep')
  .description('Manage reputation PRs (non-paid contributions)');

interface RepOpportunity {
  repo: string;
  url: string;
  title: string;
  credibilityScore: number;
  impactType: string;
  reasons: string[];
}

/**
 * Hunt for reputation opportunities
 */
repCommand
  .command('hunt')
  .description('Search for reputation-building opportunities')
  .option('-t, --tech <tech>', 'Filter by technology')
  .option('-m, --min-credibility <n>', 'Minimum credibility score', '50')
  .option('-l, --limit <n>', 'Maximum results', '10')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (options) => {
    const spinner = ora('Hunting reputation opportunities...').start();

    try {
      const db = getDb();
      const minCred = parseInt(options.minCredibility);
      const limit = parseInt(options.limit);

      // Query issues_index for non-paid opportunities
      let sql = `
        SELECT i.*, r.maintainer_score_cached, r.credibility_tier
        FROM issues_index i
        LEFT JOIN repos r ON i.repo = r.repo
        WHERE i.state = 'open'
        AND (i.is_paid = 0 OR i.bounty_amount IS NULL OR i.bounty_amount = 0)
      `;

      if (options.tech) {
        sql += ` AND (i.labels_json LIKE '%${options.tech}%' OR i.title LIKE '%${options.tech}%')`;
      }

      sql += ` ORDER BY r.maintainer_score_cached DESC NULLS LAST, i.ingested_at DESC LIMIT ${limit * 2}`;

      const result = await db.execute(sql);

      if (result.rows.length === 0) {
        spinner.info('No reputation opportunities found');
        console.log(chalk.dim('\nTry: bounty ingest --all to refresh sources'));
        closeDb();
        return;
      }

      // Score and filter opportunities
      const opportunities: RepOpportunity[] = [];

      for (const row of result.rows) {
        const issue = row as any;
        const { score, impactType, reasons } = calculateCredibilityScore(issue);

        if (score >= minCred) {
          opportunities.push({
            repo: issue.repo,
            url: issue.url,
            title: issue.title || 'Untitled',
            credibilityScore: score,
            impactType,
            reasons
          });
        }

        if (opportunities.length >= limit) break;
      }

      spinner.succeed(`Found ${opportunities.length} reputation opportunities`);

      // Display results
      console.log(chalk.bold('\nReputation Opportunities\n'));
      console.log(chalk.dim('─'.repeat(90)));
      console.log(
        padRight('Score', 8) +
        padRight('Impact', 12) +
        padRight('Repo', 30) +
        'Title'
      );
      console.log(chalk.dim('─'.repeat(90)));

      for (const opp of opportunities) {
        const scoreColor = opp.credibilityScore >= 70 ? chalk.green :
                          opp.credibilityScore >= 50 ? chalk.yellow : chalk.dim;
        console.log(
          padRight(scoreColor(String(opp.credibilityScore)), 8) +
          padRight(opp.impactType, 12) +
          padRight(opp.repo, 30) +
          truncate(opp.title, 35)
        );
        console.log(chalk.dim(`        ${opp.url}`));
      }

      console.log(chalk.dim('─'.repeat(90)));
      console.log(chalk.dim(`\n${opportunities.length} opportunity(ies)`));

      if (opportunities.length > 0) {
        console.log(chalk.dim('\nNext: bounty rep qualify <url>'));
      }

      // Slack notification
      if (options.slack !== false && opportunities.length > 0) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: formatRepHuntForSlack(opportunities)
        } as SlackMessage);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to hunt reputation opportunities');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Qualify a reputation opportunity
 */
repCommand
  .command('qualify <url>')
  .description('Evaluate a reputation opportunity')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (url, options) => {
    const spinner = ora('Qualifying reputation opportunity...').start();

    try {
      const db = getDb();

      // Parse URL
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);
      if (!match) {
        spinner.fail('Invalid GitHub URL');
        process.exit(1);
      }

      const [, owner, repoName, , issueNum] = match;
      const repo = `${owner}/${repoName}`;

      // Check if in index
      const issueResult = await db.execute({
        sql: 'SELECT * FROM issues_index WHERE url = ?',
        args: [url]
      });

      let issue = issueResult.rows[0] as any;

      // Get repo info
      const repoResult = await db.execute({
        sql: 'SELECT * FROM repos WHERE repo = ?',
        args: [repo]
      });
      const repoInfo = repoResult.rows[0] as any;

      // Calculate credibility
      const { score, impactType, reasons } = calculateCredibilityScore({
        ...issue,
        maintainer_score_cached: repoInfo?.maintainer_score_cached
      });

      // Create engagement
      const engagementId = `rep-${owner}-${repoName}-${issueNum}`;
      const now = new Date().toISOString();

      // Ensure repo exists
      await db.execute({
        sql: `INSERT OR IGNORE INTO repos (repo, last_seen_at, created_at, updated_at)
              VALUES (?, ?, ?, ?)`,
        args: [repo, now, now, now]
      });

      // Create or update engagement
      await db.execute({
        sql: `INSERT OR REPLACE INTO engagements
              (id, kind, source, repo, issue_url, title, status, created_at, updated_at)
              VALUES (?, 'reputation_pr', 'manual', ?, ?, ?, 'qualified', ?, ?)`,
        args: [engagementId, repo, url, issue?.title || 'Reputation PR', now, now]
      });

      // Store metrics
      await db.execute({
        sql: `INSERT OR REPLACE INTO engagement_metrics
              (engagement_id, payout_amount, payout_currency, computed_at)
              VALUES (?, 0, 'REP', ?)`,
        args: [engagementId, now]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'rep_qualified', ?, ?)`,
        args: [engagementId, now, JSON.stringify({ score, impactType, reasons })]
      });

      spinner.succeed('Reputation opportunity qualified');

      // Display results
      console.log(chalk.bold(`\nReputation Qualify: ${repo}\n`));
      console.log(chalk.dim('═'.repeat(60)));

      console.log(`  Issue: ${url}`);
      console.log(`  Title: ${issue?.title || 'Unknown'}`);
      console.log('');

      console.log(chalk.bold('  Credibility Score'));
      const scoreColor = score >= 70 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
      console.log(`    Score: ${scoreColor(String(score) + '/100')}`);
      console.log(`    Impact: ${impactType}`);
      console.log('');

      console.log(chalk.bold('  Factors'));
      for (const reason of reasons) {
        console.log(`    • ${reason}`);
      }

      console.log(chalk.dim('\n═'.repeat(60)));

      if (score >= 50) {
        console.log(chalk.green('\n✓ Worth pursuing for reputation'));
        console.log(chalk.dim(`\nNext: bounty rep start ${engagementId}`));
      } else {
        console.log(chalk.yellow('\n⚠ Low credibility value'));
        console.log(chalk.dim('Consider finding higher-impact opportunities'));
      }

      // Slack
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: `⭐ *REP QUALIFIED*\n\n*Repo:* ${repo}\n*Score:* ${score}/100 (${impactType})\n*URL:* ${url}\n\n${reasons.map(r => `• ${r}`).join('\n')}`
        } as SlackMessage);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to qualify reputation opportunity');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Start working on a reputation PR
 */
repCommand
  .command('start <id>')
  .description('Start working on a reputation PR')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (id, options) => {
    const spinner = ora(`Starting reputation work: ${id}...`).start();

    try {
      const db = getDb();
      const now = new Date().toISOString();

      // Update engagement status
      const result = await db.execute({
        sql: `UPDATE engagements SET status = 'in_progress', updated_at = ? WHERE id = ?`,
        args: [now, id]
      });

      if (result.rowsAffected === 0) {
        spinner.fail(`Engagement not found: ${id}`);
        process.exit(1);
      }

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'rep_started', ?, '{}')`,
        args: [id, now]
      });

      spinner.succeed('Reputation work started');

      console.log(chalk.green(`\n✓ Working on: ${id}`));
      console.log(chalk.dim('\nNext steps:'));
      console.log(chalk.dim('  1. Bootstrap the repo: bounty bootstrap <repo>'));
      console.log(chalk.dim('  2. Make your changes'));
      console.log(chalk.dim('  3. Run tests: bounty test run ' + id));
      console.log(chalk.dim('  4. Submit: bounty rep submit ' + id + ' --pr <url>'));

      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: `🚀 *REP STARTED*\n\n*Engagement:* ${id}`
        } as SlackMessage);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to start reputation work');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Submit a reputation PR
 */
repCommand
  .command('submit <id>')
  .description('Record reputation PR submission')
  .requiredOption('-p, --pr <url>', 'PR URL')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (id, options) => {
    const spinner = ora(`Recording reputation submission: ${id}...`).start();

    try {
      const db = getDb();
      const now = new Date().toISOString();

      // Update engagement
      await db.execute({
        sql: `UPDATE engagements SET status = 'submitted', pr_url = ?, updated_at = ? WHERE id = ?`,
        args: [options.pr, now, id]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'rep_submitted', ?, ?)`,
        args: [id, now, JSON.stringify({ pr_url: options.pr })]
      });

      spinner.succeed('Reputation PR recorded');

      console.log(chalk.green(`\n✓ PR submitted: ${options.pr}`));
      console.log(chalk.dim('\nTrack with: bounty rep scoreboard'));

      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_submitted',
          content: `✅ *REP PR SUBMITTED*\n\n*Engagement:* ${id}\n*PR:* ${options.pr}`
        } as SlackMessage);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to record reputation submission');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show reputation scoreboard
 */
repCommand
  .command('scoreboard')
  .description('Show reputation PR scoreboard')
  .action(async () => {
    try {
      const db = getDb();

      // Get all reputation engagements
      const result = await db.execute(`
        SELECT e.*, em.payout_amount
        FROM engagements e
        LEFT JOIN engagement_metrics em ON e.id = em.engagement_id
        WHERE e.kind = 'reputation_pr'
        ORDER BY e.created_at DESC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo reputation PRs tracked'));
        console.log(chalk.dim('Start with: bounty rep hunt'));
        closeDb();
        return;
      }

      // Count by status
      const byStatus: Record<string, number> = {};
      for (const row of result.rows) {
        const eng = row as any;
        byStatus[eng.status] = (byStatus[eng.status] || 0) + 1;
      }

      console.log(chalk.bold('\nReputation Scoreboard\n'));
      console.log(chalk.dim('═'.repeat(70)));

      // Summary
      console.log(chalk.bold('  Summary'));
      console.log(`    Total: ${result.rows.length}`);
      console.log(`    In Progress: ${byStatus['in_progress'] || 0}`);
      console.log(`    Submitted: ${byStatus['submitted'] || 0}`);
      console.log(`    Merged: ${byStatus['merged'] || 0}`);
      console.log('');

      // List
      console.log(chalk.bold('  Recent PRs'));
      console.log(chalk.dim('  ' + '─'.repeat(65)));
      console.log(
        '  ' +
        padRight('Status', 15) +
        padRight('Repo', 30) +
        'Title'
      );
      console.log(chalk.dim('  ' + '─'.repeat(65)));

      for (const row of result.rows) {
        const eng = row as any;
        const statusColor = eng.status === 'merged' ? chalk.green :
                           eng.status === 'submitted' ? chalk.yellow :
                           eng.status === 'in_progress' ? chalk.cyan :
                           chalk.dim;
        console.log(
          '  ' +
          padRight(statusColor(eng.status), 15) +
          padRight(eng.repo, 30) +
          truncate(eng.title || 'Untitled', 25)
        );
      }

      console.log(chalk.dim('  ' + '─'.repeat(65)));
      console.log(chalk.dim('\n═'.repeat(70)));
      console.log('');

    } catch (error) {
      console.error('Failed to show scoreboard:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function calculateCredibilityScore(issue: any): { score: number; impactType: string; reasons: string[] } {
  let score = 50;  // Base score
  const reasons: string[] = [];
  let impactType = 'general';

  // Impact type detection from labels/title
  const text = `${issue.title || ''} ${issue.labels_json || ''}`.toLowerCase();

  if (text.includes('security') || text.includes('vulnerability') || text.includes('cve')) {
    score += 30;
    impactType = 'security';
    reasons.push('Security impact (+30)');
  } else if (text.includes('performance') || text.includes('optimization') || text.includes('speed')) {
    score += 20;
    impactType = 'performance';
    reasons.push('Performance impact (+20)');
  } else if (text.includes('test') || text.includes('coverage')) {
    score += 15;
    impactType = 'testing';
    reasons.push('Testing improvement (+15)');
  } else if (text.includes('bug') || text.includes('fix')) {
    score += 10;
    impactType = 'bugfix';
    reasons.push('Bug fix (+10)');
  } else if (text.includes('doc') || text.includes('readme') || text.includes('typo')) {
    score += 5;
    impactType = 'docs';
    reasons.push('Documentation (+5)');
  }

  // Maintainer score bonus
  if (issue.maintainer_score_cached) {
    const maintainerBonus = Math.round(issue.maintainer_score_cached / 5);
    score += maintainerBonus;
    reasons.push(`Good maintainer score (+${maintainerBonus})`);
  }

  // Credibility tier bonus
  if (issue.credibility_tier === 'A') {
    score += 15;
    reasons.push('Tier A repo (+15)');
  } else if (issue.credibility_tier === 'B') {
    score += 10;
    reasons.push('Tier B repo (+10)');
  }

  // Good first issue bonus
  if (text.includes('good first issue') || text.includes('help wanted')) {
    score += 5;
    reasons.push('Welcoming labels (+5)');
  }

  // Cap score
  score = Math.min(100, Math.max(0, score));

  if (reasons.length === 0) {
    reasons.push('Standard contribution');
  }

  return { score, impactType, reasons };
}

function formatRepHuntForSlack(opportunities: RepOpportunity[]): string {
  const lines = opportunities.slice(0, 5).map(opp =>
    `• ${opp.credibilityScore}/100 [${opp.impactType}] ${opp.repo}\n  ${truncate(opp.title, 50)}`
  );

  return `⭐ *REPUTATION OPPORTUNITIES*

${lines.join('\n\n')}

Use: \`bounty rep qualify <url>\``;
}

function padRight(s: string, len: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.substring(0, len - 3) + '...';
}
