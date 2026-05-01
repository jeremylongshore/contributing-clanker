/**
 * Bounty Discovery API Route
 *
 * Server-side endpoint for discovering and scoring bounties from GitHub.
 * Keeps API tokens secure (not exposed to client).
 */

import { NextRequest, NextResponse } from 'next/server';

// GitHub GraphQL query for searching bounty issues
const SEARCH_ISSUES_QUERY = `
query SearchBountyIssues($query: String!, $first: Int!) {
  search(query: $query, type: ISSUE, first: $first) {
    issueCount
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

interface SearchParams {
  org?: string;
  repo?: string;
  label?: string;
  limit?: number;
}

interface RawBounty {
  id: string;
  title: string;
  description?: string;
  value: number | null;
  labels: string[];
  technologies: string[];
  repo: string;
  org: string;
  sourceUrl: string;
  claimants: number;
  openPRs: number;
  createdAt: string;
  updatedAt: string;
}

interface BountyScore {
  total: number;
  grade: string;
  recommendation: 'claim' | 'consider' | 'skip';
  value: { normalized: number; raw: number | null; hourlyRate: number };
  complexity: { estimated: number; linesEstimate: number };
  competition: { score: number; claimants: number; openPRs: number };
  fit: { score: number; repoFamiliarity: string; matchedTech: string[]; unknownTech: string[] };
  warnings: string[];
  notes: string[];
  confidence: number;
}

// Parse bounty value from labels (e.g., "$50", "💎 $100")
function parseValueFromLabels(labels: string[]): number | null {
  for (const label of labels) {
    const match = label.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

// Extract technologies from labels
function extractTechFromLabels(labels: string[]): string[] {
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

// Simple scoring algorithm (server-side version)
function scoreBounty(bounty: RawBounty, config: { knownTech: string[] }): BountyScore {
  // Value score (25%)
  const value = bounty.value || 0;
  const valueScore = Math.min(100, (value / 500) * 100);
  const hourlyRate = value / Math.max(1, Math.ceil(value / 50)); // Rough estimate

  // Complexity score (25%) - inverse, lower is better
  const bodyLength = bounty.description?.length || 0;
  const complexityRaw = Math.min(100, (bodyLength / 2000) * 100);
  const complexityScore = 100 - complexityRaw;
  const linesEstimate = Math.ceil(bodyLength / 50);

  // Competition score (25%) - fewer claimants is better
  const competitionPenalty = (bounty.claimants * 20) + (bounty.openPRs * 30);
  const competitionScore = Math.max(0, 100 - competitionPenalty);

  // Tech fit score (25%)
  const matchedTech = bounty.technologies.filter(t =>
    config.knownTech.some(kt => kt.toLowerCase() === t.toLowerCase())
  );
  const unknownTech = bounty.technologies.filter(t =>
    !config.knownTech.some(kt => kt.toLowerCase() === t.toLowerCase())
  );
  const fitScore = bounty.technologies.length > 0
    ? (matchedTech.length / bounty.technologies.length) * 100
    : 50; // Unknown = neutral

  // Total score
  const total = Math.round(
    (valueScore * 0.25) +
    (complexityScore * 0.25) +
    (competitionScore * 0.25) +
    (fitScore * 0.25)
  );

  // Grade
  const grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 35 ? 'D' : 'F';

  // Recommendation
  const recommendation = total >= 70 ? 'claim' : total >= 45 ? 'consider' : 'skip';

  // Warnings
  const warnings: string[] = [];
  if (bounty.claimants > 2) warnings.push(`High competition: ${bounty.claimants} claimants`);
  if (bounty.openPRs > 0) warnings.push(`${bounty.openPRs} open PRs already`);
  if (!bounty.value) warnings.push('No value specified');

  // Notes
  const notes: string[] = [];
  if (matchedTech.length > 0) notes.push(`Familiar tech: ${matchedTech.join(', ')}`);

  return {
    total,
    grade,
    recommendation,
    value: { normalized: valueScore, raw: bounty.value, hourlyRate },
    complexity: { estimated: complexityScore, linesEstimate },
    competition: { score: competitionScore, claimants: bounty.claimants, openPRs: bounty.openPRs },
    fit: { score: fitScore, repoFamiliarity: 'unknown', matchedTech, unknownTech },
    warnings,
    notes,
    confidence: 70
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const org = searchParams.get('org') || undefined;
  const repo = searchParams.get('repo') || undefined;
  const label = searchParams.get('label') || 'bounty';
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  // Get GitHub token from environment (server-side only)
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'GitHub token not configured' },
      { status: 500 }
    );
  }

  try {
    // Build search query
    const queryParts = ['is:issue', 'is:open', `label:"${label}"`];
    if (org) queryParts.push(`org:${org}`);
    if (repo) queryParts.push(`repo:${repo}`);
    queryParts.push('sort:updated-desc');

    const query = queryParts.join(' ');

    // Fetch from GitHub GraphQL
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: SEARCH_ISSUES_QUERY,
        variables: { query, first: Math.min(limit, 100) }
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(data.errors[0]?.message || 'GraphQL error');
    }

    // Normalize issues to bounties
    const issues = data.data?.search?.nodes || [];
    const bounties: Array<RawBounty & { score: BountyScore }> = [];

    // Get scoring config from query params or use defaults
    const knownTech = searchParams.get('knownTech')?.split(',') || [
      'TypeScript', 'JavaScript', 'Python', 'React', 'Node'
    ];

    for (const issue of issues) {
      if (!issue) continue;

      const labels = issue.labels?.nodes?.map((l: { name: string }) => l.name) || [];
      const languages = issue.repository?.languages?.nodes?.map((l: { name: string }) => l.name) || [];
      const primaryLang = issue.repository?.primaryLanguage?.name;

      // Count open PRs
      const openPRs = issue.timelineItems?.nodes?.filter(
        (node: { source?: { state?: string } } | null) =>
          node?.source?.state === 'OPEN'
      ).length || 0;

      const bounty: RawBounty = {
        id: `${issue.repository?.nameWithOwner}#${issue.number}`,
        title: issue.title,
        description: issue.body?.slice(0, 1000),
        value: parseValueFromLabels(labels),
        labels,
        technologies: [...new Set([
          ...(primaryLang ? [primaryLang] : []),
          ...languages,
          ...extractTechFromLabels(labels)
        ])],
        repo: issue.repository?.nameWithOwner || '',
        org: issue.repository?.owner?.login || '',
        sourceUrl: issue.url,
        claimants: issue.assignees?.totalCount || 0,
        openPRs,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt
      };

      const score = scoreBounty(bounty, { knownTech });
      bounties.push({ ...bounty, score });
    }

    // Sort by score descending
    bounties.sort((a, b) => b.score.total - a.score.total);

    return NextResponse.json({
      bounties,
      total: data.data?.search?.issueCount || 0,
      query
    });

  } catch (error) {
    console.error('Discovery error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Discovery failed' },
      { status: 500 }
    );
  }
}
