/**
 * Bounty Source Types
 *
 * Common types for fetching bounties from various sources.
 */

import type { BountyInput } from '../scoring/types';

/**
 * Raw bounty data from a source before normalization
 */
export interface RawBounty {
  source: BountySource;
  sourceId: string;        // Unique ID from the source
  sourceUrl: string;       // URL to the bounty on the source
  title: string;
  description?: string;
  value?: number;
  currency?: string;
  labels?: string[];
  technologies?: string[];
  repo?: string;
  org?: string;
  issueNumber?: number;
  createdAt?: string;
  updatedAt?: string;

  // Competition info if available
  claimants?: number;
  openPRs?: number;

  // Difficulty if tagged
  difficulty?: 'easy' | 'medium' | 'hard';

  // Raw data for debugging
  raw?: unknown;
}

export type BountySource = 'github' | 'algora' | 'gitcoin' | 'manual' | 'csv';

/**
 * Source client interface - all sources implement this
 */
export interface BountySourceClient {
  name: BountySource;

  /**
   * Search for bounties matching criteria
   */
  search(options: SearchOptions): Promise<RawBounty[]>;

  /**
   * Fetch a specific bounty by ID
   */
  fetch(id: string): Promise<RawBounty | null>;

  /**
   * Check if the source is available/configured
   */
  isAvailable(): Promise<boolean>;
}

export interface SearchOptions {
  // Filter by organization/owner
  org?: string;
  orgs?: string[];

  // Filter by repo
  repo?: string;
  repos?: string[];

  // Filter by labels
  labels?: string[];

  // Filter by value range
  minValue?: number;
  maxValue?: number;

  // Filter by state
  state?: 'open' | 'closed' | 'all';

  // Pagination
  limit?: number;
  offset?: number;

  // Sort
  sort?: 'created' | 'updated' | 'value' | 'comments';
  order?: 'asc' | 'desc';
}

/**
 * Convert raw bounty to scoring input
 */
export function toScoringInput(raw: RawBounty): BountyInput {
  return {
    title: raw.title,
    value: raw.value || 0,
    repo: raw.repo,
    issueUrl: raw.sourceUrl,
    issueNumber: raw.issueNumber,
    labels: raw.labels,
    technologies: raw.technologies,
    description: raw.description,
    claimants: raw.claimants,
    openPRs: raw.openPRs,
    createdAt: raw.createdAt,
    difficulty: raw.difficulty
  };
}

/**
 * Parse bounty value from labels like "$100", "bounty:100", etc.
 */
export function parseValueFromLabels(labels: string[]): number | undefined {
  for (const label of labels) {
    const lower = label.toLowerCase();

    // Match patterns like "$100", "$1,000", "$1000"
    const dollarMatch = lower.match(/\$\s*([\d,]+)/);
    if (dollarMatch) {
      return parseInt(dollarMatch[1].replace(/,/g, ''), 10);
    }

    // Match patterns like "bounty:100", "bounty-100", "bounty 100"
    const bountyMatch = lower.match(/bounty[\s:-]*([\d,]+)/);
    if (bountyMatch) {
      return parseInt(bountyMatch[1].replace(/,/g, ''), 10);
    }

    // Match patterns like "100usd", "100 usd"
    const usdMatch = lower.match(/([\d,]+)\s*usd/);
    if (usdMatch) {
      return parseInt(usdMatch[1].replace(/,/g, ''), 10);
    }
  }

  return undefined;
}

/**
 * Extract difficulty from labels
 */
export function parseDifficultyFromLabels(labels: string[]): 'easy' | 'medium' | 'hard' | undefined {
  for (const label of labels) {
    const lower = label.toLowerCase();
    if (lower.includes('easy') || lower.includes('good first') || lower.includes('beginner')) {
      return 'easy';
    }
    if (lower.includes('hard') || lower.includes('complex') || lower.includes('advanced')) {
      return 'hard';
    }
    if (lower.includes('medium') || lower.includes('intermediate')) {
      return 'medium';
    }
  }
  return undefined;
}
