/**
 * Environment Command - Detect and manage execution environments
 *
 * Determines whether repos should run locally or on VM based on:
 * - docker-compose.yml presence
 * - kubernetes/k8s directories
 * - Heavy build systems (bazel, pants)
 * - Previous bootstrap failures
 * - Repo size
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const envCommand = new Command('env')
  .description('Manage execution environments (local vs VM)');

interface EnvDetectionResult {
  recommended: 'local' | 'vm';
  confidence: number;
  reasons: string[];
  signals: EnvSignal[];
}

interface EnvSignal {
  name: string;
  detected: boolean;
  weight: number;
  reason: string;
}

/**
 * Detect recommended environment for a repo
 */
envCommand
  .command('detect <repo>')
  .description('Detect recommended environment for a repo')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (repo, options) => {
    const spinner = ora(`Detecting environment for ${repo}...`).start();

    try {
      const db = getDb();
      const config = await getConfig();
      const [owner, repoName] = repo.split('/');

      // Get repo path
      const repoPath = path.join(
        process.env.HOME || '~',
        '000-forked',
        owner,
        repoName
      );

      if (!fs.existsSync(repoPath)) {
        spinner.warn(`Repo not found at ${repoPath}`);
        console.log(chalk.dim('Run: bounty bootstrap ' + repo));

        // Still check DB for any stored preference
        const profileResult = await db.execute({
          sql: 'SELECT preferred_env, env_reasons_json FROM repo_profiles WHERE repo = ?',
          args: [repo]
        });

        if (profileResult.rows.length > 0) {
          const profile = profileResult.rows[0] as any;
          if (profile.preferred_env) {
            console.log(chalk.dim(`\nStored preference: ${profile.preferred_env}`));
          }
        }

        closeDb();
        return;
      }

      // Run detection
      const result = detectEnvironment(repoPath, repo);

      // Store in DB
      const now = new Date().toISOString();

      // Ensure repo_profiles entry exists
      await db.execute({
        sql: `INSERT OR IGNORE INTO repo_profiles (repo, created_at, updated_at)
              VALUES (?, ?, ?)`,
        args: [repo, now, now]
      });

      // Update with env detection
      await db.execute({
        sql: `UPDATE repo_profiles
              SET preferred_env = ?, env_reasons_json = ?, last_env_check_at = ?, updated_at = ?
              WHERE repo = ?`,
        args: [result.recommended, JSON.stringify(result.reasons), now, now, repo]
      });

      // Log event
      await db.execute({
        sql: `INSERT INTO events (entity_type, entity_id, type, ts, payload_json)
              VALUES ('repo', ?, 'env_detected', ?, ?)`,
        args: [repo, now, JSON.stringify(result)]
      });

      spinner.succeed(`Environment detected: ${result.recommended}`);

      // Display results
      console.log(chalk.bold(`\nEnvironment Detection: ${repo}\n`));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`  Recommended: ${result.recommended === 'vm' ? chalk.yellow('VM') : chalk.green('LOCAL')}`);
      console.log(`  Confidence: ${Math.round(result.confidence * 100)}%`);
      console.log('');
      console.log(chalk.bold('  Signals:'));

      for (const signal of result.signals) {
        const icon = signal.detected
          ? (signal.weight > 0 ? chalk.yellow('⚠') : chalk.green('✓'))
          : chalk.dim('○');
        if (signal.detected) {
          console.log(`    ${icon} ${signal.name}: ${signal.reason}`);
        }
      }

      console.log('');
      console.log(chalk.bold('  Reasons:'));
      for (const reason of result.reasons) {
        console.log(`    • ${reason}`);
      }

      console.log('\n' + chalk.dim('─'.repeat(50)));

      // Show next steps
      if (result.recommended === 'vm') {
        console.log(chalk.yellow('\nVM execution recommended.'));
        console.log(chalk.dim('Configure VM: bounty config set vmSshHost <host>'));
        console.log(chalk.dim('Run: bounty bootstrap ' + repo + ' --env vm'));
      } else {
        console.log(chalk.green('\nLocal execution should work.'));
        console.log(chalk.dim('Run: bounty bootstrap ' + repo));
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to detect environment');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show environment status
 */
envCommand
  .command('status')
  .description('Show VM configuration status')
  .action(async () => {
    try {
      const config = await getConfig();

      console.log(chalk.bold('\nEnvironment Configuration\n'));
      console.log(chalk.dim('─'.repeat(50)));

      console.log(`  VM Enabled: ${config.vmEnabled ? chalk.green('Yes') : chalk.dim('No')}`);
      console.log(`  SSH Host: ${config.vmSshHost || chalk.dim('not set')}`);
      console.log(`  Repo Root: ${config.vmRepoRoot || chalk.dim('not set')}`);
      console.log(`  Auto Escalate: ${config.vmAutoEscalate ? chalk.yellow('Yes') : chalk.dim('No')}`);

      console.log('\n' + chalk.dim('─'.repeat(50)));

      if (!config.vmSshHost) {
        console.log(chalk.yellow('\nVM not configured.'));
        console.log(chalk.dim('Set with:'));
        console.log(chalk.dim('  bounty config set vmSshHost <user@host>'));
        console.log(chalk.dim('  bounty config set vmRepoRoot /home/user/000-forked'));
        console.log(chalk.dim('  bounty config set vmEnabled true'));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show environment status:', error);
      process.exit(1);
    }
  });

/**
 * List repos with environment preferences
 */
envCommand
  .command('list')
  .description('List repos with environment preferences')
  .option('--vm', 'Only show repos needing VM')
  .action(async (options) => {
    try {
      const db = getDb();

      let sql = 'SELECT repo, preferred_env, last_env_check_at FROM repo_profiles WHERE last_env_check_at IS NOT NULL';
      if (options.vm) {
        sql += " AND preferred_env = 'vm'";
      }
      sql += ' ORDER BY repo';

      const result = await db.execute(sql);

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo repos with environment detection'));
        console.log(chalk.dim('Run: bounty env detect <repo>'));
        closeDb();
        return;
      }

      console.log(chalk.bold('\nRepo Environments\n'));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(
        padRight('Repo', 35) +
        padRight('Env', 10) +
        'Last Check'
      );
      console.log(chalk.dim('─'.repeat(60)));

      for (const row of result.rows) {
        const r = row as any;
        const envColor = r.preferred_env === 'vm' ? chalk.yellow : chalk.green;
        console.log(
          padRight(r.repo, 35) +
          padRight(envColor(r.preferred_env || 'unknown'), 10) +
          (r.last_env_check_at || 'never')
        );
      }

      console.log(chalk.dim('─'.repeat(60)));
      console.log(chalk.dim(`\n${result.rows.length} repo(s)`));
      console.log('');

    } catch (error) {
      console.error('Failed to list environments:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Detection logic
// ─────────────────────────────────────────────────────────────────────────────

function detectEnvironment(repoPath: string, repo: string): EnvDetectionResult {
  const signals: EnvSignal[] = [];
  let vmScore = 0;
  let localScore = 0;

  // 1. Docker Compose detection
  const dockerCompose = fs.existsSync(path.join(repoPath, 'docker-compose.yml')) ||
                        fs.existsSync(path.join(repoPath, 'docker-compose.yaml'));
  signals.push({
    name: 'docker-compose',
    detected: dockerCompose,
    weight: 30,
    reason: 'docker-compose.yml requires running containers'
  });
  if (dockerCompose) vmScore += 30;

  // 2. Check docker-compose service count
  if (dockerCompose) {
    try {
      const composeContent = fs.readFileSync(
        fs.existsSync(path.join(repoPath, 'docker-compose.yml'))
          ? path.join(repoPath, 'docker-compose.yml')
          : path.join(repoPath, 'docker-compose.yaml'),
        'utf-8'
      );
      const serviceMatches = composeContent.match(/^\s+\w+:/gm);
      const serviceCount = serviceMatches ? serviceMatches.length : 0;
      if (serviceCount > 5) {
        signals.push({
          name: 'many-services',
          detected: true,
          weight: 20,
          reason: `${serviceCount} services in docker-compose`
        });
        vmScore += 20;
      }
    } catch {}
  }

  // 3. Kubernetes/k8s directories
  const k8sDirs = ['kubernetes', 'k8s', 'charts', 'helm', 'tilt'];
  const hasK8s = k8sDirs.some(dir => fs.existsSync(path.join(repoPath, dir)));
  signals.push({
    name: 'kubernetes',
    detected: hasK8s,
    weight: 25,
    reason: 'Kubernetes manifests require cluster'
  });
  if (hasK8s) vmScore += 25;

  // 4. Heavy build systems
  const heavyBuilds = ['BUILD.bazel', 'BUILD', 'WORKSPACE', 'pants.toml', 'pants.ini'];
  const hasHeavyBuild = heavyBuilds.some(f => fs.existsSync(path.join(repoPath, f)));
  signals.push({
    name: 'heavy-build',
    detected: hasHeavyBuild,
    weight: 20,
    reason: 'Bazel/Pants requires significant resources'
  });
  if (hasHeavyBuild) vmScore += 20;

  // 5. Nix flakes
  const hasNix = fs.existsSync(path.join(repoPath, 'flake.nix'));
  signals.push({
    name: 'nix-flakes',
    detected: hasNix,
    weight: 15,
    reason: 'Nix flakes often need specific environment'
  });
  if (hasNix) vmScore += 15;

  // 6. Large repo (check .git size or file count)
  try {
    const gitDir = path.join(repoPath, '.git');
    if (fs.existsSync(gitDir)) {
      const stats = fs.statSync(gitDir);
      // If .git is a file (worktree), check differently
    }
  } catch {}

  // 7. Standard local signals (positive for local)
  const simplePackageJson = fs.existsSync(path.join(repoPath, 'package.json')) && !dockerCompose;
  const simpleCargo = fs.existsSync(path.join(repoPath, 'Cargo.toml')) && !dockerCompose;
  const simplePython = (fs.existsSync(path.join(repoPath, 'requirements.txt')) ||
                       fs.existsSync(path.join(repoPath, 'pyproject.toml'))) && !dockerCompose;

  if (simplePackageJson || simpleCargo || simplePython) {
    signals.push({
      name: 'simple-project',
      detected: true,
      weight: -20,
      reason: 'Standard project structure, local-friendly'
    });
    localScore += 20;
  }

  // Calculate final recommendation
  const totalScore = vmScore - localScore;
  const recommended: 'local' | 'vm' = totalScore > 30 ? 'vm' : 'local';
  const confidence = Math.min(0.95, 0.5 + Math.abs(totalScore) / 100);

  // Build reasons
  const reasons: string[] = [];
  if (dockerCompose) reasons.push('docker-compose.yml requires running containers');
  if (hasK8s) reasons.push('Kubernetes manifests detected');
  if (hasHeavyBuild) reasons.push('Heavy build system (Bazel/Pants) detected');
  if (hasNix) reasons.push('Nix flakes may need specific environment');

  if (recommended === 'local' && reasons.length === 0) {
    reasons.push('Standard project structure');
    reasons.push('No heavy infrastructure requirements');
  }

  return {
    recommended,
    confidence,
    reasons,
    signals
  };
}

function padRight(s: string, len: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, len - stripped.length));
}
