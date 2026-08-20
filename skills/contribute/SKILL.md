---
name: contribute
description: |
  Local-only OSS contribution command center. Auto-refreshes the user's
  in-flight PR and issue state on invoke so conversations start with full
  context — no need to brief Claude on what's in flight. Helps the user
  find issues to contribute to on GitHub, builds per-repo dossiers of what
  each upstream expects (CLA, DCO, branch convention, AI policy, draft-first,
  review bots, issue templates), runs deterministic gates before any
  external action so AI-assisted contributions don't reach maintainers as
  slop. State is markdown-only: candidate files at
  ~/.contribute-system/candidates/, repo dossiers at
  ~/.contribute-system/research/, append-only event log at
  ~/.contribute-system/log.jsonl. No database, no cloud calls.
  Use when the user asks about their PRs / issues / contributions, wants to
  find new work to take on, claim an issue, build/refresh a repo's dossier,
  or draft a Design Issue or PR. Trigger with "/contribute", "what's my PR
  status", "find a contribution", "claim issue X", "draft a Design Issue
  for Y", "refresh dossier for Z". Also triggers on "/contribute <github-url>"
  or "/contribute owner/repo" — onboards a new repo (builds dossier, stubs
  candidates, surfaces context) or resurfaces briefing for a known repo.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - Task
  - Bash(gh:*)
  - Bash(git:*)
  - Bash(node:*)
  - Bash(pnpm:*)
  - Bash(yarn:*)
  - Bash(npm:*)
  - Bash(cargo:*)
  - Bash(pytest:*)
  - Bash(python:*)
  - Bash(python3:*)
  - Bash(bash:*)
  - Bash(jq:*)
  - Bash(base64:*)
version: "4.0.0"
author: "Jeremy Longshore <jeremy@intentsolutions.io>"
license: "MIT"
compatibility: "Designed for Claude Code; requires gh CLI and jq on PATH"
tags: [oss, contributions, github, contributing-clanker, ai-slop-prevention]
---

# Contribute Command Center

## Overview

Local-only OSS contribution workflow. The skill itself is the system — there is no separate CLI binary, dashboard, or cloud backend. State lives in three places:

1. **GitHub itself** — fetched live via `gh` for any PR/issue state question. Never cached long-term.
2. **Markdown candidate files** at `~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md` — one per issue we're tracking. Frontmatter is the queryable layer (status, scout_score, repo, research_path, overrides). Body holds claim drafts, PR drafts, scope notes.
3. **Markdown repo dossiers** at `~/.contribute-system/research/<owner>__<repo>.md` — one per upstream repo we contribute to. Built by the `@researcher` subagent. Frontmatter is canonical for every gate (CLA, DCO, branch convention, AI policy, draft-first, review bots, issue templates). Body holds curated knowledge: pet peeves, failure log, free-form notes that survive refresh.
4. **Append-only event log** at `~/.contribute-system/log.jsonl` — every gate run, transition attempt, override, scout/researcher invocation lands here with a UTC timestamp. Filterable via `jq`.

Use this skill when the user wants to:

- Know what's in flight (open PRs, claimed issues, candidate queue)
- Find a new issue to contribute to on GitHub
- Build or refresh a per-repo dossier (delegates to `@researcher`)
- Run gate-checked transitions (claim, work, submit) — every external action passes through `transition.sh` first
- Draft a claim comment, Design Issue, or PR description (default: Design Issue, NOT a PR)
- Run an upstream repo's test suite

The pre-2026-04-30 version of the skill used a SQLite tracker (`~/.contribute-system/contribute.db`, 32 tables) plus a separate `contribute-system/` monorepo (Next.js dashboard, TS CLI, Cloud Functions). Both were deleted because they were never used in practice. The skill now reads markdown directly. That tradeoff is deliberate: human-readable, greppable, git-trackable, survives any tool, no daemon process.

## Prerequisites

- **`gh` CLI**, authenticated as the user (`gh auth status` should show "Logged in")
- **`jq`** on PATH (used by gates + log filtering)
- **Workspace** at `~/000-projects/contributing-clanker/` containing upstream clones (each clone has its own `CLAUDE.md` for project conventions)
- **Runtime state dir** at `~/.contribute-system/` — created on first scout/researcher run if missing

Run this DCI check at activation (output is auto-injected into the prompt):

```!
gh auth status >/dev/null 2>&1 && echo "gh: ok" || echo "gh: NOT logged in"
[ -d ~/.contribute-system/gates ] && echo "gates: $(ls ~/.contribute-system/gates/*.sh 2>/dev/null | wc -l) installed" || echo "gates: not yet installed"
[ -d ~/.contribute-system/candidates ] && echo "candidates: $(ls ~/.contribute-system/candidates/*.md 2>/dev/null | wc -l) tracked" || echo "candidates: empty"
[ -d ~/.contribute-system/research ] && echo "dossiers: $(ls ~/.contribute-system/research/*.md 2>/dev/null | wc -l) built" || echo "dossiers: empty"
[ -f ~/.contribute-system/profile.md ] && echo "profile: ok" || echo "profile: missing — edit ~/.contribute-system/profile.md"
[ -f ~/.contribute-system/log.jsonl ] && echo "log: $(wc -l < ~/.contribute-system/log.jsonl) events" || echo "log: empty"
```

## Instructions

### Argument Detection — check before Step 0

**On every invocation, inspect the args first.** If the args contain a GitHub URL
(`https://github.com/owner/repo` or `github.com/owner/repo`) or a bare `owner/repo`
slug, enter **Repo Init Mode** instead of the normal Step 0 flow. If no args, proceed
to Step 0.

