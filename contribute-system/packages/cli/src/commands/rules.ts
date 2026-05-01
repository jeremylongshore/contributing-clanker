/**
 * Rules Command - Repo Rules Profile Management
 *
 * View, refresh, and acknowledge contribution rules for repos.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import {
  ensureRepoRules,
  acknowledgeRules,
  rulesNeedAcknowledgement,
  formatRulesForSlack,
  type RepoProfile
} from '../lib/rules';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const rulesCommand = new Command('rules')
  .description('Manage repo contribution rules');

/**
 * Show rules for a repo
 */
rulesCommand
  .command('show <repo>')
  .description('Show contribution rules for a repo')
  .action(async (repo) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      if (result.rows.length === 0) {
        console.log(chalk.yellow(`\nNo rules profile for ${repo}`));
        console.log(chalk.dim('Run: bounty rules refresh ' + repo));
        return;
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

      console.log(chalk.bold(`\nRepo Rules: ${repo}\n`));
      console.log(chalk.dim('─'.repeat(50)));

      if (profile.rulesSummary) {
        for (const line of profile.rulesSummary.split('\n')) {
          console.log(`  ${line}`);
        }
      } else {
        console.log(chalk.dim('  No rules detected'));
      }

      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Version: ${profile.rulesVersion}`);
      console.log(`  Content Hash: ${profile.contentHash || 'none'}`);
      console.log(`  Last Fetched: ${profile.lastFetched || 'never'}`);

      // Acknowledgement status
      if (rulesNeedAcknowledgement(profile)) {
        console.log(chalk.yellow('\n  Status: NEEDS ACKNOWLEDGEMENT'));
        console.log(chalk.dim(`  Run: bounty rules acknowledge ${repo}`));
      } else if (profile.rulesAcknowledgedAt) {
        console.log(chalk.green('\n  Status: Acknowledged'));
        console.log(chalk.dim(`  At: ${profile.rulesAcknowledgedAt}`));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show rules:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Refresh rules for a repo
 */
rulesCommand
  .command('refresh <repo>')
  .description('Refresh contribution rules from GitHub')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (repo, options) => {
    const spinner = ora(`Refreshing rules for ${repo}...`).start();

    try {
      const config = await getConfig();
      const token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!token) {
        spinner.fail('GitHub token required');
        process.exit(1);
      }

      const { rules, profile, changed } = await ensureRepoRules(repo, token, {
        force: true,
        skipSlack: options.slack === false
      });

      spinner.succeed('Rules refreshed');

      console.log(chalk.bold(`\nRepo Rules: ${repo}\n`));
      console.log(chalk.dim('─'.repeat(50)));

      if (profile.rulesSummary) {
        for (const line of profile.rulesSummary.split('\n')) {
          console.log(`  ${line}`);
        }
      } else {
        console.log(chalk.dim('  No rules detected'));
      }

      console.log(chalk.dim('─'.repeat(50)));

      if (changed) {
        console.log(chalk.yellow('\nRules have changed since last fetch!'));
        console.log(chalk.dim(`Run: bounty rules acknowledge ${repo}`));
      }

      // Post to Slack
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: formatRulesForSlack(profile)
        } as SlackMessage);
        console.log(chalk.dim('\nSlack notification sent'));
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to refresh rules');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Acknowledge rules for a repo
 */
rulesCommand
  .command('acknowledge <repo>')
  .alias('ack')
  .description('Acknowledge current rules (required before submit)')
  .action(async (repo) => {
    const spinner = ora(`Acknowledging rules for ${repo}...`).start();

    try {
      const db = getDb();

      // Check if profile exists
      const result = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      if (result.rows.length === 0) {
        spinner.fail(`No rules profile for ${repo}`);
        console.log(chalk.dim('Run: bounty rules refresh ' + repo));
        process.exit(1);
      }

      const row = result.rows[0] as unknown as any;
      if (!row.content_hash) {
        spinner.fail('No content hash - refresh rules first');
        console.log(chalk.dim('Run: bounty rules refresh ' + repo));
        process.exit(1);
      }

      await acknowledgeRules(repo);

      spinner.succeed('Rules acknowledged');
      console.log(chalk.dim(`\nHash: ${row.content_hash}`));
      console.log(chalk.green('You can now submit PRs to this repo'));
      console.log('');

    } catch (error) {
      spinner.fail('Failed to acknowledge rules');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List repos with rules
 */
rulesCommand
  .command('list')
  .description('List repos with rules profiles')
  .option('--stale', 'Only show stale profiles (>7 days)')
  .option('--unacked', 'Only show unacknowledged profiles')
  .action(async (options) => {
    try {
      const db = getDb();

      let sql = 'SELECT * FROM repo_profiles ORDER BY last_fetched DESC';
      const result = await db.execute(sql);

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo repo profiles found'));
        return;
      }

      const now = Date.now();
      const ttlMs = 7 * 24 * 60 * 60 * 1000;

      let profiles = result.rows.map(row => {
        const r = row as unknown as any;
        return {
          repo: r.repo,
          version: r.rules_version || 1,
          lastFetched: r.last_fetched,
          contentHash: r.content_hash,
          acknowledgedHash: r.rules_acknowledged_hash,
          isStale: r.last_fetched ? (now - new Date(r.last_fetched).getTime() > ttlMs) : true,
          needsAck: r.content_hash && r.content_hash !== r.rules_acknowledged_hash
        };
      });

      // Apply filters
      if (options.stale) {
        profiles = profiles.filter(p => p.isStale);
      }
      if (options.unacked) {
        profiles = profiles.filter(p => p.needsAck);
      }

      console.log(chalk.bold('\nRepo Rules Profiles\n'));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        padRight('Repo', 35) +
        padRight('Version', 10) +
        padRight('Status', 15) +
        'Last Fetched'
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const p of profiles) {
        let status = chalk.green('ok');
        if (p.isStale) status = chalk.yellow('stale');
        if (p.needsAck) status = chalk.red('needs ack');

        console.log(
          padRight(p.repo, 35) +
          padRight(`v${p.version}`, 10) +
          padRight(status, 15) +
          (p.lastFetched || 'never')
        );
      }

      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.dim(`\n${profiles.length} profile(s)`));

      // Show commands for stale/unacked
      const staleCount = profiles.filter(p => p.isStale).length;
      const unackCount = profiles.filter(p => p.needsAck).length;

      if (staleCount > 0) {
        console.log(chalk.yellow(`\n${staleCount} stale - run: bounty rules refresh <repo>`));
      }
      if (unackCount > 0) {
        console.log(chalk.red(`${unackCount} need acknowledgement - run: bounty rules acknowledge <repo>`));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to list rules:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

function padRight(s: string, len: number): string {
  return s.padEnd(len);
}
