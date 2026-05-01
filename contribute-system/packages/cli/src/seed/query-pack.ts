/**
 * GitHub Search Query Pack for Bounty Seed Discovery
 *
 * Contains 25+ queries organized by category:
 * - Keyword/Payout (12 queries): money-related terms
 * - Label-based (6 queries): bounty-like labels
 * - Meta/Repo capability (7 queries): env signals, funding, etc.
 *
 * All queries use GitHub Search API via `gh` CLI.
 */

export interface SeedQuery {
  id: string;
  category: 'keyword' | 'label' | 'meta';
  description: string;
  query: string;
  apiType: 'issues' | 'repos' | 'code';
  expectedYield: 'high' | 'medium' | 'low';
}

/**
 * Full query pack - 25 queries meeting coverage requirements
 */
export const QUERY_PACK: SeedQuery[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // KEYWORD/PAYOUT QUERIES (12 queries - exceeds 10 minimum)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'kw-bounty-title',
    category: 'keyword',
    description: 'Issues with "bounty" in title/body',
    query: '"bounty" in:title,body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'high',
  },
  {
    id: 'kw-reward-title',
    category: 'keyword',
    description: 'Issues with "reward" in title/body',
    query: '"reward" in:title,body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },
  {
    id: 'kw-paid-title',
    category: 'keyword',
    description: 'Issues with "paid" in title/body',
    query: '"paid" in:title,body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },
  {
    id: 'kw-payout-title',
    category: 'keyword',
    description: 'Issues with "payout" in title/body',
    query: '"payout" in:title,body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'low',
  },
  {
    id: 'kw-crypto-currency',
    category: 'keyword',
    description: 'Issues mentioning crypto payouts',
    query: '"USDC" OR "ETH" OR "BTC" in:title,body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },
  {
    id: 'kw-dollar-amounts-low',
    category: 'keyword',
    description: 'Issues with dollar amounts ($50-200)',
    query: '"$50" OR "$75" OR "$100" OR "$150" OR "$200" in:body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'high',
  },
  {
    id: 'kw-dollar-amounts-med',
    category: 'keyword',
    description: 'Issues with dollar amounts ($250-500)',
    query: '"$250" OR "$300" OR "$400" OR "$500" in:body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },
  {
    id: 'kw-dollar-amounts-high',
    category: 'keyword',
    description: 'Issues with dollar amounts ($1000+)',
    query: '"$1000" OR "$1500" OR "$2000" OR "$5000" in:body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'low',
  },
  {
    id: 'kw-sponsored',
    category: 'keyword',
    description: 'Issues with "sponsored" in title/body',
    query: '"sponsored" in:title,body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'low',
  },
  {
    id: 'kw-tip-cash',
    category: 'keyword',
    description: 'Issues with "tip" or "cash" payouts',
    query: '"tip" OR "cash reward" in:title,body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'low',
  },
  {
    id: 'kw-algora-bounty',
    category: 'keyword',
    description: 'Issues with Algora bounty URLs',
    query: 'algora.io in:body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'high',
  },
  {
    id: 'kw-gitcoin-bounty',
    category: 'keyword',
    description: 'Issues with Gitcoin bounty references',
    query: 'gitcoin in:body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LABEL-BASED QUERIES (6 queries - exceeds 5 minimum)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'lbl-bounty',
    category: 'label',
    description: 'Issues with bounty label',
    query: 'label:bounty is:issue is:open',
    apiType: 'issues',
    expectedYield: 'high',
  },
  {
    id: 'lbl-reward',
    category: 'label',
    description: 'Issues with reward label',
    query: 'label:reward is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },
  {
    id: 'lbl-paid',
    category: 'label',
    description: 'Issues with paid label',
    query: 'label:paid is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },
  {
    id: 'lbl-sponsored',
    category: 'label',
    description: 'Issues with sponsored label',
    query: 'label:sponsored is:issue is:open',
    apiType: 'issues',
    expectedYield: 'low',
  },
  {
    id: 'lbl-help-wanted-bounty',
    category: 'label',
    description: 'Help wanted issues with bounty keywords',
    query: 'label:"help wanted" bounty in:body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },
  {
    id: 'lbl-gfi-bounty',
    category: 'label',
    description: 'Good first issue with bounty keywords',
    query: 'label:"good first issue" bounty in:body is:issue is:open',
    apiType: 'issues',
    expectedYield: 'medium',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // META/REPO CAPABILITY QUERIES (7 queries - exceeds 5 minimum)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'meta-funding-yml',
    category: 'meta',
    description: 'Repos with FUNDING.yml (sponsor-enabled)',
    query: 'path:.github/FUNDING.yml',
    apiType: 'code',
    expectedYield: 'high',
  },
  {
    id: 'meta-devcontainer',
    category: 'meta',
    description: 'Repos with devcontainer config',
    query: 'path:.devcontainer/devcontainer.json',
    apiType: 'code',
    expectedYield: 'high',
  },
  {
    id: 'meta-dockerfile',
    category: 'meta',
    description: 'Repos with Dockerfile',
    query: 'filename:Dockerfile path:/',
    apiType: 'code',
    expectedYield: 'high',
  },
  {
    id: 'meta-docker-compose',
    category: 'meta',
    description: 'Repos with docker-compose',
    query: 'filename:docker-compose.yml OR filename:docker-compose.yaml',
    apiType: 'code',
    expectedYield: 'high',
  },
  {
    id: 'meta-nix-flake',
    category: 'meta',
    description: 'Repos with Nix flake',
    query: 'filename:flake.nix',
    apiType: 'code',
    expectedYield: 'medium',
  },
  {
    id: 'meta-nix-shell',
    category: 'meta',
    description: 'Repos with shell.nix',
    query: 'filename:shell.nix',
    apiType: 'code',
    expectedYield: 'medium',
  },
  {
    id: 'meta-bazel',
    category: 'meta',
    description: 'Repos with Bazel workspace',
    query: 'filename:WORKSPACE OR filename:BUILD.bazel',
    apiType: 'code',
    expectedYield: 'medium',
  },
];

/**
 * Get queries by category
 */
export function getQueriesByCategory(category: SeedQuery['category']): SeedQuery[] {
  return QUERY_PACK.filter(q => q.category === category);
}

/**
 * Get query count by category
 */
export function getQueryCounts(): { keyword: number; label: number; meta: number; total: number } {
  return {
    keyword: QUERY_PACK.filter(q => q.category === 'keyword').length,
    label: QUERY_PACK.filter(q => q.category === 'label').length,
    meta: QUERY_PACK.filter(q => q.category === 'meta').length,
    total: QUERY_PACK.length,
  };
}

/**
 * Format query for gh CLI
 * Returns the appropriate gh command arguments
 */
export function formatGhCommand(query: SeedQuery, limit: number = 100): string[] {
  if (query.apiType === 'issues') {
    return ['search', 'issues', query.query, '--limit', String(limit), '--json',
      'number,title,body,url,state,labels,repository,createdAt,updatedAt'];
  } else if (query.apiType === 'code') {
    return ['search', 'code', query.query, '--limit', String(limit), '--json',
      'path,repository'];
  } else {
    return ['search', 'repos', query.query, '--limit', String(limit), '--json',
      'name,owner,url,stargazersCount,forksCount,language,description'];
  }
}

/**
 * Build gh api URL for advanced queries
 */
export function buildApiUrl(query: SeedQuery, page: number = 1, perPage: number = 100): string {
  const encodedQuery = encodeURIComponent(query.query);
  if (query.apiType === 'issues') {
    return `/search/issues?q=${encodedQuery}&per_page=${perPage}&page=${page}`;
  } else if (query.apiType === 'code') {
    return `/search/code?q=${encodedQuery}&per_page=${perPage}&page=${page}`;
  } else {
    return `/search/repositories?q=${encodedQuery}&per_page=${perPage}&page=${page}`;
  }
}
