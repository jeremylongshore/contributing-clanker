/**
 * Install Stage
 *
 * Installs project dependencies.
 */

import { execa } from 'execa';
import type { VettingConfig, StageResult, ProjectDetection } from '../types';

export async function runInstallStage(
  config: VettingConfig,
  detection: ProjectDetection
): Promise<StageResult> {
  const startedAt = new Date().toISOString();

  if (!detection.installCommand) {
    return {
      stage: 'install',
      status: 'skipped',
      startedAt,
      completedAt: startedAt,
      duration: 0,
      output: 'No install command detected'
    };
  }

  try {
    const [cmd, ...args] = detection.installCommand.split(' ');

    const result = await execa(cmd, args, {
      cwd: config.workDir,
      timeout: config.timeout || 300000, // 5 min default
      env: {
        ...process.env,
        CI: 'true',
        NODE_ENV: 'development'
      }
    });

    const completedAt = new Date().toISOString();

    return {
      stage: 'install',
      status: 'passed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      output: result.stdout.slice(-2000) // Last 2000 chars
    };

  } catch (error: any) {
    const completedAt = new Date().toISOString();
    return {
      stage: 'install',
      status: 'failed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: error.stderr || error.message,
      output: error.stdout?.slice(-2000)
    };
  }
}
