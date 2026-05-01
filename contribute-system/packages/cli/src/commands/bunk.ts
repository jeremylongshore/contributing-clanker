/**
 * Bunk Command - Manage Repo Blocklist
 *
 * Track and filter out known-bad repos:
 * - Repos that never pay out
 * - Abandoned bounty programs
 * - Scam/spam repos
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';

// Blocklist reasons
const BUNK_REASONS = {
  'never-pays': 'Never pays out bounties',
  'abandoned': 'Bounty program abandoned',
  'spam': 'Spam/scam repo',
  'low-quality': 'Low quality bounty program',
  'fake-bounties': 'Fake/misleading bounty claims',
  'unresponsive': 'Maintainers unresponsive',
  'other': 'Other reason',
} as const;

export const bunkCommand = new Command('bunk')
  .description('Manage repo blocklist (known-bad repos)');

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: add
// ═══════════════════════════════════════════════════════════════════════════

bunkCommand
  .command('add <repo>')
  .description('Add a repo to the blocklist')
  .option('-r, --reason <reason>', 'Reason: never-pays, abandoned, spam, low-quality, fake-bounties, unresponsive, other', 'other')
  .option('-n, --notes <notes>', 'Additional notes')
  .option('-e, --evidence <url>', 'Evidence URL')
  .action(async (repo, options) => {
    const spinner = ora(`Adding ${repo} to blocklist...`).start();

    try {
      const db = getDb();
      const now = new Date().toISOString();

      // Validate reason
      if (!Object.keys(BUNK_REASONS).includes(options.reason)) {
        spinner.fail(`Invalid reason: ${options.reason}`);
        console.log(chalk.dim(`Valid reasons: ${Object.keys(BUNK_REASONS).join(', ')}`));
        return;
      }

      // Check if already blocklisted
      const existing = await db.execute({
        sql: 'SELECT repo FROM repo_blocklist WHERE repo = ?',
        args: [repo]
      });

      if (existing.rows.length > 0) {
        // Update existing
        await db.execute({
          sql: `UPDATE repo_blocklist SET
                reason = ?, notes = ?, evidence_json = ?, blocked_at = ?
                WHERE repo = ?`,
          args: [options.reason, options.notes || null, options.evidence ? JSON.stringify({ url: options.evidence }) : null, now, repo]
        });
        spinner.succeed(`Updated blocklist entry for ${repo}`);
      } else {
        // Insert new
        await db.execute({
          sql: `INSERT INTO repo_blocklist (repo, reason, notes, evidence_json, blocked_at)
                VALUES (?, ?, ?, ?, ?)`,
          args: [repo, options.reason, options.notes || null, options.evidence ? JSON.stringify({ url: options.evidence }) : null, now]
        });
        spinner.succeed(`Added ${repo} to blocklist: ${BUNK_REASONS[options.reason as keyof typeof BUNK_REASONS]}`);
      }

      // Also update repos table
      await db.execute({
        sql: `UPDATE repos SET is_blocklisted = 1, blocklist_reason = ? WHERE repo = ?`,
        args: [options.reason, repo]
      });

      console.log(chalk.dim(`This repo will be excluded from hunt results.`));

    } catch (error) {
      spinner.fail('Failed to add to blocklist');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: remove
// ═══════════════════════════════════════════════════════════════════════════

bunkCommand
  .command('remove <repo>')
  .description('Remove a repo from the blocklist')
  .action(async (repo) => {
    const spinner = ora(`Removing ${repo} from blocklist...`).start();

    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'DELETE FROM repo_blocklist WHERE repo = ?',
        args: [repo]
      });

      if (result.rowsAffected === 0) {
        spinner.warn(`${repo} was not in the blocklist`);
      } else {
        spinner.succeed(`Removed ${repo} from blocklist`);

        // Update repos table
        await db.execute({
          sql: `UPDATE repos SET is_blocklisted = 0, blocklist_reason = NULL WHERE repo = ?`,
          args: [repo]
        });
      }

    } catch (error) {
      spinner.fail('Failed to remove from blocklist');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: list
// ═══════════════════════════════════════════════════════════════════════════

bunkCommand
  .command('list')
  .description('List all blocklisted repos')
  .option('-r, --reason <reason>', 'Filter by reason')
  .action(async (options) => {
    try {
      const db = getDb();

      let sql = 'SELECT * FROM repo_blocklist';
      const args: string[] = [];

      if (options.reason) {
        sql += ' WHERE reason = ?';
        args.push(options.reason);
      }

      sql += ' ORDER BY blocked_at DESC';

      const result = await db.execute({ sql, args });

      if (result.rows.length === 0) {
        console.log(chalk.yellow('\nNo repos in blocklist'));
        if (!options.reason) {
          console.log(chalk.dim('Add with: bounty bunk add <owner/repo> --reason <reason>'));
        }
        return;
      }

      console.log(chalk.bold(`\nBlocklisted Repos (${result.rows.length})\n`));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        chalk.bold(padRight('Repo', 35)) +
        chalk.bold(padRight('Reason', 20)) +
        chalk.bold('Blocked At')
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const row of result.rows) {
        const entry = row as unknown as {
          repo: string;
          reason: string;
          blocked_at: string;
          notes: string | null;
        };

        console.log(
          padRight(entry.repo, 35) +
          padRight(entry.reason, 20) +
          entry.blocked_at.slice(0, 10)
        );

        if (entry.notes) {
          console.log(chalk.dim(`  ${entry.notes}`));
        }
      }

      console.log(chalk.dim('─'.repeat(80)));

      // Stats by reason
      console.log(chalk.bold('\nBy Reason:'));
      const reasonCounts: Record<string, number> = {};
      for (const row of result.rows) {
        const reason = (row as unknown as { reason: string }).reason;
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      }
      for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${reason}: ${count}`);
      }

    } catch (error) {
      console.error('Failed to list blocklist:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: check
// ═══════════════════════════════════════════════════════════════════════════

bunkCommand
  .command('check <repo>')
  .description('Check if a repo is blocklisted')
  .action(async (repo) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM repo_blocklist WHERE repo = ?',
        args: [repo]
      });

      if (result.rows.length === 0) {
        console.log(chalk.green(`\n✓ ${repo} is NOT blocklisted`));
      } else {
        const entry = result.rows[0] as unknown as {
          repo: string;
          reason: string;
          blocked_at: string;
          notes: string | null;
          evidence_json: string | null;
        };

        console.log(chalk.red(`\n✗ ${repo} IS blocklisted`));
        console.log(`  Reason: ${BUNK_REASONS[entry.reason as keyof typeof BUNK_REASONS] || entry.reason}`);
        console.log(`  Blocked: ${entry.blocked_at.slice(0, 10)}`);
        if (entry.notes) {
          console.log(`  Notes: ${entry.notes}`);
        }
        if (entry.evidence_json) {
          const evidence = JSON.parse(entry.evidence_json);
          console.log(`  Evidence: ${evidence.url}`);
        }
      }

    } catch (error) {
      console.error('Failed to check blocklist:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: reasons
// ═══════════════════════════════════════════════════════════════════════════

bunkCommand
  .command('reasons')
  .description('Show valid blocklist reasons')
  .action(() => {
    console.log(chalk.bold('\nValid Blocklist Reasons:\n'));
    for (const [code, desc] of Object.entries(BUNK_REASONS)) {
      console.log(`  ${chalk.cyan(code.padEnd(20))} ${desc}`);
    }
    console.log('');
  });

function padRight(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s.padEnd(len);
}
