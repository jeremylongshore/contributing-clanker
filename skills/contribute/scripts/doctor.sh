#!/usr/bin/env bash
# doctor.sh — verify the deployed runtime mirror matches the repo source.
#
# The PreToolUse hook (precheck-hook.sh), transition.sh, the scout pipeline
# (scout-discover.sh / scout-score.py / scout-write.py / scout-refresh.py),
# researcher-build.sh, and gate-runner.sh all execute from
# ~/.contribute-system/bin/ — a DEPLOYED COPY of this repo's
# skills/contribute/scripts/ dir. If that copy drifts from the repo, or a
# script was never deployed, the safety architecture silently runs stale or
# partial. This command catches that drift.
#
# It is the AC4 check for contributing-clanker-bab: "verify repo sources and
# deployed copies match."
#
# Exit 0 = in sync (or dev symlink). Exit 1 = missing/drift. Exit 2 = bin absent.
#
# Usage:
#   scripts/doctor.sh                          # check ~/.contribute-system/bin
#   CONTRIBUTE_BIN_DIR=/tmp/bin scripts/doctor.sh   # check an alternate target (tests)

set -uo pipefail

# pwd -P resolves symlinks so the short-circuit below works regardless of whether
# doctor.sh is invoked from the repo or from a symlinked deploy at ~/.contribute-system/bin.
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"   # = skills/contribute/scripts (real path)
BIN="${CONTRIBUTE_BIN_DIR:-$HOME/.contribute-system/bin}"

if [[ ! -e "$BIN" ]]; then
  printf '✗ deployed runtime dir not found: %s\n' "$BIN" >&2
  printf '  fix: run  bin/install.sh   (deploys scripts/ → %s)\n' "$BIN" >&2
  exit 2
fi

# Dev-install short-circuit: if bin is a symlink resolving to the repo source,
# the mirror is identical by construction — nothing can drift.
if [[ "$(cd "$BIN" 2>/dev/null && pwd -P)" == "$SRC" ]]; then
  printf '✓ runtime mirror is a symlink to the repo source — in sync by construction\n'
  printf '  %s -> %s\n' "$BIN" "$SRC"
  exit 0
fi

missing=0 drift=0 ok=0 orphan=0

# 1. every source file must be present + byte-identical in the deployed dir
while IFS= read -r -d '' f; do
  rel="${f#"$SRC"/}"
  dep="$BIN/$rel"
  if [[ ! -e "$dep" ]]; then
    printf '  ✗ MISSING  %s\n' "$rel"; missing=$((missing+1))
  elif ! diff -q "$f" "$dep" >/dev/null 2>&1; then
    printf '  ⚠ DRIFT    %s\n' "$rel"; drift=$((drift+1))
  else
    ok=$((ok+1))
  fi
done < <(find "$SRC" -type f -print0)

# 2. files deployed but absent from the repo (stale leftovers from old installs)
while IFS= read -r -d '' f; do
  rel="${f#"$BIN"/}"
  [[ -e "$SRC/$rel" ]] || { printf '  ? ORPHAN   %s (deployed-only — not in repo)\n' "$rel"; orphan=$((orphan+1)); }
done < <(find "$BIN" -type f -print0)

printf '\n%d in sync · %d missing · %d drifted · %d orphaned\n' "$ok" "$missing" "$drift" "$orphan"

if (( missing || drift )); then
  printf '✗ runtime mirror is OUT OF SYNC with the repo — fix: bin/install.sh --force\n' >&2
  exit 1
fi
if (( orphan )); then
  printf '⚠ runtime mirror has stale orphan files — bin/install.sh --force will prune them\n' >&2
fi
printf '✓ runtime mirror matches repo source\n'
exit 0
