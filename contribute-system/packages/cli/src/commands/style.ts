/**
 * Style Command - Repo Style Profile Management
 *
 * Fetch, view, and lint against repo-specific style guides.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import {
  ensureRepoStyle,
  checkStyleGate,
  lintAgainstStyle,
  formatStyleForSlack,
  type StyleGuide,
  type StyleProfile
} from '../lib/style';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const styleCommand = new Command('style')
  .description('Manage repo style guides');

/**
 * Fetch/refresh style guide for a repo
 */
styleCommand
  .command('fetch <repo>')
  .description('Fetch or refresh style guide from repo')
  .option('--limit-prs <n>', 'Number of PRs to sample', '20')
  .option('--limit-comments <n>', 'Number of comments to sample', '30')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (repo, options) => {
    const spinner = ora(`Fetching style guide for ${repo}...`).start();

    try {
      const config = await getConfig();
      const token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!token) {
        spinner.fail('GitHub token required');
        process.exit(1);
      }

      const { guide, profile, changed } = await ensureRepoStyle(repo, token, {
        force: true,
        limitPRs: parseInt(options.limitPrs, 10),
        limitComments: parseInt(options.limitComments, 10),
        skipSlack: options.slack === false
      });

      spinner.succeed('Style guide fetched');

      console.log(chalk.bold(`\nStyle Guide: ${repo}\n`));
      console.log(chalk.dim('─'.repeat(50)));

      // PR Body Style
      console.log(chalk.bold('\nPR Body Style'));
      console.log(`  Length: ${guide.prBodyStyle.lengthTarget}`);
      console.log(`  Headings: ${guide.prBodyStyle.usesHeadings}`);
      console.log(`  Bullet density: ${guide.prBodyStyle.bulletDensity}`);
      console.log(`  Tone: ${guide.prBodyStyle.tone}`);

      if (guide.prBodyStyle.commonHeadings.length > 0) {
        console.log(`  Common headings: ${guide.prBodyStyle.commonHeadings.join(', ')}`);
      }

      // Testing section
      console.log(chalk.bold('\nTesting'));
      console.log(`  Section expected: ${guide.testingSection.present ? 'Yes' : 'No'}`);

      // Commit naming
      console.log(chalk.bold('\nCommits'));
      console.log(`  Conventional: ${guide.commitNaming.conventional ? 'Yes' : 'No'}`);
      if (guide.commitNaming.format) {
        console.log(`  Format: ${guide.commitNaming.format}`);
      }

      // Issue refs
      console.log(chalk.bold('\nIssue References'));
      console.log(`  Style: ${guide.linkingBehavior.issueRefStyle} #123`);

      // Red flags
      if (guide.redFlags.length > 0) {
        console.log(chalk.bold('\nThings to Avoid'));
        for (const flag of guide.redFlags) {
          console.log(chalk.yellow(`  - ${flag}`));
        }
      }

      // Examples
      if (guide.examples.length > 0) {
        console.log(chalk.bold('\nExample PR Titles'));
        for (const example of guide.examples.slice(0, 3)) {
          console.log(chalk.dim(`  "${example}"`));
        }
      }

      console.log(chalk.dim('\n─'.repeat(50)));
      console.log(`  Version: ${profile.styleVersion}`);
      console.log(`  Sampled: ${profile.styleSampledAt}`);
      console.log(`  TTL: ${profile.styleTtlDays} days`);

      if (changed) {
        console.log(chalk.yellow('\nStyle guide has changed since last fetch!'));
      }

      // Post to Slack
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: formatStyleForSlack(repo, profile.styleGuideSummary, profile.styleVersion)
        } as SlackMessage);
        console.log(chalk.dim('\nSlack notification sent'));
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to fetch style guide');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show style guide for a repo
 */
