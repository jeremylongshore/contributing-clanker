/**
 * Bounty Scoring Algorithm Tests
 */

import { BountyScorer, scoreBounty } from './scorer';
import type { BountyInput, ScoringConfig } from './types';

// Test helper to create bounty input
function createBounty(overrides: Partial<BountyInput> = {}): BountyInput {
  return {
    title: 'Fix login bug',
    value: 100,
    ...overrides
  };
}

describe('BountyScorer', () => {
  describe('basic scoring', () => {
    it('should score a simple bounty', () => {
      const scorer = new BountyScorer();
      const result = scorer.score(createBounty());

      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.grade).toMatch(/^[A-F]$/);
      expect(['claim', 'consider', 'skip']).toContain(result.recommendation);
    });

    it('should give higher scores to higher value bounties', () => {
      const scorer = new BountyScorer();
      const lowValue = scorer.score(createBounty({ value: 25 }));
      const highValue = scorer.score(createBounty({ value: 500 }));

      expect(highValue.value.normalized).toBeGreaterThan(lowValue.value.normalized);
    });

    it('should penalize bounties with competition', () => {
      const scorer = new BountyScorer();
      const noCompetition = scorer.score(createBounty({ claimants: 0, openPRs: 0 }));
      const withCompetition = scorer.score(createBounty({ claimants: 2, openPRs: 1 }));

      expect(noCompetition.competition.score).toBeGreaterThan(withCompetition.competition.score);
    });
  });

  describe('complexity scoring', () => {
    it('should estimate complexity from difficulty label', () => {
      const scorer = new BountyScorer();
      const easy = scorer.score(createBounty({ difficulty: 'easy' }));
      const hard = scorer.score(createBounty({ difficulty: 'hard' }));

      expect(easy.complexity.estimated).toBeLessThan(hard.complexity.estimated);
    });

    it('should detect complexity from labels', () => {
      const scorer = new BountyScorer();
      const simple = scorer.score(createBounty({ labels: ['bug', 'docs'] }));
      const complex = scorer.score(createBounty({ labels: ['breaking-change', 'refactor', 'security'] }));

      expect(complex.complexity.estimated).toBeGreaterThan(simple.complexity.estimated);
    });
  });

  describe('tech fit scoring', () => {
    it('should give higher fit score for known technologies', () => {
      const config: ScoringConfig = {
        knownTechnologies: ['TypeScript', 'React']
      };
      const scorer = new BountyScorer(config);

      const match = scorer.score(createBounty({ technologies: ['TypeScript', 'React'] }));
      const noMatch = scorer.score(createBounty({ technologies: ['Rust', 'WebAssembly'] }));

      expect(match.fit.score).toBeGreaterThan(noMatch.fit.score);
    });

    it('should detect technologies from description', () => {
      const scorer = new BountyScorer();
      const result = scorer.score(createBounty({
        description: 'Fix TypeScript types in the React component'
      }));

      expect(result.fit.matchedTech.length + result.fit.unknownTech.length).toBeGreaterThan(0);
    });
  });

  describe('recommendations', () => {
    it('should recommend skip for bounties with too many claimants', () => {
      const config: ScoringConfig = { maxClaimants: 2 };
      const scorer = new BountyScorer(config);

      const result = scorer.score(createBounty({ claimants: 5 }));
      expect(result.recommendation).toBe('skip');
      expect(result.warnings.some(w => w.includes('claimants'))).toBe(true);
    });

    it('should recommend claim for high-scoring bounties', () => {
      const config: ScoringConfig = {
        knownTechnologies: ['TypeScript']
      };
      const scorer = new BountyScorer(config);

      const result = scorer.score(createBounty({
        value: 200,
        difficulty: 'easy',
        technologies: ['TypeScript'],
        claimants: 0,
        openPRs: 0
      }));

      expect(result.total).toBeGreaterThanOrEqual(65);
      expect(result.recommendation).toBe('claim');
    });
  });

  describe('grades', () => {
    it('should assign correct grades based on score', () => {
      const scorer = new BountyScorer();

      // High score bounty
      const great = scorer.score(createBounty({
        value: 500,
        difficulty: 'easy',
        claimants: 0,
        openPRs: 0
      }));
      expect(['A', 'B']).toContain(great.grade);

      // Low score bounty
      const poor = scorer.score(createBounty({
        value: 10,
        difficulty: 'hard',
        claimants: 5,
        openPRs: 3
      }));
      expect(['D', 'F']).toContain(poor.grade);
    });
  });
});

describe('scoreBounty helper', () => {
  it('should work as a convenience function', () => {
    const result = scoreBounty(createBounty({ value: 150 }));

    expect(result.total).toBeDefined();
    expect(result.grade).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });
});

// Run a quick sanity check if this file is executed directly
if (require.main === module) {
  console.log('Running quick scoring test...\n');

  const scorer = new BountyScorer({
    knownTechnologies: ['TypeScript', 'React', 'Python', 'Node'],
    preferredTechnologies: ['TypeScript'],
    avoidTechnologies: ['PHP'],
    familiarRepos: ['cortexlinux/cortex']
  });

  const testBounties: BountyInput[] = [
    {
      title: 'Fix typo in README',
      value: 25,
      difficulty: 'easy',
      claimants: 0
    },
    {
      title: 'Add OAuth2 authentication',
      value: 500,
      difficulty: 'hard',
      technologies: ['TypeScript', 'React'],
      claimants: 2,
      openPRs: 1
    },
    {
      title: 'Refactor database layer',
      value: 1000,
      description: 'Major refactor of the PostgreSQL integration',
      labels: ['breaking-change', 'refactor'],
      claimants: 0
    }
  ];

  for (const bounty of testBounties) {
    const score = scorer.score(bounty);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Bounty: ${bounty.title}`);
    console.log(`Value: $${bounty.value}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Score: ${score.total}/100 (Grade: ${score.grade})`);
    console.log(`Recommendation: ${score.recommendation.toUpperCase()}`);
    console.log(`\nBreakdown:`);
    console.log(`  Value:       ${score.value.normalized}/100 ($${score.value.raw}, ~$${Math.round(score.value.hourlyRate)}/hr)`);
    console.log(`  Complexity:  ${score.complexity.estimated}/100 (~${score.complexity.linesEstimate} lines)`);
    console.log(`  Competition: ${score.competition.score}/100 (${score.competition.claimants} claimants, ${score.competition.openPRs} PRs)`);
    console.log(`  Tech Fit:    ${score.fit.score}/100`);
    if (score.warnings.length > 0) {
      console.log(`\nWarnings:`);
      score.warnings.forEach(w => console.log(`  - ${w}`));
    }
    if (score.notes.length > 0) {
      console.log(`\nNotes:`);
      score.notes.forEach(n => console.log(`  - ${n}`));
    }
  }
}
