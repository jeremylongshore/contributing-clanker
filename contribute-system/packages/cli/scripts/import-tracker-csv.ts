/**
 * One-shot import: 000-docs/002-PM-BKLG-contribution-tracker.csv → SQLite `bounties` table
 *
 * Local-first migration. Reads the historical CSV tracker and inserts each row
 * as a contribution into ~/.bounty-system/bounty.db. Idempotent: reruns skip
 * existing IDs.
 *
 * Status mapping:
 *   CSV "Available" → 'open'
 *   CSV "PR Submitted" → 'submitted'
 *   CSV "In Progress" → 'in_progress'
 *   CSV "Completed" / "Paid" → 'completed' / 'paid'
 *   CSV "Blocked" → 'cancelled'
 *
 * Money parsing: "$4000" → 4000, "$25-500" → 25 (lower bound), "$1.5K" → 1500
 *
 * Usage:
 *   pnpm --filter=@contribute/cli exec node -e \
 *     "require('./packages/cli/dist/index.js')" import-tracker-csv [--dry-run]
 *
 * Or directly:
 *   node contribute-system/scripts/import-tracker-csv.cjs [--dry-run]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@libsql/client';
import { homedir } from 'os';
import { join } from 'path';

const DB_PATH = process.env.BOUNTY_DB || `file:${join(homedir(), '.bounty-system', 'bounty.db')}`;
// __dirname = contribute-system/packages/cli/scripts/ → repo root is 4 up
const CSV_PATH = resolve(__dirname, '../../../../000-docs/002-PM-BKLG-contribution-tracker.csv');
const dryRun = process.argv.includes('--dry-run');

interface CsvRow {
  repo: string;
  issue: string;
  task: string;
  bounty: string;
  status: string;
  pr_number: string;
  lines: string;
  competition: string;
  date_started: string;
  date_completed: string;
  notes: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Naive CSV parse — fine for this 27-row tracker with no embedded commas
    const cells = line.split(',');
    const row: any = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row as CsvRow;
  });
}

function parseMoney(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[$,]/g, '').trim();
  const dashMatch = cleaned.match(/^(\d+)\s*-\s*\d+/);
  if (dashMatch) return parseInt(dashMatch[1], 10);
  const kMatch = cleaned.match(/^([\d.]+)\s*[Kk]/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeStatus(s: string): string {
  const k = (s || '').toLowerCase().trim();
  if (k === 'available' || k === 'open' || k === '') return 'open';
  if (k.includes('pr submitted') || k === 'submitted') return 'submitted';
  if (k.includes('in progress') || k === 'claimed' || k === 'in_progress') return 'in_progress';
  if (k === 'completed' || k === 'merged') return 'completed';
  if (k === 'paid') return 'paid';
  if (k === 'blocked' || k === 'cancelled' || k === 'rejected') return 'cancelled';
  return 'open';
}

function deriveSource(repo: string): string {
  const r = repo.toLowerCase();
  if (r === 'screenpipe' || r === 'tscircuit' || r === 'golemcloud' || r === 'cal-com' || r === 'calcom' || r === 'algora') return 'algora';
  return 'github';
}

function makeId(repo: string, issue: string, task: string): string {
  if (issue) return `tracker-${repo}-${issue}`;
  // No issue number — use task slug
  const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `tracker-${repo}-${slug || 'general'}`;
}

async function main() {
  const csvText = readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csvText);
  console.log(`Parsed ${rows.length} rows from ${CSV_PATH}`);
  console.log(`Target DB: ${DB_PATH}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  const db = createClient({ url: DB_PATH });
  let imported = 0;
  let skipped = 0;
  let total = 0;

  for (const row of rows) {
    if (!row.repo) continue;
    total++;
    const id = makeId(row.repo, row.issue, row.task);
    const existing = await db.execute({ sql: 'SELECT 1 FROM bounties WHERE id = ?', args: [id] });
    if (existing.rows.length > 0) {
      skipped++;
      console.log(`  ↪ skip (already exists): ${id}`);
      continue;
    }

    const value = parseMoney(row.bounty);
    const status = normalizeStatus(row.status);
    const source = deriveSource(row.repo);
    const issueNum = row.issue ? parseInt(row.issue, 10) : null;
    const prNum = row.pr_number ? parseInt(row.pr_number, 10) : null;
    const sourceUrl = row.repo && row.issue ? `https://github.com/${row.repo}/issues/${row.issue}` : null;
    const noteParts = [
      row.task ? `Task: ${row.task}` : null,
      row.lines ? `Lines: ${row.lines}` : null,
      row.competition && row.competition !== 'NONE' ? `Competition: ${row.competition}` : null,
      row.notes || null,
    ].filter(Boolean);

    if (dryRun) {
      console.log(`  + would insert: ${id} | ${row.repo}#${row.issue || '-'} | ${status} | $${value}`);
      imported++;
      continue;
    }

    await db.execute({
      sql: `INSERT INTO bounties (
        id, repo, issue, title, value, currency, status, pr_number,
        source, source_url, created_at, updated_at, notes,
        claimed_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)`,
      args: [
        id, row.repo, issueNum, row.task || null, value, status, prNum,
        source, sourceUrl, noteParts.join(' | ') || null,
        row.date_started || null, row.date_completed || null,
      ],
    });
    imported++;
    console.log(`  ✓ inserted: ${id} | ${row.repo}#${row.issue || '-'} | ${status} | $${value}`);
  }

  console.log(`\n${dryRun ? 'Would import' : 'Imported'}: ${imported}, Skipped: ${skipped}, Total: ${total}`);

  if (!dryRun) {
    const count = await db.execute('SELECT COUNT(*) as n FROM bounties');
    console.log(`Total rows in bounties table now: ${(count.rows[0] as any).n}`);
  }

  db.close();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
