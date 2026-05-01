'use client';

import { useState, useEffect, useMemo } from 'react';
import { Bell, AlertTriangle, CheckCircle, MessageSquare, GitPullRequest, DollarSign, RefreshCw } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications, type Notification } from '@/lib/hooks/use-notifications';

type AlertType = 'new_bounty' | 'competition' | 'pr_merged' | 'comment' | 'payment' | 'deadline' | 'pr_status' | 'completed' | 'high_value';

interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  bountyId?: string;
  timestamp: Date;
  read: boolean;
}

function getAlertIcon(type: AlertType) {
  switch (type) {
    case 'new_bounty':
    case 'high_value':
      return <Bell className="h-5 w-5 text-blue-500" />;
    case 'competition':
    case 'deadline':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'pr_merged':
    case 'completed':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'comment':
    case 'pr_status':
      return <MessageSquare className="h-5 w-5 text-purple-500" />;
    case 'payment':
      return <DollarSign className="h-5 w-5 text-green-500" />;
    default:
      return <Bell className="h-5 w-5 text-gray-500" />;
  }
}

function groupAlertsByDate(alerts: Alert[]): { today: Alert[]; yesterday: Alert[]; older: Alert[] } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  return {
    today: alerts.filter(a => a.timestamp >= today),
    yesterday: alerts.filter(a => a.timestamp >= yesterday && a.timestamp < today),
    older: alerts.filter(a => a.timestamp < yesterday),
  };
}

// Convert API notification to Alert format
function toAlert(notification: Notification): Alert {
  return {
    id: notification.id,
    type: notification.type as AlertType,
    title: notification.title,
    message: notification.message,
    bountyId: notification.bountyId,
    timestamp: new Date(notification.createdAt),
    read: notification.read,
  };
}

export default function AlertsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markAsRead: markNotificationAsRead,
    markAllAsRead,
  } = useNotifications({ autoFetch: true });

  // Convert notifications to alerts
  const alerts = useMemo(() => notifications.map(toAlert), [notifications]);
  const grouped = groupAlertsByDate(alerts);

  const handleMarkAsRead = (id: string) => {
    markNotificationAsRead([id]);
  };

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-white px-4 py-4 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Alerts</h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary-500 px-2.5 py-0.5 text-xs font-medium text-white">
                {unreadCount} new
              </span>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden md:block">
        <Header title="Alerts" />
      </div>

      <div className="p-4 md:p-6">
        {/* Loading state */}
        {loading && alerts.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <p className="text-sm">{error}</p>
            <button
              onClick={refresh}
              className="mt-2 text-sm font-medium underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Mark all as read button */}
        {unreadCount > 0 && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={markAllAsRead}
              className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              Mark all as read
            </button>
          </div>
        )}

        {/* Today */}
        {grouped.today.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Today
            </h2>
            <div className="space-y-2">
              {grouped.today.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => handleMarkAsRead(alert.id)}
                  className={`w-full rounded-xl p-4 text-left transition-colors ${
                    alert.read
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-primary-50 dark:bg-primary-900/20'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 pt-0.5">
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${
                        alert.read
                          ? 'text-gray-900 dark:text-white'
                          : 'text-primary-900 dark:text-primary-100'
                      }`}>
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {alert.message}
                      </p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                    {!alert.read && (
                      <div className="flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-primary-500" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Yesterday */}
        {grouped.yesterday.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Yesterday
            </h2>
            <div className="space-y-2">
              {grouped.yesterday.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => handleMarkAsRead(alert.id)}
                  className={`w-full rounded-xl p-4 text-left transition-colors ${
                    alert.read
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-primary-50 dark:bg-primary-900/20'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 pt-0.5">
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${
                        alert.read
                          ? 'text-gray-900 dark:text-white'
                          : 'text-primary-900 dark:text-primary-100'
                      }`}>
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {alert.message}
                      </p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                    {!alert.read && (
                      <div className="flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-primary-500" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Older */}
        {grouped.older.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Earlier
            </h2>
            <div className="space-y-2">
              {grouped.older.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => handleMarkAsRead(alert.id)}
                  className="w-full rounded-xl bg-white p-4 text-left transition-colors dark:bg-gray-800"
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 pt-0.5">
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {alert.message}
                      </p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && alerts.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-12 w-12 text-gray-300 dark:text-gray-600" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              No alerts yet
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              You&apos;ll be notified when something important happens
            </p>
          </div>
        )}
      </div>
    </>
  );
}
