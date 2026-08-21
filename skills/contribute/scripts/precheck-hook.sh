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

# --- Omarchy marketplace submission guard ---------------------------------
#
# Why this exists: `gh issue create` was the one external action this hook
# never saw, so a marketplace submission could be filed without the gate lane
# ever running. Running it was a choice, not a gate.
#
# And a lane run alone is not enough. C32 (omarchy-plugin-validate) and C33
# (qmllint) call gate_skip when those binaries are unresolvable, which they
# always are off-rig because they live on the rig, and the runner counts SKIP
# as pass. So the lane printed "verdict PASS, 0 BLOCK" for plugins that had
# never run on Omarchy. C37 closes that by refusing a submission whose
# .rig-proof.json receipt is missing, stale, failing, or written against
# different code. Both must pass here.
#
# Posture: fail OPEN while the plugin tree is still unidentified (same as the
# unmatched-candidate path below); fail CLOSED once a tree is identified.
OMARCHY_MARKETPLACE_REPO="${OMARCHY_MARKETPLACE_REPO:-HANCORE-linux/omarchy-plugin-marketplace}"
OMARCHY_CANONICAL_GATES="${OMARCHY_CANONICAL_GATES:-$HOME/000-projects/contributing-clanker/skills/contribute/scripts/gates}"

# Run the canonical omarchy-relevant gates (c28-c37) against a plugin tree.
# Used only when the repo has not vendored its own scripts/run-plugin-gates.sh.
# Echoes one line per gate; returns 1 if any gate blocked or crashed.
_omarchy_canonical_gates() {
  local dir="$1" input verdict sev id reason blocked=0 gate
  [[ -d "$OMARCHY_CANONICAL_GATES" ]] || { /usr/bin/printf '  (canonical gate lane not found at %s)\n' "$OMARCHY_CANONICAL_GATES"; return 0; }
  input=$(jq -nc --arg c "$dir" '{candidate:$c, action:"omarchy-submit", env:{repo:""}}')
  for gate in "$OMARCHY_CANONICAL_GATES"/c2[89]-*.sh "$OMARCHY_CANONICAL_GATES"/c3[0-9]-*.sh; do
    [[ -f "$gate" ]] || continue
    verdict=$(/usr/bin/printf '%s' "$input" | /usr/bin/timeout 20 bash "$gate" 2>/dev/null)
    id=$(/usr/bin/basename "$gate" .sh)
    if [[ -z "$verdict" ]]; then
      /usr/bin/printf '  %-34s CRASH  no verdict emitted\n' "$id"
      blocked=1; continue
    fi
    sev=$(/usr/bin/printf '%s' "$verdict" | jq -r '.severity // "CRASH"')
    reason=$(/usr/bin/printf '%s' "$verdict" | jq -r '.reason // ""')
    /usr/bin/printf '  %-34s %-6s %s\n' "$id" "$sev" "$reason"
    case "$sev" in
      BLOCK|CRASH)
        blocked=1
        hint=$(/usr/bin/printf '%s' "$verdict" | jq -r '.fix_hint // ""')
        [[ -n "$hint" ]] && /usr/bin/printf '         fix: %s\n' "$hint"
        ;;
    esac
  done
  return "$blocked"
}

# Run C37 (rig receipt) against a plugin tree. Prefers the repo's vendored copy,
# falls back to the canonical lane, because C37 is not vendored anywhere yet.
# Returns 1 and echoes the verdict when the receipt does not certify this code.
_omarchy_rig_receipt() {
  local dir="$1" c37 verdict sev reason hint
  c37="$dir/scripts/gates/c37-omarchy-rig-proof.sh"
  [[ -f "$c37" ]] || c37="$OMARCHY_CANONICAL_GATES/c37-omarchy-rig-proof.sh"
  if [[ ! -f "$c37" ]]; then
    /usr/bin/printf '  C37 rig receipt gate not found — receipt UNVERIFIED\n'
    return 1
  fi
  verdict=$(jq -nc --arg c "$dir" '{candidate:$c, action:"omarchy-submit", env:{repo:""}}' \
    | /usr/bin/timeout 30 bash "$c37" 2>/dev/null)
  if [[ -z "$verdict" ]]; then
    /usr/bin/printf '  C37 crashed — no verdict emitted\n'
    return 1
  fi
  sev=$(/usr/bin/printf '%s' "$verdict" | jq -r '.severity // "CRASH"')
  reason=$(/usr/bin/printf '%s' "$verdict" | jq -r '.reason // ""')
  hint=$(/usr/bin/printf '%s' "$verdict" | jq -r '.fix_hint // ""')
  /usr/bin/printf '  %-34s %-6s %s\n' "c37-omarchy-rig-proof" "$sev" "$reason"
  if [[ "$sev" != "PASS" ]]; then
    [[ -n "$hint" ]] && /usr/bin/printf '         fix: %s\n' "$hint"
    return 1
  fi
  return 0
}

