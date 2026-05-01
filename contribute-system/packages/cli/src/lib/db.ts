/**
 * libSQL Database Client
 *
 * Local-first SQLite-compatible database using libSQL/Turso.
 * Stores bounties, repo profiles, workflow state, and config locally.
 * Can optionally sync to Turso Cloud for backup/multi-device.
 */

import { createClient, type Client } from '@libsql/client';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

// Database path - defaults to ~/.bounty-system/bounty.db
const DB_DIR = join(homedir(), '.bounty-system');
const DB_PATH = process.env.BOUNTY_DB || `file:${join(DB_DIR, 'bounty.db')}`;

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

    // Check for Turso cloud sync
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      // Cloud mode with local replica
      _client = createClient({
        url: tursoUrl,
        authToken: tursoToken,
        syncUrl: DB_PATH
      });
    } else {
      // Local-only mode
      _client = createClient({
        url: DB_PATH
      });
    }
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