styleCommand
  .command('show <repo>')
  .description('Show cached style guide for a repo')
  .action(async (repo) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      if (result.rows.length === 0 || !(result.rows[0] as any).style_guide_json) {
        console.log(chalk.yellow(`\nNo style guide for ${repo}`));
        console.log(chalk.dim('Run: bounty style fetch ' + repo));
        return;
      }

      const row = result.rows[0] as unknown as any;
      const guide: StyleGuide = JSON.parse(row.style_guide_json);

      console.log(chalk.bold(`\nStyle Guide: ${repo}\n`));
      console.log(chalk.dim('─'.repeat(50)));

      if (row.style_guide_summary) {
        for (const line of row.style_guide_summary.split('\n')) {
          console.log(`  ${line}`);
        }
      }

      console.log(chalk.dim('\n─'.repeat(50)));
      console.log(`  Version: ${row.style_version || 1}`);
      console.log(`  Sampled: ${row.style_sampled_at || 'never'}`);

      // Check freshness
      const gate = await checkStyleGate(repo);
      if (!gate.passed) {
        console.log(chalk.yellow(`\n  Status: STALE`));
        console.log(chalk.dim(`  ${gate.reason}`));
      } else {
        console.log(chalk.green(`\n  Status: Fresh`));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show style guide:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Lint content against style guide
 */
styleCommand
  .command('lint')
  .description('Lint content against repo style guide')
  .requiredOption('-r, --repo <repo>', 'Repo to lint against')
  .option('-i, --in <file>', 'Input file to lint')
  .option('-t, --text <text>', 'Text to lint directly')
  .action(async (options) => {
    try {
      const db = getDb();

      // Get style guide
      const result = await db.execute({
        sql: 'SELECT style_guide_json FROM repo_profiles WHERE repo = ?',
        args: [options.repo]
      });

      if (result.rows.length === 0 || !(result.rows[0] as any).style_guide_json) {
        console.log(chalk.yellow(`\nNo style guide for ${options.repo}`));
        console.log(chalk.dim('Run: bounty style fetch ' + options.repo));
        process.exit(1);
      }

      const guide: StyleGuide = JSON.parse((result.rows[0] as any).style_guide_json);

      // Get content to lint
      let content: string;
      if (options.in) {
        if (!fs.existsSync(options.in)) {
          console.error(chalk.red(`File not found: ${options.in}`));
          process.exit(1);
        }
        content = fs.readFileSync(options.in, 'utf-8');
      } else if (options.text) {
        content = options.text;
      } else {
        console.error(chalk.red('Either --in or --text is required'));
        process.exit(1);
      }

      // Run lint
      const { passed, issues } = lintAgainstStyle(content, guide);

      console.log(chalk.bold(`\nStyle Lint: ${options.repo}\n`));
      console.log(chalk.dim('─'.repeat(50)));

      if (passed) {
        console.log(chalk.green('  ✓ All style checks passed'));
      } else {
        console.log(chalk.red(`  ✗ ${issues.length} issue(s) found\n`));
        for (const issue of issues) {
          console.log(chalk.yellow(`  - ${issue}`));
        }
      }

      console.log(chalk.dim('\n─'.repeat(50)));
      console.log('');

      if (!passed) {
        process.exit(1);
      }

    } catch (error) {
      console.error('Failed to lint:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List repos with style guides
 */
styleCommand
  .command('list')
  .description('List repos with style guides')
  .option('--stale', 'Only show stale guides')
  .action(async (options) => {
    try {
      const db = getDb();

      const result = await db.execute(
        'SELECT repo, style_sampled_at, style_ttl_days, style_version FROM repo_profiles WHERE style_guide_json IS NOT NULL ORDER BY style_sampled_at DESC'
      );

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo style guides found'));
        return;
      }

      const now = Date.now();
      let profiles = result.rows.map(row => {
        const r = row as unknown as any;
        const ttlMs = (r.style_ttl_days || 30) * 24 * 60 * 60 * 1000;
        const sampledAt = r.style_sampled_at ? new Date(r.style_sampled_at).getTime() : 0;
        const isStale = !r.style_sampled_at || (now - sampledAt > ttlMs);

        return {
          repo: r.repo,
          version: r.style_version || 1,
          sampledAt: r.style_sampled_at,
          isStale
        };
      });

      if (options.stale) {
        profiles = profiles.filter(p => p.isStale);
      }

      console.log(chalk.bold('\nRepo Style Guides\n'));
      console.log(chalk.dim('─'.repeat(70)));
      console.log(
        padRight('Repo', 35) +
        padRight('Version', 10) +
        padRight('Status', 10) +
        'Last Sampled'
      );
      console.log(chalk.dim('─'.repeat(70)));

      for (const p of profiles) {
        const status = p.isStale ? chalk.yellow('stale') : chalk.green('fresh');
        console.log(
          padRight(p.repo, 35) +
          padRight(`v${p.version}`, 10) +
          padRight(status, 10) +
          (p.sampledAt || 'never')
        );
      }

      console.log(chalk.dim('─'.repeat(70)));
      console.log(chalk.dim(`\n${profiles.length} guide(s)`));

      const staleCount = profiles.filter(p => p.isStale).length;
      if (staleCount > 0) {
        console.log(chalk.yellow(`\n${staleCount} stale - run: bounty style fetch <repo>`));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to list style guides:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

function padRight(s: string, len: number): string {
  // Handle chalk-wrapped strings
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}
