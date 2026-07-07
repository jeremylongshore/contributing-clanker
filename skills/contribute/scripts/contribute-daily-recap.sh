#!/usr/bin/env bash
# contribute-daily-recap.sh — personal daily recap email for the /contribute
# system. Deterministic composition of the existing reporters — no LLM
# anywhere in the correctness path, ever.
#
# Body (in order):
#   1. "Action needed (N)" — stale claims, overrides awaiting audit, PRs quiet
#      too long. Each line carries a default next step.
#   2. dashboard.sh --no-box snapshot ("where we are")
#   3. Events in a fixed trailing window of log.jsonl (default 2 days = a
#      1-day overlap cushion; NO watermark file — a fixed window kills the
#      same-second-timestamp and advance-ordering bug classes outright, and a
#      missed run is already loud via the cron spine's failure escalation;
#      double-mention is harmless).
#   4. audit-overrides.sh --since=7 as a weekly-trend footer.
#
# Contracts:
#   - Heartbeat ONLY on positive proof: the "quiet day" collapse requires the
#     log read to have SUCCEEDED (file exists, jq parsed it, N lines scanned).
#     A read failure is an ALERT (exit 1), never a heartbeat.
#   - When Action-needed N=0 AND the window has zero events, the whole email
#     collapses to a one-line heartbeat + pipeline count (wallpaper guard).
#   - transition.sh keeps zero network calls forever — this script only READS
#     the state transition.sh writes.
#
# Usage:
#   contribute-daily-recap.sh --dry-run          # print HTML to stdout, send nothing
#   contribute-daily-recap.sh                    # compose + email (cron mode)
#   contribute-daily-recap.sh --window=8 --to="$TEAM_EMAILS"   # weekly team mode
#
# Env overrides:
#   CONTRIBUTE_STATE_DIR   state dir (default ~/.contribute-system) — for tests
#   CONTRIBUTE_RECAP_TO    default recipient (default jeremy@intentsolutions.io)
#   CONTRIBUTE_CRON_LIB    path to lib-cron-common.sh (cron spine; optional)
#   CLAIM_STALE_DAYS       stale-claim threshold (default 7)
#   PR_WAIT_DAYS           quiet-PR threshold (default 14)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${CONTRIBUTE_STATE_DIR:-${HOME}/.contribute-system}"
CAND_DIR="${STATE_DIR}/candidates"
LOG_JSONL="${STATE_DIR}/log.jsonl"
EMAIL_SCRIPT="${HOME}/.claude/skills/email/scripts/send-email.cjs"

DRY_RUN=0
WINDOW_DAYS=2
TO="${CONTRIBUTE_RECAP_TO:-jeremy@intentsolutions.io}"
CLAIM_STALE_DAYS="${CLAIM_STALE_DAYS:-7}"
PR_WAIT_DAYS="${PR_WAIT_DAYS:-14}"

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=1 ;;
    --window=*)  WINDOW_DAYS="${arg#*=}" ;;
    --to=*)      TO="${arg#*=}" ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

NOW_EPOCH=$(/usr/bin/date +%s)
TODAY=$(/usr/bin/date +%Y-%m-%d)
WINDOW_START=$(/usr/bin/date -u -d "@$(( NOW_EPOCH - WINDOW_DAYS * 86400 ))" +%Y-%m-%dT%H:%M:%SZ)

# ── cron spine (send mode only) ──────────────────────────────────────────────
# Sourced from the estate cron lib when present; every helper degrades to a
# no-op so the repo's tests + fresh clones never depend on the blog repo.
# NOT cargo-culted: preflight_branch_normalize (no git worktree here).
RUN_LOG=/dev/null
if [[ "$DRY_RUN" -eq 0 ]]; then
  LOG_DIR="${HOME}/.local/state/contribute-daily-recap"
  /usr/bin/mkdir -p "$LOG_DIR"
  RUN_LOG="$LOG_DIR/run-${TODAY}.log"
  CRON_LIB="${CONTRIBUTE_CRON_LIB:-/home/jeremy/000-projects/blog/startaitools/scripts/blog/lib-cron-common.sh}"
  # shellcheck disable=SC1090
  [[ -f "$CRON_LIB" ]] && source "$CRON_LIB"
  type slack_fail >/dev/null 2>&1 || slack_fail() { :; }
  type count_consecutive_failures >/dev/null 2>&1 || count_consecutive_failures() { echo 0; }
fi

