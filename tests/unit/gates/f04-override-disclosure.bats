#!/usr/bin/env bats
# Unit tests for gate F04: safety-override disclosure in the PR body
#
# F04 is pure candidate-file logic — no gh, no git clone, no log. It reads the
# `overrides:` block from candidate frontmatter and the `## PR body` section,
# then is meant to enforce a `## Safety override disclosure` section naming every
# overridden gate ID.
#
# Reachable verdicts (covered below):
#   PASS   — no overrides used (nothing to disclose)
#   INFORM — overrides used but no `## PR body` content drafted yet
#   BLOCK  — overrides used, PR body drafted, no disclosure section
#
# KNOWN GATE BUG / unreachable branches (documented, not force-tested):
#   The gate extracts PR_BODY as the lines strictly between `## PR body` and the
#   NEXT `## ` heading (awk: /^## PR body/{flag=1;next} /^## /{flag=0} flag).
#   It then greps PR_BODY for `^## (Safety override|Override) disclosure`. But a
#   `## Safety override disclosure` heading is itself a `## ` line, so it always
#   TERMINATES the PR_BODY capture and is never contained in PR_BODY. Placing the
#   disclosure immediately after `## PR body` yields an EMPTY PR_BODY → the gate
#   reports INFORM ("no PR body drafted yet"). Consequently the gate's
#   "disclosure section present" code path — both the all-IDs-named PASS and the
#   missing-ID BLOCK — cannot fire through any normal sectioned candidate file.
#   These two branches are intentionally NOT asserted here; doing so would
#   require a candidate the system never produces. Filed as a gate-logic finding.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/f04-override-disclosure.sh"
}

teardown() {
  rm -f "${TMP_CAND:-}" 2>/dev/null || true
}

@test "PASS when candidate has no overrides block" {
  TMP_CAND=$(mktemp)
  cat > "$TMP_CAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
---

## PR title
fix: thing

## PR body
A normal PR with no overrides.

## Test results
all pass
EOF
  run_gate "$GATE" "$TMP_CAND" "" "working→submitted" "example-org/example-repo"
  assert_severity "PASS"
}

@test "INFORM when overrides used but no PR body drafted yet" {
  TMP_CAND=$(mktemp)
  cat > "$TMP_CAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: working
overrides:
  - gate: A05 reason: issue reopened by maintainer
status_note: pre-PR
---

## Scope
fix the thing
EOF
  run_gate "$GATE" "$TMP_CAND" "" "claimed→working" "example-org/example-repo"
  assert_severity "INFORM"
  # Override count (1) must surface in the reason.
  echo "$output" | jq -e '.reason | test("1 overrides")' >/dev/null
}

@test "BLOCK when overrides used, PR body drafted, but disclosure section absent" {
  TMP_CAND=$(mktemp)
  cat > "$TMP_CAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
overrides:
  - gate: A05 reason: issue reopened by maintainer
status_note: ready
---

## PR title
fix: thing

## PR body
This PR fixes a thing. I forgot to disclose my overrides.

## Test results
all pass
EOF
  run_gate "$GATE" "$TMP_CAND" "" "working→submitted" "example-org/example-repo"
  assert_severity "BLOCK"
  echo "$output" | jq -e '.reason | test("Safety override disclosure")' >/dev/null
}

@test "BLOCK reports the override count when disclosure is absent" {
  # Two overrides, PR body present, no disclosure section → BLOCK naming the count.
  TMP_CAND=$(mktemp)
  cat > "$TMP_CAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
overrides:
  - gate: A05 reason: issue reopened by maintainer
  - gate: B13 reason: scope pre-approved in design issue
status_note: ready
---

## PR title
fix: thing

## PR body
This PR fixes a thing.

## Test results
all pass
EOF
  run_gate "$GATE" "$TMP_CAND" "" "working→submitted" "example-org/example-repo"
  assert_severity "BLOCK"
  echo "$output" | jq -e '.reason | test("2 safety overrides")' >/dev/null
}