# Main guard. Echoes nothing on allow; on block writes to stderr and exits 2.
omarchy_submit_guard() {
  local cmd="$1" body="" bodyfile="" url="" name="" dir="" out="" rc=0 fail=0

  # Held in a variable: a bracket expression written inline here would have its
  # backslash escapes taken literally and silently exclude digits from paths.
  local bf_re='--body-file[=[:space:]]+([^[:space:]]+)'
  if [[ "$cmd" =~ $bf_re ]]; then
    bodyfile="${BASH_REMATCH[1]}"
    bodyfile="${bodyfile%\'}"; bodyfile="${bodyfile#\'}"
    bodyfile="${bodyfile%\"}"; bodyfile="${bodyfile#\"}"
    [[ -f "$bodyfile" ]] && body=$(/usr/bin/cat "$bodyfile" 2>/dev/null)
  fi
  # An inline --body lands in the command text itself; scan that as a fallback.
  [[ -z "$body" ]] && body="$cmd"

  # The marketplace issue form puts the repo on the line after the heading.
  url=$(/usr/bin/printf '%s' "$body" \
    | /usr/bin/awk '/^###[[:space:]]*Repository URL/{f=1;next} f && /github\.com\//{print;exit}' \
    | /usr/bin/grep -oE "https://github\\.com/[^[:space:]'\"]+" | /usr/bin/head -1)
  [[ -z "$url" ]] && url=$(/usr/bin/printf '%s' "$body" \
    | /usr/bin/grep -oE "https://github\\.com/[^[:space:]'\"]+" | /usr/bin/head -1)

  if [[ -z "$url" ]]; then
    /usr/bin/printf '\xe2\x9a\xa0 contribute-hook: marketplace submission with no resolvable Repository URL — plugin gates NOT enforced. Run scripts/run-plugin-gates.sh and scripts/rig-verify.sh by hand before filing.\n' >&2
    return 0
  fi

  name="${url##*/}"; name="${name%.git}"
  dir="$HOME/000-projects/$name"

  if [[ ! -d "$dir" || ! -f "$dir/manifest.json" ]]; then
    /usr/bin/printf '\xe2\x9a\xa0 contribute-hook: cannot resolve %s to a local plugin tree (looked in %s) — plugin gates NOT enforced. Run scripts/run-plugin-gates.sh and scripts/rig-verify.sh by hand before filing.\n' "$url" "$dir" >&2
    return 0
  fi

  if [[ -f "$dir/scripts/run-plugin-gates.sh" ]]; then
    out=$(/usr/bin/timeout 180 bash "$dir/scripts/run-plugin-gates.sh" "$dir" 2>&1) || rc=$?
  else
    out=$(_omarchy_canonical_gates "$dir" 2>&1) || rc=$?
  fi
  [[ "$rc" -ne 0 ]] && fail=1

  # C37 always runs: it is not vendored into any plugin repo yet, so the
  # repo-local lane above does not include it.
  local proof_out=""
  proof_out=$(_omarchy_rig_receipt "$dir" 2>&1) || fail=1

  if [[ "$fail" -ne 0 ]]; then
    /usr/bin/printf '\n\xe2\x9b\x94 contribute-hook BLOCKED marketplace submission for %s\n%s\n%s\n\nRemedy:\n  cd %s\n  scripts/run-plugin-gates.sh          # fix every BLOCK\n  scripts/rig-verify.sh                # prove it runs on the rig, refresh .rig-proof.json\n\nTo disable this hook entirely: touch ~/.contribute-system/.hook-disabled\n' \
      "$name" "$out" "$proof_out" "$dir" >&2
    exit 2
  fi

  /usr/bin/printf '\xe2\x9c\x93 contribute-hook: %s passed the plugin gate lane and carries a valid rig receipt\n' "$name" >&2
  return 0
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
elif [[ "$CMD" =~ gh[[:space:]]+issue[[:space:]]+create ]] \
  && /usr/bin/printf '%s' "$CMD" | /usr/bin/grep -qiF "$OMARCHY_MARKETPLACE_REPO"; then
  ACTION="omarchy-submit"
  REPO="$OMARCHY_MARKETPLACE_REPO"
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

# Marketplace submissions do not use the candidate/dossier flow — the gate lane
# and the rig receipt live in the plugin repo itself.
if [[ "$ACTION" == "omarchy-submit" ]]; then
  omarchy_submit_guard "$CMD"
  exit 0
fi

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
