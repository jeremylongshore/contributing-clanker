// Re-export all schemas
export * from './schemas';

// Constants
export const COLLECTIONS = {
  BOUNTIES: 'bounties',
  PROOFS: 'proofs',
  DOMAINS: 'domains',
  LEDGER: 'ledger',
  SESSIONS: 'sessions',
  ACTIVITY: 'activity',
  CONFIG: 'config'
} as const;

export const DEFAULT_DOMAIN = 'default';

// Utility functions
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
