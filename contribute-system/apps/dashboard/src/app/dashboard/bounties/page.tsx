'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { BountyTable } from '@/components/dashboard/bounty-table';
import { useBounties, Bounty } from '@/lib/hooks/use-bounties';

const statusFilters: Array<{ label: string; value: Bounty['status'] | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Claimed', value: 'claimed' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Vetting', value: 'vetting' },
  { label: 'Completed', value: 'completed' },
  { label: 'Revision', value: 'revision' },
];

export default function BountiesPage() {
  const [statusFilter, setStatusFilter] = useState<Bounty['status'] | 'all'>('all');

  const { bounties, loading } = useBounties(
    statusFilter === 'all' ? {} : { status: statusFilter }
  );

  return (
    <>
      <Header title="Bounties" />

      <div className="p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === filter.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="mb-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {bounties.length} bounties
            {statusFilter !== 'all' && ` with status "${statusFilter.replace('_', ' ')}"`}
          </p>
        </div>

        {/* Table */}
        <BountyTable bounties={bounties} loading={loading} />
      </div>
    </>
  );
}
