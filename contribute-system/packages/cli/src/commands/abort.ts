/**
 * Abort Command - Clean abandonment of engagements
 *
 * Track why engagements are abandoned to improve future scoring.
 * Reasons are stored and analyzed for pattern detection.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const abortCommand = new Command('abort')
  .description('Abandon an engagement with tracked reason');

// Valid abort reasons
const ABORT_REASONS = [
  'outcompeted',           // Another PR merged first
  'maintainer_decision',   // Maintainer rejected approach
  'scope_blowup',          // Scope expanded beyond estimate
  'env_blocked',           // Environment issues
  'rules_blocked',         // Rules/CLA blocked
  'low_ev',                // EV too low after work started
  'stalled',               // No response from maintainers
  'duplicate',             // Duplicate of another issue
  'wontfix',               // Maintainer marked as wontfix
  'other'                  // Other reason (requires note)
] as const;

type AbortReason = typeof ABORT_REASONS[number];

abortCommand
  .argument('<engagement_id>', 'Engagement to abort')
  .requiredOption('-r, --reason <reason>', `Reason: ${ABORT_REASONS.join('|')}`)
  .option('-n, --note <note>', 'Additional notes')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (engagementId, options) => {
    const spinner = ora(`Aborting engagement: ${engagementId}...`).start();

    try {
      const db = getDb();

      // Validate reason
      const reason = options.reason as AbortReason;
      if (!ABORT_REASONS.includes(reason)) {
        spinner.fail(`Invalid reason: ${reason}`);
        console.log(chalk.dim(`Valid reasons: ${ABORT_REASONS.join(', ')}`));
        process.exit(1);
      }

      // Require note for 'other'
      if (reason === 'other' && !options.note) {
        spinner.fail('Note required for "other" reason');
        console.log(chalk.dim('Use: --note "explanation"'));
        process.exit(1);
      }

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
      const now = new Date().toISOString();

      // Update engagement status
      await db.execute({
        sql: `UPDATE engagements SET status = 'abandoned', updated_at = ? WHERE id = ?`,
        args: [now, engagementId]
      });

      // Update engagement_metrics with outcome
      await db.execute({
        sql: `UPDATE engagement_metrics SET outcome = ? WHERE engagement_id = ?`,
        args: [`abandoned:${reason}`, engagementId]
      });

      // Log event with full details
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'aborted', ?, ?)`,
        args: [engagementId, now, JSON.stringify({
          reason,
          note: options.note || null,
          previousStatus: engagement.status,
          repo: engagement.repo
        })]
      });

      spinner.succeed('Engagement aborted');

      console.log(chalk.bold(`\nAbort: ${engagementId}\n`));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Repo: ${engagement.repo}`);
      console.log(`  Previous Status: ${engagement.status}`);
      console.log(`  Reason: ${chalk.yellow(reason)}`);
      if (options.note) {
        console.log(`  Note: ${options.note}`);
      }
      console.log(chalk.dim('─'.repeat(50)));

      // Show recommendation based on reason
      console.log('');
      switch (reason) {
        case 'outcompeted':
          console.log(chalk.dim('Tip: Check competition earlier with `bounty qualify`'));
          break;
        case 'scope_blowup':
          console.log(chalk.dim('Tip: Improve time estimates with `bounty bootstrap` first'));
          break;
        case 'env_blocked':
          console.log(chalk.dim('Tip: Use `bounty env detect` before starting work'));
          break;
        case 'low_ev':
          console.log(chalk.dim('Tip: Trust the EV calculation from `bounty qualify`'));
          break;
        case 'stalled':
          console.log(chalk.dim('Tip: Check maintainer scores before engaging'));
          break;
      }

      // Slack notification
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: `🛑 *ENGAGEMENT ABORTED*\n\n*ID:* ${engagementId}\n*Repo:* ${engagement.repo}\n*Reason:* ${reason}${options.note ? `\n*Note:* ${options.note}` : ''}`
        } as SlackMessage);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to abort engagement');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List abort reasons and stats
 */
export const abortStatsCommand = new Command('abort-stats')
  .description('Show abort reason statistics')
  .action(async () => {
    try {
      const db = getDb();

      // Get abort events
      const result = await db.execute(`
        SELECT payload_json, ts
        FROM events
        WHERE type = 'aborted'
        ORDER BY ts DESC
        LIMIT 50
      `);

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo aborted engagements'));
        closeDb();
        return;
      }

      // Count by reason
      const byReason: Record<string, number> = {};
      for (const row of result.rows) {
        const event = row as any;
        try {
          const payload = JSON.parse(event.payload_json);
          const reason = payload.reason || 'unknown';
          byReason[reason] = (byReason[reason] || 0) + 1;
        } catch {}
      }

      console.log(chalk.bold('\nAbort Statistics\n'));
      console.log(chalk.dim('─'.repeat(40)));

      // Sort by count
      const sorted = Object.entries(byReason).sort((a, b) => b[1] - a[1]);

      for (const [reason, count] of sorted) {
        const bar = '█'.repeat(Math.min(20, count));
        console.log(`  ${padRight(reason, 20)} ${padRight(String(count), 4)} ${chalk.yellow(bar)}`);
      }

      console.log(chalk.dim('─'.repeat(40)));
      console.log(`  Total: ${result.rows.length} abort(s)`);

      // Show recent
      console.log(chalk.bold('\nRecent Aborts'));
      console.log(chalk.dim('─'.repeat(60)));

      for (const row of result.rows.slice(0, 5)) {
        const event = row as any;
        try {
          const payload = JSON.parse(event.payload_json);
          console.log(`  ${payload.repo || 'Unknown'} - ${payload.reason}`);
        } catch {}
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show abort stats:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

function padRight(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - s.length));
}
