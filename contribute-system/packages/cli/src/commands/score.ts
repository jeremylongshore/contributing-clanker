/**
 * Contribution Scoring Commands
 *
 * Pre-work evaluation of bounty opportunities.
 * Uses the scoring algorithm to evaluate value, complexity, competition, and fit.
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { getConfig } from '../lib/config';
import {
  BountyScorer,
  GitHubSource,
  toScoringInput,
  type BountyScore,
  type RawBounty,
  type ScoringConfig
} from '@contribute/vetting';

export const scoreCommand = new Command('score')
  .description('Score and discover contribution opportunities');

/**
 * Score a single bounty by URL
 */
scoreCommand
  .command('url <url>')
  .description('Score a contribution from a GitHub issue URL')
  .option('-v, --verbose', 'Show detailed breakdown')
  .action(async (url, options) => {
    const spinner = ora('Analyzing bounty...').start();

    try {
      const config = await getConfig();
      const token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!token) {
        spinner.fail('GitHub token required');
        console.log(chalk.dim('Set with: bounty config set githubToken <token>'));
        console.log(chalk.dim('Or: export GITHUB_TOKEN=<token>'));
        process.exit(1);
      }

      // Parse GitHub URL
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
      if (!match) {
        spinner.fail('Invalid GitHub issue URL');
        console.log(chalk.dim('Expected: https://github.com/owner/repo/issues/123'));
        process.exit(1);
      }

      const [, owner, repo, number] = match;
      const issueId = `${owner}/${repo}#${number}`;

      // Fetch issue
      const github = new GitHubSource({ token });
      const bounty = await github.fetch(issueId);

      if (!bounty) {
        spinner.fail('Issue not found or not accessible');
        process.exit(1);
      }

      spinner.stop();

      // Score it
      const scorer = await createScorer(config);
      const input = toScoringInput(bounty);
      const score = scorer.score(input);

      // Display result
      printScoreResult(bounty, score, options.verbose);

    } catch (error) {
      spinner.fail('Scoring failed');
      console.error(error);
      process.exit(1);
    }
  });

/**
 * Discover and score bounties from GitHub
 */
scoreCommand
  .command('discover')
  .description('Search GitHub for contributions and score them')
  .option('-o, --org <org>', 'Search specific organization')
  .option('-r, --repo <repo>', 'Search specific repo (owner/repo)')
  .option('-l, --label <label>', 'Contribution label to search for', 'bounty')
  .option('-n, --limit <n>', 'Max bounties to fetch', '20')
  .option('--min-score <n>', 'Only show bounties with score >= N')
  .option('--claim', 'Only show bounties recommended for claiming')
  .action(async (options) => {
    const spinner = ora('Searching for bounties...').start();

    try {
      const config = await getConfig();
      const token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!token) {
        spinner.fail('GitHub token required');
        console.log(chalk.dim('Set with: bounty config set githubToken <token>'));
        process.exit(1);
      }

      const github = new GitHubSource({ token });
      const scorer = await createScorer(config);

      // Search for bounties
      const bounties = await github.search({
        org: options.org,
        repo: options.repo,
        labels: [options.label],
        limit: parseInt(options.limit, 10),
        sort: 'updated',
        order: 'desc'
      });

      spinner.stop();

      if (bounties.length === 0) {
        console.log(chalk.yellow('\nNo bounties found.'));
        console.log(chalk.dim('Try different search options or check your token permissions.'));
        return;
      }

      // Score all bounties
      const scored = bounties.map(bounty => ({
        bounty,
        score: scorer.score(toScoringInput(bounty))
      }));

      // Filter if requested
      let filtered = scored;
      if (options.minScore) {
        const minScore = parseInt(options.minScore, 10);
        filtered = filtered.filter(s => s.score.total >= minScore);
      }
      if (options.claim) {
        filtered = filtered.filter(s => s.score.recommendation === 'claim');
      }

      // Sort by score descending
      filtered.sort((a, b) => b.score.total - a.score.total);

      // Display results
      console.log(chalk.bold(`\n📋 Found ${filtered.length} bounties\n`));

      if (filtered.length === 0) {
        console.log(chalk.dim('No bounties match your filters.'));
        return;
      }

      printScoreTable(filtered);

      // Summary
      const claimable = filtered.filter(s => s.score.recommendation === 'claim');
      const consider = filtered.filter(s => s.score.recommendation === 'consider');

      console.log(chalk.bold('\nSummary:'));
      console.log(`  ${chalk.green('✓')} Claim: ${claimable.length}`);
      console.log(`  ${chalk.yellow('?')} Consider: ${consider.length}`);
      console.log(`  ${chalk.red('✗')} Skip: ${filtered.length - claimable.length - consider.length}`);
      console.log('');

    } catch (error) {
      spinner.fail('Discovery failed');
      console.error(error);
      process.exit(1);
    }
  });

