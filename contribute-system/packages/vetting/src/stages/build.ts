/**
 * Build Stage
 *
 * Builds the project.
 */

import { execa } from 'execa';
import type { VettingConfig, StageResult, ProjectDetection } from '../types';

export async function runBuildStage(
  config: VettingConfig,
  detection: ProjectDetection
): Promise<StageResult> {
  const startedAt = new Date().toISOString();

  if (!detection.buildCommand) {
    return {
      stage: 'build',
      status: 'skipped',
      startedAt,
      completedAt: startedAt,
      duration: 0,
      output: 'No build command detected'
    };
  }

  try {
    const [cmd, ...args] = detection.buildCommand.split(' ');

    const result = await execa(cmd, args, {
      cwd: config.workDir,
      timeout: config.timeout || 600000, // 10 min default
      env: {
        ...process.env,
        CI: 'true',
        NODE_ENV: 'production'
      }
    });

    const completedAt = new Date().toISOString();

    return {
      stage: 'build',
      status: 'passed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      output: result.stdout.slice(-2000)
    };

  } catch (error: any) {
    const completedAt = new Date().toISOString();
    return {
      stage: 'build',
      status: 'failed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: error.stderr || error.message,
      output: error.stdout?.slice(-2000)
    };
  }
}
