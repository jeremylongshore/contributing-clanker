---
title: MCP server target list — surgical PR candidates
category: RL
type: RSRC
status: draft
last_updated: 2026-05-04
epic: contributing-clanker-wgd
---

# MCP server target list

Strategic intent: surgical PRs at named-brand MCP server repos for proof-of-work portfolio. Combines two credibility signals — **named-brand recognition** (GitHub, AWS, Notion, Sentry, etc.) and **Anthropic ecosystem alignment** (Model Context Protocol). A merged PR at any of these is a portfolio line item.

## Tier 1 — Anthropic-official repos under `modelcontextprotocol/`

These are the protocol authors themselves. Highest signal value.

| Stars | Open issues | Repo | Lang | Notes |
|---|---|---|---|---|
| 85,000 | 249 | [`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers) | TypeScript | The official mono-repo. Lots of small servers (filesystem, github, gitlab, slack, postgres, ...) — many surface areas |
| 22,869 | 240 | [`modelcontextprotocol/python-sdk`](https://github.com/modelcontextprotocol/python-sdk) | Python | Official Python SDK. High issue volume = lots of doc/typo/test-coverage surface |
| 12,337 | 188 | [`modelcontextprotocol/typescript-sdk`](https://github.com/modelcontextprotocol/typescript-sdk) | TypeScript | Official TS SDK |
| 9,651 | 157 | [`modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector) | TypeScript | Visual MCP testing tool |
| 7,992 | 127 | [`modelcontextprotocol/modelcontextprotocol`](https://github.com/modelcontextprotocol/modelcontextprotocol) | TypeScript | The protocol spec + docs site |
| 6,768 | 71 | [`modelcontextprotocol/registry`](https://github.com/modelcontextprotocol/registry) | Go | Community registry service |
| 4,469 | n/a | [`modelcontextprotocol/go-sdk`](https://github.com/modelcontextprotocol/go-sdk) | Go | Go SDK |
| 4,235 | n/a | [`modelcontextprotocol/csharp-sdk`](https://github.com/modelcontextprotocol/csharp-sdk) | C# | C# SDK |
| 3,392 | n/a | [`modelcontextprotocol/java-sdk`](https://github.com/modelcontextprotocol/java-sdk) | Java | Java SDK |
| 3,373 | n/a | [`modelcontextprotocol/rust-sdk`](https://github.com/modelcontextprotocol/rust-sdk) | Rust | Rust SDK |

## Tier 2 — Named brand official MCP servers

Built and maintained by the named company. Brand-name credibility.

| Stars | Open | Repo | Lang | Brand |
|---|---|---|---|---|
| 54,377 | 121 | [`upstash/context7`](https://github.com/upstash/context7) | TypeScript | Upstash (serverless data platform) |
| 38,026 | 78 | [`ChromeDevTools/chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | TypeScript | Google / Chrome DevTools |
| 29,486 | 183 | [`github/github-mcp-server`](https://github.com/github/github-mcp-server) | Go | GitHub (Microsoft) |
| 8,941 | 150 | [`awslabs/mcp`](https://github.com/awslabs/mcp) | Python | AWS / Amazon |
| 6,203 | 61 | [`firecrawl/firecrawl-mcp-server`](https://github.com/firecrawl/firecrawl-mcp-server) | JavaScript | Firecrawl (web crawling) |
| 5,402 | 18 | [`getsentry/XcodeBuildMCP`](https://github.com/getsentry/XcodeBuildMCP) | TypeScript | Sentry |
| 4,373 | 1 | [`exa-labs/exa-mcp-server`](https://github.com/exa-labs/exa-mcp-server) | TypeScript | Exa Labs |
| 4,289 | 131 | [`makenotion/notion-mcp-server`](https://github.com/makenotion/notion-mcp-server) | TypeScript | Notion |

## Tier 3 — Popular MCP-adjacent libraries

High-traffic libraries used by MCP server authors. Slightly less brand-name but huge portfolio leverage.

| Stars | Open | Repo | Lang | What |
|---|---|---|---|---|
| 24,970 | 224 | [`PrefectHQ/fastmcp`](https://github.com/PrefectHQ/fastmcp) | Python | Prefect's Pythonic MCP framework — most popular Python entry point |
| 14,768 | 236 | [`triggerdotdev/trigger.dev`](https://github.com/triggerdotdev/trigger.dev) | TypeScript | Trigger.dev (job scheduling, MCP integration) |
| 11,838 | 87 | [`tadata-org/fastapi_mcp`](https://github.com/tadata-org/fastapi_mcp) | Python | FastAPI → MCP exposure layer |

## Tier 4 — Community-maintained, named project

| Stars | Open | Repo | Lang | What |
|---|---|---|---|---|
| 344 | 15 | [`jerhadf/linear-mcp-server`](https://github.com/jerhadf/linear-mcp-server) | JavaScript | Most-starred unofficial Linear MCP. (Linear has no official server as of 2026-05-04.) |

## Top 5 — Build dossiers for these first

Highest impact-per-effort for surgical PRs:

1. **`modelcontextprotocol/servers`** — Anthropic-official, mono-repo with dozens of sub-servers, 249 open issues. Massive portfolio asset per merge.
2. **`github/github-mcp-server`** — Anthropic ecosystem + GitHub brand. Go (smaller community of Go contributors → less competition for surgical PRs).
3. **`modelcontextprotocol/python-sdk`** — Python SDK, 240 open issues. Lots of doc / test / typo surface area.
4. **`PrefectHQ/fastmcp`** — most popular Python MCP framework. Very approachable; Prefect maintainers are active.
5. **`makenotion/notion-mcp-server`** — Notion is a household name. 131 open issues. Mid-size repo.

## Surgical-PR scout filter heuristic (for `@scout` against this list)

Apply ALL of:

- **Label match**: `good first issue`, `good-first-issue`, `documentation`, `docs`, `typo`, `help wanted`, `easy`, `beginner-friendly`
- **Issue body length**: under 1500 chars (longer issues usually require design discussion)
- **Comment count**: under 5 (more = active discussion / opinion sprawl, slower review)
- **Open age**: between 3 and 90 days (newer = maintainers haven't seen it; older = abandoned)
- **No competing PRs**: `gh search prs --repo=<repo> <issue#> --state=open` returns zero
- **No assignees**: maintainers haven't claimed it themselves
- **State open** (obviously)

Quick-reject:

- AI-disclosure required + repo has any history of AI-skepticism (check dossier `## Pet peeves` for AI-policy strikes)
- CLA required (kills proof-of-work value if signing burns cycles)
- Issue mentions "design", "RFC", "proposal", "discussion" — too big
- Issue body has "good first issue" but is actually a multi-step refactor (read body, don't trust label)

## Excluded from the list

| Repo | Why excluded |
|---|---|
| `n8n-io/n8n` | 186K★ but MCP is one feature; the repo is too broad |
| `google-gemini/gemini-cli` | Different ecosystem (Gemini, not Anthropic) |
| `bytedance/UI-TARS-desktop` | Brand recognition limited to AI-research circles |
| `Mintplex-Labs/anything-llm` | Not MCP-first; LLM gateway with MCP support |
| `Portkey-AI/gateway` | LLM gateway, MCP secondary |

## Process notes

- Build dossiers in **parallel** when researching multiple repos (background `researcher-build.sh` per repo)
- Always check the dossier first before any transition — gates read from it
- Surgical PRs target one of: typo, broken link, missing test case, error message clarity, comment fix, version bump, doc clarification
- Default to **Design Issue first** for anything bigger than a typo-class change (per skill philosophy)

## Cross-references

- Skill: `~/.claude/skills/contribute/SKILL.md`
- Risk register: `010-OD-RISK-operations-and-risk.md`
- Failure-mode catalog: `007-DR-CATG-failure-mode-catalog.md` (the gates are derived from this)
- Tracking epic: bead `contributing-clanker-wgd`
