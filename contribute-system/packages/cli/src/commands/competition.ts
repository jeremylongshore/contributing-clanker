/**
 * Competition Command - Monitor competing PRs and claimants
 *
 * Productizes competition detection into actionable commands with
 * risk scoring and recommendations.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const competitionCommand = new Command('competition')
  .description('Monitor competing PRs and claimants');

interface CompetingItem {
  type: 'pr' | 'claimant' | 'comment';
  url?: string;
  author: string;
  status?: string;
  checksStatus?: string;
  hasReviews?: boolean;
  createdAt?: string;
}

interface CompetitionResult {
  riskScore: number;
  drivers: Record<string, number>;
  competingItems: CompetingItem[];
  recommendedAction: 'proceed' | 'monitor' | 'accelerate' | 'narrow' | 'fold';
  recommendation: string;
}

// Risk score thresholds
const RISK_THRESHOLDS = {
  LOW: 20,
  MODERATE: 40,
  HIGH: 60,
  CRITICAL: 80
};

/**
 * Check competition status for an engagement
 */
competitionCommand
  .command('check <engagement_id>')
  .description('Check competition status for an engagement')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (engagementId, options) => {
    const spinner = ora(`Checking competition for ${engagementId}...`).start();

    try {
      const db = getDb();

      // Get engagement
      const engResult = await db.execute({
        sql: 'SELECT * FROM engagements WHERE id = ?',
        args: [engagementId]
      });

      if (engResult.rows.length === 0) {
        spinner.fail(`Engagement not found: ${engagementId}`);
        process.exit(1);
      }

      const engagement = engResult.rows[0] as any;
      const [owner, repoName] = engagement.repo.split('/');

      // Extract issue number from URL
      const issueMatch = engagement.issue_url?.match(/\/issues\/(\d+)/);
      const issueNumber = issueMatch ? issueMatch[1] : null;

      if (!issueNumber) {
        spinner.fail('No issue URL found for engagement');
        process.exit(1);
      }

      // Fetch competing PRs via gh api
      spinner.text = 'Fetching linked PRs...';
      const result = await checkCompetition(owner, repoName, issueNumber);

      // Store in DB
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO competition_checks
              (engagement_id, ts, risk_score, drivers_json, competing_items_json, recommended_action)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          engagementId,
          now,
          result.riskScore,
          JSON.stringify(result.drivers),
          JSON.stringify(result.competingItems),
          result.recommendedAction
        ]
      });

      // Update engagement_metrics
      await db.execute({
        sql: `UPDATE engagement_metrics
              SET competition_risk_score = ?, competition_data_json = ?, recommended_action = ?
              WHERE engagement_id = ?`,
        args: [
          result.riskScore,
          JSON.stringify(result.competingItems),
          result.recommendedAction,
          engagementId
        ]
      });

      spinner.succeed('Competition check complete');

      // Display results
      console.log(chalk.bold(`\nCompetition Check: ${engagementId}\n`));
      console.log(chalk.dim('─'.repeat(60)));

      const riskColor = getRiskColor(result.riskScore);
      console.log(`  Risk Score: ${riskColor(result.riskScore + '/100')} (${getRiskLevel(result.riskScore)})`);
      console.log(`  Recommendation: ${chalk.bold(result.recommendedAction.toUpperCase())}`);
      console.log(`  ${result.recommendation}`);

      console.log('\n' + chalk.bold('  Risk Drivers:'));
      for (const [driver, score] of Object.entries(result.drivers)) {
        if (score > 0) {
          console.log(`    • ${driver}: +${score}`);
        }
      }

      if (result.competingItems.length > 0) {
        console.log('\n' + chalk.bold('  Competing Items:'));
        for (const item of result.competingItems) {
          const icon = item.type === 'pr' ? '🔀' : item.type === 'claimant' ? '👤' : '💬';
          console.log(`    ${icon} ${item.type}: @${item.author}${item.url ? ` - ${item.url}` : ''}`);
          if (item.checksStatus) {
            console.log(`       Checks: ${item.checksStatus}`);
          }
        }
      } else {
        console.log('\n  ' + chalk.green('No competing items found'));
      }

      console.log('\n' + chalk.dim('─'.repeat(60)));

      // Show action commands
      console.log('\n' + chalk.bold('Actions:'));
      if (result.recommendedAction === 'fold') {
        console.log(`  ${chalk.yellow('bounty abort ' + engagementId + ' --reason outcompeted')}`);
      } else if (result.recommendedAction === 'narrow') {
        console.log(`  ${chalk.dim('Focus on smallest mergeable unit')}`);
      } else if (result.recommendedAction === 'accelerate') {
        console.log(`  ${chalk.dim('Ship faster - competition is close')}`);
      }
      console.log(`  ${chalk.dim('bounty competition watch ' + engagementId + ' --interval-min 30')}`);

      console.log('');

      // Slack notification for high risk
      if (options.slack !== false && result.riskScore >= RISK_THRESHOLDS.HIGH) {
        await sendSlackNotification({
          type: 'competition_alert',
          content: formatSlackAlert(engagementId, engagement.repo, result)
        } as SlackMessage);
      }

    } catch (error) {
      spinner.fail('Competition check failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List competition checks
 */
competitionCommand
  .command('list')
  .description('List competition checks')
  .option('-r, --repo <repo>', 'Filter by repo')
  .option('-s, --status <status>', 'Filter by engagement status')
  .option('--min-risk <n>', 'Minimum risk score', '0')
  .action(async (options) => {
    try {
      const db = getDb();
      const minRisk = parseInt(options.minRisk, 10);

      let sql = `
        SELECT
          cc.engagement_id,
          cc.ts,
          cc.risk_score,
          cc.recommended_action,
          e.repo,
          e.status as eng_status,
          e.title
        FROM competition_checks cc
        JOIN engagements e ON e.id = cc.engagement_id
        WHERE cc.risk_score >= ?
      `;
      const args: any[] = [minRisk];

      if (options.repo) {
        sql += ' AND e.repo = ?';
        args.push(options.repo);
      }

      if (options.status) {
        sql += ' AND e.status = ?';
        args.push(options.status);
      }

      sql += ' ORDER BY cc.ts DESC LIMIT 50';

      const result = await db.execute({ sql, args });

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo competition checks found'));
        console.log(chalk.dim('Run: bounty competition check <engagement_id>'));
        closeDb();
        return;
      }

      console.log(chalk.bold('\nCompetition Checks\n'));
      console.log(chalk.dim('─'.repeat(90)));
      console.log(
        padRight('Engagement', 35) +
        padRight('Risk', 8) +
        padRight('Action', 12) +
        padRight('Status', 12) +
        'Checked'
      );
      console.log(chalk.dim('─'.repeat(90)));

      for (const row of result.rows) {
        const r = row as any;
        const riskColor = getRiskColor(r.risk_score);
        console.log(
          padRight(r.engagement_id, 35) +
          padRight(riskColor(String(r.risk_score)), 8) +
          padRight(r.recommended_action || '-', 12) +
          padRight(r.eng_status || '-', 12) +
          formatDate(r.ts)
        );
      }

      console.log(chalk.dim('─'.repeat(90)));
      console.log(chalk.dim(`\n${result.rows.length} check(s)`));
      console.log('');

    } catch (error) {
      console.error('Failed to list competition checks:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Watch competition for an engagement (polling)
 */
competitionCommand
  .command('watch <engagement_id>')
  .description('Watch competition status with polling')
  .option('-i, --interval-min <n>', 'Check interval in minutes', '30')
  .option('-m, --max-runs <n>', 'Maximum number of checks', '10')
  .option('--no-slack', 'Skip Slack notifications')
  .action(async (engagementId, options) => {
    const intervalMin = parseInt(options.intervalMin, 10);
    const maxRuns = parseInt(options.maxRuns, 10);

    console.log(chalk.bold(`\nWatching competition for: ${engagementId}`));
    console.log(chalk.dim(`Interval: ${intervalMin} min | Max runs: ${maxRuns}`));
    console.log(chalk.dim('Press Ctrl+C to stop\n'));

    let runs = 0;
    let lastRiskScore = 0;

    const runCheck = async () => {
      runs++;
      console.log(chalk.dim(`[${new Date().toISOString()}] Check #${runs}...`));

      try {
        const db = getDb();

        // Get engagement
        const engResult = await db.execute({
          sql: 'SELECT * FROM engagements WHERE id = ?',
          args: [engagementId]
        });

        if (engResult.rows.length === 0) {
          console.error(chalk.red('Engagement not found'));
          closeDb();
          process.exit(1);
        }

        const engagement = engResult.rows[0] as any;
        const [owner, repoName] = engagement.repo.split('/');
        const issueMatch = engagement.issue_url?.match(/\/issues\/(\d+)/);
        const issueNumber = issueMatch ? issueMatch[1] : null;

        if (!issueNumber) {
          console.error(chalk.red('No issue number'));
          closeDb();
          return;
        }

        const result = await checkCompetition(owner, repoName, issueNumber);

        // Store
        const now = new Date().toISOString();
        await db.execute({
          sql: `INSERT INTO competition_checks
                (engagement_id, ts, risk_score, drivers_json, competing_items_json, recommended_action)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            engagementId,
            now,
            result.riskScore,
            JSON.stringify(result.drivers),
            JSON.stringify(result.competingItems),
            result.recommendedAction
          ]
        });

        // Report
        const riskColor = getRiskColor(result.riskScore);
        const delta = result.riskScore - lastRiskScore;
        const deltaStr = delta > 0 ? chalk.red(`+${delta}`) : delta < 0 ? chalk.green(`${delta}`) : '';

        console.log(`  Risk: ${riskColor(String(result.riskScore))} ${deltaStr} | Action: ${result.recommendedAction}`);

        // Alert on significant increase
        if (delta >= 20 && options.slack !== false) {
          await sendSlackNotification({
            type: 'competition_alert',
            content: `⚠️ *COMPETITION SPIKE*\n\n*Engagement:* ${engagementId}\n*Risk:* ${lastRiskScore} → ${result.riskScore} (+${delta})\n*Action:* ${result.recommendedAction.toUpperCase()}`
          } as SlackMessage);
          console.log(chalk.yellow('  ⚠️ Alert sent to Slack'));
        }

        lastRiskScore = result.riskScore;
        closeDb();

      } catch (error) {
        console.error(chalk.red('Check failed:'), error);
      }

      if (runs >= maxRuns) {
        console.log(chalk.dim(`\nMax runs (${maxRuns}) reached. Stopping.`));
        process.exit(0);
      }
    };

    // Initial check
    await runCheck();

    // Schedule subsequent checks
    const intervalMs = intervalMin * 60 * 1000;
    setInterval(runCheck, intervalMs);
  });

// ─────────────────────────────────────────────────────────────────────────────
// Competition Detection Logic
// ─────────────────────────────────────────────────────────────────────────────

async function checkCompetition(owner: string, repo: string, issueNumber: string): Promise<CompetitionResult> {
  const { execSync } = await import('child_process');
  const competingItems: CompetingItem[] = [];
  const drivers: Record<string, number> = {
    competing_pr_exists: 0,
    pr_has_passing_checks: 0,
    pr_has_reviews: 0,
    multiple_claimants: 0,
    maintainer_attention: 0
  };

  try {
    // Get linked PRs
    const prsJson = execSync(
      `gh pr list --repo ${owner}/${repo} --search "linked:${issueNumber}" --json number,author,state,statusCheckRollup,reviews,url`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    const prs = JSON.parse(prsJson || '[]');

    for (const pr of prs) {
      if (pr.state === 'OPEN' || pr.state === 'MERGED') {
        competingItems.push({
          type: 'pr',
          url: pr.url,
          author: pr.author?.login || 'unknown',
          status: pr.state,
          checksStatus: pr.statusCheckRollup?.state || 'unknown',
          hasReviews: (pr.reviews?.length || 0) > 0
        });

        drivers.competing_pr_exists += 30;

        if (pr.statusCheckRollup?.state === 'SUCCESS') {
          drivers.pr_has_passing_checks += 20;
        }

        if ((pr.reviews?.length || 0) > 0) {
          drivers.pr_has_reviews += 15;
        }
      }
    }

    // Check issue comments for claimants
    const commentsJson = execSync(
      `gh api repos/${owner}/${repo}/issues/${issueNumber}/comments --jq '.[].body' 2>/dev/null || echo '[]'`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    const claimPatterns = [
      /i('ll| will) (take|work on|fix|handle)/i,
      /claiming/i,
      /working on (this|it)/i,
      /i'm on it/i
    ];

    const comments = commentsJson.split('\n').filter(c => c.trim());
    for (const comment of comments) {
      for (const pattern of claimPatterns) {
        if (pattern.test(comment)) {
          drivers.multiple_claimants += 10;
          break;
        }
      }
    }

  } catch (error) {
    // gh command failed, return minimal result
  }

  // Calculate total risk score
  const riskScore = Math.min(100, Object.values(drivers).reduce((a, b) => a + b, 0));

  // Determine recommendation
  let recommendedAction: 'proceed' | 'monitor' | 'accelerate' | 'narrow' | 'fold';
  let recommendation: string;

  if (riskScore <= RISK_THRESHOLDS.LOW) {
    recommendedAction = 'proceed';
    recommendation = 'Low competition. Continue as planned.';
  } else if (riskScore <= RISK_THRESHOLDS.MODERATE) {
    recommendedAction = 'monitor';
    recommendation = 'Moderate competition. Keep an eye on it.';
  } else if (riskScore <= RISK_THRESHOLDS.HIGH) {
    recommendedAction = 'accelerate';
    recommendation = 'High competition. Ship faster or narrow scope.';
  } else if (riskScore <= RISK_THRESHOLDS.CRITICAL) {
    recommendedAction = 'narrow';
    recommendation = 'Very high competition. Focus on smallest mergeable unit.';
  } else {
    recommendedAction = 'fold';
    recommendation = 'Critical competition. Consider aborting unless nearly done.';
  }

  return {
    riskScore,
    drivers,
    competingItems,
    recommendedAction,
    recommendation
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getRiskColor(score: number): (s: string) => string {
  if (score <= RISK_THRESHOLDS.LOW) return chalk.green;
  if (score <= RISK_THRESHOLDS.MODERATE) return chalk.yellow;
  if (score <= RISK_THRESHOLDS.HIGH) return chalk.hex('#FFA500'); // orange
  return chalk.red;
}

function getRiskLevel(score: number): string {
  if (score <= RISK_THRESHOLDS.LOW) return 'LOW';
  if (score <= RISK_THRESHOLDS.MODERATE) return 'MODERATE';
  if (score <= RISK_THRESHOLDS.HIGH) return 'HIGH';
  if (score <= RISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
  return 'EXTREME';
}

function formatSlackAlert(engagementId: string, repo: string, result: CompetitionResult): string {
  const items = result.competingItems.map(i =>
    `• ${i.type}: @${i.author}${i.checksStatus ? ` (checks: ${i.checksStatus})` : ''}`
  ).join('\n');

  return `🚨 *COMPETITION ALERT*

*Engagement:* ${engagementId}
*Repo:* ${repo}
*Risk Score:* ${result.riskScore}/100 (${getRiskLevel(result.riskScore)})

*Competing Items:*
${items || 'None detected'}

*Recommendation:* ${result.recommendedAction.toUpperCase()}
${result.recommendation}

*Actions:*
• \`bounty abort ${engagementId} --reason outcompeted\`
• \`bounty competition watch ${engagementId}\``;
}

function padRight(s: string, len: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso.slice(0, 16);
  }
}
