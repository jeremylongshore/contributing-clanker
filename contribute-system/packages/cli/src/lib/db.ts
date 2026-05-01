/**
 * libSQL Database Client
 *
 * Local-only SQLite-compatible database using libSQL.
 * Stores contributions, repo profiles, workflow state, and config locally
 * at ~/.contribute-system/contribute.db. No cloud sync.
 *
 * BOUNTY_DB env var still honored for backward compatibility with installations
 * that point at the old ~/.bounty-system/bounty.db path.
 */

import { createClient, type Client } from '@libsql/client';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

// Database path - defaults to ~/.contribute-system/contribute.db
const DB_DIR = join(homedir(), '.contribute-system');
const DB_PATH = process.env.CONTRIBUTE_DB || process.env.BOUNTY_DB || `file:${join(DB_DIR, 'contribute.db')}`;

let _client: Client | null = null;

/**
 * Get the database client singleton
 */
export function getDb(): Client {
  if (!_client) {
    // Ensure directory exists
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }
    _client = createClient({ url: DB_PATH });
  }

  return _client;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (_client) {
    _client.close();
    _client = null;
  }
}

/**
 * Get the database file path
 */
export function getDbPath(): string {
  return DB_PATH.replace('file:', '');
}

/**
 * Check if database is initialized
 */
export async function isDbInitialized(): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='bounties'"
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// Re-export types
export type { Client };
