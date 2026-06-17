#!/usr/bin/env bats
# Unit tests for gate C26: Go coverage-tool blindspot detection
#
# C26 reads language + local_clone + default_branch from the DOSSIER and branch
# from the CANDIDATE, then diffs <default>...<branch> and inspects Go test
# gating:
#   - new non-test funcs present AND every new test gated (//go:build cgo or
#     `if testing.Short`) with zero ungated tests  → BLOCK
#   - new funcs + ungated tests + some gated signals → WARN
#   - new funcs + no gating signals                  → PASS
#   - not Go / no clone / no new funcs               → SKIP
#
# We build a real Go-ish temp git repo (only the diff text matters; nothing is
# compiled) with refs/remotes/origin/main resolvable, and an inline dossier
# carrying language: Go + local_clone + default_branch: main.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/c26-coverage-readiness.sh"

  CLONE="$(mktemp -d)/repo"
  /usr/bin/git init -q --initial-branch=main "$CLONE"
  /usr/bin/git -C "$CLONE" config user.email "test@example.com"
  /usr/bin/git -C "$CLONE" config user.name  "test"
  echo "package main" > "$CLONE/base.go"
  /usr/bin/git -C "$CLONE" add -A
  /usr/bin/git -C "$CLONE" commit -qm init
  /usr/bin/git -C "$CLONE" update-ref refs/remotes/origin/main main
  /usr/bin/git -C "$CLONE" checkout -qb feat/work

  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
branch: feat/work
---
body
EOF

  DOSSIER=""
}

teardown() {
  rm -f "$CANDIDATE" "${DOSSIER:-}"
  [[ -n "${CLONE:-}" ]] && rm -rf "$(dirname "$CLONE")"
}

# Build an inline dossier with the given language (default Go) pointing at $CLONE.
make_dossier() {
  local lang="${1:-Go}"
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<EOF
---
repo: example-org/example-repo
language: $lang
local_clone: $CLONE
default_branch: main
---
body
EOF
}

commit_branch() {
  /usr/bin/git -C "$CLONE" add -A
  /usr/bin/git -C "$CLONE" commit -qm "feature work"
}

@test "SKIP when dossier language is not Go" {
  make_dossier "TypeScript"
  cat > "$CLONE/feature.go" <<'EOF'
package main
func DoThing() int { return 1 }
EOF
  commit_branch
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "SKIP"
}

@test "SKIP when dossier has no usable local_clone" {
  # local_clone points at a non-git dir -> gate cannot inspect the patch.
  DOSSIER=$(mktemp)
  cat > "$DOSSIER" <<'EOF'
---
repo: example-org/example-repo
language: Go
local_clone: /nonexistent/not-a-clone
default_branch: main
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "SKIP"
}

# NOTE: the gate's "no new functions -> SKIP" branch (around line 55) is
# effectively unreachable. Under `set -o pipefail`, the NEW_FUNCS pipeline
# `grep '^\+func ' | grep -vE '_test\.go' | wc -l` fails closed (BLOCK) when
# either grep yields no matching lines, so any diff that would reach
# NEW_FUNCS==0 trips the ERR trap instead. Documented here rather than tested
# with a tautology; flag for the gate author if that SKIP path matters.

@test "PASS when new func is covered by an ungated test" {
  make_dossier "Go"
  cat > "$CLONE/feature.go" <<'EOF'
package main
func DoThing() int { return 1 }
EOF
  cat > "$CLONE/feature_test.go" <<'EOF'
package main
import "testing"
func TestDoThing(t *testing.T) { if DoThing() != 1 { t.Fail() } }
EOF
  commit_branch
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "PASS"
}

@test "BLOCK when every new test is gated behind //go:build cgo" {
  make_dossier "Go"
  cat > "$CLONE/feature.go" <<'EOF'
package main
func DoThing() int { return 1 }
EOF
  cat > "$CLONE/feature_test.go" <<'EOF'
//go:build cgo
package main
import "testing"
func TestDoThing(t *testing.T) { if DoThing() != 1 { t.Fail() } }
EOF
  commit_branch
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "BLOCK"
}

@test "WARN when new func has both a gated and an ungated test" {
  make_dossier "Go"
  cat > "$CLONE/feature.go" <<'EOF'
package main
func DoThing() int { return 1 }
EOF
  # ungated test file (coverage-visible)
  cat > "$CLONE/feature_test.go" <<'EOF'
package main
import "testing"
func TestDoThingFast(t *testing.T) { if DoThing() != 1 { t.Fail() } }
EOF
  # gated test file (coverage blindspot signal)
  cat > "$CLONE/feature_cgo_test.go" <<'EOF'
//go:build cgo
package main
import "testing"
func TestDoThingCgo(t *testing.T) { if DoThing() != 1 { t.Fail() } }
EOF
  commit_branch
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "open-pr"
  assert_severity "WARN"
}
