/**
 * Metrics Command - Analytics and leaderboards
 *
 * Track performance across sources, repos, maintainers, and money.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getDb, closeDb } from '../lib/db';

export const metricsCommand = new Command('metrics')
  .description('View analytics and leaderboards');

/**
 * Source efficiency metrics
 */
metricsCommand
  .command('sources')
  .description('Show source efficiency metrics')
  .action(async () => {
    try {
      const db = getDb();

      // Get source stats
      const result = await db.execute(`
        SELECT
          s.name,
          s.type,
          s.enabled,
          s.last_status,
          COUNT(DISTINCT ii.id) as issue_count,
          COUNT(DISTINCT CASE WHEN ii.is_paid = 1 THEN ii.id END) as paid_count,
          MAX(s.last_run_at) as last_run
        FROM sources s
        LEFT JOIN issues_index ii ON ii.source_id = s.id
        GROUP BY s.id
        ORDER BY issue_count DESC
      `);

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo sources configured'));
        console.log(chalk.dim('Run: bounty source add <type> --name <name>'));
        closeDb();
        return;
      }

      console.log(chalk.bold('\nSource Metrics\n'));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        padRight('Source', 25) +
        padRight('Type', 15) +
        padRight('Issues', 10) +
        padRight('Paid', 10) +
        padRight('Status', 10) +
        'Last Run'
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const row of result.rows) {
        const r = row as any;
        const statusColor = r.last_status === 'ok' ? chalk.green : (r.last_status === 'error' ? chalk.red : chalk.dim);
        console.log(
          padRight(r.name || 'Unknown', 25) +
          padRight(r.type || '-', 15) +
          padRight(String(r.issue_count || 0), 10) +
          padRight(String(r.paid_count || 0), 10) +
          padRight(statusColor(r.last_status || 'never'), 10) +
          (r.last_run ? formatDate(r.last_run) : chalk.dim('never'))
        );
      }

      console.log(chalk.dim('─'.repeat(80)));

      // Show ingest run stats
      const ingestResult = await db.execute(`
        SELECT
          COUNT(*) as total_runs,
          SUM(new_items) as total_new,
          SUM(updated_items) as total_updated,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count
        FROM ingest_runs
        WHERE started_at > datetime('now', '-7 days')
      `);

      if (ingestResult.rows.length > 0) {
        const stats = ingestResult.rows[0] as any;
        console.log('\n' + chalk.bold('Last 7 Days'));
        console.log(`  Ingest runs: ${stats.total_runs || 0}`);
        console.log(`  New items: ${stats.total_new || 0}`);
        console.log(`  Updated: ${stats.total_updated || 0}`);
        console.log(`  Errors: ${stats.error_count || 0}`);
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show source metrics:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Repo metrics
 */
metricsCommand
  .command('repos')
  .description('Show repo metrics (TTFTG, CI health, merge velocity)')
  .option('--limit <n>', 'Number of repos', '20')
  .action(async (options) => {
    try {
      const db = getDb();
      const limit = parseInt(options.limit, 10);

      const result = await db.execute({
        sql: `
          SELECT
            r.repo,
            rm.ttfg_last_minutes,
            rm.ttfg_p50_minutes,
            rm.ci_flake_rate,
            rm.median_merge_minutes,
            rp.preferred_env,
            rp.maintainer_score_cached
          FROM repos r
          LEFT JOIN repo_metrics rm ON rm.repo = r.repo
          LEFT JOIN repo_profiles rp ON rp.repo = r.repo
          ORDER BY rm.ttfg_p50_minutes ASC NULLS LAST
          LIMIT ?
        `,
        args: [limit]
      });

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo repos with metrics'));
        console.log(chalk.dim('Run: bounty bootstrap <repo> to capture TTFTG'));
        closeDb();
        return;
      }

      console.log(chalk.bold('\nRepo Metrics\n'));
      console.log(chalk.dim('─'.repeat(90)));
      console.log(
        padRight('Repo', 35) +
        padRight('TTFTG', 10) +
        padRight('P50', 8) +
        padRight('Flake%', 8) +
        padRight('Merge', 10) +
        padRight('Env', 8) +
        'Maint'
      );
      console.log(chalk.dim('─'.repeat(90)));

      for (const row of result.rows) {
        const r = row as any;
        const envColor = r.preferred_env === 'vm' ? chalk.yellow : chalk.green;
        console.log(
          padRight(r.repo || 'Unknown', 35) +
          padRight(r.ttfg_last_minutes ? `${r.ttfg_last_minutes}m` : '-', 10) +
          padRight(r.ttfg_p50_minutes ? `${r.ttfg_p50_minutes}m` : '-', 8) +
          padRight(r.ci_flake_rate ? `${(r.ci_flake_rate * 100).toFixed(0)}%` : '-', 8) +
          padRight(r.median_merge_minutes ? `${r.median_merge_minutes}m` : '-', 10) +
          padRight(r.preferred_env ? envColor(r.preferred_env) : '-', 8) +
          (r.maintainer_score_cached ? String(r.maintainer_score_cached) : '-')
        );
      }

      console.log(chalk.dim('─'.repeat(90)));
      console.log('');

    } catch (error) {
      console.error('Failed to show repo metrics:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Maintainer leaderboard
 */
metricsCommand
  .command('maintainers')
  .description('Show maintainer leaderboard')
  .option('--repo <repo>', 'Filter by repo')
  .option('--min-score <n>', 'Minimum overall score', '0')
  .action(async (options) => {
    try {
      const db = getDb();

      let sql = `
        SELECT
          m.github_login,
          ms.repo,
          ms.responsiveness_score,
          ms.fairness_score,
          ms.merge_velocity_score,
          ms.overall_score,
          ms.computed_at
        FROM maintainers m
        JOIN maintainer_scores ms ON ms.maintainer_id = m.id
        WHERE ms.overall_score >= ?
      `;
      const args: any[] = [parseInt(options.minScore, 10)];

      if (options.repo) {
        sql += ' AND ms.repo = ?';
        args.push(options.repo);
      }

      sql += ' ORDER BY ms.overall_score DESC LIMIT 30';

      const result = await db.execute({ sql, args });

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo maintainer scores'));
        console.log(chalk.dim('Run: bounty maintainer sync <repo>'));
        closeDb();
        return;
      }

      console.log(chalk.bold('\nMaintainer Leaderboard\n'));
      console.log(chalk.dim('─'.repeat(85)));
      console.log(
        padRight('Login', 20) +
        padRight('Repo', 25) +
        padRight('Resp', 8) +
        padRight('Fair', 8) +
        padRight('Merge', 8) +
        padRight('Overall', 10) +
        'Updated'
      );
      console.log(chalk.dim('─'.repeat(85)));

      for (const row of result.rows) {
        const r = row as any;
        const overallColor = r.overall_score >= 70 ? chalk.green : (r.overall_score >= 50 ? chalk.yellow : chalk.red);
        console.log(
          padRight(r.github_login || 'Unknown', 20) +
          padRight(r.repo || '-', 25) +
          padRight(r.responsiveness_score ? String(r.responsiveness_score) : '-', 8) +
          padRight(r.fairness_score ? String(r.fairness_score) : '-', 8) +
          padRight(r.merge_velocity_score ? String(r.merge_velocity_score) : '-', 8) +
          padRight(overallColor(r.overall_score ? String(r.overall_score) : '-'), 10) +
          (r.computed_at ? formatDate(r.computed_at) : '-')
        );
      }

      console.log(chalk.dim('─'.repeat(85)));
      console.log('');

    } catch (error) {
      console.error('Failed to show maintainer metrics:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Money tracking
 */
metricsCommand
  .command('money')
  .description('Show payment tracking')
  .option('--period <period>', 'Time period: week|month|quarter|year|all', 'month')
  .action(async (options) => {
    try {
      const db = getDb();

      // Period filter
      let dateFilter = '';
      switch (options.period) {
        case 'week':
          dateFilter = "AND em.payout_received_at > datetime('now', '-7 days')";
          break;
        case 'month':
          dateFilter = "AND em.payout_received_at > datetime('now', '-30 days')";
          break;
        case 'quarter':
          dateFilter = "AND em.payout_received_at > datetime('now', '-90 days')";
          break;
        case 'year':
          dateFilter = "AND em.payout_received_at > datetime('now', '-365 days')";
          break;
        case 'all':
          dateFilter = '';
          break;
      }

      // Get paid engagements
      const result = await db.execute(`
        SELECT
          e.repo,
          em.payout_amount,
          em.payout_currency,
          em.payout_received_at,
          em.actual_minutes,
          em.est_minutes_best,
          CASE
            WHEN em.actual_minutes > 0 THEN (em.payout_amount / (em.actual_minutes / 60.0))
            ELSE NULL
          END as hourly_actual
        FROM engagements e
        JOIN engagement_metrics em ON em.engagement_id = e.id
        WHERE em.payout_received_at IS NOT NULL
        ${dateFilter}
        ORDER BY em.payout_received_at DESC
      `);

      console.log(chalk.bold(`\nPayment Tracking (${options.period})\n`));

      if (result.rows.length === 0) {
        console.log(chalk.dim('No payments recorded in this period'));
        closeDb();
        return;
      }

      console.log(chalk.dim('─'.repeat(85)));
      console.log(
        padRight('Repo', 30) +
        padRight('Amount', 12) +
        padRight('Est', 8) +
        padRight('Actual', 8) +
        padRight('$/hr', 10) +
        'Paid'
      );
      console.log(chalk.dim('─'.repeat(85)));

      let totalAmount = 0;
      let totalMinutes = 0;

      for (const row of result.rows) {
        const r = row as any;
        const amount = r.payout_amount || 0;
        const currency = r.payout_currency || 'USD';
        totalAmount += amount;
        totalMinutes += r.actual_minutes || 0;

        const hourlyColor = r.hourly_actual >= 100 ? chalk.green : (r.hourly_actual >= 50 ? chalk.yellow : chalk.red);

        console.log(
          padRight(r.repo || 'Unknown', 30) +
          padRight(`${currency === 'USD' ? '$' : ''}${amount.toFixed(0)}`, 12) +
          padRight(r.est_minutes_best ? `${r.est_minutes_best}m` : '-', 8) +
          padRight(r.actual_minutes ? `${r.actual_minutes}m` : '-', 8) +
          padRight(r.hourly_actual ? hourlyColor(`$${r.hourly_actual.toFixed(0)}`) : '-', 10) +
          formatDate(r.payout_received_at)
        );
      }

      console.log(chalk.dim('─'.repeat(85)));

      // Summary
      const avgHourly = totalMinutes > 0 ? (totalAmount / (totalMinutes / 60)) : 0;
      console.log('\n' + chalk.bold('Summary'));
      console.log(`  Total earned: ${chalk.green('$' + totalAmount.toFixed(0))}`);
      console.log(`  Total time: ${Math.round(totalMinutes / 60)} hours`);
      console.log(`  Avg hourly: ${avgHourly >= 100 ? chalk.green('$' + avgHourly.toFixed(0)) : chalk.yellow('$' + avgHourly.toFixed(0))}`);
      console.log(`  Payments: ${result.rows.length}`);
      console.log('');

    } catch (error) {
      console.error('Failed to show money metrics:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * EV Leaderboard
 */
metricsCommand
  .command('leaderboard')
  .description('Show engagement leaderboard')
  .option('--by <metric>', 'Sort by: ev|hourly|credibility', 'ev')
  .option('--limit <n>', 'Number of results', '20')
  .action(async (options) => {
    try {
      const db = getDb();
      const limit = parseInt(options.limit, 10);

      let orderBy = 'em.ev_amount DESC';
      if (options.by === 'hourly') {
        orderBy = '(em.payout_amount / NULLIF(em.actual_minutes / 60.0, 0)) DESC';
      } else if (options.by === 'credibility') {
        orderBy = 'em.credibility_score DESC';
      }

      const result = await db.execute({
        sql: `
          SELECT
            e.id,
            e.kind,
            e.repo,
            e.status,
            em.ev_amount,
            em.payout_amount,
            em.actual_minutes,
            em.win_probability,
            em.credibility_score,
            CASE
              WHEN em.actual_minutes > 0 THEN (em.payout_amount / (em.actual_minutes / 60.0))
              ELSE NULL
            END as hourly_actual
          FROM engagements e
          LEFT JOIN engagement_metrics em ON em.engagement_id = e.id
          WHERE em.ev_amount IS NOT NULL OR em.credibility_score IS NOT NULL
          ORDER BY ${orderBy}
          LIMIT ?
        `,
        args: [limit]
      });

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo engagements with metrics'));
        console.log(chalk.dim('Run: bounty qualify <url>'));
        closeDb();
        return;
      }

      console.log(chalk.bold(`\nLeaderboard (by ${options.by})\n`));
      console.log(chalk.dim('─'.repeat(95)));
      console.log(
        padRight('ID', 35) +
        padRight('Kind', 12) +
        padRight('Status', 12) +
        padRight('EV', 10) +
        padRight('Win%', 8) +
        padRight('$/hr', 10) +
        'Cred'
      );
      console.log(chalk.dim('─'.repeat(95)));

      for (const row of result.rows) {
        const r = row as any;
        const kindColor = r.kind === 'paid_bounty' ? chalk.green : chalk.cyan;
        const evColor = r.ev_amount > 50 ? chalk.green : (r.ev_amount > 0 ? chalk.yellow : chalk.red);

        console.log(
          padRight(r.id || 'Unknown', 35) +
          padRight(kindColor(r.kind || '-'), 12) +
          padRight(r.status || '-', 12) +
          padRight(r.ev_amount ? evColor('$' + r.ev_amount.toFixed(0)) : '-', 10) +
          padRight(r.win_probability ? `${(r.win_probability * 100).toFixed(0)}%` : '-', 8) +
          padRight(r.hourly_actual ? `$${r.hourly_actual.toFixed(0)}` : '-', 10) +
          (r.credibility_score ? String(r.credibility_score) : '-')
        );
      }

      console.log(chalk.dim('─'.repeat(95)));
      console.log('');

    } catch (error) {
      console.error('Failed to show leaderboard:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Export metrics
 */
metricsCommand
  .command('export')
  .description('Export metrics to CSV')
  .option('--format <format>', 'Output format: csv|json', 'csv')
  .option('--out <path>', 'Output path', './metrics-export')
  .action(async (options) => {
    try {
      const db = getDb();
      const fs = await import('fs');
      const path = await import('path');

      const basePath = options.out;
      const format = options.format;

      // Export engagements
      const engagements = await db.execute(`
        SELECT
          e.*,
          em.payout_amount,
          em.ev_amount,
          em.est_minutes_best,
          em.actual_minutes,
          em.win_probability,
          em.outcome
        FROM engagements e
        LEFT JOIN engagement_metrics em ON em.engagement_id = e.id
      `);

      if (format === 'csv') {
        const csvPath = basePath + '-engagements.csv';
        const headers = Object.keys(engagements.rows[0] || {}).join(',');
        const rows = engagements.rows.map((r: any) =>
          Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
        );
        fs.writeFileSync(csvPath, headers + '\n' + rows.join('\n'));
        console.log(`Exported: ${csvPath}`);
      } else {
        const jsonPath = basePath + '-engagements.json';
        fs.writeFileSync(jsonPath, JSON.stringify(engagements.rows, null, 2));
        console.log(`Exported: ${jsonPath}`);
      }

      // Export sources
      const sources = await db.execute('SELECT * FROM sources');
      if (format === 'csv') {
        const csvPath = basePath + '-sources.csv';
        const headers = Object.keys(sources.rows[0] || {}).join(',');
        const rows = sources.rows.map((r: any) =>
          Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
        );
        fs.writeFileSync(csvPath, headers + '\n' + rows.join('\n'));
        console.log(`Exported: ${csvPath}`);
      } else {
        const jsonPath = basePath + '-sources.json';
        fs.writeFileSync(jsonPath, JSON.stringify(sources.rows, null, 2));
        console.log(`Exported: ${jsonPath}`);
      }

      console.log(chalk.green('\nExport complete'));

    } catch (error) {
      console.error('Failed to export metrics:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function padRight(s: string, len: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}
