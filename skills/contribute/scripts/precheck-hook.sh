#!/usr/bin/env bash
# precheck-hook.sh — PreToolUse hook for chokepointing OSS contribution actions.
#
# Closes the "deterministic safety net" gap surfaced by round-1 security GAP-5
# and round-2 OSSBot self-audit: prevents `gh issue comment`, `gh pr create`,
# `gh pr ready`, `gh pr merge` from firing without gate-runner verdict.
#
# Hook contract per code.claude.com/docs/en/hooks:
#   stdin: JSON { tool_name, tool_input, ... }
#   stdout: visible to Claude
#   exit 0: allow (pass-through)
#   exit 2: BLOCK with stderr message shown to Claude
#
# Defensive design: fail OPEN on any unexpected error. Kill switch:
# `~/.contribute-system/.hook-disabled` makes this a no-op.

set -uo pipefail  # NOT -e (don't crash on internal errors → pass-through)

# Kill switch
if [[ -f "$HOME/.contribute-system/.hook-disabled" ]]; then
  exit 0
fi

# Don't fire if the contribute system isn't installed
if [[ ! -d "$HOME/.contribute-system/gates" || ! -x "$HOME/.contribute-system/bin/transition.sh" ]]; then
  exit 0
fi


# Parse a single field from YAML frontmatter (between ---...--- markers).
# Handles: comments (full-line + inline), quoted values, leading/trailing
# whitespace. Anchors on `^field:` so partial matches (e.g. `pre_field:`) miss.
# Args: $1 = file path, $2 = field name. Echoes value (empty if not found).
parse_fm_field() {
  /usr/bin/awk -v field="$2" '
    BEGIN { in_fm = 0 }
    /^---[[:space:]]*$/ {
      if (in_fm == 0) { in_fm = 1; next }
      else { exit }
    }
    !in_fm { next }
    /^[[:space:]]*#/ { next }
    {
      regex = "^" field ":[[:space:]]*"
      if (match($0, regex)) {
        value = substr($0, RSTART + RLENGTH)
        gsub(/^[\042\047]|[\042\047]$/, "", value)
        sub(/[[:space:]]+#.*$/, "", value)
        sub(/[[:space:]]+$/, "", value)
        print value
        exit
      }
    }
  ' "$1"
}

# Read hook input
INPUT=$(/usr/bin/cat 2>/dev/null) || exit 0
TOOL_NAME=$(/usr/bin/printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
[[ "$TOOL_NAME" == "Bash" ]] || exit 0

CMD=$(/usr/bin/printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)
[[ -z "$CMD" ]] && exit 0

# What action are we intercepting? Map command pattern → transition + repo + N
ACTION=""
REPO=""
ISSUE_OR_PR=""

if [[ "$CMD" =~ gh[[:space:]]+issue[[:space:]]+comment[[:space:]]+([0-9]+)[[:space:]]+--repo[[:space:]]+([^[:space:]]+) ]]; then
  ACTION="post-comment"
  ISSUE_OR_PR="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
elif [[ "$CMD" =~ gh[[:space:]]+pr[[:space:]]+create ]]; then
  ACTION="open-pr"
  # gh pr create derives repo from cwd remote; extract from --repo if present
  if [[ "$CMD" =~ --repo[=[:space:]]+([^[:space:]]+) ]]; then
    REPO="${BASH_REMATCH[1]}"
  fi
elif [[ "$CMD" =~ gh[[:space:]]+pr[[:space:]]+ready[[:space:]]+([0-9]+) ]]; then
  ACTION="flip-to-ready"
  ISSUE_OR_PR="${BASH_REMATCH[1]}"
  if [[ "$CMD" =~ --repo[=[:space:]]+([^[:space:]]+) ]]; then
    REPO="${BASH_REMATCH[1]}"
  fi
elif [[ "$CMD" =~ gh[[:space:]]+pr[[:space:]]+merge ]]; then
  ACTION="merge"
  if [[ "$CMD" =~ --repo[=[:space:]]+([^[:space:]]+) ]]; then
    REPO="${BASH_REMATCH[1]}"
  fi
else
  # Not an OSS-contribution external action; pass through
  exit 0
fi

# Log the interception attempt
LOG="$HOME/.contribute-system/log.jsonl"
NOW=$(/usr/bin/date -u +%Y-%m-%dT%H:%M:%SZ)
jq -nc --arg ts "$NOW" --arg action "$ACTION" --arg repo "$REPO" --arg n "$ISSUE_OR_PR" --arg cmd "${CMD:0:200}" \
  '{ts: $ts, event: "hook_intercept", details: {action: $action, repo: $repo, issue_or_pr: $n, cmd_preview: $cmd}}' \
  >> "$LOG" 2>/dev/null || true

# Find the candidate file for this repo. Three-path lookup:
#   1. Explicit issue/PR number (post-comment, flip-to-ready, merge — number is in CMD)
#   2. open-pr fallback: match candidate's `branch:` frontmatter field to --head arg
#   3. open-pr last-resort: exactly one active candidate for this repo
# Fix for bug contributing-clanker-nd9: open-pr action has no number at create-time,
# so path 1 always missed, and the only-pattern lookup left PRs ungated.
CAND_PATH=""
if [[ -n "$REPO" ]]; then
  REPO_SLUG="${REPO//\//__}"
  # Path 1: explicit issue/PR number — try both issue<N> and pr<N> filename conventions
  if [[ -n "$ISSUE_OR_PR" ]]; then
    for variant in "issue${ISSUE_OR_PR}" "pr${ISSUE_OR_PR}"; do
      P="$HOME/.contribute-system/candidates/${REPO_SLUG}__${variant}.md"
      [[ -f "$P" ]] && { CAND_PATH="$P"; break; }
    done
  fi
  # Path 2: open-pr fallback — match --head <branch> against candidate's `branch:` frontmatter
  if [[ -z "$CAND_PATH" && "$ACTION" == "open-pr" ]]; then
    BRANCH=""
    if [[ "$CMD" =~ --head[=[:space:]]+([^[:space:]]+) ]]; then
      BRANCH="${BASH_REMATCH[1]}"
      BRANCH="${BRANCH##*:}"  # strip "user:" prefix if present
    fi
    if [[ -n "$BRANCH" ]]; then
      for f in "$HOME/.contribute-system/candidates/${REPO_SLUG}__"*.md; do
        [[ -f "$f" ]] || continue
        FRONT_BRANCH=$(parse_fm_field "$f" branch)
        if [[ "$FRONT_BRANCH" == "$BRANCH" ]]; then
          CAND_PATH="$f"
          break
        fi
      done
    fi
  fi
  # Path 3: open-pr last-resort — exactly one active pre-PR candidate per repo.
  # Active set is intentionally narrow: only states where the engineer is doing
  # work but hasn't created a PR yet. Post-PR states (pr-open/-edited/submitted)
  # mean a PR already exists for this candidate — creating ANOTHER would violate
  # "one PR per issue" upstream hygiene, so we BLOCK rather than match.
  if [[ -z "$CAND_PATH" && "$ACTION" == "open-pr" ]]; then
    ACTIVE=()
    POST_PR=()
    for f in "$HOME/.contribute-system/candidates/${REPO_SLUG}__"*.md; do
      [[ -f "$f" ]] || continue
      STATUS=$(parse_fm_field "$f" status)
      case "$STATUS" in
        shortlist|claimed|working)             ACTIVE+=("$f") ;;
        pr-open|pr-open-edited|submitted)      POST_PR+=("$f") ;;
        # open|dropped|merged|watching — ignored (inactive or terminal)
      esac
    done
    # Hygiene block: candidate already has a PR open → second PR for same
    # candidate violates "one PR per issue". Force user to close prior PR
    # or use --override-gate if there's a documented reason.
    if [[ "${#POST_PR[@]}" -ge 1 ]]; then
      /usr/bin/printf '⛔ contribute-hook: %d candidate(s) for %s already have a PR (status in pr-open/pr-open-edited/submitted). One PR per issue per upstream CONTRIBUTING.md hygiene. Close the existing PR first, or run transition.sh manually with --override-gate.\nWith existing PR:\n' "${#POST_PR[@]}" "$REPO" >&2
      /usr/bin/printf '  %s\n' "${POST_PR[@]}" >&2
      exit 2
    fi
    if [[ "${#ACTIVE[@]}" -eq 1 ]]; then
      CAND_PATH="${ACTIVE[0]}"
    elif [[ "${#ACTIVE[@]}" -gt 1 ]]; then
      /usr/bin/printf '⛔ contribute-hook: %d active pre-PR candidates for %s — cannot auto-select for open-pr. Add `branch: %s` to the matching candidate, or run transition.sh manually first.\nActive:\n' "${#ACTIVE[@]}" "$REPO" "${BRANCH:-<head-branch>}" >&2
      /usr/bin/printf '  %s\n' "${ACTIVE[@]}" >&2
      exit 2
    fi
  fi
