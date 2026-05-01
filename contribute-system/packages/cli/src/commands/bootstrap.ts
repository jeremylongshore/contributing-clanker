/**
 * Bootstrap Command - Clone, Install, and Test a Repo
 *
 * Measures Time to First Test Green (TTFTG) and stores in repo_metrics.
 * Workspace: ~/000-forked/<owner>/<repo>/
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

// Workspace root
const FORKED_ROOT = join(homedir(), '000-forked');

interface BootstrapResult {
  cloneDurationMs: number;
  installDurationMs: number;
  testDurationMs: number;
  ttfgMinutes: number;
  testsPassed: boolean;
  testOutput: string;
  errors: string[];
}

interface PackageManager {
  name: string;
  installCmd: string;
  testCmd: string;
  lockfile: string;
}

const PACKAGE_MANAGERS: Record<string, PackageManager> = {
  pnpm: {
    name: 'pnpm',
    installCmd: 'pnpm install',
    testCmd: 'pnpm test',
    lockfile: 'pnpm-lock.yaml'
  },
  yarn: {
    name: 'yarn',
    installCmd: 'yarn install',
    testCmd: 'yarn test',
    lockfile: 'yarn.lock'
  },
  npm: {
    name: 'npm',
    installCmd: 'npm install',
    testCmd: 'npm test',
    lockfile: 'package-lock.json'
  },
  bun: {
    name: 'bun',
    installCmd: 'bun install',
    testCmd: 'bun test',
    lockfile: 'bun.lockb'
  },
  cargo: {
    name: 'cargo',
    installCmd: 'cargo build',
    testCmd: 'cargo test',
    lockfile: 'Cargo.lock'
  },
  go: {
    name: 'go',
    installCmd: 'go mod download',
    testCmd: 'go test ./...',
    lockfile: 'go.sum'
  },
  pip: {
    name: 'pip',
    installCmd: 'pip install -e .',
    testCmd: 'pytest',
    lockfile: 'requirements.txt'
  },
  poetry: {
    name: 'poetry',
    installCmd: 'poetry install',
    testCmd: 'poetry run pytest',
    lockfile: 'poetry.lock'
  },
  uv: {
    name: 'uv',
    installCmd: 'uv sync',
    testCmd: 'uv run pytest',
    lockfile: 'uv.lock'
  }
};

export const bootstrapCommand = new Command('bootstrap')
  .description('Clone, install, and test a repo (measures TTFTG)')
  .argument('<repo>', 'Repository (owner/repo)')
  .option('-r, --ref <ref>', 'Git ref to checkout (branch/tag/commit)')
  .option('--skip-test', 'Skip running tests')
  .option('--fresh', 'Delete existing clone and start fresh')
  .option('--no-slack', 'Skip Slack notification')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (repo: string, options) => {
    const spinner = ora('Preparing bootstrap...').start();

    try {
      // Validate repo format
      if (!repo.includes('/')) {
        spinner.fail('Invalid repo format. Use owner/repo');
        process.exit(1);
      }

      const [owner, repoName] = repo.split('/');
      const repoPath = join(FORKED_ROOT, owner, repoName);
      const db = getDb();
      const config = await getConfig();
      const now = new Date();

      // Ensure workspace exists
      mkdirSync(join(FORKED_ROOT, owner), { recursive: true });

      // Handle fresh flag
      if (options.fresh && existsSync(repoPath)) {
        spinner.text = 'Removing existing clone...';
        execSync(`rm -rf "${repoPath}"`, { stdio: 'pipe' });
      }

      const result: BootstrapResult = {
        cloneDurationMs: 0,
        installDurationMs: 0,
        testDurationMs: 0,
        ttfgMinutes: 0,
        testsPassed: false,
        testOutput: '',
        errors: []
      };

      // Clone if needed
      if (!existsSync(repoPath)) {
        spinner.text = `Cloning ${repo}...`;
        const cloneStart = Date.now();

        try {
          execSync(`git clone --depth 1 https://github.com/${repo}.git "${repoPath}"`, {
            stdio: 'pipe',
            timeout: 300000 // 5 minutes
          });
          result.cloneDurationMs = Date.now() - cloneStart;
        } catch (error) {
          result.errors.push(`Clone failed: ${error instanceof Error ? error.message : String(error)}`);
          spinner.fail('Clone failed');
          console.error(result.errors[0]);
          process.exit(1);
        }
      } else {
        spinner.text = 'Repository exists, pulling latest...';
        try {
          execSync('git pull', { cwd: repoPath, stdio: 'pipe', timeout: 60000 });
        } catch {
          // Pull may fail on detached HEAD, continue anyway
        }
      }

      // Checkout ref if specified
      if (options.ref) {
        spinner.text = `Checking out ${options.ref}...`;
        try {
          execSync(`git checkout ${options.ref}`, { cwd: repoPath, stdio: 'pipe' });
        } catch (error) {
          result.errors.push(`Checkout failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Detect package manager
      spinner.text = 'Detecting package manager...';
      const pm = detectPackageManager(repoPath);

      if (!pm) {
        spinner.warn('Could not detect package manager');
        result.errors.push('No recognized package manager found');
      } else {
        spinner.succeed(`Detected: ${pm.name}`);

        // Install dependencies
        spinner.start(`Installing dependencies (${pm.name})...`);
        const installStart = Date.now();

        try {
          execSync(pm.installCmd, {
            cwd: repoPath,
            stdio: options.verbose ? 'inherit' : 'pipe',
            timeout: 600000 // 10 minutes
          });
          result.installDurationMs = Date.now() - installStart;
          spinner.succeed(`Dependencies installed in ${(result.installDurationMs / 1000).toFixed(1)}s`);
        } catch (error) {
          result.installDurationMs = Date.now() - installStart;
          result.errors.push(`Install failed: ${error instanceof Error ? error.message : String(error)}`);
          spinner.fail('Install failed');
        }

        // Run tests if not skipped
        if (!options.skipTest && result.errors.length === 0) {
          spinner.start(`Running tests (${pm.testCmd})...`);
          const testStart = Date.now();

          try {
            const output = execSync(pm.testCmd, {
              cwd: repoPath,
              timeout: 600000, // 10 minutes
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe']
            });
            result.testDurationMs = Date.now() - testStart;
            result.testsPassed = true;
            result.testOutput = output.slice(-2000); // Last 2000 chars
            spinner.succeed(`Tests passed in ${(result.testDurationMs / 1000).toFixed(1)}s`);
          } catch (error: any) {
            result.testDurationMs = Date.now() - testStart;
            result.testsPassed = false;
            result.testOutput = error.stdout?.slice(-2000) || error.message;
            result.errors.push('Tests failed');
            spinner.warn(`Tests failed in ${(result.testDurationMs / 1000).toFixed(1)}s`);
          }
        }
      }

      // Calculate TTFTG
      result.ttfgMinutes = Math.round(
        (result.cloneDurationMs + result.installDurationMs + result.testDurationMs) / 60000
      );

      // Store in database
      await db.execute({
        sql: `INSERT INTO repos (repo, last_seen_at, created_at, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(repo) DO UPDATE SET last_seen_at = ?, updated_at = ?`,
        args: [repo, now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString()]
      });

      // Get existing metrics for p50/p90 calculation
      const existingMetrics = await db.execute({
        sql: 'SELECT * FROM repo_metrics WHERE repo = ?',
        args: [repo]
      });

      // Store metrics
      const ttfgP50 = result.ttfgMinutes; // Will be improved with more data points
      const ttfgP90 = Math.round(result.ttfgMinutes * 1.5);

      await db.execute({
        sql: `INSERT INTO repo_metrics (repo, ttfg_last_minutes, ttfg_p50_minutes, ttfg_p90_minutes, last_bootstrap_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(repo) DO UPDATE SET
                ttfg_last_minutes = ?,
                ttfg_p50_minutes = ?,
                ttfg_p90_minutes = ?,
                last_bootstrap_at = ?,
                updated_at = ?`,
        args: [
          repo, result.ttfgMinutes, ttfgP50, ttfgP90, now.toISOString(), now.toISOString(),
          result.ttfgMinutes, ttfgP50, ttfgP90, now.toISOString(), now.toISOString()
        ]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('repo', ?, 'bootstrapped', ?, ?)`,
        args: [repo, now.toISOString(), JSON.stringify({
          ttfgMinutes: result.ttfgMinutes,
          testsPassed: result.testsPassed,
          packageManager: pm?.name,
          errors: result.errors.length
        })]
      });

      // Print summary
      console.log(chalk.bold('\nBOOTSTRAP SUMMARY'));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Repo: ${chalk.cyan(repo)}`);
      console.log(`  Path: ${chalk.dim(repoPath)}`);
      console.log(`  Package Manager: ${pm?.name || 'unknown'}`);
      console.log(`  Clone: ${formatDuration(result.cloneDurationMs)}`);
      console.log(`  Install: ${formatDuration(result.installDurationMs)}`);
      console.log(`  Test: ${formatDuration(result.testDurationMs)}`);
      console.log(`  TTFTG: ${chalk.bold(result.ttfgMinutes + ' min')}`);
      console.log(`  Tests: ${result.testsPassed ? chalk.green('PASSED') : chalk.red('FAILED')}`);

      if (result.errors.length > 0) {
        console.log(chalk.bold('\n  Errors:'));
        for (const err of result.errors) {
          console.log(chalk.red(`    - ${err}`));
        }
      }

      // Notify Slack
      if (options.slack !== false) {
        const statusEmoji = result.testsPassed ? ':white_check_mark:' : ':x:';
        const slackContent = `*BOOTSTRAP COMPLETE*\n\n*Repo:* ${repo}\n*TTFTG:* ${result.ttfgMinutes} min\n*Tests:* ${statusEmoji} ${result.testsPassed ? 'Passed' : 'Failed'}\n*Package Manager:* ${pm?.name || 'unknown'}\n\nPath: \`${repoPath}\``;

        await sendSlackNotification({
          type: 'bounty_qualified',
          content: slackContent
        } as SlackMessage);
      }

      console.log(chalk.bold('\nNext step:'));
      console.log(chalk.cyan(`  cd ${repoPath}`));
      console.log('');

    } catch (error) {
      spinner.fail('Bootstrap failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * TTFTG Command - Show Time to First Test Green stats
 */
