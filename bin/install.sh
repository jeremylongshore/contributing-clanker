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
# Re-running is idempotent. Pass --force to clobber an existing install.
#
# Usage:
#   bin/install.sh                  # copy install
#   bin/install.sh --symlink         # dev install (edits live)
#   bin/install.sh --force           # overwrite existing install
#   bin/install.sh --uninstall       # remove ~/.claude/skills/contribute/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/skills/contribute"
DEST="$HOME/.claude/skills/contribute"

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

printf '\nNext steps:\n'
printf '  • Restart Claude Code to pick up the new skill (or reload skills if your harness supports it)\n'
printf '  • Verify with /contribute (the skill should activate)\n'
printf '  • Runtime state directory will be created on first invocation at ~/.contribute-system/\n'
