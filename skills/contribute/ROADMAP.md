# /contribute system roadmap

> Forward-looking queue for the `/contribute` skill. Things noted here are
> deliberately deferred — not forgotten, not silently skipped. Each entry
> has a "ship-when" criterion so we don't ship gates before we have signal
> they'd reduce real failure modes.
>
> Last updated: 2026-05-28 (after trust-ladder rule landed).

---

## Deferred gates (from the oven-sh/bun#30903 audit, 2026-05-28)

The trust-ladder rule (gates A07 + B13) was shipped first because it has
the highest leverage — almost every other failure mode of the bun#30903
case is downstream of trust-ladder skipping. The four queued gates below
are designed to catch the residual failure modes the ladder doesn't fully
suppress. Each is ready to spec; none has been validated against real
hit-rate data yet.

### A1 — `no-audit-dump`

**What**: a phase-A gate that pattern-matches new top-level directories
matching `*audit*` / `*scan*` / `*review*` / `*exorcism*` / `*finding*`
plus generated-artifact file names (`phase[0-9]_*.json`, `EXP-*`,
`convergence_*.json`).

**Refuses**: candidates whose intended diff includes such dirs *unless*
the candidate's `scope_intent` is `design-discussion` (audits land as
Design Issues, not PRs).

**Ship-when**: after 14 days of A07/B13 production data. If we observe
≥2 audit-dump-shaped candidates the ladder would have blocked anyway,
A1 is redundant; skip it. If we observe an audit dump that *slipped past*
the ladder (e.g., contributor lifts the cap via override, then ships
generated content anyway), A1 is the right next gate.

**Failure case that motivates it**: `oven-sh/bun#30903` adds
`.ub-exorcism/` as a new top-level dir; `oven-sh/bun#30763` adds
`.unsafe-audit/`. Both would be blocked.

### C2 — `no-maintainer-decision-punts`

**What**: a phase-C gate (PR-submit time) that scans the draft PR body
for phrases that punt the scope decision to the maintainer:
`"decide whether to"`, `"let me know if you want"`, `"your call on"`,
`"happy to do whatever"`, `"either way"`, `"we could either... or..."`.

**Verdict**: WARN, not BLOCK. The phrases sometimes appear in legitimate
"I'm happy to revise this part" comments. WARN-only forces the user to
re-read the body before posting.

**Ship-when**: when a user-authored PR body containing one of these
phrases lands at a tracked repo. Tracking is via `log.jsonl` event
`pr_body_drafted` — currently not emitted. Adding the emission is part
of this gate's spec.

**Failure case**: `oven-sh/bun#30903`'s test plan ends with
"Decide whether to (a) accept this PR as-is or (b) move the artifacts..."

### D6 — `review-queue-throttle`

**What**: at PR-create time, refuse to open a new PR if the user has
≥2 PRs open at the same repo with zero maintainer engagement (no
maintainer comment, no maintainer review, no thumbs-up reactions).

**Override path**: `--override-gate D6 "<rationale>"` for cases where
the maintainer has explicitly invited a batch (rare; usually a follow-on
to a merged earlier PR).

**Ship-when**: when we observe the user open a 3rd PR on a repo while
the prior two sit silent. Honest assessment: this happens to us roughly
once a quarter; the gate adds friction but rarely fires. Lower priority
than A1/C2.

