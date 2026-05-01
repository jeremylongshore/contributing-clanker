import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';

interface BountyConfig {
  projectId: string;
  defaultDomain: string;
  proofBucket?: string;
  autoClaimThreshold: number;
  slackWebhook?: string;
  slackBountyBotWebhook?: string;  // BountyBot webhook for workflow notifications
  slackChannel?: string;           // Default channel for notifications
  slackEnabled?: boolean;          // Enable/disable Slack (default true)
  slackStrict?: boolean;           // Strict mode - fail if Slack fails (default true)
  githubToken?: string;
  // VM configuration
  vmSshHost?: string;              // SSH host for VM execution
  vmRepoRoot?: string;             // Repo root on VM
  vmEnabled?: boolean;             // Enable VM execution
  vmAutoEscalate?: boolean;        // Auto-escalate to VM on local failure
  // Payment defaults
  defaultPaymentMethod?: string;   // bitcoin, usdc, paypal, wise, etc.
  defaultPaymentTerms?: string;    // "48h after merge", "on merge", etc.
  // Scoring config
  scoring?: ScoringConfig;
}

interface ScoringConfig {
  knownTechnologies?: string[];
  preferredTechnologies?: string[];
  avoidTechnologies?: string[];
  familiarRepos?: string[];
  expertRepos?: string[];
  minValue?: number;
  maxClaimants?: number;
  maxOpenPRs?: number;
}

const config = new Conf<BountyConfig>({
  projectName: 'bounty-system',
  cwd: join(homedir(), '.bounty'),
  defaults: {
    projectId: 'bounty-system-prod',
    defaultDomain: 'default',
    autoClaimThreshold: 80
  }
});

export function getConfig(): BountyConfig {
  return {
    projectId: config.get('projectId'),
    defaultDomain: config.get('defaultDomain'),
    proofBucket: config.get('proofBucket'),
    autoClaimThreshold: config.get('autoClaimThreshold'),
    slackWebhook: config.get('slackWebhook'),
    slackBountyBotWebhook: config.get('slackBountyBotWebhook'),
    slackChannel: config.get('slackChannel'),
    slackEnabled: config.get('slackEnabled'),
    slackStrict: config.get('slackStrict'),
    githubToken: config.get('githubToken'),
    vmSshHost: config.get('vmSshHost'),
    vmRepoRoot: config.get('vmRepoRoot'),
    vmEnabled: config.get('vmEnabled'),
    vmAutoEscalate: config.get('vmAutoEscalate'),
    defaultPaymentMethod: config.get('defaultPaymentMethod'),
    defaultPaymentTerms: config.get('defaultPaymentTerms'),
    scoring: config.get('scoring')
  };
}

export function setConfig(key: keyof BountyConfig, value: string | number | object): void {
  config.set(key, value);
}

export function showConfig(): Record<string, unknown> {
  return config.store;
}

export function configPath(): string {
  return config.path;
}

export function resetConfig(): void {
  config.clear();
}
