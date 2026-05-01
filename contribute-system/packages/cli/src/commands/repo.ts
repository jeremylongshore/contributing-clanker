/**
 * Repo Profile Management Commands
 *
 * Fetch and cache CONTRIBUTING.md, PR templates, and repo metadata.
 * Used to remember contribution guidelines for faster bounty claims.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getDb, closeDb } from '../lib/db';
import { getConfig } from '../lib/config';

export const repoCommand = new Command('repo')
  .description('Manage repo profiles and contribution guidelines');

/**
 * Fetch and cache a repo's contribution guidelines
 */
repoCommand
  .command('fetch <repo>')
  .description('Fetch and cache CONTRIBUTING.md and repo info')
  .option('--force', 'Overwrite existing cache')
  .action(async (repo, options) => {
    const spinner = ora(`Fetching ${repo}...`).start();

    try {
      const config = await getConfig();
      const token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!token) {
        spinner.fail('GitHub token required');
        console.log(chalk.dim('Set with: bounty config set githubToken <token>'));
        process.exit(1);
      }

      // Parse repo
      const [owner, name] = repo.split('/');
      if (!owner || !name) {
        spinner.fail('Invalid repo format. Use owner/repo');
        process.exit(1);
      }

      // Check if already cached
      const db = getDb();
      const existing = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      if (existing.rows.length > 0 && !options.force) {
        spinner.info('Repo already cached');
        console.log(chalk.dim(`Last updated: ${existing.rows[0].last_fetched}`));
        console.log(chalk.dim('Use --force to refresh'));
        return;
      }

      // Fetch repo info from GitHub API
      spinner.text = 'Fetching repo metadata...';
      const repoInfo = await fetchRepoInfo(owner, name, token);

      // Fetch CONTRIBUTING.md
      spinner.text = 'Fetching CONTRIBUTING.md...';
      const contributing = await fetchFile(owner, name, 'CONTRIBUTING.md', token);

      // Fetch PR template
      spinner.text = 'Fetching PR template...';
      const prTemplate = await fetchPRTemplate(owner, name, token);

      // Check for CLA
      const contributingLower = (contributing || '').toLowerCase();
      const claRequired = contributingLower.includes('cla') ||
                          contributingLower.includes('contributor license') ||
                          contributingLower.includes('contributor agreement');

      // Extract CLA URL if present
      const claUrlMatch = (contributing || '').match(/https?:\/\/[^\s)]+cla[^\s)]*/i);
      const claUrl = claUrlMatch ? claUrlMatch[0] : null;

      // Detect test framework from README or contributing
      const testFramework = detectTestFramework(contributing || '', repoInfo.languages);

      // Detect naming convention
      const prNaming = detectPRNamingConvention(contributing || '');

      // Build languages string
      const languages = repoInfo.languages?.join(', ') || '';

      // Upsert into database
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT OR REPLACE INTO repo_profiles
              (repo, contributing_md, contributing_url, cla_required, cla_url,
               test_framework, pr_template, pr_naming_convention, languages,
               last_fetched, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          repo,
          contributing,
          `https://github.com/${repo}/blob/main/CONTRIBUTING.md`,
          claRequired ? 1 : 0,
          claUrl,
          testFramework,
          prTemplate,
          prNaming,
          languages,
          now,
          existing.rows.length > 0 ? existing.rows[0].created_at : now,
          now
        ]
      });

      spinner.succeed(`Cached ${repo}`);

      // Show summary
      console.log(chalk.bold('\nRepo Profile:'));
      console.log(`  Languages: ${languages || chalk.dim('unknown')}`);
      console.log(`  CLA Required: ${claRequired ? chalk.yellow('Yes') : chalk.green('No')}`);
      if (claUrl) console.log(`  CLA URL: ${chalk.cyan(claUrl)}`);
      console.log(`  Test Framework: ${testFramework || chalk.dim('unknown')}`);
      console.log(`  PR Naming: ${prNaming || chalk.dim('standard')}`);
      console.log(`  Has PR Template: ${prTemplate ? chalk.green('Yes') : chalk.dim('No')}`);

      if (contributing) {
        console.log(chalk.bold('\nCONTRIBUTING.md Preview:'));
        const preview = contributing.slice(0, 500);
        console.log(chalk.dim(preview + (contributing.length > 500 ? '\n...' : '')));
      } else {
        console.log(chalk.dim('\nNo CONTRIBUTING.md found'));
      }

      console.log('');

    } catch (error) {
      spinner.fail('Failed to fetch repo');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Show cached repo profile
 */
repoCommand
  .command('show <repo>')
  .description('Show cached repo profile')
  .option('--full', 'Show full CONTRIBUTING.md content')
  .action(async (repo, options) => {
    try {
      const db = getDb();
      const result = await db.execute({
        sql: 'SELECT * FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      if (result.rows.length === 0) {
        console.log(chalk.yellow(`\nRepo ${repo} not cached`));
        console.log(chalk.dim(`Run: bounty repo fetch ${repo}`));
        return;
      }

      const profile = result.rows[0];

      console.log(chalk.bold(`\n${repo} Profile\n`));
      console.log(`  Languages: ${profile.languages || chalk.dim('unknown')}`);
      console.log(`  CLA Required: ${profile.cla_required ? chalk.yellow('Yes') : chalk.green('No')}`);
      if (profile.cla_url) {
        console.log(`  CLA URL: ${chalk.cyan(profile.cla_url as string)}`);
      }
      console.log(`  Test Framework: ${profile.test_framework || chalk.dim('unknown')}`);
      console.log(`  PR Naming: ${profile.pr_naming_convention || chalk.dim('standard')}`);
      console.log(`  Last Fetched: ${profile.last_fetched}`);

      if (profile.contributing_md) {
        console.log(chalk.bold('\nCONTRIBUTING.md:'));
        if (options.full) {
          console.log(profile.contributing_md);
        } else {
          const preview = (profile.contributing_md as string).slice(0, 1000);
          console.log(chalk.dim(preview + ((profile.contributing_md as string).length > 1000 ? '\n...\n(use --full to see all)' : '')));
        }
      }

      if (profile.pr_template) {
        console.log(chalk.bold('\nPR Template:'));
        console.log(chalk.dim(profile.pr_template as string));
      }

      console.log('');

    } catch (error) {
      console.error('Failed to show repo:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * List all cached repos
 */
repoCommand
  .command('list')
  .description('List all cached repo profiles')
  .action(async () => {
    try {
      const db = getDb();
      const result = await db.execute(
        'SELECT repo, languages, cla_required, test_framework, last_fetched FROM repo_profiles ORDER BY last_fetched DESC'
      );

      if (result.rows.length === 0) {
        console.log(chalk.dim('\nNo repos cached yet'));
        console.log(chalk.dim('Run: bounty repo fetch owner/repo'));
        return;
      }

      console.log(chalk.bold(`\nCached Repo Profiles (${result.rows.length})\n`));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(
        chalk.bold(padRight('Repo', 35)) +
        chalk.bold(padRight('Languages', 20)) +
        chalk.bold(padRight('CLA', 5)) +
        chalk.bold('Last Fetched')
      );
      console.log(chalk.dim('─'.repeat(80)));

      for (const row of result.rows) {
        const cla = row.cla_required ? chalk.yellow('Yes') : chalk.green('No');
        const languages = truncate(row.languages as string || '', 18);
        const fetched = (row.last_fetched as string || '').split('T')[0];

        console.log(
          padRight(row.repo as string, 35) +
          padRight(languages, 20) +
          padRight(cla, 5) +
          fetched
        );
      }

      console.log(chalk.dim('─'.repeat(80)));
      console.log('');

    } catch (error) {
      console.error('Failed to list repos:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Remove a cached repo
 */
repoCommand
  .command('remove <repo>')
  .description('Remove a cached repo profile')
  .action(async (repo) => {
    try {
      const db = getDb();
      const result = await db.execute({
        sql: 'DELETE FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      if (result.rowsAffected === 0) {
        console.log(chalk.yellow(`\nRepo ${repo} not found in cache`));
        return;
      }

      console.log(chalk.green(`\nRemoved ${repo} from cache`));

    } catch (error) {
      console.error('Failed to remove repo:', error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Helper functions

async function fetchRepoInfo(owner: string, name: string, token: string): Promise<{
  languages: string[];
  defaultBranch: string;
}> {
  // Fetch repo metadata
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!repoRes.ok) {
    throw new Error(`Failed to fetch repo: ${repoRes.statusText}`);
  }

  const repoData = await repoRes.json() as { default_branch: string };

  // Fetch languages
  const langRes = await fetch(`https://api.github.com/repos/${owner}/${name}/languages`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  const langData = langRes.ok ? await langRes.json() as Record<string, number> : {};
  const languages = Object.keys(langData);

  return {
    languages,
    defaultBranch: repoData.default_branch || 'main'
  };
}

async function fetchFile(owner: string, name: string, path: string, token: string): Promise<string | null> {
  // Try different common locations
  const paths = [
    path,
    `.github/${path}`,
    `docs/${path}`
  ];

  for (const p of paths) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${p}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    if (res.ok) {
      return await res.text();
    }
  }

  return null;
}

async function fetchPRTemplate(owner: string, name: string, token: string): Promise<string | null> {
  const paths = [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
    '.github/PULL_REQUEST_TEMPLATE/default.md'
  ];

  for (const path of paths) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    if (res.ok) {
      return await res.text();
    }
  }

  return null;
}

function detectTestFramework(content: string, languages: string[]): string | null {
  const lower = content.toLowerCase();
  const langSet = new Set(languages.map(l => l.toLowerCase()));

  // JavaScript/TypeScript
  if (langSet.has('typescript') || langSet.has('javascript')) {
    if (lower.includes('vitest')) return 'vitest';
    if (lower.includes('jest')) return 'jest';
    if (lower.includes('mocha')) return 'mocha';
    if (lower.includes('ava')) return 'ava';
  }

  // Python
  if (langSet.has('python')) {
    if (lower.includes('pytest')) return 'pytest';
    if (lower.includes('unittest')) return 'unittest';
  }

  // Rust
  if (langSet.has('rust')) {
    return 'cargo test';
  }

  // Go
  if (langSet.has('go')) {
    return 'go test';
  }

  // Ruby
  if (langSet.has('ruby')) {
    if (lower.includes('rspec')) return 'rspec';
    if (lower.includes('minitest')) return 'minitest';
  }

  return null;
}

function detectPRNamingConvention(content: string): string | null {
  const lower = content.toLowerCase();

  if (lower.includes('conventional commit') ||
      lower.match(/feat\(|fix\(|docs\(|chore\(/)) {
    return 'conventional';
  }

  if (lower.includes('semantic commit')) {
    return 'semantic';
  }

  if (lower.match(/\[type\]|\[scope\]/)) {
    return 'bracketed';
  }

  return null;
}

function padRight(s: string, len: number): string {
  return s.padEnd(len);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 2) + '..' : s;
}
