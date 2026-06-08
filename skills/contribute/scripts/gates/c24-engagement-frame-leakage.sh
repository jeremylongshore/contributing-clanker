#!/usr/bin/env bash
# Catalog: C24 — Engagement-frame leakage in customer-facing diff
# Mitigates: shipping engagement-internal taxonomy (finding numbers, review
# phase labels, op-rules, pilot provenance, author footers, cross-refs to
# private workspace paths) as if it were common knowledge in a customer-
# facing public artifact. Canonical example: kobiton/automate#70 + the
# 2026-06-03 5-PR cleanup sweep. Maintainers read engagement-frame as
# "this contributor is delivering to their employer, not to my users."
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

LOCAL_CLONE=$(fm_field "$GATE_CANDIDATE_PATH" "local_clone_path")
BRANCH=$(fm_field "$GATE_CANDIDATE_PATH" "branch")

if [[ -z "$LOCAL_CLONE" || ! -d "$LOCAL_CLONE" ]]; then
  gate_skip "no local_clone_path; cannot inspect diff"
fi
if [[ -z "$BRANCH" ]]; then
  gate_skip "no branch in candidate"
fi

DEFAULT_BRANCH="main"
if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
  V=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
  [[ -n "$V" ]] && DEFAULT_BRANCH="$V"
fi

# Pull only the added lines from the diff — engagement-frame the contributor
# is ADDING is what we flag, not lines that were already present upstream.
DIFF_ADDED=$(cd "$LOCAL_CLONE" 2>/dev/null && git diff "origin/$DEFAULT_BRANCH..$BRANCH" 2>/dev/null \
  | /usr/bin/awk '/^\+\+\+ /{file=$2; sub(/^b\//,"",file); next} /^\+[^+]/{print file ":" substr($0,2)}' \
  2>/dev/null || /usr/bin/echo "")

if [[ -z "$DIFF_ADDED" ]]; then
  gate_skip "no diff against origin/$DEFAULT_BRANCH (or git command failed)"
fi

# Tokens that signal engagement-internal content has leaked.
#   Each entry: regex | severity-hint-text
declare -a TOKENS=(
  '\bF[0-9]{1,3}\b.{0,40}(finding|audit|issue|catalog)|((finding|audit|issue|catalog).{0,40}\bF[0-9]{1,3}\b)|engagement-internal finding ID label'
  'R[123][[:space:]]+(audit|review|deliverable|finding|§)|review-phase label (R1/R2/R3)'
  'Intent Solutions (pilot|engagement|delivery|side)|engagement provenance language'
  'op-rule[[:space:]]*#?[0-9]+|internal op-rule citation'
  'partner=intentsolutions|engagement-internal userIntent format'
  '000-docs/[0-9]+-[A-Z]+-[A-Z]+|cross-ref to private engagement workspace path'
  '^\+[[:space:]]*-[[:space:]]Jeremy Longshore[[:space:]]*$|author footer in committed file content (DCO is the signature)'
)

FINDINGS=""
N=0

while IFS= read -r line; do
  for entry in "${TOKENS[@]}"; do
    regex="${entry%%|*}"
    hint="${entry##*|}"
    if echo "$line" | /usr/bin/grep -qE "$regex" 2>/dev/null; then
      FINDINGS+="${line%%:*}: ${hint}"$'\n'
      N=$((N + 1))
      break
    fi
  done
  if [[ $N -ge 10 ]]; then
    FINDINGS+="(stopped at 10 — likely more)"$'\n'
    break
  fi
done <<< "$DIFF_ADDED"

if [[ $N -eq 0 ]]; then
  gate_pass "no engagement-frame tokens in diff"
fi

# Trim trailing newline
FINDINGS="${FINDINGS%$'\n'}"

gate_warn \
  "diff contains $N engagement-frame token(s): $(echo "$FINDINGS" | /usr/bin/head -3 | /usr/bin/tr '\n' ' / ')" \
  "this file is in a public repo. The flagged token suggests engagement-internal context — move to your engagement workspace or rephrase as a behavior description. See references/anti-patterns.md § Engagement-Frame Leakage"
