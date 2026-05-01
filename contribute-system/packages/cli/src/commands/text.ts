/**
 * Text Command - Lint and rewrite content to match repo style
 *
 * Closes the "lint but can't fix" gap by providing auto-rewrite
 * that conforms to repo rules, style guide, and removes AI-ish patterns.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, closeDb } from '../lib/db';
import { sendSlackNotification, type SlackMessage } from '../lib/slack';

export const textCommand = new Command('text')
  .description('Lint and rewrite text to match repo style');

// AI-ish patterns to remove (from style.ts)
const AI_PATTERNS = [
  /I would be happy to/gi,
  /I'd be happy to/gi,
  /I would like to/gi,
  /I'd like to/gi,
  /I can help you/gi,
  /Let me help you/gi,
  /I'll help you/gi,
  /As an AI/gi,
  /As a language model/gi,
  /I don't have personal/gi,
  /I cannot provide/gi,
  /Please note that/gi,
  /It's important to note/gi,
  /It's worth noting/gi,
  /In conclusion/gi,
  /To summarize/gi,
  /In summary/gi,
  /This should be easy/gi,
  /This should be quick/gi,
  /This is a simple/gi,
  /Let me know if you have any questions/gi,
  /Feel free to ask/gi,
  /Hope this helps/gi,
  /I hope this helps/gi,
  /Don't hesitate to/gi,
];

// Replacement map for common AI patterns
const PATTERN_REPLACEMENTS: [RegExp, string][] = [
  [/I would be happy to help with this\./gi, ''],
  [/I'd be happy to help\./gi, ''],
  [/I would like to help/gi, 'This'],
  [/I'd like to/gi, 'Will'],
  [/I can help you with/gi, ''],
  [/Let me help you with/gi, ''],
  [/Please note that/gi, 'Note:'],
  [/It's important to note that/gi, ''],
  [/It's worth noting that/gi, ''],
  [/In conclusion,?/gi, ''],
  [/To summarize,?/gi, ''],
  [/In summary,?/gi, ''],
  [/This should be easy\.?/gi, ''],
  [/This should be quick\.?/gi, ''],
  [/This is a simple/gi, 'This is a'],
  [/Let me know if you have any questions\.?/gi, ''],
  [/Feel free to ask\.?/gi, ''],
  [/Hope this helps\.?/gi, ''],
  [/I hope this helps\.?/gi, ''],
  [/Don't hesitate to reach out\.?/gi, ''],
];

interface LintResult {
  passed: boolean;
  issues: string[];
  rulesIssues: string[];
  styleIssues: string[];
  toneIssues: string[];
}

interface RewriteResult {
  original: string;
  rewritten: string;
  changes: string[];
  lintBefore: LintResult;
  lintAfter: LintResult;
}

/**
 * Lint text against repo rules and style
 */
