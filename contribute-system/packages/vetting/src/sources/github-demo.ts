/**
 * GitHub Source Demo
 *
 * Run with: GITHUB_TOKEN=ghp_xxx npx ts-node packages/vetting/src/sources/github-demo.ts
 */

import { GitHubSource, toScoringInput } from './index';
import { BountyScorer } from '../scoring';

async function main() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable required');
    console.error('Usage: GITHUB_TOKEN=ghp_xxx npx ts-node packages/vetting/src/sources/github-demo.ts');
    process.exit(1);
  }

  console.log('GitHub Bounty Source Demo\n');
  console.log('='.repeat(70));

  // Create GitHub source client
  const github = new GitHubSource({ token });

  // Check if API is available
  const available = await github.isAvailable();
  console.log(`\nGitHub API: ${available ? '✅ Connected' : '❌ Failed'}\n`);

  if (!available) {
    console.error('Could not connect to GitHub API. Check your token.');
    process.exit(1);
  }

  // Search for bounties in well-known repos
  console.log('Searching for bounty-labeled issues...\n');

  try {
    // Search across a few known bounty repos
    const bounties = await github.search({
      labels: ['bounty'],
      limit: 10,
      sort: 'updated',
      order: 'desc'
    });

    console.log(`Found ${bounties.length} bounties\n`);

    if (bounties.length === 0) {
      // Try with specific repos that have bounties
      console.log('No general bounties found. Trying specific repos...\n');

      const specificBounties = await github.searchRepos([
        'screenpipe/screenpipe',
        'calcom/cal.com'
      ], {
        labels: ['bounty', '💎 Bounty'],
        limit: 5
      });

      if (specificBounties.length > 0) {
        bounties.push(...specificBounties);
        console.log(`Found ${specificBounties.length} bounties in specific repos\n`);
      }
    }

    // Create scorer with preferences
    const scorer = new BountyScorer({
      knownTechnologies: ['TypeScript', 'React', 'Python', 'Node', 'Rust'],
      preferredTechnologies: ['TypeScript', 'Python'],
      maxClaimants: 3,
      maxOpenPRs: 2
    });

    // Score and display each bounty
    for (const raw of bounties.slice(0, 5)) {
      console.log('─'.repeat(70));
      console.log(`📋 ${raw.title}`);
      console.log(`   Repo: ${raw.repo}`);
      console.log(`   URL: ${raw.sourceUrl}`);
      console.log(`   Value: ${raw.value ? `$${raw.value}` : 'Unknown'}`);
      console.log(`   Labels: ${raw.labels?.join(', ') || 'none'}`);
      console.log(`   Claimants: ${raw.claimants || 0}, Open PRs: ${raw.openPRs || 0}`);

      // Convert to scoring input and score
      const input = toScoringInput(raw);
      const score = scorer.score(input);

      const bar = '█'.repeat(Math.round(score.total / 5)) + '░'.repeat(20 - Math.round(score.total / 5));
      console.log(`\n   Score: [${bar}] ${score.total}/100 (${score.grade})`);

      const recEmoji = { claim: '✅', consider: '🤔', skip: '❌' };
      console.log(`   Recommendation: ${recEmoji[score.recommendation]} ${score.recommendation.toUpperCase()}`);

      if (score.warnings.length > 0) {
        console.log(`   ⚠️  ${score.warnings[0]}`);
      }

      console.log('');
    }

    console.log('='.repeat(70));
    console.log('Demo complete!\n');

  } catch (error) {
    console.error('Error searching GitHub:', error);
    process.exit(1);
  }
}

main();
