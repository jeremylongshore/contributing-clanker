/**
 * Draft Command - Step 3 of Progressive Workflow
 *
 * Generate claim comment for posting to GitHub.
 * Sends to Slack for final approval before submission.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { notifyDraft } from '../lib/slack';

export const draftCommand = new Command('draft')
  .description('Generate claim comment for approval')
  .argument('<id>', 'Bounty ID (e.g., owner/repo#123)')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (id, options) => {
    const spinner = ora('Loading bounty...').start();

    try {
      const db = getDb();

      // Normalize ID format
      const bountyId = normalizeId(id);

      // Load bounty
      const bountyResult = await db.execute({
        sql: 'SELECT * FROM bounties WHERE id = ?',
        args: [bountyId]
      });

      if (bountyResult.rows.length === 0) {
        spinner.fail('Bounty not found');
        console.log(chalk.dim('Run: bounty qualify <github-url> first'));
        process.exit(1);
      }

      const bounty = bountyResult.rows[0];

      // Check workflow state
      const workflowResult = await db.execute({
        sql: 'SELECT * FROM workflow_state WHERE bounty_id = ?',
        args: [bountyId]
      });

      const workflow = workflowResult.rows[0];

      if (!workflow || (workflow.step !== 'plan' && workflow.step !== 'qualify')) {
        spinner.fail('Plan not approved yet');
        console.log(chalk.dim(`Run: bounty plan ${bountyId} first`));
        process.exit(1);
      }

      spinner.text = 'Generating claim draft...';

      // Generate claim comment
      const draft = generateClaimComment(bounty, workflow);

      spinner.stop();

      // Print draft
      console.log(chalk.bold('\n✏️ Claim Draft\n'));
      console.log(chalk.bold('═'.repeat(60)));
      console.log(`\nBounty: ${bounty.repo}#${bounty.issue}`);
      console.log(chalk.bold('\n─'.repeat(60)));
      console.log(draft);
      console.log(chalk.bold('─'.repeat(60)));

      // Send to Slack
      if (options.slack !== false) {
        spinner.start('Sending draft to Slack...');

        const threadTs = workflow?.slack_thread_ts as string | undefined;

        const slackResult = await notifyDraft(
          bountyId,
          bounty.repo as string,
          draft,
          threadTs
        );

        if (slackResult.ok) {
          spinner.succeed('Draft sent to Slack');

          // Update workflow state
          const now = new Date().toISOString();
          await db.execute({
            sql: `UPDATE workflow_state
                  SET step = 'draft', draft_content = ?, updated_at = ?
                  WHERE bounty_id = ?`,
            args: [draft, now, bountyId]
          });

          console.log(chalk.dim('\nReview draft in Slack'));
          console.log(chalk.dim('Reply "submit" to post to GitHub'));
        } else {
          spinner.warn('Slack notification failed');
          console.log(chalk.dim(slackResult.error));
        }
      }

      // Update bounty status
      await db.execute({
        sql: 'UPDATE bounties SET status = ?, updated_at = ? WHERE id = ?',
        args: ['drafting', new Date().toISOString(), bountyId]
      });

      console.log(chalk.bold('\nNext step:'));
      console.log(chalk.cyan(`  bounty submit ${bountyId}`));
      console.log(chalk.dim('  (after draft approval in Slack)'));
      console.log('');

    } catch (error) {
      spinner.fail('Draft generation failed');
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
 * Generate claim comment
 */
function generateClaimComment(bounty: any, workflow: any): string {
  const lines: string[] = [];

  // Claim statement
  lines.push("I'd like to work on this issue.");
  lines.push('');

  // Brief approach (from plan if available)
  if (workflow?.plan_content) {
    // Extract approach section from plan
    const planContent = workflow.plan_content as string;
    const approachMatch = planContent.match(/\*\*Approach:\*\*\n([\s\S]*?)(?=\n\*\*|$)/);
    if (approachMatch) {
      lines.push('**Approach:**');
      lines.push(approachMatch[1].trim());
      lines.push('');
    }
  }

  // Estimated timeline
  const score = bounty.score || 50;
  const timeline = score < 50 ? '1-2 days' :
                   score < 70 ? '2-3 days' :
                   score < 85 ? '3-5 days' : '1 week';
  lines.push(`**Estimated timeline:** ${timeline}`);
  lines.push('');

  // Experience mention if relevant
  const technologies = JSON.parse(bounty.technologies || '[]') as string[];
  if (technologies.length > 0) {
    lines.push(`I have experience with ${technologies.slice(0, 3).join(', ')}.`);
  }

  return lines.join('\n');
}
