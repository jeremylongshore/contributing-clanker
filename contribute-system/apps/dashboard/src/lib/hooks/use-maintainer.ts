'use client';

/**
 * Maintainer Profile Hook
 *
 * Fetches maintainer info for a repository.
 */

import { useState, useEffect, useCallback } from 'react';

export interface MaintainerProfile {
  username: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  recentActivity: {
    lastActive: string | null;
    totalCommits: number;
    totalIssues: number;
    totalPrsReviewed: number;
  };
  responsiveness: 'high' | 'medium' | 'low' | 'unknown';
}

export function useMaintainer(repo?: string) {
  const [profile, setProfile] = useState<MaintainerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMaintainer = useCallback(async () => {
    if (!repo) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bounty/maintainer?repo=${encodeURIComponent(repo)}`);
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.found) {
        setProfile(data.profile);
      } else {
        setProfile(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch maintainer';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    if (repo) {
      fetchMaintainer();
    }
  }, [repo, fetchMaintainer]);

  return { profile, loading, error, refresh: fetchMaintainer };
}
