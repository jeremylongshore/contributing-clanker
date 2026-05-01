/**
 * Unified Sync Command
 *
 * Syncs bounties from multiple sources:
 * - Algora API
 * - GitHub (labeled issues)
 * - Checks PR status for submitted bounties
 * - Updates CSV tracker
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import { getConfig } from '../lib/config';
import { getAlgoraBounties, getTrackedOrgs } from '../lib/algora';
import { readCSVBounties, writeCSVBounties } from '../lib/firestore';
import type { Bounty } from '@contribute/core';

// Try to get GitHub token from multiple sources
function getGitHubToken(): string | null {
  const config = getConfig();

  // 1. Check config
  if (config.githubToken) return config.githubToken;

  // 2. Check environment
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  // 3. Try gh CLI
  try {
    const token = execSync('gh auth token 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (token) return token;
  } catch {
    // gh CLI not available or not authenticated
  }

  return null;
}

// Tracked repos for GitHub sync
const TRACKED_REPOS = [
  'screenpipe/screenpipe',
  'calcom/cal.com',
  'cortexso/cortex',
  'tldraw/tldraw',
  'PostHog/posthog',
  'jeffvli/feishin',
  'GoogleCloudPlatform/vertex-ai-samples',
  'zio/zio-schema',
];

// Map short repo names to full GitHub paths
const REPO_MAP: Record<string, string> = {
  'screenpipe': 'mediar-ai/screenpipe',
  'posthog': 'PostHog/posthog',
  'cortex': 'janhq/cortex',
  'tldraw': 'tldraw/tldraw',
  'feishin': 'jeffvli/feishin',
  'vertex-ai-samples': 'GoogleCloudPlatform/vertex-ai-samples',
  'a2a-samples': 'a2aproject/a2a-samples',
  'ai-card': 'jeremylongshore/ai-card',
  'zio': 'zio/zio-schema',
  'cal.com': 'calcom/cal.com',
  'cal-com': 'calcom/cal.com',
  'golemcloud': 'golemcloud/golem',
  'anthropic-sdk-typescript': 'anthropics/anthropic-sdk-typescript',
  'anthropic-cookbook': 'anthropics/anthropic-cookbook',
  'claude-code': 'anthropics/claude-code',
  'claude-code-action': 'anthropics/claude-code-action',
  'claude-quickstarts': 'anthropics/anthropic-quickstarts',
};

// Resolve short repo name to full owner/repo path
function resolveRepoPath(shortName: string): string {
  if (shortName.includes('/')) return shortName;
  return REPO_MAP[shortName] || shortName;
}

// Use gh api to check PR status (more reliable than Octokit for some cases)
async function checkPRWithGhApi(repo: string, prNumber: number): Promise<{ state: string; merged: boolean; merged_at?: string } | null> {
  try {
    const result = execSync(
      `gh api repos/${repo}/pulls/${prNumber} --jq '{state: .state, merged: .merged, merged_at: .merged_at}'`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    return JSON.parse(result.trim());
  } catch {
    return null;
  }
}

export const syncCommand = new Command('sync')
  .description('Sync bounties from all sources (Algora, GitHub, CSV)');

syncCommand
  .command('all')
  .description('Full sync from all sources')
  .option('--dry-run', 'Preview changes without saving')
  .action(async (options) => {
    const spinner = ora('Starting full sync...').start();
    const token = getGitHubToken();

    const results = {
      algora: 0,
      github: 0,
      updated: 0,
      new: 0,
    };

    try {
      // Load existing CSV bounties
      spinner.text = 'Loading existing bounties...';
      const existingBounties = readCSVBounties();
      const bountyMap = new Map<string, Bounty>();

      for (const b of existingBounties) {
        const key = `${b.repo}-${b.issue}`;
        bountyMap.set(key, b);
      }

      // Fetch from Algora
      spinner.text = 'Fetching from Algora...';
      const algoraBounties = await getAlgoraBounties({ status: 'open' });
      results.algora = algoraBounties.length;

      for (const ab of algoraBounties) {
        const key = `${ab.repo}-${ab.issue}`;
        if (!bountyMap.has(key)) {
          bountyMap.set(key, ab);
          results.new++;
        }
      }

      // Fetch from GitHub
      if (token) {
        spinner.text = 'Fetching from GitHub...';
        const octokit = new Octokit({ auth: token });

        for (const repoPath of TRACKED_REPOS) {
          const [owner, repo] = repoPath.split('/');

          try {
            const { data: issues } = await octokit.issues.listForRepo({
              owner,
              repo,
              labels: 'bounty',
              state: 'open',
              per_page: 50,
            });

            for (const issue of issues) {
              if (issue.pull_request) continue;

              const key = `${repoPath}-${issue.number}`;
              results.github++;

              if (!bountyMap.has(key)) {
                // Extract value from labels
                let value = 0;
                for (const label of issue.labels) {
                  const labelName = typeof label === 'string' ? label : label.name;
                  const match = labelName?.match(/^\$(\d+)/);
                  if (match) {
                    value = parseInt(match[1], 10);
                    break;
                  }
                }

                const bounty: Bounty = {
                  id: `gh-${owner}-${repo}-${issue.number}`,
                  title: issue.title,
                  description: issue.body?.substring(0, 500) || undefined,
                  value,
                  currency: 'USD',
                  status: 'open',
                  source: 'github',
                  repo: repoPath,
                  org: owner,
                  issue: issue.number,
                  issueUrl: issue.html_url,
                  domainId: 'default',
                  labels: issue.labels.map(l => typeof l === 'string' ? l : l.name || '').filter(Boolean),
                  technologies: [],
                  timeline: [],
                  createdAt: issue.created_at,
                  updatedAt: issue.updated_at,
                };

                bountyMap.set(key, bounty);
                results.new++;
              }
            }
          } catch (error: any) {
            // Skip repos we don't have access to
            if (error.status !== 404) {
              console.warn(`Failed to fetch ${repoPath}: ${error.message}`);
            }
          }
        }

        // Check PR status for submitted bounties
        spinner.text = 'Checking PR status...';
        for (const [key, bounty] of bountyMap) {
          if (bounty.status === 'submitted' && bounty.pr && bounty.repo) {
            const [owner, repo] = bounty.repo.split('/');

            try {
              const { data: pr } = await octokit.pulls.get({
                owner,
                repo,
                pull_number: bounty.pr,
              });

              if (pr.merged) {
                bounty.status = 'completed';
                bounty.completedAt = pr.merged_at || undefined;
                results.updated++;
              } else if (pr.state === 'closed') {
                bounty.status = 'cancelled';
                results.updated++;
              }
            } catch {
              // PR not found, skip
            }
          }
        }
      } else {
        spinner.warn('No GitHub token - skipping GitHub sync');
      }

      spinner.stop();

      // Summary
      console.log(chalk.bold('\nSync Results:'));
      console.log(`  Algora bounties: ${results.algora}`);
      console.log(`  GitHub issues:   ${results.github}`);
      console.log(`  New bounties:    ${chalk.green(results.new)}`);
      console.log(`  Updated:         ${chalk.yellow(results.updated)}`);

      if (options.dryRun) {
        console.log(chalk.dim('\nDry run - no changes saved'));
      } else {
        spinner.start('Saving to CSV...');
        const allBounties = Array.from(bountyMap.values());
        writeCSVBounties(allBounties);
        spinner.succeed(`Saved ${allBounties.length} bounties to CSV`);
      }

    } catch (error: any) {
      spinner.fail('Sync failed');
      console.error(error.message);
      process.exit(1);
    }
  });

syncCommand
  .command('algora')
  .description('Sync only from Algora')
  .option('--org <org>', 'Specific organization')
  .option('--dry-run', 'Preview without saving')
  .action(async (options) => {
    const spinner = ora('Fetching from Algora...').start();

    try {
      const orgs = options.org ? [options.org] : getTrackedOrgs();
      const bounties = await getAlgoraBounties({ orgs, status: 'open' });

      spinner.stop();

      console.log(chalk.bold(`\nAlgora Bounties (${bounties.length}):\n`));

      for (const b of bounties) {
        const value = b.value > 0 ? chalk.green(`$${b.value}`) : chalk.dim('N/A');
        console.log(`  ${chalk.cyan(b.repo)} #${b.issue}`);
        console.log(`    ${b.title}`);
        console.log(`    Value: ${value}`);
        console.log('');
      }

      if (!options.dryRun && bounties.length > 0) {
        const existing = readCSVBounties();
        const merged = mergeUnique(existing, bounties);
        writeCSVBounties(merged);
        console.log(chalk.green(`Saved ${merged.length} bounties to CSV`));
      }

    } catch (error: any) {
      spinner.fail('Algora sync failed');
      console.error(error.message);
      process.exit(1);
    }
  });

syncCommand
  .command('github [repo]')
  .description('Sync from GitHub (specific repo or all tracked)')
  .option('--label <label>', 'Label to look for', 'bounty')
  .option('--dry-run', 'Preview without saving')
  .action(async (repo, options) => {
    const spinner = ora('Fetching from GitHub...').start();
    const token = getGitHubToken();

    if (!token) {
      spinner.fail('GitHub token not configured');
      console.log(chalk.dim('Set with: bounty config set githubToken <token>'));
      console.log(chalk.dim('Or authenticate with: gh auth login'));
      process.exit(1);
    }

    try {
      const octokit = new Octokit({ auth: token });
      const repos = repo ? [repo] : TRACKED_REPOS;
      const bounties: Bounty[] = [];

      for (const repoPath of repos) {
        const [owner, repoName] = repoPath.split('/');

        try {
          spinner.text = `Fetching ${repoPath}...`;
          const { data: issues } = await octokit.issues.listForRepo({
            owner,
            repo: repoName,
            labels: options.label,
            state: 'open',
            per_page: 100,
          });

          for (const issue of issues) {
            if (issue.pull_request) continue;

            let value = 0;
            for (const label of issue.labels) {
              const labelName = typeof label === 'string' ? label : label.name;
              const match = labelName?.match(/^\$(\d+)/);
              if (match) {
                value = parseInt(match[1], 10);
                break;
              }
            }

            bounties.push({
              id: `gh-${owner}-${repoName}-${issue.number}`,
              title: issue.title,
              value,
              currency: 'USD',
              status: 'open',
              source: 'github',
              repo: repoPath,
              issue: issue.number,
              issueUrl: issue.html_url,
              domainId: 'default',
              labels: issue.labels.map(l => typeof l === 'string' ? l : l.name || '').filter(Boolean),
              technologies: [],
              timeline: [],
              createdAt: issue.created_at,
              updatedAt: issue.updated_at,
            });
          }
        } catch (error: any) {
          if (error.status === 404) {
            console.warn(chalk.dim(`  Skipping ${repoPath} (not found)`));
          }
        }
      }

      spinner.stop();

      console.log(chalk.bold(`\nGitHub Bounties (${bounties.length}):\n`));

      for (const b of bounties) {
        const value = b.value > 0 ? chalk.green(`$${b.value}`) : chalk.dim('N/A');
        console.log(`  ${chalk.cyan(b.repo)} #${b.issue}`);
        console.log(`    ${b.title}`);
        console.log(`    Value: ${value}`);
        console.log('');
      }

      if (!options.dryRun && bounties.length > 0) {
        const existing = readCSVBounties();
        const merged = mergeUnique(existing, bounties);
        writeCSVBounties(merged);
        console.log(chalk.green(`Saved ${merged.length} bounties to CSV`));
      }

    } catch (error: any) {
      spinner.fail('GitHub sync failed');
      console.error(error.message);
      process.exit(1);
    }
  });

syncCommand
  .command('check-prs')
  .description('Check status of submitted PRs')
  .option('--dry-run', 'Preview without saving')
  .action(async (options) => {
    const spinner = ora('Checking PR status...').start();
    const token = getGitHubToken();

    if (!token) {
      spinner.fail('GitHub token not configured');
      console.log(chalk.dim('Authenticate with: gh auth login'));
      process.exit(1);
    }

    try {
      const octokit = new Octokit({ auth: token });
      const bounties = readCSVBounties();
      const submitted = bounties.filter(b => b.status === 'submitted' && b.pr && b.repo);

      spinner.stop();

      if (submitted.length === 0) {
        console.log(chalk.dim('No submitted PRs to check'));
        return;
      }

      console.log(chalk.bold(`\nChecking ${submitted.length} submitted PRs:\n`));

      for (const bounty of submitted) {
        const fullRepo = resolveRepoPath(bounty.repo!);

        // Use gh api for more reliable PR checking
        const pr = await checkPRWithGhApi(fullRepo, bounty.pr!);

        if (pr) {
          let status = '';
          if (pr.merged) {
            bounty.status = 'completed';
            bounty.completedAt = pr.merged_at || undefined;
            status = chalk.green('MERGED');
          } else if (pr.state === 'closed') {
            bounty.status = 'cancelled';
            status = chalk.red('CLOSED');
          } else if (pr.state === 'open') {
            status = chalk.yellow('OPEN');
          }

          console.log(`  ${fullRepo} PR #${bounty.pr}: ${status}`);
          console.log(`    ${bounty.title}`);
          console.log('');
        } else {
          console.log(`  ${fullRepo} PR #${bounty.pr}: ${chalk.red('NOT FOUND')}`);
        }
      }

      if (!options.dryRun) {
        writeCSVBounties(bounties);
        console.log(chalk.green('Updated CSV with PR status'));
      }

    } catch (error: any) {
      spinner.fail('PR check failed');
      console.error(error.message);
      process.exit(1);
    }
  });

// Default action (same as 'all')
syncCommand.action(async () => {
  await syncCommand.commands.find(c => c.name() === 'all')?.parseAsync(['node', 'bounty', 'sync', 'all']);
});

function mergeUnique(existing: Bounty[], newBounties: Bounty[]): Bounty[] {
  const map = new Map<string, Bounty>();

  for (const b of existing) {
    const key = `${b.repo}-${b.issue}`;
    map.set(key, b);
  }

  for (const b of newBounties) {
    const key = `${b.repo}-${b.issue}`;
    if (!map.has(key)) {
      map.set(key, b);
    }
  }

  return Array.from(map.values());
}
