/**
 * Local-first data access layer (formerly Firestore-backed).
 *
 * After the GCP exit (April 2026), this module is a thin libsql shim.
 * Filename + function names retained so legacy commands (list/show/create/
 * claim/submit/sync/vet/work) keep working without touching their imports.
 *
 * Tables touched: `bounties`, `proofs`, `sessions`. Domains + ledger are
 * stubbed (no consumer code paths reach them today; revisit if we need them).
 */

import type { Contribution, Domain, LedgerEntry, Proof } from '@contribute/core';
import { getDb } from './db';

// ───────────────────────────── helpers ─────────────────────────────

function rowToContribution(r: any): Contribution {
  // The bounties table predates the Contribution Zod schema. Map snake_case
  // columns into the camelCase shape expected by callers, plus normalize a
  // few defaults so Zod-validated paths don't trip on null.
  return {
    id: r.id,
    title: r.title || `${r.repo}#${r.issue ?? '-'}`,
    description: r.description || undefined,
    value: typeof r.value === 'number' ? r.value : 0,
    currency: r.currency || 'USD',
    status: r.status || 'open',
    source: r.source || 'github',
    repo: r.repo || undefined,
    issue: r.issue ?? undefined,
    issueUrl: r.source_url || undefined,
    pr: r.pr_number ?? undefined,
    prUrl: r.pr_url || undefined,
    domainId: 'default',
    labels: r.labels ? JSON.parse(r.labels) : [],
    technologies: r.technologies ? JSON.parse(r.technologies) : [],
    timeline: [],
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || new Date().toISOString(),
    claimedAt: r.claimed_at || undefined,
    submittedAt: r.submitted_at || undefined,
    completedAt: r.completed_at || undefined,
    paidAt: r.paid_at || undefined,
    score: r.score ?? undefined,
    notes: r.notes || undefined,
  } as Contribution;
}

// ───────────────────────────── bounties ─────────────────────────────

export async function getBounties(options: {
  status?: string;
  domainId?: string;
  limit?: number;
} = {}): Promise<Contribution[]> {
  const db = getDb();
  const where: string[] = [];
  const args: any[] = [];
  if (options.status) { where.push('status = ?'); args.push(options.status); }
  // domainId not stored in the bounties table; ignored locally.
  const sql =
    'SELECT * FROM bounties' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY created_at DESC' +
    (options.limit ? ` LIMIT ${Math.max(1, options.limit | 0)}` : '');
  const result = await db.execute({ sql, args });
  return result.rows.map(rowToContribution);
}

// Pre-rebrand callers expected a CSV-fallback. CSV is now imported into
// SQLite, so the fallback is the same path as the primary.
export const getBountiesWithFallback = getBounties;

export async function getBounty(id: string): Promise<Contribution | null> {
  const db = getDb();
  const result = await db.execute({ sql: 'SELECT * FROM bounties WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return null;
  return rowToContribution(result.rows[0]);
}

export async function createBounty(data: Omit<Contribution, 'id'>): Promise<Contribution> {
  const db = getDb();
  const id = `${data.source}-${data.repo || 'manual'}-${data.issue || Date.now()}`;
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO bounties (
      id, repo, issue, title, description, value, currency, status,
      pr_number, pr_url, score, source, source_url,
      claimed_at, submitted_at, completed_at, paid_at,
      created_at, updated_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.repo || '',
      data.issue ?? null,
      data.title,
      data.description ?? null,
      data.value ?? 0,
      data.currency ?? 'USD',
      data.status ?? 'open',
      data.pr ?? null,
      data.prUrl ?? null,
      data.score ?? null,
      data.source ?? 'github',
      data.issueUrl ?? null,
      data.claimedAt ?? null,
      data.submittedAt ?? null,
      data.completedAt ?? null,
      data.paidAt ?? null,
      data.createdAt ?? now,
      data.updatedAt ?? now,
      data.notes ?? null,
    ],
  });
  return { id, ...data } as Contribution;
}

export async function updateBounty(id: string, data: Partial<Contribution>): Promise<void> {
  const db = getDb();
  // Map camelCase fields → snake_case columns selectively. Only update what
  // callers actually pass; ignore unknown fields rather than failing loudly,
  // matching the old Firestore .update() forgiveness.
  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    value: 'value',
    currency: 'currency',
    status: 'status',
    pr: 'pr_number',
    prUrl: 'pr_url',
    score: 'score',
    source: 'source',
    issueUrl: 'source_url',
    claimedAt: 'claimed_at',
    submittedAt: 'submitted_at',
    completedAt: 'completed_at',
    paidAt: 'paid_at',
    notes: 'notes',
  };
  const sets: string[] = [];
  const args: any[] = [];
  for (const [k, col] of Object.entries(map)) {
    if (k in (data as any)) {
      sets.push(`${col} = ?`);
      args.push((data as any)[k] ?? null);
    }
  }
  sets.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(id);
  await db.execute({ sql: `UPDATE bounties SET ${sets.join(', ')} WHERE id = ?`, args });
}

// ───────────────────────────── CSV-shaped helpers (legacy) ─────────────────────────────
// sync.ts predates the CSV-to-SQLite migration. These now read/write the
// SQLite `bounties` table directly so sync.ts keeps merging records as it did.

