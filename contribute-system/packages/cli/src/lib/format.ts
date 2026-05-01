import chalk from 'chalk';
import { table } from 'table';
import type { Bounty, Domain, LedgerEntry } from '@contribute/core';

const STATUS_COLORS: Record<string, (s: string) => string> = {
  open: chalk.green,
  claimed: chalk.yellow,
  in_progress: chalk.blue,
  submitted: chalk.cyan,
  vetting: chalk.magenta,
  completed: chalk.greenBright,
  paid: chalk.white,
  cancelled: chalk.gray,
  revision: chalk.red
};

export function formatStatus(status: string): string {
  const colorFn = STATUS_COLORS[status] || chalk.white;
  return colorFn(status);
}

export function formatValue(value: number, currency: string = 'USD'): string {
  if (currency === 'USD') {
    return chalk.green(`$${value.toLocaleString()}`);
  }
  return `${value} ${currency}`;
}

export function formatBountyRow(b: Bounty): string[] {
  return [
    chalk.dim(b.id.slice(0, 8)),
    b.title.slice(0, 40) + (b.title.length > 40 ? '...' : ''),
    formatValue(b.value, b.currency),
    formatStatus(b.status),
    b.repo || '-',
    b.domainId
  ];
}

export function formatBountiesTable(bounties: Bounty[]): string {
  if (bounties.length === 0) {
    return chalk.dim('No bounties found');
  }

  const data = [
    ['ID', 'Title', 'Value', 'Status', 'Repo', 'Domain'].map(h => chalk.bold(h)),
    ...bounties.map(formatBountyRow)
  ];

  return table(data, {
    border: {
      topBody: '',
      topJoin: '',
      topLeft: '',
      topRight: '',
      bottomBody: '',
      bottomJoin: '',
      bottomLeft: '',
      bottomRight: '',
      bodyLeft: '',
      bodyRight: '',
      bodyJoin: chalk.dim('│'),
      joinBody: '',
      joinLeft: '',
      joinRight: '',
      joinJoin: ''
    }
  });
}

export function formatBountyDetail(b: Bounty): string {
  const lines = [
    '',
    chalk.bold(`${b.title}`),
    chalk.dim('─'.repeat(60)),
    `${chalk.bold('ID:')}       ${b.id}`,
    `${chalk.bold('Value:')}    ${formatValue(b.value, b.currency)}`,
    `${chalk.bold('Status:')}   ${formatStatus(b.status)}`,
    `${chalk.bold('Source:')}   ${b.source}`,
    `${chalk.bold('Domain:')}   ${b.domainId}`,
  ];

  if (b.repo) lines.push(`${chalk.bold('Repo:')}     ${b.repo}`);
  if (b.issue) lines.push(`${chalk.bold('Issue:')}    #${b.issue}`);
  if (b.pr) lines.push(`${chalk.bold('PR:')}       #${b.pr}`);
  if (b.issueUrl) lines.push(`${chalk.bold('URL:')}      ${b.issueUrl}`);

  lines.push('');
  if (b.description) {
    lines.push(chalk.bold('Description:'));
    lines.push(b.description);
    lines.push('');
  }

  if (b.timeline && b.timeline.length > 0) {
    lines.push(chalk.bold('Timeline:'));
    for (const cp of b.timeline.slice(-5)) {
      const time = new Date(cp.timestamp).toLocaleString();
      lines.push(`  ${chalk.dim(time)} ${cp.type}: ${cp.message}`);
    }
    lines.push('');
  }

  if (b.notes) {
    lines.push(chalk.bold('Notes:'));
    lines.push(b.notes);
  }

  return lines.join('\n');
}

export function formatLedgerTable(entries: LedgerEntry[]): string {
  if (entries.length === 0) {
    return chalk.dim('No ledger entries found');
  }

  const data = [
    ['Date', 'Type', 'Amount', 'Status', 'Description'].map(h => chalk.bold(h)),
    ...entries.map(e => [
      new Date(e.date).toLocaleDateString(),
      e.type,
      formatValue(e.amount, e.currency),
      e.status,
      e.description.slice(0, 30)
    ])
  ];

  return table(data);
}

export function formatDomainsTable(domains: Domain[]): string {
  if (domains.length === 0) {
    return chalk.dim('No domains found');
  }

  const data = [
    ['Slug', 'Name', 'Client', 'Bounties', 'Revenue'].map(h => chalk.bold(h)),
    ...domains.map(d => [
      d.slug,
      d.name,
      d.client || '-',
      d.stats?.completedBounties?.toString() || '0',
      formatValue(d.stats?.totalRevenue || 0)
    ])
  ];

  return table(data);
}
