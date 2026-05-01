import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { getBounty, getProof } from '../lib/firestore';
import { formatBountyDetail } from '../lib/format';

export const showCommand = new Command('show')
  .description('Show bounty details')
  .argument('<id>', 'Bounty ID')
  .option('--proof', 'Include proof bundle info')
  .action(async (id, options) => {
    const spinner = ora('Fetching bounty...').start();

    try {
      const bounty = await getBounty(id);

      if (!bounty) {
        spinner.fail(`Bounty not found: ${id}`);
        process.exit(1);
      }

      spinner.stop();
      console.log(formatBountyDetail(bounty));

      if (options.proof) {
        const proof = await getProof(id);
        if (proof) {
          console.log(chalk.bold('\nProof Bundle:'));
          console.log(`  Recordings: ${proof.recordings?.length || 0}`);
          console.log(`  Screenshots: ${proof.screenshots?.length || 0}`);
          console.log(`  Lines: +${proof.linesAdded} -${proof.linesDeleted}`);
          console.log(`  Files: ${proof.filesChanged}`);
          if (proof.vetting) {
            console.log(`  Vetting: ${proof.vetting.passed ? chalk.green('PASSED') : chalk.red('FAILED')}`);
          }
          if (proof.portalUrl) {
            console.log(`  Portal: ${proof.portalUrl}`);
          }
        } else {
          console.log(chalk.dim('\nNo proof bundle yet'));
        }
      }

    } catch (error) {
      spinner.fail('Failed to fetch bounty');
      console.error(error);
      process.exit(1);
    }
  });
