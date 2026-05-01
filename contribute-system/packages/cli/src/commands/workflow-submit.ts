/**
 * Workflow Submit Command - Step 4 of Progressive Workflow
 *
 * Post approved claim to GitHub issue.
 * Updates database and notifies Slack.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { getConfig } from '../lib/config';
import { getDb, closeDb } from '../lib/db';
import { notifySubmitted } from '../lib/slack';

export const workflowSubmitCommand = new Command('claim-submit')
  .description('Post approved claim to GitHub (Step 4)')
  .argument('<id>', 'Bounty ID (e.g., owner/repo#123)')
  .option('--dry-run', 'Show what would be posted without posting')
  .action(async (id, options) => {
    const spinner = ora('Loading bounty...').start();

    try {
      const config = await getConfig();
      const db = getDb();

      // Normalize ID
      const bountyId = normalizeId(id);

      // Load bounty
      const bountyResult = await db.execute({
        sql: 'SELECT * FROM bounties WHERE id = ?',
        args: [bountyId]
      });

      if (bountyResult.rows.length === 0) {
        spinner.fail('Bounty not found');
        process.exit(1);
      }

      const bounty = bountyResult.rows[0];

      // Load workflow state
      const workflowResult = await db.execute({
        sql: 'SELECT * FROM workflow_state WHERE bounty_id = ?',
        args: [bountyId]
      });

      const workflow = workflowResult.rows[0];

      if (!workflow || workflow.step !== 'draft') {
        spinner.fail('Draft not approved yet');
        console.log(chalk.dim(`Run: bounty draft ${bountyId} first`));
        process.exit(1);
      }

      const draftContent = workflow.draft_content as string;

      if (!draftContent) {
        spinner.fail('No draft content found');
        process.exit(1);
      }

      spinner.stop();

      // Show what will be posted
      console.log(chalk.bold('\n📤 Posting Claim\n'));
      console.log(chalk.bold('─'.repeat(60)));
      console.log(`To: ${bounty.source_url}`);
      console.log(chalk.bold('─'.repeat(60)));
      console.log(draftContent);
      console.log(chalk.bold('─'.repeat(60)));

      if (options.dryRun) {
        console.log(chalk.yellow('\n[DRY RUN] Would post the above comment'));
        return;
      }

      // Post to GitHub using gh CLI
      spinner.start('Posting to GitHub...');

      const issueUrl = bounty.source_url as string;

      try {
        execSync(`gh issue comment "${issueUrl}" --body "${escapeForShell(draftContent)}"`, {
          stdio: 'pipe',
          encoding: 'utf-8'
        });
      } catch (error) {
        spinner.fail('Failed to post comment');
        console.log(chalk.dim('Make sure gh CLI is installed and authenticated'));
        console.log(chalk.dim('Run: gh auth login'));
        throw error;
      }

      spinner.succeed('Claim posted to GitHub');

      // Update bounty status
      const now = new Date().toISOString();
      await db.execute({
        sql: `UPDATE bounties
              SET status = 'claimed', claimed_at = ?, updated_at = ?
              WHERE id = ?`,
        args: [now, now, bountyId]
      });

      // Update workflow state
      await db.execute({
        sql: `UPDATE workflow_state
              SET step = 'claimed', updated_at = ?
              WHERE bounty_id = ?`,
        args: [now, bountyId]
      });

      // Notify Slack
      await notifySubmitted(
        bountyId,
        bounty.repo as string,
        issueUrl,
        {
          method: bounty.payment_method as string | undefined,
          terms: bounty.payment_terms as string | undefined
        }
      );

      console.log(chalk.green('\n✅ Bounty Claimed!'));
      console.log(chalk.dim(`\nStart work with: bounty work start ${bountyId}`));

      // Show payment info if available
      if (bounty.payment_method || bounty.payment_terms) {
        console.log(chalk.bold('\nPayment Info:'));
        if (bounty.payment_method) {
          console.log(`  Method: ${bounty.payment_method}`);
        }
        if (bounty.payment_terms) {
          console.log(`  Terms: ${bounty.payment_terms}`);
        }
      }

      console.log('');

    } catch (error) {
      spinner.fail('Submission failed');
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
  const urlMatch = id.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}#${urlMatch[3]}`;
  }

  const pathMatch = id.match(/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (pathMatch) {
    return `${pathMatch[1]}/${pathMatch[2]}#${pathMatch[3]}`;
  }

  return id;
}

/**
 * Escape string for shell command
 */
function escapeForShell(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}
