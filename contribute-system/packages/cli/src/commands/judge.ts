/**
 * Judge Command - Gate evaluation for PR submissions
 *
 * Checks all gates before allowing GitHub posting:
 * - Rules compliance (rules_json fresh + acknowledged)
 * - Style compliance (style_guide_json fresh)
 * - Tone lint (no AI-ish patterns)
 * - Evidence bundle exists
 * - Tests passed
 *
 * Returns PASS/FAIL with required fixes.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';
import { lintAgainstStyle, type StyleGuide } from '../lib/style';

export const judgeCommand = new Command('judge')
  .description('Run gate evaluation for PR submissions');

interface JudgeCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  fix?: string;
}

interface JudgeResult {
  passed: boolean;
  checks: JudgeCheck[];
  requiredFixes: string[];
}

/**
 * Run judge evaluation
 */
judgeCommand
  .command('run <engagement_id>')
  .description('Evaluate all gates for an engagement')
  .option('--force', 'Skip gate failures')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (engagementId, options) => {
    const spinner = ora(`Evaluating gates for ${engagementId}...`).start();

    try {
      const db = getDb();
      const config = await getConfig();

      // Get engagement
      const engResult = await db.execute({
        sql: 'SELECT * FROM engagements WHERE id = ?',
        args: [engagementId]
      });

      if (engResult.rows.length === 0) {
        spinner.fail(`Engagement not found: ${engagementId}`);
        process.exit(1);
      }

      const engagement = engResult.rows[0] as any;
      const repo = engagement.repo;

      // Get engagement metrics
      const metricsResult = await db.execute({
        sql: 'SELECT * FROM engagement_metrics WHERE engagement_id = ?',
        args: [engagementId]
      });
      const metrics = metricsResult.rows[0] as any;

      // Get repo profile
      const profileResult = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });
      const profile = profileResult.rows[0] as any;

      // Get evidence bundle
      const evidenceResult = await db.execute({
        sql: 'SELECT * FROM evidence_bundles WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [engagementId]
      });
      const evidence = evidenceResult.rows[0] as any;

      // Get last test run
      const testResult = await db.execute({
        sql: 'SELECT * FROM test_runs WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [engagementId]
      });
      const lastTest = testResult.rows[0] as any;

      spinner.text = 'Running checks...';

      // Run all checks
      const checks: JudgeCheck[] = [];
      const requiredFixes: string[] = [];

      // 1. Rules Gate
      const rulesCheck = checkRulesGate(profile, metrics);
      checks.push(rulesCheck);
      if (rulesCheck.status === 'fail' && rulesCheck.fix) {
        requiredFixes.push(rulesCheck.fix);
      }

      // 2. Style Gate
      const styleCheck = checkStyleGate(profile, metrics);
      checks.push(styleCheck);
      if (styleCheck.status === 'fail' && styleCheck.fix) {
        requiredFixes.push(styleCheck.fix);
      }

      // 3. Tone Lint Gate
      const toneCheck = await checkToneLint(engagement, profile, db);
      checks.push(toneCheck);
      if (toneCheck.status === 'fail' && toneCheck.fix) {
        requiredFixes.push(toneCheck.fix);
      }

      // 4. Evidence Bundle Gate
      const evidenceCheck = checkEvidenceGate(evidence);
      checks.push(evidenceCheck);
      if (evidenceCheck.status === 'fail' && evidenceCheck.fix) {
        requiredFixes.push(evidenceCheck.fix);
      }

      // 5. Tests Gate
      const testsCheck = checkTestsGate(lastTest);
      checks.push(testsCheck);
      if (testsCheck.status === 'fail' && testsCheck.fix) {
        requiredFixes.push(testsCheck.fix);
      }

      // 6. Eligibility Gate
      const eligibilityCheck = checkEligibilityGate(metrics);
      checks.push(eligibilityCheck);
      if (eligibilityCheck.status === 'fail' && eligibilityCheck.fix) {
        requiredFixes.push(eligibilityCheck.fix);
      }

      // 7. CLA Gate
      const claCheck = await checkCLAGate(repo, db);
      checks.push(claCheck);
      if (claCheck.status === 'fail' && claCheck.fix) {
        requiredFixes.push(claCheck.fix);
      }

      // Determine overall result
      const failedChecks = checks.filter(c => c.status === 'fail');
      const passed = failedChecks.length === 0 || options.force;

      // Store in DB
      const now = new Date().toISOString();
      const status = passed ? 'pass' : 'fail';

      await db.execute({
        sql: `INSERT INTO judge_runs
              (engagement_id, status, checks_json, required_fixes_json, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [engagementId, status, JSON.stringify(checks), JSON.stringify(requiredFixes), now]
      });

      // Get the judge run ID
      const runIdResult = await db.execute({
        sql: 'SELECT id FROM judge_runs WHERE engagement_id = ? ORDER BY id DESC LIMIT 1',
        args: [engagementId]
      });
      const runId = (runIdResult.rows[0] as any)?.id;

      // Update engagement_metrics
      await db.execute({
        sql: `UPDATE engagement_metrics
              SET last_judge_run_id = ?, all_gates_passed = ?
              WHERE engagement_id = ?`,
        args: [runId, passed ? 1 : 0, engagementId]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'judge_run', ?, ?)`,
        args: [engagementId, now, JSON.stringify({ status, requiredFixes })]
      });

      if (passed) {
        spinner.succeed('All gates passed');
      } else {
        spinner.fail(`${failedChecks.length} gate(s) failed`);
      }

      // Display results
      console.log(chalk.bold(`\nJudge Evaluation: ${engagementId}\n`));
      console.log(chalk.dim('═'.repeat(60)));

      for (const check of checks) {
        const icon = check.status === 'pass' ? chalk.green('✓') :
                     check.status === 'fail' ? chalk.red('✗') :
                     check.status === 'warn' ? chalk.yellow('⚠') :
                     chalk.dim('○');
        console.log(`${icon} ${check.name}: ${check.message}`);
      }

      console.log(chalk.dim('═'.repeat(60)));

      if (!passed && !options.force) {
        console.log(chalk.bold('\nRequired Fixes:'));
        for (const fix of requiredFixes) {
          console.log(chalk.yellow(`  • ${fix}`));
        }
        console.log('');
        console.log(chalk.dim('Fix issues above, or use --force to skip'));
      } else if (passed) {
        console.log(chalk.green('\n✓ Ready for submission'));
        console.log(chalk.dim('\nNext: bounty submit ' + engagementId));
      }

      // Slack notification
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: formatJudgeForSlack(engagementId, status, checks, requiredFixes)
        } as SlackMessage);
      }

      console.log('');

      if (!passed && !options.force) {
        process.exit(1);
      }

    } catch (error) {
      spinner.fail('Failed to run judge evaluation');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show judge history
 */
judgeCommand
  .command('history <engagement_id>')
  .description('Show judge run history for an engagement')
  .action(async (engagementId) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM judge_runs WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 10',
        args: [engagementId]
      });

      if (result.rows.length === 0) {
        console.log(chalk.dim(`\nNo judge runs for ${engagementId}`));
        console.log(chalk.dim('Run: bounty judge run ' + engagementId));
        return;
      }

      console.log(chalk.bold(`\nJudge History: ${engagementId}\n`));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(
        padRight('ID', 8) +
        padRight('Status', 10) +
        padRight('Fixes', 8) +
        'Timestamp'
      );
      console.log(chalk.dim('─'.repeat(60)));

      for (const row of result.rows) {
        const run = row as any;
        const fixes = JSON.parse(run.required_fixes_json || '[]');
        const statusColor = run.status === 'pass' ? chalk.green : chalk.red;
        console.log(
          padRight(String(run.id), 8) +
          padRight(statusColor(run.status.toUpperCase()), 10) +
          padRight(String(fixes.length), 8) +
          run.created_at
        );
      }

      console.log(chalk.dim('─'.repeat(60)));
      console.log(chalk.dim(`\n${result.rows.length} run(s)`));
      console.log('');

    } catch (error) {
      console.error('Failed to show judge history:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Gate check functions
// ─────────────────────────────────────────────────────────────────────────────

function checkRulesGate(profile: any, metrics: any): JudgeCheck {
  if (!profile?.rules_json) {
    return {
      name: 'Rules',
      status: 'fail',
      message: 'Rules not loaded',
      fix: 'bounty rules fetch ' + profile?.repo
    };
  }

  if (metrics?.rules_gate_passed) {
    return {
      name: 'Rules',
      status: 'pass',
      message: 'Rules loaded and acknowledged'
    };
  }

  // Check if rules need acknowledgment
  if (profile.content_hash && profile.rules_acknowledged_hash !== profile.content_hash) {
    return {
      name: 'Rules',
      status: 'fail',
      message: 'Rules changed - needs acknowledgment',
      fix: 'bounty rules acknowledge ' + profile.repo
    };
  }

  return {
    name: 'Rules',
    status: 'pass',
    message: 'Rules loaded'
  };
}

function checkStyleGate(profile: any, metrics: any): JudgeCheck {
  if (!profile?.style_guide_json) {
    return {
      name: 'Style',
      status: 'fail',
      message: 'Style guide not loaded',
      fix: 'bounty style fetch ' + profile?.repo
    };
  }

  // Check freshness (30 day TTL)
  if (profile.style_sampled_at) {
    const sampledAt = new Date(profile.style_sampled_at).getTime();
    const ttlMs = (profile.style_ttl_days || 30) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (now - sampledAt > ttlMs) {
      return {
        name: 'Style',
        status: 'warn',
        message: 'Style guide may be stale',
        fix: 'bounty style fetch ' + profile.repo
      };
    }
  }

  if (metrics?.style_gate_passed) {
    return {
      name: 'Style',
      status: 'pass',
      message: 'Style guide loaded and current'
    };
  }

  return {
    name: 'Style',
    status: 'pass',
    message: 'Style guide loaded'
  };
}

async function checkToneLint(engagement: any, profile: any, db: any): Promise<JudgeCheck> {
  // Get draft content if available
  const workflowResult = await db.execute({
    sql: 'SELECT * FROM workflow_state WHERE bounty_id = ?',
    args: [engagement.id]
  });
  const workflow = workflowResult.rows[0] as any;

  if (!workflow?.draft_content) {
    return {
      name: 'Tone Lint',
      status: 'skip',
      message: 'No draft to lint'
    };
  }

  // Get style guide
  if (!profile?.style_guide_json) {
    return {
      name: 'Tone Lint',
      status: 'skip',
      message: 'No style guide for linting'
    };
  }

  let guide: StyleGuide;
  try {
    guide = JSON.parse(profile.style_guide_json);
  } catch {
    return {
      name: 'Tone Lint',
      status: 'skip',
      message: 'Could not parse style guide'
    };
  }

  // Run lint
  const { passed, issues } = lintAgainstStyle(workflow.draft_content, guide);

  if (passed) {
    return {
      name: 'Tone Lint',
      status: 'pass',
      message: 'No AI-ish patterns detected'
    };
  }

  return {
    name: 'Tone Lint',
    status: 'fail',
    message: `${issues.length} issue(s): ${issues[0]}`,
    fix: 'Revise draft to remove AI-ish patterns'
  };
}

function checkEvidenceGate(evidence: any): JudgeCheck {
  if (!evidence) {
    return {
      name: 'Evidence',
      status: 'fail',
      message: 'No evidence bundle',
      fix: 'bounty evidence build <engagement_id>'
    };
  }

  // Check bundle exists on disk
  if (!fs.existsSync(evidence.path)) {
    return {
      name: 'Evidence',
      status: 'fail',
      message: 'Evidence bundle not found on disk',
      fix: 'bounty evidence build <engagement_id>'
    };
  }

  // Check required files
  const requiredFiles = ['SUMMARY.md', 'TESTING.md', 'RULES-COMPLIANCE.md'];
  const files = JSON.parse(evidence.files_json || '[]');
  const missing = requiredFiles.filter(f => !files.includes(f));

  if (missing.length > 0) {
    return {
      name: 'Evidence',
      status: 'fail',
      message: `Missing: ${missing.join(', ')}`,
      fix: 'bounty evidence build <engagement_id>'
    };
  }

  return {
    name: 'Evidence',
    status: 'pass',
    message: 'Evidence bundle complete'
  };
}

function checkTestsGate(lastTest: any): JudgeCheck {
  if (!lastTest) {
    return {
      name: 'Tests',
      status: 'fail',
      message: 'No test runs recorded',
      fix: 'bounty test run <engagement_id>'
    };
  }

  if (lastTest.status !== 'pass') {
    return {
      name: 'Tests',
      status: 'fail',
      message: `Last test failed (exit ${lastTest.exit_code})`,
      fix: 'Fix tests and run: bounty test run <engagement_id>'
    };
  }

  // Check test recency (warn if > 1 hour old)
  const runTime = new Date(lastTest.created_at).getTime();
  const now = Date.now();
  const ageHours = (now - runTime) / (1000 * 60 * 60);

  if (ageHours > 1) {
    return {
      name: 'Tests',
      status: 'warn',
      message: `Tests passed ${Math.round(ageHours)}h ago - consider re-running`,
      fix: 'bounty test run <engagement_id>'
    };
  }

  return {
    name: 'Tests',
    status: 'pass',
    message: `Tests passed (${lastTest.duration_seconds}s)`
  };
}

function checkEligibilityGate(metrics: any): JudgeCheck {
  if (!metrics) {
    return {
      name: 'Eligibility',
      status: 'warn',
      message: 'Not qualified'
    };
  }

  if (metrics.eligibility === 'workable') {
    return {
      name: 'Eligibility',
      status: 'pass',
      message: 'Issue is workable'
    };
  }

  if (metrics.eligibility === 'needs_maintainer_decision') {
    return {
      name: 'Eligibility',
      status: 'warn',
      message: 'Needs maintainer decision'
    };
  }

  if (metrics.eligibility === 'blocked_by_cla') {
    return {
      name: 'Eligibility',
      status: 'fail',
      message: 'Blocked by CLA',
      fix: 'bounty cla complete <repo>'
    };
  }

  return {
    name: 'Eligibility',
    status: 'pass',
    message: `Eligibility: ${metrics.eligibility}`
  };
}

async function checkCLAGate(repo: string, db: any): Promise<JudgeCheck> {
  const result = await db.execute({
    sql: 'SELECT * FROM cla_status WHERE repo = ?',
    args: [repo]
  });

  if (result.rows.length === 0) {
    return {
      name: 'CLA',
      status: 'skip',
      message: 'CLA status unknown'
    };
  }

  const cla = result.rows[0] as any;

  if (cla.cla_required && cla.cla_status !== 'completed') {
    return {
      name: 'CLA',
      status: 'fail',
      message: 'CLA required but not completed',
      fix: 'bounty cla complete ' + repo
    };
  }

  if (cla.dco_required && cla.dco_status !== 'enabled') {
    return {
      name: 'CLA',
      status: 'fail',
      message: 'DCO required but not enabled',
      fix: 'bounty dco enable'
    };
  }

  return {
    name: 'CLA',
    status: 'pass',
    message: cla.cla_required ? 'CLA completed' : 'No CLA required'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatJudgeForSlack(
  engagementId: string,
  status: string,
  checks: JudgeCheck[],
  requiredFixes: string[]
): string {
  const emoji = status === 'pass' ? '✅' : '❌';
  const checksStr = checks.map(c => {
    const icon = c.status === 'pass' ? '✓' :
                 c.status === 'fail' ? '✗' :
                 c.status === 'warn' ? '⚠' : '○';
    return `${icon} ${c.name}: ${c.message}`;
  }).join('\n');

  let msg = `${emoji} *JUDGE: ${status.toUpperCase()}*

*Engagement:* ${engagementId}

\`\`\`
${checksStr}
\`\`\``;

  if (status === 'pass') {
    msg += `\n\nNext: \`bounty submit ${engagementId}\``;
  } else {
    msg += `\n\n*Required Fixes:*\n${requiredFixes.map(f => `• ${f}`).join('\n')}`;
  }

  return msg;
}

function padRight(s: string, len: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}
