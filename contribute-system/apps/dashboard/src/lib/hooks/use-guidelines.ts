'use client';

/**
 * Guidelines Hook
 *
 * Fetches CONTRIBUTING.md for a repository.
 */

import { useState, useEffect, useCallback } from 'react';

export interface GuidelinesData {
  repo: string;
  content: string | null;
  found: boolean;
  path: string | null;
}

export function useGuidelines(repo?: string) {
  const [data, setData] = useState<GuidelinesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGuidelines = useCallback(async () => {
    if (!repo) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bounty/guidelines?repo=${encodeURIComponent(repo)}`);
      const result = await res.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch guidelines';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    if (repo) {
      fetchGuidelines();
    }
  }, [repo, fetchGuidelines]);

  return { data, loading, error, refresh: fetchGuidelines };
}
