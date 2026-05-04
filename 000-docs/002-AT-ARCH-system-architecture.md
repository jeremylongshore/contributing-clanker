---
title: System Architecture
category: AT
type: ARCH
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-9dr
---

# System Architecture

## The 3-layer model

`contributing-clanker` is structured as three layers that interact only through well-defined contracts. Each layer can be replaced or extended without touching the others.

```
                     +---------------------------+
                     |  /contribute SKILL.md     |  ← Layer 3
                     |  (lifecycle workflow)     |
                     +-------------+-------------+
                                   |
                                   v
                     +-------------+-------------+
                     |   transition.sh           |
                     |   (the chokepoint)        |
                     +-------------+-------------+
                                   |
                                   v
                     +-------------+-------------+
                     |   gate-runner.sh          |
                     |   (orchestrator)          |
                     +-+-----+-----+-----+-------+
                       |     |     |     |
                       v     v     v     v
                     +----+ +----+ +----+ +----+
                     |gate| |gate| |gate| |gate|     ← Layer 2
                     | A1 | | B5 | |C13 | | F1 |       (41 of 62 installed)
                     +----+ +----+ +----+ +----+
                       ^     ^     ^     ^
                       |     |     |     |
                       +-----+-----+-----+
                             |
                             v
                       +-----+------+
                       |  Dossier   |  ← Layer 1
                       | (per repo) |     ~/.contribute-system/research/
                       +-----+------+
                             ^
                             |  built/refreshed by
                             |
                       +-----+------+
                       | @researcher|
                       |  subagent  |
                       +------------+
```

## Layer 1 — Per-repo dossiers (markdown)

One file per upstream repo at `~/.contribute-system/research/<owner>__<repo>.md`. Built by the `@researcher` subagent (`~/.claude/skills/contribute/agents/researcher.md`), which wraps `~/.claude/skills/contribute/scripts/researcher-build.sh` for the deterministic parts (CONTRIBUTING fetch, depth-1 link follows, policy-file inventory, bot detection from a recent merged PR) and uses LLM judgment only for the few questions that require it (tone match, AI policy interpretation).

Frontmatter is the queryable layer — every gate reads it. Body holds curated knowledge: pet peeves, failure log, free-form notes that survive `refresh`. See `004-AT-SPEC-research-system-dossiers.md` for the full schema.

## Layer 2 — Deterministic gates (~41 bash scripts)

One script per gate at `~/.contribute-system/gates/<phase><id>-<short>.sh`. Each gate:

- Sources `lib/preamble.sh` for `gate_pass` / `gate_warn` / `gate_block` / `gate_inform` / `gate_skip` helpers
- Reads JSON on stdin: `{candidate, dossier, action, env}`
- Returns one JSON verdict on stdout
- Always exits 0 (a non-zero exit means the gate itself crashed, which the preamble's ERR trap catches and converts to a fail-closed BLOCK)
- Runs in <10s (gate-runner enforces with `timeout 10`)
- Is read-only — no gate mutates state outside `~/.contribute-system/log.jsonl`

See `005-AT-SPEC-gate-inventory.md` for the inventory.

## Layer 3 — Lifecycle workflow

The `/contribute` SKILL.md (`~/.claude/skills/contribute/SKILL.md`) is the orchestrator. It walks each candidate through `open → shortlist → claimed → working → submitted → merged` (or `dropped`). At each transition, it calls `~/.contribute-system/bin/transition.sh <action> <candidate-path>`, which:

1. Reads the candidate frontmatter
2. Resolves the dossier path (auto-builds via `@researcher` if missing/stale)
3. Calls `gate-runner.sh` with the right phase set for this action
4. Aggregates gate verdicts; refuses transition on any unmitigated BLOCK
5. Atomically updates the candidate's `status:` field on success (write-to-temp + rename)

See `006-AT-SPEC-lifecycle-workflow.md`.

## Architectural invariants

These hold across all 3 layers and must not be violated:

1. **State is markdown-only.** No SQLite, no daemon, no in-memory cache. The filesystem IS the database.
2. **Append-only event log.** `~/.contribute-system/log.jsonl` is never truncated or rewritten. Every gate run, transition, override lands here with a UTC timestamp.
3. **Gates always exit 0.** Non-zero exit = gate is broken. Verdict travels via stdout JSON, not exit code.
4. **One concern per layer.** Dossier knows what the repo expects; gates know how to check; workflow knows what's next. None of them crosses into another's responsibility.
5. **Atomic candidate writes.** Status bumps go through write-temp + rename. Mid-flight crash never leaves a half-written candidate.
6. **Plug-in / stackable.** Gate addition = drop a new `<phase><id>-<name>.sh` into `gates/`, `chmod +x`. Removal = `chmod -x`. No registration step. Gate-runner discovers via glob.

## Source plan

`~/.claude/plans/fizzy-sprouting-quokka.md` § "Architecture: 3-layer safety system" — the original design that this implementation realizes.
