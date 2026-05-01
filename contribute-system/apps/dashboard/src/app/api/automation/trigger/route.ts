/**
 * Automation Trigger API
 *
 * Endpoint to trigger automation rules - either manually or via cron.
 * Evaluates bounties against rules and performs configured actions.
 * Uses Firestore for rules and logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, COLLECTIONS } from '@/lib/firebase-admin';
import { AutomationRule, AutomationLog } from '../route';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

interface TriggerResult {
  ruleId: string;
  ruleName: string;
  matches: number;
  actions: {
    notified: number;
    claimed: number;
    watchlisted: number;
  };
  errors: string[];
}

/**
 * POST /api/automation/trigger - Trigger automation rules
 *
 * Can be called:
 * - Manually from dashboard
 * - Via cron job (e.g., Cloud Scheduler)
 * - Via webhook when new bounties are discovered
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId = 'default',
      ruleIds, // Optional: specific rules to run
      bounties, // Optional: specific bounties to evaluate
      source, // 'manual' | 'cron' | 'webhook'
    } = body;

    const db = getAdminDb();

    // Fetch rules from Firestore
    const rulesRef = db
      .collection(COLLECTIONS.AUTOMATION_RULES)
      .doc(userId)
      .collection('rules');

    let rulesQuery = rulesRef.where('enabled', '==', true);
    const rulesSnapshot = await rulesQuery.get();

    let rules: AutomationRule[] = rulesSnapshot.docs.map(
      (doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...doc.data(),
      })
    ) as AutomationRule[];

    // Filter to specific rules if provided
    if (ruleIds && Array.isArray(ruleIds)) {
      rules = rules.filter(r => ruleIds.includes(r.id));
    }

    // If no rules found, use demo rules for development
    if (rules.length === 0 && !ruleIds) {
      rules = getSampleRules();
    }

    // Get bounties to evaluate (from param or sample data for demo)
    const bountiesPool = bounties || getSampleBounties();

    const results: TriggerResult[] = [];
    const logsToWrite: Omit<AutomationLog, 'id'>[] = [];

    for (const rule of rules) {
      const result: TriggerResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        matches: 0,
        actions: { notified: 0, claimed: 0, watchlisted: 0 },
        errors: [],
      };

      for (const bounty of bountiesPool) {
        const matches = evaluateBountyAgainstRule(bounty, rule);

        if (matches) {
          result.matches++;

          // Perform actions
          if (rule.actions.notify) {
            try {
              await sendNotification(userId, rule, bounty);
              result.actions.notified++;
              logsToWrite.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: rule.type,
                action: 'notify',
                bountyId: bounty.id,
                bountyTitle: bounty.title,
                success: true,
                timestamp: new Date().toISOString(),
              });
            } catch (e) {
              const errorMsg = `Notification failed for ${bounty.id}: ${e}`;
              result.errors.push(errorMsg);
              logsToWrite.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: rule.type,
                action: 'notify',
                bountyId: bounty.id,
                bountyTitle: bounty.title,
                success: false,
                error: errorMsg,
                timestamp: new Date().toISOString(),
              });
            }
          }

          if (rule.actions.autoClaim) {
            try {
              await claimBounty(userId, bounty);
              result.actions.claimed++;
              logsToWrite.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: rule.type,
                action: 'claim',
                bountyId: bounty.id,
                bountyTitle: bounty.title,
                success: true,
                timestamp: new Date().toISOString(),
              });
            } catch (e) {
              const errorMsg = `Claim failed for ${bounty.id}: ${e}`;
              result.errors.push(errorMsg);
              logsToWrite.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: rule.type,
                action: 'claim',
                bountyId: bounty.id,
                bountyTitle: bounty.title,
                success: false,
                error: errorMsg,
                timestamp: new Date().toISOString(),
              });
            }
          }

          if (rule.actions.addToWatchlist) {
            try {
              await addToWatchlist(userId, bounty);
              result.actions.watchlisted++;
              logsToWrite.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: rule.type,
                action: 'watchlist',
                bountyId: bounty.id,
                bountyTitle: bounty.title,
                success: true,
                timestamp: new Date().toISOString(),
              });
            } catch (e) {
              const errorMsg = `Watchlist failed for ${bounty.id}: ${e}`;
              result.errors.push(errorMsg);
              logsToWrite.push({
                ruleId: rule.id,
                ruleName: rule.name,
                type: rule.type,
                action: 'watchlist',
                bountyId: bounty.id,
                bountyTitle: bounty.title,
                success: false,
                error: errorMsg,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      }

      // Update rule stats in Firestore (only for real rules, not samples)
      if (!rule.id.startsWith('sample-')) {
        const ruleRef = rulesRef.doc(rule.id);
        await ruleRef.update({
          'stats.timesTriggered': rule.stats.timesTriggered + 1,
          'stats.lastTriggered': new Date().toISOString(),
          'stats.bountiesClaimed': rule.stats.bountiesClaimed + result.actions.claimed,
        });
      }

      results.push(result);
    }

    // Write logs to Firestore
    if (logsToWrite.length > 0) {
      const logsRef = db
        .collection(COLLECTIONS.AUTOMATION_LOGS)
        .doc(userId)
        .collection('logs');

      const batch = db.batch();
      for (const log of logsToWrite) {
        const logDoc = logsRef.doc();
        batch.set(logDoc, log);
      }
      await batch.commit();
    }

    // Calculate summary
    const totalMatches = results.reduce((sum, r) => sum + r.matches, 0);
    const totalActions = results.reduce(
      (sum, r) => sum + r.actions.notified + r.actions.claimed + r.actions.watchlisted,
      0
    );

    return NextResponse.json({
      success: true,
      source: source || 'manual',
      timestamp: new Date().toISOString(),
      summary: {
        rulesEvaluated: rules.length,
        bountiesEvaluated: bountiesPool.length,
        totalMatches,
        totalActions,
      },
      results,
    });
  } catch (error) {
    console.error('Automation trigger error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger automation' },
      { status: 500 }
    );
  }
}

// Evaluate if a bounty matches a rule's conditions
function evaluateBountyAgainstRule(bounty: any, rule: AutomationRule): boolean {
  const c = rule.conditions;

  // Score checks
  if (c.minScore !== undefined && bounty.score < c.minScore) return false;
  if (c.maxScore !== undefined && bounty.score > c.maxScore) return false;

  // Value checks
  if (c.minValue !== undefined && bounty.value < c.minValue) return false;
  if (c.maxValue !== undefined && bounty.value > c.maxValue) return false;

  // Technology checks
  if (c.technologies?.length && c.technologies.length > 0) {
    const bountyTechs = bounty.technologies || [];
    const hasMatch = c.technologies.some((t: string) =>
      bountyTechs.some((bt: string) => bt.toLowerCase() === t.toLowerCase())
    );
    if (!hasMatch) return false;
  }

  if (c.excludeTechnologies?.length && c.excludeTechnologies.length > 0) {
    const bountyTechs = bounty.technologies || [];
    const hasExcluded = c.excludeTechnologies.some((t: string) =>
      bountyTechs.some((bt: string) => bt.toLowerCase() === t.toLowerCase())
    );
    if (hasExcluded) return false;
  }

  // Repo/org checks
  if (c.repos?.length && c.repos.length > 0 && !c.repos.includes(bounty.repo)) return false;
  if (c.orgs?.length && c.orgs.length > 0 && !c.orgs.includes(bounty.org)) return false;

  // Label checks
  if (c.labels?.length && c.labels.length > 0) {
    const bountyLabels = bounty.labels || [];
    const hasLabel = c.labels.some((l: string) =>
      bountyLabels.some((bl: string) => bl.toLowerCase() === l.toLowerCase())
    );
    if (!hasLabel) return false;
  }

  if (c.excludeLabels?.length && c.excludeLabels.length > 0) {
    const bountyLabels = bounty.labels || [];
    const hasExcluded = c.excludeLabels.some((l: string) =>
      bountyLabels.some((bl: string) => bl.toLowerCase() === l.toLowerCase())
    );
    if (hasExcluded) return false;
  }

  // Competition check
  if (c.maxCompetitors !== undefined && bounty.competitors > c.maxCompetitors) return false;

  return true;
}

// Placeholder: Send notification
async function sendNotification(userId: string, rule: AutomationRule, bounty: any) {
  console.log(`[Notification] User ${userId}: Rule "${rule.name}" matched bounty "${bounty.title}"`);
  // In production, call /api/notifications to send actual notification
}

// Placeholder: Claim bounty
async function claimBounty(userId: string, bounty: any) {
  console.log(`[Auto-Claim] User ${userId}: Claiming bounty "${bounty.title}"`);
  // In production, call GitHub API or platform API to claim
}

// Placeholder: Add to watchlist
async function addToWatchlist(userId: string, bounty: any) {
  console.log(`[Watchlist] User ${userId}: Adding bounty "${bounty.title}" to watchlist`);
  // In production, save to Firestore watchlist collection
}

// Sample rules for demo/development
function getSampleRules(): AutomationRule[] {
  return [
    {
      id: 'sample-1',
      name: 'High-value TypeScript bounties',
      enabled: true,
      type: 'auto_claim',
      conditions: {
        minValue: 100,
        minScore: 70,
        technologies: ['TypeScript', 'React', 'Next.js'],
        maxCompetitors: 2,
      },
      actions: {
        notify: true,
        autoClaim: false,
        addToWatchlist: true,
      },
      stats: {
        timesTriggered: 0,
        bountiesClaimed: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sample-2',
      name: 'Quick Rust wins',
      enabled: true,
      type: 'auto_claim',
      conditions: {
        minScore: 80,
        technologies: ['Rust'],
        excludeLabels: ['complex', 'breaking-change'],
      },
      actions: {
        notify: true,
        autoClaim: true,
      },
      stats: {
        timesTriggered: 0,
        bountiesClaimed: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

// Sample bounties for demo/development
function getSampleBounties() {
  return [
    {
      id: 'bounty-1',
      title: 'Fix TypeScript types in React component',
      value: 150,
      score: 85,
      technologies: ['TypeScript', 'React'],
      repo: 'org/repo',
      org: 'org',
      labels: ['good-first-issue', 'typescript'],
      competitors: 1,
    },
    {
      id: 'bounty-2',
      title: 'Add Rust CLI subcommand',
      value: 200,
      score: 90,
      technologies: ['Rust'],
      repo: 'rust-org/cli',
      org: 'rust-org',
      labels: ['enhancement'],
      competitors: 0,
    },
    {
      id: 'bounty-3',
      title: 'Complex database migration',
      value: 500,
      score: 45,
      technologies: ['Python', 'PostgreSQL'],
      repo: 'data/backend',
      org: 'data',
      labels: ['complex', 'database'],
      competitors: 3,
    },
  ];
}
