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
# TSV rows: ts <TAB> kind <TAB> detail — rendered as an HTML table.
MEANINGFUL=$(/usr/bin/printf '%s\n' "$WINDOW_EVENTS" | jq -r '
  select(.event == "transition_committed" or .event == "gate_override"
         or (.event == "gate_run" and (.details.severity? // "") == "BLOCK"))
  | (if .event == "transition_committed" then
      [.ts, "state-change", "\(.details.candidate | split("/") | last) → \(.details.new_state)"]
    elif .event == "gate_override" then
      [.ts, "override", "\(.details.gate): \(.details.reason)"]
    else
      [.ts, "block", "\(.details.gate) — \(.details.repo)"]
    end) | @tsv' 2>/dev/null || true)
EVENT_COUNT=0
[[ -n "$MEANINGFUL" ]] && EVENT_COUNT=$(/usr/bin/printf '%s\n' "$MEANINGFUL" | /usr/bin/grep -c .)

# ── Action needed ────────────────────────────────────────────────────────────
# Rows are TAB-separated: type <TAB> item <TAB> age <TAB> suggested next step.
# Rendered as a real HTML table — never a raw text dump (house email style,
# per blog-packet-html.cjs / the weekly growth rollup).
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
# Pipeline funnel counters (same effective-status rollup dashboard.sh uses:
# backfilled PR candidates carry state: not status: — merged→merged,
# closed→dropped, open→submitted).
F_OPEN=0 F_SHORTLIST=0 F_CLAIMED=0 F_WORKING=0 F_SUBMITTED=0 F_MERGED=0 F_DROPPED=0
IN_FLIGHT=""   # TSV rows: item <TAB> status <TAB> age
if [[ -d "$CAND_DIR" ]]; then
  for c in "$CAND_DIR"/*.md; do
    [[ -f "$c" ]] || continue
    status=$(fm "$c" "status")
    base=$(/usr/bin/basename "$c")
    eff="$status"
    if [[ -z "$eff" ]]; then
      case "$(fm "$c" "state")" in
        merged) eff="merged" ;; closed) eff="dropped" ;; open) eff="submitted" ;;
      esac
    fi
    case "$eff" in
      open)      F_OPEN=$((F_OPEN + 1)) ;;
      shortlist) F_SHORTLIST=$((F_SHORTLIST + 1)) ;;
      claimed)   F_CLAIMED=$((F_CLAIMED + 1)) ;;
      working)   F_WORKING=$((F_WORKING + 1)) ;;
      submitted) F_SUBMITTED=$((F_SUBMITTED + 1)) ;;
      merged)    F_MERGED=$((F_MERGED + 1)) ;;
      dropped)   F_DROPPED=$((F_DROPPED + 1)) ;;
    esac
    case "$status" in
      claimed|working)
        d=$(days_since "${LAST_TRANSITION[$c]:-}" "$c")
        IN_FLIGHT+="${base}"$'\t'"${status}"$'\t'"${d}d"$'\n'
        if [[ "$d" -ge "$CLAIM_STALE_DAYS" ]]; then
          STALE_CLAIMS=$((STALE_CLAIMS + 1))
          [[ "$STALE_CLAIMS" -le 5 ]] && action "Stale claim"$'\t'"${base}"$'\t'"${status} ${d}d"$'\t'"Post a progress update upstream or release the claim"
        fi ;;
      submitted)
        d=$(days_since "$(fm "$c" "last_refreshed")" "$c")
        IN_FLIGHT+="${base}"$'\t'"${status}"$'\t'"${d}d"$'\n'
        if [[ "$d" -ge "$PR_WAIT_DAYS" ]]; then
          QUIET_PRS=$((QUIET_PRS + 1))
          [[ "$QUIET_PRS" -le 5 ]] && action "Quiet PR"$'\t'"${base}"$'\t'"${d}d quiet"$'\t'"Gentle ping upstream, or drop and move on"
        fi ;;
    esac
  done
fi
[[ "$STALE_CLAIMS" -gt 5 ]] && action "Stale claims"$'\t'"+$((STALE_CLAIMS - 5)) more"$'\t'"—"$'\t'"Run dashboard.sh for the full list"
[[ "$QUIET_PRS"   -gt 5 ]] && action "Quiet PRs"$'\t'"+$((QUIET_PRS - 5)) more"$'\t'"—"$'\t'"Run dashboard.sh for the full list"

RECENT_OVERRIDES=$(jq -r --arg since "$(/usr/bin/date -u -d "@$(( NOW_EPOCH - 7 * 86400 ))" +%Y-%m-%dT%H:%M:%SZ)" \
  '[inputs] | map(select(.event == "gate_override" and (.ts? >= $since))) | length' \
  -n "$CLEAN_EVENTS_FILE" 2>/dev/null || echo 0)
if [[ "$RECENT_OVERRIDES" -gt 0 ]]; then
  action "Overrides"$'\t'"${RECENT_OVERRIDES} gate override(s) in 7d"$'\t'"—"$'\t'"Review the trend table below / audit-overrides.sh --since=7"
fi

ACTION_COUNT=0
[[ -n "$ACTIONS" ]] && ACTION_COUNT=$(/usr/bin/printf '%s' "$ACTIONS" | /usr/bin/grep -c .)

# ── pipeline count (for subject + heartbeat) ─────────────────────────────────
PIPELINE_COUNT=0
if [[ -d "$CAND_DIR" ]]; then
  PIPELINE_COUNT=$(/usr/bin/grep -lE '^status: (shortlist|claimed|working|submitted)$' "$CAND_DIR"/*.md 2>/dev/null | /usr/bin/wc -l)
fi

# ── compose (house email template) ──────────────────────────────────────────
# Follows the Intent Solutions email design language (blog-packet-html.cjs /
# the weekly growth rollup): self-contained styled <div>, inline CSS only,
# max-width 720px, system font stack, tinted rounded cards, REAL tables —
# never raw text dumps. Every recap email follows this exact template.
esc() { /usr/bin/printf '%s' "$1" | /usr/bin/sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

PROOF="${PARSEABLE}/${LINES_SCANNED} log lines parsed OK"
[[ "$MALFORMED" -gt 0 ]] && PROOF+=" (${MALFORMED} malformed lines skipped — historical torn entries)"

# Shared inline styles (email clients ignore <style> blocks — inline only).
WRAP='font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:720px'
H2='font-size:16px;font-weight:700;margin:22px 0 8px;color:#1a1a1a'
TABLE='width:100%;border-collapse:collapse;font-size:14px'
TH='text-align:left;padding:6px 8px;border-bottom:2px solid #d0d7de;font-size:12px;color:#57606a;text-transform:uppercase;letter-spacing:.04em'
TD='padding:6px 8px;border-bottom:1px solid #eaeef2;vertical-align:top'
MUTED='color:#666;font-size:13px'
TILE='border:1px solid #d0d7de;border-radius:8px;padding:10px 12px;text-align:center'
GREEN_CARD='border:2px solid #1a7f37;background:#f0fff4;border-radius:8px;padding:14px;margin:0 0 16px'
AMBER_CARD='border:2px solid #b54708;background:#fffaeb;border-radius:8px;padding:14px;margin:0 0 16px'

badge() { # badge <kind> — colored pill for the events table
  case "$1" in
    state-change) echo '<span style="background:#ddf4ff;color:#0969da;border-radius:4px;padding:1px 7px;font-size:12px;font-weight:600">state change</span>' ;;
    override)     echo '<span style="background:#fff8c5;color:#9a6700;border-radius:4px;padding:1px 7px;font-size:12px;font-weight:600">override</span>' ;;
    block)        echo '<span style="background:#ffebe9;color:#b42318;border-radius:4px;padding:1px 7px;font-size:12px;font-weight:600">block</span>' ;;
    *)            echo "<span style=\"background:#eaeef2;color:#57606a;border-radius:4px;padding:1px 7px;font-size:12px;font-weight:600\">$(esc "$1")</span>" ;;
  esac
}

emit_header() {
  echo "<div style=\"${WRAP}\">"
  echo "<div style=\"border-bottom:3px solid #0969da;padding-bottom:10px;margin-bottom:16px\">"
  echo "  <div style=\"font-size:20px;font-weight:700\">🔧 Contribute Daily Recap</div>"
  echo "  <div style=\"${MUTED}\">$(/usr/bin/date '+%A, %B %-d, %Y') · OSS contribution command center · deterministic (no LLM)</div>"
  echo "</div>"
}

emit_footer() {
  echo "<p style=\"${MUTED};margin-top:20px\"><em>${PROOF} · fixed ${WINDOW_DAYS}d event window, no watermark by design · gates + reporters only, no LLM in this pipeline. — /contribute</em></p>"
  echo "</div>"
}

HTML_FILE=$(/usr/bin/mktemp -t contribute-recap-XXXXXX.html)

if [[ "$ACTION_COUNT" -eq 0 && "$EVENT_COUNT" -eq 0 ]]; then
  # Quiet-day collapse — valid ONLY because the log read succeeded above.
  SUBJECT="✅ contribute: quiet day — $PIPELINE_COUNT in pipeline ($TODAY)"
  {
    emit_header
    echo "<div style=\"${GREEN_CARD}\">"
    echo "  <strong style=\"color:#1a7f37;font-size:16px\">✅ Quiet day.</strong>"
    echo "  <p style=\"margin:6px 0 0\">No actions needed, no events in the last ${WINDOW_DAYS}d window. Pipeline: <strong>${PIPELINE_COUNT} active candidate(s)</strong>.</p>"
    echo "</div>"
    emit_footer
  } > "$HTML_FILE"
else
  SUBJECT="🔧 contribute daily recap: ${ACTION_COUNT} action(s), ${EVENT_COUNT} event(s) ($TODAY)"
  {
    emit_header

    # ① stat tiles
    A_COLOR="#1a7f37"; [[ "$ACTION_COUNT" -gt 0 ]] && A_COLOR="#b54708"
    echo "<table style=\"width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 16px\"><tr>"
    echo "  <td style=\"${TILE}\"><div style=\"font-size:22px;font-weight:700;color:${A_COLOR}\">${ACTION_COUNT}</div><div style=\"${MUTED}\">action needed</div></td>"
    echo "  <td style=\"${TILE}\"><div style=\"font-size:22px;font-weight:700\">${EVENT_COUNT}</div><div style=\"${MUTED}\">events (${WINDOW_DAYS}d)</div></td>"
    echo "  <td style=\"${TILE}\"><div style=\"font-size:22px;font-weight:700\">${PIPELINE_COUNT}</div><div style=\"${MUTED}\">in pipeline</div></td>"
    echo "  <td style=\"${TILE}\"><div style=\"font-size:22px;font-weight:700\">${RECENT_OVERRIDES}</div><div style=\"${MUTED}\">overrides (7d)</div></td>"
    echo "</tr></table>"

    # ② Action needed — amber card with a real table
    if [[ "$ACTION_COUNT" -gt 0 ]]; then
      echo "<div style=\"${AMBER_CARD}\">"
      echo "<strong style=\"color:#b54708;font-size:16px\">⚡ Action needed (${ACTION_COUNT})</strong>"
      echo "<table style=\"${TABLE};margin-top:10px\">"
      echo "<tr><th style=\"${TH}\">Type</th><th style=\"${TH}\">Item</th><th style=\"${TH}\">Age</th><th style=\"${TH}\">Suggested next step</th></tr>"
      while IFS=$'\t' read -r a_type a_item a_age a_next; do
        [[ -z "$a_type" ]] && continue
        echo "<tr><td style=\"${TD};white-space:nowrap\"><strong>$(esc "$a_type")</strong></td><td style=\"${TD};word-break:break-all\">$(esc "$a_item")</td><td style=\"${TD};white-space:nowrap\">$(esc "$a_age")</td><td style=\"${TD}\">$(esc "$a_next")</td></tr>"
      done <<< "$ACTIONS"
      echo "</table></div>"
    else
      echo "<div style=\"${GREEN_CARD}\"><strong style=\"color:#1a7f37\">✅ Nothing needs a decision today.</strong></div>"
    fi

    # ③ Pipeline — funnel counts + in-flight table
    echo "<div style=\"${H2}\">📊 Pipeline</div>"
    echo "<table style=\"${TABLE}\">"
    echo "<tr><th style=\"${TH}\">Open</th><th style=\"${TH}\">Shortlist</th><th style=\"${TH}\">Claimed</th><th style=\"${TH}\">Working</th><th style=\"${TH}\">Submitted</th><th style=\"${TH}\">Merged</th><th style=\"${TH}\">Dropped</th></tr>"
    echo "<tr><td style=\"${TD}\">${F_OPEN}</td><td style=\"${TD}\">${F_SHORTLIST}</td><td style=\"${TD}\">${F_CLAIMED}</td><td style=\"${TD}\">${F_WORKING}</td><td style=\"${TD}\"><strong>${F_SUBMITTED}</strong></td><td style=\"${TD};color:#1a7f37\"><strong>${F_MERGED}</strong></td><td style=\"${TD};color:#666\">${F_DROPPED}</td></tr>"
    echo "</table>"
    if [[ -n "$IN_FLIGHT" ]]; then
      echo "<div style=\"${H2};font-size:14px\">In flight</div>"
      echo "<table style=\"${TABLE}\">"
      echo "<tr><th style=\"${TH}\">Item</th><th style=\"${TH}\">Status</th><th style=\"${TH}\">Age</th></tr>"
      while IFS=$'\t' read -r f_item f_status f_age; do
        [[ -z "$f_item" ]] && continue
        echo "<tr><td style=\"${TD};word-break:break-all\">$(esc "$f_item")</td><td style=\"${TD};white-space:nowrap\">$(esc "$f_status")</td><td style=\"${TD};white-space:nowrap\">$(esc "$f_age")</td></tr>"
      done < <(/usr/bin/printf '%s' "$IN_FLIGHT" | /usr/bin/head -10)
      echo "</table>"
    fi

    # ④ events table
    echo "<div style=\"${H2}\">🗓 Last ${WINDOW_DAYS}d events (${EVENT_COUNT})</div>"
    if [[ "$EVENT_COUNT" -gt 0 ]]; then
      echo "<table style=\"${TABLE}\">"
      echo "<tr><th style=\"${TH}\">When (UTC)</th><th style=\"${TH}\">Event</th><th style=\"${TH}\">Detail</th></tr>"
      while IFS=$'\t' read -r e_ts e_kind e_detail; do
        [[ -z "$e_ts" ]] && continue
        e_when=$(/usr/bin/date -u -d "$e_ts" '+%b %-d %H:%M' 2>/dev/null || echo "$e_ts")
        echo "<tr><td style=\"${TD};white-space:nowrap\">$(esc "$e_when")</td><td style=\"${TD};white-space:nowrap\">$(badge "$e_kind")</td><td style=\"${TD};word-break:break-word\">$(esc "$e_detail")</td></tr>"
      done < <(/usr/bin/printf '%s\n' "$MEANINGFUL" | /usr/bin/head -40)
      echo "</table>"
      TOTAL_EVENTS=$(/usr/bin/printf '%s\n' "$MEANINGFUL" | /usr/bin/grep -c .)
      [[ "$TOTAL_EVENTS" -gt 40 ]] && echo "<p style=\"${MUTED}\">…and $((TOTAL_EVENTS - 40)) more (capped at 40).</p>"
    else
      echo "<p style=\"${MUTED}\">None.</p>"
    fi

    # ⑤ override trend table (from --json; empty → one calm line)
    echo "<div style=\"${H2}\">🛡 Override trend (7d)</div>"
    OVR_ROWS=$(CONTRIBUTE_STATE_DIR="$STATE_DIR" "$SCRIPT_DIR/audit-overrides.sh" --since=7 --json 2>/dev/null \
      | jq -r '.[] | [.gate, .overrides, .blocks, (if .override_rate == null then "n/a" else "\(.override_rate)%" end), .top_reason] | @tsv' 2>/dev/null || true)
    if [[ -n "$OVR_ROWS" ]]; then
      echo "<table style=\"${TABLE}\">"
      echo "<tr><th style=\"${TH}\">Gate</th><th style=\"${TH}\">Overrides</th><th style=\"${TH}\">Blocks</th><th style=\"${TH}\">Rate</th><th style=\"${TH}\">Top reason</th></tr>"
      while IFS=$'\t' read -r o_gate o_n o_b o_rate o_reason; do
        [[ -z "$o_gate" ]] && continue
        echo "<tr><td style=\"${TD};white-space:nowrap\"><strong>$(esc "$o_gate")</strong></td><td style=\"${TD}\">$(esc "$o_n")</td><td style=\"${TD}\">$(esc "$o_b")</td><td style=\"${TD}\">$(esc "$o_rate")</td><td style=\"${TD}\">$(esc "$o_reason")</td></tr>"
      done <<< "$OVR_ROWS"
      echo "</table>"
    else
      echo "<p style=\"${MUTED}\">No overrides in the last 7 days.</p>"
    fi

    emit_footer
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
