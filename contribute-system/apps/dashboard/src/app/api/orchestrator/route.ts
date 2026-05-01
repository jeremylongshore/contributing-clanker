import { NextRequest, NextResponse } from 'next/server';

const ORCHESTRATOR_URL = process.env.BOUNTY_ORCHESTRATOR_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, bountyId, issueUrl, repo } = body;

    let endpoint: string;
    let method = 'POST';
    let payload: Record<string, unknown> | undefined;

    switch (action) {
      case 'start':
        endpoint = '/api/bounty/start';
        payload = {
          bounty_id: bountyId,
          issue_url: issueUrl,
          repo: repo,
        };
        break;
      case 'approve':
        endpoint = `/api/bounty/${bountyId}/approve`;
        break;
      case 'reject':
        endpoint = `/api/bounty/${bountyId}/reject`;
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const response = await fetch(`${ORCHESTRATOR_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Orchestrator error: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Orchestrator API error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to orchestrator' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bountyId = searchParams.get('bountyId');

    if (!bountyId) {
      return NextResponse.json({ error: 'Missing bountyId' }, { status: 400 });
    }

    const response = await fetch(
      `${ORCHESTRATOR_URL}/api/bounty/${bountyId}/status`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      // Bounty not started yet - return empty state
      if (response.status === 404) {
        return NextResponse.json({
          current_node: null,
          state: null,
        });
      }
      const error = await response.text();
      return NextResponse.json(
        { error: `Orchestrator error: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Orchestrator API error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to orchestrator' },
      { status: 500 }
    );
  }
}