**Wasteland federation repos** — if the owner is `gastownhall` (the org), or the repo
is specifically `julianknutsen/wasteland` (match the **repo**, not the owner —
`julianknutsen` is a personal account with unrelated repos), or the user references a
`w-<id>` board item or the `wl` CLI, this is **Wasteland
work**: claims happen in a Dolt commons via `wl claim` (not `gh issue comment`),
and the deliverable is still a GitHub PR. Read `references/wasteland-federation.md`
before drafting any claim for those repos — it maps the `wl claim → PR → wl done`
flow, which gates adapt (A-phase claim gates read the `wl` board, not GitHub
assignees; C-phase PR gates still fully apply), the `[wendy:github-mirror]`
staleness trap, and the candidate `wl_id` / `scope_verdict` fields.

#### Repo Init Mode

**Step 1 — Parse slug**

```bash
# Strip URL scaffolding, .git suffix, trailing slash
ARG="<invocation arg>"
SLUG=$(echo "$ARG" \
  | sed 's|https://github\.com/||; s|github\.com/||; s|\.git$||; s|/$||')
echo "$SLUG" | grep -qE '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' || { echo "INVALID: $SLUG"; exit 1; }
OWNER=$(echo "$SLUG" | cut -d/ -f1)
REPO=$(echo "$SLUG" | cut -d/ -f2)
DOSSIER=~/.contribute-system/research/${OWNER}__${REPO}.md
```

**Scope guard**: if `OWNER` matches an own-org prefix (`jeremylongshore`, `intent-solutions-io`),
surface a warning — "this looks like one of your own repos; contribute is for upstream-only work"
— and ask if they meant a different URL. Stop until clarified.

**Step 2 — Determine branch: New vs. Known**

Check dossier existence, then take the matching path:

```bash
[ -f "$DOSSIER" ] && BRANCH="known" || BRANCH="new"
```

---

##### Branch A — New repo (no dossier yet)

Full onboarding. Run these in **parallel** first:

```bash
# Repo metadata
gh api repos/${OWNER}/${REPO} \
  --jq '{description:.description, stars:.stargazers_count, language:.language,
         license:.license.name, open_issues:.open_issues_count, default_branch:.default_branch,
         updated:.updated_at, archived:.archived}'

# Open issues
gh issue list --repo ${OWNER}/${REPO} --state=open --limit=20 \
  --json number,title,labels,assignees,createdAt

# CONTRIBUTING.md quick read (first 80 lines)
gh api repos/${OWNER}/${REPO}/contents/CONTRIBUTING.md --jq '.content' \
  2>/dev/null | base64 -d 2>/dev/null | head -80 || echo "no CONTRIBUTING.md"

# PR history — gauge maintainer activity and external merge velocity
gh pr list --repo ${OWNER}/${REPO} --state=merged --limit=10 \
  --json number,title,author,mergedAt
```

Then:

1. **Build the dossier** — invoke `@researcher build ${OWNER}/${REPO}` (subagent at
   `agents/researcher.md`). It fetches deep context (issue templates, CLA, AI policy,
   review bots, etiquette comments) and writes
   `~/.contribute-system/research/${OWNER}__${REPO}.md`. Returns a one-paragraph summary.

2. **Create candidate stubs** for any open, unassigned, un-closing issues — write
   `~/.contribute-system/candidates/${OWNER}__${REPO}__issue<N>.md` with `status: open`
   and `scout_score: 0` (unscored — let `@scout` score them properly before claiming).

3. **Surface onboarding context block** (see Output § Repo Init below).

4. **Log the event**:
```bash
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg repo "${OWNER}/${REPO}" --arg branch "new" \
      '{ts:$ts, event:"repo_init", repo:$repo, branch:$branch, source:"contribute_url_arg"}' \
  >> ~/.contribute-system/log.jsonl
```

5. **Stop** — surface the context block and wait for the user's next instruction.

---

##### Branch B — Known repo (dossier exists)

Briefing mode. No full rebuild needed. Run these in **parallel**:

```bash
# Current dossier freshness
awk '/^last_refreshed:/{print $2; exit}' "$DOSSIER"

# Live open issues (GitHub, not just cached)
gh issue list --repo ${OWNER}/${REPO} --state=open --limit=20 \
  --json number,title,labels,assignees,createdAt

# Existing candidates for this repo
for f in ~/.contribute-system/candidates/${OWNER}__${REPO}__*.md; do
  [ -f "$f" ] || continue
  awk '/^(issue_number|status|scout_score|pr_number):/{print FILENAME, $0}' "$f"
done 2>/dev/null

# Any open PRs already in flight for this repo
gh pr list --repo ${OWNER}/${REPO} --author=@me --state=open \
  --json number,title,isDraft,url 2>/dev/null
```

Then:

1. **If dossier is >14 days old**, invoke `@researcher refresh ${OWNER}/${REPO}`.

2. **Surface a briefing block** (same Output § Repo Init format, but includes existing
   candidates and any open PRs already filed).

3. **Log the event**:
```bash
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg repo "${OWNER}/${REPO}" --arg branch "known" \
      '{ts:$ts, event:"repo_init", repo:$repo, branch:$branch, source:"contribute_url_arg"}' \
  >> ~/.contribute-system/log.jsonl
```

4. **Stop** — surface the briefing and wait for the user's next instruction.

### Step 0 — Refresh state (run first, every time)

**First, print the dashboard.** Run the local ASCII status dashboard and show its
output **verbatim** in a fenced code block (so the box-drawing renders) — this is the
headline the user sees the moment `/contribute` fires:

```bash
# ${CLAUDE_SKILL_DIR} when set (distributable per skill-creator spec); else the install path
"${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/contribute}/scripts/dashboard.sh"
```

It reads only local markdown (candidates + dossiers + `log.jsonl`) — no network — so it
renders instantly and deterministically: the candidate pipeline funnel, in-flight work
needing action, recently-shipped PRs, suggested next tasks (top open by `scout_score` +
stale dossiers + drift), and a recent-activity timeline. Don't paraphrase it; paste the
block, then add any live-state notes below it.

Then, to reconcile that local snapshot against **live** GitHub PR state, run these in
**parallel** with the Bash tool:

