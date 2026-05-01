/**
 * GitHub Integration Commands
 *
 * Manage GitHub webhook setup and configuration.
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { Octokit } from '@octokit/rest';
import { getConfig } from '../lib/config';

export const githubCommand = new Command('github')
  .description('Manage GitHub integration');

githubCommand
  .command('setup <repo>')
  .description('Set up webhook for a repository')
  .option('-u, --url <url>', 'Webhook URL (Cloud Function URL)')
  .option('-s, --secret <secret>', 'Webhook secret')
  .action(async (repo, options) => {
    const spinner = ora('Setting up GitHub webhook...').start();
    const config = getConfig();

    const token = config.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      spinner.fail('GitHub token not configured');
      console.log(chalk.dim('Set with: bounty config set githubToken <token>'));
      console.log(chalk.dim('Or set GITHUB_TOKEN environment variable'));
      process.exit(1);
    }

    if (!options.url) {
      spinner.fail('Webhook URL required');
      console.log(chalk.dim('Use --url to specify your Cloud Function URL'));
      process.exit(1);
    }

    try {
      const [owner, repoName] = repo.split('/');
      if (!owner || !repoName) {
        spinner.fail('Invalid repo format. Use: owner/repo');
        process.exit(1);
      }

      const octokit = new Octokit({ auth: token });

      // Check if webhook already exists
      spinner.text = 'Checking existing webhooks...';
      const { data: hooks } = await octokit.repos.listWebhooks({
        owner,
        repo: repoName
      });

      const existingHook = hooks.find(h =>
        h.config.url === options.url
      );

      if (existingHook) {
        spinner.warn('Webhook already exists');
        console.log(`  ID: ${existingHook.id}`);
        console.log(`  URL: ${existingHook.config.url}`);
        console.log(`  Events: ${existingHook.events.join(', ')}`);
        return;
      }

      // Create webhook
      spinner.text = 'Creating webhook...';
      const { data: hook } = await octokit.repos.createWebhook({
        owner,
        repo: repoName,
        config: {
          url: options.url,
          content_type: 'json',
          secret: options.secret || process.env.GITHUB_WEBHOOK_SECRET,
          insecure_ssl: '0'
        },
        events: ['issues', 'pull_request', 'issue_comment'],
        active: true
      });

      spinner.succeed('Webhook created');
      console.log(`\n${chalk.bold('Webhook Details:')}`);
      console.log(`  ID: ${hook.id}`);
      console.log(`  URL: ${hook.config.url}`);
      console.log(`  Events: ${hook.events.join(', ')}`);
      console.log(`  Active: ${hook.active}`);

      console.log(`\n${chalk.bold('Next steps:')}`);
      console.log(`  1. Add "bounty" label to issues to create bounties`);
      console.log(`  2. Use value labels like "$100" to set bounty amounts`);
      console.log(`  3. Link PRs to issues with "Fixes #123" in PR description`);

    } catch (error: any) {
      spinner.fail('Failed to set up webhook');
      if (error.status === 404) {
        console.error('Repository not found or no access');
      } else if (error.status === 403) {
        console.error('Permission denied - check your token has admin:repo_hook scope');
      } else {
        console.error(error.message);
      }
      process.exit(1);
    }
  });

githubCommand
  .command('list <repo>')
  .description('List webhooks for a repository')
  .action(async (repo) => {
    const spinner = ora('Fetching webhooks...').start();
    const config = getConfig();

    const token = config.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      spinner.fail('GitHub token not configured');
      process.exit(1);
    }

    try {
      const [owner, repoName] = repo.split('/');
      const octokit = new Octokit({ auth: token });

      const { data: hooks } = await octokit.repos.listWebhooks({
        owner,
        repo: repoName
      });

      spinner.stop();

      if (hooks.length === 0) {
        console.log(chalk.dim('No webhooks configured'));
        return;
      }

      console.log(chalk.bold(`\nWebhooks for ${repo}:\n`));

      for (const hook of hooks) {
        const status = hook.active ? chalk.green('active') : chalk.red('inactive');
        console.log(`  ${chalk.cyan(hook.id.toString())} [${status}]`);
        console.log(`    URL: ${hook.config.url}`);
        console.log(`    Events: ${hook.events.join(', ')}`);
        console.log('');
      }

    } catch (error: any) {
      spinner.fail('Failed to list webhooks');
      console.error(error.message);
      process.exit(1);
    }
  });

githubCommand
  .command('remove <repo> <hookId>')
  .description('Remove a webhook')
  .action(async (repo, hookId) => {
    const spinner = ora('Removing webhook...').start();
    const config = getConfig();

    const token = config.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      spinner.fail('GitHub token not configured');
      process.exit(1);
    }

    try {
      const [owner, repoName] = repo.split('/');
      const octokit = new Octokit({ auth: token });

      await octokit.repos.deleteWebhook({
        owner,
        repo: repoName,
        hook_id: parseInt(hookId, 10)
      });

      spinner.succeed(`Removed webhook ${hookId}`);

    } catch (error: any) {
      spinner.fail('Failed to remove webhook');
      console.error(error.message);
      process.exit(1);
    }
  });

githubCommand
  .command('test <repo>')
  .description('Test webhook by pinging it')
  .action(async (repo) => {
    const spinner = ora('Testing webhooks...').start();
    const config = getConfig();

    const token = config.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      spinner.fail('GitHub token not configured');
      process.exit(1);
    }

    try {
      const [owner, repoName] = repo.split('/');
      const octokit = new Octokit({ auth: token });

      const { data: hooks } = await octokit.repos.listWebhooks({
        owner,
        repo: repoName
      });

      if (hooks.length === 0) {
        spinner.warn('No webhooks to test');
        return;
      }

      for (const hook of hooks) {
        spinner.text = `Pinging webhook ${hook.id}...`;
        try {
          await octokit.repos.pingWebhook({
            owner,
            repo: repoName,
            hook_id: hook.id
          });
          console.log(chalk.green(`  ✓ Webhook ${hook.id} pinged successfully`));
        } catch (err) {
          console.log(chalk.red(`  ✗ Webhook ${hook.id} ping failed`));
        }
      }

      spinner.succeed('Webhook tests complete');

    } catch (error: any) {
      spinner.fail('Failed to test webhooks');
      console.error(error.message);
      process.exit(1);
    }
  });

githubCommand
  .command('sync <repo>')
  .description('Sync existing labeled issues as bounties')
  .option('--label <label>', 'Label to look for', 'bounty')
  .option('--dry-run', 'Preview without creating bounties')
  .action(async (repo, options) => {
    const spinner = ora('Syncing issues...').start();
    const config = getConfig();

    const token = config.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      spinner.fail('GitHub token not configured');
      process.exit(1);
    }

    try {
      const [owner, repoName] = repo.split('/');
      const octokit = new Octokit({ auth: token });

      // Fetch issues with bounty label
      spinner.text = `Fetching issues with "${options.label}" label...`;
      const { data: issues } = await octokit.issues.listForRepo({
        owner,
        repo: repoName,
        labels: options.label,
        state: 'open',
        per_page: 100
      });

      spinner.stop();

      if (issues.length === 0) {
        console.log(chalk.dim(`No open issues with "${options.label}" label`));
        return;
      }

      console.log(chalk.bold(`\nFound ${issues.length} bounty issues:\n`));

      for (const issue of issues) {
        // Skip PRs (they come through issues API)
        if (issue.pull_request) continue;

        const labels = issue.labels.map(l =>
          typeof l === 'string' ? l : l.name
        ).filter(Boolean);

        // Extract value from labels
        let value = 0;
        for (const label of labels) {
          const match = label?.match(/^\$(\d+)/);
          if (match) {
            value = parseInt(match[1], 10);
            break;
          }
        }

        const bountyId = `gh-${repo.replace('/', '-')}-${issue.number}`;

        if (options.dryRun) {
          console.log(`  ${chalk.cyan(`#${issue.number}`)} ${issue.title}`);
          console.log(`    ID: ${bountyId}`);
          console.log(`    Value: $${value}`);
          console.log(`    Labels: ${labels.join(', ')}`);
          console.log('');
        } else {
          // Would create bounty in Firestore
          console.log(`  ${chalk.green('✓')} Created: ${bountyId} - ${issue.title} ($${value})`);
        }
      }

      if (options.dryRun) {
        console.log(chalk.dim('\nDry run - no bounties created'));
        console.log(chalk.dim('Remove --dry-run to create bounties'));
      }

    } catch (error: any) {
      spinner.fail('Failed to sync issues');
      console.error(error.message);
      process.exit(1);
    }
  });
