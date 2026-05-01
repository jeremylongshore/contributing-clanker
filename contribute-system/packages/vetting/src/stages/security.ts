/**
 * Security Stage
 *
 * Runs security scans on the codebase.
 */

import { execa } from 'execa';
import { existsSync } from 'fs';
import { join } from 'path';
import type { VettingConfig, StageResult, ProjectDetection } from '../types';

interface SecurityMetrics {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

function parseSecurityOutput(output: string): SecurityMetrics {
  let critical = 0, high = 0, medium = 0, low = 0, info = 0;

  // npm audit format
  const npmMatch = output.match(/(\d+)\s+critical.*?(\d+)\s+high.*?(\d+)\s+moderate.*?(\d+)\s+low/i);
  if (npmMatch) {
    critical = parseInt(npmMatch[1], 10);
    high = parseInt(npmMatch[2], 10);
    medium = parseInt(npmMatch[3], 10);
    low = parseInt(npmMatch[4], 10);
  }

  // Trivy/generic format
  critical += (output.match(/CRITICAL/gi) || []).length;
  high += (output.match(/\bHIGH\b/gi) || []).length;
  medium += (output.match(/\bMEDIUM\b/gi) || []).length;
  low += (output.match(/\bLOW\b/gi) || []).length;
  info += (output.match(/\bINFO\b/gi) || []).length;

  return {
    critical,
    high,
    medium,
    low,
    info,
    total: critical + high + medium + low
  };
}

async function runNodeSecurity(workDir: string, packageManager: string): Promise<{ output: string; exitCode: number }> {
  try {
    // Try npm audit first
    if (packageManager === 'npm' || existsSync(join(workDir, 'package-lock.json'))) {
      const result = await execa('npm', ['audit', '--json'], {
        cwd: workDir,
        reject: false,
        timeout: 120000
      });
      return { output: result.stdout + result.stderr, exitCode: result.exitCode };
    }

    // Yarn audit
    if (packageManager === 'yarn') {
      const result = await execa('yarn', ['audit', '--json'], {
        cwd: workDir,
        reject: false,
        timeout: 120000
      });
      return { output: result.stdout + result.stderr, exitCode: result.exitCode };
    }

    // pnpm audit
    if (packageManager === 'pnpm') {
      const result = await execa('pnpm', ['audit', '--json'], {
        cwd: workDir,
        reject: false,
        timeout: 120000
      });
      return { output: result.stdout + result.stderr, exitCode: result.exitCode };
    }

    return { output: 'No package manager audit available', exitCode: 0 };
  } catch (error: any) {
    return { output: error.message, exitCode: 1 };
  }
}

async function runCargoAudit(workDir: string): Promise<{ output: string; exitCode: number }> {
  try {
    const result = await execa('cargo', ['audit'], {
      cwd: workDir,
      reject: false,
      timeout: 120000
    });
    return { output: result.stdout + result.stderr, exitCode: result.exitCode };
  } catch {
    return { output: 'cargo-audit not installed', exitCode: 0 };
  }
}

async function runPipAudit(workDir: string): Promise<{ output: string; exitCode: number }> {
  try {
    // Try pip-audit first
    const result = await execa('pip-audit', [], {
      cwd: workDir,
      reject: false,
      timeout: 120000
    });
    return { output: result.stdout + result.stderr, exitCode: result.exitCode };
  } catch {
    // Fall back to safety
    try {
      const result = await execa('safety', ['check'], {
        cwd: workDir,
        reject: false,
        timeout: 120000
      });
      return { output: result.stdout + result.stderr, exitCode: result.exitCode };
    } catch {
      return { output: 'No Python security scanner available', exitCode: 0 };
    }
  }
}

export async function runSecurityStage(
  config: VettingConfig,
  detection: ProjectDetection
): Promise<StageResult> {
  const startedAt = new Date().toISOString();

  try {
    let result: { output: string; exitCode: number };

    switch (detection.type) {
      case 'node':
        result = await runNodeSecurity(config.workDir, detection.packageManager || 'npm');
        break;
      case 'rust':
        result = await runCargoAudit(config.workDir);
        break;
      case 'python':
        result = await runPipAudit(config.workDir);
        break;
      default:
        result = { output: 'No security scanner available for this project type', exitCode: 0 };
    }

    const metrics = parseSecurityOutput(result.output);
    const completedAt = new Date().toISOString();

    // Fail on critical or high vulnerabilities
    const hasCriticalIssues = metrics.critical > 0 || metrics.high > 0;

    return {
      stage: 'security',
      status: hasCriticalIssues ? 'failed' : 'passed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      output: result.output.slice(-2000),
      error: hasCriticalIssues ? `Found ${metrics.critical} critical and ${metrics.high} high vulnerabilities` : undefined,
      metrics: {
        critical: metrics.critical,
        high: metrics.high,
        medium: metrics.medium,
        low: metrics.low,
        total: metrics.total
      }
    };

  } catch (error: any) {
    const completedAt = new Date().toISOString();
    return {
      stage: 'security',
      status: 'failed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: error.message
    };
  }
}
