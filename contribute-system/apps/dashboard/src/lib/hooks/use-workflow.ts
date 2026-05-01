'use client';

import { useState, useCallback, useEffect } from 'react';

export interface WorkflowState {
  currentNode: string | null;
  phase: string | null;
  humanApproved: boolean;
  issueDetails: Record<string, unknown>;
  competitionAnalysis: Record<string, unknown>;
  implementationPlan: Record<string, unknown>;
  executionResult: Record<string, unknown>;
}

export interface UseWorkflowReturn {
  status: WorkflowState | null;
  loading: boolean;
  error: string | null;
  startWorkflow: (issueUrl: string, repo: string) => Promise<void>;
  approveExecution: () => Promise<void>;
  rejectExecution: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useWorkflow(bountyId: string): UseWorkflowReturn {
  const [status, setStatus] = useState<WorkflowState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/orchestrator?bountyId=${bountyId}`);
      const data = await response.json();

      if (data.error) {
        // Orchestrator not available - don't show error, just no workflow
        setStatus(null);
        return;
      }

      if (!data.current_node) {
        setStatus(null);
        return;
      }

      setStatus({
        currentNode: data.current_node,
        phase: data.state?.phase || null,
        humanApproved: data.state?.human_approved || false,
        issueDetails: data.state?.issue_details || {},
        competitionAnalysis: data.state?.competition_analysis || {},
        implementationPlan: data.state?.implementation_plan || {},
        executionResult: data.state?.execution_result || {},
      });
    } catch (err) {
      // Orchestrator not available - don't show error
      setStatus(null);
    }
  }, [bountyId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Poll for updates when workflow is active
  useEffect(() => {
    if (!status || status.currentNode === 'complete') return;

    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [status, refreshStatus]);

  const startWorkflow = useCallback(
    async (issueUrl: string, repo: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/orchestrator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            bountyId,
            issueUrl,
            repo,
          }),
        });

        const data = await response.json();

        if (data.error) {
          setError(data.error);
          return;
        }

        // Refresh status after starting
        await refreshStatus();
      } catch (err) {
        setError('Failed to start workflow');
      } finally {
        setLoading(false);
      }
    },
    [bountyId, refreshStatus]
  );

  const approveExecution = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          bountyId,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      await refreshStatus();
    } catch (err) {
      setError('Failed to approve execution');
    } finally {
      setLoading(false);
    }
  }, [bountyId, refreshStatus]);

  const rejectExecution = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          bountyId,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      await refreshStatus();
    } catch (err) {
      setError('Failed to reject execution');
    } finally {
      setLoading(false);
    }
  }, [bountyId, refreshStatus]);

  return {
    status,
    loading,
    error,
    startWorkflow,
    approveExecution,
    rejectExecution,
    refreshStatus,
  };
}
