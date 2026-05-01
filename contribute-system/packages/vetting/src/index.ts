/**
 * @contribute/vetting
 *
 * Automated vetting pipeline for bounty submissions.
 * Includes scoring algorithm for evaluating opportunities.
 */

// Vetting pipeline (post-work PR verification)
export * from './types';
export * from './pipeline';
export { detectProject, getDefaultStages } from './utils/detect';
export {
  runCloneStage,
  runInstallStage,
  runBuildStage,
  runLintStage,
  runTestStage,
  runSecurityStage,
  runBundleStage
} from './stages';

// Scoring algorithm (pre-work bounty evaluation)
export * from './scoring';

// Source integrations (API clients for fetching bounties)
export * from './sources';