```bash
# Upstream PRs in flight (filtered to outside-org repos only —
# the system tracks contributions INTO repos the user does not own;
# own-repo PRs are out of scope and must be excluded).
#
# OWN_ORGS is the prefix list of repos to exclude. Update if the user
# adds a new org. (Discoverable via `gh api user/orgs --jq '.[].login'`
# plus the user's own login from `gh api user --jq '.login'`.)
OWN_ORGS='jeremylongshore/ intent-solutions-io/'
gh search prs --author=@me --state=open --limit=50 \
  --json number,title,url,repository,isDraft,createdAt | \
  jq --arg own "$OWN_ORGS" '
    ($own | split(" ")) as $excl |
    map(select(.repository.nameWithOwner as $r |
               ($excl | map(. as $p | $r | startswith($p)) | any) | not))
  '

# Recently-merged + closed upstream PRs (last 30, same scope filter)
gh search prs --author=@me --state=closed --limit=30 \
  --json number,title,url,repository,closedAt,createdAt | \
  jq --arg own "$OWN_ORGS" '
    ($own | split(" ")) as $excl |
    map(select(.repository.nameWithOwner as $r |
               ($excl | map(. as $p | $r | startswith($p)) | any) | not))
  '

# Local candidate tracker — markdown frontmatter is the queryable layer.
# Candidates are upstream-only by construction (scout never enqueues
# own-repo issues), so no scope filter needed here.
for f in ~/.contribute-system/candidates/*.md; do
  awk -v f="$(basename "$f" .md)" '
    /^---$/ { fm = !fm ? 1 : 2; next }
    fm == 1 && /^(repo|issue_number|status|scout_score|research_path|pr_number):/ { print f, $0 }
  ' "$f"
done 2>/dev/null

# Recent activity from the event log
tail -50 ~/.contribute-system/log.jsonl 2>/dev/null \
  | jq -c "select(.event | test(\"transition_|gate_|researcher_|scout_\"))" 2>/dev/null
```

**Scope rule (non-negotiable)**: this skill applies *only* to contributions made INTO repos the user does not own. Own-org PRs (`jeremylongshore/*`, `intent-solutions-io/*`) are out of scope — they are personal-project work, not anti-slop OSS contributions. The whole architecture (gates, dossiers, lifecycle) exists because upstream maintainers need protection from low-quality AI work; that concern doesn't apply to the user's own repos. If a candidate file ever references an own-org repo, it's a scout bug — flag it.

Then summarize for the user:

- N open / draft PRs (and any blocked on review)
- N candidates in `claimed` or `working` status but not yet `submitted`
- N candidates in `open` / `shortlist` status (sorted by `scout_score` desc)
- Any contradictions between `gh` (PR state) and the candidate's `status:` field (e.g., PR merged but candidate still says `submitted`) — flag for cleanup
- N candidates whose `research_path:` is empty or stale (>14d) — flag for `@researcher` build/refresh
- Recent events worth surfacing (gate BLOCKs, overrides, dossier refreshes)

Skip Step 0 only when the user asks about something unrelated to their own contributions.

### Step 0.5 — Ensure dossier exists for any repo we'll touch

Every repo we contribute to needs a dossier at
`~/.contribute-system/research/<owner>__<repo>.md` — that's where every gate
in `~/.contribute-system/gates/` reads its rules from (branch convention,
CLA/DCO, AI policy, draft-first preference, review bots, etc.).

Before any lifecycle transition (claim, work, submit) for a candidate at
repo `<owner>/<repo>`:

```bash
DOSSIER=~/.contribute-system/research/$(echo <owner>/<repo> | tr '/' '_').md
DOSSIER=${DOSSIER/__/__}    # ensure double underscore
if [[ ! -f "$DOSSIER" ]]; then
  echo "no dossier — invoking @researcher"
  # delegate to the researcher subagent
fi
# Also check staleness — refresh if >14 days old
LAST=$(awk '/^last_refreshed:/{print $2; exit}' "$DOSSIER")
if [[ -n "$LAST" ]]; then
  AGE_DAYS=$(( ( $(date +%s) - $(date -d "$LAST" +%s) ) / 86400 ))
  [[ "$AGE_DAYS" -gt 14 ]] && echo "stale ($AGE_DAYS d) — invoking @researcher refresh"
fi
```

Delegate dossier build/refresh to the **`@researcher`** subagent (defined
at `${CLAUDE_SKILL_DIR}/agents/researcher.md`). It runs in its own context window so
the verbose CONTRIBUTING.md fetch + depth-1 link follows stay out of your
main conversation. It writes the dossier to disk and reports back a
one-paragraph summary.

If the user already invoked `@researcher` earlier in the session for this
repo, skip — don't re-build.

### Step 0.6 — First-touch fit (read BEFORE choosing any artifact)

The mechanical gates (CLA, DCO, branch convention, trust-ladder size) tell you whether a
contribution is *well-formed*. They do **not** tell you whether it will be *received*. The
2026-06-02 ISEDC Centaur council exposed four signals the dossier historically MISSED — and
the miss would have produced a credibility-torching first move (a governance Design Issue into a
closed-collaboration repo whose author ships a competing stack). Every dossier must now carry these, and you
must read them before Step 5:

1. **`collaboration_surface: open | guarded | closed`** — is the repo actually a place outsiders
   land work? Derive from external-merge-rate (90d), issue-reply-rate to external authors, median
   internal merge latency, and presence of CONTRIBUTING. A repo merging 60+ internal PRs/week at
   minute-scale cycles with a dead tracker is `closed`-collaboration — invert the Design-Issue default
   (Step 5). NOTE: `closed` describes collaboration *posture*, NOT provenance — it is still the
   canonical, maintainer-owned repo (verify `isFork:false`), not a fork or third-party copy. A PR
   there lands on the real thing; the maintainers just don't co-develop via the public tracker.
