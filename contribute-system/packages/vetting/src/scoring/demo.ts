/**
 * Contribution Scoring Demo
 *
 * Run with: npx ts-node packages/vetting/src/scoring/demo.ts
 */

import { BountyScorer } from './scorer';
import type { BountyInput } from './types';

console.log('Contribution Scoring Algorithm Demo\n');
console.log('='.repeat(70));

// Configure scorer with my tech preferences
const scorer = new BountyScorer({
  knownTechnologies: ['TypeScript', 'React', 'Python', 'Node', 'Go', 'Rust'],
  preferredTechnologies: ['TypeScript', 'Python'],
  avoidTechnologies: ['PHP', 'Java'],
  familiarRepos: ['cortexlinux/cortex', 'posthog/posthog'],
  expertRepos: [],
  minValue: 25,
  maxClaimants: 3,
  maxOpenPRs: 2
});

const testBounties: BountyInput[] = [
  {
    title: 'Fix typo in README',
    value: 25,
    difficulty: 'easy',
    repo: 'example/docs',
    claimants: 0,
    openPRs: 0,
    labels: ['documentation', 'good-first-issue']
  },
  {
    title: 'Add tarball source build helper',
    value: 126,
    difficulty: 'medium',
    repo: 'cortexlinux/cortex',
    technologies: ['Python'],
    claimants: 0,
    openPRs: 0,
    labels: ['enhancement'],
    description: 'Create a helper command to analyze and build from source tarballs'
  },
  {
    title: 'Implement OAuth2 authentication',
    value: 500,
    difficulty: 'hard',
    technologies: ['TypeScript', 'React'],
    claimants: 2,
    openPRs: 1,
    labels: ['feature', 'security'],
    description: 'Full OAuth2 implementation with Google and GitHub providers'
  },
  {
    title: 'Major database refactor',
    value: 1000,
    description: 'Refactor the PostgreSQL integration layer with breaking changes',
    labels: ['breaking-change', 'refactor', 'architecture'],
    claimants: 0,
    technologies: ['TypeScript', 'PostgreSQL']
  },
  {
    title: 'Port CLI to Rust',
    value: 3000,
    difficulty: 'hard',
    technologies: ['Rust', 'WebAssembly'],
    claimants: 5,
    openPRs: 3,
    labels: ['enhancement', 'performance'],
    description: 'Rewrite the entire CLI in Rust for better performance'
  }
];

for (const bounty of testBounties) {
  const score = scorer.score(bounty);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${bounty.title}`);
  console.log(`   Value: $${bounty.value} | Repo: ${bounty.repo || 'unknown'}`);
  console.log(`${'─'.repeat(70)}`);

  // Score display with visual bar
  const bar = '█'.repeat(Math.round(score.total / 5)) + '░'.repeat(20 - Math.round(score.total / 5));
  console.log(`\n   Score: [${bar}] ${score.total}/100 (Grade: ${score.grade})`);

  // Recommendation with emoji
  const recEmoji = { claim: '✅', consider: '🤔', skip: '❌' };
  console.log(`   Recommendation: ${recEmoji[score.recommendation]} ${score.recommendation.toUpperCase()}`);

  // Component breakdown
  console.log(`\n   Breakdown:`);
  console.log(`     💰 Value:       ${score.value.normalized.toString().padStart(3)}/100  ($${score.value.raw}, ~$${Math.round(score.value.hourlyRate)}/hr, ${score.value.tier})`);
  console.log(`     🔧 Complexity:  ${score.complexity.estimated.toString().padStart(3)}/100  (~${score.complexity.linesEstimate} lines, ${score.complexity.filesEstimate} files)`);
  console.log(`     👥 Competition: ${score.competition.score.toString().padStart(3)}/100  (${score.competition.claimants} claimants, ${score.competition.openPRs} PRs, ${score.competition.activity})`);
  console.log(`     🎯 Tech Fit:    ${score.fit.score.toString().padStart(3)}/100  (${score.fit.repoFamiliarity} familiarity)`);

  if (score.fit.matchedTech.length > 0) {
    console.log(`        Known: ${score.fit.matchedTech.join(', ')}`);
  }
  if (score.fit.unknownTech.length > 0) {
    console.log(`        Unknown: ${score.fit.unknownTech.join(', ')}`);
  }

  // Warnings
  if (score.warnings.length > 0) {
    console.log(`\n   ⚠️  Warnings:`);
    score.warnings.forEach(w => console.log(`      • ${w}`));
  }

  // Notes
  if (score.notes.length > 0) {
    console.log(`\n   📝 Notes:`);
    score.notes.forEach(n => console.log(`      • ${n}`));
  }

  console.log(`\n   Confidence: ${score.confidence}%`);
}

console.log(`\n${'='.repeat(70)}`);
console.log('Demo complete!\n');
