#!/usr/bin/env bats
# Unit tests for gate C16: contributor must not merge their own PR
# Trap: self-merging a contribution bypasses the maintainer review that legitimizes it.
#
# PARTIAL coverage — harness limitation:
#   The gate makes TWO gh calls and relies on gh's own server-side --jq to extract
#   a different field from each (`.author.login` from `pr view`, `.login` from
#   `api user`). The shared setup_mock_gh stub returns identical raw stdout for
#   every gh invocation and does NOT apply --jq. So both PR_AUTHOR and ME always
#   resolve to the same value -> only the equal-logins BLOCK path is reachable.
#   The PASS (differing logins) and resolve-failure SKIP paths cannot be exercised
#   without a per-call/jq-aware mock or editing test_helper (out of scope here).
#   The reachable BLOCK trigger and the pre-gh no-pr_number SKIP are tested for real.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/c16-no-self-merge.sh"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
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
  rm -f "${CANDIDATE:-}"
  teardown_mock_gh
}

@test "BLOCK when PR author resolves equal to current user (self-merge attempt)" {
  # Stub returns the same login string for both gh calls -> author == me -> BLOCK.
  setup_mock_gh 'jeremylongshore'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "BLOCK"
}

@test "SKIP when candidate has no pr_number (no PR to evaluate, short-circuits before gh)" {
  NOPR=$(mktemp)
  printf -- '---\nrepo: example-org/example-repo\nissue_number: 42\nstatus: working\n---\nbody\n' > "$NOPR"
  run_gate "$GATE" "$NOPR" "$DOSSIER" "open-pr"
  assert_severity "SKIP"
  rm -f "$NOPR"
}
