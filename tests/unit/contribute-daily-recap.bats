#!/usr/bin/env bats
# Unit tests for contribute-daily-recap.sh — the personal daily recap email.
#
# All tests run --dry-run (prints HTML to stdout, sends nothing) against a
# fixture CONTRIBUTE_STATE_DIR. The contracts under test:
#   - the Action-needed block renders from real state (override events,
#     stale claims)
#   - the fixed event window includes/excludes events at the boundary
#   - a read failure (missing log / nothing parseable) is an ALERT with
#     exit 1 — NEVER a quiet-day heartbeat (two distinct branches)
#   - zero actions + zero window events collapses to the one-line heartbeat
#     with the pipeline count

load 'test_helper'

setup() {
  RECAP="$GATES_DIR/../contribute-daily-recap.sh"
  STATE=$(mktemp -d)
  mkdir -p "$STATE/candidates"
  export CONTRIBUTE_STATE_DIR="$STATE"
}

teardown() {
  rm -rf "$STATE"
  unset CONTRIBUTE_STATE_DIR
}

iso() { # iso <date-adjustment>  e.g. iso "-1 day"
  /usr/bin/date -u -d "$1" +%Y-%m-%dT%H:%M:%SZ
}

@test "Action-needed block renders override count and stale claim" {
  printf '{"ts":"%s","event":"gate_override","details":{"gate":"A05","reason":"test","candidate":"x"}}\n' \
    "$(iso '-1 day')" > "$STATE/log.jsonl"
  cat > "$STATE/candidates/old__claim__issue1.md" <<'EOF'
---
repo: example-org/example-repo
issue_number: 1
status: working
---
body
EOF
  touch -d "10 days ago" "$STATE/candidates/old__claim__issue1.md"

  run "$RECAP" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Action needed"* ]]
  [[ "$output" == *"1 gate override(s) in 7d"* ]]
  [[ "$output" == *"Stale claim"* ]]
  [[ "$output" == *"old__claim__issue1.md"* ]]
}

@test "fixed window includes an in-window event and excludes an out-of-window one" {
  {
    printf '{"ts":"%s","event":"transition_committed","details":{"action":"open→shortlist","candidate":"/tmp/IN-WINDOW.md","new_state":"shortlist"}}\n' "$(iso '-1 day')"
    printf '{"ts":"%s","event":"transition_committed","details":{"action":"open→shortlist","candidate":"/tmp/OUT-WINDOW.md","new_state":"shortlist"}}\n' "$(iso '-3 days')"
  } > "$STATE/log.jsonl"

  run "$RECAP" --dry-run --window=2
  [ "$status" -eq 0 ]
  # Scope to the recap's events section (between its heading and the
  # override-trend heading).
  events_section=$(printf '%s' "$output" | /usr/bin/awk '/Last 2d events/{f=1} /Override trend/{f=0} f')
  [[ "$events_section" == *"IN-WINDOW.md"* ]]
  [[ "$events_section" != *"OUT-WINDOW.md"* ]]
}

@test "missing log.jsonl is an alert with exit 1, never a heartbeat" {
  # No log.jsonl written at all.
  run "$RECAP" --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"ALERT"* ]]
  [[ "$output" != *"Quiet day"* ]]
}

@test "log with zero parseable lines is an alert with exit 1, never a heartbeat" {
  printf 'this is not json\nneither is this\n' > "$STATE/log.jsonl"
  run "$RECAP" --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"ALERT"* ]]
  [[ "$output" != *"Quiet day"* ]]
}

@test "zero actions + zero window events collapses to one-line heartbeat with pipeline count" {
  # One event well outside the window keeps the log valid and non-empty.
  printf '{"ts":"%s","event":"transition_committed","details":{"action":"open→shortlist","candidate":"/tmp/ANCIENT.md","new_state":"shortlist"}}\n' \
    "$(iso '-30 days')" > "$STATE/log.jsonl"
  cat > "$STATE/candidates/fresh__cand__issue2.md" <<'EOF'
---
repo: example-org/example-repo
issue_number: 2
status: shortlist
---
body
EOF

  run "$RECAP" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"quiet day"* ]]
  [[ "$output" == *"Quiet day"* ]]
  [[ "$output" == *"1 active candidate"* ]]
  [[ "$output" != *"Action needed"* ]]
}

@test "malformed historical lines are skipped and surfaced in the proof string" {
  {
    printf 'torn heredoc fragment — not json\n'
    printf '{"ts":"%s","event":"gate_override","details":{"gate":"B13","reason":"t","candidate":"x"}}\n' "$(iso '-1 day')"
  } > "$STATE/log.jsonl"
  run "$RECAP" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 malformed lines skipped"* ]]
}

@test "reviewed fixture is disclosed while a separate identical-reason override still alerts" {
  python3 - "$STATE/log.jsonl" "$GATES_DIR/../reviewed-events.py" <<'PY'
import importlib.util, json, sys
from datetime import datetime, timezone
spec = importlib.util.spec_from_file_location("reviewed", sys.argv[2])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
event = {"ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "event": "gate_override", "details": {"gate": "A05", "reason": "test 2: real override audit", "candidate": "/tmp/known-fixture.md"}}
other = dict(event, details=dict(event["details"], candidate="/tmp/real-work.md"))
review = {"event": "test_event_reviewed", "details": {"classification": "regression_fixture", "target_sha256": module.event_hash(event), "reason": "matched test receipt", "evidence": "hermetic regression"}}
with open(sys.argv[1], "w") as out:
    for entry in [event, other, review]:
        out.write(json.dumps(entry) + "\n")
PY
  run "$RECAP" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 gate override(s) in 7d"* ]]
  [[ "$output" == *"1 reviewed test fixture(s) retained in audit history"* ]]
  run "$GATES_DIR/../audit-overrides.sh" --since=7 --json
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | jq '.[0].overrides')" -eq 1 ]
  [ "$(wc -l < "$STATE/log.jsonl")" -eq 3 ]
}

@test "override trend keeps real overrides after a torn historical log line" {
  printf 'old torn line\n{"ts":"%s","event":"gate_override","details":{"gate":"A05","reason":"real override","candidate":"/tmp/real.md"}}\n' "$(iso '-1 day')" > "$STATE/log.jsonl"
  run "$GATES_DIR/../audit-overrides.sh" --since=7 --json
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | jq '.[0].overrides')" -eq 1 ]
}

@test "malformed review metadata preserves real overrides in recap and audit" {
  printf '{"ts":"%s","event":"gate_override","details":{"gate":"A05","reason":"operator review","candidate":"fixture"}}\n' \
    "$(iso '-1 day')" > "$STATE/log.jsonl"
  cat >> "$STATE/log.jsonl" <<'EOF'
{"event":"test_event_reviewed","details":null}
{"event":"test_event_reviewed","details":{"classification":"regression_fixture","reason":"fixture","evidence":"fixture","target_sha256":[]}}
EOF
  run "$RECAP" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 gate override(s) in 7d"* ]]
  run "$GATES_DIR/../audit-overrides.sh" --since=7 --json
  [ "$status" -eq 0 ]
  [[ "$(printf '%s' "$output" | jq -r '.[0].overrides')" -eq 1 ]]
}
