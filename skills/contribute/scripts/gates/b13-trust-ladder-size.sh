#!/usr/bin/env bash
# Catalog: B13 — Trust-ladder size cap (local diff vs. user's prior-merges rung)
#
# Sibling to a07-trust-ladder-fit. Where A7 catches umbrella *intent* at
# claim time, B13 catches umbrella *shape* at submit time: a 0-prior-merges
# contributor pushing a 122K-line diff (oven-sh/bun#30903) fails here even
# if the candidate frontmatter claimed `scope_intent: single-fix`.
#
# Defaults:
#   rung 0  (0 merges)   : <= 200 LOC, <= 10 files, no new top-level dirs
#   rung 1-3 (1-3 merges): <= 500 LOC, <= 20 files, no new top-level dirs
#   rung 4+ (4+ merges)  : PASS
#
# Per-repo dossier overrides (any subset accepted):
#   trust_ladder_rung0_max_loc: 200
#   trust_ladder_rung0_max_files: 10
#   trust_ladder_rung13_max_loc: 500
#   trust_ladder_rung13_max_files: 20
#   trust_ladder_disabled: true   # skip entirely (rare; use only when the
#                                   maintainer has invited unbounded scope)
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

# Per-repo opt-out
if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
  DISABLED=$(fm_field "$GATE_DOSSIER_PATH" "trust_ladder_disabled")
  if [[ "$DISABLED" == "true" ]]; then
    gate_skip "trust_ladder_disabled: true in dossier"
  fi
fi

# Read merged_prs_by_user
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

# Rung 4+: pass unconditionally
if [[ "$MERGED_COUNT" -ge 4 ]]; then
  gate_pass "rung $MERGED_COUNT (4+ merges) at $GATE_REPO — no size cap"
fi

# Need a local clone to measure diff
if [[ -z "$GATE_REPO" ]]; then
  gate_skip "no repo in candidate env"
fi

REPO_NAME="${GATE_REPO##*/}"
CLONE_DIR="$HOME/000-projects/contributing-clanker/$REPO_NAME"

if [[ ! -d "$CLONE_DIR/.git" ]]; then
  gate_skip "no local clone at $CLONE_DIR — cannot measure diff size"
fi

cd "$CLONE_DIR"

# Find the base branch — try dossier, then upstream/main, then origin/main
DEFAULT_BRANCH=""
if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
  DEFAULT_BRANCH=$(fm_field "$GATE_DOSSIER_PATH" "default_branch")
fi
[[ -z "$DEFAULT_BRANCH" ]] && DEFAULT_BRANCH="main"

# Try upstream first (in fork-based workflows the canonical base is upstream/<branch>),
# fall back to origin if upstream isn't configured.
BASE_REF=""
for cand in "upstream/$DEFAULT_BRANCH" "origin/$DEFAULT_BRANCH"; do
  if /usr/bin/git rev-parse --verify "$cand" >/dev/null 2>&1; then
    BASE_REF="$cand"
    break
  fi
done

if [[ -z "$BASE_REF" ]]; then
  gate_skip "no upstream/$DEFAULT_BRANCH or origin/$DEFAULT_BRANCH in clone — cannot measure diff size"
fi

# Compute LOC + file count from numstat. Skip pure deletions of vendored
# trees (e.g., removing a node_modules/ checkin) by capping per-file deletions
# at the additions count for the same file — but for simplicity start with
# the raw shortstat sums.
NUMSTAT=$(/usr/bin/git diff "$BASE_REF..HEAD" --numstat 2>/dev/null || /usr/bin/echo "")

if [[ -z "$NUMSTAT" ]]; then
  gate_pass "no diff vs $BASE_REF — nothing to measure"
fi

