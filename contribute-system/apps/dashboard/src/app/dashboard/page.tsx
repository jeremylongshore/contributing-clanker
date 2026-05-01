'use client';

import { Target, DollarSign, Clock, CheckCircle, TrendingUp, Code } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { StatsCard } from '@/components/dashboard/stats-card';
import { BountyTable } from '@/components/dashboard/bounty-table';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { useBounties } from '@/lib/hooks/use-bounties';
import { useStats } from '@/lib/hooks/use-stats';

export default function DashboardPage() {
  const { bounties, loading: bountiesLoading } = useBounties({ limit: 10 });
  const { stats, loading: statsLoading } = useStats();

  return (
    <>
      <Header title="Dashboard" />

      <div className="p-6">
        {/* Stats Grid */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Open Bounties"
            value={statsLoading ? '...' : stats.openBounties}
            icon={Target}
            color="green"
          />
          <StatsCard
            title="In Progress"
            value={statsLoading ? '...' : stats.inProgress}
            icon={Clock}
            color="yellow"
          />
          <StatsCard
            title="Completed"
            value={statsLoading ? '...' : stats.completed}
            icon={CheckCircle}
            color="blue"
          />
          <StatsCard
            title="Total Earned"
            value={statsLoading ? '...' : `$${stats.earnedValue.toLocaleString()}`}
            icon={DollarSign}
            color="purple"
          />
        </div>

        {/* Secondary Stats */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatsCard
            title="Success Rate"
            value={statsLoading ? '...' : `${stats.successRate}%`}
            icon={TrendingUp}
            color="green"
          />
          <StatsCard
            title="Avg Cycle Time"
            value={statsLoading ? '...' : `${stats.avgCycleTime} days`}
            icon={Clock}
            color="blue"
          />
          <StatsCard
            title="Lines of Code"
            value={statsLoading ? '...' : `+${stats.totalLinesAdded.toLocaleString()}`}
            icon={Code}
            color="purple"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Bounties */}
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Bounties
              </h2>
              <a
                href="/dashboard/bounties"
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                View all
              </a>
            </div>
            <BountyTable bounties={bounties} loading={bountiesLoading} />
          </div>

          {/* Activity Feed */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Recent Activity
            </h2>
            <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
              <ActivityFeed bounties={bounties} loading={bountiesLoading} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
