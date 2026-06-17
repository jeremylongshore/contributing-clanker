#!/usr/bin/env bash
# scout-discover.sh
# Discover OSS contribution candidates via the gh CLI. Emits one JSON object
# per line on stdout (JSONL). The scout subagent pipes this into scout-score.py.
#
# Usage: scout-discover.sh <mode> <tier> <langs-csv>
#   mode:  baseline | refresh | adhoc
#   tier:  emerging|growing|established|mainstream|major|flagship
#   langs: comma-separated, e.g. "typescript,python,rust"
#
# Exits non-zero on rate-limit, missing gh auth, or invalid tier.

set -euo pipefail

# Arg parsing: positional (mode, tier, langs-csv) for tier-search mode, plus an
# optional --repos=<owner/repo,...> flag for surgical targeting of a known list
# (bead 8fp — e.g. the MCP target list in 000-docs/012). With --repos, tier and
# langs are not needed (the repo set is explicit); tier defaults to 'targeted'.
REPOS_CSV=""
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repos=*) REPOS_CSV="${1#--repos=}" ;;
    --repos)   shift; REPOS_CSV="${1:-}" ;;
    *)         POSITIONAL+=("$1") ;;
  esac
  shift
done
MODE="${POSITIONAL[0]:-}"
TIER="${POSITIONAL[1]:-}"
LANGS_CSV="${POSITIONAL[2]:-}"

if [[ -n "$REPOS_CSV" ]]; then
  [[ -z "$MODE" ]] && MODE="adhoc"
  [[ -z "$TIER" ]] && TIER="targeted"
elif [[ -z "$MODE" || -z "$TIER" || -z "$LANGS_CSV" ]]; then
  echo "usage: $0 <mode> <tier> <langs-csv>" >&2
  echo "       $0 [<mode>] --repos=<owner/repo,owner/repo,...>   (surgical mode)" >&2
  exit 64
fi

# Tier → star-range qualifier (only needed for tier-search mode)
if [[ -z "$REPOS_CSV" ]]; then
  case "$TIER" in
    emerging)    STAR_QUAL="stars:<100" ;;
    growing)     STAR_QUAL="stars:100..500" ;;
    established) STAR_QUAL="stars:500..1000" ;;
    mainstream)  STAR_QUAL="stars:1000..5000" ;;
    major)       STAR_QUAL="stars:5000..10000" ;;
    flagship)    STAR_QUAL="stars:>10000" ;;
    *) echo "unknown tier: $TIER" >&2; exit 64 ;;
  esac
fi

# gh auth check
if ! gh auth status >/dev/null 2>&1; then
  echo "gh: not authenticated" >&2
  exit 65
fi

