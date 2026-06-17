#!/usr/bin/env bats
# Unit tests for gate C27: sibling-issue scan (root-cause detection)
#
# C27 only runs pre-open-pr. It (1) fetches the target issue title via
# `gh api`, (2) extracts a keyword, (3) counts sibling open issues on that
# keyword via `gh search issues`, (4) counts recent maintainer
# Reconsider/RFC/Discuss issues via a second `gh search issues`.
#   - SIBLING_COUNT >= 3  → WARN
#   - RECONSIDER_COUNT >= 1 → WARN
#   - otherwise            → PASS
#
# The shared setup_mock_gh stub returns one fixed payload for EVERY gh call,
# which can't drive these branches independently (the title fetch and both
# searches would all see the same blob). So this file installs an
# argument-aware mock gh that returns different JSON for `api` vs the two
# `search issues` variants (sibling vs Reconsider/RFC/Discuss).

load '../test_helper'

setup() {
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/c27-sibling-issue-scan.sh"

  TMPCAND=$(mktemp)
  cat > "$TMPCAND" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---
body
EOF
  CANDIDATE="$TMPCAND"

  MOCK_BIN=""
}

teardown() {
  rm -f "$CANDIDATE"
  if [[ -n "${MOCK_BIN:-}" && -d "$MOCK_BIN" ]]; then
    rm -rf "$MOCK_BIN"
  fi
}

# Install an argument-aware mock gh.
#   $1 = title returned by `gh api .../issues/N`
#   $2 = JSON array returned by the sibling `gh search issues <keyword>`
#   $3 = JSON array returned by the Reconsider/RFC/Discuss `gh search issues`
install_mock_gh() {
  local title="$1" sibling_json="$2" reconsider_json="$3"
  MOCK_BIN="$(mktemp -d)"
  printf '%s' "$title"          > "$MOCK_BIN/title.out"
  printf '%s' "$sibling_json"   > "$MOCK_BIN/sibling.out"
  printf '%s' "$reconsider_json" > "$MOCK_BIN/reconsider.out"
  cat > "$MOCK_BIN/gh" <<EOF
#!/usr/bin/env bash
args="\$*"
if [[ "\$1" == "api" ]]; then
  cat "$MOCK_BIN/title.out"
elif [[ "\$args" == *Reconsider* ]]; then
  cat "$MOCK_BIN/reconsider.out"
else
  cat "$MOCK_BIN/sibling.out"
fi
exit 0
EOF
  chmod +x "$MOCK_BIN/gh"
  PATH="$MOCK_BIN:$PATH"
  export PATH
}

@test "SKIP when action is not open-pr" {
  install_mock_gh "throttle export bug" '[]' '[]'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "shortlist→claimed"
  assert_severity "SKIP"
}

@test "SKIP when candidate has no issue_number" {
  TMPCAND2=$(mktemp)
  printf -- '---\nrepo: example-org/example-repo\nstatus: working\n---\nbody\n' > "$TMPCAND2"
  install_mock_gh "throttle export bug" '[]' '[]'
  run_gate "$GATE" "$TMPCAND2" "$DOSSIER" "open-pr"
  assert_severity "SKIP"
  rm -f "$TMPCAND2"
}

@test "PASS when keyword has fewer than 3 siblings and no reframe issues" {
  install_mock_gh "throttle export drops records" \
    '[{"number":99,"title":"throttle unrelated"}]' \
    '[]'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "PASS"
}

@test "WARN when 3+ sibling open issues share the keyword" {
  install_mock_gh "throttle export drops records" \
    '[{"number":50,"title":"throttle a"},{"number":51,"title":"throttle b"},{"number":52,"title":"throttle c"}]' \
    '[]'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "WARN"
}

@test "WARN when a maintainer Reconsider/RFC/Discuss issue exists (no siblings)" {
  install_mock_gh "throttle export drops records" \
    '[]' \
    '[{"number":4062,"title":"Reconsider the default throttle behavior"}]'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "WARN"
}

@test "INFORM when target issue title cannot be fetched" {
  install_mock_gh "" '[]' '[]'
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "INFORM"
}
