import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { createBounty } from '../lib/firestore';
import { getConfig } from '../lib/config';
import { nowISO } from '@contribute/core';
import type { BountySource } from '@contribute/core';

export const createCommand = new Command('create')
  .description('Create a new bounty manually')
  .requiredOption('-t, --title <title>', 'Bounty title')
  .requiredOption('-v, --value <value>', 'Bounty value in USD')
  .option('-s, --source <source>', 'Source (github, algora, internal, etc.)', 'internal')
  .option('-r, --repo <repo>', 'Repository (org/repo)')
  .option('-i, --issue <number>', 'Issue number')
  .option('-u, --url <url>', 'Issue URL')
  .option('-d, --domain <domain>', 'Domain ID')
  .option('--description <desc>', 'Description')
  .action(async (options) => {
    const spinner = ora('Creating bounty...').start();
    const config = getConfig();

    try {
      const now = nowISO();
      const bounty = await createBounty({
        title: options.title,
        value: parseFloat(options.value),
        currency: 'USD',
        status: 'open',
        source: options.source as BountySource,
        repo: options.repo,
        issue: options.issue ? parseInt(options.issue, 10) : undefined,
        issueUrl: options.url,
        domainId: options.domain || config.defaultDomain,
        description: options.description,
        labels: [],
        technologies: [],
        timeline: [{
          timestamp: now,
          message: 'Bounty created',
          type: 'status_change'
        }],
        createdAt: now,
        updatedAt: now
      });

      spinner.succeed(`Created bounty: ${chalk.bold(bounty.id)}`);
      console.log(`  Title: ${bounty.title}`);
      console.log(`  Value: $${bounty.value}`);
      console.log(`  Status: ${bounty.status}`);

    } catch (error) {
      spinner.fail('Failed to create bounty');
      console.error(error);
      process.exit(1);
    }
  });
