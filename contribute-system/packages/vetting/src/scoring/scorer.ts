/**
 * Bounty Scoring Algorithm
 *
 * Evaluates bounty opportunities before claiming based on:
 * - Value: dollar amount and estimated hourly rate
 * - Complexity: estimated effort and difficulty
 * - Competition: claimants, open PRs, activity level
 * - Fit: tech stack match and repo familiarity
 */

import type {
  BountyInput,
  BountyScore,
  ScoringConfig,
  ValueScore,
  ComplexityScore,
  CompetitionScore,
  FitScore,
  ComplexityFactor,
  ScoringWeights
} from './types';
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS } from './types';

export class BountyScorer {
  private config: Required<ScoringConfig>;
  private weights: ScoringWeights;

  constructor(config?: ScoringConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_WEIGHTS, ...config?.weights }
    } as Required<ScoringConfig>;
    this.weights = this.config.weights as ScoringWeights;
  }

  /**
   * Score a bounty opportunity
   */
  score(input: BountyInput): BountyScore {
    const value = this.scoreValue(input);
    const complexity = this.scoreComplexity(input);
    const competition = this.scoreCompetition(input);
    const fit = this.scoreFit(input);

    // Calculate weighted total
    const total = Math.round(
      value.normalized * this.weights.value +
      this.invertComplexity(complexity.estimated) * this.weights.complexity +
      competition.score * this.weights.competition +
      fit.score * this.weights.fit
    );

    const warnings = this.collectWarnings(input, value, complexity, competition, fit);
    const notes = this.collectNotes(input, value, complexity, competition, fit);

    return {
      total,
      grade: this.calculateGrade(total),
      recommendation: this.calculateRecommendation(total, warnings),
      value,
      complexity,
      competition,
      fit,
      scoredAt: new Date().toISOString(),
      confidence: this.calculateConfidence(input),
      warnings,
      notes
    };
  }

  /**
   * Score the dollar value
   */
  private scoreValue(input: BountyInput): ValueScore {
    const raw = input.value;
    const maxValue = this.config.maxValue || 5000;

    // Normalize to 0-100, with diminishing returns above target
    const normalized = Math.min(100, Math.round((raw / maxValue) * 100));

    // Estimate hourly rate based on complexity
    const estimatedHours = this.estimateHours(input);
    const hourlyRate = estimatedHours > 0 ? raw / estimatedHours : 0;

    // Determine tier
    let tier: ValueScore['tier'];
    if (raw < 50) tier = 'low';
    else if (raw < 200) tier = 'medium';
    else if (raw < 1000) tier = 'high';
    else tier = 'premium';

    return { raw, normalized, hourlyRate, tier };
  }

  /**
   * Score the complexity
   */
  private scoreComplexity(input: BountyInput): ComplexityScore {
    const factors: ComplexityFactor[] = [];

    // Estimate lines of code
    let linesEstimate = input.estimatedLines || this.estimateLinesFromDescription(input);
    let filesEstimate = input.estimatedFiles || Math.ceil(linesEstimate / 100);

    // Factor: Size
    if (linesEstimate < 50) {
      factors.push({ name: 'size', impact: 'low', score: 20, reason: 'Small change (<50 lines)' });
    } else if (linesEstimate < 200) {
      factors.push({ name: 'size', impact: 'medium', score: 50, reason: 'Medium change (50-200 lines)' });
    } else if (linesEstimate < 500) {
      factors.push({ name: 'size', impact: 'high', score: 70, reason: 'Large change (200-500 lines)' });
    } else {
      factors.push({ name: 'size', impact: 'high', score: 90, reason: 'Very large change (500+ lines)' });
    }

    // Factor: Multi-file
    if (filesEstimate > 5) {
      factors.push({ name: 'multi-file', impact: 'high', score: 30, reason: `Touches ${filesEstimate}+ files` });
    } else if (filesEstimate > 2) {
      factors.push({ name: 'multi-file', impact: 'medium', score: 15, reason: `Touches ${filesEstimate} files` });
    }

    // Factor: Explicit difficulty
    if (input.difficulty) {
      const difficultyScores = { easy: 20, medium: 50, hard: 80 };
      factors.push({
        name: 'difficulty',
        impact: input.difficulty === 'hard' ? 'high' : input.difficulty === 'medium' ? 'medium' : 'low',
        score: difficultyScores[input.difficulty],
        reason: `Marked as ${input.difficulty}`
      });
    }

    // Factor: Labels suggesting complexity
    const complexLabels = ['breaking-change', 'architecture', 'refactor', 'security', 'performance'];
    const matchedLabels = (input.labels || []).filter(l =>
      complexLabels.some(cl => l.toLowerCase().includes(cl))
    );
    if (matchedLabels.length > 0) {
      factors.push({
        name: 'labels',
        impact: 'medium',
        score: matchedLabels.length * 10,
        reason: `Complex labels: ${matchedLabels.join(', ')}`
      });
    }

    // Calculate overall complexity score
    const estimated = factors.length > 0
      ? Math.min(100, Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length))
      : 50; // Default to medium if no factors

    return { estimated, linesEstimate, filesEstimate, factors };
  }

  /**
   * Score the competition level
   */
  private scoreCompetition(input: BountyInput): CompetitionScore {
    const claimants = input.claimants || 0;
    const openPRs = input.openPRs || 0;
    const daysOpen = input.createdAt
      ? Math.floor((Date.now() - new Date(input.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Start with 100 and deduct for competition
    let score = 100;

    // Deduct for claimants (heavy penalty)
    score -= claimants * 25;

    // Deduct for open PRs (very heavy - someone might beat you)
    score -= openPRs * 35;

    // Slight bonus for being open longer (less interest = easier)
    if (daysOpen > 30) score += 10;
    if (daysOpen > 90) score += 10;

    score = Math.max(0, Math.min(100, score));

    // Determine activity level
    let activity: CompetitionScore['activity'];
    if (claimants + openPRs === 0 && daysOpen > 14) activity = 'stale';
    else if (claimants + openPRs >= 3) activity = 'hot';
    else activity = 'active';

    return { score, claimants, openPRs, daysOpen, activity };
  }

  /**
   * Score the tech stack fit
   */
  private scoreFit(input: BountyInput): FitScore {
    const technologies = input.technologies || this.detectTechnologies(input);
    const knownTech = this.config.knownTechnologies || [];
    const preferredTech = this.config.preferredTechnologies || [];
    const avoidTech = this.config.avoidTechnologies || [];

    const matchedTech = technologies.filter(t =>
      knownTech.some(k => t.toLowerCase().includes(k.toLowerCase()))
    );
    const unknownTech = technologies.filter(t =>
      !knownTech.some(k => t.toLowerCase().includes(k.toLowerCase()))
    );
    const preferredMatches = technologies.filter(t =>
      preferredTech.some(p => t.toLowerCase().includes(p.toLowerCase()))
    );
    const avoidMatches = technologies.filter(t =>
      avoidTech.some(a => t.toLowerCase().includes(a.toLowerCase()))
    );

    // Calculate score
    let score = 50; // Base score

    // Bonus for known tech
    if (technologies.length > 0) {
      score = Math.round((matchedTech.length / technologies.length) * 100);
    }

    // Bonus for preferred tech
    score += preferredMatches.length * 10;

    // Penalty for avoided tech
    score -= avoidMatches.length * 20;

    // Repo familiarity
    let repoFamiliarity: FitScore['repoFamiliarity'] = 'none';
    if (input.repo) {
      if ((this.config.expertRepos || []).includes(input.repo)) {
        repoFamiliarity = 'expert';
        score += 30;
      } else if ((this.config.familiarRepos || []).includes(input.repo)) {
        repoFamiliarity = 'familiar';
        score += 15;
      } else if (matchedTech.length > 0) {
        repoFamiliarity = 'some';
      }
    }

    score = Math.max(0, Math.min(100, score));

    return { score, matchedTech, unknownTech, repoFamiliarity };
  }

  // Helper methods

  private invertComplexity(complexity: number): number {
    // Lower complexity = higher score (we want easier bounties)
    return 100 - complexity;
  }

  private estimateHours(input: BountyInput): number {
    const lines = input.estimatedLines || this.estimateLinesFromDescription(input);
    // Rough estimate: 20 lines/hour for average complexity
    return Math.max(1, Math.round(lines / 20));
  }

  private estimateLinesFromDescription(input: BountyInput): number {
    const desc = (input.description || '').toLowerCase();
    const title = input.title.toLowerCase();

    // Keywords suggesting size
    if (desc.includes('refactor') || desc.includes('rewrite')) return 300;
    if (desc.includes('add feature') || desc.includes('implement')) return 150;
    if (desc.includes('fix') || desc.includes('bug')) return 50;
    if (title.includes('typo') || title.includes('docs')) return 10;

    // Default based on value
    if (input.value < 50) return 30;
    if (input.value < 200) return 100;
    if (input.value < 500) return 200;
    return 400;
  }

  private detectTechnologies(input: BountyInput): string[] {
    const technologies: string[] = [];
    const text = `${input.title} ${input.description || ''} ${(input.labels || []).join(' ')}`.toLowerCase();

    const techPatterns: [string, RegExp][] = [
      ['TypeScript', /typescript|\.ts\b/],
      ['JavaScript', /javascript|\.js\b|node/],
      ['React', /react|jsx|tsx/],
      ['Python', /python|\.py\b|django|flask/],
      ['Rust', /rust|cargo|\.rs\b/],
      ['Go', /golang|\bgo\b|\.go\b/],
      ['Java', /java\b|spring|maven|gradle/],
      ['Scala', /scala|sbt/],
      ['Ruby', /ruby|rails|\.rb\b/],
      ['PHP', /php|laravel|symfony/],
      ['CSS', /css|scss|sass|tailwind/],
      ['SQL', /sql|postgres|mysql|database/],
      ['Docker', /docker|container|kubernetes|k8s/],
      ['AWS', /aws|amazon|s3|lambda/],
      ['GCP', /gcp|google cloud|firebase|vertex/]
    ];

    for (const [tech, pattern] of techPatterns) {
      if (pattern.test(text)) {
        technologies.push(tech);
      }
    }

    return technologies;
  }

  private calculateGrade(score: number): BountyScore['grade'] {
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }

  private calculateRecommendation(
    score: number,
    warnings: string[]
  ): BountyScore['recommendation'] {
    const hasBlockingWarning = warnings.some(w =>
      w.includes('BLOCKING') || w.includes('Skip')
    );
    if (hasBlockingWarning) return 'skip';
    if (score >= 65) return 'claim';
    if (score >= 40) return 'consider';
    return 'skip';
  }

  private calculateConfidence(input: BountyInput): number {
    let confidence = 50;

    // More info = more confidence
    if (input.description) confidence += 15;
    if (input.labels && input.labels.length > 0) confidence += 10;
    if (input.technologies && input.technologies.length > 0) confidence += 10;
    if (input.estimatedLines !== undefined) confidence += 10;
    if (input.claimants !== undefined) confidence += 5;

    return Math.min(100, confidence);
  }

  private collectWarnings(
    input: BountyInput,
    value: ValueScore,
    complexity: ComplexityScore,
    competition: CompetitionScore,
    fit: FitScore
  ): string[] {
    const warnings: string[] = [];

    // Value warnings
    if (value.raw < (this.config.minValue || 20)) {
      warnings.push(`Value too low ($${value.raw} < $${this.config.minValue})`);
    }
    if (value.hourlyRate < 20) {
      warnings.push(`Low hourly rate: ~$${Math.round(value.hourlyRate)}/hr`);
    }

    // Complexity warnings
    if (complexity.estimated > (this.config.maxComplexity || 80)) {
      warnings.push(`BLOCKING: Complexity too high (${complexity.estimated}/100)`);
    }

    // Competition warnings
    if (competition.claimants > (this.config.maxClaimants || 3)) {
      warnings.push(`BLOCKING: Too many claimants (${competition.claimants})`);
    }
    if (competition.openPRs > (this.config.maxOpenPRs || 2)) {
      warnings.push(`BLOCKING: ${competition.openPRs} open PRs already`);
    }

    // Fit warnings
    if (fit.unknownTech.length > fit.matchedTech.length) {
      warnings.push(`Unfamiliar tech stack: ${fit.unknownTech.join(', ')}`);
    }

    return warnings;
  }

  private collectNotes(
    input: BountyInput,
    value: ValueScore,
    complexity: ComplexityScore,
    competition: CompetitionScore,
    fit: FitScore
  ): string[] {
    const notes: string[] = [];

    if (value.tier === 'premium') {
      notes.push(`Premium bounty: $${value.raw}`);
    }
    if (competition.activity === 'stale') {
      notes.push('Bounty has been open for a while - may be difficult or abandoned');
    }
    if (fit.repoFamiliarity === 'expert') {
      notes.push('You know this repo well - competitive advantage');
    }
    if (complexity.factors.some(f => f.name === 'size' && f.impact === 'low')) {
      notes.push('Small change - quick win potential');
    }

    return notes;
  }
}

/**
 * Quick scoring function for one-off use
 */
export function scoreBounty(input: BountyInput, config?: ScoringConfig): BountyScore {
  const scorer = new BountyScorer(config);
  return scorer.score(input);
}
