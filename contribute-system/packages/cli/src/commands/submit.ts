import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { getBounty, updateBounty, createProof, getSessions } from '../lib/firestore';
import { nowISO, generateId } from '@contribute/core';

interface GitStats {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}

/**
 * Calculate git diff stats for the current branch vs main/master.
 * Falls back to HEAD~10 if no main branch found.
 */
function getGitStats(): GitStats {
  try {
    // Try to find the base branch (main or master)
    let baseBranch = 'main';
    try {
      execSync('git rev-parse --verify main', { stdio: 'pipe' });
    } catch {
      try {
        execSync('git rev-parse --verify master', { stdio: 'pipe' });
        baseBranch = 'master';
      } catch {
        // No main/master, use HEAD~10 as fallback
        baseBranch = 'HEAD~10';
      }
    }

    // Get shortstat output: "5 files changed, 120 insertions(+), 45 deletions(-)"
    const output = execSync(`git diff --shortstat ${baseBranch}...HEAD 2>/dev/null || git diff --shortstat ${baseBranch} HEAD`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    if (!output) {
      return { linesAdded: 0, linesDeleted: 0, filesChanged: 0 };
    }

    // Parse the shortstat output
    const filesMatch = output.match(/(\d+)\s+files?\s+changed/);
    const insertionsMatch = output.match(/(\d+)\s+insertions?\(\+\)/);
    const deletionsMatch = output.match(/(\d+)\s+deletions?\(-\)/);

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      linesAdded: insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0,
      linesDeleted: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0
    };
  } catch {
    // Not in a git repo or git not available
    return { linesAdded: 0, linesDeleted: 0, filesChanged: 0 };
  }
}

export const submitCommand = new Command('submit')
  .description('Submit a contribution for review')
  .argument('<id>', 'Contribution ID')
  .option('-p, --pr <url>', 'Pull request URL')
  .option('-n, --notes <notes>', 'Submission notes')
  .option('--skip-vetting', 'Skip automated vetting (not recommended)')
  .action(async (id, options) => {
    const spinner = ora('Preparing submission...').start();

    try {
      const bounty = await getBounty(id);
      if (!bounty) {
        spinner.fail(`Contribution not found: ${id}`);
        process.exit(1);
      }

      if (!['claimed', 'in_progress'].includes(bounty.status)) {
        spinner.fail(`Cannot submit - bounty status is: ${bounty.status}`);
        process.exit(1);
      }

      // Gather work sessions
      spinner.text = 'Gathering work sessions...';
      const sessions = await getSessions(id);

      if (sessions.length === 0) {
        spinner.warn('No work sessions recorded');
        console.log(chalk.yellow('\n  Consider recording work sessions for better proof of work.'));
        console.log(chalk.dim('  Use: bounty work start <id>'));
      }

      // Calculate stats
      const recordings = sessions.flatMap(s => s.recordings || []);
      const checkpoints = sessions.flatMap(s => s.checkpoints || []);

      spinner.text = 'Calculating git stats...';
      const gitStats = getGitStats();

      spinner.text = 'Creating proof bundle...';
      const now = nowISO();
      const proofId = generateId('proof');

      // Create proof bundle
      await createProof({
        id: proofId,
        contributionId: id,
        sessions: sessions.map(s => s.id),
        recordings: recordings.map(r => ({
          sessionId: r.sessionId,
          filename: r.filename,
          duration: r.duration,
          url: r.url
        })),
        screenshots: [],
        checkpoints: checkpoints.length,
        linesAdded: gitStats.linesAdded,
        linesDeleted: gitStats.linesDeleted,
        filesChanged: gitStats.filesChanged,
        prUrl: options.pr,
        notes: options.notes,
        createdAt: now,
        vetting: options.skipVetting ? undefined : { status: 'pending' }
      });

      // Update bounty status
      await updateBounty(id, {
        status: 'submitted',
        pr: options.pr ? extractPrNumber(options.pr) : undefined,
        prUrl: options.pr,
        proofId,
        timeline: [
          ...(bounty.timeline || []),
          {
            timestamp: now,
            message: options.notes || 'Submitted for review',
            type: 'status_change'
          }
        ]
      });

      spinner.succeed(`Submitted bounty: ${chalk.bold(bounty.title)}`);

      console.log(`\n${chalk.bold('Proof Bundle:')}`);
      console.log(`  ID: ${proofId}`);
      console.log(`  Sessions: ${sessions.length}`);
      console.log(`  Recordings: ${recordings.length}`);
      console.log(`  Checkpoints: ${checkpoints.length}`);
      if (gitStats.filesChanged > 0) {
        console.log(`  Files changed: ${gitStats.filesChanged}`);
        console.log(`  Lines: ${chalk.green(`+${gitStats.linesAdded}`)} / ${chalk.red(`-${gitStats.linesDeleted}`)}`);
      }
      if (options.pr) {
        console.log(`  PR: ${options.pr}`);
      }

      if (!options.skipVetting) {
        console.log(`\n${chalk.yellow('Vetting pipeline will run automatically.')}`);
        console.log(chalk.dim('Check status with: bounty show ' + id + ' --proof'));
      }

      console.log(`\n${chalk.bold('Next steps:')}`);
      console.log(`  1. Wait for vetting to complete`);
      console.log(`  2. Address any review feedback`);
      console.log(`  3. Once approved, bounty will be marked completed`);

    } catch (error) {
      spinner.fail('Failed to submit bounty');
      console.error(error);
      process.exit(1);
    }
  });

function extractPrNumber(url: string): number | undefined {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}