if [[ -n "$REPOS_CSV" ]]; then
  # Surgical mode (8fp): build the repo set from the explicit target list by
  # fetching each repo's metadata. Same shape as the tier-search output below,
  # so the per-repo issue loop is identical.
  IFS=',' read -ra TARGET_REPOS <<< "$REPOS_CSV"
  REPOS_JSON=$(
    for r in "${TARGET_REPOS[@]}"; do
      [[ -z "$r" ]] && continue
      gh api "repos/$r" --jq '{
        fullName: .full_name,
        stargazersCount: .stargazers_count,
        language: (.language // "unknown"),
        updatedAt: .updated_at,
        description: (.description // ""),
        url: .html_url
      }' 2>/dev/null || /usr/bin/echo "scout-discover: skipping unresolvable repo $r" >&2
    done | jq -sc '.'
  )
else
  # Tier-search mode: discover repos in the tier matching a preferred language.
  # Sort by recently-updated to bias toward active maintainers. --limit 30.
  # Build language qualifier (gh search accepts repeated language: filters).
  IFS=',' read -ra LANGS <<< "$LANGS_CSV"
  LANG_QUAL=""
  for l in "${LANGS[@]}"; do
    LANG_QUAL+="language:$l "
  done
  REPOS_JSON=$(
    # shellcheck disable=SC2086  # LANG_QUAL is an intentional word-split: each
    # "language:X" must reach `gh search` as a SEPARATE argument (and empty when
    # no langs are configured). Quoting it would pass one combined/empty arg.
    gh search repos \
      "$STAR_QUAL" $LANG_QUAL "archived:false" "is:public" \
      --sort updated \
      --limit 30 \
      --json fullName,stargazersCount,language,updatedAt,description,url \
    2>/dev/null
  )
fi

if [[ -z "$REPOS_JSON" || "$REPOS_JSON" == "[]" ]]; then
  exit 0
fi

# For each repo, search for approachable issues with no competing PRs.
# Emit one candidate JSON per (repo, issue) pair.
echo "$REPOS_JSON" | jq -c '.[]' | while read -r repo_obj; do
  REPO_FULL=$(echo "$repo_obj" | jq -r '.fullName')
  STARS=$(echo "$repo_obj" | jq -r '.stargazersCount')
  REPO_LANG=$(echo "$repo_obj" | jq -r '.language // "unknown"')
  UPDATED=$(echo "$repo_obj" | jq -r '.updatedAt')
  REPO_URL=$(echo "$repo_obj" | jq -r '.url')

  # wl9: verify the fix can plausibly live in THIS repo's code before queueing.
  # Deterministic part — drop repos that merge NO substantive code: pure
  # issue-tracker / roadmap / docs-only repos where surgical PRs are impossible.
  # Heuristic: sample recent merged PRs; if none carry a >10-LOC diff, the repo
  # isn't a code-contribution target. (Surfaced 2026-05-04 from wgd.3.)
  #
  # LIMITATION (verified 2026-06-16): this does NOT catch the harder context7
  # pattern — a SaaS whose public repo HAS substantive code (the MCP client) but
  # whose *issues* are about a PRIVATE backend (doc-extraction data). context7
  # passes this check (9/10 recent merges are substantive); only per-issue
  # judgment distinguishes "fixable here" from "lives in the backend". That
  # judgment is @scout agent guidance (agents/scout.md § fix-locality), not a
  # repo-level heuristic — a description/README scan would false-drop legit repos.
  SUBSTANTIVE_MERGES=$(
    gh pr list --repo "$REPO_FULL" --state merged --limit 10 \
      --json additions,deletions 2>/dev/null \
      | jq '[.[] | select((.additions + .deletions) > 10)] | length' 2>/dev/null \
      || echo 0
  )
  if [[ "${SUBSTANTIVE_MERGES:-0}" -eq 0 ]] ; then
    /usr/bin/echo "scout-discover: dropping $REPO_FULL — no recent merged PR with a substantive code diff (pure issue-tracker / no-code repo, wl9)" >&2
    continue
  fi

  # Look for approachable open issues; prefer 'good first issue' > 'help wanted'
  # NOTE: use `gh issue list --repo` (list API), NOT `gh search issues` —
  # the search-issues endpoint silently returns [] for repo-scoped label
  # queries that the issues-list endpoint handles correctly.
  for LABEL in "good first issue" "help wanted"; do
    ISSUES_JSON=$(
      gh issue list \
        --repo "$REPO_FULL" \
        --label "$LABEL" \
        --state open \
        --limit 5 \
        --json number,title,url,labels,createdAt,updatedAt,assignees \
      2>/dev/null
    ) || continue

    [[ -z "$ISSUES_JSON" || "$ISSUES_JSON" == "[]" ]] && continue

    echo "$ISSUES_JSON" | jq -c '.[]' | while read -r issue_obj; do
      ISSUE_NUM=$(echo "$issue_obj" | jq -r '.number')
      ISSUE_TITLE=$(echo "$issue_obj" | jq -r '.title')
      ISSUE_URL=$(echo "$issue_obj" | jq -r '.url')
      ISSUE_LABELS=$(echo "$issue_obj" | jq -c '[.labels[].name]')

      # Drop if anyone is assigned to the issue. Conservative rule: ANY
      # assignee = someone is on it. Tracer-Cloud opensre #1129 trap
      # (2026-05-02): unKnownNG was assigned the day before scout's run and
      # was actively asking the maintainer clarifying questions. Without this
      # check, scout would have flagged an in-flight issue at 90% probability.
      # See ~/.claude/agent-memory/scout/MEMORY.md.
      ASSIGNEES_CSV=$(echo "$issue_obj" | jq -r '[.assignees[].login] | join(",")')
      if [[ -n "$ASSIGNEES_CSV" ]] ; then
        /usr/bin/echo "scout-discover: dropping $REPO_FULL#$ISSUE_NUM — assigned to [$ASSIGNEES_CSV]" >&2
        continue
      fi

      # Count competing PRs that mention this issue number
      COMPETING_PRS=$(
        gh pr list --repo "$REPO_FULL" --state open --search "$ISSUE_NUM in:title,body" \
          --limit 5 --json number 2>/dev/null \
          | jq 'length' 2>/dev/null || echo 0
      )

      # Drop if the work has already shipped — search for a merged PR claiming
      # to close/fix/resolve this exact issue (GitHub's three auto-close
      # keywords). PostHog #55412 trap (2026-05-02): issue stays "open" but a
      # merged PR already implemented the fix; without this check, scout flags
      # the candidate at high score and a contributor almost wastes a day on a
      # duplicate. See ~/.claude/agent-memory/scout/MEMORY.md.
      #
      # Note: gh search uses --merged (NOT --state=merged), and the literal
      # "X OR Y OR Z" phrase is searched as a string, so we must run 3 calls.
      ALREADY_SHIPPED_PR=""
      for KW in closes fixes resolves ; do
        HIT=$(
          gh search prs --repo="$REPO_FULL" "$KW #$ISSUE_NUM" \
            --merged --limit 1 --json url 2>/dev/null \
            | jq -r '.[0].url // empty' 2>/dev/null
        )
        if [[ -n "$HIT" ]] ; then
          ALREADY_SHIPPED_PR="$HIT"
          break
        fi
      done
      if [[ -n "$ALREADY_SHIPPED_PR" ]] ; then
        /usr/bin/echo "scout-discover: dropping $REPO_FULL#$ISSUE_NUM — already shipped in $ALREADY_SHIPPED_PR" >&2
        continue
      fi

      jq -nc \
        --arg repo "$REPO_FULL" \
        --argjson issue_num "$ISSUE_NUM" \
        --arg issue_title "$ISSUE_TITLE" \
        --arg issue_url "$ISSUE_URL" \
        --argjson stars "$STARS" \
        --arg lang "$REPO_LANG" \
        --arg updated "$UPDATED" \
        --arg repo_url "$REPO_URL" \
        --arg tier "$TIER" \
        --arg label "$LABEL" \
        --argjson labels "$ISSUE_LABELS" \
        --argjson competing "${COMPETING_PRS:-0}" \
        --arg mode "$MODE" \
        '{
          mode: $mode,
          repo: $repo,
          issue_number: $issue_num,
          issue_title: $issue_title,
          issue_url: $issue_url,
          star_count: $stars,
          star_tier: $tier,
          repo_lang: $lang,
          repo_updated_at: $updated,
          repo_url: $repo_url,
          primary_label: $label,
          labels: $labels,
          competing_prs: $competing
        }'
    done
  done
done
