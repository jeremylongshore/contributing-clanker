import { NextRequest, NextResponse } from 'next/server';

/**
 * Competition Detection API
 *
 * Checks for competing PRs on a bounty issue using GitHub API.
 * Returns open PRs that reference the issue number.
 */

interface CompetingPR {
  number: number;
  title: string;
  author: string;
  state: string;
  draft: boolean;
  createdAt: string;
  url: string;
}

interface CompetitionResult {
  issueNumber: number;
  repo: string;
  competingPRs: CompetingPR[];
  hasCompetition: boolean;
  competitionLevel: 'none' | 'low' | 'medium' | 'high';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo');
  const issue = searchParams.get('issue');

  if (!repo || !issue) {
    return NextResponse.json(
      { error: 'Missing repo or issue parameter' },
      { status: 400 }
    );
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'GitHub token not configured' },
      { status: 500 }
    );
  }

  try {
    const [owner, repoName] = repo.split('/');

    // Search for PRs that mention this issue
    const query = `
      query($owner: String!, $repo: String!, $searchQuery: String!) {
        search(query: $searchQuery, type: ISSUE, first: 20) {
          nodes {
            ... on PullRequest {
              number
              title
              state
              isDraft
              createdAt
              url
              author {
                login
              }
              closingIssuesReferences(first: 10) {
                nodes {
                  number
                }
              }
            }
          }
        }
      }
    `;

    const searchQuery = `repo:${owner}/${repoName} is:pr ${issue} in:body,title`;

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { owner, repo: repoName, searchQuery },
      }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error('GitHub GraphQL error:', data.errors);
      return NextResponse.json(
        { error: 'GitHub API error', details: data.errors },
        { status: 500 }
      );
    }

    const prs = data.data?.search?.nodes || [];
    const competingPRs: CompetingPR[] = prs
      .filter((pr: any) => pr && pr.number)
      .map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author?.login || 'unknown',
        state: pr.state,
        draft: pr.isDraft,
        createdAt: pr.createdAt,
        url: pr.url,
      }));

    // Filter to only open PRs
    const openPRs = competingPRs.filter(pr => pr.state === 'OPEN');

    const result: CompetitionResult = {
      issueNumber: parseInt(issue),
      repo,
      competingPRs: openPRs,
      hasCompetition: openPRs.length > 0,
      competitionLevel:
        openPRs.length === 0 ? 'none' :
        openPRs.length === 1 ? 'low' :
        openPRs.length <= 3 ? 'medium' : 'high',
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Competition check error:', error);
    return NextResponse.json(
      { error: 'Failed to check competition' },
      { status: 500 }
    );
  }
}
