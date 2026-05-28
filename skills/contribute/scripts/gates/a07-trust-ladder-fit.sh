#!/usr/bin/env bash
# Catalog: A7 — Trust-ladder fit (intent vs. user's prior-merges rung at this repo)
#
# A contributor's (N+1)th PR to a repo is constrained by their N prior
# merges. The audit of oven-sh/bun#30903 (Dicklesworthstone's UB-exorcism
# audit-PR: 983 files, +122K, 0 prior merges in Bun, 3 thumbs down, no
# maintainer review in 11 days) is the canonical failure of trust-ladder
# skipping: a contributor with no shipped fixes in the repo opens a giant
# umbrella narrative that requires the maintainer to trust the contributor
# across N findings before they've earned trust across 1.
#
# Rungs (read from dossier field `merged_prs_by_user`):
#   rung 0  (0 merges)   : MUST have an attached issue_number (no umbrella)
#                         BLOCK if no issue, BLOCK if candidate marks itself
#                         as an umbrella proposal
#   rung 1  (1-3 merges) : WARN on umbrella, allow if intent is single-issue
#   rung 4+ (4+ merges)  : PASS — contributor has earned umbrella trust
#
# Per-repo opt-out: dossier `trust_ladder_threshold: N` lifts rung 0 to
# allow umbrella PRs from contributors with at least N merges, for repos
# whose maintainers explicitly invite first-time umbrella narratives.
# Defaults to 1 if absent (matches the published rule).
#
# Per-repo dossier signal: `trust_ladder_disabled: true` skips entirely.
# Use only for repos where the maintainer has communicated "size doesn't
# matter, just ship."
#
# Fires at phases A (shortlist→claimed, claimed→working). Size enforcement
# at PR-submit time is the sibling b13-trust-ladder-size gate.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

# Per-repo opt-out
if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
  DISABLED=$(fm_field "$GATE_DOSSIER_PATH" "trust_ladder_disabled")
  if [[ "$DISABLED" == "true" ]]; then
    gate_skip "trust_ladder_disabled: true in dossier"
  fi
fi

# Read merged_prs_by_user from dossier. Missing field = we don't know the
# rung; SKIP with a refresh hint rather than fail-closed (dossiers built
# before this gate landed legitimately won't have the field).
MERGED_COUNT=""
if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
  MERGED_COUNT=$(fm_field "$GATE_DOSSIER_PATH" "merged_prs_by_user")
fi

if [[ -z "$MERGED_COUNT" ]]; then
  gate_skip "no merged_prs_by_user field in dossier — refresh dossier to populate"
fi

if ! [[ "$MERGED_COUNT" =~ ^[0-9]+$ ]]; then
  gate_skip "merged_prs_by_user is not numeric ($MERGED_COUNT) — refresh dossier"
fi

# Per-repo threshold lift (default 1 = stock rule)
THRESHOLD=1
if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
  V=$(fm_field "$GATE_DOSSIER_PATH" "trust_ladder_threshold")
  [[ "$V" =~ ^[0-9]+$ ]] && THRESHOLD="$V"
fi

# Read candidate fields
ISSUE_NUM=$(fm_field "$GATE_CANDIDATE_PATH" "issue_number")
SCOPE_INTENT=$(fm_field "$GATE_CANDIDATE_PATH" "scope_intent")

# scope_intent values we recognize:
#   single-issue     — addresses one tracked issue
#   single-fix       — addresses one untracked finding (no issue, but bounded)
#   umbrella         — multi-finding audit / multi-area refactor / large proposal
#   design-discussion — Design Issue, not a code PR (always allowed regardless of rung)
case "$SCOPE_INTENT" in
  design-discussion)
    gate_pass "scope_intent=design-discussion bypasses the ladder (Design Issues are always OK)"
    ;;
  umbrella)
    if [[ "$MERGED_COUNT" -lt "$THRESHOLD" ]]; then
      gate_block \
        "rung 0 contributor ($MERGED_COUNT merged PRs at $GATE_REPO) is opening an umbrella-scope candidate; the audit of oven-sh/bun#30903 documents why this fails" \
        "ship one ≤200 LOC fix tied to an existing issue first; then re-pitch the umbrella. Override with --override-gate A07 (rationale: maintainer explicitly invited this) only if you have direct maintainer endorsement."
    fi
    if [[ "$MERGED_COUNT" -lt 4 ]]; then
      gate_warn \
        "rung $MERGED_COUNT contributor opening umbrella scope at $GATE_REPO" \
        "umbrella PRs from contributors below 4 prior merges sit. If maintainer hasn't endorsed the umbrella in writing, prefer a Design Issue first."
    fi
    gate_pass "rung $MERGED_COUNT (4+ merges) — umbrella scope earned"
    ;;
  ""|single-issue|single-fix)
    # Rung 0 with no attached issue and no Design-Issue framing is also an
    # umbrella in disguise. Require an issue number for first contributions.
    if [[ "$MERGED_COUNT" -lt "$THRESHOLD" && -z "$ISSUE_NUM" ]]; then
      gate_block \
        "rung 0 contributor ($MERGED_COUNT merged PRs at $GATE_REPO) has no issue_number on candidate; first PR must close an existing issue or be filed as a Design Issue" \
        "find an open issue this fix addresses and add issue_number to the candidate frontmatter, OR change scope_intent to design-discussion and file as an issue first. Override with --override-gate A07 (rationale required) only for true drive-by fixes (typo in README, etc.)."
    fi
    if [[ "$MERGED_COUNT" -lt "$THRESHOLD" ]]; then
      gate_inform "rung 0 contributor with attached issue #$ISSUE_NUM — proceeding under the 200 LOC cap (b13 enforces at submit)"
    fi
    gate_pass "rung $MERGED_COUNT at $GATE_REPO, scope_intent=${SCOPE_INTENT:-single-issue}, issue=#${ISSUE_NUM:-(none)}"
    ;;
  *)
    gate_warn \
      "unrecognized scope_intent value: '$SCOPE_INTENT'" \
      "use one of: single-issue, single-fix, umbrella, design-discussion"
    ;;
esac
