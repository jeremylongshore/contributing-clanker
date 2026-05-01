/**
 * Seed Command - GitHub-only Bounty Discovery & Baseline Preload
 *
 * Pre-populates the local libSQL DB with:
 * - repos that repeatedly show "bounty-like" issues
 * - maintainers + merge velocity clues
 * - environment difficulty signals (local vs VM/Docker)
 * - baseline query pack that produces signal
 *
 * Subcommands:
 * - repos: Run query pack against GitHub
 * - hydrate: Enrich top repos with rules/style/labels
 * - env-probe: Check environment requirements
 * - report: Generate analysis report
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync, spawn } from 'child_process';
import { getDb, closeDb } from '../lib/db';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';
import { QUERY_PACK, type SeedQuery, getQueryCounts } from '../seed/query-pack';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface GhIssueResult {
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  labels: { name: string }[];
  repository: { nameWithOwner: string; stargazersCount?: number };
  createdAt: string;
  updatedAt: string;
}

interface GhCodeResult {
  path: string;
  repository: { nameWithOwner: string; stargazersCount?: number };
}

interface GhRepoResult {
  name: string;
  owner: { login: string };
  url: string;
  stargazersCount: number;
  forksCount: number;
  language: string;
  description: string;
}

interface RepoAggregation {
  repo: string;
  stars: number;
  forks: number;
  language: string;
  bountyIssueCount: number;
  payoutHintCount: number;
  signals: string[];
  issueUrls: string[];
}

interface SeedRunStats {
  queriesExecuted: number;
  totalResults: number;
  uniqueRepos: number;
  uniqueIssues: number;
  rateLimitHits: number;
  errors: string[];
  queryResults: { queryId: string; category: string; count: number; uniqueRepos: number }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Command
// ═══════════════════════════════════════════════════════════════════════════

export const seedCommand = new Command('seed')
  .description('GitHub-only bounty discovery and baseline preload');

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: repos
// ═══════════════════════════════════════════════════════════════════════════

seedCommand
  .command('repos')
  .description('Run query pack against GitHub to discover bounty repos')
  .option('--top <n>', 'Stop after finding N unique repos', '500')
  .option('--per-query <n>', 'Results per query', '100')
  .option('--since-days <d>', 'Bias toward repos with activity in last D days', '90')
  .option('--save', 'Persist results to DB (default true)', true)
  .option('--no-save', 'Dry run - do not persist')
  .option('--no-slack', 'Skip Slack notification')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const spinner = ora('Initializing seed discovery...').start();

    try {
      const db = getDb();
      const now = new Date();
      const stats: SeedRunStats = {
        queriesExecuted: 0,
        totalResults: 0,
        uniqueRepos: 0,
        uniqueIssues: 0,
        rateLimitHits: 0,
        errors: [],
        queryResults: [],
      };

      // Track unique repos and issues
      const repoMap = new Map<string, RepoAggregation>();
      const issueUrls = new Set<string>();

      // Create seed run record
      let seedRunId: number | bigint = 0;
      if (options.save) {
        const runResult = await db.execute({
          sql: `INSERT INTO seed_runs (started_at, status, config_json)
                VALUES (?, 'running', ?)`,
          args: [now.toISOString(), JSON.stringify({
            top: options.top,
            perQuery: options.perQuery,
            sinceDays: options.sinceDays,
          })]
        });
        seedRunId = runResult.lastInsertRowid!;
      }

      const queryCounts = getQueryCounts();
      spinner.succeed(`Query pack: ${queryCounts.total} queries (${queryCounts.keyword} keyword, ${queryCounts.label} label, ${queryCounts.meta} meta)`);

      // Run each query
      for (const query of QUERY_PACK) {
        const querySpinner = ora(`[${query.id}] ${query.description}...`).start();

        try {
          const result = await executeQuery(query, parseInt(options.perQuery, 10), options.verbose);

          stats.queriesExecuted++;
          stats.totalResults += result.totalCount;

          // Aggregate results
          const queryRepos = new Set<string>();
          for (const item of result.items) {
            if (query.apiType === 'issues') {
              const issue = item as GhIssueResult;
              const repo = issue.repository.nameWithOwner;
              queryRepos.add(repo);

              if (!issueUrls.has(issue.url)) {
                issueUrls.add(issue.url);
                stats.uniqueIssues++;
              }

              // Aggregate repo data
              if (!repoMap.has(repo)) {
                repoMap.set(repo, {
                  repo,
                  stars: issue.repository.stargazersCount || 0,
                  forks: 0,
                  language: '',
                  bountyIssueCount: 0,
                  payoutHintCount: 0,
                  signals: [],
                  issueUrls: [],
                });
              }
              const agg = repoMap.get(repo)!;
              agg.bountyIssueCount++;
              agg.issueUrls.push(issue.url);
              if (!agg.signals.includes(query.id)) {
                agg.signals.push(query.id);
              }

              // Detect payout hints
              const payoutMatch = detectPayout(issue.title + ' ' + (issue.body || ''));
              if (payoutMatch) {
                agg.payoutHintCount++;
              }
            } else if (query.apiType === 'code') {
              const code = item as GhCodeResult;
              const repo = code.repository.nameWithOwner;
              queryRepos.add(repo);

              if (!repoMap.has(repo)) {
                repoMap.set(repo, {
                  repo,
                  stars: code.repository.stargazersCount || 0,
                  forks: 0,
                  language: '',
                  bountyIssueCount: 0,
                  payoutHintCount: 0,
                  signals: [],
                  issueUrls: [],
                });
              }
              const agg = repoMap.get(repo)!;
              if (!agg.signals.includes(query.id)) {
                agg.signals.push(query.id);
              }
            }
          }

          stats.queryResults.push({
            queryId: query.id,
            category: query.category,
            count: result.totalCount,
            uniqueRepos: queryRepos.size,
          });

          if (result.rateLimited) {
            stats.rateLimitHits++;
            querySpinner.warn(`[${query.id}] Rate limited after ${result.totalCount} results`);
          } else {
            querySpinner.succeed(`[${query.id}] ${result.totalCount} results, ${queryRepos.size} repos`);
          }

          // Save query result
          if (options.save && seedRunId) {
            await db.execute({
              sql: `INSERT INTO seed_query_results
                    (seed_run_id, query_id, query_category, results_count, unique_repos_found, rate_limited)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              args: [seedRunId, query.id, query.category, result.totalCount, queryRepos.size, result.rateLimited ? 1 : 0]
            });
          }

          // Check if we've hit our target
          if (repoMap.size >= parseInt(options.top, 10)) {
            console.log(chalk.yellow(`\nReached target of ${options.top} repos, stopping early`));
            break;
          }

          // Rate limit backoff
          await sleep(1000); // 1s between queries

        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          stats.errors.push(`${query.id}: ${errMsg}`);
          querySpinner.fail(`[${query.id}] Error: ${errMsg}`);

          if (options.save && seedRunId) {
            await db.execute({
              sql: `INSERT INTO seed_query_results
                    (seed_run_id, query_id, query_category, results_count, error_text)
                    VALUES (?, ?, ?, 0, ?)`,
              args: [seedRunId, query.id, query.category, errMsg]
            });
          }
        }
      }

      stats.uniqueRepos = repoMap.size;

      // Fetch additional repo metadata for top repos
      const reposSpinner = ora('Fetching repo metadata...').start();
      const repos = Array.from(repoMap.values())
        .sort((a, b) => b.bountyIssueCount - a.bountyIssueCount)
        .slice(0, 100);

      for (const repo of repos) {
        try {
          const metadata = await fetchRepoMetadata(repo.repo);
          repo.stars = metadata.stars;
          repo.forks = metadata.forks;
          repo.language = metadata.language;
        } catch {
          // Skip metadata fetch errors
        }
      }
      reposSpinner.succeed(`Fetched metadata for ${repos.length} repos`);

      // Compute seed scores
      const scoredRepos = repos.map(r => ({
        ...r,
        seedScore: computeSeedScore(r),
      }));

      // Save to DB
      if (options.save) {
        const saveSpinner = ora('Saving to database...').start();

        for (const repo of scoredRepos) {
          await ensureRepo(db, repo);

          // Save issues
          for (const issueUrl of repo.issueUrls.slice(0, 50)) { // Cap at 50 per repo
            await ensureIssue(db, repo.repo, issueUrl);
          }

          // Save signals
          for (const signal of repo.signals) {
            await db.execute({
              sql: `INSERT OR REPLACE INTO repo_signals (repo, signal_type, observed_at, source_url)
                    VALUES (?, ?, ?, ?)`,
              args: [repo.repo, signal, now.toISOString(), `seed:${signal}`]
            });
          }
        }

        // Update seed run
        await db.execute({
          sql: `UPDATE seed_runs SET
                finished_at = ?, status = 'complete',
                queries_executed = ?, total_results = ?,
                unique_repos = ?, unique_issues = ?,
                rate_limit_hits = ?, errors_json = ?
                WHERE id = ?`,
          args: [
            new Date().toISOString(),
            stats.queriesExecuted,
            stats.totalResults,
            stats.uniqueRepos,
            stats.uniqueIssues,
            stats.rateLimitHits,
            JSON.stringify(stats.errors),
            seedRunId
          ]
        });

        saveSpinner.succeed(`Saved ${scoredRepos.length} repos and ${stats.uniqueIssues} issues`);
      }

      // Print summary
      console.log(chalk.bold('\nSeed Discovery Summary'));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(`  Queries executed: ${stats.queriesExecuted}/${QUERY_PACK.length}`);
      console.log(`  Total results: ${stats.totalResults}`);
      console.log(`  Unique repos: ${chalk.green(stats.uniqueRepos)}`);
      console.log(`  Unique issues: ${chalk.green(stats.uniqueIssues)}`);
      if (stats.rateLimitHits > 0) {
        console.log(`  Rate limit hits: ${chalk.yellow(stats.rateLimitHits)}`);
      }
      if (stats.errors.length > 0) {
        console.log(`  Errors: ${chalk.red(stats.errors.length)}`);
      }

      // Coverage check
      console.log(chalk.bold('\nCoverage Check'));
      console.log(chalk.dim('─'.repeat(60)));
      const highStarRepos = scoredRepos.filter(r => r.stars >= 10000).length;
      const lowStarRepos = scoredRepos.filter(r => r.stars <= 500).length;
      console.log(`  High-star (>=10k): ${highStarRepos >= 20 ? chalk.green(highStarRepos) : chalk.red(highStarRepos)}/20 required`);
      console.log(`  Low-star (<=500): ${lowStarRepos >= 20 ? chalk.green(lowStarRepos) : chalk.red(lowStarRepos)}/20 required`);
      console.log(`  Total repos: ${stats.uniqueRepos >= 300 ? chalk.green(stats.uniqueRepos) : chalk.yellow(stats.uniqueRepos)}/300 target`);

      // Top 10 repos
      console.log(chalk.bold('\nTop 10 Repos by Seed Score'));
      console.log(chalk.dim('─'.repeat(80)));
      for (const repo of scoredRepos.slice(0, 10)) {
        console.log(`  ${chalk.cyan(repo.seedScore.toString().padStart(3))} | ${repo.repo.padEnd(40)} | ★${repo.stars.toString().padStart(6)} | ${repo.bountyIssueCount} issues`);
      }

      // Slack notification
      if (options.slack !== false) {
        const slackContent = buildSeedSlackSummary(stats, scoredRepos);
        await sendSlackNotification({
          type: 'hunt_results',
          content: slackContent
        } as SlackMessage);
        console.log(chalk.dim('\nSlack notification sent'));
      }

      console.log(chalk.bold('\nNext steps:'));
      console.log(chalk.cyan('  bounty seed hydrate --top 50'));
      console.log(chalk.cyan('  bounty seed report'));
      console.log('');

    } catch (error) {
      spinner.fail('Seed discovery failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: hydrate
// ═══════════════════════════════════════════════════════════════════════════

seedCommand
  .command('hydrate')
  .description('Hydrate top repos with rules, style, and label taxonomy')
  .option('--top <n>', 'Number of top repos to hydrate', '50')
  .option('--refresh', 'Force refresh even if recently hydrated')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const spinner = ora('Hydrating top repos...').start();

    try {
      const db = getDb();

      // Get top repos by seed_score
      const result = await db.execute({
        sql: `SELECT repo, seed_score FROM repos
              WHERE seed_score IS NOT NULL
              ORDER BY seed_score DESC
              LIMIT ?`,
        args: [parseInt(options.top, 10)]
      });

      if (result.rows.length === 0) {
        spinner.warn('No seeded repos found. Run: bounty seed repos first');
        return;
      }

      spinner.succeed(`Found ${result.rows.length} repos to hydrate`);

      let hydrated = 0;
      for (const row of result.rows) {
        const repo = (row as { repo: string }).repo;
        const repoSpinner = ora(`Hydrating ${repo}...`).start();

        try {
          // Fetch labels
          const labels = await fetchRepoLabels(repo);

          // Check for CONTRIBUTING.md
          const hasContributing = await checkFileExists(repo, 'CONTRIBUTING.md');

          // Check for PR templates
          const hasPrTemplate = await checkFileExists(repo, '.github/PULL_REQUEST_TEMPLATE.md') ||
                                await checkFileExists(repo, '.github/pull_request_template.md');

          // Update repo profile
          await db.execute({
            sql: `INSERT OR REPLACE INTO repo_profiles
                  (repo, last_fetched)
                  VALUES (?, ?)`,
            args: [repo, new Date().toISOString()]
          });

          // Save label signals
          const bountyLabels = labels.filter(l =>
            l.toLowerCase().includes('bounty') ||
            l.toLowerCase().includes('reward') ||
            l.toLowerCase().includes('paid')
          );

          if (bountyLabels.length > 0) {
            await db.execute({
              sql: `INSERT OR REPLACE INTO repo_signals
                    (repo, signal_type, value_text, observed_at)
                    VALUES (?, 'bounty_labels', ?, ?)`,
              args: [repo, JSON.stringify(bountyLabels), new Date().toISOString()]
            });
          }

          hydrated++;
          repoSpinner.succeed(`${repo}: ${labels.length} labels, contributing: ${hasContributing ? 'yes' : 'no'}`);

        } catch (error) {
          repoSpinner.fail(`${repo}: ${error instanceof Error ? error.message : String(error)}`);
        }

        await sleep(500); // Rate limit protection
      }

      console.log(chalk.bold(`\nHydrated ${hydrated}/${result.rows.length} repos`));

    } catch (error) {
      spinner.fail('Hydration failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: env-probe
// ═══════════════════════════════════════════════════════════════════════════

seedCommand
  .command('env-probe')
  .description('Probe top repos for environment requirements')
  .option('--top <n>', 'Number of top repos to probe', '50')
  .option('--mode <mode>', 'Probe mode: static, bootstrap, or both', 'static')
  .option('--timeout-min <t>', 'Bootstrap timeout in minutes', '5')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const spinner = ora('Probing environment requirements...').start();

    try {
      const db = getDb();

      // Get top repos
      const result = await db.execute({
        sql: `SELECT repo, seed_score FROM repos
              WHERE seed_score IS NOT NULL
              ORDER BY seed_score DESC
              LIMIT ?`,
        args: [parseInt(options.top, 10)]
      });

      if (result.rows.length === 0) {
        spinner.warn('No seeded repos found');
        return;
      }

      spinner.succeed(`Probing ${result.rows.length} repos`);

      const envStats = { local: 0, vm: 0, docker: 0, nix: 0, unknown: 0 };

      for (const row of result.rows) {
        const repo = (row as { repo: string }).repo;
        const probeSpinner = ora(`Probing ${repo}...`).start();

        try {
          const envResult = await probeEnvironment(repo, options.mode === 'static');

          // Update DB
          await db.execute({
            sql: `UPDATE repos SET
                  preferred_env = ?,
                  preferred_env_reasons_json = ?
                  WHERE repo = ?`,
            args: [envResult.preferredEnv, JSON.stringify(envResult.reasons), repo]
          });

          envStats[envResult.preferredEnv as keyof typeof envStats]++;
          probeSpinner.succeed(`${repo}: ${envResult.preferredEnv} (${envResult.reasons.join(', ')})`);

        } catch (error) {
          envStats.unknown++;
          probeSpinner.fail(`${repo}: ${error instanceof Error ? error.message : String(error)}`);
        }

        await sleep(300);
      }

      console.log(chalk.bold('\nEnvironment Distribution'));
      console.log(chalk.dim('─'.repeat(40)));
      console.log(`  Local: ${chalk.green(envStats.local)}`);
      console.log(`  Docker: ${chalk.cyan(envStats.docker)}`);
      console.log(`  VM: ${chalk.yellow(envStats.vm)}`);
      console.log(`  Nix: ${chalk.magenta(envStats.nix)}`);
      console.log(`  Unknown: ${chalk.dim(envStats.unknown)}`);

    } catch (error) {
      spinner.fail('Env probe failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Subcommand: report
// ═══════════════════════════════════════════════════════════════════════════

seedCommand
  .command('report')
  .description('Generate seed baseline report')
  .option('--top <n>', 'Number of top repos to include', '50')
  .option('--output <path>', 'Output path', '000-docs/BOUNTY-SEED-BASELINE-REPORT.md')
  .action(async (options) => {
    const spinner = ora('Generating seed report...').start();

    try {
      const db = getDb();

      // Get latest seed run
      const runResult = await db.execute(
        `SELECT * FROM seed_runs ORDER BY started_at DESC LIMIT 1`
      );
      const seedRun = runResult.rows[0] as unknown as {
        id: number;
        started_at: string;
        queries_executed: number;
        total_results: number;
        unique_repos: number;
        unique_issues: number;
        rate_limit_hits: number;
        errors_json: string;
      };

      if (!seedRun) {
        spinner.warn('No seed runs found. Run: bounty seed repos first');
        return;
      }

      // Get query results
      const queryResults = await db.execute({
        sql: `SELECT * FROM seed_query_results WHERE seed_run_id = ? ORDER BY results_count DESC`,
        args: [seedRun.id]
      });

      // Get top repos
      const topRepos = await db.execute({
        sql: `SELECT r.*, (SELECT COUNT(*) FROM issues_index WHERE repo = r.repo) as issue_count
              FROM repos r
              WHERE r.seed_score IS NOT NULL
              ORDER BY r.seed_score DESC
              LIMIT ?`,
        args: [parseInt(options.top, 10)]
      });

      // Get low-star gems
      const lowStarRepos = await db.execute({
        sql: `SELECT r.*, (SELECT COUNT(*) FROM issues_index WHERE repo = r.repo) as issue_count
              FROM repos r
              WHERE r.seed_score IS NOT NULL AND r.stars <= 500
              ORDER BY r.seed_score DESC
              LIMIT 20`
      });

      // Get high-star opportunities
      const highStarRepos = await db.execute({
        sql: `SELECT r.*, (SELECT COUNT(*) FROM issues_index WHERE repo = r.repo) as issue_count
              FROM repos r
              WHERE r.seed_score IS NOT NULL AND r.stars >= 10000
              ORDER BY r.seed_score DESC
              LIMIT 20`
      });

      spinner.succeed('Data collected');

      // Build report
      const report = buildReport(
        seedRun,
        queryResults.rows as unknown[],
        topRepos.rows as unknown[],
        lowStarRepos.rows as unknown[],
        highStarRepos.rows as unknown[],
        QUERY_PACK
      );

      // Write report
      const outputPath = path.resolve(process.cwd(), options.output);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, report);

      console.log(chalk.green(`\nReport written to: ${outputPath}`));
      console.log(chalk.dim(`View with: cat ${options.output}`));

    } catch (error) {
      spinner.fail('Report generation failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

async function executeQuery(
  query: SeedQuery,
  limit: number,
  verbose: boolean
): Promise<{ items: unknown[]; totalCount: number; rateLimited: boolean }> {
  const items: unknown[] = [];
  let rateLimited = false;

  try {
    let cmd: string;
    if (query.apiType === 'issues') {
      cmd = `gh search issues "${query.query}" --limit ${limit} --json number,title,body,url,state,labels,repository,createdAt,updatedAt`;
    } else if (query.apiType === 'code') {
      cmd = `gh search code "${query.query}" --limit ${limit} --json path,repository`;
    } else {
      cmd = `gh search repos "${query.query}" --limit ${limit} --json name,owner,url,stargazersCount,forksCount,language,description`;
    }

    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    const parsed = JSON.parse(output || '[]');
    items.push(...parsed);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('rate limit') || errMsg.includes('403')) {
      rateLimited = true;
    } else {
      throw error;
    }
  }

  return { items, totalCount: items.length, rateLimited };
}

async function fetchRepoMetadata(repo: string): Promise<{ stars: number; forks: number; language: string }> {
  try {
    const output = execSync(`gh api repos/${repo} --jq '.stargazers_count,.forks_count,.language'`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const lines = output.trim().split('\n');
    return {
      stars: parseInt(lines[0], 10) || 0,
      forks: parseInt(lines[1], 10) || 0,
      language: lines[2] || '',
    };
  } catch {
    return { stars: 0, forks: 0, language: '' };
  }
}

async function fetchRepoLabels(repo: string): Promise<string[]> {
  try {
    const output = execSync(`gh api repos/${repo}/labels --jq '.[].name'`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function checkFileExists(repo: string, path: string): Promise<boolean> {
  try {
    execSync(`gh api repos/${repo}/contents/${path} --silent`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

async function probeEnvironment(repo: string, staticOnly: boolean): Promise<{ preferredEnv: string; reasons: string[] }> {
  const reasons: string[] = [];
  let preferredEnv = 'local';

  // Static checks
  const checks = [
    { path: '.devcontainer/devcontainer.json', env: 'docker', reason: 'devcontainer' },
    { path: 'Dockerfile', env: 'docker', reason: 'dockerfile' },
    { path: 'docker-compose.yml', env: 'docker', reason: 'docker-compose' },
    { path: 'docker-compose.yaml', env: 'docker', reason: 'docker-compose' },
    { path: 'flake.nix', env: 'nix', reason: 'nix-flake' },
    { path: 'shell.nix', env: 'nix', reason: 'nix-shell' },
    { path: 'WORKSPACE', env: 'vm', reason: 'bazel' },
  ];

  for (const check of checks) {
    if (await checkFileExists(repo, check.path)) {
      reasons.push(check.reason);
      if (check.env === 'docker' && preferredEnv === 'local') {
        preferredEnv = 'docker';
      } else if (check.env === 'nix') {
        preferredEnv = 'nix';
      } else if (check.env === 'vm' && preferredEnv !== 'nix') {
        preferredEnv = 'vm';
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push('no-env-files');
  }

  return { preferredEnv, reasons };
}

function detectPayout(text: string): { amount: number; currency: string } | null {
  // Match dollar amounts
  const dollarMatch = text.match(/\$(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/);
  if (dollarMatch) {
    return { amount: parseFloat(dollarMatch[1].replace(',', '')), currency: 'USD' };
  }

  // Match crypto amounts
  const cryptoMatch = text.match(/(\d+(?:\.\d+)?)\s*(ETH|BTC|USDC|USDT)/i);
  if (cryptoMatch) {
    return { amount: parseFloat(cryptoMatch[1]), currency: cryptoMatch[2].toUpperCase() };
  }

  return null;
}

function computeSeedScore(repo: RepoAggregation): number {
  let score = 50; // Base

  // Bounty issue density (+30 max)
  if (repo.bountyIssueCount >= 10) score += 30;
  else if (repo.bountyIssueCount >= 5) score += 25;
  else if (repo.bountyIssueCount >= 3) score += 20;
  else if (repo.bountyIssueCount >= 1) score += 10;

  // Payout hints (+15 max)
  if (repo.payoutHintCount >= 5) score += 15;
  else if (repo.payoutHintCount >= 2) score += 10;
  else if (repo.payoutHintCount >= 1) score += 5;

  // Signal diversity (+10 max)
  if (repo.signals.length >= 5) score += 10;
  else if (repo.signals.length >= 3) score += 5;

  // Star bonus (moderate stars preferred - active but not massive)
  if (repo.stars >= 1000 && repo.stars <= 50000) score += 5;
  else if (repo.stars < 100) score -= 5; // Too small

  return Math.max(0, Math.min(100, score));
}

async function ensureRepo(db: ReturnType<typeof getDb>, repo: RepoAggregation & { seedScore: number }): Promise<void> {
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO repos (repo, stars, forks, language_hint, seed_score,
          bounty_like_issues_90d, payout_hint_count, last_seeded_at,
          seed_score_breakdown_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(repo) DO UPDATE SET
          stars = excluded.stars,
          forks = excluded.forks,
          language_hint = excluded.language_hint,
          seed_score = excluded.seed_score,
          bounty_like_issues_90d = excluded.bounty_like_issues_90d,
          payout_hint_count = excluded.payout_hint_count,
          last_seeded_at = excluded.last_seeded_at,
          seed_score_breakdown_json = excluded.seed_score_breakdown_json,
          updated_at = excluded.updated_at`,
    args: [
      repo.repo, repo.stars, repo.forks, repo.language, repo.seedScore,
      repo.bountyIssueCount, repo.payoutHintCount, now,
      JSON.stringify({ issues: repo.bountyIssueCount, payouts: repo.payoutHintCount, signals: repo.signals }),
      now, now
    ]
  });
}

async function ensureIssue(db: ReturnType<typeof getDb>, repo: string, url: string): Promise<void> {
  const existing = await db.execute({
    sql: 'SELECT id FROM issues_index WHERE url = ?',
    args: [url]
  });

  if (existing.rows.length === 0) {
    // Extract issue number from URL
    const match = url.match(/\/issues\/(\d+)/);
    const issueNumber = match ? parseInt(match[1], 10) : null;

    await db.execute({
      sql: `INSERT INTO issues_index (repo, url, issue_number, state, is_bounty_like, ingested_at)
            VALUES (?, ?, ?, 'open', 1, ?)`,
      args: [repo, url, issueNumber, new Date().toISOString()]
    });
  }
}

function buildSeedSlackSummary(stats: SeedRunStats, repos: (RepoAggregation & { seedScore: number })[]): string {
  const lines: string[] = [];

  lines.push('*SEED DISCOVERY COMPLETE*');
  lines.push('');
  lines.push(`Queries: ${stats.queriesExecuted}`);
  lines.push(`Unique repos: ${stats.uniqueRepos}`);
  lines.push(`Unique issues: ${stats.uniqueIssues}`);
  if (stats.rateLimitHits > 0) {
    lines.push(`Rate limits: ${stats.rateLimitHits}`);
  }
  lines.push('');
  lines.push('*Top 5 repos by seed score:*');
  for (const repo of repos.slice(0, 5)) {
    lines.push(`• ${repo.repo} (score: ${repo.seedScore}, ★${repo.stars})`);
  }
  lines.push('');
  lines.push('Run `bounty seed report` for full analysis');

  return lines.join('\n');
}

function buildReport(
  seedRun: unknown,
  queryResults: unknown[],
  topRepos: unknown[],
  lowStarRepos: unknown[],
  highStarRepos: unknown[],
  queryPack: SeedQuery[]
): string {
  const run = seedRun as {
    started_at: string;
    queries_executed: number;
    total_results: number;
    unique_repos: number;
    unique_issues: number;
    rate_limit_hits: number;
    errors_json: string;
  };

  const lines: string[] = [];

  lines.push('# Bounty Seed Baseline Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Seed run: ${run.started_at}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Queries executed | ${run.queries_executed} |`);
  lines.push(`| Total results | ${run.total_results} |`);
  lines.push(`| Unique repos | ${run.unique_repos} |`);
  lines.push(`| Unique issues | ${run.unique_issues} |`);
  lines.push(`| Rate limit hits | ${run.rate_limit_hits} |`);
  lines.push('');

  // Query Pack
  lines.push('## Query Pack');
  lines.push('');
  lines.push('| ID | Category | Description | Query |');
  lines.push('|----|----------|-------------|-------|');
  for (const q of queryPack) {
    lines.push(`| ${q.id} | ${q.category} | ${q.description} | \`${q.query.slice(0, 50)}${q.query.length > 50 ? '...' : ''}\` |`);
  }
  lines.push('');

  // Query Results
  lines.push('## Query Yield Analysis');
  lines.push('');
  lines.push('| Query ID | Category | Results | Unique Repos |');
  lines.push('|----------|----------|---------|--------------|');
  for (const r of queryResults as { query_id: string; query_category: string; results_count: number; unique_repos_found: number }[]) {
    lines.push(`| ${r.query_id} | ${r.query_category} | ${r.results_count} | ${r.unique_repos_found} |`);
  }
  lines.push('');

  // Top 50 Repos
  lines.push('## Top 50 Repos by Seed Score');
  lines.push('');
  lines.push('| Rank | Repo | Score | Stars | Issues | Env |');
  lines.push('|------|------|-------|-------|--------|-----|');
  let rank = 1;
  for (const r of topRepos as { repo: string; seed_score: number; stars: number; issue_count: number; preferred_env: string }[]) {
    lines.push(`| ${rank} | ${r.repo} | ${r.seed_score || 0} | ${r.stars || 0} | ${r.issue_count || 0} | ${r.preferred_env || 'local'} |`);
    rank++;
  }
  lines.push('');

  // Low-star gems
  lines.push('## Low-Star Gems (<=500 stars)');
  lines.push('');
  lines.push('| Repo | Score | Stars | Issues |');
  lines.push('|------|-------|-------|--------|');
  for (const r of lowStarRepos as { repo: string; seed_score: number; stars: number; issue_count: number }[]) {
    lines.push(`| ${r.repo} | ${r.seed_score || 0} | ${r.stars || 0} | ${r.issue_count || 0} |`);
  }
  lines.push('');

  // High-star opportunities
  lines.push('## High-Star Opportunities (>=10k stars)');
  lines.push('');
  lines.push('| Repo | Score | Stars | Issues |');
  lines.push('|------|-------|-------|--------|');
  for (const r of highStarRepos as { repo: string; seed_score: number; stars: number; issue_count: number }[]) {
    lines.push(`| ${r.repo} | ${r.seed_score || 0} | ${r.stars || 0} | ${r.issue_count || 0} |`);
  }
  lines.push('');

  // Coverage check
  lines.push('## Coverage Check');
  lines.push('');
  const highCount = highStarRepos.length;
  const lowCount = lowStarRepos.length;
  lines.push(`- High-star repos (>=10k): ${highCount}/20 ${highCount >= 20 ? '✅' : '❌'}`);
  lines.push(`- Low-star repos (<=500): ${lowCount}/20 ${lowCount >= 20 ? '✅' : '❌'}`);
  lines.push(`- Total unique repos: ${run.unique_repos}/300 ${run.unique_repos >= 300 ? '✅' : '⚠️'}`);
  lines.push(`- Queries executed: ${run.queries_executed}/20 ${run.queries_executed >= 20 ? '✅' : '❌'}`);
  lines.push('');

  // Errors
  const errors = run.errors_json ? JSON.parse(run.errors_json) : [];
  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const e of errors) {
      lines.push(`- ${e}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
