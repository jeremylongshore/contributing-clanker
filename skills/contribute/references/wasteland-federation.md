# Wasteland federation — how `/contribute` handles Dolt-claimed work

Canonical reference for contributing to **Wasteland** repos — Steve Yegge /
Julian Knutsen's on-chain work-coordination system. The stock `/contribute`
lifecycle assumes you claim work by commenting on a GitHub issue
(`gh issue comment`). Wasteland claims work in a **Dolt (versioned SQL) commons**
via the `wl` CLI, then delivers the result as an ordinary GitHub PR. This file
records that delta so the cockpit reflects Wasteland's real flow instead of
silently applying the GitHub-issue assumptions.

> **This file is knowledge, not automation.** `/contribute` reads it; nothing
> here runs `wl claim` for you. Claiming and submitting Wasteland work is still
> human-approved, exactly like every other external action in this skill.

---

## What Wasteland is

- A **wanted board** of open work lives in a Dolt commons (`hop/wl-commons`),
  read/written through the `wl` CLI (`wl browse`, `wl claim`, `wl done`,
  `wl me`, `wl show`, `wl sync`).
- Each board item is a `w-<id>` (e.g. `w-d4dba7b056`, or a project-namespaced
  id like `w-gc-004` / `w-bd-001`). Items carry a project, type
  (`bug`/`feature`/`docs`/`design`/`research`/`community`), priority, and the
  GitHub repo the deliverable lands in.
- **Completed work is delivered as a PR to the underlying public GitHub repo.**
  The board coordinates *who is doing what*; GitHub is still where code review
  and merge happen.

The board is therefore an **explicit, maintainer-issued invitation to
contribute** — which materially changes the first-touch calculus (see
"Collaboration-surface inversion" below).

## The claim → deliver → done flow (vs. the stock skill)

| Step | Stock `/contribute` | Wasteland federation |
|---|---|---|
| Find work | `gh search issues` / scout / candidate queue | `wl browse` (the wanted board) |
| Claim | `gh issue comment` "I'd like to take this" | `wl claim w-<id>` (writes to the Dolt commons) |
| Work | feature branch in the upstream clone | same — feature branch in the GitHub repo clone |
| Submit | open a PR (or Design Issue first) | open a PR to the GitHub repo |
| Record | candidate `status: submitted` + `pr_url` | `wl done w-<id> --evidence "<PR-url>"` **and** candidate `status: submitted` |
| Accept | maintainer merges the PR | maintainer reviews the PR **and** accepts/stamps the completion on the board |

The Dolt-side claim and the GitHub-side PR are **two records of the same work**.
A candidate file is still the local tracker; it just also carries the `wl_id`.

## Federation repos → GitHub deliverable repo

| Board project | GitHub deliverable repo | Notes |
|---|---|---|
| `gascity` | `gastownhall/gascity` | Go · MIT · orchestration-builder SDK |
| `gastown` | `gastownhall/gastown` | Go · MIT · the agent city/runtime |
| `beads` | `gastownhall/beads` | Go · MIT · bd task tracker |
| `wasteland` | `julianknutsen/wasteland` | Go · MIT · the federation protocol + `wl` CLI |
| `hop` | commons / protocol (`hop/wl-commons`) | docs/design; deliverable repo per-item — confirm with `wl show` |
| `community` | varies (campfire, char-sheet, discord bot) | community deliverables; no single code repo |

All four code repos are **public, non-fork, MIT, `make check` as the local
pre-PR gate, no CLA / DCO / AI-disclosure, no Conventional-Commits enforcement,
branch convention `fix/* feat/* refactor/* docs/*` off `main`** (per their
CONTRIBUTING). Re-derive from the per-repo dossier; don't hardcode.

## The rig identity (the contributor side)

- Rig handle: **`jeremylongshore`**; joined the **`hop/wl-commons`** commons.
- DoltHub fork: **`jeremylongshore/wl-commons`**; local commons at
  `~/.local/share/wasteland/hop/wl-commons`.
- **Wild-west mode**: direct writes to the commons (not PR-gated on the Dolt
  side). The GitHub PR is still the reviewed artifact.
- **Standing**: not a newcomer — 3 accepted completions already
  (`wl me`): beads skill v0.60.0 (`github:beads#2545`), wasteland daily-ops
  commands (`github:wasteland#12`), beads NL activation (`github:beads#718`).
  This is rung-1+ social credit on the board, though the GitHub-side
  trust-ladder is still per-repo (see below).

