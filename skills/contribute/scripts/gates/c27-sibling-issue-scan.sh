#!/usr/bin/env bash
# Catalog: C27 — Sibling-issue scan (root-cause detection)
# Mitigates: drafting a fix at the wrong layer. When a bug has 3+ siblings
# in the tracker or a maintainer-authored "Reconsider/RFC/Discuss" issue
# exists on the same component, you're likely patching a SYMPTOM. Hours of
# polished work at the wrong layer is the typical outcome — see the
# 2026-05-20 incident in lessons/.
#
# Incident reference: gastownhall/beads PR #4061 + issue #4062 — maintainer
# @maphew opened a "reconsider the default" issue listing #3848 (the bug
# #4061 fixes) alongside 8 sibling issues, hours after #4061 was submitted.
#
# Lesson source: ~/.contribute-system/lessons/2026-05-20-symptom-vs-root-cause-detection.md
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input

# Only run pre-open-pr (after PR is open, the scan is too late to act on).
if [[ "$GATE_ACTION" != "open-pr" ]]; then
  gate_skip "not pre-open-pr (action=$GATE_ACTION)"
fi

ISSUE_NUM=$(fm_field "$GATE_CANDIDATE_PATH" "issue_number")
if [[ -z "$ISSUE_NUM" || "$ISSUE_NUM" == "null" ]]; then
  gate_skip "candidate has no issue_number — sibling scan keyed off the target issue"
fi

if [[ -z "$GATE_REPO" ]]; then
  gate_skip "no repo in env"
fi

# --- 1. fetch target issue's title for keyword extraction ---
ISSUE_TITLE=$(gh_safe api "repos/${GATE_REPO}/issues/${ISSUE_NUM}" --jq '.title // ""' 2>/dev/null || /usr/bin/echo "")
if [[ -z "$ISSUE_TITLE" ]]; then
  gate_inform "could not fetch target issue #${ISSUE_NUM}; skipping sibling scan"
fi

# Pull the first significant word (≥6 chars, lowercase) — usually the
# meaningful noun: "auto-export", "throttle", "pre-commit", etc.
# Strip code blocks / quotes first.
KEYWORD=$(/usr/bin/printf '%s' "$ISSUE_TITLE" | /usr/bin/tr -d '`"' | /usr/bin/grep -oE '[a-zA-Z][a-zA-Z-]{5,}' | /usr/bin/head -1 | /usr/bin/tr 'A-Z' 'a-z')
if [[ -z "$KEYWORD" ]]; then
  gate_skip "could not extract keyword from title: $ISSUE_TITLE"
fi

# --- 2. sibling search: open issues mentioning the same keyword ---
SIBLINGS_JSON=$(gh_safe search issues --repo "$GATE_REPO" --state open "$KEYWORD" --limit 20 --json number,title 2>/dev/null || /usr/bin/echo "[]")
SIBLING_COUNT=$(/usr/bin/printf '%s' "$SIBLINGS_JSON" | jq -r --arg target "$ISSUE_NUM" '[.[] | select(.number != ($target | tonumber))] | length' 2>/dev/null || /usr/bin/echo "0")

# --- 3. maintainer reframe scan: recent "Reconsider/RFC/Discuss" issues ---
SINCE=$(/usr/bin/date -u -d '180 days ago' '+%Y-%m-%d' 2>/dev/null || /usr/bin/date -u -v-180d '+%Y-%m-%d' 2>/dev/null || /usr/bin/echo '2025-11-01')
RECONSIDER_JSON=$(gh_safe search issues --repo "$GATE_REPO" --state open "Reconsider in:title OR RFC in:title OR Discuss in:title" --created ">${SINCE}" --limit 5 --json number,title 2>/dev/null || /usr/bin/echo "[]")
RECONSIDER_COUNT=$(/usr/bin/printf '%s' "$RECONSIDER_JSON" | jq -r 'length' 2>/dev/null || /usr/bin/echo "0")

# --- 4. verdict ---
if [[ "$SIBLING_COUNT" -ge 3 ]]; then
  TOPS=$(/usr/bin/printf '%s' "$SIBLINGS_JSON" | jq -r --arg target "$ISSUE_NUM" \
    '[.[] | select(.number != ($target | tonumber)) | "#\(.number) \(.title[:60])"] | .[0:3] | join("; ")' 2>/dev/null || /usr/bin/echo "")
  gate_warn \
    "issue #${ISSUE_NUM} has ${SIBLING_COUNT} sibling open issue(s) on '${KEYWORD}' — possible class-of-bug not unique bug. Top: ${TOPS}" \
    "post a design comment on #${ISSUE_NUM} before drafting. see ~/.contribute-system/lessons/2026-05-20-symptom-vs-root-cause-detection.md"
fi

if [[ "$RECONSIDER_COUNT" -ge 1 ]]; then
  RECONSIDER_TITLES=$(/usr/bin/printf '%s' "$RECONSIDER_JSON" | jq -r '[.[] | "#\(.number) \(.title[:80])"] | join("; ")' 2>/dev/null || /usr/bin/echo "")
  gate_warn \
    "${RECONSIDER_COUNT} recent maintainer Reconsider/RFC/Discuss issue(s) open on ${GATE_REPO}: ${RECONSIDER_TITLES}" \
    "check whether your fix's layer is the layer the maintainer is reconsidering. see ~/.contribute-system/lessons/2026-05-20-symptom-vs-root-cause-detection.md"
fi

gate_pass "sibling scan: ${SIBLING_COUNT} siblings on '${KEYWORD}' (threshold 3), ${RECONSIDER_COUNT} reframe issues in last 180d"