2. **`counterparty_design_intent`** — fetch SECURITY.md + any threat-model / design docs and
   extract what the maintainers declared **deliberate**, **out-of-scope**, or **WIP / feedback-wanted**.
   NEVER pitch a "gap" that their own docs call an intentional choice or an excluded threat — to a
   domain-expert maintainer that reads as "you didn't read my threat model." The `feedback-wanted`
   surfaces are the ONLY safe place to raise design questions.
3. **`positioning_risk: none | adjacent-builder | direct-competitor`** — does the *contributor* ship a
   product that overlaps this repo (one web search away)? **This is an OPTICS/perception risk, NOT a
   conflict of interest** — a contributor owes the upstream no duty, so there is no conflict to manage;
   the only risk is that a maintainer *misreads* a contribution as a covert pitch. Distinguish honestly:
   tooling that *governs or composes with* this repo is `adjacent-builder`, not `direct-competitor`. If
   `adjacent-builder`/`direct-competitor`, any governance/strategic contribution gets **disclosure-first**
   (one honest line in-body) and the first touch reveals nothing about the overlapping stack — that is
   good-faith transparency, not COI management.
4. **`competing_license_fence`** — scan the contributor's OWN referenced repos for BUSL-1.1 / SSPL /
   Commons-Clause "Competing Service" clauses that conflict with naming them upstream. Resolve in
   writing before any cross-promotion.
5. **`local_test_fit: isolated | partial | full-stack-only`** — how heavy is the repo's
   local-verification bar? A repo whose only documented test path is "boot the whole stack"
   (k8s/Helm/secrets/1Password, a `just up` / compose / helm bring-up) is `full-stack-only`: an
   outsider who can't stand that up can only safely contribute fixes that are **isolatable**
   (shell-logic, pure functions) and provable on their own machine. Derive from the AGENTS.md /
   CONTRIBUTING "Testing" section. This shapes which issues are viable — see Step 2.5 "Local-testability
   fit." (Added 2026-06-03: the Centaur run's `full-stack-only` bar is exactly why a one-line
   `entrypoint.sh` fix was the right first touch and a slackbot-streaming fix was not.)

If any of these five fields is absent or stale in the dossier, invoke `@researcher` to populate them
before proceeding. The first-touch shape (Step 5 table) is a FUNCTION of `collaboration_surface`; the
reveal level is a function of `positioning_risk`; the safe design-question surface is a function of
`counterparty_design_intent`; the viable-issue set is a function of `local_test_fit`.

### Step 1 — Discover

Find issues worth contributing to. Sources, in priority order:

- **Existing candidates** with `status: open` or `status: shortlist` already in `~/.contribute-system/candidates/` — already discovered + vetted, ranked by `scout_score:` frontmatter field
- **Fresh GitHub label searches** scoped to repos / languages in `~/.contribute-system/profile.md`: `gh search issues "label:'good first issue' state:open language:<lang>" --limit 50`

Delegate discovery to the **`@scout`** subagent (defined at `${CLAUDE_SKILL_DIR}/agents/scout.md`). It runs in its own context window so the verbose `gh search` output stays out of your main conversation. Pass it a mode: `baseline` (full per-tier sweep), `refresh` (re-evaluate existing candidates for momentum), or an ad-hoc query like "TypeScript repos at mainstream tier with no competing PRs." Scout writes ranked candidate markdown files to `~/.contribute-system/candidates/` and appends events to `~/.contribute-system/log.jsonl`. Summarize the top picks for the user from those files; do not re-run the search yourself.

### Step 2 — Qualify

Before claiming any issue, run these in parallel against the target repo:

```bash
gh pr list --repo <owner>/<repo> --search "<issue#>" --state=all
gh api repos/<owner>/<repo>/commits --jq '.[0:3] | map({date: .commit.author.date, msg: .commit.message[0:60]})'
gh api repos/<owner>/<repo>/contents/CONTRIBUTING.md --jq '.content' | base64 -d 2>/dev/null
```

Quick-reject signals:

- 2+ active PRs already on the issue
- Issue >90 days old with maintainer silence
- CLA required for trivial work
- Stack mismatch with the user's strengths

Use the bundled `agents/repo-analyzer.md` for the structured eligibility / CLA / rules check.

#### Step 2.5 — Rejection-log + feasibility (read from the dossier)

Before a first contribution, three repo-specific reads decide whether a candidate is *receivable* and *verifiable*, not just well-formed. `@researcher` produces all three in the dossier (added 2026-06-03 after the Centaur run) — read them, don't re-derive by hand:

- **`## Rejection patterns`** — what gets outsiders *denied* here, mined from closed-unmerged `NONE`/`CONTRIBUTOR` PRs (feature/tool-adds silently closed; fixes superseded or fixed-internally; repro disagreement; "live-testing showed wrong layer"). Avoid these in your own PR.
- **`local_test_fit`** frontmatter — if `full-stack-only`, prefer a fix verifiable *without* their stack (shell-logic / pure-function); never fake an e2e run — say "verified via isolated repro" honestly.
- **Supersession** — confirm the target file isn't mid-rewrite, the issue has no internal fix in flight, no competing open PR.

If the dossier predates this (no `## Rejection patterns` / `local_test_fit`), run `@researcher refresh <owner>/<repo>` first. (Mechanics live in `agents/researcher.md`.)

### Step 3 — Claim

Draft a claim comment from `assets/claim-template.md`. Adapt to the upstream's tone (lowercase if they use lowercase). Show the draft to the user for approval. Never `gh issue comment` autonomously.

**Wasteland federation exception** — for `gastownhall/*` and `julianknutsen/wasteland`
board work, the claim is **`wl claim w-<id>`** against the Dolt commons, not a GitHub
issue comment; completion is recorded with `wl done w-<id> --evidence "<PR-url>"` after
the PR opens. Still human-approved — show the intended `wl claim` to the user and never
run it autonomously. For `[wendy:github-mirror]` items, **verify the mirrored GitHub
issue isn't already closed** before claiming (see `references/wasteland-federation.md`).

