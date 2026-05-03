---
title: Testing and Verification Strategy
category: TQ
type: TEST
status: draft
last_updated: 2026-05-03
epic: contributing-clanker-ql2
---

# Testing and Verification Strategy

The system has three things to verify: (1) the dossier builder produces a correct dossier; (2) `transition.sh` correctly accepts/refuses transitions per gate verdicts; (3) the plug-in / opt-out / override mechanisms behave as advertised. Each gets a smoke test that runs against a real candidate.

## End-to-end smoke tests

### `researcher-build.sh` against a live repo

```
~/.contribute-system/bin/researcher-build.sh lingdojo/kana-dojo > /tmp/kana-dojo.md
```

Pass = file exists, frontmatter has `repo:`, `default_branch:`, `last_refreshed:`, body has the 9 expected sections (TL;DR, Description, Policy file inventory, CONTRIBUTING excerpts, Linked sources, Issue templates, Bots, Pet peeves, Failure log, Notes), no shell errors on stderr.

Fail signals: missing CONTRIBUTING parse → empty `cla_required` field; rate-limit hit → empty `review_bots` (gracefully degrade, don't crash).

### `transition.sh` on a real candidate

```
~/.contribute-system/bin/transition.sh shortlist→claimed \
  ~/.contribute-system/candidates/lingdojo__kana-dojo__issue15441.md --dry-run
```

Pass = exit 0, JSON aggregate verdict on stdout, gate run events in `log.jsonl`, candidate file unchanged (dry-run). Drop `--dry-run` and verify status field flipped atomically.

### **2026-05-03 verification run** — `lingdojo/kana-dojo #15441`

The reference end-to-end pass. Walked the 41-question audit against this issue (see source plan, "Worked example: lingdojo/kana-dojo + #15441"). All A/B/D categories cleared green. Dossier auto-built from missing state. `shortlist→claimed` transition under all 41 installed gates resolved to PASS with 0 BLOCKs, 0 WARNs.

This is the canonical smoke pass. Re-run periodically; expect drift if upstream changes CONTRIBUTING.md.

## Regression tests for known traps

Every real-world trap that justified a gate becomes a regression fixture. Trap a gate is supposed to catch → verify the gate catches it.

| Trap | Setup | Expected verdict |
|---|---|---|
| PostHog #55412 (already-shipped) | candidate against an issue with merged "closes #N" PR | a02-already-shipped → BLOCK |
| Tracer-Cloud opensre #1129 (already-assigned) | candidate against issue with `assignees != []` | a01-already-assigned → BLOCK |
| PostHog stale-clone (8888 commits behind) | local clone behind upstream by >100 commits | b03-clone-fresh → WARN |
| `Co-Authored-By: Claude` line in commits | git log contains the banned trailer | c07-coauthor-banned → BLOCK |

Fixtures live in `~/.contribute-system/test-fixtures/<trap-name>/`.

## Plug-in test (auto-discovery)

Drop a no-op gate, confirm the runner picks it up:

```
cat > ~/.contribute-system/gates/z99-noop.sh <<'EOF'
#!/usr/bin/env bash
source "$(dirname "$0")/lib/preamble.sh"
gate_read_input
gate_pass "noop ok"
EOF
chmod +x ~/.contribute-system/gates/z99-noop.sh
~/.contribute-system/bin/gate-runner.sh "shortlist→claimed" <candidate> <dossier> 2>&1 | grep z99
# expect: PASS line for z99-noop
chmod -x ~/.contribute-system/gates/z99-noop.sh   # disable
```

Re-run; `z99-noop` should NOT appear (the runner's `[[ -f && -x ]]` filter skips it).

## Per-repo opt-out test (`disabled_gates`)

Set `disabled_gates: [b07]` in a dossier. Run `working→submitted` against a candidate that would normally trip `b07-scope-files`. Expected: gate-runner reports SKIP for `b07`, transition proceeds even though the diff has scope-creep.

## Override test

```
~/.contribute-system/bin/transition.sh working→submitted <candidate> \
  --override-gate b07 "scope expansion approved by maintainer in issue comment"
```

Expected: `b07` returns BLOCK; override absorbs it; transition proceeds; `log.jsonl` has a `gate_override` event with the reason; candidate's `overrides:` list grows by one entry. Then run `g06-override-rate-limit`-tripping count + 1 → expect that gate to BLOCK on the next override attempt the same day.

## Stale-dossier auto-refresh test

Edit `last_refreshed:` in a dossier to 30 days ago. Run any transition for a candidate at that repo. Expect: SKILL.md Step 0.5 detects staleness, invokes `@researcher refresh`, `last_refreshed:` updates, manual sections (Pet peeves / Failure log / Notes) are byte-identical post-refresh.

## What's NOT covered yet

- Performance regression (gate latency budget). Acceptance bar: full `working→submitted` run completes in <60s on the dev box. Not yet automated.
- Concurrent transition.sh invocations on the same candidate (TOCTOU). Mitigated by `--max-gate-age` but not stress-tested.
- Cross-platform (everything assumed Linux + bash + GNU coreutils).

## Cross-references

- Source plan: `~/.claude/plans/fizzy-sprouting-quokka.md`
- Architecture: `002-AT-ARCH-system-architecture.md`
- Gate inventory: `005-AT-SPEC-gate-inventory.md`
