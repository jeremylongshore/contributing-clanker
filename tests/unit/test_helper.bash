# test_helper.bash — shared setup for bats unit tests on gate scripts
#
# Usage at the top of each .bats file:
#   load '../test_helper'
#
# Provides:
#   - GATES_DIR: path to bundled gate scripts under test
#   - FIXTURES_DIR: path to test fixtures (candidates, dossiers)
#   - run_gate <gate-script> <candidate-path> <dossier-path> [action] [repo]
#       runs a gate with stdin JSON, captures stdout
#   - mock_gh: stub function — sets PATH to override gh with a fake
#   - assert_severity <expected> — asserts the gate's verdict severity matches

# shellcheck disable=SC2034
GATES_DIR="${HOME}/.claude/skills/contribute/scripts/gates"
FIXTURES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../fixtures" && pwd)"

# Run a gate with the standard stdin JSON contract.
# Captures stdout into $output (bats convention) and exit code into $status.
run_gate() {
  local gate="$1" candidate="$2" dossier="${3:-}" action="${4:-shortlist→claimed}" repo="${5:-example-org/example-repo}"

  local input_json
  input_json=$(jq -nc \
    --arg candidate "$candidate" \
    --arg dossier "$dossier" \
    --arg action "$action" \
    --arg repo "$repo" \
    '{candidate: $candidate, dossier: $dossier, action: $action, env: {repo: $repo, branch: ""}}')

  run bash -c "echo '$input_json' | '$gate'"
}

# Set up a stub gh on PATH that returns the value of $MOCK_GH_OUTPUT.
# Each test that needs gh stubbing must call: setup_mock_gh "fake stdout" [exit_code]
setup_mock_gh() {
  local stub_out="$1" stub_exit="${2:-0}"
  MOCK_BIN="$(mktemp -d)"
  # Write stub stdout to a sidecar file so we don't have to worry about
  # quoting JSON characters when generating the wrapper script.
  printf '%s' "$stub_out" > "$MOCK_BIN/gh.stdout"
  cat > "$MOCK_BIN/gh" <<EOF
#!/usr/bin/env bash
cat "$MOCK_BIN/gh.stdout"
exit $stub_exit
EOF
  chmod +x "$MOCK_BIN/gh"
  PATH="$MOCK_BIN:$PATH"
  export PATH
}

teardown_mock_gh() {
  if [[ -n "${MOCK_BIN:-}" && -d "$MOCK_BIN" ]]; then
    rm -rf "$MOCK_BIN"
    unset MOCK_BIN
  fi
}

# Parse the gate's JSON stdout and assert the severity field.
# Usage: assert_severity PASS / WARN / BLOCK / INFORM / SKIP
assert_severity() {
  local expected="$1"
  local actual
  actual=$(echo "$output" | jq -r '.severity' 2>/dev/null)
  [[ "$actual" == "$expected" ]] || {
    echo "expected severity: $expected"
    echo "actual severity:   $actual"
    echo "full output:       $output"
    return 1
  }
}
