#!/usr/bin/env bats
# Unit tests for gate C25: maintainer issue/PR URLs in customer-facing prose
#
# C25 reads local_clone_path + branch from the CANDIDATE frontmatter, diffs
# origin/<default_branch>..<branch>, and inspects ADDED lines. It flags GitHub
# issue/PR URLs (or bare owner/repo#N refs) added to customer-facing surfaces
# (agents/*.md, SKILL.md, README*, top-level *.md/*.txt) — but NOT to
# allowed catalog/reference files (references/, CHANGELOG, docs/decisions/,
# .github/, paths containing audit/findings).
#
# We build a real temp git repo, register a refs/remotes/origin/<branch> ref
# so the gate's `git diff origin/<default>..<branch>` resolves, then drive the
# verdict by what the feature branch adds and where.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/c25-maintainer-url-leakage.sh"
  DOSSIER="$FIXTURES_DIR/dossiers/example-org__example-repo.md"  # default_branch: main

  CLONE="$(mktemp -d)/repo"
  /usr/bin/git init -q --initial-branch=main "$CLONE"
  /usr/bin/git -C "$CLONE" config user.email "test@example.com"
  /usr/bin/git -C "$CLONE" config user.name  "test"
  mkdir -p "$CLONE/agents" "$CLONE/references"
  echo "baseline agent prose"   > "$CLONE/agents/device-picker.md"
  echo "baseline readme"        > "$CLONE/README.md"
  echo "baseline limitations"   > "$CLONE/references/known-limitations.md"
  /usr/bin/git -C "$CLONE" add -A
  /usr/bin/git -C "$CLONE" commit -qm init
  # Make origin/main resolve to the base commit.
  /usr/bin/git -C "$CLONE" update-ref refs/remotes/origin/main main
  /usr/bin/git -C "$CLONE" checkout -qb feat/work
}

teardown() {
  rm -f "${CANDIDATE:-}"
  [[ -n "${CLONE:-}" ]] && rm -rf "$(dirname "$CLONE")"
}

make_candidate() {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/example-repo
issue_number: 42
status: working
local_clone_path: $CLONE
branch: feat/work
---
body
EOF
}

commit_branch() {
  /usr/bin/git -C "$CLONE" add -A
  /usr/bin/git -C "$CLONE" commit -qm "feature work"
}

@test "SKIP when candidate has no local_clone_path" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<'EOF'
---
repo: example-org/example-repo
branch: feat/work
status: working
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "SKIP"
}

@test "SKIP when candidate has no branch" {
  CANDIDATE=$(mktemp)
  cat > "$CANDIDATE" <<EOF
---
repo: example-org/example-repo
local_clone_path: $CLONE
status: working
---
body
EOF
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "SKIP"
}

@test "SKIP when branch has no diff against origin/main" {
  # feat/work created but no new commits -> empty diff
  make_candidate
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "SKIP"
}

@test "PASS when added prose has no maintainer issue/PR URLs" {
  printf 'this agent now describes the retry behavior in plain language\n' >> "$CLONE/agents/device-picker.md"
  commit_branch
  make_candidate
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "PASS"
}

@test "PASS when issue URL is added only to an allowed reference file" {
  printf 'tracked upstream: https://github.com/example-org/example-repo/issues/55\n' >> "$CLONE/references/known-limitations.md"
  commit_branch
  make_candidate
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "PASS"
}

@test "WARN when a full issue URL is added to an agent body (customer-facing)" {
  printf 'see https://github.com/example-org/example-repo/issues/42 for the original report\n' >> "$CLONE/agents/device-picker.md"
  commit_branch
  make_candidate
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "WARN"
}

@test "WARN when a full PR URL is added to README" {
  printf 'rationale in https://github.com/example-org/example-repo/pull/99\n' >> "$CLONE/README.md"
  commit_branch
  make_candidate
  run_gate "$GATE" "$CANDIDATE" "$DOSSIER" "working→submitted"
  assert_severity "WARN"
}
