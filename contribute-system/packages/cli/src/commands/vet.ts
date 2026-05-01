/**
 * Vetting Commands
 *
 * Run automated vetting on bounty submissions.
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { getBounty, updateBounty, createProof } from '../lib/firestore';
import { nowISO } from '@contribute/core';
import {
  runVetting,
  VettingResult,
  VettingStage
} from '@contribute/vetting';

export const vetCommand = new Command('vet')
  .description('Run vetting pipeline on a bounty');

vetCommand
  .command('run <id>')
  .description('Run full vetting pipeline on a bounty')
  .option('--skip <stages>', 'Comma-separated stages to skip')
  .option('--only <stages>', 'Comma-separated stages to run (skip others)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (id, options) => {
    const spinner = ora('Loading bounty...').start();

    try {
      const bounty = await getBounty(id);
      if (!bounty) {
        spinner.fail(`Bounty not found: ${id}`);
        process.exit(1);
      }

      if (!bounty.repo || !bounty.pr) {
        spinner.fail('Bounty must have repo and PR linked');
        console.log(chalk.dim('Link a PR first with the GitHub integration'));
        process.exit(1);
      }

      spinner.text = 'Starting vetting pipeline...';

      // Parse stage options
      const skipStages = options.skip
        ? options.skip.split(',').map((s: string) => s.trim() as VettingStage)
        : [];

      const onlyStages = options.only
        ? options.only.split(',').map((s: string) => s.trim() as VettingStage)
        : undefined;

      // Run vetting
      const result = await runVetting({
        bountyId: id,
        repo: bounty.repo,
        pr: bounty.pr,
        commitSha: bounty.commitSha || 'HEAD',
        baseBranch: 'main',
        stages: onlyStages,
        skipStages,
        onStageStart: (stage) => {
          spinner.text = `Running ${stage}...`;
        },
        onStageComplete: (stageResult) => {
          const icon = stageResult.status === 'passed' ? chalk.green('✓')
            : stageResult.status === 'failed' ? chalk.red('✗')
            : chalk.yellow('○');

          if (options.verbose) {
            spinner.stop();
            console.log(`${icon} ${stageResult.stage} (${stageResult.duration}ms)`);
            if (stageResult.output && options.verbose) {
              console.log(chalk.dim(stageResult.output.slice(0, 500)));
            }
            if (stageResult.error) {
              console.log(chalk.red(`  Error: ${stageResult.error}`));
            }
            spinner.start();
          }
        }
      });

      spinner.stop();
      printVettingResult(result);

      // Update bounty with vetting result
      const now = nowISO();
      await updateBounty(id, {
        status: result.status === 'passed' ? 'vetting' : 'revision',
        updatedAt: now,
        timeline: [
          ...(bounty.timeline || []),
          {
            timestamp: now,
            message: result.status === 'passed'
              ? 'Vetting passed'
              : `Vetting failed: ${result.summary.failed} stage(s)`,
            type: 'vetting'
          }
        ]
      });

      // Create proof if passed
      if (result.status === 'passed' && result.proofBundle) {
        await createProof({
          id: result.proofBundle.id,
          bountyId: id,
          sessions: [],
          recordings: [],
          screenshots: [],
          checkpoints: 0,
          linesAdded: result.summary.linesAdded,
          linesDeleted: result.summary.linesDeleted,
          filesChanged: result.summary.filesChanged,
          createdAt: now,
          vetting: {
            status: 'passed',
            stages: result.stages.length,
            passed: result.summary.passed,
            failed: result.summary.failed
          }
        });
      }

      if (result.status === 'passed') {
        console.log(chalk.green('\nVetting passed! Ready for review.'));
      } else {
        console.log(chalk.red('\nVetting failed. Please fix issues and resubmit.'));
        process.exit(1);
      }

    } catch (error) {
      spinner.fail('Vetting failed');
      console.error(error);
      process.exit(1);
    }
  });

vetCommand
  .command('status <id>')
  .description('Check vetting status for a bounty')
  .action(async (id) => {
    const spinner = ora('Loading bounty...').start();

    try {
      const bounty = await getBounty(id);
      if (!bounty) {
        spinner.fail(`Bounty not found: ${id}`);
        process.exit(1);
      }

      spinner.stop();

      console.log(chalk.bold(`\nVetting Status: ${bounty.title}\n`));
      console.log(`  Status: ${formatStatus(bounty.status)}`);
      console.log(`  Repo: ${bounty.repo || 'not set'}`);
      console.log(`  PR: ${bounty.pr ? `#${bounty.pr}` : 'not linked'}`);

      // Show vetting timeline entries
      const vettingEvents = (bounty.timeline || []).filter(e => e.type === 'vetting');
      if (vettingEvents.length > 0) {
        console.log(chalk.bold('\n  Vetting History:'));
        for (const event of vettingEvents.slice(-5)) {
          const time = new Date(event.timestamp).toLocaleString();
          console.log(`    ${chalk.dim(time)} ${event.message}`);
        }
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to check status');
      console.error(error);
      process.exit(1);
    }
  });

vetCommand
  .command('detect <path>')
  .description('Detect project type in a directory')
  .action(async (path) => {
    const { detectProject, getDefaultStages } = await import('@contribute/vetting');

    try {
      const detection = await detectProject(path);
      const stages = getDefaultStages(detection);

      console.log(chalk.bold('\nProject Detection\n'));
      console.log(`  Type: ${chalk.cyan(detection.type)}`);
      console.log(`  Package Manager: ${detection.packageManager || 'unknown'}`);
      console.log(`  Has Tests: ${detection.hasTests ? chalk.green('yes') : chalk.red('no')}`);
      console.log(`  Has Lint: ${detection.hasLint ? chalk.green('yes') : chalk.red('no')}`);
      console.log(`  Has Build: ${detection.hasBuild ? chalk.green('yes') : chalk.red('no')}`);

      if (detection.installCommand) {
        console.log(`\n  Install: ${chalk.dim(detection.installCommand)}`);
      }
      if (detection.buildCommand) {
        console.log(`  Build: ${chalk.dim(detection.buildCommand)}`);
      }
      if (detection.testCommand) {
        console.log(`  Test: ${chalk.dim(detection.testCommand)}`);
      }
      if (detection.lintCommand) {
        console.log(`  Lint: ${chalk.dim(detection.lintCommand)}`);
      }

      console.log(chalk.bold('\n  Vetting Stages:'));
      console.log(`  ${stages.join(' → ')}`);
      console.log('');

    } catch (error) {
      console.error('Detection failed:', error);
      process.exit(1);
    }
  });

function printVettingResult(result: VettingResult) {
  console.log(chalk.bold('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.bold('  VETTING REPORT'));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════\n'));

  // Overall status
  const statusIcon = result.status === 'passed' ? chalk.green('✓ PASSED')
    : result.status === 'failed' ? chalk.red('✗ FAILED')
    : chalk.yellow('○ ' + result.status.toUpperCase());

  console.log(`  Status: ${statusIcon}`);
  console.log(`  Duration: ${formatDuration(result.duration || 0)}`);
  console.log('');

  // Stage results
  console.log(chalk.bold('  Stages:'));
  for (const stage of result.stages) {
    const icon = stage.status === 'passed' ? chalk.green('✓')
      : stage.status === 'failed' ? chalk.red('✗')
      : stage.status === 'skipped' ? chalk.yellow('○')
      : chalk.blue('●');

    const duration = stage.duration ? ` (${formatDuration(stage.duration)})` : '';
    console.log(`    ${icon} ${stage.stage}${duration}`);

    if (stage.metrics) {
      const metricsStr = Object.entries(stage.metrics)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(chalk.dim(`      ${metricsStr}`));
    }

    if (stage.error) {
      console.log(chalk.red(`      ${stage.error}`));
    }
  }

  console.log('');

  // Summary
  console.log(chalk.bold('  Summary:'));
  console.log(`    Stages: ${result.summary.passed}/${result.summary.total} passed`);
  console.log(`    Changes: +${result.summary.linesAdded} -${result.summary.linesDeleted} (${result.summary.filesChanged} files)`);

  if (result.summary.testsPassed !== undefined) {
    console.log(`    Tests: ${result.summary.testsPassed} passed, ${result.summary.testsFailed} failed`);
  }
  if (result.summary.coverage !== undefined) {
    console.log(`    Coverage: ${result.summary.coverage}%`);
  }
  if (result.summary.lintErrors) {
    console.log(`    Lint: ${result.summary.lintErrors} errors, ${result.summary.lintWarnings} warnings`);
  }
  if (result.summary.securityIssues) {
    console.log(`    Security: ${result.summary.securityIssues} issues`);
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    open: chalk.green,
    claimed: chalk.yellow,
    in_progress: chalk.blue,
    submitted: chalk.cyan,
    vetting: chalk.magenta,
    completed: chalk.greenBright,
    revision: chalk.red,
    cancelled: chalk.gray
  };
  return (colors[status] || chalk.white)(status);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
