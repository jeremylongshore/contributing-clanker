/**
 * Eligibility Assessment Module
 *
 * Determines if an issue is a "workable" task vs RFC/discussion/needs-decision.
 * Hard gate before investing time in qualification.
 */

import type { RepoRules } from './rules';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EligibilityVerdict =
  | 'workable'
  | 'needs_maintainer_decision'
  | 'unclear_requirements'
  | 'not_a_task'
  | 'blocked_by_env'
  | 'blocked_by_rules'
  | 'blocked_by_cla';

export interface EligibilityAssessment {
  eligibility: EligibilityVerdict;
  confidence: number;  // 0-1
  reasons: string[];
  requiredPrework: string[];
}

export interface IssueSignals {
  title: string;
  body: string;
  labels: string[];
  commentCount: number;
  hasMaintainerResponse: boolean;
  maintainerWantsPR: boolean;
  maintainerAsksForDirection: boolean;
  openPRs: number;
  claimants: number;
}

export interface ContextSignals {
  rules: RepoRules | null;
  claRequired: boolean;
  claCompleted: boolean;
  ttfgAvailable: boolean;
  vmRequired: boolean;
  vmApproved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keywords and Patterns
// ─────────────────────────────────────────────────────────────────────────────

const NOT_A_TASK_PATTERNS = [
  /^question:/i,
  /^\[question\]/i,
  /^help:/i,
  /^\[help\]/i,
  /^support:/i,
  /^\[support\]/i,
  /how do i/i,
  /how can i/i,
  /is there a way/i,
  /does anyone know/i,
  /can someone explain/i,
];

const RFC_PATTERNS = [
  /^rfc:/i,
  /^\[rfc\]/i,
  /^proposal:/i,
  /^\[proposal\]/i,
  /^design:/i,
  /^\[design\]/i,
  /design discussion/i,
  /needs design/i,
  /needs rfc/i,
  /let's discuss/i,
  /what do you think/i,
  /seeking feedback/i,
  /thoughts\?/i,
];

const MAINTAINER_DECISION_PATTERNS = [
  /needs maintainer/i,
  /waiting for.*decision/i,
  /needs.*input/i,
  /blocked on.*decision/i,
  /triage needed/i,
  /needs.*review.*approach/i,
  /not sure.*right approach/i,
];

const UNCLEAR_PATTERNS = [
  /unclear/i,
  /more info needed/i,
  /needs clarification/i,
  /reproduction.*needed/i,
  /can you provide/i,
  /steps to reproduce/i, // negative: if this is ASKING for repro, it's unclear
];

const WORKABLE_LABELS = [
  'good first issue',
  'help wanted',
  'bug',
  'bugfix',
  'enhancement',
  'feature',
  'bounty',
  'accepting prs',
  'ready',
  'ready for work',
  'up for grabs',
];

const BLOCKING_LABELS = [
  'wontfix',
  "won't fix",
  'duplicate',
  'invalid',
  'stale',
  'blocked',
  'on hold',
  'needs triage',
  'needs design',
  'needs discussion',
  'rfc',
  'proposal',
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Assessment Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assess if an issue is workable
 */
export function assessEligibility(
  issue: IssueSignals,
  context: ContextSignals
): EligibilityAssessment {
  const reasons: string[] = [];
  const requiredPrework: string[] = [];
  let confidence = 0.5;

  const lowerTitle = issue.title.toLowerCase();
  const lowerBody = issue.body.toLowerCase();
  const lowerLabels = issue.labels.map(l => l.toLowerCase());

  // ─────────────────────────────────────────────────────────────────────────
  // Check for NOT_A_TASK patterns (questions, support requests)
  // ─────────────────────────────────────────────────────────────────────────
  for (const pattern of NOT_A_TASK_PATTERNS) {
    if (pattern.test(issue.title) || pattern.test(issue.body)) {
      reasons.push(`Detected question/support pattern: "${pattern.source}"`);
      return {
        eligibility: 'not_a_task',
        confidence: 0.8,
        reasons,
        requiredPrework: ['This appears to be a question, not a task']
      };
    }
  }

  // Check labels for question/support
  if (lowerLabels.some(l => ['question', 'support', 'help', 'discussion'].includes(l))) {
    reasons.push('Issue has question/support/discussion label');
    return {
      eligibility: 'not_a_task',
      confidence: 0.9,
      reasons,
      requiredPrework: ['This is categorized as a question/discussion, not a task']
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check for RFC/Proposal/Design patterns
  // ─────────────────────────────────────────────────────────────────────────
  for (const pattern of RFC_PATTERNS) {
    if (pattern.test(issue.title) || pattern.test(issue.body)) {
      reasons.push(`Detected RFC/design discussion pattern: "${pattern.source}"`);
      requiredPrework.push('Wait for maintainers to approve the design approach');
      return {
        eligibility: 'needs_maintainer_decision',
        confidence: 0.75,
        reasons,
        requiredPrework
      };
    }
  }

  // Check labels for RFC/design
  if (lowerLabels.some(l => ['rfc', 'proposal', 'design', 'needs-design', 'needs design'].includes(l))) {
    reasons.push('Issue has RFC/design label');
    requiredPrework.push('Wait for design to be approved before starting work');
    return {
      eligibility: 'needs_maintainer_decision',
      confidence: 0.9,
      reasons,
      requiredPrework
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check for blocking labels
  // ─────────────────────────────────────────────────────────────────────────
  for (const blockLabel of BLOCKING_LABELS) {
    if (lowerLabels.includes(blockLabel)) {
      reasons.push(`Issue has blocking label: ${blockLabel}`);
      return {
        eligibility: 'needs_maintainer_decision',
        confidence: 0.85,
        reasons,
        requiredPrework: [`Wait for "${blockLabel}" status to be resolved`]
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check for maintainer decision patterns
  // ─────────────────────────────────────────────────────────────────────────
  for (const pattern of MAINTAINER_DECISION_PATTERNS) {
    if (pattern.test(issue.title) || pattern.test(issue.body)) {
      reasons.push(`Detected needs-decision pattern: "${pattern.source}"`);
      requiredPrework.push('Wait for maintainer decision before starting');
      return {
        eligibility: 'needs_maintainer_decision',
        confidence: 0.7,
        reasons,
        requiredPrework
      };
    }
  }

  // Check if maintainer is asking for direction
  if (issue.maintainerAsksForDirection) {
    reasons.push('Maintainer is asking for input/direction, not requesting work');
    requiredPrework.push('Provide input to maintainer and wait for approval');
    return {
      eligibility: 'needs_maintainer_decision',
      confidence: 0.8,
      reasons,
      requiredPrework
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check for unclear requirements
  // ─────────────────────────────────────────────────────────────────────────
  const hasReproSteps = lowerBody.includes('steps to reproduce') ||
                        lowerBody.includes('reproduction steps') ||
                        lowerBody.includes('to reproduce:');
  const hasExpectedBehavior = lowerBody.includes('expected behavior') ||
                              lowerBody.includes('expected:') ||
                              lowerBody.includes('should');
  const hasAcceptanceCriteria = lowerBody.includes('acceptance criteria') ||
                                lowerBody.includes('definition of done') ||
                                lowerBody.includes('requirements:');

  // If it's a bug with no repro steps
  if (lowerLabels.includes('bug') && !hasReproSteps && issue.commentCount === 0) {
    reasons.push('Bug with no reproduction steps and no comments');
    requiredPrework.push('Ask for reproduction steps before starting');
    return {
      eligibility: 'unclear_requirements',
      confidence: 0.7,
      reasons,
      requiredPrework
    };
  }

  // If body is too short and vague
  if (issue.body.length < 100 && !hasAcceptanceCriteria && !hasExpectedBehavior) {
    // But if maintainer has responded, it might be clearer
    if (!issue.hasMaintainerResponse) {
      reasons.push('Issue description is very short with no acceptance criteria');
      requiredPrework.push('Ask maintainer to clarify requirements');
      confidence = 0.6;
      // Don't return yet - might still be workable if labels are good
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check for CLA/Rules/Environment blockers
  // ─────────────────────────────────────────────────────────────────────────
  if (context.claRequired && !context.claCompleted) {
    reasons.push('CLA required but not completed');
    requiredPrework.push('Complete CLA before starting work');
    return {
      eligibility: 'blocked_by_cla',
      confidence: 0.95,
      reasons,
      requiredPrework
    };
  }

  if (context.vmRequired && !context.vmApproved) {
    reasons.push('This repo requires VM environment which is not approved');
    requiredPrework.push('Get VM access approved before starting');
    return {
      eligibility: 'blocked_by_env',
      confidence: 0.8,
      reasons,
      requiredPrework
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check for competition (multiple PRs already)
  // ─────────────────────────────────────────────────────────────────────────
  if (issue.openPRs >= 3) {
    reasons.push(`High competition: ${issue.openPRs} open PRs already`);
    requiredPrework.push('Check if existing PRs are likely to be merged first');
    // Not a hard block, but reduce confidence
    confidence -= 0.2;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Positive signals for workable
  // ─────────────────────────────────────────────────────────────────────────
  const hasWorkableLabel = lowerLabels.some(l =>
    WORKABLE_LABELS.some(wl => l.includes(wl))
  );

  if (hasWorkableLabel) {
    reasons.push('Has workable label (good first issue, bug, help wanted, etc.)');
    confidence += 0.15;
  }

  if (issue.maintainerWantsPR) {
    reasons.push('Maintainer has indicated they want a PR');
    confidence += 0.2;
  }

  if (hasReproSteps) {
    reasons.push('Has reproduction steps');
    confidence += 0.1;
  }

  if (hasAcceptanceCriteria) {
    reasons.push('Has acceptance criteria');
    confidence += 0.1;
  }

  if (issue.openPRs === 0 && issue.claimants === 0) {
    reasons.push('No competing PRs or claimants');
    confidence += 0.1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Final decision
  // ─────────────────────────────────────────────────────────────────────────

  // If we still have unclear requirements flag from earlier
  if (requiredPrework.length > 0 && confidence < 0.6) {
    return {
      eligibility: 'unclear_requirements',
      confidence,
      reasons,
      requiredPrework
    };
  }

  // If we got here with reasonable confidence, it's workable
  if (confidence >= 0.5) {
    if (requiredPrework.length === 0) {
      reasons.push('Issue appears to be a clear, workable task');
    }
    return {
      eligibility: 'workable',
      confidence: Math.min(1, confidence),
      reasons,
      requiredPrework
    };
  }

  // Low confidence fallback
  reasons.push('Could not determine clear workability');
  requiredPrework.push('Consider asking maintainer if they want a PR');
  return {
    eligibility: 'unclear_requirements',
    confidence,
    reasons,
    requiredPrework
  };
}

/**
 * Format eligibility for display
 */
export function formatEligibility(assessment: EligibilityAssessment): string {
  const emoji = {
    'workable': '✅',
    'needs_maintainer_decision': '⏳',
    'unclear_requirements': '❓',
    'not_a_task': '❌',
    'blocked_by_env': '🔒',
    'blocked_by_rules': '📋',
    'blocked_by_cla': '📝'
  }[assessment.eligibility];

  const label = {
    'workable': 'WORKABLE',
    'needs_maintainer_decision': 'NEEDS MAINTAINER DECISION',
    'unclear_requirements': 'UNCLEAR REQUIREMENTS',
    'not_a_task': 'NOT A TASK',
    'blocked_by_env': 'BLOCKED BY ENVIRONMENT',
    'blocked_by_rules': 'BLOCKED BY RULES',
    'blocked_by_cla': 'BLOCKED BY CLA'
  }[assessment.eligibility];

  return `${emoji} ${label} (${(assessment.confidence * 100).toFixed(0)}% confidence)`;
}

/**
 * Format eligibility for Slack
 */
export function formatEligibilityForSlack(assessment: EligibilityAssessment): string {
  const lines: string[] = [];

  const emoji = {
    'workable': ':white_check_mark:',
    'needs_maintainer_decision': ':hourglass:',
    'unclear_requirements': ':question:',
    'not_a_task': ':x:',
    'blocked_by_env': ':lock:',
    'blocked_by_rules': ':clipboard:',
    'blocked_by_cla': ':memo:'
  }[assessment.eligibility];

  const label = {
    'workable': 'WORKABLE',
    'needs_maintainer_decision': 'NEEDS MAINTAINER DECISION',
    'unclear_requirements': 'UNCLEAR REQUIREMENTS',
    'not_a_task': 'NOT A TASK',
    'blocked_by_env': 'BLOCKED BY ENVIRONMENT',
    'blocked_by_rules': 'BLOCKED BY RULES',
    'blocked_by_cla': 'BLOCKED BY CLA'
  }[assessment.eligibility];

  lines.push(`*ELIGIBILITY:* ${emoji} ${label}`);
  lines.push(`_Confidence: ${(assessment.confidence * 100).toFixed(0)}%_`);

  if (assessment.reasons.length > 0) {
    lines.push('');
    lines.push('*Reasons:*');
    for (const reason of assessment.reasons.slice(0, 4)) {
      lines.push(`  • ${reason}`);
    }
  }

  if (assessment.requiredPrework.length > 0) {
    lines.push('');
    lines.push('*Required prework:*');
    for (const prework of assessment.requiredPrework) {
      lines.push(`  ➜ ${prework}`);
    }
  }

  return lines.join('\n');
}