/**
 * Show current scoring configuration
 */
scoreCommand
  .command('config')
  .description('Show and edit scoring configuration')
  .option('--show', 'Show current config (default)')
  .option('--add-tech <tech>', 'Add to known technologies')
  .option('--add-preferred <tech>', 'Add to preferred technologies')
  .option('--add-avoid <tech>', 'Add to avoided technologies')
  .option('--add-repo <repo>', 'Add to familiar repos')
  .action(async (options) => {
    const config = await getConfig();

    // Handle additions
    if (options.addTech) {
      const techs = config.scoring?.knownTechnologies || [];
      if (!techs.includes(options.addTech)) {
        techs.push(options.addTech);
        await updateScoringConfig(config, { knownTechnologies: techs });
        console.log(chalk.green(`Added ${options.addTech} to known technologies`));
      }
      return;
    }

    if (options.addPreferred) {
      const techs = config.scoring?.preferredTechnologies || [];
      if (!techs.includes(options.addPreferred)) {
        techs.push(options.addPreferred);
        await updateScoringConfig(config, { preferredTechnologies: techs });
        console.log(chalk.green(`Added ${options.addPreferred} to preferred technologies`));
      }
      return;
    }

    if (options.addAvoid) {
      const techs = config.scoring?.avoidTechnologies || [];
      if (!techs.includes(options.addAvoid)) {
        techs.push(options.addAvoid);
        await updateScoringConfig(config, { avoidTechnologies: techs });
        console.log(chalk.green(`Added ${options.addAvoid} to avoided technologies`));
      }
      return;
    }

    if (options.addRepo) {
      const repos = config.scoring?.familiarRepos || [];
      if (!repos.includes(options.addRepo)) {
        repos.push(options.addRepo);
        await updateScoringConfig(config, { familiarRepos: repos });
        console.log(chalk.green(`Added ${options.addRepo} to familiar repos`));
      }
      return;
    }

    // Show config (default)
    console.log(chalk.bold('\nScoring Configuration\n'));

    const scoring = config.scoring || {};

    console.log(chalk.bold('  Technologies:'));
    console.log(`    Known: ${(scoring.knownTechnologies || []).join(', ') || chalk.dim('none')}`);
    console.log(`    Preferred: ${(scoring.preferredTechnologies || []).join(', ') || chalk.dim('none')}`);
    console.log(`    Avoid: ${(scoring.avoidTechnologies || []).join(', ') || chalk.dim('none')}`);

    console.log(chalk.bold('\n  Repos:'));
    console.log(`    Familiar: ${(scoring.familiarRepos || []).join(', ') || chalk.dim('none')}`);
    console.log(`    Expert: ${(scoring.expertRepos || []).join(', ') || chalk.dim('none')}`);

    console.log(chalk.bold('\n  Thresholds:'));
    console.log(`    Min Value: $${scoring.minValue || 20}`);
    console.log(`    Max Claimants: ${scoring.maxClaimants || 3}`);
    console.log(`    Max Open PRs: ${scoring.maxOpenPRs || 2}`);

    console.log(chalk.dim('\n  Edit with: bounty score config --add-tech TypeScript'));
    console.log('');
  });

// Helper functions

async function createScorer(config: any): Promise<BountyScorer> {
  const scoring = config.scoring || {};

  return new BountyScorer({
    knownTechnologies: scoring.knownTechnologies || [],
    preferredTechnologies: scoring.preferredTechnologies || [],
    avoidTechnologies: scoring.avoidTechnologies || [],
    familiarRepos: scoring.familiarRepos || [],
    expertRepos: scoring.expertRepos || [],
    minValue: scoring.minValue,
    maxClaimants: scoring.maxClaimants,
    maxOpenPRs: scoring.maxOpenPRs
  });
}

async function updateScoringConfig(config: any, updates: Partial<ScoringConfig>) {
  const { setConfig } = await import('../lib/config');
  await setConfig('scoring', {
    ...(config.scoring || {}),
    ...updates
  });
}

