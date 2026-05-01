/**
 * GitHub Bounty Source
 *
 * Fetches bounty-labeled issues from GitHub using the GraphQL API.
 * No web scraping - pure API calls.
 */

import type {
  BountySourceClient,
  RawBounty,
  SearchOptions
} from './types';
import {
  parseValueFromLabels,
  parseDifficultyFromLabels
} from './types';

// GraphQL query for searching issues
const SEARCH_ISSUES_QUERY = `
query SearchBountyIssues($query: String!, $first: Int!, $after: String) {
  search(query: $query, type: ISSUE, first: $first, after: $after) {
    issueCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on Issue {
        id
        number
        title
        body
        state
        createdAt
        updatedAt
        url
        labels(first: 20) {
          nodes {
            name
          }
        }
        repository {
          nameWithOwner
          owner {
            login
          }
          primaryLanguage {
            name
          }
          languages(first: 10) {
            nodes {
              name
            }
          }
        }
        assignees(first: 10) {
          totalCount
        }
        comments {
          totalCount
        }
        timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], first: 50) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  state
                  url
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

// GraphQL query for fetching a single issue
const GET_ISSUE_QUERY = `
query GetIssue($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id
      number
      title
      body
      state
      createdAt
      updatedAt
      url
      labels(first: 20) {
        nodes {
          name
        }
      }
      repository {
        nameWithOwner
        owner {
          login
        }
        primaryLanguage {
          name
        }
        languages(first: 10) {
          nodes {
            name
          }
        }
      }
      assignees(first: 10) {
        totalCount
      }
      comments {
        totalCount
      }
      timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], first: 50) {
        nodes {
          ... on CrossReferencedEvent {
            source {
              ... on PullRequest {
                state
                url
              }
            }
          }
        }
      }
    }
  }
}
`;

export interface GitHubConfig {
  token: string;
  apiUrl?: string;  // Default: https://api.github.com/graphql
}

export class GitHubSource implements BountySourceClient {
  name = 'github' as const;
  private token: string;
  private apiUrl: string;

  constructor(config: GitHubConfig) {
    this.token = config.token;
    this.apiUrl = config.apiUrl || 'https://api.github.com/graphql';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: '{ viewer { login } }'
        })
      });
      const data = await response.json() as { errors?: unknown[] };
      return !data.errors;
    } catch {
      return false;
    }
  }

  async search(options: SearchOptions): Promise<RawBounty[]> {
    const query = this.buildSearchQuery(options);
    const limit = Math.min(options.limit || 50, 100);

    const response = await this.graphql<SearchResponse>(SEARCH_ISSUES_QUERY, {
      query,
      first: limit,
      after: options.offset ? btoa(`cursor:${options.offset}`) : null
    });

    if (!response.search?.nodes) {
      return [];
    }

    return response.search.nodes
      .filter((node): node is IssueNode => node !== null)
      .map(issue => this.normalizeIssue(issue));
  }

  async fetch(id: string): Promise<RawBounty | null> {
    // ID format: "owner/repo#123" or just "owner/repo/issues/123"
    const match = id.match(/^([^/]+)\/([^#/]+)(?:#|\/issues\/)(\d+)$/);
    if (!match) {
      console.error(`Invalid GitHub issue ID format: ${id}`);
      return null;
    }

    const [, owner, repo, number] = match;

    const response = await this.graphql<GetIssueResponse>(GET_ISSUE_QUERY, {
      owner,
      repo,
      number: parseInt(number, 10)
    });

    if (!response.repository?.issue) {
      return null;
    }

    return this.normalizeIssue(response.repository.issue);
  }

  /**
   * Search for bounties in specific repos
   */
  async searchRepos(repos: string[], options: Omit<SearchOptions, 'repos'> = {}): Promise<RawBounty[]> {
    const results: RawBounty[] = [];

    for (const repo of repos) {
      const bounties = await this.search({ ...options, repo });
      results.push(...bounties);
    }

    return results;
  }

  /**
   * Search for bounties in an organization
   */
  async searchOrg(org: string, options: Omit<SearchOptions, 'org'> = {}): Promise<RawBounty[]> {
    return this.search({ ...options, org });
  }

  private buildSearchQuery(options: SearchOptions): string {
    const parts: string[] = ['is:issue', 'is:open'];

    // Add bounty label filter
    const labels = options.labels || ['bounty'];
    for (const label of labels) {
      parts.push(`label:"${label}"`);
    }

    // Filter by org
    if (options.org) {
      parts.push(`org:${options.org}`);
    } else if (options.orgs && options.orgs.length > 0) {
      // Multiple orgs: need separate queries or use user:
      parts.push(`org:${options.orgs[0]}`);
    }

    // Filter by repo
    if (options.repo) {
      parts.push(`repo:${options.repo}`);
    } else if (options.repos && options.repos.length > 0) {
      parts.push(`repo:${options.repos[0]}`);
    }

    // State filter
    if (options.state === 'closed') {
      parts[1] = 'is:closed';
    } else if (options.state === 'all') {
      parts.splice(1, 1); // Remove state filter
    }

    // Sort
    if (options.sort) {
      const sortMap: Record<string, string> = {
        created: 'created',
        updated: 'updated',
        comments: 'comments'
      };
      if (sortMap[options.sort]) {
        parts.push(`sort:${sortMap[options.sort]}-${options.order || 'desc'}`);
      }
    }

    return parts.join(' ');
  }

  private normalizeIssue(issue: IssueNode): RawBounty {
    const labels = issue.labels?.nodes?.map(l => l.name) || [];
    const languages = issue.repository?.languages?.nodes?.map(l => l.name) || [];
    const primaryLang = issue.repository?.primaryLanguage?.name;

    // Count open PRs referencing this issue
    const openPRs = issue.timelineItems?.nodes?.filter(
      (node): node is CrossRefNode =>
        node?.source?.__typename === 'PullRequest' &&
        node.source.state === 'OPEN'
    ).length || 0;

    // Technologies from languages + labels
    const technologies = [...new Set([
      ...(primaryLang ? [primaryLang] : []),
      ...languages,
      ...this.extractTechFromLabels(labels)
    ])];

    return {
      source: 'github',
      sourceId: `${issue.repository?.nameWithOwner}#${issue.number}`,
      sourceUrl: issue.url,
      title: issue.title,
      description: issue.body?.slice(0, 1000),  // Truncate long bodies
      value: parseValueFromLabels(labels),
      labels,
      technologies,
      repo: issue.repository?.nameWithOwner,
      org: issue.repository?.owner?.login,
      issueNumber: issue.number,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      claimants: issue.assignees?.totalCount || 0,
      openPRs,
      difficulty: parseDifficultyFromLabels(labels),
      raw: issue
    };
  }

  private extractTechFromLabels(labels: string[]): string[] {
    const techKeywords = [
      'typescript', 'javascript', 'python', 'rust', 'go', 'golang',
      'java', 'kotlin', 'swift', 'ruby', 'php', 'c++', 'cpp',
      'react', 'vue', 'angular', 'svelte', 'nextjs', 'node',
      'django', 'flask', 'rails', 'spring', 'express',
      'docker', 'kubernetes', 'aws', 'gcp', 'azure'
    ];

    return labels.filter(label =>
      techKeywords.some(tech =>
        label.toLowerCase().includes(tech)
      )
    );
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GraphQLResponse<T>;

    if (data.errors) {
      throw new Error(`GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
    }

    return data.data;
  }
}

// TypeScript types for GraphQL responses

interface GraphQLResponse<T> {
  data: T;
  errors?: { message: string }[];
}

interface SearchResponse {
  search: {
    issueCount: number;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string;
    };
    nodes: (IssueNode | null)[];
  };
}

interface GetIssueResponse {
  repository: {
    issue: IssueNode | null;
  } | null;
}

interface IssueNode {
  id: string;
  number: number;
  title: string;
  body: string | null;
  state: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: {
    nodes: { name: string }[];
  } | null;
  repository: {
    nameWithOwner: string;
    owner: {
      login: string;
    };
    primaryLanguage: {
      name: string;
    } | null;
    languages: {
      nodes: { name: string }[];
    } | null;
  } | null;
  assignees: {
    totalCount: number;
  } | null;
  comments: {
    totalCount: number;
  };
  timelineItems: {
    nodes: (CrossRefNode | null)[];
  } | null;
}

interface CrossRefNode {
  source: {
    __typename: 'PullRequest';
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    url: string;
  } | null;
}

/**
 * Create a GitHub source client
 */
export function createGitHubSource(token: string): GitHubSource {
  return new GitHubSource({ token });
}
