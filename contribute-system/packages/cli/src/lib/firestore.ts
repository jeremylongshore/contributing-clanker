import { Firestore } from '@google-cloud/firestore';
import { COLLECTIONS } from '@contribute/core';
import type { Bounty, Domain, LedgerEntry, Proof } from '@contribute/core';
import * as fs from 'fs';
import * as path from 'path';

let db: Firestore | null = null;

// CSV Fallback Support
const CSV_PATH = path.resolve(__dirname, '../../../../000-docs/002-PM-BKLG-bounty-tracker.csv');

interface CSVBounty {
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

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
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

function parseBountyValue(valueStr: string): number {
  if (!valueStr) return 0;
  const match = valueStr.match(/\$?([\d,]+)/);
  if (match) {
    return parseInt(match[1].replace(/,/g, ''), 10);
  }
  // Handle ranges like "$25-500"
  const rangeMatch = valueStr.match(/\$?(\d+)-(\d+)/);
  if (rangeMatch) {
    return parseInt(rangeMatch[1], 10);
  }
  return 0;
}

function mapCSVStatusToBountyStatus(csvStatus: string): string {
  const status = csvStatus.toLowerCase().trim();
  switch (status) {
    case 'available': return 'open';
    case 'merged': return 'completed';
    case 'submitted': return 'submitted';
    case 'superseded': return 'cancelled';
    case 'closed': return 'cancelled';
    default: return 'open';
  }
}

export function readCSVBounties(): Bounty[] {
  if (!fs.existsSync(CSV_PATH)) {
    console.warn(`CSV file not found: ${CSV_PATH}`);
    return [];
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const bounties: Bounty[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    const row: CSVBounty = {
      repo: values[0] || '',
      issue: values[1] || '',
      task: values[2] || '',
      bounty: values[3] || '',
      status: values[4] || '',
      pr_number: values[5] || '',
      lines: values[6] || '',
      competition: values[7] || '',
      date_started: values[8] || '',
      date_completed: values[9] || '',
      notes: values[10] || ''
    };

    // Skip empty rows
    if (!row.repo && !row.task) continue;

    const id = `csv-${row.repo}-${row.issue || i}`;
    const value = parseBountyValue(row.bounty);
    const status = mapCSVStatusToBountyStatus(row.status);

    const bounty: Bounty = {
      id,
      title: row.task || `${row.repo} #${row.issue}`,
      description: row.notes || undefined,
      value,
      currency: 'USD',
      status: status as any,
      source: 'github',
      repo: row.repo || undefined,
      issue: row.issue ? parseInt(row.issue, 10) : undefined,
      pr: row.pr_number ? parseInt(row.pr_number, 10) : undefined,
      domainId: 'default',
      labels: row.competition ? [row.competition] : [],
      technologies: [],
      timeline: [],
      createdAt: row.date_started || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: row.date_started || undefined,
      completedAt: row.date_completed || undefined,
      notes: row.notes || undefined
    };

    bounties.push(bounty);
  }

  return bounties;
}

export function writeCSVBounties(bounties: Bounty[]): void {
  const headers = ['repo', 'issue', 'task', 'bounty', 'status', 'pr_number', 'lines', 'competition', 'date_started', 'date_completed', 'notes'];

  const lines = [headers.join(',')];

  for (const b of bounties) {
    const status = b.status === 'open' ? 'Available' :
                   b.status === 'completed' ? 'MERGED' :
                   b.status === 'submitted' ? 'Submitted' :
                   b.status === 'cancelled' ? 'CLOSED' : b.status;

    const row = [
      b.repo || '',
      b.issue?.toString() || '',
      b.title || '',
      b.value ? `$${b.value}` : '',
      status,
      b.pr?.toString() || '',
      '', // lines
      b.labels?.[0] || 'NONE',
      b.startedAt?.split('T')[0] || '',
      b.completedAt?.split('T')[0] || '',
      b.notes || ''
    ];

    lines.push(row.map(v => v.includes(',') ? `"${v}"` : v).join(','));
  }

  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n');
}

export function getFirestore(): Firestore {
  if (!db) {
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'bounty-system-prod'
    });
  }
  return db;
}

