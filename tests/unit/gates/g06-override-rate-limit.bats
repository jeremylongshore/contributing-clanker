#!/usr/bin/env bats
# Unit tests for gate G06: override rate limit (anti-habituation)
#
# G06 counts `gate_override` events at the candidate's repo in the last 30 days
# from ~/.contribute-system/log.jsonl. ≥3 → BLOCK; else PASS. We isolate the log
# by overriding HOME to a temp dir (same pattern as E02) and plant a synthetic
# log.jsonl. Timestamps must be recent — the gate's window is `date -d '30 days
# ago'` compared via jq fromdateiso8601 — so events are stamped with "now".
# Verdicts:
#   SKIP  — no repo in input
#   PASS  — no log.jsonl yet; or <3 overrides at this repo in 30d
#   BLOCK — ≥3 overrides at this repo in 30d (rate limit hit)

load '../test_helper'

setup() {
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/g06-override-rate-limit.sh"

  REAL_HOME="$HOME"
  TMPHOME=$(mktemp -d)
  mkdir -p "$TMPHOME/.contribute-system"
  NOW_ISO=$(/usr/bin/date -u +%Y-%m-%dT%H:%M:%SZ)
}

teardown() {
  export HOME="$REAL_HOME"
  rm -rf "$TMPHOME"
}

# Run g06 with HOME pointed at the temp dir (so it reads our synthetic log).
# Repo defaults only when the arg is OMITTED; an explicit "" stays empty so the
# no-repo SKIP path can be exercised.
run_gate_g06() {
  local repo="${1-example-org/example-repo}"
  local input_json
  input_json=$(jq -nc \
    --arg candidate "$CANDIDATE" \
    --arg dossier "$DOSSIER" \
    --arg action "shortlist→claimed" \
    --arg repo "$repo" \
    '{candidate: $candidate, dossier: $dossier, action: $action, env: {repo: $repo, branch: ""}}')
  run bash -c "echo '$input_json' | '$GATE' 2>/dev/null"
}

# Append n gate_override events for a given repo at NOW to the temp log.
plant_overrides() {
  local repo="$1" n="$2" gates=(A05 B13 C01 D05 E02 F04)
  local i
  for (( i=0; i<n; i++ )); do
    jq -nc --arg ts "$NOW_ISO" --arg repo "$repo" --arg gate "${gates[i % ${#gates[@]}]}" \
      '{ts:$ts,event:"gate_override",details:{repo:$repo,gate:$gate}}' \
      >> "$TMPHOME/.contribute-system/log.jsonl"
  done
}

@test "PASS when no log.jsonl exists yet" {
  export HOME="$TMPHOME"
  run_gate_g06
  assert_severity "PASS"
}

@test "PASS when fewer than 3 overrides at the repo in 30 days" {
  export HOME="$TMPHOME"
  plant_overrides "example-org/example-repo" 2
  run_gate_g06 "example-org/example-repo"
  assert_severity "PASS"
  echo "$output" | jq -e '.reason | test("2/3 overrides")' >/dev/null
}

@test "BLOCK when 3 overrides at the repo in 30 days (rate limit hit)" {
  export HOME="$TMPHOME"
  plant_overrides "example-org/example-repo" 3
  run_gate_g06 "example-org/example-repo"
  assert_severity "BLOCK"
}

@test "BLOCK when more than 3 overrides at the repo in 30 days" {
  export HOME="$TMPHOME"
  plant_overrides "example-org/example-repo" 5
  run_gate_g06 "example-org/example-repo"
  assert_severity "BLOCK"
}

@test "PASS when 3 overrides exist but all at a DIFFERENT repo" {
  export HOME="$TMPHOME"
  plant_overrides "other-org/other-repo" 3
  run_gate_g06 "example-org/example-repo"
  assert_severity "PASS"
  echo "$output" | jq -e '.reason | test("0/3 overrides")' >/dev/null
}

@test "PASS when 3 overrides exist but they are OUTSIDE the 30-day window" {
  export HOME="$TMPHOME"
  local old_ts="2020-01-01T00:00:00Z"
  local i
  for i in 1 2 3; do
    jq -nc --arg ts "$old_ts" --arg repo "example-org/example-repo" --arg gate "A0$i" \
      '{ts:$ts,event:"gate_override",details:{repo:$repo,gate:$gate}}' \
      >> "$TMPHOME/.contribute-system/log.jsonl"
  done
  run_gate_g06 "example-org/example-repo"
  assert_severity "PASS"
}

@test "PASS when 3 non-override events exist (only gate_override counts)" {
  export HOME="$TMPHOME"
  local i
  for i in 1 2 3; do
    jq -nc --arg ts "$NOW_ISO" --arg repo "example-org/example-repo" \
      '{ts:$ts,event:"gate_run",details:{repo:$repo,verdict:"PASS"}}' \
      >> "$TMPHOME/.contribute-system/log.jsonl"
  done
  run_gate_g06 "example-org/example-repo"
  assert_severity "PASS"
}

@test "SKIP when no repo is present in the input" {
  export HOME="$TMPHOME"
  run_gate_g06 ""
  assert_severity "SKIP"
}
