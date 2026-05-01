/**
 * Plan Command - Step 2 of Progressive Workflow
 *
 * Analyze issue context and draft implementation approach.
 * Sends plan to Slack for human review before proceeding.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../lib/config';
import { getDb, closeDb } from '../lib/db';
import { notifyPlan } from '../lib/slack';

export const planCommand = new Command('plan')
  .description('Draft implementation plan for a qualified bounty')
  .argument('<id>', 'Bounty ID (e.g., owner/repo#123)')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (id, options) => {
    const spinner = ora('Loading bounty...').start();

    try {
      const config = await getConfig();
      const db = getDb();

      // Normalize ID format
      const bountyId = normalizeId(id);

      // Load bounty from database
      const bountyResult = await db.execute({
        sql: 'SELECT * FROM bounties WHERE id = ?',
        args: [bountyId]
      });

      if (bountyResult.rows.length === 0) {
        spinner.fail('Bounty not found');
        console.log(chalk.dim(`Run: bounty qualify <github-url> first`));
        process.exit(1);
      }

      const bounty = bountyResult.rows[0];

      // Check workflow state
      const workflowResult = await db.execute({
        sql: 'SELECT * FROM workflow_state WHERE bounty_id = ?',
        args: [bountyId]
      });

      const workflow = workflowResult.rows[0];
      if (!workflow || workflow.step === 'hunt') {
        spinner.fail('Bounty not qualified yet');
        console.log(chalk.dim(`Run: bounty qualify <github-url> first`));
        process.exit(1);
      }

      // Load repo profile for guidelines
      const repoResult = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [bounty.repo]
      });

      const repoProfile = repoResult.rows[0];

      spinner.text = 'Analyzing issue...';

      // Generate plan based on bounty data
      const plan = generatePlan(bounty, repoProfile);

      spinner.stop();

      // Print plan
      console.log(chalk.bold('\n📝 Implementation Plan\n'));
      console.log(chalk.bold('═'.repeat(60)));
      console.log(`\nBounty: ${bounty.repo}#${bounty.issue}`);
      console.log(`Title: ${bounty.title}`);
      console.log(`Value: $${bounty.value || 0}`);
      console.log(chalk.bold('\n─'.repeat(60)));
      console.log(plan);
      console.log(chalk.bold('─'.repeat(60)));

      // Send to Slack
      if (options.slack !== false) {
        spinner.start('Sending plan to Slack...');

        const threadTs = workflow?.slack_thread_ts as string | undefined;

        const slackResult = await notifyPlan(
          bountyId,
          bounty.repo as string,
          bounty.title as string,
          plan,
          threadTs
        );

        if (slackResult.ok) {
          spinner.succeed('Plan sent to Slack');

          // Update workflow state
          const now = new Date().toISOString();
          await db.execute({
            sql: `UPDATE workflow_state
                  SET step = 'plan', plan_content = ?, updated_at = ?
                  WHERE bounty_id = ?`,
            args: [plan, now, bountyId]
          });

          console.log(chalk.dim('\nReview plan in Slack'));
          console.log(chalk.dim('Reply "draft" to proceed, or "revise: <feedback>"'));
        } else {
          spinner.warn('Slack notification failed');
          console.log(chalk.dim(slackResult.error));
        }
      }

      // Update bounty status
      await db.execute({
        sql: 'UPDATE bounties SET status = ?, updated_at = ? WHERE id = ?',
        args: ['planning', new Date().toISOString(), bountyId]
      });

      console.log(chalk.bold('\nNext step:'));
      console.log(chalk.cyan(`  bounty draft ${bountyId}`));
      console.log(chalk.dim('  (after plan approval in Slack)'));
      console.log('');

    } catch (error) {
      spinner.fail('Plan generation failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Normalize bounty ID format
 */
function normalizeId(id: string): string {
  // Handle GitHub URL format
  const urlMatch = id.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}#${urlMatch[3]}`;
  }

  // Handle owner/repo/issues/123 format
  const pathMatch = id.match(/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (pathMatch) {
    return `${pathMatch[1]}/${pathMatch[2]}#${pathMatch[3]}`;
  }

  // Assume already in owner/repo#123 format
  return id;
}

/**
 * Generate implementation plan
 */
