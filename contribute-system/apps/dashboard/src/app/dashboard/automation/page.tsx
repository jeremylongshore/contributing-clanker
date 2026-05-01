'use client';

/**
 * Automation Dashboard
 *
 * Manage automation rules for bounty discovery, auto-claiming,
 * and notifications.
 */

import { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Settings,
  Play,
  Pause,
  Trash2,
  Bell,
  Target,
  Clock,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  type: 'auto_claim' | 'deadline_reminder' | 'discovery_scan' | 'pr_monitor';
  conditions: {
    minScore?: number;
    maxScore?: number;
    minValue?: number;
    maxValue?: number;
    technologies?: string[];
    maxCompetitors?: number;
  };
  actions: {
    notify?: boolean;
    autoClaim?: boolean;
    addToWatchlist?: boolean;
  };
  stats: {
    timesTriggered: number;
    lastTriggered?: string;
    bountiesClaimed: number;
  };
}

// Sample rules for demo
const SAMPLE_RULES: AutomationRule[] = [
  {
    id: 'rule-1',
    name: 'High-value TypeScript bounties',
    enabled: true,
    type: 'auto_claim',
    conditions: {
      minValue: 100,
      minScore: 70,
      technologies: ['TypeScript', 'React'],
      maxCompetitors: 2,
    },
    actions: {
      notify: true,
      addToWatchlist: true,
    },
    stats: {
      timesTriggered: 12,
      lastTriggered: '2025-01-17T15:30:00Z',
      bountiesClaimed: 3,
    },
  },
  {
    id: 'rule-2',
    name: 'Quick Rust wins',
    enabled: true,
    type: 'auto_claim',
    conditions: {
      minScore: 80,
      technologies: ['Rust'],
    },
    actions: {
      notify: true,
      autoClaim: true,
    },
    stats: {
      timesTriggered: 5,
      lastTriggered: '2025-01-16T10:00:00Z',
      bountiesClaimed: 2,
    },
  },
  {
    id: 'rule-3',
    name: 'Deadline reminders',
    enabled: false,
    type: 'deadline_reminder',
    conditions: {},
    actions: {
      notify: true,
    },
    stats: {
      timesTriggered: 0,
      bountiesClaimed: 0,
    },
  },
];

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [triggerResult, setTriggerResult] = useState<any>(null);

  useEffect(() => {
    // In production, fetch from /api/automation
    setTimeout(() => {
      setRules(SAMPLE_RULES);
      setLoading(false);
    }, 500);
  }, []);

  const toggleRule = (ruleId: string) => {
    setRules(rules.map(r =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ));
  };

  const deleteRule = (ruleId: string) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      setRules(rules.filter(r => r.id !== ruleId));
    }
  };

  const triggerRules = async () => {
    // In production, call /api/automation/trigger
    setTriggerResult({
      success: true,
      summary: {
        rulesEvaluated: rules.filter(r => r.enabled).length,
        bountiesEvaluated: 15,
        totalMatches: 3,
        totalActions: 3,
      },
    });

    setTimeout(() => setTriggerResult(null), 5000);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'auto_claim':
        return <Target className="h-4 w-4" />;
      case 'deadline_reminder':
        return <Clock className="h-4 w-4" />;
      case 'discovery_scan':
        return <RefreshCw className="h-4 w-4" />;
      case 'pr_monitor':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'auto_claim':
        return 'Auto-Claim';
      case 'deadline_reminder':
        return 'Deadline';
      case 'discovery_scan':
        return 'Discovery';
      case 'pr_monitor':
        return 'PR Monitor';
      default:
        return type;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalTriggered = rules.reduce((sum, r) => sum + r.stats.timesTriggered, 0);
  const totalClaimed = rules.reduce((sum, r) => sum + r.stats.bountiesClaimed, 0);
  const activeRules = rules.filter(r => r.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Automation
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure rules to auto-discover, claim, and track bounties
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerRules}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            <Play className="h-4 w-4" />
            Run Now
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            New Rule
          </button>
        </div>
      </div>

      {/* Trigger Result Toast */}
      {triggerResult && (
        <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                Automation triggered successfully
              </p>
              <p className="text-sm text-green-600 dark:text-green-300">
                {triggerResult.summary.rulesEvaluated} rules evaluated,{' '}
                {triggerResult.summary.totalMatches} matches,{' '}
                {triggerResult.summary.totalActions} actions taken
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
              <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {rules.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Rules</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {activeRules}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-purple-100 p-2 dark:bg-purple-900/30">
              <Bell className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalTriggered}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Triggered</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-yellow-100 p-2 dark:bg-yellow-900/30">
              <Target className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalClaimed}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Claimed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      )}

      {/* Rules List */}
      {!loading && (
        <div className="space-y-4">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`rounded-lg bg-white p-6 shadow transition-opacity dark:bg-gray-800 ${
                !rule.enabled ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`mt-1 rounded-full p-2 transition-colors ${
                      rule.enabled
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                    }`}
                  >
                    {rule.enabled ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {rule.name}
                      </h3>
                      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {getTypeIcon(rule.type)}
                        {getTypeLabel(rule.type)}
                      </span>
                    </div>

                    {/* Conditions */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rule.conditions.minValue && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Min ${rule.conditions.minValue}
                        </span>
                      )}
                      {rule.conditions.minScore && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          Score {rule.conditions.minScore}+
                        </span>
                      )}
                      {rule.conditions.technologies?.map(tech => (
                        <span
                          key={tech}
                          className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        >
                          {tech}
                        </span>
                      ))}
                      {rule.conditions.maxCompetitors !== undefined && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          Max {rule.conditions.maxCompetitors} competitors
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      {rule.actions.notify && (
                        <span className="flex items-center gap-1">
                          <Bell className="h-3 w-3" /> Notify
                        </span>
                      )}
                      {rule.actions.autoClaim && (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <Target className="h-3 w-3" /> Auto-claim
                        </span>
                      )}
                      {rule.actions.addToWatchlist && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Watchlist
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats & Actions */}
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {rule.stats.timesTriggered} triggers
                    </p>
                    {rule.stats.lastTriggered && (
                      <p className="text-gray-500 dark:text-gray-400">
                        Last: {formatDate(rule.stats.lastTriggered)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && rules.length === 0 && (
        <div className="rounded-lg bg-white p-12 text-center shadow dark:bg-gray-800">
          <Zap className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No automation rules
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Create rules to automatically discover and claim bounties
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Create First Rule
          </button>
        </div>
      )}
    </div>
  );
}
