'use client';

/**
 * Notifications Hook
 *
 * Fetches and manages user notifications from the API.
 * Supports marking as read and real-time updates.
 */

import { useState, useEffect, useCallback } from 'react';

export interface Notification {
  id: string;
  type: 'new_bounty' | 'deadline' | 'pr_status' | 'completed' | 'high_value' | 'competition' | 'comment' | 'payment';
  title: string;
  message: string;
  bountyId?: string;
  bountyTitle?: string;
  bountyValue?: number;
  prUrl?: string;
  createdAt: string;
  read: boolean;
  channels: string[];
}

export interface UseNotificationsOptions {
  userId?: string;
  unreadOnly?: boolean;
  limit?: number;
  autoFetch?: boolean;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    userId = 'default',
    unreadOnly = false,
    limit = 50,
    autoFetch = true,
  } = options;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('userId', userId);
      if (unreadOnly) params.set('unreadOnly', 'true');
      params.set('limit', String(limit));

      const res = await fetch(`/api/notifications?${params}`);
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
      setError(message);
      console.error('Notifications error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, unreadOnly, limit]);

  const markAsRead = useCallback(async (notificationIds: string[]) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, notificationIds }),
      });

      if (res.ok) {
        // Optimistically update local state
        setNotifications(prev =>
          prev.map(n =>
            notificationIds.includes(n.id) ? { ...n, read: true } : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - notificationIds.length));
      }
    } catch (err) {
      console.error('Mark as read error:', err);
    }
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, markAllRead: true }),
      });

      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Mark all as read error:', err);
    }
  }, [userId]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchNotifications();
    }
  }, [autoFetch, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
