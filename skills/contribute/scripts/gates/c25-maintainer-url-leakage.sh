#!/usr/bin/env bash
# Catalog: C25 — Maintainer issue/PR URLs in customer-facing prose
# Mitigates: shipping maintainer-internal issue tracker URLs in files a
# paying customer or end user reads — agent bodies, SKILL.md workflow
# prose, README user guides, plugin output templates. Same family as
# C24 (engagement-frame leakage) but a distinct failure mode: URLs to
# the maintainer's own issue tracker that the LLM cannot follow and
# the customer doesn't need.
#
# Rule: GitHub issue/PR URLs belong in catalog/reference files where
# "look up the source" is the point (e.g., references/known-limitations.md,
# CHANGELOG.md, docs/decisions/). They DO NOT belong in customer-facing
# prose where behavior description carries the load.
#
# Triggered by: kobiton/automate#67 cleanup pass 2026-06-04 — three
# issue URLs (#33 #36 #55) had drifted into agents/device-picker.md and
# SKILL.md § 2 from the original review-pass commits. URLs read as
# audit trail to a customer, not as customer guidance.
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

# Only added lines (engagement is what the contributor is ADDING).
DIFF_ADDED=$(cd "$LOCAL_CLONE" 2>/dev/null && git diff "origin/$DEFAULT_BRANCH..$BRANCH" 2>/dev/null \
  | /usr/bin/awk '/^\+\+\+ /{file=$2; sub(/^b\//,"",file); next} /^\+[^+]/{print file ":" substr($0,2)}' \
  2>/dev/null || /usr/bin/echo "")

if [[ -z "$DIFF_ADDED" ]]; then
  gate_skip "no diff against origin/$DEFAULT_BRANCH (or git command failed)"
fi

# Files that are LEGITIMATELY about issue references — skip them.
# Pattern: catalog/reference files (known-limitations, CHANGELOG, docs/decisions/*,
# any file with "audit", "findings", "references" in the path).
declare -a ALLOWED_PATHS=(
  'CHANGELOG'
  'known-limitations'
  'docs/decisions/'
  'docs/adr/'
  'audit'
  'findings'
  'references/'
  '\.github/'
)

is_allowed_path() {
  local file="$1"
  for pat in "${ALLOWED_PATHS[@]}"; do
    if echo "$file" | /usr/bin/grep -qE "$pat" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

# Pattern: github.com/<owner>/<repo>/(issues|pull)/<N>
URL_PATTERN='https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(issues|pull)/[0-9]+'

# Also catch the bare repo#NN form when it's clearly an issue ref.
BARE_PATTERN='[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#[0-9]+'

FINDINGS=""
N=0

while IFS= read -r line; do
  file="${line%%:*}"
  content="${line#*:}"

  # Only flag in customer-facing surfaces — agents/, SKILL.md, README*, prose docs.
  # Skip if this file is a legitimate catalog/reference target.
  if is_allowed_path "$file"; then
    continue
  fi

  # Customer-facing surfaces this gate cares about.
  customer_facing=0
  case "$file" in
    agents/*.md|*/agents/*.md) customer_facing=1 ;;
    *SKILL.md) customer_facing=1 ;;
    README*) customer_facing=1 ;;
    *.txt|*.md)
      # Generic markdown — flag only if it's clearly a user-facing surface
      # (heuristic: top-level repo doc, not in references/ or docs/decisions/)
      case "$file" in
        */references/*|*/decisions/*|*/adr/*) ;;
        */*) customer_facing=0 ;;
        *) customer_facing=1 ;;
      esac
      ;;
  esac

  [[ $customer_facing -eq 0 ]] && continue

  if echo "$content" | /usr/bin/grep -qE "$URL_PATTERN" 2>/dev/null; then
    FINDINGS+="${file}: maintainer issue/PR URL in customer-facing prose"$'\n'
    N=$((N + 1))
  elif echo "$content" | /usr/bin/grep -qE "$BARE_PATTERN" 2>/dev/null; then
    # Skip if it looks like a markdown link header [name](path) where path is local
    if ! echo "$content" | /usr/bin/grep -qE '\]\([./]' 2>/dev/null; then
      FINDINGS+="${file}: bare repo#N issue ref in customer-facing prose"$'\n'
      N=$((N + 1))
    fi
  fi

  if [[ $N -ge 10 ]]; then
    FINDINGS+="(stopped at 10 — likely more)"$'\n'
    break
  fi
done <<< "$DIFF_ADDED"

if [[ $N -eq 0 ]]; then
  gate_pass "no maintainer issue/PR URLs in customer-facing prose"
fi

FINDINGS="${FINDINGS%$'\n'}"

gate_warn \
  "diff adds $N maintainer issue/PR URL(s) in customer-facing surface(s): $(echo "$FINDINGS" | /usr/bin/head -3 | /usr/bin/tr '\n' ' / ')" \
  "issue/PR URLs belong in catalog/reference files (references/, CHANGELOG, docs/decisions/) where 'look up the source' is the point. In agent bodies / SKILL.md / README, replace the URL with the behavioral description it points at. See references/anti-patterns.md § Maintainer-URL Leakage."
