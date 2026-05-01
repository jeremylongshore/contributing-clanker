'use client';

/**
 * Public Proof Wall
 *
 * Showcase of completed bounties with proof recordings,
 * PR links, and earnings. Public portfolio/reputation builder.
 */

import { useState, useEffect } from 'react';
import {
  Trophy,
  ExternalLink,
  Github,
  Play,
  Calendar,
  DollarSign,
  Code,
  CheckCircle,
  Filter
} from 'lucide-react';

interface CompletedBounty {
  id: string;
  title: string;
  description?: string;
  value: number;
  repo: string;
  org: string;
  prUrl?: string;
  prNumber?: number;
  issueUrl?: string;
  proofUrl?: string;  // Asciinema recording URL
  technologies: string[];
  completedAt: string;
  linesAdded?: number;
  linesRemoved?: number;
  cycleTime?: number;  // Days from claim to completion
}

// Sample data for demo (in production, fetch from Firestore)
const SAMPLE_PROOFS: CompletedBounty[] = [
  {
    id: '1',
    title: 'Fix authentication flow in Next.js app',
    description: 'Resolved race condition in OAuth callback handling',
    value: 150,
    repo: 'org/repo',
    org: 'org',
    prUrl: 'https://github.com/org/repo/pull/123',
    prNumber: 123,
    issueUrl: 'https://github.com/org/repo/issues/100',
    proofUrl: 'https://asciinema.org/a/demo1',
    technologies: ['TypeScript', 'Next.js', 'OAuth'],
    completedAt: '2025-01-15T10:00:00Z',
    linesAdded: 145,
    linesRemoved: 23,
    cycleTime: 2
  },
  {
    id: '2',
    title: 'Add dark mode support to dashboard',
    description: 'Implemented system-aware dark mode with Tailwind CSS',
    value: 100,
    repo: 'company/dashboard',
    org: 'company',
    prUrl: 'https://github.com/company/dashboard/pull/456',
    prNumber: 456,
    technologies: ['React', 'Tailwind CSS', 'CSS'],
    completedAt: '2025-01-10T15:30:00Z',
    linesAdded: 312,
    linesRemoved: 45,
    cycleTime: 1
  },
  {
    id: '3',
    title: 'Optimize database queries for user search',
    description: 'Added composite indexes and query caching',
    value: 200,
    repo: 'startup/backend',
    org: 'startup',
    prUrl: 'https://github.com/startup/backend/pull/789',
    prNumber: 789,
    technologies: ['Python', 'PostgreSQL', 'Redis'],
    completedAt: '2025-01-05T09:00:00Z',
    linesAdded: 89,
    linesRemoved: 156,
    cycleTime: 3
  }
];

export default function ProofWallPage() {
  const [proofs, setProofs] = useState<CompletedBounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    // In production, fetch from /api/proofs/public
    // For now, use sample data
    setTimeout(() => {
      setProofs(SAMPLE_PROOFS);
      setLoading(false);
    }, 500);
  }, []);

  const totalEarned = proofs.reduce((sum, p) => sum + p.value, 0);
  const totalBounties = proofs.length;
  const totalLines = proofs.reduce((sum, p) => sum + (p.linesAdded || 0), 0);

  const technologies = [...new Set(proofs.flatMap(p => p.technologies))];

  const filteredProofs = filter === 'all'
    ? proofs
    : proofs.filter(p => p.technologies.includes(filter));

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-yellow-500" />
              <div>
                <h1 className="text-2xl font-bold text-white">Proof Wall</h1>
                <p className="text-sm text-gray-400">Verified bounty completions</p>
              </div>
            </div>
            <a
              href="/"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Dashboard
            </a>
          </div>
        </div>
      </header>

      {/* Stats Banner */}
      <div className="border-b border-gray-700 bg-gray-800/50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-3xl font-bold text-green-400">
                <DollarSign className="h-8 w-8" />
                {totalEarned.toLocaleString()}
              </div>
              <p className="mt-1 text-sm text-gray-400">Total Earned</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-3xl font-bold text-blue-400">
                <CheckCircle className="h-8 w-8" />
                {totalBounties}
              </div>
              <p className="mt-1 text-sm text-gray-400">Bounties Completed</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-3xl font-bold text-purple-400">
                <Code className="h-8 w-8" />
                +{totalLines.toLocaleString()}
              </div>
              <p className="mt-1 text-sm text-gray-400">Lines Added</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Filters */}
        <div className="mb-6 flex items-center gap-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {technologies.map(tech => (
              <button
                key={tech}
                onClick={() => setFilter(tech)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === tech
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tech}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        )}

        {/* Proof Cards */}
        {!loading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredProofs.map(proof => (
              <div
                key={proof.id}
                className="group rounded-xl bg-gray-800 p-6 shadow-lg transition-all hover:bg-gray-750 hover:shadow-xl"
              >
                {/* Value Badge */}
                <div className="mb-4 flex items-center justify-between">
                  <span className="rounded-full bg-green-500/20 px-3 py-1 text-sm font-bold text-green-400">
                    ${proof.value}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-gray-400">
                    <Calendar className="h-4 w-4" />
                    {formatDate(proof.completedAt)}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {proof.title}
                </h3>

                {/* Description */}
                {proof.description && (
                  <p className="mb-4 text-sm text-gray-400">
                    {proof.description}
                  </p>
                )}

                {/* Technologies */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {proof.technologies.map(tech => (
                    <span
                      key={tech}
                      className="rounded-full bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300"
                    >
                      {tech}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="mb-4 flex items-center gap-4 text-sm text-gray-400">
                  {proof.linesAdded && (
                    <span className="text-green-400">+{proof.linesAdded}</span>
                  )}
                  {proof.linesRemoved && (
                    <span className="text-red-400">-{proof.linesRemoved}</span>
                  )}
                  {proof.cycleTime && (
                    <span>{proof.cycleTime}d cycle</span>
                  )}
                </div>

                {/* Links */}
                <div className="flex flex-wrap gap-2">
                  {proof.prUrl && (
                    <a
                      href={proof.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-600"
                    >
                      <Github className="h-4 w-4" />
                      PR #{proof.prNumber}
                    </a>
                  )}
                  {proof.proofUrl && (
                    <a
                      href={proof.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-primary-600/20 px-3 py-2 text-sm text-primary-400 hover:bg-primary-600/30"
                    >
                      <Play className="h-4 w-4" />
                      Watch Proof
                    </a>
                  )}
                  {proof.issueUrl && (
                    <a
                      href={proof.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Issue
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredProofs.length === 0 && (
          <div className="rounded-xl bg-gray-800 p-12 text-center">
            <Trophy className="mx-auto h-12 w-12 text-gray-600" />
            <h3 className="mt-4 text-lg font-medium text-white">
              No proofs yet
            </h3>
            <p className="mt-2 text-gray-400">
              Completed bounties will appear here
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700 bg-gray-900/50 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-500">
          Powered by Bounty System • All proofs cryptographically verified
        </div>
      </footer>
    </div>
  );
}