fi

# If no candidate file, we have no rules-of-engagement to enforce. Pass through with a stderr note.
if [[ -z "$CAND_PATH" ]]; then
  /usr/bin/printf '⚠ contribute-hook: no candidate file for %s#%s — gates not enforced. Run /contribute scout or @scout first.\n' "$REPO" "$ISSUE_OR_PR" >&2
  exit 0
fi

# Run gate-runner with the matched action
DOSSIER_PATH=""
if [[ -n "$REPO" ]]; then
  DOSSIER_TRY="$HOME/.contribute-system/research/${REPO//\//__}.md"
  [[ -f "$DOSSIER_TRY" ]] && DOSSIER_PATH="$DOSSIER_TRY"
fi

VERDICT=$(/usr/bin/timeout 30 "$HOME/.contribute-system/bin/transition.sh" "$ACTION" "$CAND_PATH" --dossier "$DOSSIER_PATH" --dry-run 2>&1)
EXIT=$?

if [[ "$EXIT" -ne 0 ]]; then
  /usr/bin/printf '\n⛔ contribute-hook BLOCKED %s — gates failed:\n%s\n\nTo override: pass --override-gate=<id> "<reason>" to transition.sh manually before re-attempting.\nTo disable hook entirely: touch ~/.contribute-system/.hook-disabled\n' "$ACTION" "$VERDICT" >&2
  exit 2
fi

# Verdict was PASS — let the action through, but surface any WARNs
if /usr/bin/printf '%s' "$VERDICT" | /usr/bin/grep -q '"warnings"' 2>/dev/null; then
  /usr/bin/printf '✓ contribute-hook: %s gates passed\n' "$ACTION" >&2
fi
exit 0
