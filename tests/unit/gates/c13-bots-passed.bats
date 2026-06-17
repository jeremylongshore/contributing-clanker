#!/usr/bin/env bats
# Unit tests for gate C13: required review bots must have engaged on the PR before flip-to-ready
# Trap: flipping a PR to ready-for-review before the repo's mandatory bots weigh in wastes a
# human review cycle on something the bots would have flagged.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/c13-bots-passed.sh"
  # Dossier that requires two review bots.
  BOTS_DOSSIER=$(mktemp)
  cat > "$BOTS_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
review_bots:
  - coderabbitai
  - greptile-apps
---
body
EOF
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 123
status: submitted
---
body
EOF
}

teardown() {
  rm -f "${CANDIDATE:-}" "${BOTS_DOSSIER:-}"
  teardown_mock_gh
}

@test "PASS when every required bot has engaged on the PR" {
  setup_mock_gh 'coderabbitai,greptile-apps,octocat'
  run_gate "$GATE" "$CANDIDATE" "$BOTS_DOSSIER" "flip-to-ready"
  assert_severity "PASS"
}

@test "WARN when a required bot has not yet engaged" {
  setup_mock_gh 'coderabbitai,octocat'
  run_gate "$GATE" "$CANDIDATE" "$BOTS_DOSSIER" "flip-to-ready"
  assert_severity "WARN"
}

@test "SKIP when candidate has no pr_number" {
  NOPR=$(mktemp)
  printf -- '---\nrepo: example-org/example-repo\nissue_number: 42\nstatus: working\n---\nbody\n' > "$NOPR"
  setup_mock_gh 'coderabbitai,greptile-apps'
  run_gate "$GATE" "$NOPR" "$BOTS_DOSSIER" "flip-to-ready"
  assert_severity "SKIP"
  rm -f "$NOPR"
}

@test "SKIP when dossier lists only the (none detected) sentinel" {
  NONEDOSS=$(mktemp)
  cat > "$NONEDOSS" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
review_bots:
  - (none detected)
---
body
EOF
  setup_mock_gh ''
  run_gate "$GATE" "$CANDIDATE" "$NONEDOSS" "flip-to-ready"
  assert_severity "SKIP"
  rm -f "$NONEDOSS"
}
