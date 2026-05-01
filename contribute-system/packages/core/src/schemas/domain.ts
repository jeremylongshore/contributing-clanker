import { z } from 'zod';

export const DomainBranding = z.object({
  primaryColor: z.string().optional(),
  logo: z.string().optional(), // GCS path
  favicon: z.string().optional()
});

export const DomainStats = z.object({
  totalBounties: z.number().default(0),
  completedBounties: z.number().default(0),
  totalRevenue: z.number().default(0),
  avgCycleTimeHours: z.number().optional(),
  avgValue: z.number().optional(),
  successRate: z.number().optional() // percentage
});

export const DomainSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),

  // Client info
  client: z.string().optional(),
  contactEmail: z.string().email().optional(),

  // Branding
  branding: DomainBranding.optional(),

  // Assignment rules
  repoPatterns: z.array(z.string()).default([]), // regex patterns to auto-assign
  orgPatterns: z.array(z.string()).default([]),

  // Stats (denormalized for fast reads)
  stats: DomainStats.default({}),

  // Portal
  portalEnabled: z.boolean().default(true),
  portalPublic: z.boolean().default(false),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Domain = z.infer<typeof DomainSchema>;
export type DomainStats = z.infer<typeof DomainStats>;
export type DomainBranding = z.infer<typeof DomainBranding>;

export const CreateDomainInput = DomainSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  stats: true
}).partial({
  repoPatterns: true,
  orgPatterns: true,
  portalEnabled: true,
  portalPublic: true
});

export type CreateDomainInput = z.infer<typeof CreateDomainInput>;
