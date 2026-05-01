/**
 * Hunt Command - Intelligent Bounty Discovery
 *
 * Queries the local issues_index for bounty opportunities with:
 * - Freshness filtering (--max-age)
 * - Live GitHub validation (--validate)
 * - Competition checking (--check-competition)
 * - CONTRIBUTING.md links in output
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { getConfig } from '../lib/config';
import { getDb, closeDb } from '../lib/db';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

interface IndexedIssue {
  id: number;
  source_id: number | null;
  repo: string;
  url: string;
  issue_number: number;
  title: string;
  body_excerpt: string | null;
  labels_json: string | null;
  state: string;
  updated_at_remote: string | null;
  ingested_at: string;
  bounty_amount: number | null;
  bounty_currency: string | null;
  is_paid: number;
  is_bounty_like: number;
  credibility_score_hint: number | null;
  score_cached: number | null;
  last_scored_at: string | null;
}

interface HuntResult {
  issue: IndexedIssue;
  score: number;
  labels: string[];
  recommendation: 'claim' | 'consider' | 'skip';
  // Live validation fields
  liveState?: 'open' | 'closed' | 'unknown';
  competingPRs?: number;
  hasContributing?: boolean;
  contributingUrl?: string;
  daysSinceUpdate?: number;
  validationError?: string;
}

export const huntCommand = new Command('hunt')
  .description('Search for bounty opportunities with live validation')
  .option('--paid', 'Only show paid bounties (has value)')
  .option('--rep', 'Only show reputation opportunities (no payout)')
  .option('-t, --tech <tech>', 'Filter by technology keyword in labels')
  .option('-r, --repo <repo>', 'Filter by repo (owner/repo or partial match)')
  .option('--min-value <n>', 'Minimum bounty value', '0')
  .option('--min-score <n>', 'Minimum score threshold', '0')
  .option('--max-age <days>', 'Maximum issue age in days (default: 14)', '14')
  .option('-n, --limit <n>', 'Max results to show', '20')
  .option('--no-validate', 'Skip live GitHub validation')
  .option('--no-check-competition', 'Skip competition check')
  .option('--show-claimed', 'Show issues that already have PRs')
  .option('--refresh', 'Run ingestion before hunting')
  .option('--stale', 'Show stale sources that need refresh')
  .option('--no-slack', 'Skip Slack notification')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const spinner = ora('Hunting bounties...').start();

    try {
      const db = getDb();
      const config = await getConfig();

      // Check if index is empty
      const countResult = await db.execute("SELECT COUNT(*) as count FROM issues_index WHERE state = 'open'");
      const issueCount = (countResult.rows[0] as unknown as { count: number }).count;

      if (issueCount === 0) {
        spinner.warn('No issues in index');
        console.log(chalk.dim('Run: bounty seed repos  OR  bounty ingest --all'));
        return;
      }

      // Run refresh if requested
      if (options.refresh) {
        spinner.text = 'Running ingestion...';
        try {
          execSync('node dist/index.js ingest --due --no-slack', {
            cwd: process.cwd(),
            stdio: 'pipe'
          });
        } catch {
          // Ingest may fail but we continue with existing data
        }
      }

      spinner.text = 'Querying local index...';

      // Build query with max-age filter
      const maxAgeDays = parseInt(options.maxAge, 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
      const cutoffIso = cutoffDate.toISOString();

      let sql = `
        SELECT i.*, r.maintainer_score_cached, r.repo_score_cached, r.seed_score,
               r.is_blocklisted, rm.ttfg_p50_minutes, rp.contributing_url
        FROM issues_index i
        LEFT JOIN repos r ON i.repo = r.repo
        LEFT JOIN repo_metrics rm ON i.repo = rm.repo
        LEFT JOIN repo_profiles rp ON i.repo = rp.repo
        WHERE i.state = 'open'
        AND i.url LIKE '%/issues/%'
        AND (i.ingested_at >= ? OR i.updated_at_remote >= ?)
        AND (r.is_blocklisted IS NULL OR r.is_blocklisted = 0)`;
      const args: (string | number)[] = [cutoffIso, cutoffIso];

      // Filter: paid vs rep
      if (options.paid) {
        sql += ' AND i.is_paid = 1';
      } else if (options.rep) {
        sql += ' AND i.is_paid = 0 AND i.is_bounty_like = 1';
      }

      // Filter: min value
      if (options.minValue && parseInt(options.minValue, 10) > 0) {
        sql += ' AND (i.bounty_amount IS NULL OR i.bounty_amount >= ?)';
        args.push(parseInt(options.minValue, 10));
      }

      // Filter: tech (search in labels_json)
      if (options.tech) {
        sql += ' AND LOWER(i.labels_json) LIKE ?';
        args.push(`%${options.tech.toLowerCase()}%`);
      }

      // Filter: repo
      if (options.repo) {
        sql += ' AND i.repo LIKE ?';
        args.push(`%${options.repo}%`);
      }

      // Order by score and freshness
      sql += ` ORDER BY
        CASE WHEN i.bounty_amount IS NOT NULL THEN i.bounty_amount ELSE 0 END DESC,
        COALESCE(r.seed_score, r.maintainer_score_cached, 50) DESC,
        i.updated_at_remote DESC
        LIMIT ?`;
      args.push(parseInt(options.limit, 10) * 2); // Fetch extra for filtering

      const result = await db.execute({ sql, args });
      spinner.succeed(`Found ${result.rows.length} candidates (max ${maxAgeDays}d old)`);

      if (result.rows.length === 0) {
        console.log(chalk.yellow('\nNo bounties match your criteria'));
        console.log(chalk.dim('Try: --max-age 180  or  bounty seed repos'));
        return;
      }

      // Score and rank results
      let huntResults: HuntResult[] = result.rows.map(row => {
        const issue = row as unknown as IndexedIssue & {
          maintainer_score_cached: number | null;
          repo_score_cached: number | null;
          seed_score: number | null;
          ttfg_p50_minutes: number | null;
          contributing_url: string | null;
        };
        const labels = issue.labels_json ? JSON.parse(issue.labels_json) : [];
        const score = computeHuntScore(issue, config);
        const recommendation = score >= 70 ? 'claim' : score >= 40 ? 'consider' : 'skip';
        const daysSinceUpdate = issue.updated_at_remote
          ? Math.round((Date.now() - new Date(issue.updated_at_remote).getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

        return {
          issue,
          score,
          labels,
          recommendation,
          daysSinceUpdate,
          hasContributing: !!issue.contributing_url,
          contributingUrl: issue.contributing_url || undefined,
        };
      });

      // Live validation (default ON unless --no-validate)
      if (options.validate !== false || options.checkCompetition !== false) {
        const validateSpinner = ora('Validating issues via GitHub...').start();
        let validated = 0;
        let closed = 0;
        let withPRs = 0;

        for (const result of huntResults.slice(0, parseInt(options.limit, 10))) {
          try {
            // Extract owner/repo and issue number
            const match = result.issue.url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
            if (!match) continue;

            const [, repo, issueNum] = match;

            // Check if issue is still open
            if (options.validate !== false) {
              const stateOutput = execSync(
                `gh api repos/${repo}/issues/${issueNum} --jq '.state'`,
                { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
              ).trim();
              result.liveState = stateOutput === 'open' ? 'open' : 'closed';
              if (result.liveState === 'closed') closed++;
            }

            // Check for competing PRs
            if (options.checkCompetition !== false) {
              const timelineOutput = execSync(
                `gh api repos/${repo}/issues/${issueNum}/timeline --jq '[.[] | select(.event == "cross-referenced" and .source.issue.pull_request != null)] | length'`,
                { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
              ).trim();
              result.competingPRs = parseInt(timelineOutput, 10) || 0;
              if (result.competingPRs > 0) withPRs++;
            }

            // Check for CONTRIBUTING.md if not already known
            if (!result.hasContributing) {
              try {
                execSync(`gh api repos/${repo}/contents/CONTRIBUTING.md --silent`, {
                  timeout: 3000,
                  stdio: ['pipe', 'pipe', 'pipe']
                });
                result.hasContributing = true;
                result.contributingUrl = `https://github.com/${repo}/blob/main/CONTRIBUTING.md`;
              } catch {
                result.hasContributing = false;
              }
            }

            // ═══════════════════════════════════════════════════════════════════
            // PERSIST ALL FINDINGS TO DATABASE (v10 consolidated schema)
            // ═══════════════════════════════════════════════════════════════════
            const now = new Date().toISOString();
            const daysOld = result.daysSinceUpdate || 0;

            // Update issues_index with ALL validation data
            await db.execute({
              sql: `UPDATE issues_index SET
                      validated_at = ?,
                      live_state = ?,
                      competing_prs = ?,
                      days_since_activity = ?,
                      state = CASE WHEN ? = 'closed' THEN 'closed' ELSE state END
                    WHERE url = ?`,
              args: [
                now,
                result.liveState || 'unknown',
                result.competingPRs || 0,
                daysOld,
                result.liveState || 'unknown',
                result.issue.url
              ]
            });

            // Update repos with CONTRIBUTING.md discovery
            if (result.contributingUrl || result.hasContributing !== undefined) {
              await db.execute({
                sql: `UPDATE repos SET
                        contributing_url = COALESCE(?, contributing_url),
                        last_validated_at = ?
                      WHERE repo = ?`,
                args: [result.contributingUrl || null, now, repo]
              });
            }

            validated++;
          } catch (error) {
            result.validationError = error instanceof Error ? error.message : 'unknown';
            result.liveState = 'unknown';
          }
        }

        validateSpinner.succeed(`Validated ${validated} issues (${closed} closed, ${withPRs} with PRs)`);

        // Filter out closed issues
        if (options.validate !== false) {
          huntResults = huntResults.filter(r => r.liveState !== 'closed');
        }

        // Filter out issues with competing PRs (unless --show-claimed)
        if (options.checkCompetition !== false && !options.showClaimed) {
          const beforeCount = huntResults.length;
          huntResults = huntResults.filter(r => !r.competingPRs || r.competingPRs === 0);
          const filtered = beforeCount - huntResults.length;
          if (filtered > 0) {
            console.log(chalk.dim(`  Filtered ${filtered} issues with existing PRs`));
          }
        }
      }

      // Sort by score
      huntResults.sort((a, b) => b.score - a.score);

      // Apply min-score filter and limit
      const minScore = parseInt(options.minScore, 10);
      let filtered = minScore > 0
        ? huntResults.filter(r => r.score >= minScore)
        : huntResults;
      filtered = filtered.slice(0, parseInt(options.limit, 10));

      // Print results
      console.log(chalk.bold(`\n${filtered.length} opportunities (from ${issueCount} indexed, max ${maxAgeDays}d old)\n`));
      printHuntResults(filtered, options.verbose, options.showClaimed);

      // Show stale sources if requested
      if (options.stale) {
        await printStaleSources(db);
      }

      // Recommend next step
      const claimable = filtered.filter(r => r.recommendation === 'claim');
      if (claimable.length > 0) {
        console.log(chalk.bold('\nNext step:'));
        console.log(chalk.cyan(`  bounty qualify ${claimable[0].issue.url}`));
        if (claimable[0].contributingUrl) {
          console.log(chalk.dim(`  Rules: ${claimable[0].contributingUrl}`));
        }
        console.log('');
      }

      // Notify Slack if significant results
      if (options.slack !== false && claimable.length > 0) {
        const slackContent = buildSlackSummary(filtered.slice(0, 5), issueCount, maxAgeDays);
        await sendSlackNotification({
          type: 'hunt_results',
          content: slackContent
        } as SlackMessage);
      }

    } catch (error) {
      spinner.fail('Hunt failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Compute hunt score for an issue
 *
 * Score factors:
 * - Bounty value (30%)
 * - Maintainer/Seed score (20%)
 * - TTFTG penalty (15%)
 * - Age freshness (15%)
 * - Tech fit (20%)
 */
