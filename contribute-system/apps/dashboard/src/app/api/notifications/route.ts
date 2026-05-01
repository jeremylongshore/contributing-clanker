/**
 * Notifications API
 *
 * Manages bounty notifications - new matches, deadlines, PR status changes.
 * Supports Slack webhooks and email notifications.
 * Persisted to Firestore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

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
}

export interface Notification {
  id: string;
  type: 'new_bounty' | 'deadline' | 'pr_status' | 'completed' | 'high_value';
  title: string;
  message: string;
  bountyId?: string;
  bountyTitle?: string;
  bountyValue?: number;
  prUrl?: string;
  createdAt: string;
  read: boolean;
  channels: ('slack' | 'email' | 'in_app')[];
}

/**
 * GET /api/notifications - Get user notifications
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'default';
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  try {
    const db = getAdminDb();
    const notificationsRef = db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .doc(userId)
      .collection('items');

    let query = notificationsRef.orderBy('createdAt', 'desc').limit(limit);

    if (unreadOnly) {
      query = notificationsRef
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(limit);
    }

    const snapshot = await query.get();
    const notifications: Notification[] = snapshot.docs.map(
      (doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...doc.data(),
      })
    ) as Notification[];

    // Get unread count
    const unreadSnapshot = await notificationsRef
      .where('read', '==', false)
      .count()
      .get();
    const unreadCount = unreadSnapshot.data().count;

    // Get total count
    const totalSnapshot = await notificationsRef.count().get();
    const total = totalSnapshot.data().count;

    return NextResponse.json({
      notifications,
      unreadCount,
      total,
    });
  } catch (error) {
    console.error('Notifications error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications - Create a notification
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId = 'default',
      type,
      title,
      message,
      bountyId,
      bountyTitle,
      bountyValue,
      prUrl,
    } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, message' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    const notification: Omit<Notification, 'id'> = {
      type,
      title,
      message,
      bountyId,
      bountyTitle,
      bountyValue,
      prUrl,
      createdAt: new Date().toISOString(),
      read: false,
      channels: ['in_app'],
    };

    // Get user preferences
    const prefsDoc = await db
      .collection(COLLECTIONS.NOTIFICATION_PREFERENCES)
      .doc(userId)
      .get();
    const userPrefs = prefsDoc.data() as NotificationPreferences | undefined;

    // Send to channels based on preferences
    if (userPrefs?.channels.slack?.enabled && userPrefs.channels.slack.webhookUrl) {
      try {
        await sendSlackNotification(
          userPrefs.channels.slack.webhookUrl,
          { ...notification, id: '' }
        );
        notification.channels.push('slack');
      } catch (e) {
        console.error('Slack notification failed:', e);
      }
    }

    if (userPrefs?.channels.email?.enabled && userPrefs.channels.email.address) {
      try {
        await sendEmailNotification(
          userPrefs.channels.email.address,
          { ...notification, id: '' }
        );
        notification.channels.push('email');
      } catch (e) {
        console.error('Email notification failed:', e);
      }
    }

    // Store notification in Firestore
    const docRef = await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .doc(userId)
      .collection('items')
      .add(notification);

    const createdNotification: Notification = {
      id: docRef.id,
      ...notification,
    };

    return NextResponse.json({
      success: true,
      notification: createdNotification,
    });
  } catch (error) {
    console.error('Create notification error:', error);
    return NextResponse.json(
      { error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications - Mark notifications as read
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId = 'default', notificationIds, markAllRead } = body;

    const db = getAdminDb();
    const notificationsRef = db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .doc(userId)
      .collection('items');

    if (markAllRead) {
      // Get all unread and mark them read
      const unreadSnapshot = await notificationsRef
        .where('read', '==', false)
        .get();

      const batch = db.batch();
      unreadSnapshot.docs.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();

      return NextResponse.json({
        success: true,
        updatedCount: unreadSnapshot.size,
      });
    } else if (notificationIds && Array.isArray(notificationIds)) {
      const batch = db.batch();
      for (const id of notificationIds) {
        const docRef = notificationsRef.doc(id);
        batch.update(docRef, { read: true });
      }
      await batch.commit();

      return NextResponse.json({
        success: true,
        updatedCount: notificationIds.length,
      });
    }

    return NextResponse.json({
      success: true,
      updatedCount: 0,
    });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json(
      { error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}

// Helper: Send Slack notification
async function sendSlackNotification(webhookUrl: string, notification: Notification) {
  const emoji = {
    new_bounty: ':moneybag:',
    deadline: ':alarm_clock:',
    pr_status: ':git:',
    completed: ':white_check_mark:',
    high_value: ':gem:',
  }[notification.type] || ':bell:';

  const payload: { blocks: unknown[] } = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${notification.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: notification.message,
        },
      },
    ],
  };

  if (notification.bountyValue) {
    payload.blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Value:* $${notification.bountyValue}`,
        },
      ],
    });
  }

  if (notification.prUrl) {
    payload.blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View PR',
            emoji: true,
          },
          url: notification.prUrl,
        },
      ],
    });
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Helper: Send email notification (placeholder - integrate with email service)
async function sendEmailNotification(email: string, notification: Notification) {
  // In production, integrate with SendGrid, Resend, or similar
  console.log(`[Email] Would send to ${email}:`, notification.title);
  // TODO: Implement actual email sending with Resend
}
