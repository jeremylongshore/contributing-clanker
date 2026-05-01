/**
 * Automation API
 *
 * Auto-claim bounties based on criteria, deadline reminders,
 * and scheduled discovery scans.
 * Persisted to Firestore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  type: 'auto_claim' | 'deadline_reminder' | 'discovery_scan' | 'pr_monitor';
  conditions: {
    // Auto-claim conditions
    minScore?: number;
    maxScore?: number;
    minValue?: number;
    maxValue?: number;
    technologies?: string[];
    excludeTechnologies?: string[];
    repos?: string[];
    orgs?: string[];
    labels?: string[];
    excludeLabels?: string[];
    maxCompetitors?: number;
  };
  actions: {
    // What to do when conditions match
    notify?: boolean;
    notifyChannels?: ('slack' | 'email')[];
    autoClaim?: boolean;
    addToWatchlist?: boolean;
    assignPriority?: 'high' | 'medium' | 'low';
  };
  schedule?: {
    // For scheduled rules
    frequency: 'hourly' | 'daily' | 'weekly';
    lastRun?: string;
    nextRun?: string;
  };
  stats: {
    timesTriggered: number;
    lastTriggered?: string;
    bountiesClaimed: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLog {
  id: string;
  ruleId: string;
  ruleName: string;
  type: string;
  action: string;
  bountyId?: string;
  bountyTitle?: string;
  success: boolean;
  error?: string;
  timestamp: string;
}

/**
 * GET /api/automation - Get automation rules
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'default';
  const includeStats = searchParams.get('includeStats') === 'true';
  const includeLogs = searchParams.get('includeLogs') === 'true';

  try {
    const db = getAdminDb();
    const rulesRef = db
      .collection(COLLECTIONS.AUTOMATION_RULES)
      .doc(userId)
      .collection('rules');

    const rulesSnapshot = await rulesRef.orderBy('createdAt', 'desc').get();
    const rules: AutomationRule[] = rulesSnapshot.docs.map(
      (doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...doc.data(),
      })
    ) as AutomationRule[];

    const response: {
      rules: AutomationRule[];
      logs?: AutomationLog[];
      stats?: {
        totalRules: number;
        activeRules: number;
        totalTriggered: number;
        bountiesClaimed: number;
      };
    } = { rules };

    if (includeLogs) {
      const logsRef = db
        .collection(COLLECTIONS.AUTOMATION_LOGS)
        .doc(userId)
        .collection('logs');

      const logsSnapshot = await logsRef
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();

      response.logs = logsSnapshot.docs.map(
        (doc: QueryDocumentSnapshot<DocumentData>) => ({
          id: doc.id,
          ...doc.data(),
        })
      ) as AutomationLog[];
    }

    if (includeStats) {
      response.stats = {
        totalRules: rules.length,
        activeRules: rules.filter(r => r.enabled).length,
        totalTriggered: rules.reduce((sum, r) => sum + r.stats.timesTriggered, 0),
        bountiesClaimed: rules.reduce((sum, r) => sum + r.stats.bountiesClaimed, 0),
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get automation rules error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch automation rules' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/automation - Create automation rule
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId = 'default', name, type, conditions, actions, schedule } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type' },
        { status: 400 }
      );
    }

    const validTypes = ['auto_claim', 'deadline_reminder', 'discovery_scan', 'pr_monitor'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const rulesRef = db
      .collection(COLLECTIONS.AUTOMATION_RULES)
      .doc(userId)
      .collection('rules');

    const ruleData: Omit<AutomationRule, 'id'> = {
      name,
      enabled: true,
      type,
      conditions: conditions || {},
      actions: actions || { notify: true },
      schedule: schedule ? {
        ...schedule,
        lastRun: undefined,
        nextRun: calculateNextRun(schedule.frequency),
      } : undefined,
      stats: {
        timesTriggered: 0,
        bountiesClaimed: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await rulesRef.add(ruleData);

    const rule: AutomationRule = {
      id: docRef.id,
      ...ruleData,
    };

    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error('Create automation rule error:', error);
    return NextResponse.json(
      { error: 'Failed to create automation rule' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/automation - Update automation rule
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId = 'default', ruleId, ...updates } = body;

    if (!ruleId) {
      return NextResponse.json(
        { error: 'Missing required field: ruleId' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const ruleRef = db
      .collection(COLLECTIONS.AUTOMATION_RULES)
      .doc(userId)
      .collection('rules')
      .doc(ruleId);

    const doc = await ruleRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    const existing = doc.data() as AutomationRule;

    const updatedRule: AutomationRule = {
      ...existing,
      ...updates,
      id: ruleId,
      conditions: { ...existing.conditions, ...updates.conditions },
      actions: { ...existing.actions, ...updates.actions },
      updatedAt: new Date().toISOString(),
    };

    await ruleRef.update({
      ...updates,
      conditions: updatedRule.conditions,
      actions: updatedRule.actions,
      updatedAt: updatedRule.updatedAt,
    });

    return NextResponse.json({
      success: true,
      rule: updatedRule,
    });
  } catch (error) {
    console.error('Update automation rule error:', error);
    return NextResponse.json(
      { error: 'Failed to update automation rule' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/automation - Delete automation rule
 */
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'default';
  const ruleId = searchParams.get('ruleId');

  if (!ruleId) {
    return NextResponse.json(
      { error: 'Missing required parameter: ruleId' },
      { status: 400 }
    );
  }

  try {
    const db = getAdminDb();
    const ruleRef = db
      .collection(COLLECTIONS.AUTOMATION_RULES)
      .doc(userId)
      .collection('rules')
      .doc(ruleId);

    const doc = await ruleRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    await ruleRef.delete();

    return NextResponse.json({
      success: true,
      deleted: ruleId,
    });
  } catch (error) {
    console.error('Delete automation rule error:', error);
    return NextResponse.json(
      { error: 'Failed to delete automation rule' },
      { status: 500 }
    );
  }
}

// Helper: Calculate next run time
function calculateNextRun(frequency: string): string {
  const now = new Date();
  switch (frequency) {
    case 'hourly':
      now.setHours(now.getHours() + 1, 0, 0, 0);
      break;
    case 'daily':
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0); // 9 AM
      break;
    case 'weekly':
      now.setDate(now.getDate() + 7);
      now.setHours(9, 0, 0, 0);
      break;
  }
  return now.toISOString();
}
