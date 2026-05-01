/**
 * Algora API Integration
 *
 * Fetches bounties from Algora's public API.
 * API Docs: https://api.docs.algora.io/bounties
 */

import type { Bounty } from '@contribute/core';

// Tracked organizations on Algora
const TRACKED_ORGS = [
  'screenpipe',
  'calcom',
  'twentyhq',
  'formbricks',
  'maybe-finance',
  'trigger-dev',
  'plane-so',
  'documenso',
  'infisical',
  'hoppscotch',
];

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

function mapAlgoraStatus(status: string): string {
  switch (status) {
    case 'open': return 'open';
    case 'in_progress': return 'claimed';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
    default: return 'open';
  }
}

function mapAlgoraBountyToInternal(ab: AlgoraBounty): Bounty {
  return {
    id: `algora-${ab.id}`,
    title: ab.title,
    description: ab.description,
    value: ab.reward_amount,
    currency: ab.reward_currency || 'USD',
    status: mapAlgoraStatus(ab.status) as any,
    source: 'algora',
    repo: `${ab.repo_owner}/${ab.repo_name}`,
    org: ab.repo_owner,
    issue: ab.issue_number,
    issueUrl: ab.issue_url,
    domainId: 'default',
    labels: ab.labels || [],
    technologies: ab.skills || [],
    timeline: [],
    createdAt: ab.created_at,
    updatedAt: ab.updated_at,
  };
}

export async function getAlgoraBounties(options: {
  orgs?: string[];
  status?: 'open' | 'all';
  limit?: number;
  token?: string;
} = {}): Promise<Bounty[]> {
  const orgs = options.orgs || TRACKED_ORGS;
  const limit = options.limit || 100;
  const token = options.token || process.env.ALGORA_TOKEN;

  // Algora API requires authentication
  // Without a token, we can't fetch bounties programmatically
  if (!token) {
    console.warn('Algora API requires authentication. Set ALGORA_TOKEN or use session cookie.');
    console.warn('For now, use GitHub search or check https://console.algora.io directly.');
    return [];
  }

  const allBounties: Bounty[] = [];

  try {
    const url = new URL('https://console.algora.io/api/bounties');
    url.searchParams.set('limit', limit.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'bounty-system-cli/0.1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn('Algora authentication failed. Check your ALGORA_TOKEN.');
      } else {
        console.warn(`Algora API error: ${response.status}`);
      }
      return [];
    }

    const data: AlgoraResponse = await response.json();

    for (const bounty of data.bounties) {
      // Filter by org if specified
      if (orgs.length > 0 && !orgs.includes(bounty.repo_owner)) {
        continue;
      }
      allBounties.push(mapAlgoraBountyToInternal(bounty));
    }
  } catch (error: any) {
    console.warn(`Failed to fetch Algora bounties: ${error.message}`);
  }

  return allBounties;
}

export async function searchAlgoraBounties(options: {
  query?: string;
  minReward?: number;
  maxReward?: number;
  skills?: string[];
  limit?: number;
} = {}): Promise<Bounty[]> {
  try {
    const url = new URL('https://console.algora.io/api/bounties/search');

    if (options.query) {
      url.searchParams.set('q', options.query);
    }
    if (options.minReward) {
      url.searchParams.set('min_reward', options.minReward.toString());
    }
    if (options.maxReward) {
      url.searchParams.set('max_reward', options.maxReward.toString());
    }
    if (options.skills?.length) {
      url.searchParams.set('skills', options.skills.join(','));
    }
    url.searchParams.set('per_page', (options.limit || 50).toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'bounty-system-cli/0.1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Algora search API error: ${response.status}`);
    }

    const data: AlgoraResponse = await response.json();
    return data.bounties.map(mapAlgoraBountyToInternal);
  } catch (error: any) {
    console.warn(`Algora search failed: ${error.message}`);
    return [];
  }
}

export function getTrackedOrgs(): string[] {
  return [...TRACKED_ORGS];
}

export function addTrackedOrg(org: string): void {
  if (!TRACKED_ORGS.includes(org)) {
    TRACKED_ORGS.push(org);
  }
}
