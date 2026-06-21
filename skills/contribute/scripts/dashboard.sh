#!/usr/bin/env bash
# dashboard.sh — printed ASCII status dashboard for the /contribute command center.
#
# Implements contributing-clanker-15b.5.
#
# Reads LOCAL markdown state only (candidates + dossiers + log.jsonl) — no network,
# no gh calls — so it renders instantly and deterministically. Live PR reconciliation
# stays in SKILL.md Step 0; this is the headline snapshot that "pops up" first.
#
# Sections:
#   PIPELINE       — candidate funnel by effective status
#   IN FLIGHT      — working/submitted candidates that need a human action
#   SHIPPED        — most-recently merged contributions
#   SUGGESTED NEXT — top open candidates by scout_score + stale dossiers + drift hint
#   TIMELINE       — recent meaningful events from log.jsonl
#
# Two candidate schemas exist and both are handled via an effective-status rollup:
#   - issue candidates carry `status:`  (open|shortlist|claimed|working|submitted|merged|dropped)
#   - backfilled PR candidates carry `state:` (open|closed|merged) — mapped:
#       merged->merged, closed->dropped, open->submitted
#
# Override the state dir for tests with CONTRIBUTE_STATE_DIR.
# Usage: dashboard.sh [--no-box]

set -uo pipefail

STATE_DIR="${CONTRIBUTE_STATE_DIR:-${HOME}/.contribute-system}"
CAND_DIR="${STATE_DIR}/candidates"
RESEARCH_DIR="${STATE_DIR}/research"
LOG="${STATE_DIR}/log.jsonl"
WIDTH=72
INNER=$(( WIDTH - 2 ))
NOW_EPOCH=$(date +%s)
NOW_UTC=$(date -u +"%Y-%m-%d %H:%M UTC")

BOX=1
[[ "${1:-}" == "--no-box" ]] && BOX=0

# --- frontmatter helpers -----------------------------------------------------

# Print the value of a frontmatter key from a candidate file (first match, within
# the first --- ... --- block only).
fm() { # fm <file> <key>
  /usr/bin/awk -v k="$2" '
    /^---[[:space:]]*$/ { b++; if (b==2) exit; next }
    b==1 && $0 ~ "^"k":" { sub("^"k":[[:space:]]*",""); gsub(/^[[:space:]]+|[[:space:]]+$/,""); print; exit }
  ' "$1"
}

# Candidate title: first body heading (prefer "# " h1, else "## " h2). Strips the
# leading hashes and any redundant "owner/repo #N " prefix (the ref is shown
# separately). Any em-dash residue is cleaned later by asc() at render time.
title_of() {
  /usr/bin/awk '
    /^---[[:space:]]*$/ { b++; next }
    b>=2 && /^#{1,2} / {
      sub(/^#{1,2}[[:space:]]*/, "")
      sub(/^[^[:space:]]+\/[^[:space:]]+[[:space:]]+#[0-9]+[[:space:]]*/, "")
      print; exit
    }
  ' "$1"
}

# Map a candidate file to its effective status (status: wins; else state: mapped).
eff_status() { # eff_status <file>
  local s st
  s=$(fm "$1" status)
  if [[ -n "$s" && "$s" != "null" ]]; then printf '%s' "$s"; return; fi
  st=$(fm "$1" state)
  case "$st" in
    merged) printf 'merged' ;;
    closed) printf 'dropped' ;;
    open)   printf 'submitted' ;;
    *)      printf 'unknown' ;;
  esac
}

# epoch of an ISO8601 timestamp, or 0
iso_epoch() { [[ -n "$1" && "$1" != "null" ]] && date -d "$1" +%s 2>/dev/null || echo 0; }

# Force a string to printable ASCII (space..~). Upstream titles/refs/log details
# carry arbitrary UTF-8 (em-dashes, curly quotes); printf %-*s pads by BYTES while
# those render as 1 column, so any multibyte char drifts the right border. Stripping
# to ASCII guarantees bytes == display columns, keeping every row's frame aligned.
asc() { printf '%s' "$1" | LC_ALL=C tr -cd '\40-\176'; }

