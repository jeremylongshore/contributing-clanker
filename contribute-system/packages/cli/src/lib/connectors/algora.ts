/**
 * Algora Connector - Fetch bounties from Algora API
 */

import type { Connector, ConnectorConfig, IngestResult, IssueItem } from './types';

interface AlgoraBounty {
  id: string;
  title: string;
  description?: string;
  reward_amount: number;
  reward_currency: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  repo_owner: string;
  repo_name: string;
  issue_number: number;
  issue_url: string;
  created_at: string;
  updated_at: string;
  labels?: string[];
  skills?: string[];
}

interface AlgoraResponse {
  bounties: AlgoraBounty[];
  total: number;
  page: number;
  per_page: number;
}

export class AlgoraConnector implements Connector {
  name = 'algora';

  async fetch(config: ConnectorConfig): Promise<IngestResult> {
    const result: IngestResult = {
      scannedRepos: 0,
      scannedItems: 0,
      newItems: 0,
      updatedItems: 0,
      items: [],
      errors: []
    };

    const token = config.token || process.env.ALGORA_TOKEN;

    if (!token) {
      result.errors.push('ALGORA_TOKEN not configured. Set via env or bounty config set algoraToken <token>');
      return result;
    }

    try {
      const url = new URL('https://console.algora.io/api/bounties');
      url.searchParams.set('limit', String(config.limit || 100));

      // Use updatedSince for incremental fetching
      if (config.updatedSince) {
        url.searchParams.set('updated_after', config.updatedSince);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'User-Agent': 'bounty-system-cli/0.2.0'
        }
      });

      if (!response.ok) {
        if (response.status === 429) {
          result.errors.push('Algora rate limit hit. Try again later.');
        } else if (response.status === 401 || response.status === 403) {
          result.errors.push('Algora authentication failed. Check your ALGORA_TOKEN.');
        } else {
          result.errors.push(`Algora API error: ${response.status}`);
        }
        return result;
      }

      const data: AlgoraResponse = await response.json();
      result.scannedItems = data.bounties.length;

      // Track repos seen
      const reposSeen = new Set<string>();

      for (const bounty of data.bounties) {
        const repo = `${bounty.repo_owner}/${bounty.repo_name}`;
        reposSeen.add(repo);

        // Only include open bounties (or all if not filtering)
        if (bounty.status !== 'open') continue;

        const item: IssueItem = {
          url: bounty.issue_url,
          repo,
          issueNumber: bounty.issue_number,
          title: bounty.title,
          bodyExcerpt: truncate(bounty.description || '', 500),
          labels: bounty.labels || [],
          state: 'open',
          updatedAt: bounty.updated_at,
          bountyAmount: bounty.reward_amount,
          bountyCurrency: bounty.reward_currency || 'USD',
          isPaid: true,
          isBountyLike: true
        };

        result.items.push(item);
      }

      result.scannedRepos = reposSeen.size;

    } catch (error) {
      result.errors.push(`Algora fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

export const algoraConnector = new AlgoraConnector();