function computeHuntScore(issue: IndexedIssue & {
  maintainer_score_cached: number | null;
  seed_score: number | null;
  ttfg_p50_minutes: number | null;
}, config: any): number {
  let score = 50; // Base score

  // Value bonus (up to +30)
  if (issue.bounty_amount) {
    if (issue.bounty_amount >= 500) score += 30;
    else if (issue.bounty_amount >= 200) score += 25;
    else if (issue.bounty_amount >= 100) score += 20;
    else if (issue.bounty_amount >= 50) score += 15;
    else score += 10;
  }

  // Seed score bonus (up to +15) - uses our discovered data
  if (issue.seed_score) {
    score += Math.round((issue.seed_score / 100) * 15);
  } else if (issue.maintainer_score_cached) {
    score += Math.round((issue.maintainer_score_cached / 100) * 15);
  }

  // TTFTG penalty (up to -15)
  if (issue.ttfg_p50_minutes) {
    if (issue.ttfg_p50_minutes > 60) score -= 15;
    else if (issue.ttfg_p50_minutes > 30) score -= 10;
    else if (issue.ttfg_p50_minutes > 15) score -= 5;
  }

  // Freshness bonus (up to +15)
  if (issue.updated_at_remote) {
    const daysSinceUpdate = (Date.now() - new Date(issue.updated_at_remote).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 7) score += 15;
    else if (daysSinceUpdate < 14) score += 10;
    else if (daysSinceUpdate < 30) score += 5;
    else if (daysSinceUpdate > 60) score -= 5;
    else if (daysSinceUpdate > 90) score -= 15;
  }

  // Tech fit bonus from config
  const scoring = config.scoring || {};
  const labels = issue.labels_json ? JSON.parse(issue.labels_json) : [];
  const labelsLower = labels.map((l: string) => l.toLowerCase());

  if (scoring.preferredTechnologies) {
    const preferred = scoring.preferredTechnologies.map((t: string) => t.toLowerCase());
    if (preferred.some((t: string) => labelsLower.some((l: string) => l.includes(t)))) {
      score += 10;
    }
  }

  if (scoring.avoidTechnologies) {
    const avoid = scoring.avoidTechnologies.map((t: string) => t.toLowerCase());
    if (avoid.some((t: string) => labelsLower.some((l: string) => l.includes(t)))) {
      score -= 20;
    }
  }

  // Familiar repo bonus
  if (scoring.familiarRepos?.includes(issue.repo)) {
    score += 15;
  }
  if (scoring.expertRepos?.includes(issue.repo)) {
    score += 25;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Print hunt results table
 */
function printHuntResults(results: HuntResult[], verbose: boolean, showCompetition: boolean) {
  // Header
  let header = chalk.bold(padRight('Score', 7)) +
    chalk.bold(padRight('Rec', 6)) +
    chalk.bold(padRight('Value', 8)) +
    chalk.bold(padRight('Age', 6));

  if (showCompetition) {
    header += chalk.bold(padRight('PRs', 5));
  }

  header += chalk.bold(padRight('Repo', 25)) + chalk.bold('Title');

  console.log(chalk.dim('─'.repeat(105)));
  console.log(header);
  console.log(chalk.dim('─'.repeat(105)));

  for (const { issue, score, recommendation, daysSinceUpdate, competingPRs, hasContributing, contributingUrl, liveState } of results) {
    const scoreColor = score >= 70 ? chalk.green
      : score >= 50 ? chalk.greenBright
      : score >= 40 ? chalk.yellow
      : chalk.red;

    const recEmoji: Record<string, string> = { claim: '✅', consider: '🤔', skip: '❌' };

    const value = issue.bounty_amount
      ? chalk.green(`$${issue.bounty_amount}`)
      : issue.is_bounty_like ? chalk.cyan('rep') : chalk.dim('-');

    const ageStr = daysSinceUpdate !== undefined
      ? (daysSinceUpdate < 7 ? chalk.green(`${daysSinceUpdate}d`) :
         daysSinceUpdate < 30 ? chalk.yellow(`${daysSinceUpdate}d`) :
         chalk.red(`${daysSinceUpdate}d`))
      : chalk.dim('?');

    const repoShort = truncate(issue.repo, 23);
    const title = truncate(issue.title, 40);

    // State indicator
    const stateIndicator = liveState === 'closed' ? chalk.red(' [CLOSED]') :
                           liveState === 'open' ? '' : '';

    let row = scoreColor(padRight(`${score}`, 7)) +
      padRight(recEmoji[recommendation], 6) +
      padRight(String(issue.bounty_amount ? `$${issue.bounty_amount}` : (issue.is_bounty_like ? 'rep' : '-')), 8) +
      padRight(ageStr, 6);

    if (showCompetition) {
      const prStr = competingPRs !== undefined
        ? (competingPRs === 0 ? chalk.green('0') : chalk.red(String(competingPRs)))
        : chalk.dim('?');
      row += padRight(prStr, 5);
    }

    row += padRight(repoShort, 25) + title + stateIndicator;
    console.log(row);

    // Show URL and CONTRIBUTING on second line
    let secondLine = chalk.dim(`       ${truncate(issue.url, 75)}`);
    if (hasContributing && verbose) {
      secondLine += chalk.cyan(' [CONTRIBUTING.md]');
    }
    console.log(secondLine);
  }

  console.log(chalk.dim('─'.repeat(105)));

  // Summary
  const claimable = results.filter(r => r.recommendation === 'claim');
  const consider = results.filter(r => r.recommendation === 'consider');

  console.log(
    `\n${chalk.green('✅')} Claim: ${claimable.length}  ` +
    `${chalk.yellow('🤔')} Consider: ${consider.length}  ` +
    `${chalk.red('❌')} Skip: ${results.length - claimable.length - consider.length}`
  );

  // Legend
  if (showCompetition) {
    console.log(chalk.dim('\nPRs = competing pull requests (0 = clear, 1+ = competition)'));
  }
}

/**
 * Print stale sources
 */
async function printStaleSources(db: ReturnType<typeof getDb>) {
  const now = Date.now();
  const result = await db.execute(`
    SELECT name, type, cadence_minutes, last_run_at
    FROM sources
    WHERE enabled = 1
    ORDER BY last_run_at ASC
  `);

  const stale: { name: string; type: string; hoursOverdue: number }[] = [];

  for (const row of result.rows) {
    const source = row as unknown as { name: string; type: string; cadence_minutes: number; last_run_at: string | null };
    if (!source.last_run_at) {
      stale.push({ name: source.name, type: source.type, hoursOverdue: 999 });
      continue;
    }

    const lastRun = new Date(source.last_run_at).getTime();
    const nextDue = lastRun + (source.cadence_minutes * 60 * 1000);
    if (now > nextDue) {
      const hoursOverdue = Math.round((now - nextDue) / (1000 * 60 * 60));
      stale.push({ name: source.name, type: source.type, hoursOverdue });
    }
  }

  if (stale.length > 0) {
    console.log(chalk.bold('\nStale Sources:'));
    for (const s of stale) {
      console.log(`  ${chalk.yellow('!')} ${s.name} (${s.type}) - ${s.hoursOverdue}h overdue`);
    }
    console.log(chalk.dim('\nRun: bounty ingest --due'));
  }
}

/**
 * Build Slack summary
 */
function buildSlackSummary(results: HuntResult[], totalIndexed: number, maxAgeDays: number): string {
  const lines: string[] = [];

  lines.push('*HUNT RESULTS*');
  lines.push(`Found ${results.length} opportunities (from ${totalIndexed} indexed, <${maxAgeDays}d old)`);
  lines.push('');

  for (const r of results.slice(0, 5)) {
    const value = r.issue.bounty_amount ? `$${r.issue.bounty_amount}` : 'rep';
    const rec = r.recommendation === 'claim' ? ':white_check_mark:' : ':thinking_face:';
    const age = r.daysSinceUpdate !== undefined ? `${r.daysSinceUpdate}d` : '?';
    const competition = r.competingPRs !== undefined && r.competingPRs > 0 ? ` | ${r.competingPRs} PRs` : ' | 0 PRs';
    lines.push(`${rec} *${r.issue.repo}* - ${truncate(r.issue.title, 35)} (${value}, ${age}${competition})`);
    lines.push(`    <${r.issue.url}|View issue>`);
    // Add CONTRIBUTING.md link
    if (r.contributingUrl) {
      lines.push(`    <${r.contributingUrl}|CONTRIBUTING.md>`);
    } else if (r.hasContributing === false) {
      const [owner, repo] = r.issue.repo.split('/');
      lines.push(`    <https://github.com/${owner}/${repo}#readme|README (no CONTRIBUTING.md)>`);
    }
  }

  lines.push('');
  lines.push('Run `bounty qualify <url>` to evaluate');

  return lines.join('\n');
}

function padRight(s: string, len: number): string {
  return s.padEnd(len);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}