export function readCSVBounties(): Contribution[] {
  // Synchronous wrapper around the async libsql call. Used by sync.ts which
  // assumes a sync return; since we run a single SELECT off a local file, the
  // promise resolves on the next tick — fine for the CLI's single-call usage.
  // Kept as Contribution[] (was the legacy shape) — empty until first sync if
  // sqlite is fresh.
  let snapshot: Contribution[] = [];
  let done = false;
  getBounties({}).then(rows => { snapshot = rows; done = true; });
  // Block-spin briefly. The CLI is single-shot so this doesn't deadlock; if it
  // ever does, the caller is misusing this from an async context.
  const start = Date.now();
  while (!done && Date.now() - start < 5000) {
    require('child_process').execSync('sleep 0.01');
  }
  return snapshot;
}

export function writeCSVBounties(bounties: Contribution[]): void {
  // Best-effort upsert. sync.ts calls this after merging, so we treat each
  // row as an upsert. Errors per-row are logged but don't stop the batch.
  for (const b of bounties) {
    if (!b.id) continue;
    const args: any[] = [
      b.id, b.repo || '', b.issue ?? null, b.title || `${b.repo}#${b.issue ?? '-'}`,
      b.description ?? null, b.value ?? 0, b.currency ?? 'USD', b.status ?? 'open',
      b.pr ?? null, b.prUrl ?? null, b.score ?? null, b.source ?? 'github',
      b.issueUrl ?? null, b.claimedAt ?? null, b.submittedAt ?? null,
      b.completedAt ?? null, b.paidAt ?? null,
      b.createdAt || new Date().toISOString(), new Date().toISOString(),
      b.notes ?? null,
    ];
    getDb().execute({
      sql: `INSERT INTO bounties (
        id, repo, issue, title, description, value, currency, status,
        pr_number, pr_url, score, source, source_url,
        claimed_at, submitted_at, completed_at, paid_at,
        created_at, updated_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        repo = excluded.repo, issue = excluded.issue, title = excluded.title,
        description = excluded.description, value = excluded.value,
        currency = excluded.currency, status = excluded.status,
        pr_number = excluded.pr_number, pr_url = excluded.pr_url,
        score = excluded.score, source = excluded.source,
        source_url = excluded.source_url, claimed_at = excluded.claimed_at,
        submitted_at = excluded.submitted_at, completed_at = excluded.completed_at,
        paid_at = excluded.paid_at, updated_at = excluded.updated_at,
        notes = excluded.notes`,
      args,
    }).catch(err => console.warn(`upsert ${b.id} failed: ${err.message}`));
  }
}

// ───────────────────────────── domains / ledger (stubs) ─────────────────────────────
// No callers in the current codebase; returning empty keeps types intact.

export async function getDomains(): Promise<Domain[]> { return []; }
export async function getDomain(_idOrSlug: string): Promise<Domain | null> { return null; }
export async function getLedgerEntries(_options: {
  domainId?: string; type?: string; limit?: number;
} = {}): Promise<LedgerEntry[]> { return []; }

// ───────────────────────────── proofs ─────────────────────────────

export async function getProof(contributionId: string): Promise<Proof | null> {
  const db = getDb();
  const r = await db.execute({
    sql: 'SELECT data FROM proofs WHERE contribution_id = ? ORDER BY created_at DESC LIMIT 1',
    args: [contributionId],
  });
  if (r.rows.length === 0) return null;
  return JSON.parse((r.rows[0] as any).data) as Proof;
}

export async function createProof(data: Proof): Promise<Proof> {
  const db = getDb();
  const contributionId = (data as any).contributionId || (data as any).bountyId || data.id;
  await db.execute({
    sql: 'INSERT INTO proofs (id, contribution_id, data) VALUES (?, ?, ?)',
    args: [data.id, contributionId, JSON.stringify(data)],
  });
  return data;
}

// ───────────────────────────── sessions ─────────────────────────────

export interface WorkSession {
  id: string;
  contributionId: string;
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

export async function getActiveSession(contributionId?: string): Promise<WorkSession | null> {
  const db = getDb();
  const where: string[] = ["status = 'active'"];
  const args: any[] = [];
  if (contributionId) { where.push('contribution_id = ?'); args.push(contributionId); }
  const r = await db.execute({
    sql: `SELECT data FROM sessions WHERE ${where.join(' AND ')} LIMIT 1`,
    args,
  });
  if (r.rows.length === 0) return null;
  return JSON.parse((r.rows[0] as any).data) as WorkSession;
}

export async function getSessions(contributionId: string): Promise<WorkSession[]> {
  const db = getDb();
  const r = await db.execute({
    sql: 'SELECT data FROM sessions WHERE contribution_id = ? ORDER BY started_at DESC',
    args: [contributionId],
  });
  return r.rows.map((row: any) => JSON.parse(row.data) as WorkSession);
}

export async function saveSession(session: WorkSession): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO sessions (id, contribution_id, started_at, ended_at, status, data)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            ended_at = excluded.ended_at,
            status = excluded.status,
            data = excluded.data`,
    args: [
      session.id, session.contributionId, session.startedAt,
      session.endedAt ?? null, session.status, JSON.stringify(session),
    ],
  });
}
