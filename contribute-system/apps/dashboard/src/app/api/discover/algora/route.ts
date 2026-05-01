/**
 * Algora Bounty Discovery API Route
 *
 * Fetches bounties from Algora's public GraphQL API.
 * Algora is a bounty platform used by many open source projects.
 */

import { NextRequest, NextResponse } from 'next/server';

// Algora's public GraphQL endpoint
const ALGORA_API = 'https://console.algora.io/api/graphql';

// GraphQL query for fetching bounties
const BOUNTIES_QUERY = `
query GetBounties($first: Int!, $status: BountyStatus) {
  bounties(first: $first, status: $status) {
    edges {
      node {
        id
        title
        description
        rewardInCents
        status
        createdAt
        updatedAt
        url
        repository {
          name
          owner
          url
        }
        issue {
          number
          url
        }
        claims {
          totalCount
        }
        submissions {
          totalCount
        }
        technologies
      }
    }
    totalCount
  }
}
`;

interface AlgoraBounty {
  id: string;
  title: string;
  description?: string;
  value: number;
  status: string;
  repo: string;
  org: string;
  sourceUrl: string;
  issueUrl?: string;
  claimants: number;
  submissions: number;
  technologies: string[];
  createdAt: string;
  updatedAt: string;
}

interface BountyScore {
  total: number;
  grade: string;
  recommendation: 'claim' | 'consider' | 'skip';
  value: { normalized: number; raw: number; hourlyRate: number };
  complexity: { estimated: number; linesEstimate: number };
  competition: { score: number; claimants: number; submissions: number };
  fit: { score: number; matchedTech: string[]; unknownTech: string[] };
  warnings: string[];
  notes: string[];
}

function scoreBounty(bounty: AlgoraBounty, config: { knownTech: string[] }): BountyScore {
  // Value score (25%)
  const value = bounty.value;
  const valueScore = Math.min(100, (value / 500) * 100);
  const hourlyRate = value / Math.max(1, Math.ceil(value / 50));

  // Complexity score (25%)
  const descLength = bounty.description?.length || 0;
  const complexityRaw = Math.min(100, (descLength / 2000) * 100);
  const complexityScore = 100 - complexityRaw;
  const linesEstimate = Math.ceil(descLength / 50);

  // Competition score (25%)
  const competitionPenalty = (bounty.claimants * 20) + (bounty.submissions * 30);
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
    : 50;

  const total = Math.round(
    (valueScore * 0.25) +
    (complexityScore * 0.25) +
    (competitionScore * 0.25) +
    (fitScore * 0.25)
  );

  const grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 35 ? 'D' : 'F';
  const recommendation = total >= 70 ? 'claim' : total >= 45 ? 'consider' : 'skip';

  const warnings: string[] = [];
  if (bounty.claimants > 2) warnings.push(`${bounty.claimants} claims already`);
  if (bounty.submissions > 0) warnings.push(`${bounty.submissions} submissions pending`);

  const notes: string[] = [];
  if (matchedTech.length > 0) notes.push(`Familiar tech: ${matchedTech.join(', ')}`);

  return {
    total,
    grade,
    recommendation,
    value: { normalized: valueScore, raw: value, hourlyRate },
    complexity: { estimated: complexityScore, linesEstimate },
    competition: { score: competitionScore, claimants: bounty.claimants, submissions: bounty.submissions },
    fit: { score: fitScore, matchedTech, unknownTech },
    warnings,
    notes
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const status = searchParams.get('status') || 'OPEN';

  try {
    const response = await fetch(ALGORA_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: BOUNTIES_QUERY,
        variables: {
          first: Math.min(limit, 50),
          status: status.toUpperCase()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Algora API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(data.errors[0]?.message || 'GraphQL error');
    }

    const edges = data.data?.bounties?.edges || [];
    const knownTech = searchParams.get('knownTech')?.split(',') || [
      'TypeScript', 'JavaScript', 'Python', 'React', 'Node', 'Rust'
    ];

    const bounties: Array<AlgoraBounty & { score: BountyScore }> = edges.map(
      (edge: { node: Record<string, unknown> }) => {
        const node = edge.node;
        const bounty: AlgoraBounty = {
          id: node.id as string,
          title: node.title as string,
          description: node.description as string | undefined,
          value: ((node.rewardInCents as number) || 0) / 100,
          status: node.status as string,
          repo: `${(node.repository as Record<string, string>)?.owner}/${(node.repository as Record<string, string>)?.name}`,
          org: (node.repository as Record<string, string>)?.owner || '',
          sourceUrl: node.url as string,
          issueUrl: (node.issue as Record<string, string>)?.url,
          claimants: (node.claims as { totalCount: number })?.totalCount || 0,
          submissions: (node.submissions as { totalCount: number })?.totalCount || 0,
          technologies: (node.technologies as string[]) || [],
          createdAt: node.createdAt as string,
          updatedAt: node.updatedAt as string
        };

        const score = scoreBounty(bounty, { knownTech });
        return { ...bounty, score };
      }
    );

    bounties.sort((a, b) => b.score.total - a.score.total);

    return NextResponse.json({
      bounties,
      total: data.data?.bounties?.totalCount || 0,
      source: 'algora'
    });

  } catch (error) {
    console.error('Algora discovery error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Algora discovery failed' },
      { status: 500 }
    );
  }
}
