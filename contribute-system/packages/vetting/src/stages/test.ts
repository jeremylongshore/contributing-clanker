/**
 * Test Stage
 *
 * Runs project tests and captures results.
 */

import { execa } from 'execa';
import type { VettingConfig, StageResult, ProjectDetection } from '../types';

interface TestMetrics {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  coverage?: number;
}

function parseTestOutput(output: string, type: ProjectDetection['type']): TestMetrics {
  let passed = 0, failed = 0, skipped = 0, coverage: number | undefined;

  // Jest/Vitest format: Tests: X passed, Y failed, Z skipped
  const jestMatch = output.match(/Tests:\s+(\d+)\s+passed.*?(\d+)\s+failed.*?(\d+)\s+(?:skipped|pending)/i);
  if (jestMatch) {
    passed = parseInt(jestMatch[1], 10);
    failed = parseInt(jestMatch[2], 10);
    skipped = parseInt(jestMatch[3], 10);
  }

  // Jest simple format: X passed, Y total
  const jestSimple = output.match(/(\d+)\s+passed,\s+(\d+)\s+total/i);
  if (jestSimple && !jestMatch) {
    passed = parseInt(jestSimple[1], 10);
    const total = parseInt(jestSimple[2], 10);
    failed = total - passed;
  }

  // Pytest format: X passed, Y failed, Z skipped
  const pytestMatch = output.match(/(\d+)\s+passed.*?(\d+)\s+failed.*?(\d+)\s+skipped/i);
  if (pytestMatch) {
    passed = parseInt(pytestMatch[1], 10);
    failed = parseInt(pytestMatch[2], 10);
    skipped = parseInt(pytestMatch[3], 10);
  }

  // Pytest simple: X passed
  const pytestSimple = output.match(/(\d+)\s+passed/i);
  if (pytestSimple && !pytestMatch) {
    passed = parseInt(pytestSimple[1], 10);
  }

  // Go test format: ok/FAIL with count
  const goMatch = output.match(/(?:ok|FAIL).*?(\d+(?:\.\d+)?s)/g);
  if (type === 'go' && goMatch) {
    passed = (output.match(/^ok\s/gm) || []).length;
    failed = (output.match(/^FAIL\s/gm) || []).length;
  }

  // Rust format: test result: ok. X passed; Y failed
  const rustMatch = output.match(/test result:.*?(\d+)\s+passed;\s+(\d+)\s+failed/i);
  if (rustMatch) {
    passed = parseInt(rustMatch[1], 10);
    failed = parseInt(rustMatch[2], 10);
  }

  // Coverage extraction
  const coverageMatch = output.match(/(?:coverage|Coverage)[:\s]+(\d+(?:\.\d+)?)\s*%/);
  if (coverageMatch) {
    coverage = parseFloat(coverageMatch[1]);
  }

  // Fallback: count "PASS" and "FAIL" occurrences
  if (passed === 0 && failed === 0) {
    passed = (output.match(/\bPASS\b/g) || []).length;
    failed = (output.match(/\bFAIL\b/g) || []).length;
  }

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    coverage
  };
}

export async function runTestStage(
  config: VettingConfig,
  detection: ProjectDetection
): Promise<StageResult> {
  const startedAt = new Date().toISOString();

  if (!detection.testCommand) {
    return {
      stage: 'test',
      status: 'skipped',
      startedAt,
      completedAt: startedAt,
      duration: 0,
      output: 'No test command detected'
    };
  }

  try {
    const [cmd, ...args] = detection.testCommand.split(' ');

    // Add coverage flag for Node projects
    let testArgs = args;
    if (detection.type === 'node' && !args.includes('--coverage')) {
      testArgs = [...args, '--coverage', '--passWithNoTests'];
    }

    const result = await execa(cmd, testArgs, {
      cwd: config.workDir,
      timeout: config.timeout || 600000, // 10 min default
      env: {
        ...process.env,
        CI: 'true',
        FORCE_COLOR: '0'
      },
      reject: false // Don't throw on test failures
    });

    const output = result.stdout + '\n' + result.stderr;
    const metrics = parseTestOutput(output, detection.type);
    const completedAt = new Date().toISOString();

    const status = result.exitCode === 0 ? 'passed' : 'failed';

    return {
      stage: 'test',
      status,
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      output: output.slice(-3000),
      error: status === 'failed' ? `${metrics.failed} tests failed` : undefined,
      metrics: {
        passed: metrics.passed,
        failed: metrics.failed,
        skipped: metrics.skipped,
        total: metrics.total,
        ...(metrics.coverage !== undefined && { coverage: metrics.coverage })
      }
    };

  } catch (error: any) {
    const completedAt = new Date().toISOString();
    return {
      stage: 'test',
      status: 'failed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: error.message,
      output: (error.stdout || '').slice(-2000)
    };
  }
}
