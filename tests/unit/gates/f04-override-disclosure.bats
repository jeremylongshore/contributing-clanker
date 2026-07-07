#!/usr/bin/env bats
# Unit tests for gate F04: safety-override disclosure in the PR body
#
# F04 is pure candidate-file logic — no gh, no git clone, no log. It reads the
# `overrides:` block from candidate frontmatter and the `## PR body` section,
# then is meant to enforce a `## Safety override disclosure` section naming every
# overridden gate ID.
#
# Verdicts covered below:
#   PASS   — no overrides used (nothing to disclose)
#   PASS   — disclosure section names every overridden gate ID
#   INFORM — overrides used but no `## PR body` content drafted yet
#   BLOCK  — overrides used, PR body drafted, no disclosure section
#   BLOCK  — disclosure section present but an override ID is missing from it
#
# History: the PASS-disclosed and missing-ID-BLOCK branches were dead code
# until the capture fix — PR_BODY was extracted up to the NEXT `## ` heading,
# and `## Safety override disclosure` is itself a `## ` line, so the disclosure
# could never appear inside PR_BODY. The capture now stops only at KNOWN
# candidate-file sections, treating everything else as PR-body content. The
# gate ID extraction is also case-insensitive now: a lowercase `gate: a05`
# used to crash the gate (uppercase-only \K class → grep exit 1 → ERR trap),
# and the tempting `|| true` patch would have silently SKIPPED the override
# from the check entirely (fail-open). The lowercase fixture below proves
# lowercase overrides are still DETECTED, guarding against that flip.

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

@test "PASS when the disclosure section names every overridden gate ID" {
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
This PR fixes a thing.

## Safety override disclosure
- A05: issue reopened by maintainer, confirmed in comment thread

## Test results
all pass
EOF
  run_gate "$GATE" "$TMP_CAND" "" "working→submitted" "example-org/example-repo"
  assert_severity "PASS"
}

@test "BLOCK names the missing gate ID when the disclosure section omits one" {
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

## Safety override disclosure
- A05: issue reopened by maintainer

## Test results
all pass
EOF
  run_gate "$GATE" "$TMP_CAND" "" "working→submitted" "example-org/example-repo"
  assert_severity "BLOCK"
  echo "$output" | jq -e '.reason | test("B13")' >/dev/null
}

@test "lowercase gate IDs are still detected (guards the fail-open flip)" {
  # A lowercase override that is NOT disclosed must BLOCK and name the ID —
  # never crash, and never be silently skipped from the check.
  TMP_CAND=$(mktemp)
  cat > "$TMP_CAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: submitted
overrides:
  - gate: a05 reason: issue reopened by maintainer
status_note: ready
---

## PR title
fix: thing

## PR body
This PR fixes a thing.

## Safety override disclosure
- B99: some other override entirely

## Test results
all pass
EOF
  run_gate "$GATE" "$TMP_CAND" "" "working→submitted" "example-org/example-repo"
  assert_severity "BLOCK"
  echo "$output" | jq -e '.reason | test("a05")' >/dev/null
}
