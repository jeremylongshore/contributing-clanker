/**
 * EV Scoring System - Phase 4 of Bounty Flywheel
 *
 * Calculates Expected Value (EV) based on:
 * - Payout amount
 * - Win probability (multi-factor)
 * - Time estimates (Lo/Best/Hi)
 * - Hourly target rate
 *
 * Also implements Buy Box rules for go/no-go decisions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeEstimate {
  lo: number;   // Optimistic (minutes)
  best: number; // Realistic (minutes)
  hi: number;   // Pessimistic (minutes, max 480)
}

export interface WinProbabilityFactors {
  responsiveness: number;   // 0-1, based on maintainer response time
  competition: number;      // 0-1, based on competing PRs/claimants
  ciHealth: number;         // 0-1, based on CI flake rate
  clarity: number;          // 0-1, based on issue quality
  maintainerScore: number;  // 0-1, based on maintainer intel
}

export interface WinProbabilityBreakdown {
  factors: WinProbabilityFactors;
  weights: WinProbabilityFactors;
  overall: number;
}

export interface EVCalculation {
  payout: number;
  payoutCurrency: string;
  winProbability: number;
  winProbBreakdown: WinProbabilityBreakdown;
  timeEstimate: TimeEstimate;
  hourlyTarget: number;
  opportunityCost: number;  // Time cost in hourly rate
  ev: number;               // EV = payout * winProb - opportunityCost
  evPerHour: number;        // EV per hour of expected work
}

export interface BuyBoxResult {
  passed: boolean;
  reasons: string[];
  warnings: string[];
}

export interface BuyBoxConfig {
  minEV: number;              // Minimum EV (default: 0)
  minWinProbability: number;  // Minimum win probability (default: 0.3)
  maxTTFG: number;            // Max TTFG in minutes (default: 60)
  minMaintainerScore: number; // Min maintainer score (default: 50)
  maxCompetition: number;     // Max competing PRs (default: 3)
  hourlyTarget: number;       // Target hourly rate (default: 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// Win Probability Weights
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: WinProbabilityFactors = {
  responsiveness: 0.20,
  competition: 0.25,
  ciHealth: 0.15,
  clarity: 0.20,
  maintainerScore: 0.20
};

// ─────────────────────────────────────────────────────────────────────────────
// Win Probability Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate win probability from multiple factors
 */
export function calculateWinProbability(factors: Partial<WinProbabilityFactors>): WinProbabilityBreakdown {
  // Default to 0.5 for unknown factors
  const filledFactors: WinProbabilityFactors = {
    responsiveness: factors.responsiveness ?? 0.5,
    competition: factors.competition ?? 0.5,
    ciHealth: factors.ciHealth ?? 0.5,
    clarity: factors.clarity ?? 0.5,
    maintainerScore: factors.maintainerScore ?? 0.5
  };

  // Weighted sum
  const overall =
    (filledFactors.responsiveness * DEFAULT_WEIGHTS.responsiveness) +
    (filledFactors.competition * DEFAULT_WEIGHTS.competition) +
    (filledFactors.ciHealth * DEFAULT_WEIGHTS.ciHealth) +
    (filledFactors.clarity * DEFAULT_WEIGHTS.clarity) +
    (filledFactors.maintainerScore * DEFAULT_WEIGHTS.maintainerScore);

  return {
    factors: filledFactors,
    weights: DEFAULT_WEIGHTS,
    overall: Math.min(1, Math.max(0, overall))
  };
}

/**
 * Calculate responsiveness factor from median response time
 */
export function responsivenessFromResponseTime(medianMinutes: number | null): number {
  if (medianMinutes === null) return 0.5; // Unknown
  if (medianMinutes <= 60) return 0.95;       // < 1 hour
  if (medianMinutes <= 240) return 0.85;      // < 4 hours
  if (medianMinutes <= 1440) return 0.70;     // < 1 day
  if (medianMinutes <= 4320) return 0.50;     // < 3 days
  if (medianMinutes <= 10080) return 0.30;    // < 1 week
  return 0.15;                                 // > 1 week
}

/**
 * Calculate competition factor from competing PRs and claimants
 */
export function competitionFromPRs(openPRs: number, claimants: number): number {
  const total = openPRs + claimants;
  if (total === 0) return 0.95;  // No competition
  if (total === 1) return 0.75;  // One competitor
  if (total === 2) return 0.50;
  if (total === 3) return 0.30;
  return 0.10;                   // Heavy competition
}

/**
 * Calculate CI health factor from flake rate
 */
