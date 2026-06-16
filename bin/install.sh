#!/usr/bin/env bash
# install.sh — install the /contribute skill from this repo into ~/.claude/skills/contribute/.
#
# Two modes:
#   default   COPY the skill into ~/.claude/skills/contribute/ (production install).
#             Edits to the installed copy DON'T flow back to the repo. Safer for
#             non-contributors.
#   --symlink SYMLINK ~/.claude/skills/contribute/ → <repo>/skills/contribute/.
#             Edits land in the repo, so `git status` shows your work in real time.
#             Recommended for contributors / developers.
#
# In BOTH modes it also deploys the runtime mirror: ~/.contribute-system/bin/ is
# made a copy (or symlink) of skills/contribute/scripts/. The PreToolUse hook,
# transition.sh, the scout pipeline, researcher-build.sh, and gate-runner.sh all
# execute from there — keeping it in lock-step with the repo is what prevents the
# "deploy-only script silently goes stale/missing" failure (contributing-clanker-bab).
# Verify any time with scripts/doctor.sh. Override the target with CONTRIBUTE_BIN_DIR.
#
# Re-running is idempotent. Pass --force to clobber an existing install.
#
# Usage:
#   bin/install.sh                  # copy install (skill + runtime mirror)
#   bin/install.sh --symlink         # dev install (edits live)
#   bin/install.sh --force           # overwrite existing install + re-sync runtime mirror
#   bin/install.sh --uninstall       # remove ~/.claude/skills/contribute/ + runtime mirror

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/skills/contribute"
# Skill + runtime-mirror targets. Both overridable via env for tests.
DEST="${CONTRIBUTE_SKILL_DIR:-$HOME/.claude/skills/contribute}"
SCRIPTS_SRC="$SRC/scripts"
# Runtime mirror target. The hook + transition + scout + researcher + gate-runner
# execute from here. Overridable for tests via CONTRIBUTE_BIN_DIR.
BIN_DEST="${CONTRIBUTE_BIN_DIR:-$HOME/.contribute-system/bin}"

MODE="copy"
FORCE=0
UNINSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --symlink)   MODE="symlink" ;;
    --copy)      MODE="copy" ;;
    --force)     FORCE=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help)
      /usr/bin/sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      printf 'unknown arg: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

if [[ "$UNINSTALL" -eq 1 ]]; then
  if [[ -L "$DEST" ]]; then
    /usr/bin/rm "$DEST"
    printf '  ✓ removed symlink %s\n' "$DEST"
  elif [[ -d "$DEST" ]]; then
    /usr/bin/rm -rf "$DEST"
    printf '  ✓ removed directory %s\n' "$DEST"
  else
    printf '  (nothing to uninstall — %s does not exist)\n' "$DEST"
  fi
  # Remove the runtime mirror too. bin/ holds only deployed scripts — never user
  # data (candidates/, research/, gates/, log.jsonl are siblings), so this is safe.
  if [[ -L "$BIN_DEST" ]]; then
    /usr/bin/rm "$BIN_DEST"
    printf '  ✓ removed runtime symlink %s\n' "$BIN_DEST"
  elif [[ -d "$BIN_DEST" ]]; then
    /usr/bin/rm -rf "$BIN_DEST"
    printf '  ✓ removed runtime mirror %s\n' "$BIN_DEST"
  fi
  exit 0
fi

if [[ ! -d "$SRC" ]]; then
  printf 'error: skill source not found at %s\n' "$SRC" >&2
  printf '       (this script expects to run from within the contributing-clanker repo)\n' >&2
  exit 1
fi

if [[ -e "$DEST" || -L "$DEST" ]]; then
  if [[ "$FORCE" -ne 1 ]]; then
    printf 'destination already exists: %s\n' "$DEST" >&2
    printf '  re-run with --force to overwrite, or --uninstall to remove first.\n' >&2
    exit 1
  fi
  /usr/bin/rm -rf "$DEST"
fi

/usr/bin/mkdir -p "$(dirname "$DEST")"

case "$MODE" in
  symlink)
    /usr/bin/ln -s "$SRC" "$DEST"
    printf '  ✓ symlinked %s → %s\n' "$DEST" "$SRC"
    printf '    (edits to the installed skill land in the repo — git status will show them)\n'
    ;;
  copy)
    /usr/bin/cp -r "$SRC" "$DEST"
    printf '  ✓ copied skill to %s\n' "$DEST"
    printf '    (edits to %s WILL NOT flow back to the repo — this is a production install)\n' "$DEST"
    ;;
esac

# Smoke-check: verify SKILL.md is reachable and a sample gate runs
if [[ -f "$DEST/SKILL.md" ]] && [[ -x "$DEST/scripts/gate-runner.sh" ]]; then
  printf '  ✓ skill is invocable (SKILL.md present, gate-runner executable)\n'
else
  printf '  ⚠ install completed but SKILL.md or gate-runner.sh missing — check %s\n' "$DEST" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Deploy the runtime mirror. ~/.contribute-system/bin/ is a copy (or symlink)
# of skills/contribute/scripts/ — the dir the hook, transition.sh, scout
# pipeline, researcher-build.sh, and gate-runner.sh actually run from. bin/
# holds NO user data (candidates/, research/, gates/ overrides, log.jsonl are
# siblings), so it is always safe to clobber and re-mirror. This is the AC for
# contributing-clanker-bab — without it, runtime scripts drift or go missing.
# ---------------------------------------------------------------------------
/usr/bin/mkdir -p "$(dirname "$BIN_DEST")"
[[ -L "$BIN_DEST" || -e "$BIN_DEST" ]] && /usr/bin/rm -rf "$BIN_DEST"
case "$MODE" in
  symlink) /usr/bin/ln -s "$SCRIPTS_SRC" "$BIN_DEST"
           printf '  ✓ symlinked runtime mirror %s → %s\n' "$BIN_DEST" "$SCRIPTS_SRC" ;;
  copy)    /usr/bin/cp -r "$SCRIPTS_SRC" "$BIN_DEST"
           printf '  ✓ mirrored runtime scripts to %s\n' "$BIN_DEST" ;;
esac

# Verify the mirror with the AC4 checker (compares repo source ↔ deployed copy).
if CONTRIBUTE_BIN_DIR="$BIN_DEST" "$SCRIPTS_SRC/doctor.sh" >/dev/null 2>&1; then
  printf '  ✓ runtime mirror verified (scripts/doctor.sh: in sync)\n'
else
  printf '  ⚠ runtime mirror drift after deploy — run scripts/doctor.sh for detail\n' >&2
  exit 1
fi

printf '\nNext steps:\n'
printf '  • Restart Claude Code to pick up the new skill (or reload skills if your harness supports it)\n'
printf '  • Verify with /contribute (the skill should activate)\n'
printf '  • Runtime state directory will be created on first invocation at ~/.contribute-system/\n'