export const ttfgCommand = new Command('ttfg')
  .description('Show TTFTG (Time to First Test Green) stats for a repo')
  .argument('<repo>', 'Repository (owner/repo)')
  .action(async (repo) => {
    try {
      const db = getDb();

      const result = await db.execute({
        sql: 'SELECT * FROM repo_metrics WHERE repo = ?',
        args: [repo]
      });

      if (result.rows.length === 0) {
        console.log(chalk.yellow(`\nNo TTFTG data for ${repo}`));
        console.log(chalk.dim(`Run: bounty bootstrap ${repo}`));
        return;
      }

      const metrics = result.rows[0] as unknown as {
        ttfg_last_minutes: number;
        ttfg_p50_minutes: number;
        ttfg_p90_minutes: number;
        ci_flake_rate: number | null;
        last_bootstrap_at: string;
      };

      console.log(chalk.bold(`\nTTFTG: ${repo}\n`));
      console.log(`  Last:  ${metrics.ttfg_last_minutes} min`);
      console.log(`  P50:   ${metrics.ttfg_p50_minutes} min`);
      console.log(`  P90:   ${metrics.ttfg_p90_minutes} min`);

      if (metrics.ci_flake_rate !== null) {
        console.log(`  CI Flake Rate: ${(metrics.ci_flake_rate * 100).toFixed(1)}%`);
      }

      console.log(`  Last Bootstrap: ${metrics.last_bootstrap_at}`);

      // Show path
      const [owner, repoName] = repo.split('/');
      const repoPath = join(FORKED_ROOT, owner, repoName);
      if (existsSync(repoPath)) {
        console.log(chalk.dim(`\n  Path: ${repoPath}`));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to get TTFTG:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectPackageManager(repoPath: string): PackageManager | null {
  const files = readdirSync(repoPath);

  // Check in priority order
  if (files.includes('pnpm-lock.yaml')) return PACKAGE_MANAGERS.pnpm;
  if (files.includes('bun.lockb')) return PACKAGE_MANAGERS.bun;
  if (files.includes('yarn.lock')) return PACKAGE_MANAGERS.yarn;
  if (files.includes('package-lock.json')) return PACKAGE_MANAGERS.npm;
  if (files.includes('Cargo.toml')) return PACKAGE_MANAGERS.cargo;
  if (files.includes('go.mod')) return PACKAGE_MANAGERS.go;
  if (files.includes('uv.lock')) return PACKAGE_MANAGERS.uv;
  if (files.includes('poetry.lock')) return PACKAGE_MANAGERS.poetry;
  if (files.includes('requirements.txt') || files.includes('setup.py') || files.includes('pyproject.toml')) {
    return PACKAGE_MANAGERS.pip;
  }
  if (files.includes('package.json')) return PACKAGE_MANAGERS.npm;

  return null;
}

function formatDuration(ms: number): string {
  if (ms === 0) return chalk.dim('skipped');
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
