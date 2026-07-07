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
# Parallel arrays, NOT "regex|hint" strings: several regexes contain '|'
# alternations, so any delimiter-split silently truncates them into
# unbalanced-paren patterns grep can't compile (fail-open — the worst
# failure class for a safety gate).
# Note: each scanned line is "file:content" (the diff extraction strips the
# leading '+'), so the footer token anchors on ':', not on '^\+'.
declare -a TOKEN_REGEXES=(
  '\bF[0-9]{1,3}\b.{0,40}(finding|audit|issue|catalog)|(finding|audit|issue|catalog).{0,40}\bF[0-9]{1,3}\b'
  'R[123][[:space:]]+(audit|review|deliverable|finding|§)'
  'Intent Solutions (pilot|engagement|delivery|side)'
  'op-rule[[:space:]]*#?[0-9]+'
  'partner=intentsolutions'
  '000-docs/[0-9]+-[A-Z]+-[A-Z]+'
  ':[[:space:]]*-[[:space:]]Jeremy Longshore[[:space:]]*$'
)
declare -a TOKEN_HINTS=(
  'engagement-internal finding ID label'
  'review-phase label (R1/R2/R3)'
  'engagement provenance language'
  'internal op-rule citation'
  'engagement-internal userIntent format'
  'cross-ref to private engagement workspace path'
  'author footer in committed file content (DCO is the signature)'
)

FINDINGS=""
N=0

while IFS= read -r line; do
  for i in "${!TOKEN_REGEXES[@]}"; do
    regex="${TOKEN_REGEXES[$i]}"
    hint="${TOKEN_HINTS[$i]}"
    rc=0
    /usr/bin/printf '%s\n' "$line" | /usr/bin/grep -qE "$regex" || rc=$?
    if [[ $rc -ge 2 ]]; then
      # A gate that cannot evaluate its own rule must go loud, never
      # silently pass — same fail-closed contract as the ERR trap.
      gate_block \
        "gate bug: token regex for '$hint' failed to evaluate (grep exit $rc)" \
        "fix the regex in TOKEN_REGEXES — the gate refuses to pass while blind to one of its own tokens"
    fi
    if [[ $rc -eq 0 ]]; then
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
