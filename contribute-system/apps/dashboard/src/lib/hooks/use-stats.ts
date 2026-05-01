'use client';

/**
 * Stats Hook
 *
 * Aggregated statistics from bounties and proofs.
 */

import { useMemo } from 'react';
import { useBounties, Bounty } from './use-bounties';
import { useProofs } from './use-proofs';

export interface Stats {
  totalBounties: number;
  openBounties: number;
  inProgress: number;
  completed: number;
  totalValue: number;
  earnedValue: number;
  totalRecordings: number;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  avgCycleTime: number;
  successRate: number;
}

export function useStats() {
  const { bounties, loading: bountiesLoading } = useBounties();
  const { proofs, loading: proofsLoading } = useProofs();

  const stats = useMemo<Stats>(() => {
    const open = bounties.filter(b => b.status === 'open').length;
    const inProgress = bounties.filter(b =>
      ['claimed', 'in_progress', 'submitted', 'vetting'].includes(b.status)
    ).length;
    const completed = bounties.filter(b => b.status === 'completed').length;
    const failed = bounties.filter(b =>
      ['cancelled', 'revision'].includes(b.status)
    ).length;

    const totalValue = bounties.reduce((sum, b) => sum + (b.value || 0), 0);
    const earnedValue = bounties
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.value || 0), 0);

    const totalRecordings = proofs.reduce((sum, p) => sum + (p.recordings?.length || 0), 0);
    const totalLinesAdded = proofs.reduce((sum, p) => sum + (p.linesAdded || 0), 0);
    const totalLinesDeleted = proofs.reduce((sum, p) => sum + (p.linesDeleted || 0), 0);

    // Calculate average cycle time (days from created to completed)
    const completedWithTimes = bounties.filter(b =>
      b.status === 'completed' && b.createdAt && b.updatedAt
    );
    const avgCycleTime = completedWithTimes.length > 0
      ? completedWithTimes.reduce((sum, b) => {
          const created = new Date(b.createdAt).getTime();
          const updated = new Date(b.updatedAt!).getTime();
          return sum + (updated - created) / (1000 * 60 * 60 * 24);
        }, 0) / completedWithTimes.length
      : 0;

    const successRate = completed + failed > 0
      ? (completed / (completed + failed)) * 100
      : 0;

    return {
      totalBounties: bounties.length,
      openBounties: open,
      inProgress,
      completed,
      totalValue,
      earnedValue,
      totalRecordings,
      totalLinesAdded,
      totalLinesDeleted,
      avgCycleTime: Math.round(avgCycleTime * 10) / 10,
      successRate: Math.round(successRate)
    };
  }, [bounties, proofs]);

  return {
    stats,
    loading: bountiesLoading || proofsLoading
  };
}
