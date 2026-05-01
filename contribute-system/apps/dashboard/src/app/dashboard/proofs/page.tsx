'use client';

import { format } from 'date-fns';
import Link from 'next/link';
import {
  FileCheck,
  PlayCircle,
  Code,
  Image as ImageIcon,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { useProofs } from '@/lib/hooks/use-proofs';
import { useBounties } from '@/lib/hooks/use-bounties';

export default function ProofsPage() {
  const { proofs, loading } = useProofs();
  const { bounties } = useBounties();

  // Create a map for quick bounty lookup
  const bountyMap = new Map(bounties.map(b => [b.id, b]));

  if (loading) {
    return (
      <>
        <Header title="Proofs" />
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Proofs" />

      <div className="p-6">
        {/* Stats Summary */}
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Proofs</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {proofs.length}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Recordings</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {proofs.reduce((sum, p) => sum + (p.recordings?.length || 0), 0)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Lines Added</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              +{proofs.reduce((sum, p) => sum + (p.linesAdded || 0), 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Lines Deleted</p>
            <p className="mt-1 text-2xl font-bold text-red-600">
              -{proofs.reduce((sum, p) => sum + (p.linesDeleted || 0), 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Proofs List */}
        {proofs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
            <FileCheck className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-500 dark:text-gray-400">No proofs yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Complete bounties to generate proof bundles
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {proofs.map((proof) => {
              const bounty = bountyMap.get(proof.bountyId);

              return (
                <div
                  key={proof.id}
                  className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                        <FileCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <Link
                          href={`/dashboard/bounties/${proof.bountyId}`}
                          className="font-semibold text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                        >
                          {bounty?.title || `Bounty ${proof.bountyId}`}
                        </Link>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(proof.createdAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>

                    {proof.vetting && (
                      <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                        proof.vetting.status === 'passed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {proof.vetting.status === 'passed' ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {proof.vetting.passed}/{proof.vetting.stages} passed
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {proof.filesChanged} files
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-600">
                        +{proof.linesAdded}
                      </span>
                      <span className="text-sm font-medium text-red-600">
                        -{proof.linesDeleted}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PlayCircle className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {proof.recordings?.length || 0} recordings
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {proof.screenshots?.length || 0} screenshots
                      </span>
                    </div>
                  </div>

                  {/* Recordings */}
                  {proof.recordings && proof.recordings.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {proof.recordings.map((rec) => (
                        <a
                          key={rec.id}
                          href={rec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                          <PlayCircle className="h-4 w-4" />
                          Recording ({Math.round(rec.duration / 60)}m)
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
