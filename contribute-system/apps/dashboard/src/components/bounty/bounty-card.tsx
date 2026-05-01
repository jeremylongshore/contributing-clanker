'use client';

import Link from 'next/link';
import { Github, Clock, AlertTriangle, CheckCircle, XCircle, Users, Flame, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface BountyCardData {
  id: string;
  title: string;
  repo: string;
  value: number | null;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedHours: string;
  matchScore: number;
  staleness: {
    days: number;
    status: 'fresh' | 'aging' | 'stale';
  };
  competition: {
    prs: number;
    claimants: number;
    status: 'none' | 'low' | 'high';
  };
  maintainer: {
    active: boolean;
    lastActive?: Date;
  };
  sourceUrl: string;
  postedAt: Date;
}

interface BountyCardProps {
  bounty: BountyCardData;
  onClick?: () => void;
}

export function BountyCard({ bounty, onClick }: BountyCardProps) {
  const getDifficultyStyle = (difficulty: BountyCardData['difficulty']) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'hard':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  const getStalenessIcon = () => {
    switch (bounty.staleness.status) {
      case 'fresh':
        return <Flame className="h-3.5 w-3.5 text-orange-500" />;
      case 'aging':
        return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
      case 'stale':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    }
  };

  const getStalenessText = () => {
    if (bounty.staleness.days <= 2) return 'Fresh';
    if (bounty.staleness.days <= 7) return `${bounty.staleness.days}d`;
    return 'Stale';
  };

  const getCompetitionIndicator = () => {
    if (bounty.competition.status === 'none') {
      return (
        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle className="h-3.5 w-3.5" />
          <span>No competition</span>
        </div>
      );
    }
    if (bounty.competition.status === 'low') {
      return (
        <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{bounty.competition.prs} competing PR (draft)</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <XCircle className="h-3.5 w-3.5" />
        <span>{bounty.competition.prs} competing PRs</span>
      </div>
    );
  };

  const getMaintainerIndicator = () => {
    if (bounty.maintainer.active) {
      const lastActive = bounty.maintainer.lastActive
        ? formatDistanceToNow(bounty.maintainer.lastActive, { addSuffix: true })
        : 'recently';
      return (
        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle className="h-3.5 w-3.5" />
          <span>Maintainer active ({lastActive})</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Maintainer inactive</span>
      </div>
    );
  };

  const matchPercentage = Math.round(bounty.matchScore * 100);

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
    >
      {/* Header: Title and Price */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex-1 text-base font-semibold text-gray-900 dark:text-white">
          {bounty.title}
        </h3>
        {bounty.value && (
          <span className="flex-shrink-0 text-lg font-bold text-green-600 dark:text-green-400">
            ${bounty.value}
          </span>
        )}
      </div>

      {/* Repo */}
      <div className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        <Github className="h-4 w-4" />
        <span>{bounty.repo}</span>
      </div>

      {/* Match Score Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Match: {matchPercentage}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-primary-500 transition-all"
            style={{ width: `${matchPercentage}%` }}
          />
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Difficulty */}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getDifficultyStyle(bounty.difficulty)}`}>
          {bounty.difficulty === 'easy' && '🟢 '}
          {bounty.difficulty === 'medium' && '🟡 '}
          {bounty.difficulty === 'hard' && '🔴 '}
          {bounty.difficulty.charAt(0).toUpperCase() + bounty.difficulty.slice(1)}
        </span>

        {/* Estimated Time */}
        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          <Clock className="h-3 w-3" />
          {bounty.estimatedHours}
        </span>

        {/* Staleness */}
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          bounty.staleness.status === 'fresh'
            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
            : bounty.staleness.status === 'aging'
            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {getStalenessIcon()}
          {getStalenessText()}
        </span>
      </div>

      {/* Risk Indicators */}
      <div className="mt-3 space-y-1">
        {getCompetitionIndicator()}
        {getMaintainerIndicator()}
      </div>

      {/* Swipe hint (mobile) */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400 md:hidden">
        <span>← Swipe: Save</span>
        <span>Dismiss: →</span>
      </div>
    </div>
  );
}
