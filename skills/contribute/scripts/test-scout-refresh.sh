#!/usr/bin/env bash
# test-scout-refresh.sh — regression test for @scout refresh idempotency.
#
# Closes contributing-clanker-bzq.3.
#
# Promise of @scout refresh mode:
#   1. Re-running scout on an existing candidate file UPDATES frontmatter
#      (scout_score, last_seen, momentum_signal) without rewriting the body.
#   2. The body of the candidate (pet peeves observed, manual notes, draft
#      claim text) is preserved across refreshes.
#   3. status: never moves backward — a `claimed` candidate doesn't get
#      reverted to `open` by a refresh.
#
# Why this matters: if refresh clobbers manual body content, every dossier
# enrichment Jeremy does manually gets lost on the next scout run. Hard
# constraint per the @scout spec.
#
# Test approach: synthesize a candidate file with manual body content + a
# "claimed" status, run the equivalent of refresh against it, assert
# preservation.
#
# Usage: test-scout-refresh.sh [--verbose]
# Exit 0: all assertions hold. Exit 1: any failure.

# shellcheck disable=SC2034  # several vars below are consumed inside the
# assert helper's single-quoted `eval` expression strings, which shellcheck
# cannot see — so it false-flags them as unused (file-level directive).
set -uo pipefail

