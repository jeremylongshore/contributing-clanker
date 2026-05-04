---
title: Discovery System — @scout subagent
category: AT
type: SPEC
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-bzq
---

# Discovery System — @scout subagent

The `@scout` subagent is the first step in the lifecycle: it converts "I want to find OSS work" into a ranked queue of candidate markdown files. Definition: `~/.claude/skills/contribute/agents/scout.md` (bundled inside the `/contribute` skill per skill-creator spec).

## Star-tier brackets

Scout ranks candidates by repo star count, in alignment with the user's portfolio philosophy of climbing the star-tier ladder over time rather than chasing volume.

| Bracket | Stars |
|---|---|
| emerging | < 100 |
| growing | 100–500 |
| established | 500–1k |
| mainstream | 1k–5k |
| major | 5k–10k |
| flagship | 10k+ |

User profile at `~/.contribute-system/profile.md` declares `target_star_tiers`, `preferred_langs`, `repos_focus`, `repos_blocklist`. Scout never produces candidates outside the profile constraints (unless ad-hoc mode is given an explicit override).

## Three modes

| Mode | When | Behavior |
|---|---|---|
| **baseline** | Monthly / "discover from scratch" | Full per-tier sweep across all `preferred_langs`. Writes one candidate file per qualifying issue. |
| **refresh** | Bi-weekly / "what's still good?" | Re-evaluates existing `status: open` and `status: shortlist` candidates for momentum (still unassigned? still no competing PR? maintainer activity in last 14d?). Updates `scout_score` in-place. |
| **ad-hoc** | "TypeScript repos at mainstream tier" | One-shot query. Honors profile blocklist but allows tier override. |

If the prompt is ambiguous, scout asks ONE clarifying question, then commits.

## Candidate file format

Path: `~/.contribute-system/candidates/<owner>__<repo>__issue<N>.md`. Slashes in `<owner>` are replaced with `__`. Frontmatter is canonical for queries; body holds working notes (claim drafts, scope notes, PR drafts).

```yaml
---
repo: <owner>/<repo>
issue_number: <N>
issue_url: https://github.com/<owner>/<repo>/issues/<N>
status: open                   # open|shortlist|claimed|working|submitted|merged|dropped
scout_score: <0..100>           # ranking signal
discovered_at: 2026-05-03T...Z
star_tier: mainstream
language: typescript
research_path: ""               # filled when dossier built
pr_number: ""                   # filled at submission
overrides: []                   # gate IDs explicitly overridden by user
---

# <repo>#<N>: <issue title>

<scout's one-paragraph why-this-matches summary>

## Notes
```

## Idempotent updates

Re-running `baseline` against an already-discovered issue does NOT clobber claimed-or-later state. Scout reads existing candidate frontmatter first; if `status: open` it may update `scout_score`; if `status` ≥ `claimed`, it leaves the file alone and emits a SKIP event to `log.jsonl`.

## Output destinations

- **Candidates**: written to `~/.contribute-system/candidates/`
- **Events**: appended to `~/.contribute-system/log.jsonl` with `event: scout_discover` / `scout_refresh` / `scout_skip` plus per-candidate scoring trace
- **Memory**: scout's own learnings persisted to `~/.claude/agent-memory/scout/MEMORY.md` (e.g., "PostHog rejects external paid-feature work — exclude from baseline")

## Bundled scripts (deterministic helpers)

Scout's bash work is split across `~/.contribute-system/bin/scout-{discover,score,write,refresh}.{sh,py}`. The subagent invokes these rather than re-implementing search logic in the LLM context. This keeps scout's prompt focused on judgment (does this repo accept externals? is this issue's body precise enough?) and offloads `gh search issues ...` plumbing to bash/python.

## Cross-references

- Dossier system: `004-AT-SPEC-research-system-dossiers.md`
- How candidates flow through the lifecycle: `006-AT-SPEC-lifecycle-workflow.md`
- Gates that read scout-written fields (`a01`, `a04`, `a05`): `005-AT-SPEC-gate-inventory.md`
