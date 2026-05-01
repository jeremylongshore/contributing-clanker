'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Clock,
  GitPullRequest,
  PlayCircle,
  FileCheck
} from 'lucide-react';
import type { Bounty } from '@/lib/hooks/use-bounties';

interface ActivityFeedProps {
  bounties: Bounty[];
  loading?: boolean;
}

const iconMap: Record<string, typeof CheckCircle> = {
  created: PlayCircle,
  claimed: Clock,
  submitted: GitPullRequest,
  vetting: FileCheck,
  completed: CheckCircle,
  failed: XCircle,
  default: Clock,
};

const colorMap: Record<string, string> = {
  created: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
  claimed: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30',
  submitted: 'text-cyan-500 bg-cyan-100 dark:bg-cyan-900/30',
  vetting: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
  completed: 'text-green-500 bg-green-100 dark:bg-green-900/30',
  failed: 'text-red-500 bg-red-100 dark:bg-red-900/30',
  default: 'text-gray-500 bg-gray-100 dark:bg-gray-700',
};

export function ActivityFeed({ bounties, loading }: ActivityFeedProps) {
  // Flatten all timeline events from bounties
  const activities = bounties
    .flatMap(bounty =>
      (bounty.timeline || []).map(event => ({
        ...event,
        bountyId: bounty.id,
        bountyTitle: bounty.title,
      }))
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
        <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => {
        const Icon = iconMap[activity.type] || iconMap.default;
        const colorClass = colorMap[activity.type] || colorMap.default;

        return (
          <div key={`${activity.bountyId}-${index}`} className="flex gap-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-900 dark:text-white">
                <span className="font-medium">{activity.bountyTitle}</span>
                {' '}{activity.message}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
