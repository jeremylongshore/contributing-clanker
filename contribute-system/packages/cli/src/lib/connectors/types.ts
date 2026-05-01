/**
 * Connector Types - Common interfaces for ingestion connectors
 */

export interface IssueItem {
  url: string;
  repo: string;
  issueNumber: number;
  title: string;
  bodyExcerpt: string;
  labels: string[];
  state: 'open' | 'closed';
  updatedAt: string;
  bountyAmount: number | null;
  bountyCurrency: string | null;
  isPaid: boolean;
  isBountyLike: boolean;
}

export interface IngestResult {
  scannedRepos: number;
  scannedItems: number;
  newItems: number;
  updatedItems: number;
  items: IssueItem[];
  errors: string[];
}

export interface ConnectorConfig {
  token?: string;
  query?: string;
  org?: string;
  repo?: string;
  labels?: string[];
  limit?: number;
  updatedSince?: string;
}

export interface Connector {
  name: string;
  fetch(config: ConnectorConfig): Promise<IngestResult>;
}
