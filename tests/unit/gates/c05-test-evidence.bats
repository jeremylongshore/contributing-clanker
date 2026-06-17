#!/usr/bin/env bats
# Unit tests for gate C05: PR body must carry fenced test-runner output (local-verification evidence)
# Trap: a PR claiming "tests pass" with no pasted output reads as unverified AI slop.

load '../test_helper'

setup() {
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"
  GATE="$GATES_DIR/c05-test-evidence.sh"
}

teardown() {
  rm -f "${CANDIDATE:-}"
}

@test "PASS when PR body has a fenced block with test-runner output" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 7
status: submitted
---
## PR body

Fixes the thing.

```
$ pnpm test
Test Suites: 3 passed, 3 total
12 passed
```
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "PASS"
}

@test "BLOCK when PR body has a fenced block but no test-runner signal" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 7
status: submitted
---
## PR body

Here is the patch:

```
const x = 1;
return x + 2;
```
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "BLOCK"
}

@test "BLOCK when PR body has prose but no fenced code block at all" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
pr_number: 7
status: submitted
---
## PR body

I ran the tests locally and they all passed, trust me.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "BLOCK"
}

@test "SKIP when candidate has no '## PR body' section" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
issue_number: 42
status: working
---
## Scope

Just the scope, no PR body yet.
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "SKIP"
}
