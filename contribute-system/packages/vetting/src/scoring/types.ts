/**
 * Bounty Scoring Types
 *
 * Types for evaluating bounty opportunities before claiming.
 */

export interface ScoringWeights {
  value: number;       // Weight for dollar value (default: 0.25)
  complexity: number;  // Weight for complexity match (default: 0.25)
  competition: number; // Weight for competition level (default: 0.25)
  fit: number;         // Weight for tech stack fit (default: 0.25)
}

export interface ValueScore {
  raw: number;           // Raw dollar value
  normalized: number;    // 0-100 normalized score
  hourlyRate: number;    // Estimated $/hr based on complexity
  tier: 'low' | 'medium' | 'high' | 'premium';
}

export interface ComplexityScore {
  estimated: number;     // 0-100 complexity score
  linesEstimate: number; // Estimated lines of code
  filesEstimate: number; // Estimated files to change
  factors: ComplexityFactor[];
}

export interface ComplexityFactor {
  name: string;
  impact: 'low' | 'medium' | 'high';
  score: number;
  reason: string;
}

export interface CompetitionScore {
  score: number;         // 0-100 (100 = no competition)
  claimants: number;     // Number of people who've claimed
  openPRs: number;       // Number of open PRs addressing this
  daysOpen: number;      // Days since bounty opened
  activity: 'stale' | 'active' | 'hot';
}

export interface FitScore {
  score: number;         // 0-100 tech stack fit
  matchedTech: string[]; // Technologies I know
  unknownTech: string[]; // Technologies I don't know
  repoFamiliarity: 'none' | 'some' | 'familiar' | 'expert';
}

export interface BountyScore {
  total: number;         // 0-100 composite score
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: 'claim' | 'consider' | 'skip';

  // Component scores
  value: ValueScore;
  complexity: ComplexityScore;
  competition: CompetitionScore;
  fit: FitScore;

  // Metadata
  scoredAt: string;
  confidence: number;    // 0-100 confidence in the score
  warnings: string[];    // Any red flags
  notes: string[];       // Additional observations
}

export interface ScoringConfig {
  weights?: Partial<ScoringWeights>;

  // Value thresholds
  minValue?: number;           // Minimum bounty value to consider
  maxValue?: number;           // Cap for value normalization
  targetHourlyRate?: number;   // Target $/hr for value scoring

  // Complexity preferences
  maxComplexity?: number;      // Max complexity I'm willing to take
  preferredComplexity?: 'low' | 'medium' | 'high';

  // Competition settings
  maxClaimants?: number;       // Skip if more than N claimants
  maxOpenPRs?: number;         // Skip if more than N open PRs

  // Tech stack
  knownTechnologies?: string[];  // Technologies I know well
  preferredTechnologies?: string[]; // Technologies I prefer
  avoidTechnologies?: string[];    // Technologies to avoid

  // Repo familiarity
  familiarRepos?: string[];    // Repos I've contributed to
  expertRepos?: string[];      // Repos I know deeply
}

export interface BountyInput {
  // Required
  title: string;
  value: number;

  // Source info
  repo?: string;
  issueUrl?: string;
  issueNumber?: number;

  // Metadata from source
  labels?: string[];
  technologies?: string[];
  description?: string;

  // Competition info
  claimants?: number;
  openPRs?: number;
  createdAt?: string;

  // Complexity hints
  estimatedLines?: number;
  estimatedFiles?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  value: 0.25,
  complexity: 0.25,
  competition: 0.25,
  fit: 0.25
};

export const DEFAULT_CONFIG: ScoringConfig = {
  weights: DEFAULT_WEIGHTS,
  minValue: 20,
  maxValue: 5000,
  targetHourlyRate: 75,
  maxComplexity: 80,
  preferredComplexity: 'medium',
  maxClaimants: 3,
  maxOpenPRs: 2,
  knownTechnologies: [],
  preferredTechnologies: [],
  avoidTechnologies: [],
  familiarRepos: [],
  expertRepos: []
};