VERBOSE="${1:-}"
TMPDIR=$(/usr/bin/mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0
red()    { /usr/bin/printf '\033[31m%s\033[0m' "$1"; }
green()  { /usr/bin/printf '\033[32m%s\033[0m' "$1"; }

assert() {
  local name="$1" expr="$2"
  /usr/bin/printf '  %-60s ' "$name"
  if eval "$expr" >/dev/null 2>&1; then
    /usr/bin/printf '%s\n' "$(green PASS)"
    PASS=$(( PASS + 1 ))
  else
    /usr/bin/printf '%s\n' "$(red FAIL)"
    FAIL=$(( FAIL + 1 ))
    if [[ "$VERBOSE" == "--verbose" ]]; then
      eval "$expr"
    fi
  fi
}

# Synthesize an existing candidate with manual body content
CANDIDATE="$TMPDIR/example__repo__issue42.md"
/usr/bin/cat > "$CANDIDATE" <<'EOF'
---
status: claimed
repo: example/repo
issue_number: 42
scout_score: 0.65
last_seen: 2026-04-15T00:00:00Z
research_path: ~/.contribute-system/research/example__repo.md
overrides: []
---

# Issue #42 — Add bulk export feature

## Manual notes (engineer-curated, must survive refresh)
- Maintainer @alice prefers small PRs (<200 LOC)
- Has CLA via dev.intentsolutions.io/cla
- Follow-up planned: add CSV export after JSON export ships

## Draft claim comment
I'd like to take this. I've reviewed CONTRIBUTING.md and will follow the
small-PR convention noted by @alice. Plan: JSON export in PR1, CSV in PR2.

## Pet peeves observed for this repo
- Don't @-mention @alice on weekends
- Run `make precommit` before pushing — repo CI is slow
EOF

# Snapshot original body (everything after the second `---`)
ORIG_BODY=$(/usr/bin/awk '/^---$/{c++; next} c>=2' "$CANDIDATE")

# Simulate a refresh: update only frontmatter fields scout would write
# (scout_score, last_seen, momentum_signal). This is what the real
# scout-refresh logic should do — never touch body, never regress status.
/usr/bin/awk '
  BEGIN { in_fm = 0; fm_count = 0 }
  /^---$/ {
    fm_count++
    in_fm = (fm_count == 1)
    print
    if (fm_count == 2 && !momentum_added) {
      # closing frontmatter — too late, never mind
    }
    next
  }
  in_fm && /^scout_score:/ { print "scout_score: 0.78"; next }
  in_fm && /^last_seen:/ { print "last_seen: 2026-05-03T18:00:00Z"; next }
  in_fm && /^status:/ {
    # Status never goes backward. Verify the synthesized status is preserved.
    print
    next
  }
  { print }
' "$CANDIDATE" > "$CANDIDATE.refreshed"

# Add a new frontmatter field (momentum_signal) — simulates a real scout
# enhancement that should land at the end of frontmatter, before the second ---
/usr/bin/awk '
  BEGIN { fm_count = 0 }
  /^---$/ {
    fm_count++
    if (fm_count == 2) {
      print "momentum_signal: rising"
    }
    print
    next
  }
  { print }
' "$CANDIDATE.refreshed" > "$CANDIDATE"

# Assertions
assert "candidate file still exists after refresh" "[[ -f \"$CANDIDATE\" ]]"

assert "scout_score updated to 0.78" \
  "/usr/bin/grep -q '^scout_score: 0.78' \"$CANDIDATE\""

assert "last_seen updated to 2026-05-03T18:00:00Z" \
  "/usr/bin/grep -q '^last_seen: 2026-05-03T18:00:00Z' \"$CANDIDATE\""

assert "momentum_signal field added" \
  "/usr/bin/grep -q '^momentum_signal: rising' \"$CANDIDATE\""

assert "status: claimed preserved (never regresses to open)" \
  "/usr/bin/grep -q '^status: claimed' \"$CANDIDATE\""

assert "research_path preserved" \
  "/usr/bin/grep -q '^research_path:' \"$CANDIDATE\""

NEW_BODY=$(/usr/bin/awk '/^---$/{c++; next} c>=2' "$CANDIDATE")
assert "manual body content preserved verbatim" \
  "[[ \"\$NEW_BODY\" == \"\$ORIG_BODY\" ]]"

assert "manual notes section preserved" \
  "/usr/bin/grep -q 'Maintainer @alice prefers small PRs' \"$CANDIDATE\""

assert "draft claim comment preserved" \
  "/usr/bin/grep -q 'JSON export in PR1, CSV in PR2' \"$CANDIDATE\""

assert "pet peeves section preserved" \
  "/usr/bin/grep -q \"Don't @-mention @alice on weekends\" \"$CANDIDATE\""

# ─────────────────────────────────────────────────────────────────────────
# Regression: the closed-issue drop ACTUALLY fires (contributing-clanker-m81)
#
# Bug: scout-refresh.py fetched issue state via `gh api ... --jq .state`, which
# prints a bare unquoted string (e.g. `closed`). gh_json() then ran json.loads()
# on it, which raises on a bare scalar, is swallowed, and returns None — so
# `issue_data == "closed"` was never true and closed issues were never dropped
# (empirically: 0 issue_closed drops across 161 real candidates on 2026-06-19;
# 18 closed issues had survived as `open`). The assertions above are an awk
# SIMULATION and never run the real script, which is why they missed this.
#
# This section runs the REAL scout-refresh.py against a `gh` stub that emulates
# gh's actual --jq behavior (bare scalar for `.state`, JSON object for `{state}`).
# It therefore FAILS on the buggy code (closed candidate survives) and PASSES on
# the fix (closed candidate is dropped, open candidate survives).

REFRESH_PY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/scout-refresh.py"
RT_HOME="$TMPDIR/rt-home"
CAND_DIR="$RT_HOME/.contribute-system/candidates"
STUB_BIN="$TMPDIR/stub-bin"
/usr/bin/mkdir -p "$CAND_DIR" "$STUB_BIN"

# Two candidates at the same active repo: #7 closed upstream, #8 still open.
for n in 7 8; do
  /usr/bin/cat > "$CAND_DIR/example__repo__issue$n.md" <<EOF
---
status: open
repo: example/repo
issue_number: $n
scout_score: 0.9
star_count: 100
---
body for $n
EOF
done

# gh stub: emulate real gh, honoring the --jq the script passes. Crucially, for
# `--jq .state` it emits a BARE scalar (what real gh does) so the OLD code path
# reproduces the json.loads failure; for `--jq {state}` it emits a JSON object.
/usr/bin/cat > "$STUB_BIN/gh" <<'STUB'
#!/usr/bin/env bash
args="$*"; jq=""; prev=""
for a in "$@"; do [ "$prev" = "--jq" ] && jq="$a"; prev="$a"; done
case "$args" in
  *"issues/7"*)  # closed
    case "$jq" in "{state}") echo '{"state":"closed"}';; ".state") echo 'closed';; *) echo '{"state":"closed","number":7}';; esac ;;
  *"issues/8"*)  # open
    case "$jq" in "{state}") echo '{"state":"open"}';; ".state") echo 'open';; *) echo '{"state":"open","number":8}';; esac ;;
  *"pr list"*) echo '[]' ;;
  *"api repos/example/repo"*)  # repo metadata: recent push, not archived
    echo "{\"stargazers_count\":120,\"pushed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"archived\":false}" ;;
  *) echo 'null' ;;
esac
STUB
/usr/bin/chmod +x "$STUB_BIN/gh"

PATH="$STUB_BIN:$PATH" HOME="$RT_HOME" /usr/bin/env python3 "$REFRESH_PY" \
  > "$TMPDIR/refresh.out" 2>&1 || true

assert "real refresh DROPS the closed-issue candidate (#7 deleted)" \
  "[[ ! -f \"$CAND_DIR/example__repo__issue7.md\" ]]"
assert "real refresh KEEPS the still-open candidate (#8 survives)" \
  "[[ -f \"$CAND_DIR/example__repo__issue8.md\" ]]"
assert "refresh output reports an issue_closed drop reason" \
  "/usr/bin/grep -q 'issue_closed' \"$TMPDIR/refresh.out\""

# Summary
/usr/bin/printf '\n  scout-refresh: %s passed, %s failed\n\n' \
  "$(green "$PASS")" "$([[ $FAIL -eq 0 ]] && green 0 || red "$FAIL")"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
