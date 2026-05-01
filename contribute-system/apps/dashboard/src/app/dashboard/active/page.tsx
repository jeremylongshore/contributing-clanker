'use client';

/**
 * Active Bounties Page
 *
 * Shows bounties you're currently working on with visual phase tracking.
 * Phases: Claimed → In Progress → PR Submitted → Under Review → Completed
 */

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Clock,
  GitPullRequest,
  CheckCircle,
  Circle,
  ExternalLink,
  DollarSign,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { useBounties, Bounty } from '@/lib/hooks/use-bounties';

const ACTIVE_STATUSES: Bounty['status'][] = ['claimed', 'in_progress', 'submitted', 'vetting', 'revision'];

const phases = [
  { key: 'claimed', label: 'Claimed', icon: Circle },
  { key: 'in_progress', label: 'Working', icon: Clock },
  { key: 'submitted', label: 'PR Submitted', icon: GitPullRequest },
  { key: 'vetting', label: 'Under Review', icon: AlertCircle },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
] as const;

function getPhaseIndex(status: Bounty['status']): number {
  if (status === 'revision') return 2; // Back to submitted level
  const idx = phases.findIndex(p => p.key === status);
  return idx >= 0 ? idx : 0;
}

function PhaseTracker({ status }: { status: Bounty['status'] }) {
  const currentPhase = getPhaseIndex(status);
  const isRevision = status === 'revision';

  return (
    <div className="flex items-center gap-1">
      {phases.map((phase, idx) => {
        const Icon = phase.icon;
        const isActive = idx <= currentPhase;
        const isCurrent = idx === currentPhase;

        return (
          <div key={phase.key} className="flex items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                isCurrent
                  ? isRevision
                    ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  : isActive
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              }`}
              title={phase.label}
            >
              <Icon className="h-4 w-4" />
            </div>
            {idx < phases.length - 1 && (
              <div
                className={`h-0.5 w-4 ${
                  idx < currentPhase
                    ? 'bg-green-400 dark:bg-green-600'
                    : 'bg-gray-200 dark:bg-gray-600'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActiveBountyCard({ bounty }: { bounty: Bounty }) {
  const phaseLabel = phases.find(p => p.key === bounty.status)?.label || bounty.status;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/bounties/${bounty.id}`}
            className="text-lg font-semibold text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
          >
            {bounty.title}
          </Link>
          {bounty.repo && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {bounty.repo}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-lg font-bold text-green-600 dark:text-green-400">
          <DollarSign className="h-5 w-5" />
          {bounty.value}
        </div>
      </div>

      {/* Phase Tracker */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {bounty.status === 'revision' ? 'Needs Revision' : phaseLabel}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Started {formatDistanceToNow(new Date(bounty.createdAt), { addSuffix: true })}
          </span>
        </div>
        <PhaseTracker status={bounty.status} />
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {bounty.issue && (
          <a
            href={`https://github.com/${bounty.repo}/issues/${bounty.issue}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Issue
          </a>
        )}
        {bounty.pr && (
          <a
            href={`https://github.com/${bounty.repo}/pull/${bounty.pr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-100 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            PR #{bounty.pr}
          </a>
        )}
        <Link
          href={`/dashboard/bounties/${bounty.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          View Details
        </Link>
      </div>

      {/* Timeline preview */}
      {bounty.timeline && bounty.timeline.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Latest: {bounty.timeline[bounty.timeline.length - 1].message}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ActiveBountiesPage() {
  const { bounties, loading } = useBounties({ status: ACTIVE_STATUSES });

  // Group by status
  const inProgress = bounties.filter(b => b.status === 'in_progress' || b.status === 'claimed');
  const submitted = bounties.filter(b => b.status === 'submitted' || b.status === 'vetting');
  const revision = bounties.filter(b => b.status === 'revision');

  const totalValue = bounties.reduce((sum, b) => sum + b.value, 0);

  return (
    <>
      <Header title="Active Bounties" />

      <div className="p-4 md:p-6">
        {/* Summary Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{bounties.length}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">In Progress</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgress.length}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Submitted</p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{submitted.length}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Potential Earnings</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">${totalValue}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : bounties.length === 0 ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
            <Clock className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              No active bounties
            </h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Claim a bounty from the Discover page to get started
            </p>
            <Link
              href="/dashboard/discover"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              Find Bounties
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Needs Revision */}
            {revision.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                  <AlertCircle className="h-4 w-4" />
                  Needs Revision ({revision.length})
                </h2>
                <div className="space-y-4">
                  {revision.map(bounty => (
                    <ActiveBountyCard key={bounty.id} bounty={bounty} />
                  ))}
                </div>
              </div>
            )}

            {/* In Progress */}
            {inProgress.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  In Progress ({inProgress.length})
                </h2>
                <div className="space-y-4">
                  {inProgress.map(bounty => (
                    <ActiveBountyCard key={bounty.id} bounty={bounty} />
                  ))}
                </div>
              </div>
            )}

            {/* Submitted / Under Review */}
            {submitted.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Awaiting Review ({submitted.length})
                </h2>
                <div className="space-y-4">
                  {submitted.map(bounty => (
                    <ActiveBountyCard key={bounty.id} bounty={bounty} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
