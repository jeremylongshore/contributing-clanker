/**
 * Vetting Pipeline Types
 */

export type VettingStage =
  | 'clone'
  | 'detect'
  | 'install'
  | 'build'
  | 'lint'
  | 'test'
  | 'security'
  | 'bundle';

export type VettingStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface StageResult {
  stage: VettingStage;
  status: VettingStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  output?: string;
  error?: string;
  metrics?: Record<string, number | string>;
}

export interface VettingConfig {
  repo: string;
  pr: number;
  commitSha: string;
  baseBranch?: string;
  workDir: string;
  timeout?: number;
  stages?: VettingStage[];
  skipStages?: VettingStage[];
}

export interface VettingResult {
  id: string;
  bountyId: string;
  config: VettingConfig;
  status: VettingStatus;
  stages: StageResult[];
  startedAt: string;
  completedAt?: string;
  duration?: number;
  summary: VettingSummary;
  proofBundle?: ProofBundle;
}

export interface VettingSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  testsPassed?: number;
  testsFailed?: number;
  testsSkipped?: number;
  coverage?: number;
  lintErrors?: number;
  lintWarnings?: number;
  securityIssues?: number;
}

export interface ProofBundle {
  id: string;
  bountyId: string;
  createdAt: string;
  checksum: string;
  files: ProofFile[];
  recordings: string[];
  screenshots: string[];
  vettingResult: string;
  manifest: ProofManifest;
}

export interface ProofFile {
  path: string;
  checksum: string;
  size: number;
  type: 'source' | 'test' | 'config' | 'output' | 'recording';
}

export interface ProofManifest {
  version: string;
  generatedAt: string;
  bountyId: string;
  repo: string;
  pr: number;
  commitSha: string;
  author: string;
  vettingPassed: boolean;
  summary: VettingSummary;
}

export interface ProjectDetection {
  type: 'node' | 'python' | 'rust' | 'go' | 'java' | 'ruby' | 'unknown';
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'poetry' | 'cargo' | 'go' | 'maven' | 'gradle' | 'bundler';
  hasTests: boolean;
  hasLint: boolean;
  hasBuild: boolean;
  testCommand?: string;
  lintCommand?: string;
  buildCommand?: string;
  installCommand?: string;
}
