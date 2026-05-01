import { Command } from 'commander';
import ora from 'ora';
import { getBounties } from '../lib/firestore';
import { formatBountiesTable } from '../lib/format';

export const listCommand = new Command('list')
  .description('List all bounties')
  .option('-s, --status <status>', 'Filter by status (open, claimed, in_progress, completed, etc.)')
  .option('-d, --domain <domain>', 'Filter by domain')
  .option('-n, --limit <number>', 'Limit results', '50')
  .action(async (options) => {
    const spinner = ora('Fetching bounties...').start();

    try {
      const bounties = await getBounties({
        status: options.status,
        domainId: options.domain,
        limit: parseInt(options.limit, 10)
      });

      spinner.stop();
      console.log(formatBountiesTable(bounties));

      // Summary
      const total = bounties.length;
      const totalValue = bounties.reduce((sum, b) => sum + b.value, 0);
      console.log(`\nTotal: ${total} bounties | Value: $${totalValue.toLocaleString()}`);

    } catch (error) {
      spinner.fail('Failed to fetch bounties');
      console.error(error);
      process.exit(1);
    }
  });