// Bounties
export async function getBounties(options: {
  status?: string;
  domainId?: string;
  limit?: number;
} = {}): Promise<Bounty[]> {
  const db = getFirestore();
  let query = db.collection(COLLECTIONS.BOUNTIES)
    .orderBy('createdAt', 'desc');

  if (options.status) {
    query = query.where('status', '==', options.status);
  }
  if (options.domainId) {
    query = query.where('domainId', '==', options.domainId);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bounty));
}

// Fallback function that tries Firestore first, then CSV
export async function getBountiesWithFallback(options: {
  status?: string;
  domainId?: string;
  limit?: number;
} = {}): Promise<Bounty[]> {
  try {
    const bounties = await getBounties(options);
    return bounties;
  } catch (error: any) {
    console.warn('Firestore unavailable, using CSV fallback');
    let bounties = readCSVBounties();

    // Apply filters
    if (options.status) {
      bounties = bounties.filter(b => b.status === options.status);
    }
    if (options.domainId) {
      bounties = bounties.filter(b => b.domainId === options.domainId);
    }
    if (options.limit) {
      bounties = bounties.slice(0, options.limit);
    }

    return bounties;
  }
}

export async function getBounty(id: string): Promise<Bounty | null> {
  const db = getFirestore();
  const doc = await db.collection(COLLECTIONS.BOUNTIES).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Bounty;
}

export async function createBounty(data: Omit<Bounty, 'id'>): Promise<Bounty> {
  const db = getFirestore();
  const ref = db.collection(COLLECTIONS.BOUNTIES).doc();
  const bounty = { id: ref.id, ...data };
  await ref.set(bounty);
  return bounty;
}

export async function updateBounty(id: string, data: Partial<Bounty>): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.BOUNTIES).doc(id).update({
    ...data,
    updatedAt: new Date().toISOString()
  });
}

// Domains
export async function getDomains(): Promise<Domain[]> {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTIONS.DOMAINS).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Domain));
}

export async function getDomain(idOrSlug: string): Promise<Domain | null> {
  const db = getFirestore();

  // Try by ID first
  let doc = await db.collection(COLLECTIONS.DOMAINS).doc(idOrSlug).get();
  if (doc.exists) {
    return { id: doc.id, ...doc.data() } as Domain;
  }

  // Try by slug
  const snapshot = await db.collection(COLLECTIONS.DOMAINS)
    .where('slug', '==', idOrSlug)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const first = snapshot.docs[0];
  return { id: first.id, ...first.data() } as Domain;
}

// Ledger
export async function getLedgerEntries(options: {
  domainId?: string;
  type?: string;
  limit?: number;
} = {}): Promise<LedgerEntry[]> {
  const db = getFirestore();
  let query = db.collection(COLLECTIONS.LEDGER)
    .orderBy('date', 'desc');

  if (options.domainId) {
    query = query.where('domainId', '==', options.domainId);
  }
  if (options.type) {
    query = query.where('type', '==', options.type);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry));
}

// Proofs
export async function getProof(bountyId: string): Promise<Proof | null> {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTIONS.PROOFS)
    .where('bountyId', '==', bountyId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const first = snapshot.docs[0];
  return { id: first.id, ...first.data() } as Proof;
}

export async function createProof(data: Proof): Promise<Proof> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.PROOFS).doc(data.id).set(data);
  return data;
}

// Sessions
export interface WorkSession {
  id: string;
  bountyId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'cancelled';
  checkpoints: Array<{
    timestamp: string;
    message: string;
    hasScreenshot?: boolean;
  }>;
  recordings: Array<{
    sessionId: string;
    filename: string;
    duration: number;
    url?: string;
  }>;
}

export async function getActiveSession(bountyId?: string): Promise<WorkSession | null> {
  const db = getFirestore();
  let query = db.collection(COLLECTIONS.SESSIONS)
    .where('status', '==', 'active');

  if (bountyId) {
    query = query.where('bountyId', '==', bountyId);
  }

  const snapshot = await query.limit(1).get();
  if (snapshot.empty) return null;

  const first = snapshot.docs[0];
  return { id: first.id, ...first.data() } as WorkSession;
}

export async function getSessions(bountyId: string): Promise<WorkSession[]> {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTIONS.SESSIONS)
    .where('bountyId', '==', bountyId)
    .orderBy('startedAt', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkSession));
}

export async function saveSession(session: WorkSession): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.SESSIONS).doc(session.id).set(session, { merge: true });
}