# Sum additions + deletions. `-` indicates binary file; skip those for LOC
# count but still count them as files.
TOTAL_LOC=0
TOTAL_FILES=0
NEW_TOP_DIRS=""
while IFS=$'\t' read -r ADD DEL PATHNAME; do
  [[ -z "$PATHNAME" ]] && continue
  TOTAL_FILES=$((TOTAL_FILES + 1))
  if [[ "$ADD" =~ ^[0-9]+$ ]]; then
    TOTAL_LOC=$((TOTAL_LOC + ADD))
  fi
  if [[ "$DEL" =~ ^[0-9]+$ ]]; then
    TOTAL_LOC=$((TOTAL_LOC + DEL))
  fi

  # Detect new top-level directories: any path whose first segment didn't
  # exist on the base ref.
  TOP="${PATHNAME%%/*}"
  if [[ "$TOP" != "$PATHNAME" ]]; then
    # The path has at least one slash — check if TOP existed in BASE_REF
    if ! /usr/bin/git cat-file -e "$BASE_REF:$TOP" 2>/dev/null; then
      # New top-level dir introduced by this branch
      if [[ ",$NEW_TOP_DIRS," != *",$TOP,"* ]]; then
        NEW_TOP_DIRS="${NEW_TOP_DIRS:+$NEW_TOP_DIRS,}$TOP"
      fi
    fi
  fi
done <<< "$NUMSTAT"

# Per-rung caps from dossier (with defaults)
if [[ "$MERGED_COUNT" -lt 1 ]]; then
  MAX_LOC=200
  MAX_FILES=10
  RUNG_LABEL="rung 0"
  if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
    V=$(fm_field "$GATE_DOSSIER_PATH" "trust_ladder_rung0_max_loc")
    [[ "$V" =~ ^[0-9]+$ ]] && MAX_LOC="$V"
    V=$(fm_field "$GATE_DOSSIER_PATH" "trust_ladder_rung0_max_files")
    [[ "$V" =~ ^[0-9]+$ ]] && MAX_FILES="$V"
  fi
else
  MAX_LOC=500
  MAX_FILES=20
  RUNG_LABEL="rung $MERGED_COUNT (1-3)"
  if [[ -n "$GATE_DOSSIER_PATH" && -f "$GATE_DOSSIER_PATH" ]]; then
    V=$(fm_field "$GATE_DOSSIER_PATH" "trust_ladder_rung13_max_loc")
    [[ "$V" =~ ^[0-9]+$ ]] && MAX_LOC="$V"
    V=$(fm_field "$GATE_DOSSIER_PATH" "trust_ladder_rung13_max_files")
    [[ "$V" =~ ^[0-9]+$ ]] && MAX_FILES="$V"
  fi
fi

# Verdicts
if [[ "$TOTAL_LOC" -gt "$MAX_LOC" ]]; then
  gate_block \
    "$RUNG_LABEL at $GATE_REPO: diff is $TOTAL_LOC LOC (cap $MAX_LOC) across $TOTAL_FILES files" \
    "shrink the PR or split into stages. The trust-ladder rule caps first/early contributions to keep maintainer review cost low. Override with --override-gate B13 (rationale required) only if you have direct maintainer endorsement to ship the full size."
fi

if [[ "$TOTAL_FILES" -gt "$MAX_FILES" ]]; then
  gate_block \
    "$RUNG_LABEL at $GATE_REPO: diff touches $TOTAL_FILES files (cap $MAX_FILES)" \
    "shrink the file footprint or split. A first PR touching many files is hard to review even when the LOC is small."
fi

if [[ -n "$NEW_TOP_DIRS" ]]; then
  gate_block \
    "$RUNG_LABEL at $GATE_REPO: adds new top-level dir(s): $NEW_TOP_DIRS" \
    "first/early contributions should not introduce new top-level dirs (e.g. .audit/, .ub-exorcism/, vendor/). Move artifacts into an existing dir (docs/, tests/, scripts/) or host them in your own repo and link from a Design Issue."
fi

gate_pass "$RUNG_LABEL: $TOTAL_LOC LOC across $TOTAL_FILES files (caps: ${MAX_LOC} LOC / ${MAX_FILES} files), no new top-level dirs"
