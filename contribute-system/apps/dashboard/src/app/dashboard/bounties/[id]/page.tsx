'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import {
  ArrowLeft,
  ExternalLink,
  GitPullRequest,
  Clock,
  DollarSign,
  FileCheck,
  PlayCircle,
  Bot,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Users,
  Shield,
  BookOpen,
  ChevronDown,
  ChevronUp,
  User,
  Activity,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { useBounty } from '@/lib/hooks/use-bounties';
import { useProofs } from '@/lib/hooks/use-proofs';
import { useWorkflow } from '@/lib/hooks/use-workflow';
import { useCompetition } from '@/lib/hooks/use-competition';
import { useGuidelines } from '@/lib/hooks/use-guidelines';
import { useMaintainer } from '@/lib/hooks/use-maintainer';

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  claimed: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  submitted: 'bg-cyan-100 text-cyan-800',
  vetting: 'bg-purple-100 text-purple-800',
  completed: 'bg-emerald-100 text-emerald-800',
  revision: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export default function BountyDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [showGuidelines, setShowGuidelines] = useState(false);

  const { bounty, loading: bountyLoading } = useBounty(id);
  const { proofs, loading: proofsLoading } = useProofs(id);
  const {
    status: workflowStatus,
    loading: workflowLoading,
    error: workflowError,
    startWorkflow,
    approveExecution,
    rejectExecution,
  } = useWorkflow(id);

  // Phase 2: Competition detection
  const { data: competition, loading: competitionLoading } = useCompetition(
    bounty?.repo,
    bounty?.issue
  );

  // Phase 2: Guidelines
  const { data: guidelines, loading: guidelinesLoading } = useGuidelines(bounty?.repo);

  // Phase 3: Maintainer profile
  const { profile: maintainer, loading: maintainerLoading } = useMaintainer(bounty?.repo);

  // Calculate staleness
  const getStaleness = () => {
    if (!bounty?.createdAt) return { days: 0, level: 'fresh' as const };
    const days = differenceInDays(new Date(), new Date(bounty.createdAt));
    const level = days <= 3 ? 'fresh' : days <= 7 ? 'aging' : 'stale';
    return { days, level };
  };

  // Calculate risk assessment
  const getRiskAssessment = () => {
    const staleness = getStaleness();
    let score = 100;
    const factors: { label: string; status: 'good' | 'warn' | 'bad'; detail: string }[] = [];

    // Competition factor
    if (competition?.hasCompetition) {
      const prCount = competition.competingPRs.length;
      if (prCount >= 3) {
        score -= 30;
        factors.push({ label: 'Competition', status: 'bad', detail: `${prCount} competing PRs` });
      } else if (prCount > 0) {
        score -= 15;
        factors.push({ label: 'Competition', status: 'warn', detail: `${prCount} competing PR(s)` });
      }
    } else {
      factors.push({ label: 'Competition', status: 'good', detail: 'No competing PRs' });
    }

    // Staleness factor
    if (staleness.level === 'stale') {
      score -= 25;
      factors.push({ label: 'Freshness', status: 'bad', detail: `${staleness.days} days old` });
    } else if (staleness.level === 'aging') {
      score -= 10;
      factors.push({ label: 'Freshness', status: 'warn', detail: `${staleness.days} days old` });
    } else {
      factors.push({ label: 'Freshness', status: 'good', detail: 'Posted recently' });
    }

    // Guidelines factor
    if (guidelines?.found) {
      factors.push({ label: 'Guidelines', status: 'good', detail: 'CONTRIBUTING.md available' });
    } else {
      score -= 10;
      factors.push({ label: 'Guidelines', status: 'warn', detail: 'No CONTRIBUTING.md' });
    }

    const level = score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high';
    return { score, level, factors };
  };

  if (bountyLoading) {
    return (
      <>
        <Header title="Bounty Details" />
        <div className="flex min-h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      </>
    );
  }

  if (!bounty) {
    return (
      <>
        <Header title="Bounty Not Found" />
        <div className="p-6">
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500">Bounty not found</p>
            <Link
              href="/dashboard/bounties"
              className="mt-4 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to bounties
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title={bounty.title} />

      <div className="p-6">
        {/* Back link */}
        <Link
          href="/dashboard/bounties"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to bounties
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {bounty.title}
                  </h1>
                  {bounty.repo && (
                    <p className="mt-1 text-gray-500 dark:text-gray-400">
                      {bounty.repo}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusColors[bounty.status]}`}>
                  {bounty.status.replace('_', ' ')}
                </span>
              </div>

              {bounty.description && (
                <p className="text-gray-700 dark:text-gray-300">
                  {bounty.description}
                </p>
              )}

              {/* Links */}
              <div className="mt-6 flex flex-wrap gap-4">
                {bounty.issue && (
                  <a
                    href={`https://github.com/${bounty.repo}/issues/${bounty.issue}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Issue #{bounty.issue}
                  </a>
                )}
                {bounty.pr && (
                  <a
                    href={`https://github.com/${bounty.repo}/pull/${bounty.pr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    <GitPullRequest className="h-4 w-4" />
                    PR #{bounty.pr}
                  </a>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Timeline
              </h2>

              {bounty.timeline && bounty.timeline.length > 0 ? (
                <div className="space-y-4">
                  {bounty.timeline.map((event, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                        <Clock className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {event.message}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(event.timestamp), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No timeline events</p>
              )}
            </div>

            {/* Proofs */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Proof of Work
              </h2>

              {proofsLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              ) : proofs.length > 0 ? (
                <div className="space-y-4">
                  {proofs.map((proof) => (
                    <div
                      key={proof.id}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileCheck className="h-5 w-5 text-green-500" />
                          <span className="font-medium text-gray-900 dark:text-white">
                            Proof Bundle
                          </span>
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(proof.createdAt), 'MMM d, yyyy')}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Files Changed</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {proof.filesChanged}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Lines Added</p>
                          <p className="font-medium text-green-600">+{proof.linesAdded}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Lines Deleted</p>
                          <p className="font-medium text-red-600">-{proof.linesDeleted}</p>
                        </div>
                      </div>

                      {proof.recordings && proof.recordings.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                            Recordings
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {proof.recordings.map((rec) => (
                              <a
                                key={rec.id}
                                href={rec.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                              >
                                <PlayCircle className="h-3 w-3" />
                                {Math.round(rec.duration / 60)}m
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No proof submitted yet</p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* AI Workflow Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">AI Workflow</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Powered by Bob&apos;s Brain</p>
                </div>
              </div>

              {workflowError && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {workflowError}
                  </div>
                </div>
              )}

              {!workflowStatus ? (
                <button
                  onClick={() => {
                    if (bounty?.repo && bounty?.issue) {
                      const issueUrl = `https://github.com/${bounty.repo}/issues/${bounty.issue}`;
                      startWorkflow(issueUrl, bounty.repo);
                    }
                  }}
                  disabled={workflowLoading || !bounty?.repo || !bounty?.issue}
                  className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {workflowLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                  Execute with Bob
                </button>
              ) : (
                <div className="space-y-4">
                  {/* Workflow Status */}
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        workflowStatus.currentNode === 'complete'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : workflowStatus.currentNode === 'approval'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {workflowStatus.currentNode === 'complete' ? 'Complete' :
                         workflowStatus.currentNode === 'approval' ? 'Awaiting Approval' :
                         workflowStatus.currentNode || 'Running'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Phase: {workflowStatus.phase || 'N/A'}
                    </div>
                  </div>

                  {/* Approval Buttons */}
                  {workflowStatus.currentNode === 'approval' && !workflowStatus.humanApproved && (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Review the plan and approve to execute:
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={approveExecution}
                          disabled={workflowLoading}
                          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {workflowLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Approve
                        </button>
                        <button
                          onClick={rejectExecution}
                          disabled={workflowLoading}
                          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {workflowLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Show execution result if complete */}
                  {workflowStatus.currentNode === 'complete' && workflowStatus.executionResult && (
                    <div className="text-sm">
                      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Result:</p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {JSON.stringify(workflowStatus.executionResult).slice(0, 100)}...
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Risk Assessment Card */}
            {(() => {
              const risk = getRiskAssessment();
              const staleness = getStaleness();
              return (
                <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      risk.level === 'low' ? 'bg-green-100 dark:bg-green-900/30' :
                      risk.level === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                      'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      <Shield className={`h-5 w-5 ${
                        risk.level === 'low' ? 'text-green-600 dark:text-green-400' :
                        risk.level === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Risk Assessment</h3>
                      <p className={`text-sm font-medium ${
                        risk.level === 'low' ? 'text-green-600 dark:text-green-400' :
                        risk.level === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {risk.level.toUpperCase()} RISK
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {risk.factors.map((factor, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{factor.label}</span>
                        <span className={`flex items-center gap-1 ${
                          factor.status === 'good' ? 'text-green-600 dark:text-green-400' :
                          factor.status === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                          {factor.status === 'good' ? <CheckCircle className="h-3 w-3" /> :
                           factor.status === 'warn' ? <AlertCircle className="h-3 w-3" /> :
                           <XCircle className="h-3 w-3" />}
                          {factor.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Competition Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  competition?.hasCompetition
                    ? 'bg-yellow-100 dark:bg-yellow-900/30'
                    : 'bg-green-100 dark:bg-green-900/30'
                }`}>
                  <Users className={`h-5 w-5 ${
                    competition?.hasCompetition
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-green-600 dark:text-green-400'
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Competition</h3>
                  {competitionLoading ? (
                    <p className="text-sm text-gray-500">Checking...</p>
                  ) : competition?.hasCompetition ? (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      {competition.competingPRs.length} competing PR(s)
                    </p>
                  ) : (
                    <p className="text-sm text-green-600 dark:text-green-400">No competition</p>
                  )}
                </div>
              </div>
              {competition?.competingPRs && competition.competingPRs.length > 0 && (
                <div className="space-y-2">
                  {competition.competingPRs.map((pr) => (
                    <a
                      key={pr.number}
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg bg-gray-50 p-2 text-sm hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700"
                    >
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-900 dark:text-white">#{pr.number}</span>
                        {pr.draft && (
                          <span className="text-xs text-gray-500">(draft)</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">@{pr.author}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Guidelines Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <button
                onClick={() => setShowGuidelines(!showGuidelines)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    guidelines?.found
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <BookOpen className={`h-5 w-5 ${
                      guidelines?.found
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-500'
                    }`} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Guidelines</h3>
                    {guidelinesLoading ? (
                      <p className="text-sm text-gray-500">Loading...</p>
                    ) : guidelines?.found ? (
                      <p className="text-sm text-blue-600 dark:text-blue-400">CONTRIBUTING.md</p>
                    ) : (
                      <p className="text-sm text-gray-500">Not available</p>
                    )}
                  </div>
                </div>
                {guidelines?.found && (
                  showGuidelines ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />
                )}
              </button>
              {showGuidelines && guidelines?.content && (
                <div className="mt-4 max-h-64 overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-700/50">
                  <pre className="whitespace-pre-wrap font-mono text-xs text-gray-700 dark:text-gray-300">
                    {guidelines.content.slice(0, 2000)}
                    {guidelines.content.length > 2000 && '...'}
                  </pre>
                </div>
              )}
            </div>

            {/* Maintainer Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Maintainer</h3>
              {maintainerLoading ? (
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ) : maintainer ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={maintainer.avatarUrl}
                      alt={maintainer.username}
                      className="h-12 w-12 rounded-full"
                    />
                    <div>
                      <a
                        href={`https://github.com/${maintainer.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                      >
                        @{maintainer.username}
                      </a>
                      {maintainer.name && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{maintainer.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Activity className="h-4 w-4" />
                        Responsiveness
                      </span>
                      <span className={`font-medium ${
                        maintainer.responsiveness === 'high' ? 'text-green-600 dark:text-green-400' :
                        maintainer.responsiveness === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                        maintainer.responsiveness === 'low' ? 'text-red-600 dark:text-red-400' :
                        'text-gray-500'
                      }`}>
                        {maintainer.responsiveness.charAt(0).toUpperCase() + maintainer.responsiveness.slice(1)}
                      </span>
                    </div>
                    {maintainer.recentActivity.lastActive && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Last active</span>
                        <span className="text-gray-900 dark:text-white">
                          {formatDistanceToNow(new Date(maintainer.recentActivity.lastActive), { addSuffix: true })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total commits</span>
                      <span className="text-gray-900 dark:text-white">
                        {maintainer.recentActivity.totalCommits}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total PRs reviewed</span>
                      <span className="text-gray-900 dark:text-white">
                        {maintainer.recentActivity.totalPrsReviewed}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                  <User className="h-8 w-8" />
                  <span className="text-sm">Maintainer info not available</span>
                </div>
              )}
            </div>

            {/* Value Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Bounty Value</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${bounty.value}
                  </p>
                </div>
              </div>
            </div>

            {/* Details Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Details</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Source</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{bounty.source}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {formatDistanceToNow(new Date(bounty.createdAt), { addSuffix: true })}
                  </dd>
                </div>
                {bounty.updatedAt && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Updated</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {formatDistanceToNow(new Date(bounty.updatedAt), { addSuffix: true })}
                    </dd>
                  </div>
                )}
                {bounty.categories && bounty.categories.length > 0 && (
                  <div>
                    <dt className="mb-2 text-gray-500 dark:text-gray-400">Categories</dt>
                    <dd className="flex flex-wrap gap-2">
                      {bounty.categories.map((cat) => (
                        <span
                          key={cat}
                          className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        >
                          {cat}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
