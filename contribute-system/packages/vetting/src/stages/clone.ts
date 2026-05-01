/**
 * Clone Stage
 *
 * Clones the repository and checks out the PR branch.
 */

import simpleGit from 'simple-git';
import { existsSync, mkdirSync, rmSync } from 'fs';
import type { VettingConfig, StageResult } from '../types';

export async function runCloneStage(config: VettingConfig): Promise<StageResult> {
  const startedAt = new Date().toISOString();

  try {
    // Clean work directory
    if (existsSync(config.workDir)) {
      rmSync(config.workDir, { recursive: true, force: true });
    }
    mkdirSync(config.workDir, { recursive: true });

    const git = simpleGit();
    const repoUrl = `https://github.com/${config.repo}.git`;

    // Clone with shallow depth for speed
    await git.clone(repoUrl, config.workDir, [
      '--depth', '50',
      '--branch', config.baseBranch || 'main'
    ]);

    // Fetch the PR ref
    const repoGit = simpleGit(config.workDir);
    await repoGit.fetch('origin', `pull/${config.pr}/head:pr-${config.pr}`);

    // Checkout the PR branch
    await repoGit.checkout(`pr-${config.pr}`);

    // Verify we're at the right commit
    const currentCommit = await repoGit.revparse(['HEAD']);
    const isCorrectCommit = currentCommit.trim().startsWith(config.commitSha.slice(0, 7));

    const completedAt = new Date().toISOString();

    return {
      stage: 'clone',
      status: 'passed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      output: `Cloned ${config.repo} and checked out PR #${config.pr}`,
      metrics: {
        commit: currentCommit.trim().slice(0, 7),
        verified: isCorrectCommit ? 'yes' : 'no'
      }
    };

  } catch (error) {
    const completedAt = new Date().toISOString();
    return {
      stage: 'clone',
      status: 'failed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: (error as Error).message
    };
  }
}
