/**
 * GitHub Org Connector - Fetch issues from all repos in an organization
 */

import type { Connector, ConnectorConfig, IngestResult, IssueItem } from './types';

interface GitHubRepo {
  name: string;
  full_name: string;
  archived: boolean;
  disabled: boolean;
}

interface GitHubIssue {
  html_url: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  updated_at: string;
}

const BOUNTY_LABELS = ['bounty', 'bounty:open', 'has bounty', 'cash bounty', 'paid', '$$', 'reward'];
const BOUNTY_AMOUNT_REGEX = /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:bounty|reward|USD)?/i;

export class GitHubOrgConnector implements Connector {
  name = 'github_org';

  async fetch(config: ConnectorConfig): Promise<IngestResult> {
    const result: IngestResult = {
      scannedRepos: 0,
      scannedItems: 0,
      newItems: 0,
      updatedItems: 0,
      items: [],
      errors: []
    };

    const token = config.token || process.env.GITHUB_TOKEN;

    if (!token) {
      result.errors.push('GITHUB_TOKEN not configured');
      return result;
    }

    if (!config.org) {
      result.errors.push('Organization is required for github_org connector');
      return result;
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'bounty-system-cli/0.2.0',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
      // Step 1: List all repos in the org
      const reposUrl = new URL(`https://api.github.com/orgs/${config.org}/repos`);
      reposUrl.searchParams.set('per_page', '100');
      reposUrl.searchParams.set('type', 'public');

      const reposResponse = await fetch(reposUrl.toString(), { headers });

      if (!reposResponse.ok) {
        if (reposResponse.status === 404) {
          result.errors.push(`Organization not found: ${config.org}`);
        } else if (reposResponse.status === 403) {
          result.errors.push('GitHub rate limit exceeded');
        } else {
          result.errors.push(`GitHub API error: ${reposResponse.status}`);
        }
        return result;
      }

      const repos: GitHubRepo[] = await reposResponse.json();

      // Filter out archived/disabled repos
      const activeRepos = repos.filter(r => !r.archived && !r.disabled);
      result.scannedRepos = activeRepos.length;

      // Build label query if specified
      const labelFilter = config.labels?.length
        ? config.labels.join(',')
        : BOUNTY_LABELS[0]; // Default to 'bounty'

      // Step 2: For each repo, fetch issues with bounty labels
      for (const repo of activeRepos) {
        try {
          const issuesUrl = new URL(`https://api.github.com/repos/${repo.full_name}/issues`);
          issuesUrl.searchParams.set('state', 'open');
          issuesUrl.searchParams.set('labels', labelFilter);
          issuesUrl.searchParams.set('per_page', '50');
          issuesUrl.searchParams.set('sort', 'updated');
          issuesUrl.searchParams.set('direction', 'desc');

          // Add date filter for incremental updates
          if (config.updatedSince) {
            issuesUrl.searchParams.set('since', config.updatedSince);
          }

          const issuesResponse = await fetch(issuesUrl.toString(), { headers });

          // Check rate limit
          const remaining = issuesResponse.headers.get('x-ratelimit-remaining');
          if (remaining && parseInt(remaining, 10) < 50) {
            result.errors.push(`Rate limit low (${remaining}). Stopping to avoid hitting limit.`);
            break;
          }

          if (!issuesResponse.ok) {
            if (issuesResponse.status === 404) {
              // Repo might not have issues enabled
              continue;
            }
            result.errors.push(`Failed to fetch issues from ${repo.full_name}: ${issuesResponse.status}`);
            continue;
          }

          const issues: GitHubIssue[] = await issuesResponse.json();
          result.scannedItems += issues.length;

          for (const issue of issues) {
            const labelNames = issue.labels.map(l => l.name.toLowerCase());

            // Check if bounty-like
            const isBountyLike = labelNames.some(l =>
              BOUNTY_LABELS.some(bl => l.includes(bl.toLowerCase()))
            );

            // Extract bounty amount
            let bountyAmount: number | null = null;
            let bountyCurrency: string | null = null;

            for (const label of issue.labels) {
              const match = label.name.match(BOUNTY_AMOUNT_REGEX);
              if (match) {
                bountyAmount = parseFloat(match[1].replace(/,/g, ''));
                bountyCurrency = 'USD';
                break;
              }
            }

            if (!bountyAmount && issue.body) {
              const match = issue.body.match(BOUNTY_AMOUNT_REGEX);
              if (match) {
                bountyAmount = parseFloat(match[1].replace(/,/g, ''));
                bountyCurrency = 'USD';
              }
            }

            const item: IssueItem = {
              url: issue.html_url,
              repo: repo.full_name,
              issueNumber: issue.number,
              title: issue.title,
              bodyExcerpt: truncate(issue.body || '', 500),
              labels: labelNames,
              state: issue.state,
              updatedAt: issue.updated_at,
              bountyAmount,
              bountyCurrency,
              isPaid: bountyAmount !== null && bountyAmount > 0,
              isBountyLike
            };

            result.items.push(item);
          }

        } catch (error) {
          result.errors.push(`Failed to fetch ${repo.full_name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

    } catch (error) {
      result.errors.push(`GitHub org fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

export const githubOrgConnector = new GitHubOrgConnector();
