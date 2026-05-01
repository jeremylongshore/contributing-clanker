/**
 * Qualify Command v2 - Eligibility Gate + Rules Gate + CLA Preflight + EV Scoring
 *
 * Complete qualification pipeline:
 * 1. Parse URL, fetch issue + comments
 * 2. Ensure repo rules are loaded and fresh
 * 3. Ensure repo style guide is loaded
 * 4. Run eligibility assessment
 * 5. Check CLA/DCO status
 * 6. Only if eligible: run EV scoring + buy box
 * 7. Post structured Slack summary
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../lib/config';
import { getDb, closeDb } from '../lib/db';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';
import {
  calculateWinProbability,
  calculateEV,
  checkBuyBox,
  defaultTimeEstimate,
  responsivenessFromResponseTime,
  competitionFromPRs,
  ciHealthFromFlakeRate,
  clarityFromSignals,
  assessC0Complexity,
  formatTimeEstimate,
  formatEV,
  formatWinProbability,
  type EVCalculation,
  type BuyBoxResult,
  type WinProbabilityFactors,
  type ComplexityAssessment
} from '../lib/scoring';
import {
  ensureRepoRules,
  checkRulesGate,
  getCLAStatus,
  type RepoRules,
  type RepoProfile
} from '../lib/rules';
import {
  ensureRepoStyle,
  checkStyleGate,
  formatStyleForSlack,
  type StyleGuide
} from '../lib/style';
import {
  assessEligibility,
  formatEligibility,
  formatEligibilityForSlack,
  type EligibilityAssessment,
  type IssueSignals,
  type ContextSignals
} from '../lib/eligibility';

export const qualifyCommand = new Command('qualify')
  .description('Evaluate a bounty with eligibility, rules, CLA, and EV analysis')
  .argument('<url>', 'GitHub issue URL')
  .option('-v, --verbose', 'Show detailed breakdown')
  .option('--no-slack', 'Skip Slack notification')
  .option('--force', 'Qualify even if gates fail')
  .option('--ack-cla', 'Acknowledge CLA requirement and proceed')
  .option('--skip-style', 'Skip style guide check')
  .action(async (url, options) => {
    const spinner = ora('Qualifying bounty...').start();

    try {
      const config = await getConfig();
      const token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!token) {
        spinner.fail('GitHub token required');
        console.log(chalk.dim('Set with: bounty config set githubToken <token>'));
        process.exit(1);
      }

      // Parse GitHub URL
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);
      if (!match) {
        spinner.fail('Invalid GitHub issue URL');
        console.log(chalk.dim('Expected: https://github.com/owner/repo/issues/123'));
        process.exit(1);
      }

      const [, owner, repoName, type, number] = match;
      const repo = `${owner}/${repoName}`;
      const issueNumber = parseInt(number, 10);
      const db = getDb();

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 1: Fetch issue + comments
      // ═══════════════════════════════════════════════════════════════════════
      spinner.text = 'Fetching issue...';
      const issue = await fetchIssue(owner, repoName, issueNumber, token);

      if (!issue) {
        spinner.fail('Issue not found or not accessible');
        process.exit(1);
      }

      // Fetch comments for eligibility analysis
      spinner.text = 'Fetching comments...';
      const comments = await fetchComments(owner, repoName, issueNumber, token);
      const issueSignals = analyzeIssueSignals(issue, comments);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 2: Ensure repo rules are loaded and fresh
      // ═══════════════════════════════════════════════════════════════════════
      spinner.text = 'Loading repo rules...';
      let rulesProfile: RepoProfile | null = null;
      let rules: RepoRules | null = null;

      try {
        const rulesResult = await ensureRepoRules(repo, token, { skipSlack: true });
        rulesProfile = rulesResult.profile;
        rules = rulesResult.rules;
      } catch (error) {
        console.log(chalk.yellow('\nWarning: Could not fetch repo rules'));
        console.log(chalk.dim('Continuing without rules...'));
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3: Ensure repo style guide (optional)
      // ═══════════════════════════════════════════════════════════════════════
      let styleGuide: StyleGuide | null = null;
      let styleSummary: string | null = null;

      if (!options.skipStyle) {
        spinner.text = 'Loading style guide...';
        try {
          const styleResult = await ensureRepoStyle(repo, token, { skipSlack: true });
          styleGuide = styleResult.guide;
          styleSummary = styleResult.profile.styleGuideSummary;
        } catch (error) {
          console.log(chalk.dim('\nNote: Could not fetch style guide'));
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 4: Check CLA/DCO status
      // ═══════════════════════════════════════════════════════════════════════
      spinner.text = 'Checking CLA/DCO...';
      const claStatus = await getCLAStatus(repo);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 5: Run eligibility assessment
      // ═══════════════════════════════════════════════════════════════════════
      spinner.text = 'Assessing eligibility...';

      const contextSignals: ContextSignals = {
        rules,
        claRequired: claStatus.claRequired,
        claCompleted: claStatus.claCompleted || options.ackCla,
        ttfgAvailable: false, // Will check later
        vmRequired: false,
        vmApproved: true
      };

      const eligibility = assessEligibility(issueSignals, contextSignals);

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 6: Check gates and decide how to proceed
      // ═══════════════════════════════════════════════════════════════════════

      // If not eligible and not forcing, stop here
      if (eligibility.eligibility !== 'workable' && !options.force) {
        spinner.stop();
        printEligibilityFailure(repo, issueNumber, issue.title, eligibility, claStatus, rules);

        // Post Slack notification about ineligibility
        if (options.slack !== false) {
          await sendSlackNotification({
            type: 'bounty_qualified',
            content: buildSlackIneligibleSummary(url, repo, issue.title, eligibility, claStatus)
          } as SlackMessage);
        }

        // Store in DB anyway for tracking
        await storeQualifyResult(db, repo, issueNumber, url, issue.title, eligibility, null, null, null);

        process.exit(1);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 7: Run EV scoring (only if eligible)
      // ═══════════════════════════════════════════════════════════════════════
      spinner.text = 'Calculating EV...';

      // Check for bounty value
      const bountyAmount = extractBountyAmount(issue);
      const isPaid = bountyAmount !== null && bountyAmount > 0;

      // Get maintainer score
      const maintainerResult = await db.execute({
        sql: `SELECT m.github_login, ms.overall_score
              FROM maintainers m
              JOIN maintainer_scores ms ON m.id = ms.maintainer_id
              WHERE ms.repo = ?
              ORDER BY ms.overall_score DESC
              LIMIT 1`,
        args: [repo]
      });
      const maintainerScore = maintainerResult.rows.length > 0
        ? (maintainerResult.rows[0] as unknown as { overall_score: number }).overall_score
        : null;

      // Get repo metrics
      const metricsResult = await db.execute({
        sql: 'SELECT * FROM repo_metrics WHERE repo = ?',
        args: [repo]
      });
      const repoMetrics = metricsResult.rows.length > 0
        ? metricsResult.rows[0] as unknown as {
            ttfg_p50_minutes: number | null;
            ci_flake_rate: number | null;
            median_merge_minutes: number | null;
          }
        : null;

      // Fetch competition
      spinner.text = 'Checking competition...';
      const { openPRs, claimants } = await fetchCompetition(owner, repoName, issueNumber, token);

      // Calculate win probability factors
      const winProbFactors: Partial<WinProbabilityFactors> = {
        responsiveness: responsivenessFromResponseTime(repoMetrics?.median_merge_minutes ?? null),
        competition: competitionFromPRs(openPRs, claimants),
        ciHealth: ciHealthFromFlakeRate(repoMetrics?.ci_flake_rate ?? null),
        clarity: clarityFromSignals(
          issueSignals.body.toLowerCase().includes('reproduce'),
          issueSignals.body.toLowerCase().includes('acceptance'),
          issueSignals.labels.some(l => l.toLowerCase().includes('rfc')),
          issueSignals.body.toLowerCase().includes('decision needed')
        ),
        maintainerScore: maintainerScore ? maintainerScore / 100 : 0.5
      };

      const winProbBreakdown = calculateWinProbability(winProbFactors);

      // Time estimate (default until C2)
      const timeEstimate = defaultTimeEstimate();

      // Calculate EV
      const hourlyTarget = config.scoring?.hourlyTarget || 100;
      const evCalc = calculateEV(
        bountyAmount || 0,
        'USD',
        winProbBreakdown,
        timeEstimate,
        hourlyTarget
      );

      // Check Buy Box
      const buyBoxResult = checkBuyBox(
        evCalc,
        repoMetrics?.ttfg_p50_minutes ?? null,
        maintainerScore,
        openPRs
      );

      // Complexity assessment (C0 stage)
      const complexity = assessC0Complexity(
        issue.title,
        issue.body || '',
        issue.labels.map((l: { name: string }) => l.name)
      );

      spinner.stop();

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 8: Print results
      // ═══════════════════════════════════════════════════════════════════════
      printQualifyResults({
        url,
        repo,
        issueNumber,
        title: issue.title,
        isPaid,
        bountyAmount,
        eligibility,
        evCalc,
        buyBoxResult,
        complexity,
        maintainerScore,
        openPRs,
        claimants,
        ttfgMinutes: repoMetrics?.ttfg_p50_minutes ?? null,
        rules,
        rulesProfile,
        claStatus,
        styleSummary,
        verbose: options.verbose
      });

      // Check CLA warning
      if (claStatus.claRequired && !claStatus.claCompleted && !options.ackCla) {
        console.log(chalk.yellow('\n⚠️  CLA REQUIRED but not completed'));
        console.log(chalk.dim(`   Complete CLA first: ${claStatus.claUrl || 'check repo CONTRIBUTING.md'}`));
        console.log(chalk.dim(`   Then run: bounty cla complete ${repo}`));
        console.log(chalk.dim(`   Or use --ack-cla to proceed anyway`));
      }

      // Check buy box failure
      if (!buyBoxResult.passed && !options.force) {
        console.log(chalk.red('\nBuy Box: FAIL'));
        for (const reason of buyBoxResult.reasons) {
          console.log(chalk.red(`  - ${reason}`));
        }
        console.log(chalk.dim('\nUse --force to qualify anyway'));
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 9: Store engagement
      // ═══════════════════════════════════════════════════════════════════════
      const engagementId = `eng-${repo.replace('/', '-')}-${issueNumber}`;
      const now = new Date().toISOString();

      // Ensure repo exists in repos table (FK constraint)
      await db.execute({
        sql: `INSERT OR IGNORE INTO repos (repo, last_seen_at, created_at, updated_at)
              VALUES (?, ?, ?, ?)`,
        args: [repo, now, now, now]
      });

      await db.execute({
        sql: `INSERT OR REPLACE INTO engagements
              (id, kind, source, repo, issue_url, title, status, created_at, updated_at)
              VALUES (?, ?, 'github', ?, ?, ?, 'qualified', ?, ?)`,
        args: [
          engagementId,
          isPaid ? 'paid_bounty' : 'reputation_pr',
          repo,
          url,
          issue.title,
          now,
          now
        ]
      });

      // Store metrics with eligibility and gate status
      await db.execute({
        sql: `INSERT OR REPLACE INTO engagement_metrics
              (engagement_id, payout_amount, payout_currency, hourly_target,
               est_minutes_lo, est_minutes_best, est_minutes_hi,
               win_probability, winprob_breakdown_json, ev_amount,
               buybox_result, buybox_reasons_json,
               complexity_stage, complexity_confidence, complexity_score, complexity_drivers_json,
               eligibility, eligibility_confidence, eligibility_reasons_json, eligibility_prework_json,
               cla_ack, rules_gate_passed, style_gate_passed,
               computed_at)
              VALUES (?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          engagementId,
          bountyAmount || 0,
          hourlyTarget,
          timeEstimate.lo,
          timeEstimate.best,
          timeEstimate.hi,
          evCalc.winProbability,
          JSON.stringify(evCalc.winProbBreakdown),
          evCalc.ev,
          buyBoxResult.passed ? 'pass' : 'fail',
          JSON.stringify(buyBoxResult.reasons),
          complexity.stage,
          complexity.confidence,
          complexity.score,
          JSON.stringify(complexity.drivers),
          eligibility.eligibility,
          eligibility.confidence,
          JSON.stringify(eligibility.reasons),
          JSON.stringify(eligibility.requiredPrework),
          options.ackCla || claStatus.claCompleted ? 1 : 0,
          rulesProfile?.rulesJson ? 1 : 0,
          styleGuide ? 1 : 0,
          now
        ]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'qualified', ?, ?)`,
        args: [engagementId, now, JSON.stringify({
          eligibility: eligibility.eligibility,
          ev: evCalc.ev,
          winProb: evCalc.winProbability,
          buyBoxPassed: buyBoxResult.passed,
          claRequired: claStatus.claRequired,
          claCompleted: claStatus.claCompleted
        })]
      });

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 10: Send Slack notification
      // ═══════════════════════════════════════════════════════════════════════
      if (options.slack !== false) {
        const slackContent = buildSlackQualifySummary({
          url,
          repo,
          title: issue.title,
          isPaid,
          bountyAmount,
          eligibility,
          evCalc,
          buyBoxResult,
          complexity,
          rules,
          claStatus,
          styleSummary
        });

        await sendSlackNotification({
          type: 'bounty_qualified',
          content: slackContent
        } as SlackMessage);

        console.log(chalk.dim('\nSlack notification sent'));
      }

      // Next steps
      console.log(chalk.bold('\nNext steps:'));
      if (claStatus.claRequired && !claStatus.claCompleted && !options.ackCla) {
        console.log(chalk.cyan(`  1. bounty cla complete ${repo}`));
        console.log(chalk.cyan(`  2. bounty bootstrap ${repo}`));
        console.log(chalk.cyan(`  3. bounty plan ${engagementId}`));
      } else if (!repoMetrics) {
        console.log(chalk.cyan(`  1. bounty bootstrap ${repo}`));
        console.log(chalk.cyan(`  2. bounty plan ${engagementId}`));
      } else {
        console.log(chalk.cyan(`  bounty plan ${engagementId}`));
      }
      console.log('');

    } catch (error) {
      spinner.fail('Qualification failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// GitHub API Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchIssue(owner: string, repo: string, number: number, token: string): Promise<any> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'bounty-system-cli/0.2.0'
    }
  });

  if (!response.ok) return null;
  return response.json();
}

async function fetchComments(owner: string, repo: string, issueNumber: number, token: string): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=50`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'bounty-system-cli/0.2.0'
        }
      }
    );

    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

function analyzeIssueSignals(issue: any, comments: any[]): IssueSignals {
  const maintainerAssociations = ['MEMBER', 'OWNER', 'COLLABORATOR'];
  const maintainerComments = comments.filter(c =>
    maintainerAssociations.includes(c.author_association)
  );

  // Check if maintainer wants a PR
  const prPatterns = [
    /pr\s+welcome/i,
    /would\s+accept\s+a?\s*pr/i,
    /happy\s+to\s+review/i,
    /feel\s+free\s+to\s+submit/i,
    /contributions?\s+welcome/i,
    /looking\s+for\s+someone/i,
  ];

  const maintainerWantsPR = maintainerComments.some(c =>
    prPatterns.some(p => p.test(c.body))
  );

  // Check if maintainer is asking for direction
  const directionPatterns = [
    /what\s+do\s+you\s+think/i,
    /thoughts\?/i,
    /should\s+we/i,
    /which\s+approach/i,
    /not\s+sure\s+(how|what|if)/i,
    /needs?\s+more\s+discussion/i,
  ];

  const maintainerAsksForDirection = maintainerComments.some(c =>
    directionPatterns.some(p => p.test(c.body))
  );

  // Count claimants
  const claimPatterns = [/i('ll| will) (work|take|claim)/i, /working on this/i, /claiming/i];
  const claimants = comments.filter(c =>
    claimPatterns.some(p => p.test(c.body))
  ).length;

  return {
    title: issue.title,
    body: issue.body || '',
    labels: (issue.labels || []).map((l: { name: string }) => l.name),
    commentCount: comments.length,
    hasMaintainerResponse: maintainerComments.length > 0,
    maintainerWantsPR,
    maintainerAsksForDirection,
    openPRs: 0, // Will be filled by fetchCompetition
    claimants
  };
}

async function fetchCompetition(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string
): Promise<{ openPRs: number; claimants: number }> {
  let openPRs = 0;

  try {
    // Search for PRs referencing this issue
    const searchResponse = await fetch(
      `https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:pr+is:open+${issueNumber}+in:body`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'bounty-system-cli/0.2.0'
        }
      }
    );

    if (searchResponse.ok) {
      const data = await searchResponse.json();
      openPRs = data.total_count;
    }
  } catch {
    // Ignore errors
  }

  return { openPRs, claimants: 0 };
}

function extractBountyAmount(issue: any): number | null {
  const amountPattern = /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/;
  for (const label of issue.labels || []) {
    const match = label.name.match(amountPattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }

  if (issue.body) {
    const match = issue.body.match(amountPattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }

  return null;
}

async function storeQualifyResult(
  db: any,
  repo: string,
  issueNumber: number,
  url: string,
  title: string,
  eligibility: EligibilityAssessment,
  evCalc: EVCalculation | null,
  buyBoxResult: BuyBoxResult | null,
  complexity: ComplexityAssessment | null
): Promise<void> {
  const engagementId = `eng-${repo.replace('/', '-')}-${issueNumber}`;
  const now = new Date().toISOString();

  // Ensure repo exists in repos table (FK constraint)
  await db.execute({
    sql: `INSERT OR IGNORE INTO repos (repo, last_seen_at, created_at, updated_at)
          VALUES (?, ?, ?, ?)`,
    args: [repo, now, now, now]
  });

  await db.execute({
    sql: `INSERT OR REPLACE INTO engagements
          (id, kind, source, repo, issue_url, title, status, created_at, updated_at)
          VALUES (?, 'unknown', 'github', ?, ?, ?, 'ineligible', ?, ?)`,
    args: [engagementId, repo, url, title, now, now]
  });

  await db.execute({
    sql: `INSERT OR REPLACE INTO engagement_metrics
          (engagement_id, eligibility, eligibility_confidence, eligibility_reasons_json, eligibility_prework_json, computed_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      engagementId,
      eligibility.eligibility,
      eligibility.confidence,
      JSON.stringify(eligibility.reasons),
      JSON.stringify(eligibility.requiredPrework),
      now
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Formatting
// ─────────────────────────────────────────────────────────────────────────────

function printEligibilityFailure(
  repo: string,
  issueNumber: number,
  title: string,
  eligibility: EligibilityAssessment,
  claStatus: { claRequired: boolean; claCompleted: boolean; claUrl: string | null },
  rules: RepoRules | null
): void {
  console.log(chalk.bold('\nQUALIFY RESULT'));
  console.log(chalk.dim('═'.repeat(60)));

  console.log(`\n${chalk.bold('Issue:')} ${repo}#${issueNumber}`);
  console.log(`${chalk.bold('Title:')} ${truncate(title, 55)}`);

  console.log(chalk.bold('\nELIGIBILITY'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  ${formatEligibility(eligibility)}`);

  console.log(chalk.bold('\nReasons:'));
  for (const reason of eligibility.reasons) {
    console.log(chalk.yellow(`  - ${reason}`));
  }

  if (eligibility.requiredPrework.length > 0) {
    console.log(chalk.bold('\nRequired prework:'));
    for (const prework of eligibility.requiredPrework) {
      console.log(chalk.cyan(`  → ${prework}`));
    }
  }

  // CLA Status
  if (claStatus.claRequired) {
    console.log(chalk.bold('\nCLA STATUS'));
    console.log(chalk.dim('─'.repeat(40)));
    if (claStatus.claCompleted) {
      console.log(chalk.green('  ✓ CLA completed'));
    } else {
      console.log(chalk.red('  ✗ CLA required but not completed'));
      if (claStatus.claUrl) {
        console.log(chalk.dim(`  URL: ${claStatus.claUrl}`));
      }
    }
  }

  console.log('\n' + chalk.dim('═'.repeat(60)));
  console.log(chalk.dim('\nThis issue is not currently workable.'));
  console.log(chalk.dim('Use --force to qualify anyway.\n'));
}

function printQualifyResults(data: {
  url: string;
  repo: string;
  issueNumber: number;
  title: string;
  isPaid: boolean;
  bountyAmount: number | null;
  eligibility: EligibilityAssessment;
  evCalc: EVCalculation;
  buyBoxResult: BuyBoxResult;
  complexity: ComplexityAssessment;
  maintainerScore: number | null;
  openPRs: number;
  claimants: number;
  ttfgMinutes: number | null;
  rules: RepoRules | null;
  rulesProfile: RepoProfile | null;
  claStatus: { claRequired: boolean; claCompleted: boolean; claUrl: string | null };
  styleSummary: string | null;
  verbose: boolean;
}): void {
  console.log(chalk.bold('\nQUALIFY SUMMARY'));
  console.log(chalk.dim('═'.repeat(60)));

  // Issue info
  console.log(`\n${chalk.bold('Issue:')} ${data.repo}#${data.issueNumber}`);
  console.log(`${chalk.bold('Title:')} ${truncate(data.title, 55)}`);
  console.log(`${chalk.bold('Type:')} ${data.isPaid ? chalk.green('Paid Bounty') : chalk.cyan('Reputation PR')}`);
  if (data.bountyAmount) {
    console.log(`${chalk.bold('Value:')} ${chalk.green(`$${data.bountyAmount}`)}`);
  }

  // Eligibility Section
  console.log(chalk.bold('\nELIGIBILITY'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  ${formatEligibility(data.eligibility)}`);
  if (data.verbose) {
    for (const reason of data.eligibility.reasons.slice(0, 3)) {
      console.log(chalk.dim(`  - ${reason}`));
    }
  }

  // CLA/DCO Section
  console.log(chalk.bold('\nCLA/DCO STATUS'));
  console.log(chalk.dim('─'.repeat(40)));
  if (data.claStatus.claRequired) {
    if (data.claStatus.claCompleted) {
      console.log(chalk.green('  ✓ CLA completed'));
    } else {
      console.log(chalk.yellow('  ⚠ CLA required - not completed'));
      if (data.claStatus.claUrl) {
        console.log(chalk.dim(`  URL: ${data.claStatus.claUrl}`));
      }
    }
  } else {
    console.log(chalk.green('  ✓ No CLA required'));
  }

  // EV Section
  console.log(chalk.bold('\nEV ANALYSIS'));
  console.log(chalk.dim('─'.repeat(40)));

  const evColor = data.evCalc.ev >= 0 ? chalk.green : chalk.red;
  console.log(`  EV: ${evColor(formatEV(data.evCalc.ev))}`);
  console.log(`  Win Probability: ${formatWinProbability(data.evCalc.winProbability)}`);
  console.log(`  Time Budget: ${formatTimeEstimate(data.evCalc.timeEstimate)}`);
  console.log(`  Opportunity Cost: $${data.evCalc.opportunityCost.toFixed(2)}/hr target`);

  // Win Probability Breakdown
  if (data.verbose) {
    console.log(chalk.bold('\nWIN PROBABILITY BREAKDOWN'));
    console.log(chalk.dim('─'.repeat(40)));
    const factors = data.evCalc.winProbBreakdown.factors;
    const weights = data.evCalc.winProbBreakdown.weights;
    console.log(`  Responsiveness: ${(factors.responsiveness * 100).toFixed(0)}% (weight: ${weights.responsiveness * 100}%)`);
    console.log(`  Competition: ${(factors.competition * 100).toFixed(0)}% (weight: ${weights.competition * 100}%)`);
    console.log(`  CI Health: ${(factors.ciHealth * 100).toFixed(0)}% (weight: ${weights.ciHealth * 100}%)`);
    console.log(`  Clarity: ${(factors.clarity * 100).toFixed(0)}% (weight: ${weights.clarity * 100}%)`);
    console.log(`  Maintainer: ${(factors.maintainerScore * 100).toFixed(0)}% (weight: ${weights.maintainerScore * 100}%)`);
  }

  // Buy Box
  console.log(chalk.bold('\nBUY BOX'));
  console.log(chalk.dim('─'.repeat(40)));
  const buyBoxStatus = data.buyBoxResult.passed
    ? chalk.green('PASS')
    : chalk.red('FAIL');
  console.log(`  Status: ${buyBoxStatus}`);

  for (const reason of data.buyBoxResult.reasons) {
    const icon = data.buyBoxResult.passed ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon} ${reason}`);
  }

  for (const warning of data.buyBoxResult.warnings) {
    console.log(`  ${chalk.yellow('!')} ${warning}`);
  }

  // Competition
  console.log(chalk.bold('\nCOMPETITION'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  Open PRs: ${data.openPRs}`);
  console.log(`  Claimants: ${data.claimants}`);

  // Repo Intel
  console.log(chalk.bold('\nREPO INTEL'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  Maintainer Score: ${data.maintainerScore ? `${data.maintainerScore}/100` : 'unknown'}`);
  console.log(`  TTFTG (p50): ${data.ttfgMinutes ? `${data.ttfgMinutes} min` : 'unknown'}`);

  // Complexity
  console.log(chalk.bold('\nCOMPLEXITY'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  Stage: ${data.complexity.stage}`);
  console.log(`  Confidence: ${(data.complexity.confidence * 100).toFixed(0)}%`);
  console.log(`  Score: ${data.complexity.score}/100`);

  if (data.verbose && Object.keys(data.complexity.drivers).length > 0) {
    console.log(`  Drivers:`);
    for (const [driver, value] of Object.entries(data.complexity.drivers)) {
      console.log(`    ${driver}: +${value}`);
    }
  }

  // Repo Rules
  if (data.rules) {
    console.log(chalk.bold('\nREPO RULES'));
    console.log(chalk.dim('─'.repeat(40)));
    if (data.rules.tests.required) {
      console.log(`  Tests: ${data.rules.tests.framework || 'Required'}${data.rules.tests.command ? ` (${data.rules.tests.command})` : ''}`);
    }
    if (data.rules.lint.required) {
      console.log(`  Lint: Required${data.rules.lint.command ? ` (${data.rules.lint.command})` : ''}`);
    }
    if (data.rules.commits.conventional) {
      console.log(`  Commits: Conventional (${data.rules.commits.format || 'type: description'})`);
    }
    if (data.rules.review.required) {
      console.log(`  Review: Required${data.rules.review.minApprovals ? ` (${data.rules.review.minApprovals} approvals)` : ''}`);
    }
  }

  // Style Summary
  if (data.styleSummary) {
    console.log(chalk.bold('\nSTYLE GUIDE'));
    console.log(chalk.dim('─'.repeat(40)));
    for (const line of data.styleSummary.split('\n').slice(0, 4)) {
      console.log(`  ${line}`);
    }
  }

  console.log('\n' + chalk.dim('═'.repeat(60)));
}

function buildSlackIneligibleSummary(
  url: string,
  repo: string,
  title: string,
  eligibility: EligibilityAssessment,
  claStatus: { claRequired: boolean; claCompleted: boolean; claUrl: string | null }
): string {
  const lines: string[] = [];

  lines.push('*QUALIFY RESULT: NOT WORKABLE*');
  lines.push('');
  lines.push(`*Issue:* ${repo} - ${truncate(title, 40)}`);
  lines.push('');
  lines.push(formatEligibilityForSlack(eligibility));

  if (claStatus.claRequired && !claStatus.claCompleted) {
    lines.push('');
    lines.push('*CLA STATUS:* :warning: Required but not completed');
    if (claStatus.claUrl) {
      lines.push(`  URL: ${claStatus.claUrl}`);
    }
  }

  lines.push('');
  lines.push(`<${url}|View issue>`);

  return lines.join('\n');
}

function buildSlackQualifySummary(data: {
  url: string;
  repo: string;
  title: string;
  isPaid: boolean;
  bountyAmount: number | null;
  eligibility: EligibilityAssessment;
  evCalc: EVCalculation;
  buyBoxResult: BuyBoxResult;
  complexity: ComplexityAssessment;
  rules: RepoRules | null;
  claStatus: { claRequired: boolean; claCompleted: boolean; claUrl: string | null };
  styleSummary: string | null;
}): string {
  const lines: string[] = [];

  lines.push('*QUALIFY SUMMARY*');
  lines.push('');
  lines.push(`*Issue:* ${data.repo} - ${truncate(data.title, 40)}`);
  lines.push(`*Value:* ${data.bountyAmount ? `$${data.bountyAmount}` : 'Reputation PR'}`);
  lines.push(`*EV:* ${formatEV(data.evCalc.ev)}`);
  lines.push('');

  // Eligibility
  lines.push(formatEligibilityForSlack(data.eligibility));
  lines.push('');

  // CLA/DCO
  if (data.claStatus.claRequired) {
    const claEmoji = data.claStatus.claCompleted ? ':white_check_mark:' : ':warning:';
    const claStatus = data.claStatus.claCompleted ? 'Completed' : 'NEEDED';
    lines.push(`*CLA:* ${claEmoji} ${claStatus}`);
    if (!data.claStatus.claCompleted && data.claStatus.claUrl) {
      lines.push(`  ${data.claStatus.claUrl}`);
    }
  }

  // Buy Box
  const buyBoxEmoji = data.buyBoxResult.passed ? ':white_check_mark:' : ':x:';
  lines.push(`*BUY BOX:* ${buyBoxEmoji} ${data.buyBoxResult.passed ? 'PASS' : 'FAIL'}`);
  for (const reason of data.buyBoxResult.reasons.slice(0, 3)) {
    lines.push(`  - ${reason}`);
  }

  lines.push('');
  lines.push(`*WIN PROBABILITY:* ${formatWinProbability(data.evCalc.winProbability)}`);
  lines.push(`*TIME BUDGET:* ${formatTimeEstimate(data.evCalc.timeEstimate)}`);
  lines.push(`*COMPLEXITY:* ${data.complexity.stage} (${data.complexity.score}/100)`);

  // Rules Card
  if (data.rules) {
    lines.push('');
    lines.push('*REPO RULES:*');
    if (data.rules.cla.required) {
      lines.push(`  CLA: ${data.rules.cla.type?.toUpperCase() || 'Required'}`);
    }
    if (data.rules.tests.required) {
      lines.push(`  Tests: ${data.rules.tests.framework || 'Required'}`);
    }
    if (data.rules.commits.conventional) {
      lines.push('  Commits: Conventional');
    }
  }

  // Style Card
  if (data.styleSummary) {
    lines.push('');
    lines.push('*STYLE CARD:*');
    for (const line of data.styleSummary.split('\n').slice(0, 2)) {
      lines.push(`  ${line}`);
    }
  }

  lines.push('');
  lines.push(`<${data.url}|View issue>`);
  lines.push('');

  // Next commands
  if (data.claStatus.claRequired && !data.claStatus.claCompleted) {
    lines.push('*Next:* `bounty cla complete` → `bounty bootstrap` → `bounty plan`');
  } else {
    lines.push('Reply "plan" to proceed or "skip" to pass');
  }

  return lines.join('\n');
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}