**Gate-checked transitions** — before showing the claim draft to the user,
run the gate-runner via `transition.sh` to catch traps (already-assigned,
already-shipped, stale labels, AI-policy strikes, etc.):

```bash
~/.contribute-system/bin/transition.sh shortlist→claimed \
  ~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md
```

If gates BLOCK, surface the blockers + fix hints to the user. They can fix
the underlying issue, pick a different candidate, or use
`--override-gate <ID> "reason"` if they have a specific justification (the
reason is logged to `~/.contribute-system/log.jsonl`).

After the user posts the claim and gates pass, the candidate's `status:`
field is bumped automatically by `transition.sh` (atomic write). No manual
SQLite update needed — the markdown candidate file IS the tracker.

### Step 4 — Work

Each clone in `~/000-projects/contributing-clanker/` has its own `CLAUDE.md`. Read it first. Run the project's native test suite — common patterns:

| Stack | Run |
|-------|-----|
| Node + pnpm | `pnpm install && pnpm test && pnpm typecheck && pnpm lint` |
| Node + yarn | `yarn install && yarn test` |
| Python | `pytest -v` (or `flox activate -- bash -c "pytest -v"` for posthog) |
| Rust | `cargo build && cargo test && cargo clippy --all-targets` |
| Scala | `sbt compile && sbt test && sbt scalafmtCheckAll` |

Use `agents/test-runner.md` for the structured runner that tees output to `~/.contribute-system/test-logs/`.

### Step 5 — Submit

