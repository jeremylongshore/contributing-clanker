import { NextRequest, NextResponse } from 'next/server';

/**
 * Guidelines API
 *
 * Fetches CONTRIBUTING.md from a GitHub repository.
 * Returns raw markdown content for rendering.
 */

interface GuidelinesResult {
  repo: string;
  content: string | null;
  found: boolean;
  path: string | null;
}

const CONTRIBUTING_PATHS = [
  'CONTRIBUTING.md',
  '.github/CONTRIBUTING.md',
  'docs/CONTRIBUTING.md',
  'contributing.md',
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo');

  if (!repo) {
    return NextResponse.json(
      { error: 'Missing repo parameter' },
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

    // Try each possible path for CONTRIBUTING.md
    for (const path of CONTRIBUTING_PATHS) {
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.raw+json',
        },
      });

      if (response.ok) {
        const content = await response.text();

        const result: GuidelinesResult = {
          repo,
          content,
          found: true,
          path,
        };

        return NextResponse.json(result);
      }
    }

    // No CONTRIBUTING.md found
    const result: GuidelinesResult = {
      repo,
      content: null,
      found: false,
      path: null,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Guidelines fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guidelines' },
      { status: 500 }
    );
  }
}
