/**
 * Lint Stage
 *
 * Runs linting/code quality checks.
 */

import { execa } from 'execa';
import type { VettingConfig, StageResult, ProjectDetection } from '../types';

export async function runLintStage(
  config: VettingConfig,
  detection: ProjectDetection
): Promise<StageResult> {
  const startedAt = new Date().toISOString();

  if (!detection.lintCommand) {
    return {
      stage: 'lint',
      status: 'skipped',
      startedAt,
      completedAt: startedAt,
      duration: 0,
      output: 'No lint command detected'
    };
  }

  try {
    // Split command handling for complex commands with ||
    let result;
    if (detection.lintCommand.includes('||')) {
      result = await execa('sh', ['-c', detection.lintCommand], {
        cwd: config.workDir,
        timeout: config.timeout || 300000,
        env: { ...process.env, CI: 'true' }
      });
    } else {
      const [cmd, ...args] = detection.lintCommand.split(' ');
      result = await execa(cmd, args, {
        cwd: config.workDir,
        timeout: config.timeout || 300000,
        env: { ...process.env, CI: 'true' }
      });
    }

    const completedAt = new Date().toISOString();

    // Parse lint output for metrics
    const output = result.stdout + result.stderr;
    const errorCount = (output.match(/error/gi) || []).length;
    const warningCount = (output.match(/warning/gi) || []).length;

    return {
      stage: 'lint',
      status: 'passed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      output: output.slice(-2000),
      metrics: {
        errors: errorCount,
        warnings: warningCount
      }
    };

  } catch (error: any) {
    const completedAt = new Date().toISOString();
    const output = (error.stdout || '') + (error.stderr || '');
    const errorCount = (output.match(/error/gi) || []).length;
    const warningCount = (output.match(/warning/gi) || []).length;

    return {
      stage: 'lint',
      status: 'failed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: `Lint failed with ${errorCount} errors`,
      output: output.slice(-2000),
      metrics: {
        errors: errorCount,
        warnings: warningCount
      }
    };
  }
}
