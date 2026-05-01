/**
 * Maintainer Intel CRM - Phase 6 of Bounty Flywheel
 *
 * Track maintainer responsiveness, fairness, and merge velocity.
 * Data feeds into win probability calculations.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';

export const maintainerCommand = new Command('maintainer')
  .description('Manage maintainer intel CRM');

/**
 * Sync maintainers from a repo
 */
maintainerCommand
  .command('sync <repo>')
  .description('Sync maintainer data from GitHub')
  .option('-l, --limit <n>', 'Max PRs to analyze', '50')
  .action(async (repo, options) => {
    const spinner = ora(`Syncing maintainers for ${repo}...`).start();

    try {
      const config = await getConfig();
      const token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!token) {
        spinner.fail('GitHub token required');
        console.log(chalk.dim('Set with: bounty config set githubToken <token>'));
        process.exit(1);
      }

      const [owner, repoName] = repo.split('/');
      if (!owner || !repoName) {
        spinner.fail('Invalid repo format. Use owner/repo');
        process.exit(1);
      }

      const db = getDb();
      const limit = parseInt(options.limit, 10);
      const now = new Date().toISOString();

      // Fetch recent merged PRs
      spinner.text = 'Fetching merged PRs...';
      const prsResponse = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'bounty-system-cli/0.2.0'
          }
        }
      );

      if (!prsResponse.ok) {
        spinner.fail(`GitHub API error: ${prsResponse.status}`);
        process.exit(1);
      }

      const prs = await prsResponse.json();
      const mergedPRs = prs.filter((pr: any) => pr.merged_at);

      if (mergedPRs.length === 0) {
        spinner.warn('No merged PRs found');
        return;
      }

      // Track maintainer stats
      const maintainerStats: Map<string, {
        login: string;
        reviewCount: number;
        mergeCount: number;
        responseTimesMinutes: number[];
        mergeTimesMinutes: number[];
      }> = new Map();

      spinner.text = 'Analyzing maintainer activity...';

      for (const pr of mergedPRs) {
        // Get reviewers
        const reviewsResponse = await fetch(
          `https://api.github.com/repos/${repo}/pulls/${pr.number}/reviews`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'bounty-system-cli/0.2.0'
            }
          }
        );

        if (reviewsResponse.ok) {
          const reviews = await reviewsResponse.json();

          for (const review of reviews) {
            const login = review.user?.login;
            if (!login || login === pr.user?.login) continue; // Skip author

            if (!maintainerStats.has(login)) {
              maintainerStats.set(login, {
                login,
                reviewCount: 0,
                mergeCount: 0,
                responseTimesMinutes: [],
                mergeTimesMinutes: []
              });
            }

            const stats = maintainerStats.get(login)!;
            stats.reviewCount++;

            // Calculate response time
            const prCreated = new Date(pr.created_at);
            const reviewTime = new Date(review.submitted_at);
            const responseMinutes = Math.round((reviewTime.getTime() - prCreated.getTime()) / 60000);
            if (responseMinutes > 0 && responseMinutes < 100000) {
              stats.responseTimesMinutes.push(responseMinutes);
            }
          }
        }

        // Track merger
        if (pr.merged_by?.login) {
          const merger = pr.merged_by.login;
          if (!maintainerStats.has(merger)) {
            maintainerStats.set(merger, {
              login: merger,
              reviewCount: 0,
              mergeCount: 0,
              responseTimesMinutes: [],
              mergeTimesMinutes: []
            });
          }

          const stats = maintainerStats.get(merger)!;
          stats.mergeCount++;

          // Calculate time to merge
          const prCreated = new Date(pr.created_at);
          const mergeTime = new Date(pr.merged_at);
          const mergeMinutes = Math.round((mergeTime.getTime() - prCreated.getTime()) / 60000);
          if (mergeMinutes > 0 && mergeMinutes < 1000000) {
            stats.mergeTimesMinutes.push(mergeMinutes);
          }
        }
      }

      // Store maintainers
      spinner.text = 'Storing maintainer data...';
      let storedCount = 0;

      for (const stats of maintainerStats.values()) {
        // Upsert maintainer
        await db.execute({
          sql: `INSERT INTO maintainers (github_login, created_at, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(github_login) DO UPDATE SET updated_at = ?`,
          args: [stats.login, now, now, now]
        });

        // Get maintainer ID
        const maintainerResult = await db.execute({
          sql: 'SELECT id FROM maintainers WHERE github_login = ?',
          args: [stats.login]
        });
        const maintainerId = (maintainerResult.rows[0] as unknown as { id: number }).id;

        // Calculate scores
        const medianResponse = median(stats.responseTimesMinutes);
        const medianMerge = median(stats.mergeTimesMinutes);

        const responsivenessScore = scoreFromResponseTime(medianResponse);
        const mergeVelocityScore = scoreFromMergeTime(medianMerge);
        const overallScore = Math.round((responsivenessScore + mergeVelocityScore) / 2);

        // Upsert maintainer-repo edge
        await db.execute({
          sql: `INSERT INTO maintainer_repo_edges (maintainer_id, repo, relationship_score, last_interaction_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(maintainer_id, repo) DO UPDATE SET
                  relationship_score = ?,
                  last_interaction_at = ?`,
          args: [maintainerId, repo, overallScore, now, overallScore, now]
        });

        // Upsert scores
        await db.execute({
          sql: `INSERT INTO maintainer_scores
                (maintainer_id, repo, responsiveness_score, merge_velocity_score, overall_score, computed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(maintainer_id, repo) DO UPDATE SET
                  responsiveness_score = ?,
                  merge_velocity_score = ?,
                  overall_score = ?,
                  computed_at = ?`,
          args: [
            maintainerId, repo, responsivenessScore, mergeVelocityScore, overallScore, now,
            responsivenessScore, mergeVelocityScore, overallScore, now
          ]
        });

        storedCount++;
      }

      // Update repo with cached maintainer score
      const topMaintainer = [...maintainerStats.values()].sort((a, b) =>
        (b.reviewCount + b.mergeCount) - (a.reviewCount + a.mergeCount)
      )[0];

      if (topMaintainer) {
        const medianResponse = median(topMaintainer.responseTimesMinutes);
        const medianMerge = median(topMaintainer.mergeTimesMinutes);
        const repoScore = Math.round(
          (scoreFromResponseTime(medianResponse) + scoreFromMergeTime(medianMerge)) / 2
        );

        await db.execute({
          sql: `UPDATE repos SET maintainer_score_cached = ?, updated_at = ? WHERE repo = ?`,
          args: [repoScore, now, repo]
        });
      }

      spinner.succeed(`Synced ${storedCount} maintainers from ${mergedPRs.length} PRs`);

      // Print summary
      console.log(chalk.bold(`\nMaintainer Summary for ${repo}\n`));

      const sortedMaintainers = [...maintainerStats.values()]
        .sort((a, b) => (b.reviewCount + b.mergeCount) - (a.reviewCount + a.mergeCount))
        .slice(0, 10);

      for (const m of sortedMaintainers) {
        const medResp = median(m.responseTimesMinutes);
        const medMerge = median(m.mergeTimesMinutes);
        console.log(
          `  @${padRight(m.login, 20)} ` +
          `Reviews: ${m.reviewCount}  ` +
          `Merges: ${m.mergeCount}  ` +
          `Response: ${formatMinutes(medResp)}  ` +
          `Merge: ${formatMinutes(medMerge)}`
        );
      }

      console.log('');

    } catch (error) {
      spinner.fail('Sync failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List maintainers
 */
maintainerCommand
  .command('list')
  .description('List known maintainers')
  .option('-r, --repo <repo>', 'Filter by repo')
  .option('--min-score <n>', 'Minimum overall score', '0')
  .action(async (options) => {
    try {
      const db = getDb();
      const minScore = parseInt(options.minScore, 10);

      let sql = `
        SELECT m.github_login, ms.repo, ms.responsiveness_score, ms.merge_velocity_score, ms.overall_score
        FROM maintainers m
        JOIN maintainer_scores ms ON m.id = ms.maintainer_id
        WHERE ms.overall_score >= ?
      `;
      const args: (string | number)[] = [minScore];

      if (options.repo) {
        sql += ' AND ms.repo = ?';
        args.push(options.repo);
      }

      sql += ' ORDER BY ms.overall_score DESC LIMIT 50';

      const result = await db.execute({ sql, args });

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo maintainers found'));
        console.log(chalk.dim('Run: bounty maintainer sync owner/repo'));
        return;
      }

      console.log(chalk.bold('\nMaintainers\n'));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        padRight('Login', 25) +
        padRight('Repo', 30) +
        padRight('Resp', 8) +
        padRight('Merge', 8) +
        'Overall'
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const row of result.rows) {
        const m = row as unknown as {
          github_login: string;
          repo: string;
          responsiveness_score: number;
          merge_velocity_score: number;
          overall_score: number;
        };

        const scoreColor = m.overall_score >= 70 ? chalk.green
          : m.overall_score >= 50 ? chalk.yellow
          : chalk.red;

        console.log(
          padRight(`@${m.github_login}`, 25) +
          padRight(m.repo, 30) +
          padRight(String(m.responsiveness_score), 8) +
          padRight(String(m.merge_velocity_score), 8) +
          scoreColor(String(m.overall_score))
        );
      }

      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.dim(`\n${result.rows.length} maintainer(s)`));
      console.log('');

    } catch (error) {
      console.error('Failed to list maintainers:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show maintainer details
 */
maintainerCommand
  .command('show <login>')
  .description('Show details for a maintainer')
  .action(async (login) => {
    try {
      const db = getDb();
      const cleanLogin = login.replace('@', '');

      const maintainerResult = await db.execute({
        sql: 'SELECT * FROM maintainers WHERE github_login = ?',
        args: [cleanLogin]
      });

      if (maintainerResult.rows.length === 0) {
        console.log(chalk.red(`Maintainer not found: @${cleanLogin}`));
        process.exit(1);
      }

      const maintainer = maintainerResult.rows[0] as unknown as {
        id: number;
        github_login: string;
        display_name: string | null;
        notes: string | null;
        created_at: string;
      };

      console.log(chalk.bold(`\nMaintainer: @${maintainer.github_login}\n`));

      if (maintainer.display_name) {
        console.log(`  Name: ${maintainer.display_name}`);
      }
      if (maintainer.notes) {
        console.log(`  Notes: ${maintainer.notes}`);
      }

      // Get scores per repo
      const scoresResult = await db.execute({
        sql: 'SELECT * FROM maintainer_scores WHERE maintainer_id = ? ORDER BY overall_score DESC',
        args: [maintainer.id]
      });

      if (scoresResult.rows.length > 0) {
        console.log(chalk.bold('\n  Scores by Repo:'));
        for (const row of scoresResult.rows) {
          const s = row as unknown as {
            repo: string;
            responsiveness_score: number;
            merge_velocity_score: number;
            overall_score: number;
          };
          console.log(
            `    ${padRight(s.repo, 35)} ` +
            `Resp: ${s.responsiveness_score}  ` +
            `Merge: ${s.merge_velocity_score}  ` +
            `Overall: ${s.overall_score}`
          );
        }
      }

      // Get recent events
      const eventsResult = await db.execute({
        sql: `SELECT * FROM maintainer_events WHERE maintainer_id = ?
              ORDER BY ts DESC LIMIT 10`,
        args: [maintainer.id]
      });

      if (eventsResult.rows.length > 0) {
        console.log(chalk.bold('\n  Recent Events:'));
        for (const row of eventsResult.rows) {
          const e = row as unknown as { type: string; ts: string; issue_or_pr_url: string | null };
          console.log(`    ${e.ts}: ${e.type}${e.issue_or_pr_url ? ` (${e.issue_or_pr_url})` : ''}`);
        }
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show maintainer:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Rate a maintainer manually
 */
maintainerCommand
  .command('rate <login>')
  .description('Manually rate a maintainer')
  .requiredOption('-r, --repo <repo>', 'Repository')
  .option('--resp <score>', 'Responsiveness score (0-100)')
  .option('--fair <score>', 'Fairness score (0-100)')
  .option('--merge <score>', 'Merge velocity score (0-100)')
  .option('--comms <score>', 'Communications quality score (0-100)')
  .option('--note <note>', 'Add a note')
  .action(async (login, options) => {
    try {
      const db = getDb();
      const cleanLogin = login.replace('@', '');
      const now = new Date().toISOString();

      // Ensure maintainer exists
      await db.execute({
        sql: `INSERT INTO maintainers (github_login, created_at, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(github_login) DO UPDATE SET updated_at = ?`,
        args: [cleanLogin, now, now, now]
      });

      const maintainerResult = await db.execute({
        sql: 'SELECT id FROM maintainers WHERE github_login = ?',
        args: [cleanLogin]
      });
      const maintainerId = (maintainerResult.rows[0] as unknown as { id: number }).id;

      // Update note if provided
      if (options.note) {
        await db.execute({
          sql: 'UPDATE maintainers SET notes = ?, updated_at = ? WHERE id = ?',
          args: [options.note, now, maintainerId]
        });
      }

      // Calculate overall from provided scores
      const resp = options.resp ? parseInt(options.resp, 10) : null;
      const fair = options.fair ? parseInt(options.fair, 10) : null;
      const merge = options.merge ? parseInt(options.merge, 10) : null;
      const comms = options.comms ? parseInt(options.comms, 10) : null;

      const scores = [resp, fair, merge, comms].filter(s => s !== null) as number[];
      const overall = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      // Upsert scores
      await db.execute({
        sql: `INSERT INTO maintainer_scores
              (maintainer_id, repo, responsiveness_score, fairness_score, merge_velocity_score, comms_quality_score, overall_score, computed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(maintainer_id, repo) DO UPDATE SET
                responsiveness_score = COALESCE(?, responsiveness_score),
                fairness_score = COALESCE(?, fairness_score),
                merge_velocity_score = COALESCE(?, merge_velocity_score),
                comms_quality_score = COALESCE(?, comms_quality_score),
                overall_score = COALESCE(?, overall_score),
                computed_at = ?`,
        args: [
          maintainerId, options.repo, resp, fair, merge, comms, overall, now,
          resp, fair, merge, comms, overall, now
        ]
      });

      console.log(chalk.green(`\nRated @${cleanLogin} for ${options.repo}`));
      if (resp !== null) console.log(`  Responsiveness: ${resp}`);
      if (fair !== null) console.log(`  Fairness: ${fair}`);
      if (merge !== null) console.log(`  Merge velocity: ${merge}`);
      if (comms !== null) console.log(`  Communications: ${comms}`);
      if (overall !== null) console.log(`  Overall: ${overall}`);
      if (options.note) console.log(`  Note: ${options.note}`);
      console.log('');

    } catch (error) {
      console.error('Failed to rate maintainer:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function scoreFromResponseTime(minutes: number): number {
  if (minutes === 0) return 50; // Unknown
  if (minutes <= 60) return 95;      // < 1 hour
  if (minutes <= 240) return 85;     // < 4 hours
  if (minutes <= 1440) return 70;    // < 1 day
  if (minutes <= 4320) return 55;    // < 3 days
  if (minutes <= 10080) return 40;   // < 1 week
  return 25;
}

function scoreFromMergeTime(minutes: number): number {
  if (minutes === 0) return 50; // Unknown
  if (minutes <= 1440) return 95;    // < 1 day
  if (minutes <= 4320) return 80;    // < 3 days
  if (minutes <= 10080) return 65;   // < 1 week
  if (minutes <= 20160) return 50;   // < 2 weeks
  return 35;
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return '-';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function padRight(s: string, len: number): string {
  return s.padEnd(len);
}
