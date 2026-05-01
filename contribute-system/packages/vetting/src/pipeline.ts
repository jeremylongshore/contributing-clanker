/**
 * Vetting Pipeline
 *
 * Orchestrates the vetting stages for a bounty submission.
 */

import { join } from 'path';
import { tmpdir } from 'os';
import type {
  VettingConfig,
  VettingResult,
  VettingStage,
  StageResult,
  VettingSummary,
  ProjectDetection
} from './types';
import { detectProject, getDefaultStages } from './utils/detect';
import {
  runCloneStage,
  runInstallStage,
  runBuildStage,
  runLintStage,
  runTestStage,
  runSecurityStage,
  runBundleStage
} from './stages';

export interface PipelineOptions {
  bountyId: string;
  repo: string;
  pr: number;
  commitSha: string;
  baseBranch?: string;
  timeout?: number;
  stages?: VettingStage[];
  skipStages?: VettingStage[];
  workDir?: string;
  onStageStart?: (stage: VettingStage) => void;
  onStageComplete?: (result: StageResult) => void;
}

export class VettingPipeline {
  private config: VettingConfig;
  private bountyId: string;
  private stages: VettingStage[];
  private skipStages: VettingStage[];
  private onStageStart?: (stage: VettingStage) => void;
  private onStageComplete?: (result: StageResult) => void;

  constructor(options: PipelineOptions) {
    this.bountyId = options.bountyId;
    this.config = {
      repo: options.repo,
      pr: options.pr,
      commitSha: options.commitSha,
      baseBranch: options.baseBranch || 'main',
      workDir: options.workDir || join(tmpdir(), `bounty-vet-${options.bountyId}`),
      timeout: options.timeout || 600000
    };
    this.stages = options.stages || [];
    this.skipStages = options.skipStages || [];
    this.onStageStart = options.onStageStart;
    this.onStageComplete = options.onStageComplete;
  }

  async run(): Promise<VettingResult> {
    const startedAt = new Date().toISOString();
    const results: StageResult[] = [];
    let detection: ProjectDetection | null = null;
    let overallStatus: VettingResult['status'] = 'passed';

    // Stage 1: Clone
    this.onStageStart?.('clone');
    const cloneResult = await runCloneStage(this.config);
    results.push(cloneResult);
    this.onStageComplete?.(cloneResult);

    if (cloneResult.status === 'failed') {
      return this.finalize(results, 'failed', startedAt);
    }

    // Stage 2: Detect project type
    this.onStageStart?.('detect');
    const detectStart = new Date().toISOString();
    try {
      detection = await detectProject(this.config.workDir);
      const detectResult: StageResult = {
        stage: 'detect',
        status: 'passed',
        startedAt: detectStart,
        completedAt: new Date().toISOString(),
        duration: Date.now() - new Date(detectStart).getTime(),
        output: `Detected ${detection.type} project with ${detection.packageManager || 'unknown'} package manager`,
        metrics: {
          type: detection.type,
          packageManager: detection.packageManager || 'none',
          hasTests: detection.hasTests ? 'yes' : 'no',
          hasLint: detection.hasLint ? 'yes' : 'no',
          hasBuild: detection.hasBuild ? 'yes' : 'no'
        }
      };
      results.push(detectResult);
      this.onStageComplete?.(detectResult);
    } catch (error) {
      const detectResult: StageResult = {
        stage: 'detect',
        status: 'failed',
        startedAt: detectStart,
        completedAt: new Date().toISOString(),
        duration: Date.now() - new Date(detectStart).getTime(),
        error: (error as Error).message
      };
      results.push(detectResult);
      this.onStageComplete?.(detectResult);
      return this.finalize(results, 'failed', startedAt);
    }

    // Determine which stages to run
    const stagesToRun = this.stages.length > 0
      ? this.stages
      : getDefaultStages(detection) as VettingStage[];

    // Run remaining stages
    for (const stage of stagesToRun) {
      if (['clone', 'detect'].includes(stage)) continue; // Already ran
      if (this.skipStages.includes(stage)) {
        results.push({
          stage,
          status: 'skipped',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 0,
          output: 'Skipped by configuration'
        });
        continue;
      }

      this.onStageStart?.(stage);
      let result: StageResult;

      switch (stage) {
        case 'install':
          result = await runInstallStage(this.config, detection);
          break;
        case 'build':
          result = await runBuildStage(this.config, detection);
          break;
        case 'lint':
          result = await runLintStage(this.config, detection);
          break;
        case 'test':
          result = await runTestStage(this.config, detection);
          break;
        case 'security':
          result = await runSecurityStage(this.config, detection);
          break;
        case 'bundle':
          const partialResult = this.buildPartialResult(results, startedAt, detection);
          const bundleResult = await runBundleStage(this.config, partialResult);
          result = bundleResult;
          break;
        default:
          result = {
            stage,
            status: 'skipped',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            duration: 0,
            output: `Unknown stage: ${stage}`
          };
      }

      results.push(result);
      this.onStageComplete?.(result);

      // Track failures
      if (result.status === 'failed') {
        overallStatus = 'failed';
        // Continue running other stages for full report
      }
    }

    return this.finalize(results, overallStatus, startedAt, detection);
  }

  private buildPartialResult(
    results: StageResult[],
    startedAt: string,
    detection: ProjectDetection | null
  ): Omit<VettingResult, 'proofBundle'> {
    const summary = this.buildSummary(results, detection);
    return {
      id: `vet_${Date.now().toString(36)}`,
      bountyId: this.bountyId,
      config: this.config,
      status: 'running',
      stages: results,
      startedAt,
      summary
    };
  }

  private finalize(
    results: StageResult[],
    status: VettingResult['status'],
    startedAt: string,
    detection?: ProjectDetection | null
  ): VettingResult {
    const completedAt = new Date().toISOString();
    const summary = this.buildSummary(results, detection);

    // Extract proof bundle if generated
    const bundleStage = results.find(r => r.stage === 'bundle');
    const proofBundle = (bundleStage as any)?.bundle;

    return {
      id: `vet_${Date.now().toString(36)}`,
      bountyId: this.bountyId,
      config: this.config,
      status,
      stages: results,
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      summary,
      proofBundle
    };
  }

  private buildSummary(results: StageResult[], detection?: ProjectDetection | null): VettingSummary {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    const testStage = results.find(r => r.stage === 'test');
    const lintStage = results.find(r => r.stage === 'lint');
    const securityStage = results.find(r => r.stage === 'security');
    const bundleStage = results.find(r => r.stage === 'bundle');

    return {
      passed,
      failed,
      skipped,
      total: results.length,
      linesAdded: Number(bundleStage?.metrics?.linesAdded) || 0,
      linesDeleted: Number(bundleStage?.metrics?.linesDeleted) || 0,
      filesChanged: Number(bundleStage?.metrics?.filesChanged) || 0,
      testsPassed: Number(testStage?.metrics?.passed) || 0,
      testsFailed: Number(testStage?.metrics?.failed) || 0,
      testsSkipped: Number(testStage?.metrics?.skipped) || 0,
      coverage: Number(testStage?.metrics?.coverage) || undefined,
      lintErrors: Number(lintStage?.metrics?.errors) || 0,
      lintWarnings: Number(lintStage?.metrics?.warnings) || 0,
      securityIssues: Number(securityStage?.metrics?.total) || 0
    };
  }
}

export async function runVetting(options: PipelineOptions): Promise<VettingResult> {
  const pipeline = new VettingPipeline(options);
  return pipeline.run();
}
