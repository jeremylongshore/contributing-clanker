import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfig, resetConfig } from '../lib/config';

export const configCommand = new Command('config')
  .description('Manage CLI configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const config = getConfig();
    console.log(chalk.bold('\nBounty CLI Configuration\n'));

    console.log(chalk.bold('  Core:'));
    console.log(`    Project ID:      ${config.projectId || chalk.yellow('not set')}`);
    console.log(`    Default Domain:  ${config.defaultDomain}`);
    console.log(`    Proof Bucket:    ${config.proofBucket || chalk.yellow('not set')}`);

    console.log(chalk.bold('\n  Integration:'));
    console.log(`    GitHub Token:    ${config.githubToken ? chalk.green('configured') : chalk.yellow('not set')}`);
    console.log(`    Slack Webhook:   ${config.slackBountyBotWebhook ? chalk.green('configured') : chalk.yellow('not set')}`);
    console.log(`    Slack Channel:   ${config.slackChannel || chalk.dim('default')}`);

    console.log(chalk.bold('\n  Payment Defaults:'));
    console.log(`    Method:          ${config.defaultPaymentMethod || chalk.dim('not set')}`);
    console.log(`    Terms:           ${config.defaultPaymentTerms || chalk.dim('not set')}`);

    console.log('');
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => {
    const validKeys = [
      'projectId', 'defaultDomain', 'proofBucket',
      'githubToken', 'slackBountyBotWebhook', 'slackChannel',
      'defaultPaymentMethod', 'defaultPaymentTerms'
    ];
    if (!validKeys.includes(key)) {
      console.error(chalk.red(`Invalid key: ${key}`));
      console.log(`\nValid keys:`);
      console.log(`  Core:        projectId, defaultDomain, proofBucket`);
      console.log(`  Integration: githubToken, slackBountyBotWebhook, slackChannel`);
      console.log(`  Payment:     defaultPaymentMethod, defaultPaymentTerms`);
      process.exit(1);
    }
    setConfig(key as keyof ReturnType<typeof getConfig>, value);
    // Mask sensitive values in output
    const displayValue = key.toLowerCase().includes('token') || key.toLowerCase().includes('webhook')
      ? value.slice(0, 10) + '...'
      : value;
    console.log(chalk.green(`Set ${key} = ${displayValue}`));
  });

configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .action(() => {
    resetConfig();
    console.log(chalk.green('Configuration reset to defaults'));
  });
