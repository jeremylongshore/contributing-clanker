/**
 * Ingest Command - Phase 3 of Bounty Flywheel
 *
 * Run incremental ingestion from configured sources.
 * Populates issues_index for local-first hunt queries.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';
import { getConnector, type IssueItem, type ConnectorConfig } from '../lib/connectors';

interface Source {
  id: number;
  type: string;
  name: string;
  config_json: string | null;
  enabled: number;
  cadence_minutes: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

export const ingestCommand = new Command('ingest')
  .description('Run incremental ingestion from bounty sources')
  .option('-s, --source <name>', 'Run specific source by name or ID')
  .option('-d, --due', 'Only run sources that are due based on cadence')
  .option('-a, --all', 'Run all enabled sources (ignore cadence)')
  .option('-r, --refresh', 'Force full refresh (ignore last update time)')
  .option('--no-slack', 'Skip Slack notification')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const spinner = ora('Preparing ingestion...').start();

    try {
      const config = await getConfig();
      const db = getDb();
      const now = new Date();

      // Build list of sources to run
      let sources: Source[] = [];

      if (options.source) {
        // Run specific source
        const source = await findSource(db, options.source);
        if (!source) {
          spinner.fail(`Source not found: ${options.source}`);
          process.exit(1);
        }
        if (!source.enabled) {
          spinner.fail(`Source is disabled: ${source.name}`);
          process.exit(1);
        }
        sources = [source];
      } else if (options.all) {
        // Run all enabled sources
        const result = await db.execute('SELECT * FROM sources WHERE enabled = 1 ORDER BY name');
        sources = result.rows as unknown as Source[];
      } else if (options.due) {
        // Run sources that are due based on cadence
        sources = await getDueSources(db, now);
      } else {
        // Default: run all due sources
        sources = await getDueSources(db, now);
        if (sources.length === 0) {
          spinner.info('No sources are due for ingestion');
          console.log(chalk.dim('Use --all to force run all sources'));
          return;
        }
      }

      if (sources.length === 0) {
        spinner.warn('No sources to run');
        console.log(chalk.dim('Add sources with: bounty source add <type> --name <name>'));
        return;
      }

      spinner.succeed(`Found ${sources.length} source(s) to ingest`);

      // Summary stats
      let totalNew = 0;
      let totalUpdated = 0;
      let totalErrors: string[] = [];
      const sourceResults: { name: string; newItems: number; updatedItems: number; status: string }[] = [];

      // Run each source
      for (const source of sources) {
        const sourceSpinner = ora(`Ingesting from ${source.name}...`).start();

        try {
          const result = await runSourceIngestion(db, source, config, options.refresh, options.verbose);

          totalNew += result.newItems;
          totalUpdated += result.updatedItems;
          totalErrors = totalErrors.concat(result.errors);

          const status = result.errors.length > 0 ? 'error' : 'ok';
          sourceResults.push({
            name: source.name,
            newItems: result.newItems,
            updatedItems: result.updatedItems,
            status
          });

          if (result.errors.length > 0) {
            sourceSpinner.warn(`${source.name}: +${result.newItems} new, ${result.updatedItems} updated (${result.errors.length} errors)`);
            if (options.verbose) {
              for (const err of result.errors) {
                console.log(chalk.red(`  ${err}`));
              }
            }
          } else {
            sourceSpinner.succeed(`${source.name}: +${result.newItems} new, ${result.updatedItems} updated`);
          }

        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          sourceSpinner.fail(`${source.name}: ${errMsg}`);
          totalErrors.push(`${source.name}: ${errMsg}`);
          sourceResults.push({
            name: source.name,
            newItems: 0,
            updatedItems: 0,
            status: 'error'
          });

          // Update source with error
          await db.execute({
            sql: `UPDATE sources SET last_status = 'error', last_error = ?, last_run_at = ?, updated_at = ?
                  WHERE id = ?`,
            args: [errMsg, now.toISOString(), now.toISOString(), source.id]
          });
        }
      }

      // Print summary
      console.log(chalk.bold('\nIngestion Summary'));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Sources: ${sources.length}`);
      console.log(`  New items: ${chalk.green(`+${totalNew}`)}`);
      console.log(`  Updated: ${chalk.cyan(totalUpdated)}`);
      if (totalErrors.length > 0) {
        console.log(`  Errors: ${chalk.red(totalErrors.length)}`);
      }

      // Notify Slack
      if (options.slack !== false && (totalNew > 0 || totalErrors.length > 0)) {
        const statusEmoji = totalErrors.length > 0 ? 'warning' : 'ok';
        const slackContent = buildSlackSummary(sourceResults, totalNew, totalUpdated, totalErrors);

        await sendSlackNotification({
          type: 'bounty_qualified',
          content: slackContent
        } as SlackMessage);

        console.log(chalk.dim('\nSlack notification sent'));
      }

      // Suggest next step
      if (totalNew > 0) {
        console.log(chalk.bold('\nNext step:'));
        console.log(chalk.cyan('  bounty hunt'));
        console.log('');
      }

    } catch (error) {
      spinner.fail('Ingestion failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Find source by ID or name
 */
