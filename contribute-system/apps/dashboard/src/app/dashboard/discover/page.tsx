'use client';

/**
 * Bounty Discovery Page
 *
 * Search and score bounties from GitHub and Algora.
 * Uses the scoring algorithm to recommend best opportunities.
 * Mobile-first card-based UI with risk assessment.
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, AlertCircle, RefreshCw, Settings } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { BountyCard, type BountyCardData } from '@/components/bounty/bounty-card';
import { useDiscoverBounties, type DiscoveredBounty } from '@/lib/hooks/use-discover';

type Source = 'github' | 'algora' | 'all';
type Filter = 'all' | 'claim' | 'consider' | 'skip';

export default function DiscoverPage() {
  const [source, setSource] = useState<Source>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [searchOrg, setSearchOrg] = useState('');
  const [searchRepo, setSearchRepo] = useState('');
  const [searchLabel, setSearchLabel] = useState('bounty');
  const [showFilters, setShowFilters] = useState(false);

  // Use the discovery hook with auto-fetch
  const {
    bounties,
    loading,
    error,
    lastQuery,
    refresh,
  } = useDiscoverBounties({
    source,
    org: searchOrg || undefined,
    repo: searchRepo || undefined,
    label: searchLabel,
    autoFetch: true,
  });

  // Manual search with current filters
  const discover = useCallback(() => {
    refresh();
  }, [refresh]);

  const filteredBounties = bounties.filter(b => {
    if (filter === 'all') return true;
    return b.score.recommendation === filter;
  });


  // Convert API response to card format
  const toBountyCardData = (bounty: DiscoveredBounty): BountyCardData => {
    const postedDate = bounty.createdAt || bounty.updatedAt;
    const staleDays = postedDate
      ? Math.floor((Date.now() - new Date(postedDate).getTime()) / (1000 * 60 * 60 * 24))
      : 3;

    return {
      id: bounty.id,
      title: bounty.title,
      repo: bounty.repo,
      value: bounty.value,
      difficulty: bounty.score.complexity.estimated >= 70 ? 'hard' : bounty.score.complexity.estimated >= 40 ? 'medium' : 'easy',
      estimatedHours: `${Math.ceil(bounty.score.complexity.linesEstimate / 50)}-${Math.ceil(bounty.score.complexity.linesEstimate / 30)}h`,
      matchScore: bounty.score.total / 100,
      staleness: {
        days: staleDays,
        status: staleDays <= 2 ? 'fresh' : staleDays <= 7 ? 'aging' : 'stale',
      },
      competition: {
        prs: bounty.openPRs || 0,
        claimants: bounty.claimants,
        status: (bounty.openPRs || 0) === 0 ? 'none' : (bounty.openPRs || 0) <= 1 ? 'low' : 'high',
      },
      maintainer: {
        active: bounty.score.competition.score >= 50,
        lastActive: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      sourceUrl: bounty.sourceUrl,
      postedAt: postedDate ? new Date(postedDate) : new Date(),
    };
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-white px-4 py-3 dark:bg-gray-800">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search bounties..."
              value={searchOrg || searchRepo}
              onChange={(e) => setSearchOrg(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="ml-3 rounded-lg bg-gray-100 p-2.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Filters - Mobile */}
        <div className="flex gap-2 overflow-x-auto bg-white px-4 py-2 dark:bg-gray-800">
          {(['all', 'claim', 'consider', 'skip'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button
            onClick={discover}
            disabled={loading}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden md:block">
        <Header title="Discover Bounties" />
      </div>

      <div className="p-4 md:p-6">
        {/* Desktop Search Controls */}
        <div className="mb-6 hidden rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800 md:block">
          <div className="grid gap-4 md:grid-cols-4">
            {/* Source Selector */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as Source)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="github">GitHub</option>
                <option value="algora">Algora</option>
                <option value="all">All Sources</option>
              </select>
            </div>

            {/* Org Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Organization
              </label>
              <input
                type="text"
                value={searchOrg}
                onChange={(e) => setSearchOrg(e.target.value)}
                placeholder="e.g., screenpipe"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
              />
            </div>

            {/* Repo Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Repository
              </label>
              <input
                type="text"
                value={searchRepo}
                onChange={(e) => setSearchRepo(e.target.value)}
                placeholder="e.g., owner/repo"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
              />
            </div>

            {/* Label Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Bounty Label
              </label>
              <input
                type="text"
                value={searchLabel}
                onChange={(e) => setSearchLabel(e.target.value)}
                placeholder="bounty"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={discover}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2 text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              {loading ? 'Searching...' : 'Discover Bounties'}
            </button>

            {lastQuery && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Query: {lastQuery}
              </span>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {bounties.length > 0 && (
          <>
            {/* Desktop Filter Tabs */}
            <div className="mb-4 hidden items-center justify-between md:flex">
              <div className="flex gap-2">
                {(['all', 'claim', 'consider', 'skip'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      filter === f
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    {f !== 'all' && (
                      <span className="ml-2 text-xs opacity-75">
                        ({bounties.filter(b => b.score.recommendation === f).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {filteredBounties.length} bounties found
              </span>
            </div>

            {/* Mobile Results Count */}
            <div className="mb-3 text-sm text-gray-500 dark:text-gray-400 md:hidden">
              {filteredBounties.length} bounties found
            </div>

            {/* Bounty Cards - Mobile optimized */}
            <div className="space-y-3 md:space-y-4">
              {filteredBounties.map((bounty) => (
                <BountyCard
                  key={bounty.id}
                  bounty={toBountyCardData(bounty)}
                  onClick={() => window.open(bounty.sourceUrl, '_blank')}
                />
              ))}
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && bounties.length === 0 && !error && (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
            <Search className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              No bounties discovered yet
            </h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Click &quot;Discover Bounties&quot; to search for opportunities
            </p>
          </div>
        )}
      </div>
    </>
  );
}
