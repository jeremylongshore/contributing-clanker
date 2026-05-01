#!/usr/bin/env npx ts-node
/**
 * Migrate bounty tracker CSV to Firestore
 *
 * Usage: npx ts-node scripts/migrate-csv.ts [--dry-run]
 */

import { Firestore } from '@google-cloud/firestore';
import * as fs from 'fs';
import * as path from 'path';

const CSV_PATH = path.join(__dirname, '../../000-docs/002-PM-BKLG-bounty-tracker.csv');
const COLLECTION = 'bounties';

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

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    // Handle commas in quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = values[i] || '';
    });

    return row as CsvRow;
  });
}

function parseValue(bountyStr: string): number {
  // Parse "$4000" or "4000" to number
  const cleaned = bountyStr.replace(/[$,]/g, '');
  return parseInt(cleaned, 10) || 0;
}

function mapStatus(csvStatus: string): string {
  const statusMap: Record<string, string> = {
    'Available': 'open',
    'available': 'open',
    'Open': 'open',
    'open': 'open',
    'Claimed': 'claimed',
    'claimed': 'claimed',
    'In Progress': 'in_progress',
    'in_progress': 'in_progress',
    'Submitted': 'submitted',
    'submitted': 'submitted',
    'Merged': 'completed',
    'merged': 'completed',
    'Completed': 'completed',
    'completed': 'completed',
    'Paid': 'paid',
    'paid': 'paid',
    'Cancelled': 'cancelled',
    'cancelled': 'cancelled',
    'Blocked': 'cancelled',
    'blocked': 'cancelled'
  };
  return statusMap[csvStatus] || 'open';
}

function determineSource(repo: string): string {
  // Common bounty platforms
  if (repo.includes('algora')) return 'algora';
  if (repo.includes('gitcoin')) return 'gitcoin';
  return 'github';
}

function generateId(repo: string, issue: string): string {
  const cleanRepo = repo.toLowerCase().replace(/[^a-z0-9]/g, '');
  const timestamp = Date.now().toString(36);
  return `${cleanRepo}-${issue || timestamp}`;
}

async function migrate(dryRun: boolean = false) {
  console.log(`\nBounty CSV Migration${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('='.repeat(50));

  // Read CSV
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(content);
  console.log(`\nFound ${rows.length} bounties in CSV\n`);

  // Initialize Firestore
  const db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'bounty-system-prod'
  });

  const now = new Date().toISOString();
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const id = generateId(row.repo, row.issue);

    try {
      // Check if already exists
      const existing = await db.collection(COLLECTION).doc(id).get();
      if (existing.exists) {
        console.log(`  SKIP: ${id} (already exists)`);
        skipped++;
        continue;
      }

      const bounty = {
        id,
        title: row.task || `${row.repo} Issue #${row.issue}`,
        value: parseValue(row.bounty),
        currency: 'USD',
        status: mapStatus(row.status),
        source: determineSource(row.repo),
        repo: row.repo,
        issue: row.issue ? parseInt(row.issue, 10) : undefined,
        issueUrl: row.issue ? `https://github.com/${row.repo}/issues/${row.issue}` : undefined,
        pr: row.pr_number ? parseInt(row.pr_number, 10) : undefined,
        prUrl: row.pr_number ? `https://github.com/${row.repo}/pull/${row.pr_number}` : undefined,
        domainId: 'default',
        description: row.notes || undefined,
        labels: [],
        technologies: extractTechnologies(row.notes),
        timeline: [{
          timestamp: row.date_started || now,
          message: 'Imported from CSV',
          type: 'status_change' as const
        }],
        competition: row.competition || 'UNKNOWN',
        createdAt: row.date_started || now,
        updatedAt: now,
        completedAt: row.date_completed || undefined
      };

      if (dryRun) {
        console.log(`  CREATE: ${id}`);
        console.log(`    Title: ${bounty.title}`);
        console.log(`    Value: $${bounty.value}`);
        console.log(`    Status: ${bounty.status}`);
      } else {
        await db.collection(COLLECTION).doc(id).set(bounty);
        console.log(`  CREATE: ${id} - ${bounty.title} ($${bounty.value})`);
      }
      created++;

    } catch (error) {
      console.error(`  ERROR: ${id} - ${error}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\nMigration ${dryRun ? 'preview' : 'complete'}:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Total:   ${rows.length}\n`);
}

function extractTechnologies(notes: string): string[] {
  const techs: string[] = [];
  const notesLower = notes.toLowerCase();

  const techMap: Record<string, string> = {
    'scala': 'Scala',
    'rust': 'Rust',
    'python': 'Python',
    'typescript': 'TypeScript',
    'javascript': 'JavaScript',
    'go': 'Go',
    'golang': 'Go',
    'java': 'Java',
    'kotlin': 'Kotlin',
    'swift': 'Swift',
    'webassembly': 'WebAssembly',
    'wasm': 'WebAssembly',
    'react': 'React',
    'vue': 'Vue',
    'angular': 'Angular',
    'node': 'Node.js',
    'deno': 'Deno',
    'bun': 'Bun'
  };

  for (const [key, value] of Object.entries(techMap)) {
    if (notesLower.includes(key)) {
      techs.push(value);
    }
  }

  return [...new Set(techs)];
}

// Run
const dryRun = process.argv.includes('--dry-run');
migrate(dryRun).catch(console.error);
