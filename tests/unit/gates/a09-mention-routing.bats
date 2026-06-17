#!/usr/bin/env bats
# Unit tests for gate A09: @-mentions in claim/PR text when CODEOWNERS routing exists.
#
# Pure parsing — no gh, no git clone. The gate skips unless the dossier advertises
# CODEOWNERS (via policy_files frontmatter OR a "## Policy file inventory" section),
# then WARNs if the relevant draft section contains real @-mentions.

load '../test_helper'

setup() {
  GATE="$GATES_DIR/a09-mention-routing.sh"
}

# Dossier that DOES advertise CODEOWNERS via policy_files frontmatter.
mk_dossier_codeowners() {
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
policy_files: CODEOWNERS, CONTRIBUTING.md
---
body
EOF
  echo "$TMP_DOSSIER"
}

# Dossier with NO CODEOWNERS anywhere.
mk_dossier_no_codeowners() {
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
policy_files: CONTRIBUTING.md
---
body
EOF
  echo "$TMP_DOSSIER"
}

# Candidate whose "## Claim comment draft" section holds the given body text.
mk_candidate_claim() {
  local draft_body="$1"
  TMP_CAND=$(mktemp)
  {
    printf -- '---\nrepo: example-org/example-repo\nissue_number: 42\n---\n\n'
    printf '## Claim comment draft\n\n'
    printf '%s\n' "$draft_body"
  } > "$TMP_CAND"
  echo "$TMP_CAND"
}

teardown() {
  rm -f "$TMP_DOSSIER" "$TMP_CAND" 2>/dev/null || true
}

@test "WARN: @-mention in claim draft when dossier advertises CODEOWNERS" {
  TMP_DOSSIER=$(mk_dossier_codeowners)
  TMP_CAND=$(mk_candidate_claim "Hey @maintainer-bob please take a look, I would like to take this.")
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "post-comment"
  assert_severity "WARN"
}

@test "PASS: no @-mentions in claim draft despite CODEOWNERS" {
  TMP_DOSSIER=$(mk_dossier_codeowners)
  TMP_CAND=$(mk_candidate_claim "I would like to take this and ship a fix.")
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "post-comment"
  assert_severity "PASS"
}

@test "PASS: @me/@everyone/@channel are excluded from the mention count" {
  TMP_DOSSIER=$(mk_dossier_codeowners)
  TMP_CAND=$(mk_candidate_claim "Assign @me — not pinging @everyone or @channel here.")
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "post-comment"
  assert_severity "PASS"
}

@test "SKIP: dossier has no CODEOWNERS" {
  TMP_DOSSIER=$(mk_dossier_no_codeowners)
  TMP_CAND=$(mk_candidate_claim "Hey @maintainer-bob I would like to take this.")
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "post-comment"
  assert_severity "SKIP"
}

@test "SKIP: no dossier supplied" {
  TMP_CAND=$(mk_candidate_claim "Hey @maintainer-bob")
  run_gate "$GATE" "$TMP_CAND" "" "post-comment"
  assert_severity "SKIP"
}

@test "SKIP: CODEOWNERS present but candidate has no matching draft section" {
  TMP_DOSSIER=$(mk_dossier_codeowners)
  TMP_CAND=$(mktemp)
  printf -- '---\nrepo: example-org/example-repo\nissue_number: 42\n---\n\nno draft sections here\n' > "$TMP_CAND"
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "post-comment"
  assert_severity "SKIP"
}

@test "WARN: CODEOWNERS advertised via '## Policy file inventory' section (not frontmatter)" {
  TMP_DOSSIER=$(mktemp)
  cat > "$TMP_DOSSIER" <<'EOF'
---
repo: example-org/example-repo
default_branch: main
---

## Policy file inventory

- **CODEOWNERS** — .github/CODEOWNERS
- **CONTRIBUTING** — CONTRIBUTING.md
EOF
  TMP_CAND=$(mk_candidate_claim "Pinging @reviewer-jane on this one.")
  run_gate "$GATE" "$TMP_CAND" "$TMP_DOSSIER" "post-comment"
  assert_severity "WARN"
}
