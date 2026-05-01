/**
 * Bundle Stage
 *
 * Generates the proof bundle with checksums and manifest.
 */

import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import simpleGit from 'simple-git';
import type { VettingConfig, StageResult, VettingResult, ProofBundle, ProofFile, ProofManifest } from '../types';

function calculateChecksum(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function getAllFiles(dir: string, files: string[] = []): string[] {
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    // Skip common directories
    if (stat.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', '__pycache__', 'target', 'vendor'].includes(item)) {
        continue;
      }
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function determineFileType(filePath: string): ProofFile['type'] {
  const path = filePath.toLowerCase();

  if (path.includes('test') || path.includes('spec')) return 'test';
  if (path.includes('.cast') || path.includes('.rec')) return 'recording';
  if (path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.toml') || path.endsWith('.config.')) return 'config';
  if (path.includes('output') || path.includes('report') || path.includes('coverage')) return 'output';

  return 'source';
}

export async function runBundleStage(
  config: VettingConfig,
  vettingResult: Omit<VettingResult, 'proofBundle'>
): Promise<StageResult & { bundle?: ProofBundle }> {
  const startedAt = new Date().toISOString();

  try {
    const git = simpleGit(config.workDir);

    // Get diff stats
    const diffSummary = await git.diffSummary([`${config.baseBranch || 'main'}...HEAD`]);

    // Get author info
    const log = await git.log({ maxCount: 1 });
    const author = log.latest?.author_name || 'unknown';

    // Collect changed files
    const changedFiles = diffSummary.files.map(f => ({
      path: f.file,
      checksum: existsSync(join(config.workDir, f.file))
        ? calculateChecksum(join(config.workDir, f.file))
        : 'deleted',
      size: existsSync(join(config.workDir, f.file))
        ? statSync(join(config.workDir, f.file)).size
        : 0,
      type: determineFileType(f.file) as ProofFile['type']
    }));

    // Calculate bundle checksum
    const bundleContent = JSON.stringify({
      files: changedFiles,
      vetting: vettingResult.summary,
      config: {
        repo: config.repo,
        pr: config.pr,
        commit: config.commitSha
      }
    });
    const bundleChecksum = createHash('sha256').update(bundleContent).digest('hex');

    // Create manifest
    const manifest: ProofManifest = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      bountyId: vettingResult.bountyId,
      repo: config.repo,
      pr: config.pr,
      commitSha: config.commitSha,
      author,
      vettingPassed: vettingResult.status === 'passed',
      summary: {
        ...vettingResult.summary,
        linesAdded: diffSummary.insertions,
        linesDeleted: diffSummary.deletions,
        filesChanged: diffSummary.files.length
      }
    };

    // Create proof bundle
    const bundle: ProofBundle = {
      id: `proof_${Date.now().toString(36)}`,
      bountyId: vettingResult.bountyId,
      createdAt: new Date().toISOString(),
      checksum: bundleChecksum,
      files: changedFiles,
      recordings: [], // Populated from session recordings
      screenshots: [],
      vettingResult: JSON.stringify(vettingResult),
      manifest
    };

    // Save bundle to work directory
    const bundleDir = join(config.workDir, '.bounty-proof');
    if (!existsSync(bundleDir)) {
      mkdirSync(bundleDir, { recursive: true });
    }
    writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(bundleDir, 'bundle.json'), JSON.stringify(bundle, null, 2));

    const completedAt = new Date().toISOString();

    return {
      stage: 'bundle',
      status: 'passed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      output: `Generated proof bundle: ${bundle.id}`,
      metrics: {
        filesChanged: changedFiles.length,
        linesAdded: diffSummary.insertions,
        linesDeleted: diffSummary.deletions,
        bundleSize: bundleContent.length
      },
      bundle
    };

  } catch (error: any) {
    const completedAt = new Date().toISOString();
    return {
      stage: 'bundle',
      status: 'failed',
      startedAt,
      completedAt,
      duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      error: error.message
    };
  }
}
