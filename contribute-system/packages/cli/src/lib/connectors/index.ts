/**
 * Connector Index - Export all connectors and types
 */

export * from './types';
export { algoraConnector, AlgoraConnector } from './algora';
export { githubSearchConnector, GitHubSearchConnector } from './github-search';
export { githubOrgConnector, GitHubOrgConnector } from './github-org';

import type { Connector } from './types';
import { algoraConnector } from './algora';
import { githubSearchConnector } from './github-search';
import { githubOrgConnector } from './github-org';

/**
 * Get connector by source type
 */
export function getConnector(sourceType: string): Connector | null {
  switch (sourceType) {
    case 'algora':
      return algoraConnector;
    case 'github_search':
      return githubSearchConnector;
    case 'github_org':
    case 'github_repo':
      return githubOrgConnector;
    default:
      return null;
  }
}
