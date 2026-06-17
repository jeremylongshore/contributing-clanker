#!/usr/bin/env bats
# Unit tests for gate A04: issue is too old (stale / abandoned / zombie).
#
# The gate's gh call is:
#   gh issue view N --json createdAt,updatedAt,comments \
#      --jq '{createdAt, updatedAt, last_comment_at: (.comments|sort_by(.createdAt)|.[-1].createdAt // null)}'
# so the bats mock returns that post-jq object directly. We feed dynamic dates
# (computed relative to now) so the tests stay correct as wall-clock advances.
#
# Verdict order (each emits-and-exits):
#   AGE > 365            → BLOCK (zombie)
#   AGE > MAX(180)       → BLOCK (stale)
#   SILENCE > 90         → WARN  (fresh but silent)
#   AGE > 90             → WARN  (aging)
#   else                 → PASS

load '../test_helper'

setup() {
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/a04-issue-age.sh"
}

teardown() {
  teardown_mock_gh
}

# ISO-8601 UTC timestamp for N days ago.
ago() { /usr/bin/date -u -d "$1 days ago" +%Y-%m-%dT%H:%M:%SZ; }

# Build the post-jq metadata object the gate expects on stdin from gh.
meta() {
  local created="$1" updated="$2" last_comment="$3"
  jq -nc --arg c "$created" --arg u "$updated" --arg l "$last_comment" \
    '{createdAt: $c, updatedAt: $u, last_comment_at: ($l | if . == "null" then null else . end)}'
}

@test "PASS when issue is fresh and recently active" {
  setup_mock_gh "$(meta "$(ago 10)" "$(ago 5)" "$(ago 5)")"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "PASS"
}

@test "WARN when issue is aging (91-180 days) but recently active" {
  setup_mock_gh "$(meta "$(ago 120)" "$(ago 10)" "$(ago 10)")"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "WARN"
}

@test "WARN when issue is fresh but has long silence (no activity timestamps)" {
  # Empty updatedAt + null last_comment → LATEST_ACT_EPOCH=0 → silence huge.
  setup_mock_gh "$(meta "$(ago 10)" "" "null")"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "WARN"
}

@test "BLOCK when issue is stale (past the 180d default max)" {
  setup_mock_gh "$(meta "$(ago 200)" "$(ago 5)" "$(ago 5)")"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "BLOCK"
}

@test "BLOCK when issue is a zombie (over 365d)" {
  setup_mock_gh "$(meta "$(ago 400)" "$(ago 400)" "null")"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "BLOCK"
}

@test "SKIP when candidate has no issue_number" {
  TMPCAND=$(mktemp); printf -- '---\nrepo: foo/bar\n---\nbody\n' > "$TMPCAND"
  setup_mock_gh "$(meta "$(ago 10)" "$(ago 5)" "null")"
  run_gate "$GATE" "$TMPCAND" "$DOSSIER"
  assert_severity "SKIP"
  rm -f "$TMPCAND"
}

@test "SKIP when gh returns empty metadata" {
  setup_mock_gh ""
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER"
  assert_severity "SKIP"
}
