import { z } from 'zod';

export const RecordingType = z.enum(['terminal', 'browser', 'combined']);

export const Recording = z.object({
  type: RecordingType,
  path: z.string(), // GCS path
  duration: z.number().optional(), // seconds
  size: z.number().optional(), // bytes
  checksum: z.string().optional()
});

export const VettingStage = z.enum([
  'clone',
  'build',
  'lint',
  'test',
  'security',
  'ai_review'
]);

export const VettingResult = z.object({
  stage: VettingStage,
  passed: z.boolean(),
  duration: z.number(), // ms
  output: z.string().optional(),
  artifacts: z.array(z.string()).default([]) // GCS paths
});

export const VettingSummary = z.object({
  passed: z.boolean(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  stages: z.array(VettingResult),
  coveragePercent: z.number().optional(),
  securityFindings: z.number().default(0)
});

export const ProofSchema = z.object({
  id: z.string(),
  bountyId: z.string(),

  // Recordings
  recordings: z.array(Recording).default([]),
  screenshots: z.array(z.string()).default([]), // GCS paths

  // Git info
  branch: z.string().optional(),
  commits: z.array(z.string()).default([]),
  linesAdded: z.number().default(0),
  linesDeleted: z.number().default(0),
  filesChanged: z.number().default(0),

  // Vetting
  vetting: VettingSummary.optional(),

  // Manifest
  manifest: z.object({
    version: z.string(),
    generatedAt: z.string().datetime(),
    checksum: z.string()
  }).optional(),

  // Publishing
  published: z.boolean().default(false),
  publishedAt: z.string().datetime().optional(),
  portalUrl: z.string().url().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Proof = z.infer<typeof ProofSchema>;
export type Recording = z.infer<typeof Recording>;
export type VettingSummary = z.infer<typeof VettingSummary>;