**Default to a Design Issue, not a PR — BUT only for repos that are an actual collaboration surface.** Auto-opening PRs creates "whack-a-mole slopfests" for maintainers (per the repo's `CLAUDE.md` philosophy). This default is correct when the upstream uses its issue tracker to think. It is *exactly wrong* for a **closed-collaboration repo** — a canonical, maintainer-owned repo (NOT a fork or third-party copy) that is nonetheless developed at internal velocity and treats its public issue tracker as write-only, where the tracker is a graveyard and the merge filter is "do I already know who you are," not patch quality. There, a Design Issue is the *deadest* channel; leading with one marks you as a stranger-with-an-agenda and gets ignored.

Read the dossier's `collaboration_surface:` field (Step 0.6) before choosing:

| `collaboration_surface` | Signals | First-touch shape |
|---|---|---|
| `open` | issues get maintainer replies, external PRs merge on quality, CONTRIBUTING invites contribution | **Design Issue first** (the default below) |
| `guarded` | some external merges but identity-correlated, slow issue replies | **Tiny merge-able PR first** to bank identity, THEN Design Issue |
| `closed` | near-zero external merges, dead/ignored tracker, high internal velocity, no CONTRIBUTING (canonical repo, but closed *collaboration posture* — not a fork) | **Non-proposal micro-fix PR ONLY** (≤30 LOC, 1 file, zero strategy/governance/self-promotion). No Design Issue until a merge banks identity. If no clean micro-fix exists, ship nothing and build identity through public adjacency first. |

Order (collaboration-surface = `open` only):

1. Open a Design Issue using `assets/pr-template.md` reshaped for an issue body — include problem, proposed solution, diff preview, test results
2. Wait for maintainer approval of the approach
3. Open the PR using `assets/pr-template.md`

For `guarded` / `closed`: lead with the identity-banking micro-PR per the table; defer any Design Issue / proposal until after it merges.

Use `agents/draft-writer.md` for the body drafter. Always show the draft to the user for approval before posting.

**Gate-checked submission** — before opening the PR / Design Issue, run:

```bash
~/.contribute-system/bin/transition.sh working→submitted \
  ~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md
```

This runs phase B (pre-PR), C (PR submission), E (identity), F (legal),
and G (infrastructure) gates against the local diff + dossier rules. BLOCK
gates refuse the transition; WARN gates surface in the briefing for the
user to acknowledge before proceeding.

After successful submission, `transition.sh` bumps the candidate's
`status:` to `submitted` atomically. Manually add the PR number to the
candidate's frontmatter:

```bash
# After PR is opened
sed -i "s/^pr_number:.*/pr_number: <num>/; s|^pr_url:.*|pr_url: <url>|" \
  ~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md
```

**Omarchy submission lane (`omarchy-submit`)** — for a marketplace entry the
user owns (a whole repo, not an upstream diff), the candidate argument is the
entry's repo directory:

```bash
~/.contribute-system/bin/gate-runner.sh omarchy-submit ~/000-projects/<entry-repo>
```

This runs the C/E/F/G phases against the full tree. The submission-content
gates (c28+) exist because these defects actually shipped in past entries and
were only caught by hand or by a post-submit review panel:

| Gate | Catches | Verdict |
|---|---|---|
| c28 voice-no-dashes | em/en dashes in shipped prose or outbound drafts | BLOCK |
| c29 private-names | denylisted private names (`~/.contribute-system/private-names.txt`) in content or filenames | BLOCK |
| c30 md-strikethrough | tilde pairs GitHub renders as strikethrough | WARN |
| c31 omarchy-qml-security | `Text` binding data with no `textFormat` (AutoText sniffing); curl argv with no `--max-filesize` | BLOCK |
| c32 omarchy-validate | `omarchy-plugin-validate` failure (self-skips if the binary is absent; run on the rig) | BLOCK |
| c33 qmllint | qmllint errors (warnings advisory; self-skips if absent) | BLOCK on error |

c28-c30 also run in the normal `working→submitted` flow, scanning only lines
the contributor ADDED plus the drafted PR/issue body, so upstream's own prose
never blocks. The run must be green before the submission issue is drafted;
the honest boundary is that these gates catch the deterministic slice only —
taste findings (over-configuration, dead-code altitude, AI-sounding copy)
remain a review-agent judgment call. Regression suite:
`scripts/test-submission-gates.sh`.

### Reconciliation

Periodically (or on user request "reconcile candidates"), check candidates with a `pr_number:` field against live GitHub state:

```bash
for f in ~/.contribute-system/candidates/*.md; do
  PR=$(awk '/^pr_number:/{print $2; exit}' "$f")
  REPO=$(awk '/^repo:/{print $2; exit}' "$f")
  [[ -z "$PR" || "$PR" == "null" ]] && continue
  gh pr view "$PR" --repo "$REPO" --json state,merged,closedAt
done
```

For each candidate whose actual PR state has moved on:

- PR merged → set `status: merged` in the candidate (atomic write)
- PR closed unmerged → set `status: dropped` and append a row to the dossier's `## Failure log` section so we learn from it
- PR still open → no change (`status: submitted`)

### Mandatory: human approval before external submission

Copied verbatim from the repo's `CLAUDE.md`:

> Before submitting ANYTHING to external repos:
>
> 1. Run all tests — ALL must pass
> 2. Run project-specific linters — no errors
> 3. ASK JEREMY FOR APPROVAL with test summary, file list, proposed body
> 4. Default to Design Issue, NOT a PR
>
> NEVER auto-submit PRs. NEVER bypass human approval. Design issues > PRs.

#### Strip the attribution footer on external repos (always)

The user's global config auto-appends an `intentsolutions.io` / personal signature to commit messages and PR bodies (`attribution.commit` / `attribution.pr`). That footer is correct on the user's **own** repos and **wrong on every upstream** — it's org/positioning signal on someone else's project, and for an `adjacent-builder` / `direct-competitor` repo it leaks exactly what the first touch is supposed to conceal (Step 0.6 `positioning_risk`). Added 2026-06-03 after the Centaur PR, where this had to be caught by hand.

When committing/pushing/opening a PR to a repo the user does not own:

- **Commit:** write the message with **no footer**, then verify — `git log -1 --format=%B` — and `git commit --amend` if the signature appended. Prefer the user's GitHub no-reply identity as author; never add `Co-Authored-By` or any "generated with" line.
- **PR body:** after `gh pr create`, **read the body back from GitHub** and grep it — `gh pr view <N> --repo <o>/<r> --json body --jq .body | grep -iE 'intentsolutions|<user full name>|claude|co-authored|generated with'`. If anything matches, overwrite with the clean body via `gh pr edit <N> --repo <o>/<r> --body "<clean>"`.
- The DCO sign-off (when `dco_required: true`) is the **only** trailer allowed, and only if the dossier says so.

## Trust-ladder discipline

A contributor's (N+1)th PR to a given repo is constrained by their N prior
merges *in that same repo*. The rule exists because maintainer review attention
is the single scarcest resource on a high-velocity project, and a contributor
who has shipped zero working fixes has not yet earned the right to a
multi-finding umbrella conversation. The canonical failure case is
[`oven-sh/bun#30903`](https://github.com/oven-sh/bun/pull/30903): 0 prior merges,
983 files / +122K lines, asks the maintainer to "decide whether to accept this
as-is." After 11 days: 1 drive-by comment, 3 thumbs-down, no review. The audit
of that PR drove the addition of this rule. Full details at
`references/anti-patterns.md` (the Audit Dump, the Trust-Ladder Skip).

**Rungs** (read from dossier field `merged_prs_by_user`, populated by
`@researcher` on build/refresh):

| Rung | Prior merges | Permitted scope | PR size cap | Notes |
|------|---|---|---|---|
| 0 | 0 | Single-issue (must have `issue_number`) OR Design Issue | ≤ 200 LOC, ≤ 10 files, no new top-level dirs | Umbrella scope blocked at gate `A07` |
| 1-3 | 1-3 | Single-issue, single-fix; umbrella WARNS | ≤ 500 LOC, ≤ 20 files, no new top-level dirs | Earned moderate trust |
| 4+ | 4+ | Anything goes | (no cap) | Earned umbrella trust |

**Where this is enforced**:

- **`gates/a07-trust-ladder-fit.sh`** — fires at `shortlist→claimed` /
  `claimed→working`. Reads the candidate's `scope_intent` field and the
  dossier's `merged_prs_by_user`. Blocks rung-0 umbrellas and rung-0
  PRs without an attached `issue_number`. Design Issues
  (`scope_intent: design-discussion`) bypass the ladder unconditionally.
- **`gates/b13-trust-ladder-size.sh`** — fires at `working→submitted`.
  Computes local diff size against `upstream/<default_branch>` (or
  `origin/<default_branch>` as fallback). Blocks if LOC, file count, or
  new top-level directory count exceeds the rung's cap.

**Per-repo dossier overrides** (rare; use only when the maintainer has
explicitly invited a bigger first contribution):

```yaml
trust_ladder_disabled: true             # bypass both gates entirely
trust_ladder_threshold: 0               # let rung 0 ship umbrella scope
trust_ladder_rung0_max_loc: 400         # lift the rung 0 LOC cap
trust_ladder_rung0_max_files: 20
trust_ladder_rung13_max_loc: 1000
trust_ladder_rung13_max_files: 40
```

**Candidate-side `scope_intent` field** (required for accurate gating; set
during scout / candidate authoring):

| Value | Meaning |
|---|---|
| `single-issue` | Addresses one tracked GitHub issue (set `issue_number`) |
| `single-fix` | Addresses one untracked finding (no issue, but bounded) |
| `umbrella` | Multi-finding audit / multi-area refactor / large proposal |
| `design-discussion` | Design Issue, not a code PR — bypasses ladder |

**Override discipline**: if the user explicitly invokes
`transition.sh ... --override-gate A07 "<reason>"` or `--override-gate B13`,
the override is logged to `~/.contribute-system/log.jsonl` and surfaced in
`scripts/audit-overrides.sh`. A user who overrides A07 or B13 more than once
per week should expect this skill to surface the pattern: either the rule
is calibrated wrong for their workflow, or they are systematically skipping
the ladder. Either way the audit subcommand makes it visible.

**Why this rule sits ABOVE the size gates and not inside them**: the
trust-ladder rule is a *discipline*, not a measurement. The size caps are
proxies for "how much trust have you earned at this repo," and a contributor
who consistently overrides the size cap with a one-line rationale is gaming
the proxy. The rule is the thing; the gates are the implementation.

## Output

After Step 0, output a status block. After each subsequent step, output structured progress.

### State summary (after Step 0)

The `dashboard.sh` ASCII block (printed first, per Step 0) is the primary state view —
pipeline funnel, in-flight, shipped, suggested-next, timeline. The text summary below is
the **live-GitHub reconciliation layer** that goes *beneath* the dashboard: it surfaces
anything the local snapshot can't know (PR draft/review state, merges not yet reconciled
into candidate files, drift between `gh` and the candidate `status:`).

```
PRs in flight: <N> open, <M> draft
  - <repo>#<num>: <title> (state, age)
  ...

Claimed but not submitted: <N>
  - <id>: <repo>#<issue> ($value)
  ...

Tracked opportunities: <N> (top 5 by value)
  - <id>: <repo>#<issue> ($value, <competition flag>)
  ...

Drift: <N> rows where tracker disagrees with GitHub
  - <id>: tracker says <X>, gh says <Y> — suggest <Z>
```

### Per-step output

| Step | Output |
|------|--------|
| Discover | Three sections: Tracker queue / Fresh GitHub / Algora URLs. Top 3 picks highlighted. |
| Qualify | Verdict block: `claim` / `wait` / `skip` with one-sentence reason |
| Claim | Markdown draft of the comment, with placeholders filled. Awaits user approval. |
| Work | Test summary: pass/fail counts, duration, coverage %, log path |
| Submit | Markdown draft of the PR or Design Issue body. Awaits user approval. |

### Repo Init context block (after URL/repo arg)

```
Repo: <owner>/<repo> — <description>
  Stars: N · Language: X · License: Y · Default branch: main
  Last push: YYYY-MM-DD · Archived: false

Quality gates (from CONTRIBUTING.md):
  - Build: <local_check_command>
  - Lint: <linter command if found>
  - CLA: false | true · DCO: false | true
  - AI disclosure required: false | true
  - Conventional commits: true | false

Open issues: N
  <If 0>: No open issues — nothing to claim right now. Watch for new issues or check ROADMAP.
  <If >0>:
  - #N: <title> [labels] (assigned: yes/no)
  ...

Dossier: built | refreshed | built fresh this session
  Path: ~/.contribute-system/research/<owner>__<repo>.md

Suggested next steps:
  - <If issues exist>: Review issues above → /contribute claim <owner>/<repo>#<N>
  - <If ROADMAP exists>: Check ROADMAP.md for planned work that might open as issues
  - <If 0 issues>: /contribute scout "<owner>/<repo> custom query" when issues open
```

### Audit subcommands

When the user asks "what gates am I overriding most?" or "audit my contribution
history" or "show me override frequency":

```bash
${CLAUDE_SKILL_DIR}/scripts/audit-overrides.sh                       # all-time
${CLAUDE_SKILL_DIR}/scripts/audit-overrides.sh --since=30             # last 30 days
${CLAUDE_SKILL_DIR}/scripts/audit-overrides.sh --scope=org:posthog    # one org
${CLAUDE_SKILL_DIR}/scripts/audit-overrides.sh --gate=A05             # one gate
${CLAUDE_SKILL_DIR}/scripts/audit-overrides.sh --json                 # JSON
```

Output is a per-gate table with `[overrides, blocks, override_rate, top_reason]`,
sorted by override_rate desc. Gates overridden ≥50% of the time get flagged for
investigation — either the gate is too strict (false-positive heavy) or it's
catching real risk that's being consistently dismissed. Either way, surface it.

### Daily recap email (cron-driven, deterministic)

`scripts/contribute-daily-recap.sh` composes a personal daily recap from the
existing reporters — no LLM anywhere in the correctness path. It renders the
Intent Solutions house email template (styled `<div>`, inline CSS, real HTML
tables — same design language as the weekly growth rollup / posting packets;
never raw text dumps). Body: stat tiles, a lead "Action needed (N)" card
(stale claims, quiet PRs, overrides awaiting audit — each with a default next
step), a pipeline funnel + in-flight table (the same data `dashboard.sh`
renders in the terminal), a fixed 2-day `log.jsonl` event window (1-day
overlap cushion, no watermark file by design), and the
`audit-overrides.sh --since=7 --json` trend as a table. A quiet day collapses
to a one-card heartbeat + pipeline count, valid ONLY on positive proof of a
successful log read — a read failure is an alert, never a heartbeat.

```bash
${CLAUDE_SKILL_DIR}/scripts/contribute-daily-recap.sh --dry-run   # print HTML, send nothing
${CLAUDE_SKILL_DIR}/scripts/contribute-daily-recap.sh             # compose + email (cron mode)
${CLAUDE_SKILL_DIR}/scripts/contribute-daily-recap.sh --window=8 --to="$TEAM_EMAILS"  # weekly team mode
```

Runs from cron at 6:45am daily (after the 6:30 analytics email). Recipient
defaults to jeremy@intentsolutions.io (`CONTRIBUTE_RECAP_TO` overrides).

## Error Handling

| Symptom | Likely cause | Recovery |
|---------|--------------|----------|
| `gh: not logged in` | OAuth expired | Tell user to run `gh auth login` |
| `jq: command not found` | Missing on PATH | `apt-get install jq` (or equivalent) |
| `~/.contribute-system/` missing | First-time setup | `mkdir -p ~/.contribute-system/{candidates,research,gates,bin,check-runs}; touch ~/.contribute-system/log.jsonl` |
| `gh search` returns 0 results unexpectedly | Rate limit or wrong scope | Wait 60s and retry; check `gh auth status` token scopes |
| Candidate's `status: submitted` but PR is merged | Reconciliation drift | Run reconciliation step (above) |
| User asks to claim, but competing PR exists | Risk | Surface the competing PR explicitly; gate `A2 already-shipped` will BLOCK if it's a merged dupe |
| Test suite hangs (e.g., posthog without flox) | Wrong env | Wrap in `flox activate -- bash -c "..."` for flox-managed repos |
| `gh issue comment` permission denied | Repo private or token missing scope | Show the comment text to the user; they post manually |
| Gate run BLOCKs unexpectedly | Stale dossier or wrong rule | `@researcher refresh <owner>/<repo>`; if the rule itself is wrong, edit the dossier (manual sections survive refresh) or override with `transition.sh ... --override-gate <ID> "reason"` |
| Dossier missing for a candidate's repo | First time touching this repo | `@researcher build <owner>/<repo>` (auto-invoked by Step 0.5 anyway) |
| Hook/transition/scout/gate behaves like an old version, or a script 404s | The deployed runtime mirror at `~/.contribute-system/bin/` has drifted from or is missing repo scripts | `scripts/doctor.sh` to see what drifted/missing, then `bin/install.sh --force` to re-sync the mirror from the repo |

If any external submission would happen without human approval, **stop and ask**. This is non-negotiable.

## Examples

### Example 1: "What's my PR status?"

User invokes `/contribute` or asks "what's in flight?"

1. Run Step 0 (parallel `gh pr list` + `gh issue list` + candidate-frontmatter scan + recent log events)
2. Output the State Summary block
3. Stop. The user can drill into any PR with a follow-up question.

### Example 2: "Find me a new contribution to work on"

User asks "what should I work on next?" or "scout opportunities."

1. Run Step 0 first (state summary)
2. Delegate to `@scout` (the user-scope subagent at `${CLAUDE_SKILL_DIR}/agents/scout.md`)
3. Output Tracker / Fresh GitHub / Algora sections, top 3 highlighted
4. Optional: per top pick, run Step 2 (Qualify) to surface CLA / competing-PR signals

### Example 3: "Draft a claim for screenpipe#1234"

User asks to claim a specific issue.

1. Run Step 2 (Qualify) on `mediar-ai/screenpipe#1234`
2. If verdict is `claim`, read `assets/claim-template.md`
3. Fill placeholders (approach in 1-2 bullets, ETA, CLA status)
4. Show draft to user
5. On user approval, post via `gh issue comment` AND update tracker (Step 3 SQL)

### Example 4: "Reconcile the tracker"

User asks to sync local state with GitHub.

1. Read all tracker rows where `pr_number IS NOT NULL`
2. For each, run `gh pr view <repo> <pr_number> --json state,merged`
3. Update tracker rows whose status disagrees with GitHub state
4. Output a diff summary: N rows updated, M unchanged

### Example 5: "Run tests on cortex"

User asks to verify a working branch.

1. Read `agents/test-runner.md`
2. Detect cortex stack (Python + pyproject.toml)
3. `cd ~/000-projects/contributing-clanker/cortex && pytest -v 2>&1 | tee ~/.contribute-system/test-logs/$(date +%Y%m%d-%H%M%S)-cortex.log`
4. Output test summary block (pass/fail counts, log path)

## Resources

### Bundled subagents (load with `Read agents/<name>.md`)

- `@scout` (user-scope subagent at `${CLAUDE_SKILL_DIR}/agents/scout.md`) — discovery sweep, GitHub-only, ranked by star-tier brackets. Each candidate it writes carries a `research_path:` frontmatter field pointing at the matching dossier (or empty if not yet built).
- `@researcher` (user-scope subagent at `${CLAUDE_SKILL_DIR}/agents/researcher.md`) — build / refresh the per-repo dossier at `~/.contribute-system/research/<owner>__<repo>.md`. Auto-invoked when a candidate's dossier is missing or older than 14 days.
- `agents/repo-analyzer.md` — DEPRECATED. Most of its function is now in the dossier system. Keep until Slice 3 retires it.
- `agents/draft-writer.md` — draft a Design Issue or PR body from a working branch's diff
- `agents/test-runner.md` — detect upstream stack and run the native test suite, log to disk

### Bundled templates (read for fill-in)

- `assets/claim-template.md` — issue claim comment
- `assets/pr-template.md` — PR description structure
- `assets/evidence-template.md` — test/lint evidence summary block

### References

- `references/workflow-guide.md` — long-form narrative of the 5-step workflow with project-specific gotchas
- `references/wasteland-federation.md` — contributing to Wasteland (`gastownhall/*`, `julianknutsen/wasteland`): the `wl claim → PR → wl done` Dolt-commons flow, gate adaptations, the github-mirror staleness trap, and candidate `wl_id` / `scope_verdict` fields

### External

- [Anthropic Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- The repo's own `CLAUDE.md` at `~/000-projects/contributing-clanker/CLAUDE.md` for project conventions and per-clone build commands

## Old patterns (deprecated, do not reintroduce)

- The pre-2026-04-30 skill referenced a `contribute` CLI binary, EV scoring, judge gates, slack notifications, asciinema work-session recording, evidence bundles, and competition risk scoring. The underlying `contribute-system/` monorepo was deleted because it was never used.
- The pre-2026-05-03 skill used a SQLite tracker at `~/.contribute-system/contribute.db` (32 tables, `bounties`-keyed schema) plus an Algora/Gumroad/Cortex bounty-board framing. That DB was wiped; the framing is gone. The system is now markdown-only: candidate files + dossiers + JSONL event log. **The skill is a contribution tool — not a tracker, not a payouts system, not a portfolio**.

If a feature from those eras is wanted back, recover code from `git log` in `~/000-projects/contributing-clanker/`. The bar to re-add is "Jeremy actually uses it daily."
