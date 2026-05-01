#!/usr/bin/env node
import { Command } from 'commander';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { createCommand } from './commands/create';
import { claimCommand, unclaimCommand } from './commands/claim';
import { configCommand } from './commands/config';
import { workCommand } from './commands/work';
import { submitCommand } from './commands/submit';
import { githubCommand } from './commands/github';
import { vetCommand } from './commands/vet';
import { scoreCommand } from './commands/score';
import { syncCommand } from './commands/sync';

// Database management
import { dbCommand } from './commands/db';

// Progressive workflow commands
import { huntCommand } from './commands/hunt';
import { qualifyCommand } from './commands/qualify';
import { planCommand } from './commands/plan';
import { draftCommand } from './commands/draft';
import { workflowSubmitCommand } from './commands/workflow-submit';

// Repo profile management
import { repoCommand } from './commands/repo';

// Index-first architecture (v2)
import { sourceCommand } from './commands/source';
import { ingestCommand } from './commands/ingest';
import { bootstrapCommand, ttfgCommand } from './commands/bootstrap';
import { maintainerCommand } from './commands/maintainer';
import { rulesCommand } from './commands/rules';
import { claCommand, dcoCommand } from './commands/cla';
import { styleCommand } from './commands/style';

// Evidence, Testing, and Judge Gates (v6)
import { evidenceCommand } from './commands/evidence';
import { testCommand } from './commands/test';
import { judgeCommand } from './commands/judge';

// Environment detection
import { envCommand } from './commands/env';

// Reputation mode and abort/pivot
import { repCommand } from './commands/rep';
import { abortCommand, abortStatsCommand } from './commands/abort';

// Analytics and metrics
import { metricsCommand } from './commands/metrics';

// Text rewrite and competition monitoring (v7)
import { textCommand } from './commands/text';
import { competitionCommand } from './commands/competition';

// Seed and baseline discovery (v8)
import { seedCommand } from './commands/seed';

// Repo blocklist management (v9)
import { bunkCommand } from './commands/bunk';

const program = new Command();

program
  .name('bounty')
  .description('Bounty hunting CLI - track, record, and prove your work')
  .version('0.2.0');

// Core commands
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(createCommand);
program.addCommand(claimCommand);
program.addCommand(unclaimCommand);
program.addCommand(submitCommand);

// Workflow commands
program.addCommand(workCommand);

// Config command
program.addCommand(configCommand);

// GitHub integration
program.addCommand(githubCommand);

// Sync from multiple sources
program.addCommand(syncCommand);

// Vetting pipeline
program.addCommand(vetCommand);

// Scoring (pre-work evaluation)
program.addCommand(scoreCommand);

// Database management
program.addCommand(dbCommand);

// Progressive workflow (hunt → qualify → plan → draft → submit)
program.addCommand(huntCommand);
program.addCommand(qualifyCommand);
program.addCommand(planCommand);
program.addCommand(draftCommand);
program.addCommand(workflowSubmitCommand);

// Repo profile management
program.addCommand(repoCommand);

// Index-first architecture (v2)
program.addCommand(sourceCommand);
program.addCommand(ingestCommand);
program.addCommand(bootstrapCommand);
program.addCommand(ttfgCommand);
program.addCommand(maintainerCommand);
program.addCommand(rulesCommand);

// CLA/DCO management
program.addCommand(claCommand);
program.addCommand(dcoCommand);

// Style guide management
program.addCommand(styleCommand);

// Evidence, Testing, and Judge Gates (v6)
program.addCommand(evidenceCommand);
program.addCommand(testCommand);
program.addCommand(judgeCommand);

// Environment detection
program.addCommand(envCommand);

// Reputation mode
program.addCommand(repCommand);

// Abort/Pivot mechanics
program.addCommand(abortCommand);
program.addCommand(abortStatsCommand);

// Analytics and metrics
program.addCommand(metricsCommand);

// Text rewrite and competition monitoring (v7)
program.addCommand(textCommand);
program.addCommand(competitionCommand);

// Seed and baseline discovery (v8)
program.addCommand(seedCommand);

// Repo blocklist management (v9)
program.addCommand(bunkCommand);

// Quick aliases
program
  .command('open')
  .description('List open bounties (alias for list -s open)')
  .action(async () => {
    await listCommand.parseAsync(['node', 'bounty', 'list', '-s', 'open']);
  });

program
  .command('mine')
  .description('List my claimed/in-progress bounties')
  .action(async () => {
    await listCommand.parseAsync(['node', 'bounty', 'list', '-s', 'claimed']);
  });

program.parse();
