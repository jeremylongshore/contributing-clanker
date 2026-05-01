'use client';

import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  PieChart
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { Header } from '@/components/layout/header';
import { useBounties } from '@/lib/hooks/use-bounties';

export default function FinancialsPage() {
  const { bounties, loading } = useBounties();

  const stats = useMemo(() => {
    const completed = bounties.filter(b => b.status === 'completed');
    const pending = bounties.filter(b =>
      ['claimed', 'in_progress', 'submitted', 'vetting'].includes(b.status)
    );

    const totalEarned = completed.reduce((sum, b) => sum + (b.value || 0), 0);
    const pendingValue = pending.reduce((sum, b) => sum + (b.value || 0), 0);
    const availableValue = bounties
      .filter(b => b.status === 'open')
      .reduce((sum, b) => sum + (b.value || 0), 0);

    // Monthly earnings for the last 6 months
    const now = new Date();
    const sixMonthsAgo = subMonths(now, 5);
    const months = eachMonthOfInterval({ start: sixMonthsAgo, end: now });

    const monthlyData = months.map(month => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);

      const monthEarnings = completed
        .filter(b => {
          const updated = new Date(b.updatedAt || b.createdAt);
          return updated >= start && updated <= end;
        })
        .reduce((sum, b) => sum + (b.value || 0), 0);

      const monthCount = completed.filter(b => {
        const updated = new Date(b.updatedAt || b.createdAt);
        return updated >= start && updated <= end;
      }).length;

      return {
        month: format(month, 'MMM'),
        earnings: monthEarnings,
        count: monthCount,
      };
    });

    // Earnings by source
    const bySource = completed.reduce((acc, b) => {
      const source = b.source || 'Unknown';
      acc[source] = (acc[source] || 0) + (b.value || 0);
      return acc;
    }, {} as Record<string, number>);

    const sourceData = Object.entries(bySource)
      .map(([source, value]) => ({ source, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalEarned,
      pendingValue,
      availableValue,
      completedCount: completed.length,
      avgBountyValue: completed.length > 0 ? totalEarned / completed.length : 0,
      monthlyData,
      sourceData,
    };
  }, [bounties]);

  if (loading) {
    return (
      <>
        <Header title="Financials" />
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
              ))}
            </div>
            <div className="h-80 rounded-xl bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Financials" />

      <div className="p-6">
        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Earned</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${stats.totalEarned.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                <TrendingUp className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${stats.pendingValue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Available</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${stats.availableValue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                <PieChart className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg Bounty</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${Math.round(stats.avgBountyValue).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monthly Earnings Chart */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Monthly Earnings
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis dataKey="month" stroke="#9CA3AF" fontSize={12} />
                  <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '0.5rem',
                    }}
                    labelStyle={{ color: '#F9FAFB' }}
                    formatter={(value: number) => [`$${value}`, 'Earnings']}
                  />
                  <Line
                    type="monotone"
                    dataKey="earnings"
                    stroke="#22C55E"
                    strokeWidth={2}
                    dot={{ fill: '#22C55E' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bounties per Month Chart */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Bounties Completed
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis dataKey="month" stroke="#9CA3AF" fontSize={12} />
                  <YAxis stroke="#9CA3AF" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '0.5rem',
                    }}
                    labelStyle={{ color: '#F9FAFB' }}
                    formatter={(value: number) => [value, 'Bounties']}
                  />
                  <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Earnings by Source */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800 lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Earnings by Source
            </h2>
            {stats.sourceData.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No completed bounties yet</p>
            ) : (
              <div className="space-y-3">
                {stats.sourceData.map((item) => {
                  const percentage = (item.value / stats.totalEarned) * 100;
                  return (
                    <div key={item.source}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {item.source}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          ${item.value.toLocaleString()} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-full rounded-full bg-primary-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
