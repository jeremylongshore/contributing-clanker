import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { getBounty, updateBounty } from '../lib/firestore';
import { nowISO } from '@contribute/core';

export const claimCommand = new Command('claim')
  .description('Claim a contribution for work')
  .argument('<id>', 'Contribution ID')
  .option('--skip-preflight', 'Skip pre-flight checks (not recommended)')
  .option('-n, --note <note>', 'Note to add when claiming')
  .action(async (id, options) => {
    const spinner = ora('Fetching bounty...').start();

    try {
      const bounty = await getBounty(id);

      if (!bounty) {
        spinner.fail(`Contribution not found: ${id}`);
        process.exit(1);
      }

      if (bounty.status !== 'open') {
        spinner.fail(`Contribution is not open (status: ${bounty.status})`);
        process.exit(1);
      }

      // Pre-flight checks reminder
      if (!options.skipPreflight) {
        spinner.info('Pre-flight checklist:');
        console.log(chalk.yellow('\n  Before claiming, verify:'));
        console.log('  [ ] Read CONTRIBUTING.md in the target repo');
        console.log('  [ ] Check if tests pass on main branch');
        console.log('  [ ] Verify dependencies install correctly');
        console.log('  [ ] Look for competing PRs on the issue');
        console.log('  [ ] Understand the acceptance criteria');
        console.log('');
        console.log(chalk.dim('  Use --skip-preflight to bypass this reminder\n'));
      }

      spinner.text = 'Claiming bounty...';
      spinner.start();

      const now = nowISO();
      await updateBounty(id, {
        status: 'claimed',
        claimedAt: now,
        timeline: [
          ...(bounty.timeline || []),
          {
            timestamp: now,
            message: options.note || 'Contribution claimed',
            type: 'status_change'
          }
        ]
      });

      spinner.succeed(`Claimed bounty: ${chalk.bold(bounty.title)}`);
      console.log(`\n${chalk.bold('Next steps:')}`);
      console.log(`  1. Read the issue and repo guidelines carefully`);
      console.log(`  2. Start work with: ${chalk.cyan(`bounty work start ${id}`)}`);
      console.log(`  3. Add checkpoints: ${chalk.cyan(`bounty work checkpoint "message"`)}`);
      console.log(`  4. Submit when ready: ${chalk.cyan(`bounty submit ${id}`)}`);

    } catch (error) {
      spinner.fail('Failed to claim bounty');
      console.error(error);
      process.exit(1);
    }
  });

export const unclaimCommand = new Command('unclaim')
  .description('Unclaim a contribution (return to open)')
  .argument('<id>', 'Contribution ID')
  .option('-r, --reason <reason>', 'Reason for unclaiming')
  .action(async (id, options) => {
    const spinner = ora('Unclaiming bounty...').start();

    try {
      const bounty = await getBounty(id);

      if (!bounty) {
        spinner.fail(`Contribution not found: ${id}`);
        process.exit(1);
      }

      if (bounty.status !== 'claimed') {
        spinner.fail(`Contribution is not claimed (status: ${bounty.status})`);
        process.exit(1);
      }

      const now = nowISO();
      await updateBounty(id, {
        status: 'open',
        claimedAt: undefined,
        timeline: [
          ...(bounty.timeline || []),
          {
            timestamp: now,
            message: options.reason || 'Contribution unclaimed',
            type: 'status_change'
          }
        ]
      });

      spinner.succeed(`Unclaimed bounty: ${chalk.bold(bounty.title)}`);

    } catch (error) {
      spinner.fail('Failed to unclaim bounty');
      console.error(error);
      process.exit(1);
    }
  });
