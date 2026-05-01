import { z } from 'zod';

export const LedgerEntryType = z.enum([
  'bounty_earned',
  'bounty_paid',
  'expense',
  'refund',
  'adjustment'
]);

export const PaymentMethod = z.enum([
  'crypto_btc',
  'crypto_usdc',
  'crypto_eth',
  'paypal',
  'stripe',
  'bank_transfer',
  'algora',
  'other'
]);

export const LedgerStatus = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'disputed'
]);

export const LedgerEntrySchema = z.object({
  id: z.string(),
  bountyId: z.string().optional(),
  domainId: z.string().default('default'),

  type: LedgerEntryType,
  status: LedgerStatus,

  amount: z.number(),
  currency: z.string().default('USD'),

  // Payment details
  paymentMethod: PaymentMethod.optional(),
  transactionId: z.string().optional(),
  invoiceId: z.string().optional(),

  // Description
  description: z.string(),
  notes: z.string().optional(),

  // Timestamps
  date: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type LedgerEntryType = z.infer<typeof LedgerEntryType>;
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const CreateLedgerEntryInput = LedgerEntrySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).partial({
  status: true,
  currency: true,
  domainId: true
});

export type CreateLedgerEntryInput = z.infer<typeof CreateLedgerEntryInput>;
