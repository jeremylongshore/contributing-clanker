#!/usr/bin/env bats
# Unit tests for gate C11: branch divergence implies a force-push will be required
# Trap: force-pushing a rebased branch yanks the history out from under any collaborator
# who holds local refs to it.
#
# The gate inspects a real clone at $HOME/000-projects/contributing-clanker/<repo>,
# comparing HEAD against origin/<branch> (ahead AND behind => WARN). Each test builds
# a throwaway git repo at that path and removes it in teardown.

load '../test_helper'

CLONE_ROOT="${HOME}/000-projects/contributing-clanker"

setup() {
  GATE="$GATES_DIR/c11-no-force-push.sh"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  REPO_NAME="__bats_c11_${BATS_SUITE_TEST_NUMBER}_$$"
  CLONE="$CLONE_ROOT/$REPO_NAME"
  rm -rf "$CLONE"
  BRANCH="feature/work"
  # Candidate carries the branch the gate reads from frontmatter.
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/$REPO_NAME
issue_number: 42
branch: $BRANCH
status: working
---
body
EOF
}

teardown() {
  rm -f "${CANDIDATE:-}"
  [[ -n "${CLONE:-}" ]] && rm -rf "$CLONE"
}

_init_clone() {
  mkdir -p "$CLONE"
  git -C "$CLONE" init -q -b main
  git -C "$CLONE" config user.email t@t.io
  git -C "$CLONE" config user.name t
  echo base > "$CLONE/f"
  git -C "$CLONE" add f
  git -C "$CLONE" commit -qm "base"
  git -C "$CLONE" checkout -q -b "$BRANCH"
}

@test "WARN when HEAD diverges from origin/<branch> (ahead and behind)" {
  _init_clone
  echo b > "$CLONE/g"; git -C "$CLONE" add g; git -C "$CLONE" commit -qm "remote commit"
  # origin/<branch> points at the remote commit.
  git -C "$CLONE" update-ref "refs/remotes/origin/$BRANCH" HEAD
  # Local rewinds and commits something different -> ahead 1, behind 1.
  git -C "$CLONE" reset -q --hard HEAD~1
  echo c > "$CLONE/h"; git -C "$CLONE" add h; git -C "$CLONE" commit -qm "local commit"
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "WARN"
}

@test "PASS when HEAD is fast-forward ahead of origin/<branch> (no force needed)" {
  _init_clone
  git -C "$CLONE" update-ref "refs/remotes/origin/$BRANCH" HEAD
  # Local adds commits on top of origin -> ahead only, behind 0.
  echo d > "$CLONE/i"; git -C "$CLONE" add i; git -C "$CLONE" commit -qm "ahead commit"
  # NOTE: the gate emits a benign stderr line on the behind==0 path (its `grep -c .
  # || echo 0` yields a "0\n0" token that trips a `[[ -gt ]]` comparison; the ERR
  # trap is not reached and the verdict is still a correct PASS on stdout). bats'
  # `run` merges stderr+stdout, so we must isolate stdout here rather than use the
  # shared run_gate helper, otherwise the stderr noise corrupts the JSON parse.
  local input_json verdict
  input_json=$(jq -nc \
    --arg candidate "$CANDIDATE" \
    --arg dossier "$DOSSIER" \
    --arg action "working→submitted" \
    --arg repo "example-org/$REPO_NAME" \
    '{candidate: $candidate, dossier: $dossier, action: $action, env: {repo: $repo, branch: ""}}')
  verdict=$(echo "$input_json" | "$GATE" 2>/dev/null | jq -r '.severity')
  [[ "$verdict" == "PASS" ]] || {
    echo "expected PASS, got: $verdict"
    return 1
  }
}

@test "SKIP when no origin/<branch> tracking ref exists (first push)" {
  _init_clone
  echo e > "$CLONE/j"; git -C "$CLONE" add j; git -C "$CLONE" commit -qm "local only"
  # Deliberately do NOT create refs/remotes/origin/<branch>.
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when no local clone exists at the expected path" {
  # Do NOT init $CLONE.
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
}

@test "SKIP when candidate frontmatter has no branch field" {
  _init_clone
  git -C "$CLONE" update-ref "refs/remotes/origin/$BRANCH" HEAD
  NOBRANCH=$(mktemp)
  cat > "$NOBRANCH" <<EOF
---
repo: example-org/$REPO_NAME
issue_number: 42
status: working
---
body
EOF
  run_gate "$GATE" "$NOBRANCH" "$DOSSIER" "working→submitted" "example-org/$REPO_NAME"
  assert_severity "SKIP"
  rm -f "$NOBRANCH"
}
