#!/usr/bin/env bash
# Catalog: C41 — a plugin that writes local state must do it privately, treat
# its own state file as untrusted on read, and never write through a path that
# could be a pre-existing symlink.
#
# Mitigates a defect class the marketplace maintainer found on FIVE submissions
# at once (issues #2899-2903, 2026-08-27), which the entire c28-c40 lane missed
# because every gate in it was aimed at the NETWORK or at QML rendering. These
# bugs live in purely local, offline shell helpers — the exact place the lane
# told itself was safe:
#
#   * bin/quiet-queue, bin/flow-boundary, bin/workspace-storyboard-scan and the
#     capture spool each created ~/.local/state/<plugin>/ and its file under the
#     default umask, so they were group/world readable in the creation window.
#   * Each wrote with `> "$file"` or `>> "$file"`, which FOLLOWS a pre-existing
#     symlink. A symlink planted at the state path redirects the write to any
#     file the user owns.
#   * Reads passed the complete mutable file to jq with no regular-file check,
#     no byte ceiling and no timeout, so an oversized replacement or a FIFO
#     could exhaust memory or hang the helper the QML side polls.
#
# The lesson is not "these five plugins". It is that a plugin trusts its own
# state file because the plugin wrote it, and forgets the path is user-writable
# between write and read. This gate flags the three shapes that make that
# assumption unsafe, in any shipped helper that writes under a state/config dir.
#
# This is a BLOCK, not an advisory style check. The first draft treated
# `mktemp + mv`, pathname `-f` checks, and a timeout as sufficient. The
# marketplace reviewer proved those are only first-pass mitigations: after a
# descriptor closes, a same-UID process can replace the final entry, temporary
# entry, or an ancestor directory before the next path lookup.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" ]]; then
  gate_skip "no tree to scan"
