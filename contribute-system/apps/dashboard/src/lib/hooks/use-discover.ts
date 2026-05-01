'use client';

/**
 * Discovery Hook
 *
 * Fetches and scores bounties from GitHub and Algora APIs.
 * Auto-refreshes on mount and provides manual refresh capability.
 */

import { useState, useEffect, useCallback } from 'react';

export interface BountyScore {
  total: number;
  grade: string;
  recommendation: 'claim' | 'consider' | 'skip';
  value: { normalized: number; raw: number | null; hourlyRate: number };
  complexity: { estimated: number; linesEstimate: number };
  competition: { score: number; claimants: number; openPRs?: number; submissions?: number };
  fit: { score: number; matchedTech: string[]; unknownTech: string[] };
  warnings: string[];
  notes: string[];
}

export interface DiscoveredBounty {
  id: string;
  title: string;
  description?: string;
  value: number | null;
  labels?: string[];
  technologies: string[];
  repo: string;
  org: string;
  sourceUrl: string;
  claimants: number;
  openPRs?: number;
  submissions?: number;
  score: BountyScore;
  createdAt?: string;
  updatedAt?: string;
  source?: 'github' | 'algora';
}

export interface DiscoverOptions {
  source?: 'github' | 'algora' | 'all';
  org?: string;
  repo?: string;
  label?: string;
  limit?: number;
  autoFetch?: boolean;
}

export function useDiscoverBounties(options: DiscoverOptions = {}) {
  const {
    source = 'all',
    org,
    repo,
    label = 'bounty',
    limit = 30,
    autoFetch = true,
  } = options;

  const [bounties, setBounties] = useState<DiscoveredBounty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');

  const discover = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results: DiscoveredBounty[] = [];

      // Fetch from GitHub
      if (source === 'github' || source === 'all') {
        const params = new URLSearchParams();
        if (org) params.set('org', org);
        if (repo) params.set('repo', repo);
        if (label) params.set('label', label);
        params.set('limit', String(limit));

        const res = await fetch(`/api/discover?${params}`);
        const data = await res.json();

        if (data.error) {
          console.warn('GitHub discovery error:', data.error);
        } else {
          results.push(
            ...(data.bounties || []).map((b: DiscoveredBounty) => ({
              ...b,
              source: 'github' as const,
            }))
          );
          setLastQuery(data.query || '');
        }
      }

      // Fetch from Algora
      if (source === 'algora' || source === 'all') {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('status', 'OPEN');

        const res = await fetch(`/api/discover/algora?${params}`);
        const data = await res.json();

        if (!data.error) {
          results.push(
            ...(data.bounties || []).map((b: DiscoveredBounty) => ({
              ...b,
              source: 'algora' as const,
            }))
          );
        }
      }

      // Sort by score descending
      results.sort((a, b) => b.score.total - a.score.total);
      setBounties(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Discovery failed';
      setError(message);
      console.error('Discovery error:', err);
    } finally {
      setLoading(false);
    }
  }, [source, org, repo, label, limit]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      discover();
    }
  }, [autoFetch, discover]);

  return {
    bounties,
    loading,
    error,
    lastQuery,
    refresh: discover,
  };
}
