/**
 * Notification Preferences API
 *
 * Manage user notification settings - channels, triggers, filters.
 * Persisted to Firestore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  channels: {
    slack?: {
      enabled: boolean;
      webhookUrl?: string;
      channel?: string;
    };
    email?: {
      enabled: boolean;
      address?: string;
    };
  };
  triggers: {
    newBountyMatch: boolean;
    deadlineReminder: boolean;
    prStatusChange: boolean;
    bountyCompleted: boolean;
    highValueAlert: boolean;
  };
  filters: {
    minValue?: number;
    technologies?: string[];
    minScore?: number;
  };
  schedule: {
    digestEnabled: boolean;
    digestFrequency: 'daily' | 'weekly' | 'immediate';
    quietHoursEnabled: boolean;
    quietHoursStart?: string; // HH:MM format
    quietHoursEnd?: string;
  };
  updatedAt: string;
}

// Default preferences
const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId' | 'updatedAt'> = {
  enabled: true,
  channels: {
    slack: { enabled: false },
    email: { enabled: false },
  },
  triggers: {
    newBountyMatch: true,
    deadlineReminder: true,
    prStatusChange: true,
    bountyCompleted: true,
    highValueAlert: true,
  },
  filters: {
    minValue: 0,
    technologies: [],
    minScore: 0,
  },
  schedule: {
    digestEnabled: false,
    digestFrequency: 'immediate',
    quietHoursEnabled: false,
  },
};

/**
 * GET /api/notifications/preferences - Get user preferences
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'default';

  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTIONS.NOTIFICATION_PREFERENCES).doc(userId);
    const doc = await docRef.get();

    let prefs: NotificationPreferences;

    if (!doc.exists) {
      // Return defaults if no preferences set
      prefs = {
        ...DEFAULT_PREFERENCES,
        userId,
        updatedAt: new Date().toISOString(),
      };
    } else {
      prefs = doc.data() as NotificationPreferences;
    }

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    console.error('Get preferences error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notifications/preferences - Update user preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId = 'default', ...updates } = body;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTIONS.NOTIFICATION_PREFERENCES).doc(userId);
    const doc = await docRef.get();

    // Get existing or default
    const existing = doc.exists
      ? (doc.data() as NotificationPreferences)
      : {
          ...DEFAULT_PREFERENCES,
          userId,
          updatedAt: new Date().toISOString(),
        };

    // Merge updates
    const updated: NotificationPreferences = {
      ...existing,
      ...updates,
      channels: {
        ...existing.channels,
        ...updates.channels,
        slack: { ...existing.channels?.slack, ...updates.channels?.slack },
        email: { ...existing.channels?.email, ...updates.channels?.email },
      },
      triggers: { ...existing.triggers, ...updates.triggers },
      filters: { ...existing.filters, ...updates.filters },
      schedule: { ...existing.schedule, ...updates.schedule },
      userId,
      updatedAt: new Date().toISOString(),
    };

    // Validate Slack webhook URL if provided
    if (updated.channels.slack?.webhookUrl) {
      if (!updated.channels.slack.webhookUrl.startsWith('https://hooks.slack.com/')) {
        return NextResponse.json(
          { error: 'Invalid Slack webhook URL' },
          { status: 400 }
        );
      }
    }

    // Validate email if provided
    if (updated.channels.email?.address) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updated.channels.email.address)) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }
    }

    // Save to Firestore
    await docRef.set(updated);

    return NextResponse.json({
      success: true,
      preferences: updated,
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications/preferences/test - Test notification channels
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId = 'default', channel } = body;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTIONS.NOTIFICATION_PREFERENCES).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'No preferences configured' },
        { status: 404 }
      );
    }

    const prefs = doc.data() as NotificationPreferences;
    const results: Record<string, { success: boolean; error?: string }> = {};

    if (channel === 'slack' || !channel) {
      if (prefs.channels.slack?.webhookUrl) {
        try {
          const response = await fetch(prefs.channels.slack.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: ':test_tube: Test notification from Bounty System - Your Slack integration is working!',
            }),
          });
          results.slack = { success: response.ok };
          if (!response.ok) {
            results.slack.error = `HTTP ${response.status}`;
          }
        } catch (e) {
          results.slack = { success: false, error: String(e) };
        }
      } else {
        results.slack = { success: false, error: 'No webhook URL configured' };
      }
    }

    if (channel === 'email' || !channel) {
      if (prefs.channels.email?.address) {
        // In production, send actual test email via Resend
        results.email = { success: true };
        console.log(`[Test] Would send test email to ${prefs.channels.email.address}`);
      } else {
        results.email = { success: false, error: 'No email address configured' };
      }
    }

    return NextResponse.json({
      success: Object.values(results).some(r => r.success),
      results,
    });
  } catch (error) {
    console.error('Test notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send test notification' },
      { status: 500 }
    );
  }
}
