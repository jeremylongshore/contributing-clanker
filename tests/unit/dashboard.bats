#!/usr/bin/env bats
# Unit tests for dashboard.sh — the /contribute ASCII status dashboard.
#
# Covers: exit status, section presence, funnel-count correctness against a
# fixture state dir, suggested-next title extraction (h1 preferred, owner/repo
# prefix stripped), and the load-bearing ALIGNMENT INVARIANT — every framed
# content row must have an identical byte length even when upstream titles
# carry multibyte chars (the em-dash drift bug this script was hardened against).

DASH="${HOME}/.claude/skills/contribute/scripts/dashboard.sh"

setup() {
  STATE_DIR="$(mktemp -d)"
  mkdir -p "$STATE_DIR/candidates" "$STATE_DIR/research"
  : > "$STATE_DIR/log.jsonl"
  export CONTRIBUTE_STATE_DIR="$STATE_DIR"

  # open candidate with an em-dash in its h1 title (the multibyte stressor)
  cat > "$STATE_DIR/candidates/foo__bar__issue12.md" <<'EOF'
---
repo: foo/bar
issue_number: 12
status: open
scout_score: 0.90
---
# foo/bar #12 — Fix the flaky widget
## Why scout flagged this
because.
EOF

  # merged candidate
  cat > "$STATE_DIR/candidates/foo__bar__issue7.md" <<'EOF'
---
repo: foo/bar
issue_number: 7
status: merged
merged_at: 2026-06-01T00:00:00Z
---
# foo/bar #7 — Already shipped
EOF

  # working candidate (in flight)
  cat > "$STATE_DIR/candidates/baz__qux__issue3.md" <<'EOF'
---
repo: baz/qux
issue_number: 3
status: working
last_refreshed: 2026-06-10T00:00:00Z
---
# baz/qux #3 — Half-done work
EOF
}

teardown() {
  [[ -n "${STATE_DIR:-}" && -d "$STATE_DIR" ]] && rm -rf "$STATE_DIR"
}

@test "exits 0 and prints the framed dashboard" {
  run "$DASH"
  [ "$status" -eq 0 ]
  [[ "${lines[0]}" == ┌* ]]
  [[ "${lines[${#lines[@]}-1]}" == └* ]]
}

@test "renders every section header" {
  run "$DASH"
  [[ "$output" == *"PIPELINE"* ]]
  [[ "$output" == *"IN FLIGHT"* ]]
  [[ "$output" == *"SHIPPED"* ]]
  [[ "$output" == *"SUGGESTED NEXT"* ]]
  [[ "$output" == *"TIMELINE"* ]]
}

@test "funnel counts match the fixture (1 open, 1 merged, 1 working)" {
  run "$DASH"
  [[ "$output" == *"open 1"* ]]
  [[ "$output" == *"working 1"* ]]
  [[ "$output" == *"merged 1"* ]]
}

@test "suggested-next prefers the h1 title and strips the owner/repo prefix" {
  run "$DASH"
  # ref appears, and the title is the post-prefix text — NOT the '## Why scout flagged' h2
  [[ "$output" == *"foo/bar#12"* ]]
  [[ "$output" == *"Fix the flaky widget"* ]]
  [[ "$output" != *"Why scout flagged"* ]]
}

@test "in-flight lists the working candidate" {
  run "$DASH"
  [[ "$output" == *"baz/qux#3"* ]]
}

@test "ALIGNMENT: every framed content row has identical byte length" {
  run "$DASH"
  [ "$status" -eq 0 ]
  # Content rows begin with the vertical bar glyph. Content is padded to a fixed
  # ASCII width, so each such row must be byte-identical in length regardless of
  # the (multibyte) titles inside. Count distinct byte-lengths — must be exactly 1.
  local distinct
  distinct=$(printf '%s\n' "$output" \
    | LC_ALL=C grep '^│' \
    | LC_ALL=C awk '{ print length }' \
    | sort -u | wc -l)
  [ "$distinct" -eq 1 ]
}

@test "handles an empty state dir without erroring" {
  rm -f "$STATE_DIR"/candidates/*.md
  : > "$STATE_DIR/log.jsonl"
  run "$DASH"
  [ "$status" -eq 0 ]
  [[ "$output" == *"(nothing in flight)"* ]]
}

@test "--no-box mode exits 0 and drops the frame" {
  run "$DASH" --no-box
  [ "$status" -eq 0 ]
  [[ "${lines[0]}" != ┌* ]]
}
