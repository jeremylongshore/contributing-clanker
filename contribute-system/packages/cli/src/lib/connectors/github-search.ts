/**
 * GitHub Search Connector - Fetch issues via GitHub Search API
 */

import type { Connector, ConnectorConfig, IngestResult, IssueItem } from './types';

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubIssue[];
}

interface GitHubIssue {
  url: string;
  html_url: string;
  repository_url: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  updated_at: string;
  created_at: string;
}

// Bounty label patterns
const BOUNTY_LABELS = ['bounty', 'bounty:open', 'has bounty', 'cash bounty', 'paid', '$$', 'reward'];
const BOUNTY_AMOUNT_REGEX = /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:bounty|reward|USD)?/i;

export class GitHubSearchConnector implements Connector {
  name = 'github_search';

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
      result.errors.push('GITHUB_TOKEN not configured. Set via env or bounty config set githubToken <token>');
      return result;
    }

    if (!config.query) {
      result.errors.push('Search query is required for github_search connector');
      return result;
    }

    try {
      // Build search query
      let searchQuery = config.query;

      // Add date filter for incremental updates
      if (config.updatedSince) {
        const date = config.updatedSince.split('T')[0]; // YYYY-MM-DD
        searchQuery += ` updated:>=${date}`;
      }

      const url = new URL('https://api.github.com/search/issues');
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('per_page', String(Math.min(config.limit || 100, 100)));
      url.searchParams.set('sort', 'updated');
      url.searchParams.set('order', 'desc');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'bounty-system-cli/0.2.0',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      // Check rate limit headers
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining && parseInt(remaining, 10) < 10) {
        result.errors.push(`GitHub rate limit low: ${remaining} requests remaining`);
      }

      if (!response.ok) {
        if (response.status === 403) {
          const resetTime = response.headers.get('x-ratelimit-reset');
          result.errors.push(`GitHub rate limit exceeded. Resets at ${resetTime ? new Date(parseInt(resetTime, 10) * 1000).toISOString() : 'unknown'}`);
        } else if (response.status === 401) {
          result.errors.push('GitHub authentication failed. Check your GITHUB_TOKEN.');
        } else if (response.status === 422) {
          result.errors.push(`Invalid search query: ${searchQuery}`);
        } else {
          result.errors.push(`GitHub API error: ${response.status}`);
        }
        return result;
      }

      const data: GitHubSearchResponse = await response.json();
      result.scannedItems = data.items.length;

      // Track repos seen
      const reposSeen = new Set<string>();

      for (const issue of data.items) {
        // Extract repo from repository_url
        const repoMatch = issue.repository_url.match(/repos\/([^/]+\/[^/]+)$/);
        if (!repoMatch) continue;

        const repo = repoMatch[1];
        reposSeen.add(repo);

        // Check if bounty-like
        const labelNames = issue.labels.map(l => l.name.toLowerCase());
        const isBountyLike = labelNames.some(l =>
          BOUNTY_LABELS.some(bl => l.includes(bl.toLowerCase()))
        );

        // Try to extract bounty amount from labels or body
        let bountyAmount: number | null = null;
        let bountyCurrency: string | null = null;

        // Check labels for amount (e.g., "$200", "bounty:100")
        for (const label of issue.labels) {
          const match = label.name.match(BOUNTY_AMOUNT_REGEX);
          if (match) {
            bountyAmount = parseFloat(match[1].replace(/,/g, ''));
            bountyCurrency = 'USD';
            break;
          }
        }

        // Check body if no amount in labels
        if (!bountyAmount && issue.body) {
          const match = issue.body.match(BOUNTY_AMOUNT_REGEX);
          if (match) {
            bountyAmount = parseFloat(match[1].replace(/,/g, ''));
            bountyCurrency = 'USD';
          }
        }

        const item: IssueItem = {
          url: issue.html_url,
          repo,
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

      result.scannedRepos = reposSeen.size;

      // Warn if incomplete results
      if (data.incomplete_results) {
        result.errors.push('GitHub search returned incomplete results. Consider narrowing your query.');
      }

    } catch (error) {
      result.errors.push(`GitHub search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

export const githubSearchConnector = new GitHubSearchConnector();