fi
if [[ ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "not an Omarchy plugin tree"
fi

# Scope: SHIPPED RUNTIME only. scripts/ is development and rig tooling that
# never runs on an end user's machine (rig-render.sh, gen-changelog.sh, the
# vendored gate lane); holding it to the runtime's local-input threat model
# produced false positives on every plugin. Keep bin/ and any helper the
# manifest's entryPoints/barWidget reference; drop scripts/, tests/, e2e/, and
# the gate lane itself. e2e hooks run only in the isolated proof rig; C43 still
# fingerprints them because they control the screenshot.
# Every SHIPPED shell runtime file, whether or not it carries a .sh extension.
# The runtime helpers (bin/quiet-queue, bin/loose-ends-scan) are extensionless,
# so an extension-only selector silently scanned nothing and the gate passed
# vacuously on exactly the files it exists to check. Match .sh/.bash by name AND
# any tree file whose first line is a shell shebang, then drop dev/rig tooling.
gate_shell_runtime_files() {
  local rel first
  {
    gate_tree_files '\.(sh|bash)$'
    gate_tree_files '(^|/)[^./]+$' | while IFS= read -r rel; do
      [[ -n "$rel" ]] || continue
      first=$(/usr/bin/head -n1 "$GATE_TREE_DIR/$rel" 2>/dev/null || true)
      case "$first" in \#\!*sh*|\#\!*/usr/bin/perl) printf '%s\n' "$rel" ;; esac
    done
  } | while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    case "$rel" in
      scripts/*|tests/*|e2e/*|.github/*) continue ;;
    esac
    printf '%s\n' "$rel"
  done | LC_ALL=C sort -u
}

HITS=""
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  FINDINGS=$(GATE_FILE="$GATE_TREE_DIR/$REL" GATE_REL="$REL" /usr/bin/python3 <<'PY'
import os, re
path = os.environ["GATE_FILE"]
rel  = os.environ["GATE_REL"]
try:
    src = open(path, encoding="utf-8", errors="replace").read()
except OSError:
    raise SystemExit(0)

# State/config files and named temporary files have the same lifecycle problem:
# closing a securely-created descriptor and reopening its pathname makes it
# mutable again. Loose Ends reached review through the latter shape, so a
# runtime helper using mktemp is in scope even when it does not use XDG state.
STATE_ROOT = re.compile(r'XDG_STATE_HOME|XDG_CONFIG_HOME|\.local/state|\.config/')
WRITES     = re.compile(r'>>?\s*"?\$|mkdir\b|\btee\b|jq[^|]*>\s*"?\$|\bsysopen\b|\bmake_path\b')
USES_TEMP  = re.compile(r'\bmktemp\b')
if not (STATE_ROOT.search(src) or USES_TEMP.search(src)):
    raise SystemExit(0)

lines = src.split("\n")
is_perl = bool(lines and lines[0].startswith("#!/usr/bin/perl"))
def code_lines():
    for i, line in enumerate(lines, 1):
        s = line.lstrip()
        if s.startswith(("#", "//", "*")):
            continue
        yield i, line

out = []

# 1. Private creation. If the helper creates a state dir/file but never sets a
#    restrictive umask or explicit mode, the creation window is permissive.
creates_state = any(
    re.search(r'mkdir\b.*(\$(XDG_STATE_HOME|XDG_CONFIG_HOME)|\.local/state|\.config/)', ln)
    for _, ln in code_lines()
)
has_umask = re.search(r'\bumask\s+0?77\b', src) is not None
has_mode  = re.search(r'\bchmod\s+0?[67]00\b|install -m\s*0?[67]00|mkdir\s+-m\s*0?7', src) is not None
if creates_state and not (has_umask or has_mode):
    for i, ln in code_lines():
        if re.search(r'mkdir\b.*(\$(XDG_STATE_HOME|XDG_CONFIG_HOME)|\.local/state|\.config/)', ln):
            out.append(f"{rel}:{i} creates state without `umask 077` or an explicit 0600/0700 mode")
            break

# 2. Symlink-following write. `> "$x"` / `>> "$x"` / `tail > "$x.tmp"` all follow
#    a pre-existing symlink at the target. `mktemp + mv` is necessary first
#    mitigation, but not sufficient proof: reopening the temp by name or
#    resolving the parent again reintroduces the race.
has_atomic = (
    (re.search(r'mktemp\b[^\n]*\$', src) and re.search(r'\bmv\b\s+(-f\s+)?"?\$', src))
    or (re.search(r'\bO_CREAT\b', src) and re.search(r'\bO_EXCL\b', src) and re.search(r'\brename\b', src))
)
if not has_atomic and not is_perl:
    for i, ln in code_lines():
        # a redirect whose target is a $-variable or a .tmp of one
        # This heuristic is intentionally shell-only. In Perl both `=> $value`
        # and `@items > $limit` use the same punctuation without redirecting a
        # path; Perl lifecycle safety is established by the descriptor checks.
        if re.search(r'(?<!=)>>?\s*"?\$\w+', ln) and 'mktemp' not in ln:
            out.append(f"{rel}:{i} writes through a variable path with `>`/`>>` (follows a planted symlink; use mktemp inside the private dir + mv)")
            break

# 2b. A state lifecycle must retain object identity. Shell pathname checks
# cannot establish this invariant. Accept only a purpose-built helper that
# declares descriptor-relative/no-follow primitives; red-proof tests are
# checked below. This intentionally blocks path-only helpers rather than
# pretending a regex can prove them race-safe.
has_descriptor_lifecycle = re.search(r'\b(openat2?|renameat2?|O_NOFOLLOW|secure-state)\b', src) is not None
if not has_descriptor_lifecycle:
    for i, ln in code_lines():
        if STATE_ROOT.search(ln) or USES_TEMP.search(ln):
            out.append(f"{rel}:{i} persists mutable state without a descriptor-bound lifecycle helper (path checks/mktemp alone remain TOCTOU-raceable)")
            break

# 3. Unbounded read of the mutable state file. jq/parse of a $-path with no
#    prior regular-file test AND no timeout is the exhaustion/hang surface.
# A read is guarded when the file's TYPE is checked (regular-file test in
# either the positive `[[ -f "$x"` or negative `[[ ! -f "$x"` form, or a
# stat/size probe) AND the parse runs under a timeout. Both the positive and
# negative forms are valid: the fixed helpers bail when NOT a regular file.
guards_read = (
    re.search(r'\[\[\s*!?\s*-f\s+"?\$', src)
    or re.search(r'-f\s+"?\$\w+"?\s*(&&|\|\||\]\])', src)
    or re.search(r'\bstat\s+-c\s*%s', src)
) and re.search(r'\btimeout\b', src)
reads_state = any(
    re.search(r'\bjq\b[^\n]*"?\$\w+', ln) and '-n' not in ln
    for _, ln in code_lines()
)
if reads_state and not guards_read:
    for i, ln in code_lines():
        if re.search(r'\bjq\b[^\n]*"?\$\w+', ln) and '-n' not in ln:
            out.append(f"{rel}:{i} parses the state file with no regular-file check + timeout guard (a FIFO hangs it, an oversized file exhausts it)")
            break

for f in out[:6]:
    print(f)
PY
)
  [[ -n "$FINDINGS" ]] && HITS+="$FINDINGS"$'\n'
done < <(gate_shell_runtime_files)

# Evidence is a separate denominator. Stateful runtime code needs hostile
# same-UID coverage for final-file, temporary-file, parent-directory, and FIFO
# cases. A happy-path suite cannot prove this class.
STATEFUL=0
while IFS= read -r REL; do
  SRC=$(gate_file_content "$REL")
  if /usr/bin/printf '%s' "$SRC" | /usr/bin/grep -qE 'XDG_STATE_HOME|XDG_CONFIG_HOME|\.local/state|\.config/|\bmktemp\b'; then
    STATEFUL=1
    break
  fi
done < <(gate_shell_runtime_files)

if [[ "$STATEFUL" -eq 1 ]]; then
  TEST_EVIDENCE=""
  while IFS= read -r REL; do
    TEST_EVIDENCE+=$(gate_file_content "$REL")$'\n'
  done < <(gate_tree_files '^tests/.*\.(test\.(js|sh)|spec\.(js|sh))$')
  for token in final temp parent FIFO; do
    if ! /usr/bin/printf '%s' "$TEST_EVIDENCE" | /usr/bin/grep -qi "$token"; then
      HITS+="state lifecycle evidence is missing hostile $token replacement coverage"$'\n'
    fi
  done
fi

HITS="${HITS%$'\n'}"

if [[ -n "$HITS" ]]; then
  COUNT=$(/usr/bin/printf '%s\n' "$HITS" | /usr/bin/grep -c . || true)
  SUMMARY=$(/usr/bin/printf '%s' "$HITS" | /usr/bin/tr '\n' ';' | /usr/bin/cut -c1-360)
  gate_block "local state lifecycle is unproven ($COUNT): $SUMMARY" \
    "State paths are mutable between checks. A clean lane requires a descriptor-bound helper that pins the parent, opens reads once with no-follow/nonblocking semantics, keeps the exclusive temporary descriptor through bounded write+fsync, and uses descriptor-relative replacement/cleanup. Add red proofs for same-UID final-entry, temporary-entry, parent-directory swap, and FIFO/oversized-read cases. mktemp + mv and pathname -f checks alone do not close this finding."
fi

if [[ "$STATEFUL" -eq 1 ]]; then
  gate_pass "mutable local state uses descriptor lifecycle primitives with hostile-race evidence"
fi
gate_pass "no shipped runtime helper persists mutable local state"