async function findSource(db: ReturnType<typeof getDb>, idOrName: string): Promise<Source | null> {
  // Try by ID
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

/**
 * Get sources that are due based on cadence
 */
async function getDueSources(db: ReturnType<typeof getDb>, now: Date): Promise<Source[]> {
  const result = await db.execute('SELECT * FROM sources WHERE enabled = 1');
  const sources = result.rows as unknown as Source[];

  return sources.filter(source => {
    if (!source.last_run_at) return true; // Never run

    const lastRun = new Date(source.last_run_at);
    const cadenceMs = source.cadence_minutes * 60 * 1000;
    const nextRun = new Date(lastRun.getTime() + cadenceMs);

    return now >= nextRun;
  });
}

/**
 * Run ingestion for a single source
 */
async function runSourceIngestion(
  db: ReturnType<typeof getDb>,
  source: Source,
  config: any,
  forceRefresh: boolean,
  verbose: boolean
): Promise<{ newItems: number; updatedItems: number; errors: string[] }> {
  const now = new Date().toISOString();
  const connector = getConnector(source.type);

  if (!connector) {
    throw new Error(`No connector for source type: ${source.type}`);
  }

  // Parse source config
  const sourceConfig = source.config_json ? JSON.parse(source.config_json) : {};

  // Build connector config
  const connectorConfig: ConnectorConfig = {
    token: config.githubToken || process.env.GITHUB_TOKEN,
    limit: 100,
    ...sourceConfig
  };

  // Use incremental update if not forcing refresh
  if (!forceRefresh && source.last_run_at) {
    connectorConfig.updatedSince = source.last_run_at;
  }

  // Create ingest run record
  const runResult = await db.execute({
    sql: `INSERT INTO ingest_runs (source_id, started_at, status)
          VALUES (?, ?, 'running')`,
    args: [source.id, now]
  });
  const runId = runResult.lastInsertRowid;

  // Run the connector
  const result = await connector.fetch(connectorConfig);

  // Process items
  let newItems = 0;
  let updatedItems = 0;

  for (const item of result.items) {
    // Ensure repo exists
    await ensureRepo(db, item.repo);

    // Check if item exists
    const existing = await db.execute({
      sql: 'SELECT id, updated_at_remote FROM issues_index WHERE url = ?',
      args: [item.url]
    });

    if (existing.rows.length === 0) {
      // New item
      await db.execute({
        sql: `INSERT INTO issues_index
              (source_id, repo, url, issue_number, title, body_excerpt, labels_json,
               state, updated_at_remote, ingested_at, bounty_amount, bounty_currency,
               is_paid, is_bounty_like)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          source.id,
          item.repo,
          item.url,
          item.issueNumber,
          item.title,
          item.bodyExcerpt,
          JSON.stringify(item.labels),
          item.state,
          item.updatedAt,
          now,
          item.bountyAmount,
          item.bountyCurrency,
          item.isPaid ? 1 : 0,
          item.isBountyLike ? 1 : 0
        ]
      });
      newItems++;
    } else {
      // Check if actually updated
      const existingRow = existing.rows[0] as unknown as { id: number; updated_at_remote: string };
      if (existingRow.updated_at_remote !== item.updatedAt) {
        await db.execute({
          sql: `UPDATE issues_index
                SET title = ?, body_excerpt = ?, labels_json = ?, state = ?,
                    updated_at_remote = ?, bounty_amount = ?, bounty_currency = ?,
                    is_paid = ?, is_bounty_like = ?
                WHERE id = ?`,
          args: [
            item.title,
            item.bodyExcerpt,
            JSON.stringify(item.labels),
            item.state,
            item.updatedAt,
            item.bountyAmount,
            item.bountyCurrency,
            item.isPaid ? 1 : 0,
            item.isBountyLike ? 1 : 0,
            existingRow.id
          ]
        });
        updatedItems++;
      }
    }
  }

  // Update source status
  const status = result.errors.length > 0 ? 'error' : 'ok';
  const lastError = result.errors.length > 0 ? result.errors[0] : null;

  await db.execute({
    sql: `UPDATE sources
          SET last_run_at = ?, last_status = ?, last_error = ?, updated_at = ?
          WHERE id = ?`,
    args: [now, status, lastError, now, source.id]
  });

  // Update ingest run
  await db.execute({
    sql: `UPDATE ingest_runs
          SET finished_at = ?, status = ?, scanned_repos = ?, scanned_items = ?,
              new_items = ?, updated_items = ?, error_text = ?
          WHERE id = ?`,
    args: [
      now,
      status,
      result.scannedRepos,
      result.scannedItems,
      newItems,
      updatedItems,
      lastError,
      runId
    ]
  });

  // Log event
  await db.execute({
    sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
          VALUES ('source', ?, 'ingested', ?, ?)`,
    args: [
      String(source.id),
      now,
      JSON.stringify({
        runId: Number(runId),
        scannedRepos: result.scannedRepos,
        scannedItems: result.scannedItems,
        newItems,
        updatedItems,
        errors: result.errors.length
      })
    ]
  });

  return { newItems, updatedItems, errors: result.errors };
}

/**
 * Ensure repo exists in repos table
 */
async function ensureRepo(db: ReturnType<typeof getDb>, repo: string): Promise<void> {
  const existing = await db.execute({
    sql: 'SELECT repo FROM repos WHERE repo = ?',
    args: [repo]
  });

  if (existing.rows.length === 0) {
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO repos (repo, last_seen_at, created_at, updated_at)
            VALUES (?, ?, ?, ?)`,
      args: [repo, now, now, now]
    });
  } else {
    // Update last_seen_at
    await db.execute({
      sql: 'UPDATE repos SET last_seen_at = ? WHERE repo = ?',
      args: [new Date().toISOString(), repo]
    });
  }
}

/**
 * Build Slack summary message
 */
function buildSlackSummary(
  sourceResults: { name: string; newItems: number; updatedItems: number; status: string }[],
  totalNew: number,
  totalUpdated: number,
  errors: string[]
): string {
  const lines: string[] = [];

  lines.push('*INGEST RUN SUMMARY*');
  lines.push('');

  for (const result of sourceResults) {
    const icon = result.status === 'ok' ? ':white_check_mark:' : ':warning:';
    lines.push(`${icon} *${result.name}*: +${result.newItems} new, ${result.updatedItems} updated`);
  }

  lines.push('');
  lines.push(`*Total:* +${totalNew} new, ${totalUpdated} updated`);

  if (errors.length > 0) {
    lines.push('');
    lines.push(`*Errors:* ${errors.length}`);
    // Show first 3 errors
    for (const err of errors.slice(0, 3)) {
      lines.push(`  - ${err}`);
    }
    if (errors.length > 3) {
      lines.push(`  ... and ${errors.length - 3} more`);
    }
  }

  lines.push('');
  lines.push('Run `bounty hunt` to see new opportunities');

  return lines.join('\n');
}
