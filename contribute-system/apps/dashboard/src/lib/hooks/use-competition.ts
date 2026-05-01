'use client';

/**
 * Competition Detection Hook
 *
 * Fetches competing PRs for a bounty issue.
 */

import { useState, useEffect, useCallback } from 'react';

export interface CompetingPR {
  number: number;
  title: string;
  author: string;
  state: string;
  draft: boolean;
  createdAt: string;
  url: string;
}

export interface CompetitionData {
  issueNumber: number;
  repo: string;
  competingPRs: CompetingPR[];
  hasCompetition: boolean;
  competitionLevel: 'none' | 'low' | 'medium' | 'high';
}

export function useCompetition(repo?: string, issue?: string | number) {
  const [data, setData] = useState<CompetitionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompetition = useCallback(async () => {
    if (!repo || !issue) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bounty/competition?repo=${encodeURIComponent(repo)}&issue=${issue}`);
      const result = await res.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check competition';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repo, issue]);

  useEffect(() => {
    if (repo && issue) {
      fetchCompetition();
    }
  }, [repo, issue, fetchCompetition]);

  return { data, loading, error, refresh: fetchCompetition };
}
