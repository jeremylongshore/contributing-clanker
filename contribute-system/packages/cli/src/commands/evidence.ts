/**
 * Evidence Command - Build evidence bundles for PR submissions
 *
 * Creates deterministic evidence bundles with:
 * - SUMMARY.md - Changes overview, risk, rollback
 * - REPRO.md - Reproduction steps
 * - TESTING.md - Test commands + results
 * - DIFFSTAT.txt - Files changed
 * - RULES-COMPLIANCE.md - Rules checklist
 * - STYLE-COMPLIANCE.md - Style checklist
 * - LINKS.md - Issue/PR URLs
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const evidenceCommand = new Command('evidence')
  .description('Build and manage evidence bundles');

/**
 * Build evidence bundle for an engagement
 */
evidenceCommand
  .command('build <engagement_id>')
  .description('Build evidence bundle for PR submission')
  .option('-o, --out <path>', 'Output directory', './evidence')
  .option('--include-logs', 'Include full test logs')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (engagementId, options) => {
    const spinner = ora(`Building evidence bundle for ${engagementId}...`).start();

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
      const [owner, repoName] = repo.split('/');

      // Get repo profile
      const profileResult = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });
      const profile = profileResult.rows[0] as any;

      // Get test runs
      const testResult = await db.execute({
        sql: 'SELECT * FROM test_runs WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [engagementId]
      });
      const lastTestRun = testResult.rows[0] as any;

      // Create bundle directory
      const bundleDir = path.join(options.out, engagementId);
      fs.mkdirSync(bundleDir, { recursive: true });

      // Get repo path
      const repoPath = path.join(
        process.env.HOME || '~',
        '000-forked',
        owner,
        repoName
      );

      // Build each file
      const files: string[] = [];

      // 1. SUMMARY.md
      const summaryContent = buildSummary(engagement, profile, lastTestRun, repoPath);
      fs.writeFileSync(path.join(bundleDir, 'SUMMARY.md'), summaryContent);
      files.push('SUMMARY.md');

      // 2. REPRO.md
      const reproContent = buildRepro(engagement);
      fs.writeFileSync(path.join(bundleDir, 'REPRO.md'), reproContent);
      files.push('REPRO.md');

      // 3. TESTING.md
      const testingContent = buildTesting(lastTestRun, options.includeLogs);
      fs.writeFileSync(path.join(bundleDir, 'TESTING.md'), testingContent);
      files.push('TESTING.md');

      // 4. DIFFSTAT.txt
      const diffstatContent = buildDiffstat(repoPath);
      fs.writeFileSync(path.join(bundleDir, 'DIFFSTAT.txt'), diffstatContent);
      files.push('DIFFSTAT.txt');

      // 5. RULES-COMPLIANCE.md
      const rulesContent = buildRulesCompliance(profile);
      fs.writeFileSync(path.join(bundleDir, 'RULES-COMPLIANCE.md'), rulesContent);
      files.push('RULES-COMPLIANCE.md');

      // 6. STYLE-COMPLIANCE.md
      const styleContent = buildStyleCompliance(profile);
      fs.writeFileSync(path.join(bundleDir, 'STYLE-COMPLIANCE.md'), styleContent);
      files.push('STYLE-COMPLIANCE.md');

      // 7. LINKS.md
      const linksContent = buildLinks(engagement);
      fs.writeFileSync(path.join(bundleDir, 'LINKS.md'), linksContent);
      files.push('LINKS.md');

      // Calculate bundle hash
      const hash = calculateBundleHash(bundleDir, files);

      // Store in DB
      const now = new Date().toISOString();
      const summaryJson = JSON.stringify({
        files,
        testStatus: lastTestRun?.status || 'not_run',
        hasRules: !!profile?.rules_json,
        hasStyle: !!profile?.style_guide_json
      });

      await db.execute({
        sql: `INSERT INTO evidence_bundles (engagement_id, path, hash, summary_json, files_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [engagementId, bundleDir, hash, summaryJson, JSON.stringify(files), now]
      });

      // Get the bundle ID
      const bundleIdResult = await db.execute({
        sql: 'SELECT id FROM evidence_bundles WHERE engagement_id = ? ORDER BY id DESC LIMIT 1',
        args: [engagementId]
      });
      const bundleId = (bundleIdResult.rows[0] as any)?.id;

      // Update engagement_metrics
      await db.execute({
        sql: `UPDATE engagement_metrics SET evidence_bundle_id = ? WHERE engagement_id = ?`,
        args: [bundleId, engagementId]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'evidence_built', ?, ?)`,
        args: [engagementId, now, JSON.stringify({ path: bundleDir, hash, files })]
      });

      spinner.succeed('Evidence bundle built');

      console.log(chalk.bold(`\nEvidence Bundle: ${engagementId}\n`));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Path: ${bundleDir}`);
      console.log(`  Hash: ${hash.substring(0, 16)}...`);
      console.log(`  Files:`);
      for (const file of files) {
        console.log(`    - ${file}`);
      }
      console.log(chalk.dim('─'.repeat(50)));

      // Preview summary
      console.log(chalk.bold('\nSummary Preview:'));
      const summaryLines = summaryContent.split('\n').slice(0, 12);
      for (const line of summaryLines) {
        console.log(chalk.dim(`  ${line}`));
      }
      console.log(chalk.dim('  ...'));

      // Slack notification
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: formatEvidenceForSlack(engagementId, bundleDir, hash, files, summaryLines.join('\n'))
        } as SlackMessage);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to build evidence bundle');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show evidence bundle
 */
evidenceCommand
  .command('show <engagement_id>')
  .description('Show evidence bundle for an engagement')
  .action(async (engagementId) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM evidence_bundles WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [engagementId]
      });

      if (result.rows.length === 0) {
        console.log(chalk.yellow(`\nNo evidence bundle for ${engagementId}`));
        console.log(chalk.dim('Run: bounty evidence build ' + engagementId));
        return;
      }

      const bundle = result.rows[0] as any;
      const files = JSON.parse(bundle.files_json || '[]');

      console.log(chalk.bold(`\nEvidence Bundle: ${engagementId}\n`));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Path: ${bundle.path}`);
      console.log(`  Hash: ${bundle.hash?.substring(0, 16)}...`);
      console.log(`  Created: ${bundle.created_at}`);
      console.log(`  Files:`);
      for (const file of files) {
        const filePath = path.join(bundle.path, file);
        const exists = fs.existsSync(filePath);
        console.log(`    ${exists ? chalk.green('✓') : chalk.red('✗')} ${file}`);
      }
      console.log(chalk.dim('─'.repeat(50)));
      console.log('');

    } catch (error) {
      console.error('Failed to show evidence bundle:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List evidence bundles
 */
evidenceCommand
  .command('list')
  .description('List all evidence bundles')
  .action(async () => {
    try {
      const db = getDb();

      const result = await db.execute(
        'SELECT * FROM evidence_bundles ORDER BY created_at DESC LIMIT 20'
      );

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo evidence bundles found'));
        return;
      }

      console.log(chalk.bold('\nEvidence Bundles\n'));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        padRight('Engagement', 40) +
        padRight('Files', 10) +
        'Created'
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const row of result.rows) {
        const bundle = row as any;
        const files = JSON.parse(bundle.files_json || '[]');
        console.log(
          padRight(bundle.engagement_id, 40) +
          padRight(String(files.length), 10) +
          bundle.created_at
        );
      }

      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.dim(`\n${result.rows.length} bundle(s)`));
      console.log('');

    } catch (error) {
      console.error('Failed to list evidence bundles:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(engagement: any, profile: any, testRun: any, repoPath: string): string {
  const lines: string[] = [];

  lines.push('# Evidence Summary');
  lines.push('');
  lines.push(`**Engagement:** ${engagement.id}`);
  lines.push(`**Repo:** ${engagement.repo}`);
  lines.push(`**Issue:** ${engagement.issue_url || 'N/A'}`);
  lines.push(`**PR:** ${engagement.pr_url || 'Not yet submitted'}`);
  lines.push(`**Status:** ${engagement.status}`);
  lines.push('');

  lines.push('## What Changed');
  lines.push('');
  lines.push(`Title: ${engagement.title || 'N/A'}`);
  lines.push('');

  // Get git stats if possible
  try {
    if (fs.existsSync(repoPath)) {
      const stats = execSync('git diff --stat HEAD~1 2>/dev/null || echo "No diff available"', {
        cwd: repoPath,
        encoding: 'utf-8'
      });
      lines.push('```');
      lines.push(stats.trim());
      lines.push('```');
    }
  } catch {
    lines.push('*Git diff not available*');
  }
  lines.push('');

  lines.push('## Risk Assessment');
  lines.push('');
  lines.push('- **Risk Level:** Low/Medium/High (assess manually)');
  lines.push('- **Breaking Changes:** None expected');
  lines.push('- **Rollback Plan:** Revert commit');
  lines.push('');

  lines.push('## Test Status');
  lines.push('');
  if (testRun) {
    lines.push(`- **Last Run:** ${testRun.created_at}`);
    lines.push(`- **Status:** ${testRun.status}`);
    lines.push(`- **Duration:** ${testRun.duration_seconds || 0}s`);
  } else {
    lines.push('- **Status:** Not run');
  }
  lines.push('');

  lines.push('## Gates');
  lines.push('');
  lines.push(`- Rules: ${profile?.rules_json ? '✓ Loaded' : '✗ Missing'}`);
  lines.push(`- Style: ${profile?.style_guide_json ? '✓ Loaded' : '✗ Missing'}`);
  lines.push(`- Tests: ${testRun?.status === 'pass' ? '✓ Pass' : '✗ Not verified'}`);
  lines.push('');

  return lines.join('\n');
}

function buildRepro(engagement: any): string {
  const lines: string[] = [];

  lines.push('# Reproduction Steps');
  lines.push('');
  lines.push('## Issue');
  lines.push('');
  lines.push(`URL: ${engagement.issue_url || 'N/A'}`);
  lines.push('');
  lines.push('## Steps to Reproduce');
  lines.push('');
  lines.push('1. [Document steps here]');
  lines.push('2. ...');
  lines.push('');
  lines.push('## Expected Behavior');
  lines.push('');
  lines.push('[What should happen]');
  lines.push('');
  lines.push('## Actual Behavior (Before Fix)');
  lines.push('');
  lines.push('[What was happening]');
  lines.push('');
  lines.push('## Verified (After Fix)');
  lines.push('');
  lines.push('- [ ] Repro confirmed before fix');
  lines.push('- [ ] Fix verified working');
  lines.push('');

  return lines.join('\n');
}

function buildTesting(testRun: any, includeLogs: boolean): string {
  const lines: string[] = [];

  lines.push('# Testing Evidence');
  lines.push('');

  if (!testRun) {
    lines.push('*No test runs recorded*');
    lines.push('');
    lines.push('Run: `bounty test run <engagement_id>`');
    return lines.join('\n');
  }

  lines.push('## Test Run');
  lines.push('');
  lines.push(`- **Command:** \`${testRun.command}\``);
  lines.push(`- **Environment:** ${testRun.env}`);
  lines.push(`- **Status:** ${testRun.status}`);
  lines.push(`- **Exit Code:** ${testRun.exit_code}`);
  lines.push(`- **Duration:** ${testRun.duration_seconds}s`);
  lines.push(`- **Timestamp:** ${testRun.created_at}`);
  lines.push('');

  lines.push('## Output Excerpt');
  lines.push('');
  lines.push('```');
  lines.push(testRun.output_excerpt || 'No output captured');
  lines.push('```');
  lines.push('');

  if (includeLogs && testRun.full_output_path) {
    lines.push('## Full Output');
    lines.push('');
    lines.push(`See: ${testRun.full_output_path}`);
  }

  return lines.join('\n');
}

function buildDiffstat(repoPath: string): string {
  try {
    if (!fs.existsSync(repoPath)) {
      return 'Repository not found at expected path.\n';
    }

    const diffstat = execSync('git diff --stat HEAD~1 2>/dev/null || git diff --stat', {
      cwd: repoPath,
      encoding: 'utf-8'
    });

    return `DIFFSTAT\n========\n\n${diffstat}`;
  } catch {
    return 'DIFFSTAT\n========\n\nUnable to generate diff stats.\n';
  }
}

function buildRulesCompliance(profile: any): string {
  const lines: string[] = [];

  lines.push('# Rules Compliance Checklist');
  lines.push('');

  if (!profile?.rules_json) {
    lines.push('*No rules loaded for this repo*');
    lines.push('');
    lines.push('Run: `bounty rules fetch <repo>`');
    return lines.join('\n');
  }

  let rules: any;
  try {
    rules = JSON.parse(profile.rules_json);
  } catch {
    lines.push('*Failed to parse rules*');
    return lines.join('\n');
  }

  lines.push('## PR Requirements');
  lines.push('');

  // PR naming
  if (rules.pr?.naming) {
    lines.push(`- [ ] PR title follows: \`${rules.pr.naming}\``);
  }

  // Tests
  if (rules.tests?.required) {
    lines.push('- [ ] Tests added/updated');
    if (rules.tests.framework) {
      lines.push(`- [ ] Tests use: ${rules.tests.framework}`);
    }
  }

  // Review
  if (rules.review?.required) {
    lines.push('- [ ] Ready for review');
    if (rules.review.codeowners) {
      lines.push('- [ ] CODEOWNERS will be notified');
    }
  }

  // CLA
  if (rules.cla?.required) {
    lines.push(`- [ ] CLA signed (${rules.cla.type || 'CLA'})`);
  }

  lines.push('');
  lines.push('## Version');
  lines.push('');
  lines.push(`Rules version: ${profile.rules_version || 1}`);
  lines.push(`Content hash: ${profile.content_hash || 'N/A'}`);
  lines.push('');

  return lines.join('\n');
}

function buildStyleCompliance(profile: any): string {
  const lines: string[] = [];

  lines.push('# Style Compliance Checklist');
  lines.push('');

  if (!profile?.style_guide_json) {
    lines.push('*No style guide loaded for this repo*');
    lines.push('');
    lines.push('Run: `bounty style fetch <repo>`');
    return lines.join('\n');
  }

  let guide: any;
  try {
    guide = JSON.parse(profile.style_guide_json);
  } catch {
    lines.push('*Failed to parse style guide*');
    return lines.join('\n');
  }

  lines.push('## PR Body Style');
  lines.push('');

  if (guide.prBodyStyle) {
    lines.push(`- [ ] Length matches: ${guide.prBodyStyle.lengthTarget || 'medium'}`);
    lines.push(`- [ ] Tone matches: ${guide.prBodyStyle.tone || 'neutral'}`);
    if (guide.prBodyStyle.usesHeadings) {
      lines.push('- [ ] Uses standard headings');
    }
  }

  lines.push('');
  lines.push('## Commit Style');
  lines.push('');

  if (guide.commitNaming) {
    if (guide.commitNaming.conventional) {
      lines.push('- [ ] Commits are conventional (type(scope): message)');
    }
    if (guide.commitNaming.format) {
      lines.push(`- [ ] Format: ${guide.commitNaming.format}`);
    }
  }

  lines.push('');
  lines.push('## Tone Check');
  lines.push('');
  lines.push('- [ ] No AI-ish patterns ("I would be happy to", etc.)');
  lines.push('- [ ] Matches repo native style');
  lines.push('');

  if (guide.redFlags && guide.redFlags.length > 0) {
    lines.push('## Avoid These');
    lines.push('');
    for (const flag of guide.redFlags) {
      lines.push(`- ${flag}`);
    }
    lines.push('');
  }

  lines.push('## Version');
  lines.push('');
  lines.push(`Style version: ${profile.style_version || 1}`);
  lines.push(`Sampled: ${profile.style_sampled_at || 'N/A'}`);
  lines.push('');

  return lines.join('\n');
}

function buildLinks(engagement: any): string {
  const lines: string[] = [];

  lines.push('# Links');
  lines.push('');
  lines.push('## Primary');
  lines.push('');
  lines.push(`- **Issue:** ${engagement.issue_url || 'N/A'}`);
  lines.push(`- **PR:** ${engagement.pr_url || 'Not yet submitted'}`);
  lines.push('');
  lines.push('## Related');
  lines.push('');
  lines.push('- [Add related issues/PRs here]');
  lines.push('');
  lines.push('## Key Comments');
  lines.push('');
  lines.push('- [Add important discussion links here]');
  lines.push('');

  return lines.join('\n');
}

function calculateBundleHash(bundleDir: string, files: string[]): string {
  const hash = crypto.createHash('sha256');

  for (const file of files.sort()) {
    const filePath = path.join(bundleDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      hash.update(content);
    }
  }

  return hash.digest('hex');
}

function formatEvidenceForSlack(
  engagementId: string,
  bundlePath: string,
  hash: string,
  files: string[],
  summaryPreview: string
): string {
  return `📦 *EVIDENCE BUNDLE BUILT*

*Engagement:* ${engagementId}
*Path:* \`${bundlePath}\`
*Hash:* \`${hash.substring(0, 16)}...\`
*Files:* ${files.join(', ')}

\`\`\`
${summaryPreview}
\`\`\`

Next: \`bounty judge run ${engagementId}\``;
}

function padRight(s: string, len: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}
