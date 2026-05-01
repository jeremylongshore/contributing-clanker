/**
 * Database Management Commands
 *
 * Initialize, inspect, and manage the local bounty database.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, getDbPath, isDbInitialized, closeDb } from '../lib/db';
import { runMigrations, getSchemaVersion, getTableCounts, resetDatabase } from '../lib/migrations';

export const dbCommand = new Command('db')
  .description('Manage the local bounty database');

/**
 * Initialize the database
 */
dbCommand
  .command('init')
  .description('Initialize the database with schema')
  .option('-f, --force', 'Reset and reinitialize if database exists')
  .action(async (options) => {
    const spinner = ora('Initializing database...').start();

    try {
      const initialized = await isDbInitialized();

      if (initialized && !options.force) {
        spinner.info('Database already initialized');
        console.log(chalk.dim(`Path: ${getDbPath()}`));
        console.log(chalk.dim('Use --force to reset and reinitialize'));
        return;
      }

      if (options.force && initialized) {
        spinner.text = 'Resetting database...';
        await resetDatabase();
      }

      spinner.text = 'Running migrations...';
      const { applied, current } = await runMigrations();

      spinner.succeed('Database initialized');
      console.log(chalk.dim(`Path: ${getDbPath()}`));
      console.log(chalk.dim(`Schema version: ${current}`));
      console.log(chalk.dim(`Migrations applied: ${applied}`));

    } catch (error) {
      spinner.fail('Failed to initialize database');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show database status
 */
dbCommand
  .command('status')
  .description('Show database status and table counts')
  .action(async () => {
    try {
      const initialized = await isDbInitialized();

      console.log(chalk.bold('\nBounty Database Status\n'));
      console.log(`  Path: ${chalk.cyan(getDbPath())}`);
      console.log(`  Initialized: ${initialized ? chalk.green('Yes') : chalk.red('No')}`);

      if (!initialized) {
        console.log(chalk.dim('\n  Run "bounty db init" to initialize'));
        return;
      }

      const version = await getSchemaVersion();
      const counts = await getTableCounts();

      console.log(`  Schema version: ${chalk.cyan(version)}`);

      console.log(chalk.bold('\n  Table Counts:'));
      for (const [table, count] of Object.entries(counts)) {
        console.log(`    ${table}: ${chalk.cyan(count)}`);
      }

      // Check for Turso cloud sync
      const tursoUrl = process.env.TURSO_DATABASE_URL;
      if (tursoUrl) {
        console.log(chalk.bold('\n  Cloud Sync:'));
        console.log(`    Turso URL: ${chalk.cyan(tursoUrl.slice(0, 40))}...`);
        console.log(`    Status: ${chalk.green('Enabled')}`);
      } else {
        console.log(chalk.bold('\n  Cloud Sync:'));
        console.log(chalk.dim('    Not configured (local only)'));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to get database status:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Reset the database
 */
dbCommand
  .command('reset')
  .description('Reset the database (DESTRUCTIVE)')
  .option('--confirm', 'Confirm reset without prompting')
  .action(async (options) => {
    if (!options.confirm) {
      console.log(chalk.yellow('\nThis will delete ALL bounty data.'));
      console.log(chalk.dim('Add --confirm to proceed\n'));
      return;
    }

    const spinner = ora('Resetting database...').start();

    try {
      await resetDatabase();
      const { current } = await runMigrations();

      spinner.succeed('Database reset');
      console.log(chalk.dim(`Schema version: ${current}`));

    } catch (error) {
      spinner.fail('Failed to reset database');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Run migrations
 */
dbCommand
  .command('migrate')
  .description('Run pending database migrations')
  .action(async () => {
    const spinner = ora('Running migrations...').start();

    try {
      const { applied, current } = await runMigrations();

      if (applied === 0) {
        spinner.info('Database is up to date');
      } else {
        spinner.succeed(`Applied ${applied} migration(s)`);
      }

      console.log(chalk.dim(`Schema version: ${current}`));

    } catch (error) {
      spinner.fail('Migration failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Query the database (for debugging)
 */
dbCommand
  .command('query <sql>')
  .description('Execute a raw SQL query (debug)')
  .action(async (sql) => {
    try {
      const db = getDb();
      const result = await db.execute(sql);

      if (result.rows.length === 0) {
        console.log(chalk.dim('No results'));
        return;
      }

      // Get column names
      const columns = result.columns;
      console.log(chalk.dim(columns.join(' | ')));
      console.log(chalk.dim('-'.repeat(columns.join(' | ').length)));

      // Print rows
      for (const row of result.rows) {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null) return chalk.dim('NULL');
          if (typeof val === 'string' && val.length > 50) {
            return val.slice(0, 47) + '...';
          }
          return String(val);
        });
        console.log(values.join(' | '));
      }

      console.log(chalk.dim(`\n${result.rows.length} row(s)`));

    } catch (error) {
      console.error('Query failed:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });
