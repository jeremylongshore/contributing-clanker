/**
 * CSV Bounty Import API Route
 *
 * Imports bounties from CSV files for manual tracking.
 * Supports common CSV formats from various bounty platforms.
 */

import { NextRequest, NextResponse } from 'next/server';

interface ImportedBounty {
  id: string;
  title: string;
  description?: string;
  value: number | null;
  source: string;
  sourceUrl?: string;
  repo?: string;
  org?: string;
  labels?: string[];
  technologies?: string[];
  status: string;
  createdAt?: string;
}

// Expected CSV columns (flexible - will try to match)
const COLUMN_MAPPINGS: Record<string, string[]> = {
  title: ['title', 'name', 'issue', 'bounty', 'task'],
  description: ['description', 'desc', 'body', 'details'],
  value: ['value', 'amount', 'reward', 'price', 'bounty_amount', 'usd'],
  source: ['source', 'platform', 'origin'],
  sourceUrl: ['url', 'link', 'source_url', 'issue_url', 'github_url'],
  repo: ['repo', 'repository', 'project'],
  org: ['org', 'organization', 'owner'],
  labels: ['labels', 'tags', 'categories'],
  technologies: ['tech', 'technologies', 'stack', 'language'],
  status: ['status', 'state'],
  createdAt: ['created', 'created_at', 'date', 'posted']
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      if (values[index] !== undefined) {
        row[header] = values[index];
      }
    });

    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function findColumn(row: Record<string, string>, field: string): string | undefined {
  const mappings = COLUMN_MAPPINGS[field] || [field];

  for (const mapping of mappings) {
    if (row[mapping] !== undefined) {
      return row[mapping];
    }
  }

  // Try partial matches
  const rowKeys = Object.keys(row);
  for (const mapping of mappings) {
    const match = rowKeys.find(k => k.includes(mapping) || mapping.includes(k));
    if (match) return row[match];
  }

  return undefined;
}

function parseValue(str: string | undefined): number | null {
  if (!str) return null;
  const match = str.match(/[\d,]+(?:\.\d{2})?/);
  if (match) {
    return parseFloat(match[0].replace(/,/g, ''));
  }
  return null;
}

function parseArray(str: string | undefined): string[] {
  if (!str) return [];
  return str.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

function rowToBounty(row: Record<string, string>, index: number, defaultSource: string): ImportedBounty | null {
  const title = findColumn(row, 'title');
  if (!title) return null;

  const sourceUrl = findColumn(row, 'sourceUrl');
  const repo = findColumn(row, 'repo');

  return {
    id: `import-${defaultSource}-${index}-${Date.now()}`,
    title,
    description: findColumn(row, 'description'),
    value: parseValue(findColumn(row, 'value')),
    source: findColumn(row, 'source') || defaultSource,
    sourceUrl,
    repo,
    org: findColumn(row, 'org') || repo?.split('/')[0],
    labels: parseArray(findColumn(row, 'labels')),
    technologies: parseArray(findColumn(row, 'technologies')),
    status: findColumn(row, 'status') || 'open',
    createdAt: findColumn(row, 'createdAt') || new Date().toISOString()
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const source = formData.get('source') as string || 'csv-import';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'File must be a CSV' },
        { status: 400 }
      );
    }

    // Parse CSV
    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'CSV file is empty or invalid' },
        { status: 400 }
      );
    }

    // Convert to bounties
    const bounties: ImportedBounty[] = [];
    const errors: string[] = [];

    rows.forEach((row, index) => {
      const bounty = rowToBounty(row, index, source);
      if (bounty) {
        bounties.push(bounty);
      } else {
        errors.push(`Row ${index + 2}: Missing required 'title' field`);
      }
    });

    // Return parsed bounties (caller can then save to Firestore)
    return NextResponse.json({
      success: true,
      imported: bounties.length,
      bounties,
      errors: errors.length > 0 ? errors : undefined,
      columns: rows.length > 0 ? Object.keys(rows[0]) : []
    });

  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to return expected CSV format
export async function GET() {
  const sampleCSV = `title,value,source,url,repo,labels,technologies,status
"Fix authentication bug",$50,github,https://github.com/org/repo/issues/123,org/repo,"bug,good-first-issue","TypeScript,React",open
"Add dark mode support",$100,algora,https://console.algora.io/bounty/456,org/repo,"feature,ui","CSS,React",open
"Optimize database queries",$200,gitcoin,https://gitcoin.co/issue/789,org/repo,"performance","Python,PostgreSQL",claimed`;

  return new NextResponse(sampleCSV, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="bounty-import-template.csv"'
    }
  });
}
