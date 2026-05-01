/**
 * Public Proofs API
 *
 * Returns publicly visible completed bounties for the proof wall.
 * No authentication required - only shows public data.
 */

import { NextRequest, NextResponse } from 'next/server';

interface PublicProof {
  id: string;
  title: string;
  description?: string;
  value: number;
  repo: string;
  org: string;
  prUrl?: string;
  prNumber?: number;
  issueUrl?: string;
  proofUrl?: string;
  technologies: string[];
  completedAt: string;
  linesAdded?: number;
  linesRemoved?: number;
  cycleTime?: number;
}

// In production, this would fetch from Firestore
// For now, return sample data
const SAMPLE_PROOFS: PublicProof[] = [
  {
    id: 'proof-1',
    title: 'Fix authentication flow in Next.js app',
    description: 'Resolved race condition in OAuth callback handling',
    value: 150,
    repo: 'medplum/medplum',
    org: 'medplum',
    prUrl: 'https://github.com/medplum/medplum/pull/5231',
    prNumber: 5231,
    issueUrl: 'https://github.com/medplum/medplum/issues/5200',
    technologies: ['TypeScript', 'Next.js', 'OAuth'],
    completedAt: '2025-01-15T10:00:00Z',
    linesAdded: 145,
    linesRemoved: 23,
    cycleTime: 2
  },
  {
    id: 'proof-2',
    title: 'Add Tauri plugin for screen recording',
    description: 'Implemented native screen capture with audio support',
    value: 200,
    repo: 'screenpipe/screenpipe',
    org: 'screenpipe',
    prUrl: 'https://github.com/screenpipe/screenpipe/pull/1234',
    prNumber: 1234,
    technologies: ['Rust', 'Tauri', 'TypeScript'],
    completedAt: '2025-01-10T15:30:00Z',
    linesAdded: 456,
    linesRemoved: 12,
    cycleTime: 3
  },
  {
    id: 'proof-3',
    title: 'Optimize Python CLI startup time',
    description: 'Lazy imports reduced startup from 2s to 200ms',
    value: 100,
    repo: 'cortex-click/cortex',
    org: 'cortex-click',
    prUrl: 'https://github.com/cortex-click/cortex/pull/567',
    prNumber: 567,
    technologies: ['Python', 'CLI'],
    completedAt: '2025-01-05T09:00:00Z',
    linesAdded: 89,
    linesRemoved: 156,
    cycleTime: 1
  }
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const tech = searchParams.get('tech');
  const minValue = parseInt(searchParams.get('minValue') || '0', 10);

  try {
    // In production: fetch from Firestore with filters
    // const db = getFirebaseDb();
    // const q = query(
    //   collection(db, 'bounties'),
    //   where('status', '==', 'completed'),
    //   where('public', '==', true),
    //   orderBy('completedAt', 'desc'),
    //   limit(limit)
    // );

    let proofs = [...SAMPLE_PROOFS];

    // Apply filters
    if (tech) {
      proofs = proofs.filter(p =>
        p.technologies.some(t => t.toLowerCase() === tech.toLowerCase())
      );
    }

    if (minValue > 0) {
      proofs = proofs.filter(p => p.value >= minValue);
    }

    // Sort by completion date (newest first)
    proofs.sort((a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

    // Apply limit
    proofs = proofs.slice(0, limit);

    // Calculate stats
    const stats = {
      totalEarned: proofs.reduce((sum, p) => sum + p.value, 0),
      totalBounties: proofs.length,
      totalLinesAdded: proofs.reduce((sum, p) => sum + (p.linesAdded || 0), 0),
      technologies: [...new Set(proofs.flatMap(p => p.technologies))]
    };

    return NextResponse.json({
      proofs,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Public proofs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch proofs' },
      { status: 500 }
    );
  }
}