log() { echo "[$(/usr/bin/date -Is)] $*" | /usr/bin/tee -a "$RUN_LOG"; }

# Fail-loud guard (send mode): an abnormal exit must never be silent.
# Takes rc as $1 — the EXIT trap captures $? FIRST, because the cleanup rm
# that precedes this call would otherwise clobber it (and a clobbered rc=0
# means the alert never fires).
NOTIFIED=0
HTML_FILE=""
CLEAN_EVENTS_FILE=""
notify_unexpected_exit() {
  local rc="${1:-1}"
  [[ "$rc" -eq 0 || "$NOTIFIED" -eq 1 || "$DRY_RUN" -eq 1 ]] && return 0
  log "ABNORMAL EXIT (rc=$rc) — sending fail-loud alert"
  local topic
  topic=$(/usr/bin/cat "$HOME/.ntfy-topic" 2>/dev/null || true)
  if [[ -n "$topic" ]]; then
    /usr/bin/curl -s -H "Title: contribute daily recap aborted" -H "Priority: high" -H "Tags: rotating_light" \
      -d "${TODAY}: recap exited rc=${rc} — NO recap emailed. Check ${RUN_LOG}" \
      "https://ntfy.sh/$topic" >/dev/null 2>&1 || true
  fi
  /usr/bin/timeout 120 node "$EMAIL_SCRIPT" --to "$TO" \
    --subject "🚨 contribute daily recap aborted: ${TODAY} (rc=${rc})" \
    --body "$(printf 'The contribute daily recap exited abnormally (rc=%s).\nNo recap was emailed for %s.\n\nLast 30 log lines:\n%s\n' "$rc" "$TODAY" "$(/usr/bin/tail -30 "$RUN_LOG" 2>/dev/null)")" \
    >/dev/null 2>&1 || true
  slack_fail "contribute-daily-recap" "rc=$rc — no recap emailed for $TODAY"
}
trap 'RC=$?; /usr/bin/rm -f "$HTML_FILE" "$CLEAN_EVENTS_FILE" 2>/dev/null; notify_unexpected_exit "$RC"' EXIT

# ── log read with POSITIVE proof ─────────────────────────────────────────────
# The heartbeat is only valid when we can PROVE the log was readable and
# parseable. Missing file or jq parse failure → alert path, exit 1.
read_failure() {
  local why="$1"
  log "READ FAILURE: $why"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "ALERT: contribute recap could not read state — $why" >&2
    exit 1
  fi
  NOTIFIED=1
  /usr/bin/timeout 120 node "$EMAIL_SCRIPT" --to "$TO" \
    --subject "🚨 contribute recap: cannot read log.jsonl (${TODAY})" \
    --body "$(printf 'The daily recap could not read its state and refuses to heartbeat blind.\n\nReason: %s\nLog: %s\n\nA quiet-day email requires positive proof of a successful log read; this is an alert instead.\n' "$why" "$LOG_JSONL")" \
    >/dev/null 2>&1 || true
  slack_fail "contribute-daily-recap" "log read failure: $why"
  exit 1
}

[[ -f "$LOG_JSONL" ]] || read_failure "log.jsonl missing at $LOG_JSONL"

LINES_SCANNED=$(/usr/bin/wc -l < "$LOG_JSONL")

# Tolerant line parse into a clean event stream. The live log carries
# historical torn hook_intercept entries (an old hook wrote unescaped heredoc
# newlines; the writer has since been fixed) — a strict parse-or-alert would
# alert every day forever on permanent history. Instead: malformed lines are
# SKIPPED and the skip count is printed in every recap as part of the
# positive proof. Alert only when jq itself fails or NOTHING parses.
CLEAN_EVENTS_FILE=$(/usr/bin/mktemp -t contribute-recap-events-XXXXXX)
jq -cR 'fromjson? | objects' "$LOG_JSONL" > "$CLEAN_EVENTS_FILE" 2>>"$RUN_LOG" \
  || read_failure "jq failed reading $LOG_JSONL (see run log)"
PARSEABLE=$(/usr/bin/wc -l < "$CLEAN_EVENTS_FILE")
MALFORMED=$(( LINES_SCANNED - PARSEABLE ))
if [[ "$LINES_SCANNED" -gt 0 && "$PARSEABLE" -eq 0 ]]; then
  read_failure "0 of $LINES_SCANNED lines parseable in $LOG_JSONL"
fi

