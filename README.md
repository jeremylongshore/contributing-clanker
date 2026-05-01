# OSS Contributions HQ

Workspace for tracking open source contributions. Contains clones of upstream projects with paid-contribution programs (Algora, Gumroad, Cortex, etc.) plus the contribution tracker.

The actual workflow lives in the **[`/contribute` Claude Code skill](https://github.com/jeremylongshore/dotfiles)** at `~/.claude/skills/contribute/`. Run `/contribute` in any Claude Code session to discover, qualify, and submit contributions. The skill auto-refreshes state from `gh` + the local SQLite tracker on invoke.

## Tracking

- **[contribution-tracker.csv](./000-docs/002-PM-BKLG-contribution-tracker.csv)** — canonical contribution backlog
- **[payment-tracker.md](./000-docs/001-BL-TRCK-payment-tracker.md)** — payment status across programs
- **`~/.contribute-system/contribute.db`** — local SQLite (28 contributions). Source of truth, derived from CSV + GitHub state.
- **[surgical-contributions.md](./surgical-contributions.md)** — curated <100 LOC template-based opportunities

## Active Work

| Repo | Task | Reward | Status | PR |
|------|------|--------|--------|-----|
| gumroad | _legacy.scss | $1,500 | PR Submitted | [#2573](https://github.com/antiwork/gumroad/pull/2573) |

## Repos in this Workspace

| Repo | Stack | Reward | Notes |
|------|-------|--------|-------|
| [gumroad/](./gumroad/) | CSS/Tailwind | $1.5K/file | Tailwind migration |
| [screenpipe](https://algora.io/mediar-ai/bounties/community) | TypeScript/AI | $25-500 | $4,910 pool |
| [tscircuit](https://algora.io/tscircuit/bounties/community) | React/TS | $25-150 | PCB design |
| [golemcloud](https://algora.io/golemcloud/bounties/community) | Rust/WASM | $3.5K | MCP/TTS |
| [zio/](./zio/), [zio-blocks/](./zio-blocks/) | Scala 3 | $2-4K | Schema/Patch |
| [cal-com/](./cal-com/), [calcom/](./calcom/) | TS/Next.js | $20-500 | |
| [posthog/](./posthog/) | Python/Django + React | Varies | |
| [cortex/](./cortex/) | Python | $50-200 | CLA required |
| [feishin/](./feishin/) | React + Electron | Contrib | |
| [tldraw/](./tldraw/) | TS/React | Varies | |
| [appsmith/](./appsmith/) | Java + React/TS | Varies | |
| [vertex-ai-samples/](./vertex-ai-samples/) | Python notebooks | Contrib | CLA required |
| [filament/](./filament/) | PHP/Laravel | Varies | own CLAUDE.md |
| [shadcn-ui/](./shadcn-ui/) | TS/React | Varies | own CLAUDE.md |
| [projectdiscovery/](./projectdiscovery/) | YAML | $100 | CVE templates |

## Payment Process

| Program | Process |
|---------|---------|
| Algora | Platform handles payment automatically (120+ countries) |
| Gumroad | Email `bounties@antiwork.com` with PR link + payment email; Stripe payout |
| Cortex | Bitcoin (preferred), USDC, or PayPal within 48h |

## Sources

- [Algora](https://algora.io/bounties/) · [IssueHunt](https://issuehunt.io/) · [BountyHub](https://www.bountyhub.dev/)
- [Gumroad #1055](https://github.com/antiwork/gumroad/issues/1055)

## What was deprecated 2026-04-30

A previous version of this repo had an internal `contribute-system/` monorepo (Next.js dashboard, TS CLI, Cloud Functions, Vertex AI orchestrator). It was never used in practice. On 2026-04-30 it was deleted; the GCP project `intentional-bounty` was scheduled for deletion; the workflow collapsed into the `/contribute` skill. Historical planning docs are in [`99-archived-system-docs/`](./99-archived-system-docs/). Code lives in git history.