textCommand
  .command('lint')
  .description('Check text for AI patterns and style violations')
  .requiredOption('-r, --repo <repo>', 'Repository (owner/repo)')
  .option('-i, --in <file>', 'Input file to lint')
  .option('-t, --text <text>', 'Text to lint directly')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (options) => {
    if (!options.in && !options.text) {
      console.error(chalk.red('Either --in <file> or --text <text> required'));
      process.exit(1);
    }

    const spinner = ora('Linting text...').start();

    try {
      const db = getDb();
      const repo = options.repo;

      // Get text content
      let content: string;
      if (options.in) {
        if (!fs.existsSync(options.in)) {
          spinner.fail(`File not found: ${options.in}`);
          process.exit(1);
        }
        content = fs.readFileSync(options.in, 'utf-8');
      } else {
        content = options.text;
      }

      // Get repo profile
      const profileResult = await db.execute({
        sql: 'SELECT rules_json, style_guide_json FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      const profile = profileResult.rows[0] as any;
      const rules = profile?.rules_json ? JSON.parse(profile.rules_json) : null;
      const style = profile?.style_guide_json ? JSON.parse(profile.style_guide_json) : null;

      // Run lint
      const result = lintContent(content, rules, style);

      spinner.stop();

      // Display results
      console.log(chalk.bold('\nLint Results\n'));
      console.log(chalk.dim('─'.repeat(60)));

      if (result.passed) {
        console.log(chalk.green('✓ All checks passed'));
      } else {
        console.log(chalk.red(`✗ ${result.issues.length} issue(s) found`));
      }

      if (result.toneIssues.length > 0) {
        console.log('\n' + chalk.yellow('Tone Issues (AI-ish patterns):'));
        for (const issue of result.toneIssues) {
          console.log(`  • ${issue}`);
        }
      }

      if (result.rulesIssues.length > 0) {
        console.log('\n' + chalk.yellow('Rules Issues:'));
        for (const issue of result.rulesIssues) {
          console.log(`  • ${issue}`);
        }
      }

      if (result.styleIssues.length > 0) {
        console.log('\n' + chalk.yellow('Style Issues:'));
        for (const issue of result.styleIssues) {
          console.log(`  • ${issue}`);
        }
      }

      console.log('\n' + chalk.dim('─'.repeat(60)));

      if (!result.passed) {
        console.log(chalk.dim('\nFix with: bounty text rewrite --repo ' + repo + ' --in <file>'));
      }

      console.log('');

    } catch (error) {
      spinner.fail('Lint failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

/**
 * Rewrite text to match repo style and remove AI patterns
 */
textCommand
  .command('rewrite')
  .description('Rewrite text to match repo style and remove AI patterns')
  .requiredOption('-r, --repo <repo>', 'Repository (owner/repo)')
  .requiredOption('-i, --in <file>', 'Input file to rewrite')
  .option('-o, --out <file>', 'Output file (defaults to input.rewritten.md)')
  .option('--intent <intent>', 'Content intent: claim|pr|issue', 'claim')
  .option('--no-slack', 'Skip Slack notification')
  .action(async (options) => {
    const spinner = ora('Rewriting text...').start();

    try {
      const db = getDb();
      const repo = options.repo;

      // Validate intent
      const validIntents = ['claim', 'pr', 'issue'];
      if (!validIntents.includes(options.intent)) {
        spinner.fail(`Invalid intent: ${options.intent}`);
        console.log(chalk.dim(`Valid intents: ${validIntents.join(', ')}`));
        process.exit(1);
      }

      // Read input file
      if (!fs.existsSync(options.in)) {
        spinner.fail(`File not found: ${options.in}`);
        process.exit(1);
      }
      const originalContent = fs.readFileSync(options.in, 'utf-8');

      // Get repo profile
      const profileResult = await db.execute({
        sql: 'SELECT rules_json, style_guide_json, style_guide_summary FROM repo_profiles WHERE repo = ?',
        args: [repo]
      });

      const profile = profileResult.rows[0] as any;
      const rules = profile?.rules_json ? JSON.parse(profile.rules_json) : null;
      const style = profile?.style_guide_json ? JSON.parse(profile.style_guide_json) : null;

      if (!rules && !style) {
        spinner.warn('No rules or style guide found for repo');
        console.log(chalk.dim('Run: bounty rules refresh ' + repo));
        console.log(chalk.dim('Run: bounty style fetch ' + repo));
      }

      // Perform rewrite
      const result = rewriteContent(originalContent, rules, style, options.intent);

      // Determine output path
      const outPath = options.out || options.in.replace(/(\.[^.]+)$/, '.rewritten$1');

      // Write output
      fs.writeFileSync(outPath, result.rewritten);

      spinner.succeed('Text rewritten');

      // Display results
      console.log(chalk.bold('\nRewrite Results\n'));
      console.log(chalk.dim('─'.repeat(60)));

      console.log(`  Input: ${options.in}`);
      console.log(`  Output: ${outPath}`);
      console.log(`  Intent: ${options.intent}`);
      console.log(`  Changes: ${result.changes.length}`);

      console.log('\n' + chalk.bold('Changes Made:'));
      for (const change of result.changes.slice(0, 10)) {
        console.log(`  • ${change}`);
      }
      if (result.changes.length > 10) {
        console.log(chalk.dim(`  ... and ${result.changes.length - 10} more`));
      }

      console.log('\n' + chalk.bold('Lint Status:'));
      console.log(`  Before: ${result.lintBefore.passed ? chalk.green('PASS') : chalk.red('FAIL')} (${result.lintBefore.issues.length} issues)`);
      console.log(`  After:  ${result.lintAfter.passed ? chalk.green('PASS') : chalk.red('FAIL')} (${result.lintAfter.issues.length} issues)`);

      console.log('\n' + chalk.dim('─'.repeat(60)));

      // Show before/after excerpt
      console.log('\n' + chalk.bold('Before (excerpt):'));
      console.log(chalk.dim(originalContent.slice(0, 200) + (originalContent.length > 200 ? '...' : '')));

      console.log('\n' + chalk.bold('After (excerpt):'));
      console.log(chalk.green(result.rewritten.slice(0, 200) + (result.rewritten.length > 200 ? '...' : '')));

      // Slack notification
      if (options.slack !== false) {
        await sendSlackNotification({
          type: 'bounty_draft',
          repo,
          content: `📝 *TEXT REWRITE*\n\n*Repo:* ${repo}\n*Intent:* ${options.intent}\n*Changes:* ${result.changes.length}\n\n*Lint:*\n• Before: ${result.lintBefore.passed ? '✓ PASS' : '✗ FAIL'}\n• After: ${result.lintAfter.passed ? '✓ PASS' : '✗ FAIL'}\n\n*Output:* ${outPath}`
        } as SlackMessage);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Rewrite failed');
      console.error(error);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Lint Logic
// ─────────────────────────────────────────────────────────────────────────────

function lintContent(content: string, rules: any, style: any): LintResult {
  const issues: string[] = [];
  const toneIssues: string[] = [];
  const rulesIssues: string[] = [];
  const styleIssues: string[] = [];

  // Check for AI-ish patterns
  for (const pattern of AI_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      const issue = `AI pattern: "${matches[0]}"`;
      toneIssues.push(issue);
      issues.push(issue);
    }
  }

  // Check rules compliance
  if (rules) {
    // Check for required sections based on rules
    if (rules.prTemplate) {
      // Extract expected sections from PR template
      const sectionHeaders = rules.prTemplate.match(/##\s+[^\n]+/g) || [];
      for (const header of sectionHeaders) {
        const sectionName = header.replace('## ', '').trim();
        if (!content.toLowerCase().includes(sectionName.toLowerCase())) {
          const issue = `Missing section: "${sectionName}" (from PR template)`;
          rulesIssues.push(issue);
          issues.push(issue);
        }
      }
    }

    // Check PR naming convention if applicable
    if (rules.prNamingConvention && content.includes('Title:')) {
      const titleMatch = content.match(/Title:\s*(.+)/);
      if (titleMatch) {
        const title = titleMatch[1];
        const conventionPattern = new RegExp(rules.prNamingConvention.pattern || '');
        if (conventionPattern.source !== '(?:)' && !conventionPattern.test(title)) {
          const issue = `Title doesn't match convention: ${rules.prNamingConvention.description || rules.prNamingConvention.pattern}`;
          rulesIssues.push(issue);
          issues.push(issue);
        }
      }
    }
  }

  // Check style compliance
  if (style) {
    // Check brevity
    if (style.avgDescriptionLength && content.length > style.avgDescriptionLength * 2) {
      const issue = `Content may be too long (${content.length} chars vs avg ${style.avgDescriptionLength})`;
      styleIssues.push(issue);
      issues.push(issue);
    }

    // Check bullet vs prose preference
    if (style.prefersBullets === false) {
      const bulletCount = (content.match(/^[-*]\s/gm) || []).length;
      const lineCount = content.split('\n').length;
      if (bulletCount / lineCount > 0.5) {
        const issue = 'Excessive bullets (repo prefers prose)';
        styleIssues.push(issue);
        issues.push(issue);
      }
    }

    // Check heading depth
    if (style.maxHeadingDepth) {
      const deepHeadings = content.match(new RegExp(`^#{${style.maxHeadingDepth + 1},}\\s`, 'gm'));
      if (deepHeadings) {
        const issue = `Headings too deep (max ${style.maxHeadingDepth} levels)`;
        styleIssues.push(issue);
        issues.push(issue);
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    rulesIssues,
    styleIssues,
    toneIssues
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rewrite Logic
// ─────────────────────────────────────────────────────────────────────────────

function rewriteContent(content: string, rules: any, style: any, intent: string): RewriteResult {
  const changes: string[] = [];
  let rewritten = content;

  // Lint before
  const lintBefore = lintContent(content, rules, style);

  // 1. Remove AI-ish patterns
  for (const [pattern, replacement] of PATTERN_REPLACEMENTS) {
    const matches = rewritten.match(pattern);
    if (matches) {
      rewritten = rewritten.replace(pattern, replacement);
      changes.push(`Removed: "${matches[0]}"`);
    }
  }

  // 2. Clean up double spaces and empty lines from removals
  rewritten = rewritten.replace(/  +/g, ' ');
  rewritten = rewritten.replace(/\n{3,}/g, '\n\n');
  rewritten = rewritten.replace(/^\s+$/gm, '');

  // 3. Apply style preferences
  if (style) {
    // Trim to max length if needed
    if (style.avgDescriptionLength && rewritten.length > style.avgDescriptionLength * 1.5) {
      // Keep first paragraph and essential content
      const paragraphs = rewritten.split('\n\n');
      let trimmed = '';
      for (const para of paragraphs) {
        if (trimmed.length + para.length < style.avgDescriptionLength * 1.5) {
          trimmed += (trimmed ? '\n\n' : '') + para;
        }
      }
      if (trimmed.length < rewritten.length) {
        changes.push(`Trimmed from ${rewritten.length} to ${trimmed.length} chars`);
        rewritten = trimmed;
      }
    }

    // Convert bullets to prose if repo prefers prose
    if (style.prefersBullets === false) {
      const bulletLines = rewritten.match(/^[-*]\s+(.+)$/gm);
      if (bulletLines && bulletLines.length >= 3) {
        // Convert bullet list to sentence
        const items = bulletLines.map(line => line.replace(/^[-*]\s+/, '').trim());
        const sentence = items.join(', ') + '.';
        rewritten = rewritten.replace(/(?:^[-*]\s+.+$\n?)+/gm, sentence + '\n\n');
        changes.push('Converted bullets to prose');
      }
    }
  }

  // 4. Apply intent-specific formatting
  if (intent === 'claim') {
    // Claims should be concise
    if (!rewritten.startsWith('Claiming') && !rewritten.startsWith('I\'ll') && !rewritten.startsWith('Will')) {
      // Don't add prefix if already starts appropriately
    }
  } else if (intent === 'pr') {
    // Ensure PR has required sections from rules
    if (rules?.prTemplate) {
      const sectionHeaders = rules.prTemplate.match(/##\s+[^\n]+/g) || [];
      for (const header of sectionHeaders) {
        const sectionName = header.replace('## ', '').trim();
        if (!rewritten.toLowerCase().includes(sectionName.toLowerCase())) {
          rewritten += `\n\n${header}\n\n_TODO: Add ${sectionName.toLowerCase()}_`;
          changes.push(`Added missing section: ${sectionName}`);
        }
      }
    }
  }

  // 5. Final cleanup
  rewritten = rewritten.trim();

  // Lint after
  const lintAfter = lintContent(rewritten, rules, style);

  return {
    original: content,
    rewritten,
    changes,
    lintBefore,
    lintAfter
  };
}