WINDOW_EVENTS=$(jq -c --arg since "$WINDOW_START" 'select(.ts? >= $since)' "$CLEAN_EVENTS_FILE" 2>>"$RUN_LOG" || true)

# Meaningful events for the email body (committed transitions, overrides,
# BLOCK verdicts). Everything else is plumbing noise at daily cadence.
MEANINGFUL=$(/usr/bin/printf '%s\n' "$WINDOW_EVENTS" | jq -r '
  select(.event == "transition_committed" or .event == "gate_override"
         or (.event == "gate_run" and (.details.severity? // "") == "BLOCK"))
  | if .event == "transition_committed" then
      "\(.ts)  \(.details.candidate | split("/") | last)  →  \(.details.new_state)"
    elif .event == "gate_override" then
      "\(.ts)  OVERRIDE \(.details.gate)  (\(.details.reason))"
    else
      "\(.ts)  BLOCK \(.details.gate)  \(.details.repo)"
    end' 2>/dev/null || true)
EVENT_COUNT=0
[[ -n "$MEANINGFUL" ]] && EVENT_COUNT=$(/usr/bin/printf '%s\n' "$MEANINGFUL" | /usr/bin/grep -c .)

# ── Action needed ────────────────────────────────────────────────────────────
ACTIONS=""
action() { ACTIONS+="$1"$'\n'; }

# Map each candidate to its last committed-transition timestamp (one jq pass).
declare -A LAST_TRANSITION=()
while IFS=$'\t' read -r ts cand; do
  [[ -n "$cand" ]] && LAST_TRANSITION["$cand"]="$ts"
done < <(jq -r 'select(.event == "transition_committed")
                | [.ts, .details.candidate] | @tsv' "$CLEAN_EVENTS_FILE" 2>/dev/null || true)

fm() { # fm <file> <key> — frontmatter value (first block only)
  /usr/bin/awk -v k="$2" '
    /^---[[:space:]]*$/ { b++; if (b==2) exit; next }
    b==1 && $0 ~ "^"k":" { sub("^"k":[[:space:]]*",""); gsub(/^[[:space:]]+|[[:space:]]+$/,""); print; exit }
  ' "$1"
}

days_since() { # days_since <iso-ts-or-empty> <fallback-file>
  local ts="$1" f="$2" epoch
  if [[ -n "$ts" ]]; then
    epoch=$(/usr/bin/date -d "$ts" +%s 2>/dev/null || echo "")
  fi
  [[ -z "${epoch:-}" ]] && epoch=$(/usr/bin/stat -c %Y "$f" 2>/dev/null || echo "$NOW_EPOCH")
  echo $(( (NOW_EPOCH - epoch) / 86400 ))
}

STALE_CLAIMS=0 QUIET_PRS=0
if [[ -d "$CAND_DIR" ]]; then
  for c in "$CAND_DIR"/*.md; do
    [[ -f "$c" ]] || continue
    status=$(fm "$c" "status")
    base=$(/usr/bin/basename "$c")
    case "$status" in
      claimed|working)
        d=$(days_since "${LAST_TRANSITION[$c]:-}" "$c")
        if [[ "$d" -ge "$CLAIM_STALE_DAYS" ]]; then
          STALE_CLAIMS=$((STALE_CLAIMS + 1))
          [[ "$STALE_CLAIMS" -le 5 ]] && action "STALE CLAIM  ${base}  (${status} ${d}d) — post a progress update upstream or release the claim"
        fi ;;
      submitted)
        d=$(days_since "$(fm "$c" "last_refreshed")" "$c")
        if [[ "$d" -ge "$PR_WAIT_DAYS" ]]; then
          QUIET_PRS=$((QUIET_PRS + 1))
          [[ "$QUIET_PRS" -le 5 ]] && action "QUIET PR     ${base}  (${d}d since activity) — gentle ping upstream, or drop and move on"
        fi ;;
    esac
    # Backfilled PR candidates carry state: (not status:) and fall through the
    # case untouched — historical records, not in-flight work.
  done
fi
[[ "$STALE_CLAIMS" -gt 5 ]] && action "…and $((STALE_CLAIMS - 5)) more stale claims (see dashboard)"
[[ "$QUIET_PRS"   -gt 5 ]] && action "…and $((QUIET_PRS - 5)) more quiet PRs (see dashboard)"

RECENT_OVERRIDES=$(jq -r --arg since "$(/usr/bin/date -u -d "@$(( NOW_EPOCH - 7 * 86400 ))" +%Y-%m-%dT%H:%M:%SZ)" \
  '[inputs] | map(select(.event == "gate_override" and (.ts? >= $since))) | length' \
  -n "$CLEAN_EVENTS_FILE" 2>/dev/null || echo 0)
if [[ "$RECENT_OVERRIDES" -gt 0 ]]; then
  action "OVERRIDES    $RECENT_OVERRIDES gate override(s) in the last 7d — review: audit-overrides.sh --since=7"
fi

ACTION_COUNT=0
[[ -n "$ACTIONS" ]] && ACTION_COUNT=$(/usr/bin/printf '%s' "$ACTIONS" | /usr/bin/grep -c .)

# ── pipeline count (for subject + heartbeat) ─────────────────────────────────
PIPELINE_COUNT=0
if [[ -d "$CAND_DIR" ]]; then
  PIPELINE_COUNT=$(/usr/bin/grep -lE '^status: (shortlist|claimed|working|submitted)$' "$CAND_DIR"/*.md 2>/dev/null | /usr/bin/wc -l)
fi

# ── compose ──────────────────────────────────────────────────────────────────
html_escape() { /usr/bin/sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

PROOF="${PARSEABLE}/${LINES_SCANNED} log lines parsed OK"
[[ "$MALFORMED" -gt 0 ]] && PROOF+=" (${MALFORMED} malformed lines skipped — historical torn entries)"

HTML_FILE=$(/usr/bin/mktemp -t contribute-recap-XXXXXX.html)

if [[ "$ACTION_COUNT" -eq 0 && "$EVENT_COUNT" -eq 0 ]]; then
  # Quiet-day collapse — valid ONLY because the log read succeeded above.
  SUBJECT="contribute: quiet day — $PIPELINE_COUNT in pipeline ($TODAY)"
  {
    echo "<p><b>Quiet day.</b> No actions needed, no events in the last ${WINDOW_DAYS}d window."
    echo "Pipeline: ${PIPELINE_COUNT} active candidate(s)."
    echo "<i>(positive proof: ${PROOF})</i></p>"
  } > "$HTML_FILE"
else
  SUBJECT="contribute daily recap: ${ACTION_COUNT} action(s), ${EVENT_COUNT} event(s) ($TODAY)"
  {
    echo "<h2>Action needed (${ACTION_COUNT})</h2>"
    if [[ "$ACTION_COUNT" -gt 0 ]]; then
      echo "<pre>$(/usr/bin/printf '%s' "$ACTIONS" | html_escape)</pre>"
    else
      echo "<p>Nothing needs a decision today.</p>"
    fi
    echo "<h2>Where we are</h2>"
    echo "<pre>$(CONTRIBUTE_STATE_DIR="$STATE_DIR" "$SCRIPT_DIR/dashboard.sh" --no-box 2>/dev/null | html_escape)</pre>"
    echo "<h2>Last ${WINDOW_DAYS}d events (${EVENT_COUNT})</h2>"
    if [[ "$EVENT_COUNT" -gt 0 ]]; then
      echo "<pre>$(/usr/bin/printf '%s\n' "$MEANINGFUL" | /usr/bin/head -40 | html_escape)</pre>"
    else
      echo "<p>None.</p>"
    fi
    echo "<h2>Override trend (7d)</h2>"
    echo "<pre>$(CONTRIBUTE_STATE_DIR="$STATE_DIR" "$SCRIPT_DIR/audit-overrides.sh" --since=7 2>/dev/null | html_escape)</pre>"
    echo "<p><i>${PROOF}. Window: fixed ${WINDOW_DAYS}d, no watermark by design.</i></p>"
  } > "$HTML_FILE"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Subject: $SUBJECT"
  /usr/bin/cat "$HTML_FILE"
  exit 0
fi

log "sending recap to $TO — $SUBJECT"
if /usr/bin/timeout 120 node "$EMAIL_SCRIPT" --to "$TO" --subject "$SUBJECT" --html "$HTML_FILE" >>"$RUN_LOG" 2>&1; then
  log "OK: recap sent"
  NOTIFIED=1
else
  log "FAILED: send-email.cjs non-zero"
  FAILS=$(count_consecutive_failures "$LOG_DIR" "run-*.log" "FAILED|ABNORMAL|READ FAILURE" 10)
  [[ "$FAILS" -ge 3 ]] && slack_fail "contribute-daily-recap" "${FAILS} consecutive failures"
  exit 1
fi
exit 0
