import { NextRequest, NextResponse } from 'next/server';

/**
 * Maintainer Profile API
 *
 * Fetches maintainer info from GitHub including activity metrics.
 * Helps bounty hunters assess if maintainer is responsive.
 */

interface MaintainerProfile {
  username: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  recentActivity: {
    lastActive: string | null;
    totalCommits: number;
    totalIssues: number;
    totalPrsReviewed: number;
  };
  responsiveness: 'high' | 'medium' | 'low' | 'unknown';
}

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
    // Validate repo format (owner/repo)
    const parts = repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return NextResponse.json(
        { error: 'Invalid repo format. Expected owner/repo' },
        { status: 400 }
      );
    }
    const [owner] = parts;

    // Fetch user profile
    const userRes = await fetch(`https://api.github.com/users/${owner}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    if (!userRes.ok) {
      return NextResponse.json(
        { error: 'User not found', found: false },
        { status: 404 }
      );
    }

    const user = await userRes.json();

    // Fetch recent activity using GraphQL
    const activityQuery = `
      query($owner: String!) {
        user(login: $owner) {
          contributionsCollection {
            totalCommitContributions
            totalIssueContributions
            totalPullRequestContributions
            totalPullRequestReviewContributions
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                }
              }
            }
          }
        }
      }
    `;

    const activityRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: activityQuery,
        variables: { owner },
      }),
    });

    const activityData = await activityRes.json();
    const contributions = activityData.data?.user?.contributionsCollection;

    // Calculate last active date
    let lastActive: string | null = null;
    if (contributions?.contributionCalendar?.weeks) {
      const weeks = contributions.contributionCalendar.weeks;
      for (let i = weeks.length - 1; i >= 0; i--) {
        const days = weeks[i].contributionDays;
        for (let j = days.length - 1; j >= 0; j--) {
          if (days[j].contributionCount > 0) {
            lastActive = days[j].date;
            break;
          }
        }
        if (lastActive) break;
      }
    }

    // Calculate responsiveness based on activity and recency
    const totalContributions = contributions?.contributionCalendar?.totalContributions || 0;
    let responsiveness: MaintainerProfile['responsiveness'] = 'unknown';

    // Factor in both total activity and recency
    const daysSinceActive = lastActive
      ? Math.floor((Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (totalContributions > 500 && daysSinceActive <= 7) {
      responsiveness = 'high';
    } else if (totalContributions > 100 && daysSinceActive <= 30) {
      responsiveness = 'medium';
    } else if (totalContributions > 0 && daysSinceActive <= 90) {
      responsiveness = 'low';
    }

    const profile: MaintainerProfile = {
      username: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      company: user.company,
      location: user.location,
      publicRepos: user.public_repos,
      followers: user.followers,
      recentActivity: {
        lastActive,
        totalCommits: contributions?.totalCommitContributions || 0,
        totalIssues: contributions?.totalIssueContributions || 0,
        totalPrsReviewed: contributions?.totalPullRequestReviewContributions || 0,
      },
      responsiveness,
    };

    return NextResponse.json({ profile, found: true });
  } catch (error) {
    console.error('Maintainer profile error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maintainer profile' },
      { status: 500 }
    );
  }
}
