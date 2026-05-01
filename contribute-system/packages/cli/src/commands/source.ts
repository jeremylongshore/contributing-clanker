/**
 * Source Management Commands - Phase 2 of Bounty Flywheel
 *
 * Manage bounty sources (Algora, GitHub search, GitHub orgs, etc.)
 * Sources feed into the incremental ingestion system.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

// Valid source types
const SOURCE_TYPES = ['algora', 'github_search', 'github_org', 'github_repo', 'manual_list', 'other'] as const;
type SourceType = typeof SOURCE_TYPES[number];

// Valid adapter types
const ADAPTER_TYPES = ['algora', 'github_label', 'github_assignment', 'direct_pr', 'custom'] as const;
type AdapterType = typeof ADAPTER_TYPES[number];

interface Source {
  id: number;
  type: SourceType;
  name: string;
  config_json: string | null;
  enabled: number;
  cadence_minutes: number;
  adapter_type: AdapterType;
  adapter_config_json: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export const sourceCommand = new Command('source')
  .description('Manage bounty sources for ingestion');

/**
 * Add a new source
 */
sourceCommand
  .command('add <type>')
  .description('Add a new bounty source')
  .requiredOption('-n, --name <name>', 'Unique name for the source')
  .option('-q, --query <query>', 'Search query (for github_search type)')
  .option('-o, --org <org>', 'GitHub organization (for github_org type)')
  .option('-r, --repo <repo>', 'GitHub repo owner/repo (for github_repo type)')
  .option('-l, --labels <labels>', 'Comma-separated labels to filter')
  .option('-c, --cadence <minutes>', 'Check interval in minutes', '720')
  .option('-a, --adapter <type>', 'Program adapter type', 'github_label')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (type: string, options) => {
    const spinner = ora('Adding source...').start();

    try {
      // Validate type
      if (!SOURCE_TYPES.includes(type as SourceType)) {
        spinner.fail(`Invalid source type: ${type}`);
        console.log(chalk.dim(`Valid types: ${SOURCE_TYPES.join(', ')}`));
        process.exit(1);
      }

      // Validate adapter type
      if (!ADAPTER_TYPES.includes(options.adapter as AdapterType)) {
        spinner.fail(`Invalid adapter type: ${options.adapter}`);
        console.log(chalk.dim(`Valid adapters: ${ADAPTER_TYPES.join(', ')}`));
        process.exit(1);
      }

      // Build config based on type
      const config: Record<string, unknown> = {};

      switch (type) {
        case 'algora':
          // Algora uses API endpoint, no extra config needed
          break;
        case 'github_search':
          if (!options.query) {
            spinner.fail('--query required for github_search type');
            process.exit(1);
          }
          config.query = options.query;
          break;
        case 'github_org':
          if (!options.org) {
            spinner.fail('--org required for github_org type');
            process.exit(1);
          }
          config.org = options.org;
          if (options.labels) {
            config.labels = options.labels.split(',').map((l: string) => l.trim());
          }
          break;
        case 'github_repo':
          if (!options.repo) {
            spinner.fail('--repo required for github_repo type');
            process.exit(1);
          }
          config.repo = options.repo;
          if (options.labels) {
            config.labels = options.labels.split(',').map((l: string) => l.trim());
          }
          break;
        case 'manual_list':
          config.repos = [];
          break;
      }

      const db = getDb();
      const now = new Date().toISOString();
      const cadence = parseInt(options.cadence, 10);

      // Check for duplicate name
      const existing = await db.execute({
        sql: 'SELECT id FROM sources WHERE name = ?',
        args: [options.name]
      });

      if (existing.rows.length > 0) {
        spinner.fail(`Source with name "${options.name}" already exists`);
        process.exit(1);
      }

      // Insert source
      const result = await db.execute({
        sql: `INSERT INTO sources
              (type, name, config_json, enabled, cadence_minutes, adapter_type, created_at, updated_at)
              VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        args: [
          type,
          options.name,
          JSON.stringify(config),
          cadence,
          options.adapter,
          now,
          now
        ]
      });

      const sourceId = result.lastInsertRowid;

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('source', ?, 'created', ?, ?)`,
        args: [String(sourceId), now, JSON.stringify({ type, name: options.name, config })]
      });

      spinner.succeed(`Source added: ${options.name} (id: ${sourceId})`);

      console.log(chalk.dim(`  Type: ${type}`));
      console.log(chalk.dim(`  Adapter: ${options.adapter}`));
      console.log(chalk.dim(`  Cadence: ${cadence} minutes`));
      if (Object.keys(config).length > 0) {
        console.log(chalk.dim(`  Config: ${JSON.stringify(config)}`));
      }

      // Notify Slack
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: `New source added: *${options.name}* (${type})\nCadence: ${cadence} minutes\nNext: Run \`bounty ingest --source "${options.name}"\` to fetch bounties`
        } as SlackMessage);
      }

      console.log(chalk.bold('\nNext step:'));
      console.log(chalk.cyan(`  bounty ingest --source "${options.name}"`));

    } catch (error) {
      spinner.fail('Failed to add source');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List all sources
 */
sourceCommand
  .command('list')
  .description('List all bounty sources')
  .option('-a, --all', 'Include disabled sources')
  .action(async (options) => {
    try {
      const db = getDb();

      let sql = 'SELECT * FROM sources';
      if (!options.all) {
        sql += ' WHERE enabled = 1';
      }
      sql += ' ORDER BY name';

      const result = await db.execute(sql);

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo sources configured'));
        console.log(chalk.dim('Add one with: bounty source add algora --name "My Source"'));
        return;
      }

      console.log(chalk.bold('\nBounty Sources\n'));
      console.log(chalk.dim('─'.repeat(90)));
      console.log(
        padRight('ID', 5) +
        padRight('Name', 25) +
        padRight('Type', 15) +
        padRight('Status', 10) +
        padRight('Last Run', 20) +
        'Cadence'
      );
      console.log(chalk.dim('─'.repeat(90)));

      for (const row of result.rows) {
        const source = row as unknown as Source;
        const status = source.enabled ? chalk.green('enabled') : chalk.dim('disabled');
        const lastRun = source.last_run_at
          ? formatRelativeTime(source.last_run_at)
          : chalk.dim('never');
        const statusIcon = source.last_status === 'ok'
          ? chalk.green('ok')
          : source.last_status === 'error'
          ? chalk.red('error')
          : chalk.dim('-');

        console.log(
          padRight(String(source.id), 5) +
          padRight(source.name, 25) +
          padRight(source.type, 15) +
          padRight(status, 10) +
          padRight(lastRun, 20) +
          `${source.cadence_minutes}m`
        );

        if (source.last_error) {
          console.log(chalk.red(`        Error: ${truncate(source.last_error, 60)}`));
        }
      }

      console.log(chalk.dim('─'.repeat(90)));
      console.log(chalk.dim(`\n${result.rows.length} source(s)`));

    } catch (error) {
      console.error('Failed to list sources:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show source details
 */
sourceCommand
  .command('show <idOrName>')
  .description('Show details for a source')
  .action(async (idOrName) => {
    try {
      const db = getDb();
      const source = await findSource(db, idOrName);

      if (!source) {
        console.log(chalk.red(`Source not found: ${idOrName}`));
        process.exit(1);
      }

      console.log(chalk.bold(`\nSource: ${source.name}\n`));
      console.log(`  ID: ${source.id}`);
      console.log(`  Type: ${source.type}`);
      console.log(`  Adapter: ${source.adapter_type}`);
      console.log(`  Status: ${source.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`);
      console.log(`  Cadence: ${source.cadence_minutes} minutes`);
      console.log(`  Created: ${source.created_at}`);
      console.log(`  Updated: ${source.updated_at}`);

      if (source.config_json) {
        console.log(chalk.bold('\n  Config:'));
        const config = JSON.parse(source.config_json);
        for (const [key, value] of Object.entries(config)) {
          console.log(`    ${key}: ${JSON.stringify(value)}`);
        }
      }

      console.log(chalk.bold('\n  Ingestion:'));
      console.log(`    Last run: ${source.last_run_at || 'never'}`);
      console.log(`    Last status: ${source.last_status || '-'}`);
      if (source.last_error) {
        console.log(`    Last error: ${chalk.red(source.last_error)}`);
      }

      // Get recent ingest runs
      const runs = await db.execute({
        sql: `SELECT * FROM ingest_runs WHERE source_id = ? ORDER BY started_at DESC LIMIT 5`,
        args: [source.id]
      });

      if (runs.rows.length > 0) {
        console.log(chalk.bold('\n  Recent Runs:'));
        for (const run of runs.rows) {
          const r = run as unknown as {
            id: number;
            started_at: string;
            status: string;
            new_items: number;
            updated_items: number;
          };
          const status = r.status === 'ok' ? chalk.green('ok') : chalk.red(r.status);
          console.log(`    ${r.started_at}: ${status} (+${r.new_items} new, ${r.updated_items} updated)`);
        }
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show source:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Enable a source
 */
sourceCommand
  .command('enable <idOrName>')
  .description('Enable a source for ingestion')
  .action(async (idOrName) => {
    await toggleSource(idOrName, true);
  });

/**
 * Disable a source
 */
sourceCommand
  .command('disable <idOrName>')
  .description('Disable a source (stops ingestion)')
  .action(async (idOrName) => {
    await toggleSource(idOrName, false);
  });

/**
 * Resume a paused source (reset backoff)
 */
sourceCommand
  .command('resume <idOrName>')
  .description('Resume a paused source and reset backoff state')
  .action(async (idOrName) => {
    const spinner = ora('Resuming source...').start();

    try {
      const db = getDb();
      const source = await findSource(db, idOrName);

      if (!source) {
        spinner.fail(`Source not found: ${idOrName}`);
        process.exit(1);
      }

      const now = new Date().toISOString();

      // Reset any repo_sources that are paused for this source
      await db.execute({
        sql: `UPDATE repo_sources
              SET status = 'active', consecutive_zero_runs = 0, backoff_state_json = NULL
              WHERE source_id = ? AND status = 'paused'`,
        args: [source.id]
      });

      // Enable the source if disabled
      await db.execute({
        sql: `UPDATE sources SET enabled = 1, last_error = NULL, updated_at = ? WHERE id = ?`,
        args: [now, source.id]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('source', ?, 'resumed', ?, ?)`,
        args: [String(source.id), now, JSON.stringify({ name: source.name })]
      });

      spinner.succeed(`Source resumed: ${source.name}`);
      console.log(chalk.dim('Backoff state reset. Run ingest to fetch new items.'));

    } catch (error) {
      spinner.fail('Failed to resume source');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Remove a source
 */
sourceCommand
  .command('remove <idOrName>')
  .description('Remove a source (does not delete indexed items)')
  .option('--confirm', 'Confirm removal without prompting')
  .action(async (idOrName, options) => {
    try {
      const db = getDb();
      const source = await findSource(db, idOrName);

      if (!source) {
        console.log(chalk.red(`Source not found: ${idOrName}`));
        process.exit(1);
      }

      if (!options.confirm) {
        console.log(chalk.yellow(`\nThis will remove source "${source.name}" (id: ${source.id})`));
        console.log(chalk.dim('Indexed items will be preserved.'));
        console.log(chalk.dim('Add --confirm to proceed\n'));
        return;
      }

      const spinner = ora('Removing source...').start();
      const now = new Date().toISOString();

      // Delete repo_sources for this source
      await db.execute({
        sql: 'DELETE FROM repo_sources WHERE source_id = ?',
        args: [source.id]
      });

      // Delete ingest_runs for this source
      await db.execute({
        sql: 'DELETE FROM ingest_runs WHERE source_id = ?',
        args: [source.id]
      });

      // Delete the source
      await db.execute({
        sql: 'DELETE FROM sources WHERE id = ?',
        args: [source.id]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('source', ?, 'removed', ?, ?)`,
        args: [String(source.id), now, JSON.stringify({ name: source.name })]
      });

      spinner.succeed(`Source removed: ${source.name}`);

    } catch (error) {
      console.error('Failed to remove source:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function findSource(db: ReturnType<typeof getDb>, idOrName: string): Promise<Source | null> {
  // Try by ID first
  const byId = await db.execute({
    sql: 'SELECT * FROM sources WHERE id = ?',
    args: [idOrName]
  });

  if (byId.rows.length > 0) {
    return byId.rows[0] as unknown as Source;
  }

  // Try by name
  const byName = await db.execute({
    sql: 'SELECT * FROM sources WHERE name = ?',
    args: [idOrName]
  });

  if (byName.rows.length > 0) {
    return byName.rows[0] as unknown as Source;
  }

  return null;
}

async function toggleSource(idOrName: string, enabled: boolean): Promise<void> {
  const spinner = ora(`${enabled ? 'Enabling' : 'Disabling'} source...`).start();

  try {
    const db = getDb();
    const source = await findSource(db, idOrName);

    if (!source) {
      spinner.fail(`Source not found: ${idOrName}`);
      process.exit(1);
    }

    const now = new Date().toISOString();

    await db.execute({
      sql: 'UPDATE sources SET enabled = ?, updated_at = ? WHERE id = ?',
      args: [enabled ? 1 : 0, now, source.id]
    });

    // Log event
    await db.execute({
      sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
            VALUES ('source', ?, ?, ?, ?)`,
      args: [
        String(source.id),
        enabled ? 'enabled' : 'disabled',
        now,
        JSON.stringify({ name: source.name })
      ]
    });

    spinner.succeed(`Source ${enabled ? 'enabled' : 'disabled'}: ${source.name}`);

  } catch (error) {
    spinner.fail(`Failed to ${enabled ? 'enable' : 'disable'} source`);
    console.error(error);
    process.exit(1);
  } finally {
    closeDb();
  }
}

function padRight(s: string, len: number): string {
  return s.padEnd(len);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