## Gate adaptations for Dolt-based claiming

The deterministic gates in `~/.contribute-system/gates/` were written for the
GitHub-issue claim model. For a federation candidate:

- **A-phase claim-etiquette / already-assigned gates** (e.g. `a02`, `a05`,
  `a06`) must read **the `wl` board state** (`wl show w-<id>` / `wl browse`),
  **not** GitHub `assignees`. On the board, "claimed" lives in Dolt; a GitHub
  issue may have zero assignees while the board item is already taken. Where a
  gate can only see GitHub assignees, treat it as **informational, not
  blocking**, and confirm claim-state with `wl show`.
- **C-phase PR-fidelity gates still fully apply** to the GitHub PR —
  `c12-ci-green`, `c13-bots`, PR-template/issue-link/test-evidence gates all
  run against the real PR, because the deliverable is a real PR. Do **not**
  disable these.
- **E/F gates** (identity, licensing): all repos are MIT, no CLA/DCO — these
  pass trivially, but the **attribution-footer strip still applies** (these are
  upstream repos the user does not own; no `intentsolutions.io` footer on
  commits or PR bodies).
- **Trust-ladder gates** (`a07`, `b13`): read per-repo `merged_prs_by_user`.
  Board standing ≠ GitHub merge history — at survey time the user had **0**
  merged PRs into `gastownhall/gascity` directly despite 3 board completions,
  so rung-0 size caps apply there. The wasteland repo has 1 (PR #12).

## Collaboration-surface inversion

Step 0.6 of the skill teaches caution: into a `closed`-collaboration repo, a
governance Design Issue from a stranger torches credibility. **Wasteland inverts
that** — the wanted board item *is* the maintainer asking for the work. For a
board-listed item:

- Treat `collaboration_surface` as **`open` / invited** for the scope the board
  item describes. The Design-Issue-first dance is unnecessary for pre-sanctioned
  board scope; the claim is `wl claim`, and the deliverable is the PR.
- This relaxation is **scoped to the board item**. Going beyond the item's stated
  scope (an unsolicited refactor, a governance proposal) reverts to normal
  first-touch discipline.
- The healthy external-merge velocity confirms it: `gastownhall/gascity` merged
  25 external PRs in the last 90 days; the repos genuinely land outside work.

## The `[wendy:github-mirror]` staleness trap

Some board items carry `[wendy:github-mirror]` in their description: they were
mirrored onto the board from a GitHub issue. **A mirror can point at a CLOSED
issue** — the board shows the item `open` while the upstream work already
shipped. At survey time, **6 of 8** mirrored `gascity` items resolved to
`CLOSED/COMPLETED` GitHub issues (e.g. `#356`, `#360`, `#362`, `#363`, `#434`,
`#301`).

**Rule:** before claiming any `github-mirror` item, resolve and check the GitHub
issue state (`gh issue view <N> --repo <repo> --json state,stateReason`). If
it's closed-completed, the board item is stale — do not claim it; flag it for
the board owner instead.

## Candidate-file conventions for board items

Mirror the wanted board into `~/.contribute-system/candidates/` so the cockpit
keeps tabs on it:

- **Filename** — github-mirrored items use the real issue number
  (`gastownhall__gascity__issue<N>.md`); wl-native items use the wl id
  (`gastownhall__gascity__wl-gc-002.md`).
- **Extra frontmatter** beyond the standard candidate schema
  (`references/candidate-file-format.md`):
  - `wl_id: w-<id>` — the board id (the join key back to Dolt).
  - `scope_verdict: in-league | defer-pair | clarify` — triage baked into the
    candidate so it's greppable and surfaces in any board view.
- `repo:` is the GitHub deliverable repo; `issue_url:` points at the GitHub
  issue when one exists, else the repo.

## When `/contribute` should read this file

Enter Wasteland-federation handling when the target repo owner is `gastownhall`
or `julianknutsen` (the federation repos), or when the user references a `w-<id>`
board item / the `wl` CLI. Read this file before drafting any claim for those
repos — the claim path is `wl claim`, not `gh issue comment`.

## Cross-references

- `references/candidate-file-format.md` — base candidate schema this extends
- `references/workflow-guide.md` — the stock 5-step lifecycle
- Wasteland upstream: https://github.com/julianknutsen/wasteland
- The rig workspace: `~/000-projects/wasteland-rig/` (its `CLAUDE.md` has the
  `wl` quick-reference)