# truncate $1 to exactly $2 display columns (ASCII-only after asc(), so chars == cols).
# Appends an ASCII "..." marker when clipped so width math stays exact.
trunc() { local s="$1" n="$2"; if (( ${#s} > n )); then printf '%s...' "${s:0:n-3}"; else printf '%s' "$s"; fi; }

# --- gather candidate state into parallel arrays -----------------------------

declare -A FUNNEL=( [open]=0 [shortlist]=0 [claimed]=0 [working]=0 [submitted]=0 [merged]=0 [dropped]=0 [unknown]=0 )
INFLIGHT=()   # "epoch\trepo#ref\tstatus\ttitle"
SHIPPED=()    # "epoch\trepo#ref\ttitle"
OPENQ=()      # "score\trepo#ref\ttitle"
CAND_TOTAL=0

shopt -s nullglob
for f in "$CAND_DIR"/*.md; do
  CAND_TOTAL=$(( CAND_TOTAL + 1 ))
  st=$(eff_status "$f")
  FUNNEL[$st]=$(( ${FUNNEL[$st]:-0} + 1 ))

  repo=$(fm "$f" repo)
  issue=$(fm "$f" issue_number)
  pr=$(fm "$f" pr_number)
  ref="$repo"
  if [[ -n "$issue" && "$issue" != "null" ]]; then ref="${repo}#${issue}"
  elif [[ -n "$pr" && "$pr" != "null" ]]; then ref="${repo}#${pr}"; fi
  # ASCII-normalize + strip any leading space/dash residue left after prefix removal
  ttl=$(title_of "$f" | LC_ALL=C tr -cd '\40-\176' | /usr/bin/sed -E 's/^[[:space:]-]+//')
  [[ -z "$ttl" ]] && ttl="(no title)"

  case "$st" in
    working|submitted)
      e=$(iso_epoch "$(fm "$f" last_refreshed)")
      INFLIGHT+=( "$(printf '%010d\t%s\t%s\t%s' "$e" "$ref" "$st" "$ttl")" ) ;;
    merged)
      m=$(fm "$f" merged_at); [[ -z "$m" || "$m" == "null" ]] && m=$(fm "$f" closed_at)
      e=$(iso_epoch "$m")
      SHIPPED+=( "$(printf '%010d\t%s\t%s' "$e" "$ref" "$ttl")" ) ;;
    open|shortlist)
      sc=$(fm "$f" scout_score); [[ -z "$sc" || "$sc" == "null" ]] && sc=0
      scn=$(/usr/bin/awk -v s="$sc" 'BEGIN{printf "%06.2f", s+0}')
      OPENQ+=( "$(printf '%s\t%s\t%s' "$scn" "$ref" "$ttl")" ) ;;
  esac
done

# --- dossier freshness -------------------------------------------------------

DOSS_TOTAL=0; DOSS_STALE=0
for d in "$RESEARCH_DIR"/*.md; do
  DOSS_TOTAL=$(( DOSS_TOTAL + 1 ))
  lr=$(fm "$d" last_refreshed)
  le=$(iso_epoch "$lr")
  if (( le > 0 )); then
    age=$(( (NOW_EPOCH - le) / 86400 ))
    (( age > 14 )) && DOSS_STALE=$(( DOSS_STALE + 1 ))
  fi
done

LOG_EVENTS=0
[[ -f "$LOG" ]] && LOG_EVENTS=$(/usr/bin/wc -l < "$LOG" | tr -d ' ')

# --- rendering ---------------------------------------------------------------

line()  { printf '%s\n' "$(printf '─%.0s' $(seq 1 "$INNER"))"; }
# row: pad/clip content to INNER-2 (1-space gutter each side) and frame it
row() {
  local txt; txt=$(trunc "$(asc "$1")" $(( INNER - 2 )))
  if (( BOX )); then printf '│ %-*s │\n' "$(( INNER - 2 ))" "$txt"
  else printf '  %s\n' "$txt"; fi
}
sep()   { (( BOX )) && printf '├%s┤\n' "$(line)" || printf '\n'; }
blank() { row ""; }

top() {
  if (( BOX )); then
    local t=" CONTRIBUTE COMMAND CENTER " r=" ${NOW_UTC} "
    local fill=$(( INNER - ${#t} - ${#r} ))
    (( fill < 1 )) && fill=1
    printf '┌%s%s%s┐\n' "$t" "$(printf '─%.0s' $(seq 1 "$fill"))" "$r"
  else
    printf '== CONTRIBUTE COMMAND CENTER == %s\n' "$NOW_UTC"
  fi
}
bot() { (( BOX )) && printf '└%s┘\n' "$(line)" || printf '\n'; }

top
row "$(printf '%d candidates | %d dossiers (%d stale) | %d log events' \
        "$CAND_TOTAL" "$DOSS_TOTAL" "$DOSS_STALE" "$LOG_EVENTS")"
sep

# PIPELINE funnel
row "PIPELINE"
row "$(printf 'open %-4d shortlist %-3d claimed %-3d working %-3d' \
        "${FUNNEL[open]}" "${FUNNEL[shortlist]}" "${FUNNEL[claimed]}" "${FUNNEL[working]}")"
row "$(printf 'submitted %-3d merged %-4d dropped %-4d' \
        "${FUNNEL[submitted]}" "${FUNNEL[merged]}" "${FUNNEL[dropped]}")"
sep

# IN FLIGHT
row "IN FLIGHT - working / submitted (needs action)"
if (( ${#INFLIGHT[@]} )); then
  while IFS=$'\t' read -r _e ref st ttl; do
    row "- $(printf '%-10s %s' "$st" "$ref")"
    row "    $ttl"
  done < <(printf '%s\n' "${INFLIGHT[@]}" | sort -rn | head -5)
else
  row "  (nothing in flight)"
fi
sep

# SHIPPED
row "SHIPPED - recently merged"
if (( ${#SHIPPED[@]} )); then
  while IFS=$'\t' read -r e ref ttl; do
    d="--"; (( e > 0 )) && d=$(date -u -d "@$e" +%Y-%m-%d 2>/dev/null)
    row "- $d  $ref"
    row "    $ttl"
  done < <(printf '%s\n' "${SHIPPED[@]}" | sort -rn | head -4)
else
  row "  (none yet)"
fi
sep

# SUGGESTED NEXT
row "SUGGESTED NEXT"
n=1
if (( ${#OPENQ[@]} )); then
  while IFS=$'\t' read -r sc ref ttl; do
    row "$(printf '%d. claim  %s  (score %s)' "$n" "$ref" "$sc")"
    row "$(printf '         %s' "$ttl")"
    n=$(( n + 1 ))
  done < <(printf '%s\n' "${OPENQ[@]}" | sort -rn | head -3)
else
  row "  no open candidates — run @scout baseline"
fi
(( DOSS_STALE > 0 )) && { row "$(printf '%d. refresh %d stale dossier(s)  ->  @researcher refresh' "$n" "$DOSS_STALE")"; n=$(( n + 1 )); }
(( FUNNEL[submitted] > 0 )) && row "$(printf '%d. reconcile %d submitted candidate(s) vs live PR state' "$n" "${FUNNEL[submitted]}")"
sep

# TIMELINE — recent meaningful events (drop the high-volume noise)
row "TIMELINE - recent activity"
if [[ -f "$LOG" ]]; then
  tail -400 "$LOG" \
    | /usr/bin/jq -rc 'select(.event | test("hook_intercept|gate_run") | not)
        | [ (.ts // "" | .[0:10]),
            .event,
            (.details.repo // .repo
              // (.details.candidate // "" | split("/") | last)
              // "") ] | @tsv' 2>/dev/null \
    | tail -6 | while IFS=$'\t' read -r d ev rest; do
        row "$(printf '%s  %-22s %s' "$d" "$ev" "$rest")"
      done
else
  row "  (no log)"
fi
bot