**Failure case**: Dicklesworthstone opened 10 fix PRs in `oven-sh/bun`
(#31087 → #31267) over 4 days while the umbrella audit-PR #30903 sat
unread. None merged. Review deadlock.

### Dossier field — `ai_slop_sensitivity`

**What**: a dossier frontmatter field with values `high|medium|low|unknown`
populated by `@researcher` from heuristics:
- High: repo has closed-as-spam PRs from AI tools, or `CONTRIBUTING.md`
  contains explicit anti-AI language, or maintainer comments name
  "hallucinated" / "ai slop" in closed PRs
- Medium: repo has `claude[bot]` / `coderabbitai[bot]` review noise
  without human maintainer engagement on AI-disclosed PRs
- Low / Unknown: default

**Used by**: a future advisory layer in SKILL.md that adjusts the
maintainer-eye briefing for AI-disclosed contributions. Specifically:
suggest minimizing generated-artifact footers, prefer human-summarized
explanations, avoid multi-agent authorship advertising.

**Ship-when**: this is dossier-side metadata, not a gate. Can land any
time `@researcher` is touched for another reason. Low coupling.

### PR-template fidelity gate (F1)

**What**: a phase-F gate that parses the upstream's
`.github/pull_request_template.md` (length, sections) and warns if the
drafted PR body is >5x longer than the template.

**Rationale**: Bun's PR template is 2 lines ("What does this PR do? /
How did you verify your code works?"). A 50-line PR body from a contributor
who hasn't internalized the terseness reads as off-tone.

**Ship-when**: when a user-authored PR body 5x exceeds the template at a
repo with a known-terse template (Bun, Vercel/Next.js). Low priority.

### Maintainer-URL leakage gate (C25) — SHIPPED 2026-06-04

**What**: scan added lines for `github.com/owner/repo/issues/N` and
`owner/repo#N` patterns in customer-facing surfaces (`agents/*.md`,
`SKILL.md`, `README*`). Skip legitimately allowed paths (`references/`,
`CHANGELOG`, `docs/decisions/`, `docs/adr/`, `.github/`).

**Rationale**: a paying customer reading a SKILL.md or an agent
diagnosis output sees `per [#36]` and reads "this product is
unfinished — the maintainers are still cross-referencing their own
tickets in the docs." Behavioral description carries the load; the URL
is dead weight to both the LLM (can't follow it) and the customer
(doesn't need it).

**Canonical case**: `kobiton/automate#67` cleanup 2026-06-04 — three
maintainer issue URLs (#33 four-conflict-modes, #36 cooldown, #55
token-cap pagination) drifted into `agents/device-picker.md` + parent
`SKILL.md § 2` during review-cycle iteration. Stripped before customer
ship; behavioral language preserved.

**Shipped**: 2026-06-04 at
`skills/contribute/scripts/gates/c25-maintainer-url-leakage.sh`.
Anti-pattern `Pattern 11 — Maintainer-URL Leakage` added to
`references/anti-patterns.md`. Severity WARN.

### Engagement-frame leakage gate (C24) — SHIPPED 2026-06-03

**What**: scan added lines in the diff for tokens that signal
engagement-internal taxonomy has leaked into a customer-facing public
artifact — finding-ID numbers near `finding|audit|issue|catalog`,
review-phase labels (`R[123] audit|review|deliverable|§`), `Intent
Solutions pilot`, `op-rule #\d+`, `partner=intentsolutions`, cross-refs
to `000-docs/NNN-XX-...` paths, author footers in committed file
content.

**Rationale**: maintainers read engagement-frame as divided loyalty
("delivering to employer, not to my users"). The substance of the
contribution may be genuine; the framing alone can sink the PR.

**Canonical case**: `kobiton/automate#70` review by `huytunguyenn`
2026-06-03 — CHANGES_REQUESTED on a `validate-userintent` hook that
enforced an engagement-internal userIntent format on every plugin
user. Sister PRs `#65`/`#67`/`#75`/`#77` had the same class of leak
(F-series IDs, R2/R3 phase labels, "Intent Solutions pilot" provenance,
author footers in committed file content).

**Shipped**: 2026-06-03 at
`skills/contribute/scripts/gates/c24-engagement-frame-leakage.sh`.
Anti-pattern `Pattern 10 — Engagement-Frame Leakage` added to
`references/anti-patterns.md`. Severity WARN; rate-limit not needed.

---

## Known bugs

### preamble.sh — gate verdict JSON doesn't escape strings

`~/.contribute-system/gates/lib/preamble.sh:29-33` uses `printf` with
`%s` directly into JSON for the `reason` and `fix_hint` fields:

```bash
gate_block()  { /usr/bin/printf '{"severity":"BLOCK","gate":"%s","reason":"%s","fix_hint":"%s"}\n' "$_GATE_ID" "${1:-blocked}" "${2:-}"; exit 0; }
```

If `reason` or `fix_hint` contains a double-quote or backslash, the
emitted JSON is malformed. gate-runner.sh falls back to wrapping it in a
synthetic BLOCK, but the original verdict is lost.

**Workaround in use today**: gate authors avoid `\"` in their strings.
A07/B13 use parenthesized framings instead of quoted phrases. This is a
discipline trap.

**Real fix**: switch the helpers to `jq -nc --arg ...` for safe escaping.
Estimated 30 minutes including testing.

**Ship-when**: any time. No external dependencies. Low risk because the
helpers are well-isolated.

---

## Validation telemetry to collect

To inform the next wave of decisions, the `log.jsonl` events to
specifically watch over the next 14 days:

| Event signal | What it tells us | Action |
|---|---|---|
| `gate_run` where `gate: A07` and `severity: BLOCK` | A07 is firing on real candidates | If 0 in 14d: A07 is dormant — review whether `merged_prs_by_user` is reaching gates |
| `gate_run` where `gate: B13` and `severity: BLOCK` | B13 is catching over-cap diffs | If 0: tuning may be too loose; if many: caps may be too tight |
| `gate_override` where `gate: A07` or `B13` | User is bypassing the rule | If >1/week: investigate per-override rationale; the rule may be calibrated wrong |
| `researcher_build` and `researcher_refresh` | Dossiers are being refreshed; `merged_prs_by_user` stays current | If a dossier hasn't refreshed in >30 days, its count is stale |

`scripts/audit-overrides.sh` already surfaces override rates per gate.
After 14 days, run with `--since=14 --gate=A07` and `--since=14 --gate=B13`
to validate.

---

## Update protocol

When an entry here ships, move it to a "Shipped" section at the bottom of
this file (don't delete — the history is useful), and update
`~/.claude/skills/contribute/SKILL.md` if the skill surface changed.

When a new failure pattern is observed in the wild, add to
`~/.claude/skills/contribute/references/anti-patterns.md` first; if it
warrants a gate, add the spec here.

---

## Shipped

- **2026-05-28**: Trust-ladder rule (gates A07 `trust-ladder-fit` + B13
  `trust-ladder-size`, dossier field `merged_prs_by_user`, SKILL.md §
  "Trust-ladder discipline", `references/anti-patterns.md`, 23/23
  dossiers backfilled, 9 regression tests in `test-known-traps.sh`).
  Motivated by audit of `oven-sh/bun#30903`.

- **2026-05-29**: Phase-C content-fidelity gates (kobiton/automate#64 +
  #74 review round-trip). Shipped as skeletons — functional but not
  yet validated against multi-repo hit-rate data.

  Gates:
  - `C20-doc-file-references-exist` — for modified `**/*.md`, parses
    backtick-wrapped path-like tokens and warns if any don't resolve in
    the repo tree. Catches stale doc refs after upstream file removals.
    Motivated by `kobiton/automate#64` comment 3 (reference to deleted
    `.mcp.dev-local.json`).
  - `C21-skill-frontmatter-vs-body` — for modified `**/SKILL.md`, parses
    the `allowed-tools:` block and warns when a declared top-level tool
    (Read/Write/Edit/Glob/Grep/MultiEdit/WebFetch/WebSearch/TodoWrite/
    Task/NotebookEdit) doesn't appear in the body. Catches "Frontmatter
    Bluff" anti-pattern. Motivated by `kobiton/automate#64` comment 4
    (`Write` declared, body only uses `Edit`).
  - `C22-cross-cli-vocabulary` — when the target repo declares multi-CLI
    support (AGENTS.md / .codex/ / .cursor/ / gemini-extension.json
    present, or README cites ≥2 of Cursor/Codex/Gemini/Copilot/Continue/
    Cline), warns on Claude-only phrasing (`claude mcp`, "Claude Code
    session") in modified skills. Catches "CLI-Centric Skill in a
    Multi-CLI Plugin" anti-pattern. Motivated by `kobiton/automate#64`
    comment 5.
  - `C23-mcp-tool-annotations-spec` — for modified `tools/**/*.yaml`
    with `annotations:` blocks, walks each tool stanza and warns on
    (a) `idempotentHint` set with `readOnlyHint: true`, (b)
    `destructiveHint: true` + `idempotentHint: false`. Catches "MCP
    Annotation Conflation" anti-pattern. Motivated by
    `kobiton/automate#74`.

  Hardening:
  - `G03-no-changelog-edits` — secondary trigger added. Previously
    fired only when dossier `auto_changelog: true`; now also fires when
    the target repo has a `scripts/sync-version*`, `scripts/release*`,
    or `scripts/changelog-check*` script (kobiton/automate's
    `sync-version.js --check` mode is the motivating case). When the
    release-script trigger fires, the WARN message specifically names
    the script-driven CHANGELOG flow.

  Anti-pattern entries added:
  - Pattern 7 — Frontmatter Bluff (`C21`)
  - Pattern 8 — CLI-Centric Skill in a Multi-CLI Plugin (`C22`)
  - Pattern 9 — MCP Annotation Conflation (`C23`)

  Validation TODO: run all five gates against a synthetic candidate that
  matches each anti-pattern; add cases to `test-known-traps.sh` once
  hit-rate data accumulates over the next 14 days of `/contribute` use.