function generatePlan(bounty: any, repoProfile: any): string {
  const lines: string[] = [];
  const title = bounty.title || '';
  const description = bounty.description || '';
  const labels = JSON.parse(bounty.labels || '[]') as string[];
  const technologies = JSON.parse(bounty.technologies || '[]') as string[];

  // Analyze the issue
  const isBugFix = labels.some(l => l.toLowerCase().includes('bug')) ||
                   title.toLowerCase().includes('fix') ||
                   description.toLowerCase().includes('bug');

  const isFeature = labels.some(l => l.toLowerCase().includes('feature') || l.toLowerCase().includes('enhancement')) ||
                    title.toLowerCase().includes('add') ||
                    title.toLowerCase().includes('implement');

  const isDocs = labels.some(l => l.toLowerCase().includes('doc')) ||
                 title.toLowerCase().includes('doc');

  const isRefactor = title.toLowerCase().includes('refactor') ||
                     description.toLowerCase().includes('refactor');

  // Type of change
  lines.push('**Type:**');
  if (isBugFix) lines.push('Bug fix');
  else if (isFeature) lines.push('New feature');
  else if (isDocs) lines.push('Documentation');
  else if (isRefactor) lines.push('Refactoring');
  else lines.push('Enhancement');

  lines.push('');

  // Estimated scope
  lines.push('**Estimated Scope:**');
  const estimatedLines = bounty.score < 50 ? '~50' :
                         bounty.score < 70 ? '~100' :
                         bounty.score < 85 ? '~200' : '~300+';
  lines.push(`- Lines: ${estimatedLines}`);
  lines.push(`- Files: ${bounty.score < 50 ? '1-2' : bounty.score < 70 ? '2-3' : '3-5'}`);
  lines.push('');

  // Approach
  lines.push('**Approach:**');
  if (isBugFix) {
    lines.push('1. Reproduce the issue locally');
    lines.push('2. Identify root cause in codebase');
    lines.push('3. Implement fix with minimal changes');
    lines.push('4. Add test case to prevent regression');
    lines.push('5. Verify fix resolves original issue');
  } else if (isFeature) {
    lines.push('1. Review related code and patterns');
    lines.push('2. Design implementation following existing architecture');
    lines.push('3. Implement core functionality');
    lines.push('4. Add comprehensive tests');
    lines.push('5. Update documentation if needed');
  } else if (isDocs) {
    lines.push('1. Review existing documentation');
    lines.push('2. Identify gaps or inaccuracies');
    lines.push('3. Write/update documentation');
    lines.push('4. Add examples where helpful');
  } else {
    lines.push('1. Analyze requirements');
    lines.push('2. Review existing implementation');
    lines.push('3. Implement changes');
    lines.push('4. Add/update tests');
    lines.push('5. Verify all tests pass');
  }
  lines.push('');

  // Technologies
  if (technologies.length > 0) {
    lines.push('**Technologies:**');
    lines.push(technologies.join(', '));
    lines.push('');
  }

  // Repo guidelines
  if (repoProfile) {
    lines.push('**Repo Requirements:**');

    if (repoProfile.cla_required) {
      lines.push('- ⚠️ CLA Required');
    }

    if (repoProfile.pr_naming_convention) {
      lines.push(`- PR naming: ${repoProfile.pr_naming_convention}`);
    }

    if (repoProfile.test_framework) {
      lines.push(`- Tests: ${repoProfile.test_framework}`);
    }

    lines.push('');
  }

  // Draft PR title
  lines.push('**Draft PR Title:**');
  const prPrefix = isBugFix ? 'fix' : isFeature ? 'feat' : isDocs ? 'docs' : 'chore';
  const scope = extractScope(title);
  const prTitle = `${prPrefix}${scope ? `(${scope})` : ''}: ${cleanTitle(title)}`;
  lines.push(`\`${prTitle}\``);

  return lines.join('\n');
}

/**
 * Extract scope from title (e.g., "auth" from "Fix auth bug")
 */
function extractScope(title: string): string | null {
  const lower = title.toLowerCase();

  // Common scopes
  const scopes = ['auth', 'api', 'ui', 'db', 'cli', 'core', 'docs', 'test', 'build'];
  for (const scope of scopes) {
    if (lower.includes(scope)) {
      return scope;
    }
  }

  return null;
}

/**
 * Clean title for PR
 */
function cleanTitle(title: string): string {
  return title
    .replace(/^\[.*?\]\s*/, '')  // Remove [Bug], [Feature], etc.
    .replace(/^(fix|add|implement|update|refactor):\s*/i, '')  // Remove prefix
    .toLowerCase()
    .trim();
}
