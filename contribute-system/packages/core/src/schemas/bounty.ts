import { z } from 'zod';

// Bounty status flow: open → claimed → in_progress → submitted → vetting → completed → paid
export const BountyStatus = z.enum([
  'open',
  'claimed',
  'in_progress',
  'submitted',
  'vetting',
  'completed',
  'paid',
  'cancelled',
  'revision'
]);

export type BountyStatus = z.infer<typeof BountyStatus>;

export const BountySource = z.enum([
  'github',
  'algora',
  'gitcoin',
  'replit',
  'internal',
  'rss',
  'webhook'
]);

export type BountySource = z.infer<typeof BountySource>;

export const BountyCategory = z.object({
  primary: z.string(),
  secondary: z.array(z.string()).default([])
});

export const BountyCheckpoint = z.object({
  timestamp: z.string().datetime(),
  message: z.string(),
  type: z.enum(['start', 'checkpoint', 'stop', 'submit', 'status_change'])
});

export const BountySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  value: z.number().min(0),
  currency: z.string().default('USD'),
  status: BountyStatus,
  source: BountySource,

  // Source references
  repo: z.string().optional(),
  org: z.string().optional(),
  issue: z.number().optional(),
  issueUrl: z.string().url().optional(),
  pr: z.number().optional(),
  prUrl: z.string().url().optional(),

  // Domain tracking
  domainId: z.string().default('default'),

  // Categorization
  categories: BountyCategory.optional(),
  labels: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),

  // Timeline
  timeline: z.array(BountyCheckpoint).default([]),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  claimedAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().optional(),
  submittedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  paidAt: z.string().datetime().optional(),

  // Scoring
  score: z.number().min(0).max(100).optional(),
  estimatedHours: z.number().optional(),
  actualHours: z.number().optional(),

  // Notes
  notes: z.string().optional()
});

export type Bounty = z.infer<typeof BountySchema>;

export const CreateBountyInput = BountySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  timeline: true
}).partial({
  status: true,
  currency: true,
  domainId: true,
  labels: true,
  technologies: true
});

export type CreateBountyInput = z.infer<typeof CreateBountyInput>;
