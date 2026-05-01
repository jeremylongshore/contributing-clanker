/**
 * CLA/DCO Command - Contributor License Agreement Management
 *
 * Track and manage CLA/DCO status per repo.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';

export const claCommand = new Command('cla')
  .description('Manage CLA/DCO status for repos');

/**
 * Check CLA status for a repo
 */
claCommand
  .command('check <repo>')
  .description('Check CLA/DCO requirements for a repo')
  .action(async (repo) => {
    try {
      const db = getDb();

      // Get from cla_status table
      const claResult = await db.execute({
        sql: 'SELECT * FROM cla_status WHERE repo = ?',
        args: [repo]
      });

      // Also check repo_profiles for rules
      const rulesResult = await db.execute({
        sql: 'SELECT rules_json, cla_required, cla_url FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      console.log(chalk.bold(`\nCLA/DCO Status: ${repo}\n`));
      console.log(chalk.dim('─'.repeat(50)));

      if (claResult.rows.length === 0 && rulesResult.rows.length === 0) {
        console.log(chalk.yellow('  No CLA data available'));
        console.log(chalk.dim(`  Run: bounty rules refresh ${repo}`));
        console.log('');
        return;
      }

      const claRow = claResult.rows[0] as unknown as any;
      const rulesRow = rulesResult.rows[0] as unknown as any;

      // Parse rules if available
      let rules: any = null;
      if (rulesRow?.rules_json) {
        try {
          rules = JSON.parse(rulesRow.rules_json);
        } catch {}
      }

      // CLA Section
      const claRequired = claRow?.cla_required || rulesRow?.cla_required || rules?.cla?.required || false;
      const claUrl = claRow?.cla_url || rulesRow?.cla_url || rules?.cla?.url || null;
      const claType = claRow?.cla_type || rules?.cla?.type || 'unknown';
      const claStatus = claRow?.cla_status || 'unknown';

      console.log(chalk.bold('\n  CLA'));
      if (claRequired) {
        console.log(`    Required: ${chalk.yellow('YES')}`);
        console.log(`    Type: ${claType.toUpperCase()}`);
        if (claUrl) {
          console.log(`    URL: ${chalk.cyan(claUrl)}`);
        }

        // Status
        if (claStatus === 'completed') {
          console.log(`    Status: ${chalk.green('COMPLETED')}`);
          if (claRow?.cla_completed_at) {
            console.log(`    Completed: ${claRow.cla_completed_at}`);
          }
        } else if (claStatus === 'not_required') {
          console.log(`    Status: ${chalk.green('NOT REQUIRED')}`);
        } else {
          console.log(`    Status: ${chalk.red('NEEDED')}`);
          console.log(chalk.yellow(`\n    ⚠️  Complete CLA before starting work!`));
          if (claUrl) {
            console.log(chalk.dim(`    Visit: ${claUrl}`));
          }
          console.log(chalk.dim(`    Then run: bounty cla complete ${repo}`));
        }
      } else {
        console.log(`    Required: ${chalk.green('NO')}`);
      }

      // DCO Section
      const dcoRequired = claRow?.dco_required || rules?.cla?.type === 'dco' || false;
      const dcoStatus = claRow?.dco_status || 'unknown';

      console.log(chalk.bold('\n  DCO (Sign-off)'));
      if (dcoRequired) {
        console.log(`    Required: ${chalk.yellow('YES')}`);
        if (dcoStatus === 'enabled') {
          console.log(`    Status: ${chalk.green('ENABLED')}`);
          console.log(chalk.dim('    Git configured to sign-off commits'));
        } else {
          console.log(`    Status: ${chalk.red('NOT ENABLED')}`);
          console.log(chalk.yellow(`\n    ⚠️  Enable DCO signing before work!`));
          console.log(chalk.dim(`    Run: bounty dco enable`));
          console.log(chalk.dim(`    Or use: git commit -s`));
        }
      } else {
        console.log(`    Required: ${chalk.green('NO')}`);
      }

      console.log('\n' + chalk.dim('─'.repeat(50)));
      console.log('');

    } catch (error) {
      console.error('Failed to check CLA:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Mark CLA as complete
 */
claCommand
  .command('complete <repo>')
  .description('Record CLA completion')
  .option('-n, --note <note>', 'Evidence or notes about completion')
  .action(async (repo, options) => {
    const spinner = ora(`Recording CLA completion for ${repo}...`).start();

    try {
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
                (repo, cla_required, cla_status, cla_completed_at, cla_evidence, created_at, updated_at)
                VALUES (?, 1, 'completed', ?, ?, ?, ?)`,
          args: [repo, now, options.note || null, now, now]
        });
      } else {
        // Update existing
        await db.execute({
          sql: `UPDATE cla_status
                SET cla_status = 'completed', cla_completed_at = ?, cla_evidence = ?, updated_at = ?
                WHERE repo = ?`,
          args: [now, options.note || null, now, repo]
        });
      }

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('repo', ?, 'cla_completed', ?, ?)`,
        args: [repo, now, JSON.stringify({ note: options.note })]
      });

      spinner.succeed('CLA marked as complete');
      console.log(chalk.green(`\n✓ You can now work on ${repo}`));
      console.log('');

    } catch (error) {
      spinner.fail('Failed to record CLA completion');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List all CLA statuses
 */
claCommand
  .command('list')
  .description('List all CLA statuses')
  .option('--needed', 'Only show repos needing CLA')
  .action(async (options) => {
    try {
      const db = getDb();

      let sql = 'SELECT * FROM cla_status ORDER BY repo';
      const result = await db.execute(sql);

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo CLA records found'));
        console.log(chalk.dim('Run: bounty cla check <repo> to check a repo'));
        return;
      }

      let rows = result.rows as unknown as any[];

      if (options.needed) {
        rows = rows.filter(r =>
          (r.cla_required && r.cla_status !== 'completed') ||
          (r.dco_required && r.dco_status !== 'enabled')
        );
      }

      console.log(chalk.bold('\nCLA/DCO Status\n'));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        padRight('Repo', 35) +
        padRight('CLA', 15) +
        padRight('DCO', 15) +
        'Status'
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const row of rows) {
        const claStatus = row.cla_required
          ? (row.cla_status === 'completed' ? chalk.green('done') : chalk.red('needed'))
          : chalk.dim('n/a');
        const dcoStatus = row.dco_required
          ? (row.dco_status === 'enabled' ? chalk.green('enabled') : chalk.red('needed'))
          : chalk.dim('n/a');

        const overallStatus = (
          (!row.cla_required || row.cla_status === 'completed') &&
          (!row.dco_required || row.dco_status === 'enabled')
        ) ? chalk.green('ready') : chalk.yellow('blocked');

        console.log(
          padRight(row.repo, 35) +
          padRight(claStatus, 15) +
          padRight(dcoStatus, 15) +
          overallStatus
        );
      }

      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.dim(`\n${rows.length} repo(s)`));
      console.log('');

    } catch (error) {
      console.error('Failed to list CLA status:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Enable DCO signing
 */
export const dcoCommand = new Command('dco')
  .description('Configure DCO (Developer Certificate of Origin)');

dcoCommand
  .command('enable')
  .description('Configure git to sign-off commits')
  .option('--global', 'Set globally for all repos')
  .action(async (options) => {
    const spinner = ora('Configuring DCO...').start();

    try {
      const db = getDb();
      const now = new Date().toISOString();

      // Store in config
      await db.execute({
        sql: `INSERT OR REPLACE INTO config (key, value, updated_at)
              VALUES ('dco.enabled', '1', ?)`,
        args: [now]
      });

      spinner.succeed('DCO configuration saved');

      console.log(chalk.bold('\nDCO Sign-off Enabled\n'));
      console.log('You can now use the following methods to sign-off commits:');
      console.log('');
      console.log(chalk.cyan('  Option 1: Manual sign-off per commit'));
      console.log(chalk.dim('    git commit -s -m "Your message"'));
      console.log('');
      console.log(chalk.cyan('  Option 2: Configure git to always sign-off'));
      const scope = options.global ? '--global' : '';
      console.log(chalk.dim(`    git config ${scope} --add format.signoff true`));
      console.log('');
      console.log(chalk.cyan('  Option 3: Use a git hook'));
      console.log(chalk.dim('    Add prepare-commit-msg hook to auto-sign'));
      console.log('');
      console.log(chalk.yellow('Note: Each commit must include:'));
      console.log(chalk.dim('  Signed-off-by: Your Name <email@example.com>'));
      console.log('');

    } catch (error) {
      spinner.fail('Failed to configure DCO');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

dcoCommand
  .command('status')
  .description('Check DCO configuration')
  .action(async () => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: "SELECT value FROM config WHERE key = 'dco.enabled'",
        args: []
      });

      if (result.rows.length > 0 && (result.rows[0] as any).value === '1') {
        console.log(chalk.green('\n✓ DCO signing is enabled'));
      } else {
        console.log(chalk.yellow('\n⚠ DCO signing is not enabled'));
        console.log(chalk.dim('Run: bounty dco enable'));
      }
      console.log('');

    } catch (error) {
      console.error('Failed to check DCO status:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

function padRight(s: string, len: number): string {
  // Handle chalk-wrapped strings by stripping ANSI for length calculation
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}
