#!/usr/bin/env bash
# test-known-traps.sh — regression tests for the failure modes that motivated
# the gate system. Each test constructs a synthetic candidate file matching a
# known real-world trap and asserts the expected gate fires with the expected
# severity.
#
# Usage: test-known-traps.sh [--verbose]
# Exit 0: all tests pass.  Exit 1: any test fails.
#
# Tests:
#   1. PostHog #55412 — already-shipped issue (gate A02 must BLOCK)
#   2. opensre #1129  — assigned issue (gate A01 must BLOCK)
#   3. closed issue   — closed-not-planned (gate A05 must BLOCK)
#   4. clean candidate — no traps (transition must PASS or only SKIP)

set -uo pipefail

VERBOSE="${1:-}"
SYS="$HOME/.contribute-system"
TMPDIR=$(/usr/bin/mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0
RESULTS=()

red()    { /usr/bin/printf '\033[31m%s\033[0m' "$1"; }
green()  { /usr/bin/printf '\033[32m%s\033[0m' "$1"; }
yellow() { /usr/bin/printf '\033[33m%s\033[0m' "$1"; }

# Helper: run transition.sh in dry-run mode against a candidate.
# Returns the verdict JSON on stdout.
run_transition() {
  local action="$1" candidate="$2"
  "$SYS/bin/transition.sh" "$action" "$candidate" --dry-run 2>/dev/null \
    | /usr/bin/grep -E '^\{.*"verdict"' \
    | /usr/bin/tail -1
}

# Helper: assert a specific gate ID appears with a specific severity in the
# verbose stderr output of transition.sh.
gate_fired_with_severity() {
  local action="$1" candidate="$2" gate_id="$3" expected_sev="$4"
  local stderr_output
  stderr_output=$("$SYS/bin/transition.sh" "$action" "$candidate" --dry-run 2>&1 >/dev/null)
  if [[ "$VERBOSE" == "--verbose" ]]; then
    /usr/bin/printf '\n--- transition output for %s on %s ---\n%s\n---\n' \
      "$action" "$(/usr/bin/basename "$candidate")" "$stderr_output" >&2
  fi
  /usr/bin/echo "$stderr_output" | /usr/bin/grep -qE "\[$gate_id\].*$expected_sev"
}

assert_gate() {
  local name="$1" action="$2" candidate="$3" gate_id="$4" expected_sev="$5"
  /usr/bin/printf '  %-50s ' "$name"
  if gate_fired_with_severity "$action" "$candidate" "$gate_id" "$expected_sev"; then
    green "PASS"; /usr/bin/echo
    PASS=$((PASS + 1))
    RESULTS+=("PASS: $name")
  else
    red "FAIL"; /usr/bin/echo
    /usr/bin/printf '    expected gate %s severity %s — not found\n' "$gate_id" "$expected_sev" >&2
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL: $name (expected $gate_id $expected_sev)")
  fi
}

# Build a synthetic candidate file. The frontmatter is what gates read.
# Body is unused for these tests.
make_candidate() {
  local repo="$1" issue="$2" status="${3:-open}" path
  path="$TMPDIR/synth_$(/usr/bin/echo "$repo" | /usr/bin/tr '/' '_')_$issue.md"
  /usr/bin/cat > "$path" <<EOF
---
discovered_at: 2026-05-03T00:00:00Z
repo: $repo
issue_number: $issue
issue_url: https://github.com/$repo/issues/$issue
star_tier: mainstream
star_count: 1000
repo_lang: TypeScript
competing_prs: 0
primary_label: bug
scout_score: 0.5
status: $status
last_refreshed: 2026-05-03T00:00:00Z
---

# $repo #$issue — synthetic regression test candidate
EOF
  /usr/bin/echo "$path"
}

/usr/bin/printf '\n=== contributing-clanker regression tests — known traps ===\n\n'

# ---- TEST 1: PostHog #55412 trap (already-shipped) ----
# The plan documents this as the originating trap for gate A02.
# Issue #55412 was closed by merged PR #57145. We need A02 to BLOCK.
/usr/bin/printf 'Test 1: PostHog #55412 already-shipped trap\n'
T1=$(make_candidate "PostHog/posthog" 55412)
assert_gate "  A02 already-shipped MUST BLOCK" \
  "shortlist→claimed" "$T1" "A02" "BLOCK"

# ---- TEST 2: Tracer-Cloud opensre #1129 trap (assigned) ----
# This issue was assigned to unKnownNG when scout found it. A01 must BLOCK.
/usr/bin/printf 'Test 2: Tracer-Cloud opensre #1129 assigned trap\n'
T2=$(make_candidate "Tracer-Cloud/opensre" 1129)
assert_gate "  A01 already-assigned MUST BLOCK" \
  "shortlist→claimed" "$T2" "A01" "BLOCK"

# ---- TEST 3: lingdojo/kana-dojo #15441 (closed not_planned) ----
# Verified empirically 2026-05-03 — A05 BLOCKs on closed issues.
/usr/bin/printf 'Test 3: lingdojo/kana-dojo #15441 closed-issue trap\n'
T3=$(make_candidate "lingdojo/kana-dojo" 15441)
assert_gate "  A05 issue-still-open MUST BLOCK" \
  "shortlist→claimed" "$T3" "A05" "BLOCK"

# ---- TEST 4: clean candidate (no traps) ----
# Pick a repo+issue that's currently OPEN and unassigned. We use a synthetic
# very-high issue number that won't match any real shipped PR.
# Note: this test runs against a real repo via gh; if the issue doesn't exist,
# the gates will produce ambiguous results. We pick something neutral.
/usr/bin/printf 'Test 4: clean candidate (open, unassigned, unshipped)\n'
T4=$(make_candidate "lingdojo/kana-dojo" 99999999)
# A01 should PASS or A03/A04/A05 — we just want NO unexpected BLOCKs from A1
# (which is the most common false-positive risk).
assert_gate "  A01 should NOT block (issue 99999999 nonexistent)" \
  "shortlist→claimed" "$T4" "A01" "(PASS|SKIP)"

# ---- TESTS 5-13: Trust-ladder gates (A07 + B13) ----
# Inputs are dossier-side + candidate-side; no live GH needed. Each test
# calls the gate script directly with crafted stdin (avoids transition.sh
# running the full phase chain and producing noise from unrelated gates).
#
# Rule motivated by audit of oven-sh/bun#30903 — see
# ~/.claude/skills/contribute/references/anti-patterns.md.

# Helper: write a synthetic dossier with controllable merged_prs_by_user.
# Use for A07/B13 tests where we want to vary the contributor's rung.
make_synth_dossier() {
  local repo="$1" merged_count="$2" path
  path="$TMPDIR/synth_dossier_$(/usr/bin/echo "$repo" | /usr/bin/tr '/' '_')_${merged_count}.md"
  /usr/bin/cat > "$path" <<EOF
---
repo: $repo
last_refreshed: 2026-05-28T00:00:00Z
default_branch: main
gh_user_at_refresh: testuser
merged_prs_by_user: $merged_count
---
EOF
  /usr/bin/echo "$path"
}

# Helper: write a synthetic candidate with controllable scope_intent +
# issue_number. Use for A07 tests.
make_synth_candidate() {
  local repo="$1" issue="$2" intent="$3" path
  path="$TMPDIR/synth_cand_$(/usr/bin/echo "$repo" | /usr/bin/tr '/' '_')_${intent}.md"
  /usr/bin/cat > "$path" <<EOF
---
repo: $repo
issue_number: $issue
scope_intent: $intent
status: shortlist
---
EOF
  /usr/bin/echo "$path"
}

# Helper: run a single gate directly with crafted input JSON. Returns the
# severity (PASS/WARN/BLOCK/INFORM/SKIP) on stdout.
gate_severity() {
  local gate_script="$1" candidate="$2" dossier="$3" action="$4" repo="$5"
  local input
  input=$(jq -nc \
    --arg cand "$candidate" --arg dos "$dossier" \
    --arg act "$action" --arg r "$repo" \
    '{candidate: $cand, dossier: $dos, action: $act, env: {repo: $r}}')
  /usr/bin/printf '%s' "$input" \
    | "$gate_script" 2>/dev/null \
    | jq -r '.severity'
}

assert_severity() {
  local name="$1" expected="$2" actual="$3"
  /usr/bin/printf '  %-58s ' "$name"
  if [[ "$actual" == "$expected" ]]; then
    green "PASS"; /usr/bin/echo
    PASS=$((PASS + 1))
    RESULTS+=("PASS: $name")
  else
    red "FAIL"; /usr/bin/echo
    /usr/bin/printf '    expected %s but got %s\n' "$expected" "$actual" >&2
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL: $name (expected $expected got $actual)")
  fi
}

# Gates are deployed under bin/gates/ (the bundled mirror of the repo's
# scripts/gates/). ~/.contribute-system/gates/ is the user-override dir and is
# normally empty — referencing it here broke after the bin/ mirror consolidation.
A07="$SYS/bin/gates/a07-trust-ladder-fit.sh"
B13="$SYS/bin/gates/b13-trust-ladder-size.sh"

/usr/bin/printf '\nTest 5-9: A07 trust-ladder fit (intent vs rung)\n'

# 5. Rung 0 + umbrella → BLOCK
D0=$(make_synth_dossier "test/repo" 0)
C_UMB=$(make_synth_candidate "test/repo" "" "umbrella")
S=$(gate_severity "$A07" "$C_UMB" "$D0" "shortlist→claimed" "test/repo")
assert_severity "  A07 rung 0 + umbrella MUST BLOCK" "BLOCK" "$S"

# 6. Rung 0 + single-issue + no issue_number → BLOCK
C_NOISS=$(make_synth_candidate "test/repo" "" "single-issue")
S=$(gate_severity "$A07" "$C_NOISS" "$D0" "shortlist→claimed" "test/repo")
assert_severity "  A07 rung 0 + no issue_number MUST BLOCK" "BLOCK" "$S"

# 7. Rung 0 + single-issue + has issue_number → INFORM (PASS path)
C_OK=$(make_synth_candidate "test/repo" 180 "single-issue")
S=$(gate_severity "$A07" "$C_OK" "$D0" "shortlist→claimed" "test/repo")
assert_severity "  A07 rung 0 + has issue MUST INFORM" "INFORM" "$S"

# 8. Rung 0 + design-discussion → PASS unconditionally
C_DD=$(make_synth_candidate "test/repo" "" "design-discussion")
S=$(gate_severity "$A07" "$C_DD" "$D0" "open→shortlist" "test/repo")
assert_severity "  A07 rung 0 + design-discussion MUST PASS" "PASS" "$S"

# 9. Rung 5 + umbrella → PASS (earned)
D5=$(make_synth_dossier "test/repo" 5)
S=$(gate_severity "$A07" "$C_UMB" "$D5" "shortlist→claimed" "test/repo")
assert_severity "  A07 rung 5 + umbrella MUST PASS (earned)" "PASS" "$S"

/usr/bin/printf '\nTest 10-13: B13 trust-ladder size cap\n'

# B13 needs a real clone to measure. We use the agent-brain clone if available.
AB_CLONE="$HOME/000-projects/contributing-clanker/agent-brain"
if [[ -d "$AB_CLONE/.git" ]]; then
  AB_REPO="SpillwaveSolutions/agent-brain"

  # 10. Rung 0 + agent-brain branch (known 218 LOC / 11 files) → BLOCK
  D0_AB=$(make_synth_dossier "$AB_REPO" 0)
  C_AB=$(make_synth_candidate "$AB_REPO" 180 "single-issue")
  S=$(gate_severity "$B13" "$C_AB" "$D0_AB" "working→submitted" "$AB_REPO")
  assert_severity "  B13 rung 0 + real over-cap diff MUST BLOCK" "BLOCK" "$S"

  # 11. Rung 5+ → PASS unconditionally (skips measurement)
  D5_AB=$(make_synth_dossier "$AB_REPO" 5)
  S=$(gate_severity "$B13" "$C_AB" "$D5_AB" "working→submitted" "$AB_REPO")
  assert_severity "  B13 rung 5 MUST PASS without measuring" "PASS" "$S"

  # 12. trust_ladder_disabled flag → SKIP
  D_DIS=$(/usr/bin/cat > "$TMPDIR/synth_dossier_disabled.md" <<EOF
---
repo: $AB_REPO
default_branch: main
merged_prs_by_user: 0
trust_ladder_disabled: true
---
EOF
  /usr/bin/echo "$TMPDIR/synth_dossier_disabled.md")
  S=$(gate_severity "$B13" "$C_AB" "$D_DIS" "working→submitted" "$AB_REPO")
  assert_severity "  B13 trust_ladder_disabled MUST SKIP" "SKIP" "$S"
else
  /usr/bin/printf '  '; yellow "SKIP"; /usr/bin/printf ' B13 size tests (no %s clone)\n' "$AB_REPO"
fi

# 13. No merged_prs_by_user field → SKIP (refresh hint)
EMPTY_DOSSIER="$TMPDIR/empty_dossier.md"
/usr/bin/cat > "$EMPTY_DOSSIER" <<EOF
---
repo: test/repo
default_branch: main
---
EOF
S=$(gate_severity "$A07" "$C_OK" "$EMPTY_DOSSIER" "shortlist→claimed" "test/repo")
assert_severity "  A07 missing merged_prs_by_user MUST SKIP" "SKIP" "$S"

# 14. B13 cross-directory rename MUST NOT false-BLOCK
# Regression for Gemini finding on PR #40 (commit 45fd6b2): `git diff
# --numstat` without --no-renames produces output like
# `foo.txt => existing-dir/foo.txt` for renames. The new-top-level-dir
# parser was reading that as adding a top-level dir named
# `foo.txt => existing-dir`. With --no-renames in place, git emits the
# rename as a delete+add pair so the added path is parsed cleanly.
#
# This test sets up a fresh git fixture with a cross-directory rename
# (foo.txt -> existing-dir/foo.txt, where existing-dir already exists on
# the base ref) and asserts B13 PASSes. If --no-renames is ever stripped
# from b13-trust-ladder-size.sh, this test BLOCKs and the regression
# surfaces.
/usr/bin/printf 'Test 14: B13 cross-directory rename regression (PR #40 fix)\n'

FIXTURE="$HOME/000-projects/contributing-clanker/test-b13-rename-fixture"
/usr/bin/rm -rf "$FIXTURE"
/usr/bin/mkdir -p "$FIXTURE"
(
  cd "$FIXTURE" || exit 1
  /usr/bin/git init -q -b main 2>/dev/null || /usr/bin/git init -q
  /usr/bin/git config user.email "test@example.com"
  /usr/bin/git config user.name "Test User"

  /usr/bin/mkdir existing-dir
  /usr/bin/echo "keep" > existing-dir/keep.txt
  /usr/bin/echo "to-be-moved" > foo.txt
  /usr/bin/git add . >/dev/null 2>&1
  /usr/bin/git commit -q -m "base"

  # Fake origin/main ref pointing at the base commit (b13 looks for
  # upstream/<branch> first, then origin/<branch>).
  /usr/bin/git update-ref refs/remotes/origin/main HEAD

  # Move foo.txt across directory boundaries.
  /usr/bin/git checkout -q -b feature
  /usr/bin/git mv foo.txt existing-dir/foo.txt
  /usr/bin/git commit -q -m "rename foo into existing-dir"
) >/dev/null 2>&1

D_FIX=$(make_synth_dossier "test-fixture/b13-rename" 0)
C_FIX=$(make_synth_candidate "test-fixture/b13-rename" 1 "single-issue")
# Override CLONE_DIR derivation: b13 computes CLONE_DIR from the repo's
# basename, which here will be `b13-rename`. We placed the fixture at
# .../test-b13-rename-fixture, so symlink it into place for the test.
LINK="$HOME/000-projects/contributing-clanker/b13-rename"
[ -e "$LINK" ] && /usr/bin/rm -rf "$LINK"
/usr/bin/ln -s "$FIXTURE" "$LINK"

S=$(gate_severity "$B13" "$C_FIX" "$D_FIX" "working→submitted" "test-fixture/b13-rename")
assert_severity "  B13 cross-dir rename MUST NOT false-BLOCK" "PASS" "$S"

# Cleanup
/usr/bin/rm -f "$LINK"
/usr/bin/rm -rf "$FIXTURE"

/usr/bin/echo
/usr/bin/printf '=== summary: %s passed · %s failed ===\n\n' \
  "$(green "$PASS")" "$([ "$FAIL" -gt 0 ] && red "$FAIL" || /usr/bin/echo 0)"

if [[ "$FAIL" -gt 0 ]]; then
  /usr/bin/printf 'Failures:\n'
  for R in "${RESULTS[@]}"; do
    [[ "$R" == FAIL:* ]] && /usr/bin/printf '  %s\n' "$R"
  done
  exit 1
fi

exit 0
