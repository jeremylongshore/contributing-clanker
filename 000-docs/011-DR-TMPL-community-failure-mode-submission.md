---
title: Community failure-mode submission template
category: DR
type: TMPL
status: stable
last_updated: 2026-05-03
epic: contributing-clanker-p5q
---

# Community failure-mode submission template

When you observe a real-world failure mode that isn't already in
`007-DR-CATG-failure-mode-catalog.md`, file it here as a fresh row using this
template. Each new mode must clear the bar to be added: **observed in the
wild** (not theoretical), **traceable to a specific maintainer pet peeve or
auto-rejection**, and **expressible as a deterministic gate** (input →
verdict, no judgment call).

## Template

```yaml
mode_id: <next-available-in-phase>     # e.g., A13, B16, C18
phase: <A|B|C|D|E|F|G>                  # which lifecycle phase
title: <one-line failure description>
real_world_trigger:
  - repo: <owner/name>
  - issue_or_pr: <#N or url>
  - date_observed: <YYYY-MM-DD>
  - what_happened: <2-3 sentences>
  - maintainer_quote: |
      <verbatim, if available>
gate_proposal:
  id: <phase><id>-<short>                # e.g., a13-already-bountied
  severity: <BLOCK|WARN|INFORM>
  inputs_needed:
    - <data the gate must inspect>
  decision_logic: |
    <plain-language: when does it BLOCK vs PASS?>
  override_acceptable: <yes|no>           # is --override-gate appropriate?
dossier_field_needed: <field-name | none> # if a per-repo rule applies
references:
  - <link to relevant CONTRIBUTING.md / AI_POLICY / etc.>
```

## Acceptance criteria for adding to the catalog

A submission is accepted into `007-DR-CATG-failure-mode-catalog.md` only when:

1. **Real-world observation**: at least one cited issue/PR/comment URL where
   the failure mode actually triggered a maintainer reaction (close,
   reject, AI-policy strike, downvote).
2. **Deterministic test**: the gate proposal has a clear input → output
   contract that doesn't require LLM judgment to evaluate.
3. **Distinct from existing modes**: not a sub-case of an already-cataloged
   mode (in which case extend the existing row instead of adding a new one).
4. **Per-repo rule isolated to dossier**: any rule that varies by repo
   belongs in the dossier (`disabled_gates:`, custom config), not hard-coded
   in the gate.
5. **Override hatch decided**: BLOCK gates need an explicit
   override-acceptable line — engineers must always have an escape, and the
   override gets logged via `audit-overrides.sh`.

## Process

1. Engineer files a draft using this template at the bottom of
   `007-DR-CATG-failure-mode-catalog.md` § "Pending community submissions".
2. CTO/maintainer reviews against the 5 acceptance criteria.
3. If accepted → mode_id finalized, gate scaffolded at
   `~/.claude/skills/contribute/scripts/gates/<id>.sh`, catalog row promoted
   into the appropriate phase section.
4. If rejected → annotated rejection reason added to the draft, kept as a
   reference for "we considered this but…".

## Cross-references

- 007-DR-CATG-failure-mode-catalog.md — the live 62-mode catalog
- 005-AT-SPEC-gate-inventory.md § Gate contract — implementation contract
- 010-OD-RISK-operations-and-risk.md § Risk register — known risks the
  catalog mitigates