export function ciHealthFromFlakeRate(flakeRate: number | null): number {
  if (flakeRate === null) return 0.6; // Unknown, slight penalty
  if (flakeRate <= 0.01) return 0.95;  // < 1% flaky
  if (flakeRate <= 0.05) return 0.80;  // < 5%
  if (flakeRate <= 0.10) return 0.60;  // < 10%
  if (flakeRate <= 0.20) return 0.40;  // < 20%
  return 0.20;                          // Very flaky
}

/**
 * Calculate clarity factor from issue quality signals
 */
export function clarityFromSignals(
  hasReproSteps: boolean,
  hasAcceptanceCriteria: boolean,
  isRFC: boolean,
  needsMaintainerDecision: boolean
): number {
  let score = 0.5; // Base

  if (hasReproSteps) score += 0.15;
  if (hasAcceptanceCriteria) score += 0.15;
  if (isRFC) score -= 0.20; // RFCs are risky
  if (needsMaintainerDecision) score -= 0.25; // Blocked on maintainer

  return Math.min(1, Math.max(0, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Estimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate time from scope indicators
 */
export function estimateTime(
  estimatedFiles: number,
  estimatedLOC: number,
  hasTests: boolean,
  isNewFeature: boolean,
  calibrationFactor: number = 1.0
): TimeEstimate {
  // Base estimates in minutes
  let base: number;

  if (estimatedFiles <= 2 && estimatedLOC <= 80) {
    base = 60;  // Simple fix
  } else if (estimatedFiles <= 4 && estimatedLOC <= 200) {
    base = 120; // Small feature
  } else if (estimatedFiles <= 6 && estimatedLOC <= 400) {
    base = 180; // Medium feature
  } else {
    base = 300; // Complex work
  }

  // Adjustments
  if (hasTests) base += 45;  // Writing tests takes time
  if (isNewFeature) base *= 1.3; // New features are riskier

  // Apply calibration factor from historical data
  base *= calibrationFactor;

  // Generate Lo/Best/Hi
  const lo = Math.round(base * 0.6);
  const best = Math.round(base);
  const hi = Math.min(480, Math.round(base * 1.8)); // Cap at 8 hours

  return { lo, best, hi };
}

/**
 * Default time estimate when scope is unknown
 */
export function defaultTimeEstimate(): TimeEstimate {
  return { lo: 60, best: 120, hi: 240 };
}

// ─────────────────────────────────────────────────────────────────────────────
// EV Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate Expected Value
 *
 * @param includeTimeCost - If false, skip opportunity cost calculation (default: false)
 *                          Set to true to penalize EV based on time estimates
 */
export function calculateEV(
  payout: number,
  payoutCurrency: string,
  winProbBreakdown: WinProbabilityBreakdown,
  timeEstimate: TimeEstimate,
  hourlyTarget: number = 100,
  includeTimeCost: boolean = false  // OFF by default - user decides if worth their time
): EVCalculation {
  const winProbability = winProbBreakdown.overall;

  // Opportunity cost = expected time * hourly rate (only if includeTimeCost is true)
  const expectedMinutes = timeEstimate.best;
  const expectedHours = expectedMinutes / 60;
  const opportunityCost = includeTimeCost ? expectedHours * hourlyTarget : 0;

  // EV = (payout * winProb) - opportunityCost
  const expectedPayout = payout * winProbability;
  const ev = expectedPayout - opportunityCost;

  // EV per hour of expected work
  const evPerHour = expectedHours > 0 ? ev / expectedHours : 0;

  return {
    payout,
    payoutCurrency,
    winProbability,
    winProbBreakdown,
    timeEstimate,
    hourlyTarget,
    opportunityCost,
    ev,
    evPerHour
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Buy Box
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BUYBOX_CONFIG: BuyBoxConfig = {
  minEV: 0,
  minWinProbability: 0.3,
  maxTTFG: 60,
  minMaintainerScore: 50,
  maxCompetition: 3,
  hourlyTarget: 100
};

/**
 * Check if bounty passes buy box criteria
 */
export function checkBuyBox(
  evCalc: EVCalculation,
  ttfgMinutes: number | null,
  maintainerScore: number | null,
  competingPRs: number,
  config: Partial<BuyBoxConfig> = {}
): BuyBoxResult {
  const cfg = { ...DEFAULT_BUYBOX_CONFIG, ...config };
  const reasons: string[] = [];
  const warnings: string[] = [];
  let passed = true;

  // Check EV
  if (evCalc.ev < cfg.minEV) {
    passed = false;
    reasons.push(`EV too low: $${evCalc.ev.toFixed(2)} < $${cfg.minEV}`);
  }

  // Check win probability
  if (evCalc.winProbability < cfg.minWinProbability) {
    passed = false;
    reasons.push(`Win probability too low: ${(evCalc.winProbability * 100).toFixed(0)}% < ${cfg.minWinProbability * 100}%`);
  }

  // Check TTFTG
  if (ttfgMinutes !== null && ttfgMinutes > cfg.maxTTFG) {
    passed = false;
    reasons.push(`TTFTG too high: ${ttfgMinutes}min > ${cfg.maxTTFG}min`);
  } else if (ttfgMinutes === null) {
    warnings.push(`TTFTG unknown - run bootstrap first`);
  }

  // Check maintainer score
  if (maintainerScore !== null && maintainerScore < cfg.minMaintainerScore) {
    passed = false;
    reasons.push(`Maintainer score too low: ${maintainerScore} < ${cfg.minMaintainerScore}`);
  } else if (maintainerScore === null) {
    warnings.push(`Maintainer score unknown - run maintainer sync first`);
  }

  // Check competition
  if (competingPRs >= cfg.maxCompetition) {
    passed = false;
    reasons.push(`Too much competition: ${competingPRs} PRs >= ${cfg.maxCompetition}`);
  }

  // Add positive reasons if passed
  if (passed) {
    if (evCalc.ev > 0) {
      reasons.push(`EV positive: $${evCalc.ev.toFixed(2)}`);
    }
    if (evCalc.winProbability >= 0.6) {
      reasons.push(`High win probability: ${(evCalc.winProbability * 100).toFixed(0)}%`);
    }
    if (competingPRs === 0) {
      reasons.push(`No competing PRs`);
    }
  }

  return { passed, reasons, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Complexity Stage
// ─────────────────────────────────────────────────────────────────────────────

export type ComplexityStage = 'C0' | 'C1' | 'C2' | 'C3';

export interface ComplexityAssessment {
  stage: ComplexityStage;
  confidence: number;  // 0-1
  score: number;       // 0-100
  drivers: Record<string, number>; // Factor -> contribution
}

/**
 * Assess complexity at C0 stage (issue text only)
 */
export function assessC0Complexity(
  title: string,
  body: string,
  labels: string[]
): ComplexityAssessment {
  const drivers: Record<string, number> = {};
  let score = 50; // Base complexity

  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();
  const lowerLabels = labels.map(l => l.toLowerCase());

  // High complexity labels
  if (lowerLabels.some(l => ['breaking-change', 'breaking'].includes(l))) {
    score += 25;
    drivers['breaking-change'] = 25;
  }
  if (lowerLabels.some(l => ['security', 'vulnerability'].includes(l))) {
    score += 20;
    drivers['security'] = 20;
  }
  if (lowerLabels.some(l => ['architecture', 'refactor', 'redesign'].includes(l))) {
    score += 20;
    drivers['architecture'] = 20;
  }

  // High complexity keywords
  const complexKeywords = ['rewrite', 'design', 'rfc', 'proposal', 'migrate', 'migration'];
  for (const keyword of complexKeywords) {
    if (lowerTitle.includes(keyword) || lowerBody.includes(keyword)) {
      score += 15;
      drivers[`keyword:${keyword}`] = 15;
      break;
    }
  }

  // Ambiguity penalty
  if (!lowerBody.includes('steps to reproduce') && !lowerBody.includes('expected behavior')) {
    score += 10;
    drivers['missing-repro'] = 10;
  }
  if (!lowerBody.includes('acceptance') && !lowerBody.includes('definition of done')) {
    score += 10;
    drivers['missing-criteria'] = 10;
  }

  return {
    stage: 'C0',
    confidence: 0.2,
    score: Math.min(100, score),
    drivers
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format time estimate as string
 */
export function formatTimeEstimate(est: TimeEstimate): string {
  return `${est.lo}/${est.best}/${est.hi} min`;
}

/**
 * Format EV as string
 */
export function formatEV(ev: number, currency: string = 'USD'): string {
  if (ev >= 0) {
    return `+$${ev.toFixed(2)} ${currency}`;
  }
  return `-$${Math.abs(ev).toFixed(2)} ${currency}`;
}

/**
 * Format win probability as percentage
 */
export function formatWinProbability(prob: number): string {
  return `${(prob * 100).toFixed(0)}%`;
}
