/**
 * Test Command - Run and record tests for engagements
 *
 * Executes test commands from repo profiles, captures results,
 * and stores them for evidence bundles and judge gates.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const testCommand = new Command('test')
  .description('Run and record tests for engagements');

/**
 * Run tests for an engagement
 */
testCommand
  .command('run <engagement_id>')
  .description('Run tests and record results')
  .option('-e, --env <env>', 'Environment: local or vm', 'local')
  .option('-c, --cmd <command>', 'Override test command')
  .option('--timeout <seconds>', 'Test timeout in seconds', '300')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (engagementId, options) => {
    const spinner = ora(`Running tests for ${engagementId}...`).start();

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

      // Get repo profile for test command
      const profileResult = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });
      const profile = profileResult.rows[0] as any;

      // Determine test command
      let testCmd = options.cmd;

      if (!testCmd) {
        // Try to get from rules_json
        if (profile?.rules_json) {
          try {
            const rules = JSON.parse(profile.rules_json);
            testCmd = rules.tests?.command;
          } catch {}
        }

        // Fallback to detecting from repo
        if (!testCmd) {
          testCmd = await detectTestCommand(repo);
        }
      }

      if (!testCmd) {
        spinner.fail('Could not determine test command');
        console.log(chalk.dim('Use --cmd to specify: bounty test run <id> --cmd "npm test"'));
        process.exit(1);
      }

      // Get repo path
      const repoPath = path.join(
        process.env.HOME || '~',
        '000-forked',
        owner,
        repoName
      );

      if (!fs.existsSync(repoPath)) {
        spinner.fail(`Repo not found at ${repoPath}`);
        console.log(chalk.dim('Run: bounty bootstrap ' + repo));
        process.exit(1);
      }

      spinner.text = `Running: ${testCmd}`;

      // Execute test
      const startTime = Date.now();
      let exitCode = 0;
      let output = '';
      let status = 'pass';

      try {
        if (options.env === 'vm') {
          // VM execution via SSH
          const vmHost = config.vmSshHost || process.env.VM_SSH_HOST;
          const vmRepoRoot = config.vmRepoRoot || '/home/jeremy/000-forked';

          if (!vmHost) {
            spinner.fail('VM SSH host not configured');
            console.log(chalk.dim('Set with: bounty config set vmSshHost <host>'));
            process.exit(1);
          }

          const vmPath = `${vmRepoRoot}/${owner}/${repoName}`;
          const sshCmd = `ssh ${vmHost} "cd ${vmPath} && ${testCmd}"`;

          output = execSync(sshCmd, {
            encoding: 'utf-8',
            timeout: parseInt(options.timeout) * 1000,
            maxBuffer: 10 * 1024 * 1024
          });
        } else {
          // Local execution
          output = execSync(testCmd, {
            cwd: repoPath,
            encoding: 'utf-8',
            timeout: parseInt(options.timeout) * 1000,
            maxBuffer: 10 * 1024 * 1024
          });
        }
      } catch (error: any) {
        exitCode = error.status || 1;
        output = error.stdout || error.message;
        status = 'fail';
      }

      const duration = Math.round((Date.now() - startTime) / 1000);

      // Truncate output for DB storage
      const outputExcerpt = output.split('\n').slice(-50).join('\n');

      // Save full output to file
      const logsDir = path.join(process.env.HOME || '~', '.bounty-system', 'test-logs');
      fs.mkdirSync(logsDir, { recursive: true });
      const logFile = path.join(logsDir, `${engagementId}-${Date.now()}.log`);
      fs.writeFileSync(logFile, output);

      // Store in DB
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO test_runs
              (engagement_id, command, env, status, exit_code, duration_seconds, output_excerpt, full_output_path, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [engagementId, testCmd, options.env, status, exitCode, duration, outputExcerpt, logFile, now]
      });

      // Get the test run ID
      const runIdResult = await db.execute({
        sql: 'SELECT id FROM test_runs WHERE engagement_id = ? ORDER BY id DESC LIMIT 1',
        args: [engagementId]
      });
      const runId = (runIdResult.rows[0] as any)?.id;

      // Update engagement_metrics
      await db.execute({
        sql: `UPDATE engagement_metrics SET last_test_run_id = ? WHERE engagement_id = ?`,
        args: [runId, engagementId]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('engagement', ?, 'test_run', ?, ?)`,
        args: [engagementId, now, JSON.stringify({ status, duration, command: testCmd, env: options.env })]
      });

      if (status === 'pass') {
        spinner.succeed(`Tests passed in ${duration}s`);
      } else {
        spinner.fail(`Tests failed (exit code ${exitCode})`);
      }

      console.log(chalk.bold(`\nTest Run: ${engagementId}\n`));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Command: ${testCmd}`);
      console.log(`  Environment: ${options.env}`);
      console.log(`  Status: ${status === 'pass' ? chalk.green('PASS') : chalk.red('FAIL')}`);
      console.log(`  Exit Code: ${exitCode}`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  Full Log: ${logFile}`);
      console.log(chalk.dim('─'.repeat(50)));

      // Show last 10 lines
      console.log(chalk.bold('\nOutput (last 10 lines):'));
      const lastLines = output.split('\n').slice(-10);
      for (const line of lastLines) {
        console.log(chalk.dim(`  ${line}`));
      }

      // Slack notification
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_qualified',
          content: formatTestForSlack(engagementId, testCmd, status, duration, exitCode)
        } as SlackMessage);
      }

      console.log('');

      if (status === 'fail') {
        process.exit(1);
      }

    } catch (error) {
      spinner.fail('Failed to run tests');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show test history for an engagement
 */
testCommand
  .command('history <engagement_id>')
  .description('Show test history for an engagement')
  .action(async (engagementId) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM test_runs WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 10',
        args: [engagementId]
      });

      if (result.rows.length === 0) {
        console.log(chalk.dim(`\nNo test runs for ${engagementId}`));
        console.log(chalk.dim('Run: bounty test run ' + engagementId));
        return;
      }

      console.log(chalk.bold(`\nTest History: ${engagementId}\n`));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        padRight('ID', 8) +
        padRight('Status', 10) +
        padRight('Duration', 12) +
        padRight('Env', 8) +
        'Timestamp'
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const row of result.rows) {
        const run = row as any;
        const statusColor = run.status === 'pass' ? chalk.green : chalk.red;
        console.log(
          padRight(String(run.id), 8) +
          padRight(statusColor(run.status), 10) +
          padRight(`${run.duration_seconds}s`, 12) +
          padRight(run.env, 8) +
          run.created_at
        );
      }

      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.dim(`\n${result.rows.length} run(s)`));
      console.log('');

    } catch (error) {
      console.error('Failed to show test history:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show last test output
 */
testCommand
  .command('log <engagement_id>')
  .description('Show full output from last test run')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(async (engagementId, options) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM test_runs WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [engagementId]
      });

      if (result.rows.length === 0) {
        console.log(chalk.dim(`\nNo test runs for ${engagementId}`));
        return;
      }

      const run = result.rows[0] as any;

      if (run.full_output_path && fs.existsSync(run.full_output_path)) {
        const content = fs.readFileSync(run.full_output_path, 'utf-8');
        const lines = content.split('\n');
        const numLines = parseInt(options.lines);
        const toShow = lines.slice(-numLines);

        console.log(chalk.bold(`\nTest Log: ${engagementId}`));
        console.log(chalk.dim(`File: ${run.full_output_path}`));
        console.log(chalk.dim('─'.repeat(50)));

        for (const line of toShow) {
          console.log(line);
        }

        if (lines.length > numLines) {
          console.log(chalk.dim(`\n... (${lines.length - numLines} more lines, use -n to show more)`));
        }
      } else {
        console.log(chalk.bold(`\nTest Output Excerpt: ${engagementId}\n`));
        console.log(run.output_excerpt || 'No output captured');
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show test log:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

async function detectTestCommand(repo: string): Promise<string | null> {
  const [owner, repoName] = repo.split('/');
  const repoPath = path.join(
    process.env.HOME || '~',
    '000-forked',
    owner,
    repoName
  );

  if (!fs.existsSync(repoPath)) {
    return null;
  }

  // Check for package.json (Node)
  const packageJson = path.join(repoPath, 'package.json');
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
      if (pkg.scripts?.test) {
        // Detect package manager
        if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) {
          return 'pnpm test';
        } else if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) {
          return 'yarn test';
        } else {
          return 'npm test';
        }
      }
    } catch {}
  }

  // Check for pytest (Python)
  if (fs.existsSync(path.join(repoPath, 'pytest.ini')) ||
      fs.existsSync(path.join(repoPath, 'pyproject.toml')) ||
      fs.existsSync(path.join(repoPath, 'tests'))) {
    return 'pytest';
  }

  // Check for Cargo.toml (Rust)
  if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) {
    return 'cargo test';
  }

  // Check for go.mod (Go)
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
    return 'go test ./...';
  }

  return null;
}

function formatTestForSlack(
  engagementId: string,
  command: string,
  status: string,
  duration: number,
  exitCode: number
): string {
  const emoji = status === 'pass' ? '✅' : '❌';
  return `${emoji} *TEST RUN: ${status.toUpperCase()}*

*Engagement:* ${engagementId}
*Command:* \`${command}\`
*Duration:* ${duration}s
*Exit Code:* ${exitCode}

${status === 'pass'
  ? 'Next: `bounty judge run ' + engagementId + '`'
  : 'Fix tests and run again: `bounty test run ' + engagementId + '`'}`;
}

function padRight(s: string, len: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}