function printScoreResult(bounty: RawBounty, score: BountyScore, verbose: boolean) {
  console.log(chalk.bold('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.bold(`  ${bounty.title}`));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════\n'));

  console.log(`  Repo: ${bounty.repo}`);
  console.log(`  URL: ${chalk.cyan(bounty.sourceUrl)}`);
  console.log(`  Value: ${bounty.value ? chalk.green(`$${bounty.value}`) : chalk.dim('unknown')}`);
  console.log(`  Labels: ${bounty.labels?.join(', ') || 'none'}`);

  // Score bar
  const bar = '█'.repeat(Math.round(score.total / 5)) + '░'.repeat(20 - Math.round(score.total / 5));
  const gradeColor = score.grade === 'A' ? chalk.green
    : score.grade === 'B' ? chalk.greenBright
    : score.grade === 'C' ? chalk.yellow
    : score.grade === 'D' ? chalk.red
    : chalk.redBright;

  console.log(`\n  Score: [${bar}] ${score.total}/100 (${gradeColor(score.grade)})`);

  // Recommendation
  const recEmoji = { claim: '✅', consider: '🤔', skip: '❌' };
  const recColor = { claim: chalk.green, consider: chalk.yellow, skip: chalk.red };
  console.log(`  Recommendation: ${recEmoji[score.recommendation]} ${recColor[score.recommendation](score.recommendation.toUpperCase())}`);

  // Breakdown
  console.log(chalk.bold('\n  Breakdown:'));
  console.log(`    💰 Value:       ${padScore(score.value.normalized)}  ($${score.value.raw}, ~$${Math.round(score.value.hourlyRate)}/hr)`);
  console.log(`    🔧 Complexity:  ${padScore(score.complexity.estimated)}  (~${score.complexity.linesEstimate} lines)`);
  console.log(`    👥 Competition: ${padScore(score.competition.score)}  (${score.competition.claimants} claimants, ${score.competition.openPRs} PRs)`);
  console.log(`    🎯 Tech Fit:    ${padScore(score.fit.score)}  (${score.fit.repoFamiliarity} familiarity)`);

  if (verbose) {
    if (score.fit.matchedTech.length > 0) {
      console.log(chalk.dim(`       Known: ${score.fit.matchedTech.join(', ')}`));
    }
    if (score.fit.unknownTech.length > 0) {
      console.log(chalk.dim(`       Unknown: ${score.fit.unknownTech.join(', ')}`));
    }

    if (score.complexity.factors.length > 0) {
      console.log(chalk.dim(`\n    Complexity factors:`));
      for (const f of score.complexity.factors) {
        console.log(chalk.dim(`      • ${f.name}: ${f.reason}`));
      }
    }
  }

  // Warnings
  if (score.warnings.length > 0) {
    console.log(chalk.bold('\n  ⚠️  Warnings:'));
    for (const w of score.warnings) {
      console.log(`    ${chalk.yellow('•')} ${w}`);
    }
  }

  // Notes
  if (score.notes.length > 0) {
    console.log(chalk.bold('\n  📝 Notes:'));
    for (const n of score.notes) {
      console.log(`    • ${n}`);
    }
  }

  console.log(`\n  Confidence: ${score.confidence}%`);
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

function printScoreTable(scored: { bounty: RawBounty; score: BountyScore }[]) {
  // Header
  console.log(chalk.dim('─'.repeat(90)));
  console.log(
    chalk.bold(padRight('Score', 8)) +
    chalk.bold(padRight('Grade', 7)) +
    chalk.bold(padRight('Rec', 10)) +
    chalk.bold(padRight('Value', 8)) +
    chalk.bold('Title')
  );
  console.log(chalk.dim('─'.repeat(90)));

  for (const { bounty, score } of scored) {
    const gradeColor = score.grade === 'A' ? chalk.green
      : score.grade === 'B' ? chalk.greenBright
      : score.grade === 'C' ? chalk.yellow
      : chalk.red;

    const recEmoji = { claim: '✅', consider: '🤔', skip: '❌' };

    const value = bounty.value ? `$${bounty.value}` : '-';
    const title = truncate(bounty.title, 45);

    console.log(
      padRight(`${score.total}/100`, 8) +
      gradeColor(padRight(score.grade, 7)) +
      padRight(recEmoji[score.recommendation], 10) +
      padRight(value, 8) +
      title
    );

    // Show repo on second line
    console.log(chalk.dim(`        ${bounty.repo} • ${bounty.sourceUrl}`));
  }

  console.log(chalk.dim('─'.repeat(90)));
}

function padScore(n: number): string {
  return `${n}/100`.padStart(7);
}

function padRight(s: string, len: number): string {
  return s.padEnd(len);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}
