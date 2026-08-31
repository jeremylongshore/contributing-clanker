#!/usr/bin/env bash
# Catalog: C42 — a recurring scan must budget local input BEFORE it buffers or
# sorts it. The attacker is not the network here; it is the user's own home
# directory, a client-controlled window title, or a huge screenshot folder.
#
# Mitigates the second class the marketplace maintainer found across issues
# #2899-2903 (2026-08-27). Every plugin ran on a timer (5s, 20s) and read local
# input whose size the plugin does not control:
#
#   * loose-ends-scan did `find ... | sort -zu` and applied its repo cap AFTER
#     sort had already enumerated, stored and sorted every .git under $HOME.
#   * capture-conveyor-scan did `find | sort -z | head -25`, so sort buffered
#     the entire screenshot directory before head limited it.
#   * workspace-storyboard-scan captured full `hyprctl` responses — window
#     titles and classes are client-influenced — into shell variables with no
#     byte or time ceiling.
#
# In each case the FINAL output was capped, which is what made it look safe; the
# unbounded work happened upstream of the cap, every few seconds. This gate
# flags a `sort` fed by an unbudgeted `find`, and an `hyprctl`/command capture
# with no timeout, in a helper that also parses or emits bounded output (i.e. a
# scanner, not a one-shot).
#
# WARN, not BLOCK: the shapes are strong signals but a maintainer may confirm a
# bounded producer the regex cannot see. Make the exception deliberate.
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
      case "$first" in \#\!*sh*) printf '%s\n' "$rel" ;; esac
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

lines = src.split("\n")
def code_lines():
    for i, line in enumerate(lines, 1):
        s = line.lstrip()
        if s.startswith(("#", "//", "*")):
            continue
        yield i, line

out = []

# 1. `find` piped into `sort` with no `head`/budget between them. sort must
#    consume the whole stream before it can emit, so an unbudgeted find is an
#    unbounded buffer regardless of any cap applied after sort.
#    Detected across adjacent code lines because the pipeline is multi-line.
code_src = "\n".join(ln for _, ln in code_lines())
# a find...sort pipeline segment with no `head` token between `find` and `sort`
for m in re.finditer(r'\bfind\b(?P<mid>.*?)\bsort\b', code_src, re.S):
    mid = m.group("mid")
    if "head" not in mid:
        # locate a representative line number
        upto = code_src[:m.start()].count("\n")
        # map back to a source line containing 'find'
        for i, ln in code_lines():
            if "find" in ln:
                out.append(f"{rel}:{i} `find` feeds `sort` with no `head`/entry budget between them (sort buffers the whole tree before any cap)")
                break
        break

# 2. A command whose output is user/client-influenced captured with no timeout.
#    hyprctl window/workspace data is the named case; generalise to any capture
#    into a variable from hyprctl with no `timeout` anywhere in the file.
captures_hyprctl = any(re.search(r'\bhyprctl\b', ln) for _, ln in code_lines())
has_timeout = re.search(r'\btimeout\s+\d', src) is not None
if captures_hyprctl and not has_timeout:
    for i, ln in code_lines():
        if re.search(r'\bhyprctl\b', ln):
            out.append(f"{rel}:{i} captures hyprctl output with no `timeout` (client-influenced titles/classes can stall or bloat the scan)")
            break

for f in out[:6]:
    print(f)
PY
)
  [[ -n "$FINDINGS" ]] && HITS+="$FINDINGS"$'\n'
done < <(gate_shell_runtime_files)

HITS="${HITS%$'\n'}"

if [[ -n "$HITS" ]]; then
  COUNT=$(/usr/bin/printf '%s\n' "$HITS" | /usr/bin/grep -c . || true)
  SUMMARY=$(/usr/bin/printf '%s' "$HITS" | /usr/bin/tr '\n' ';' | /usr/bin/cut -c1-360)
  gate_warn "recurring scan buffers unbudgeted local input ($COUNT): $SUMMARY" \
    "The final output cap does not protect the work upstream of it, which runs every few seconds. Budget the PRODUCER: put \`head -z -n <budget>\` between \`find\` and \`sort\` so find is SIGPIPE-terminated at the budget and sort never sees more; wrap the walk in \`timeout\`. For any command whose output a client can influence (\`hyprctl\`, window titles), run it under \`timeout N\` and \`head -c <bytes>\` before it reaches a variable, and length-cap the stored strings. Reference fixes: omarchy-capture-conveyor-entry bin/capture-conveyor-scan, omarchy-workspace-storyboard-entry bin/workspace-storyboard-scan, omarchy-loose-ends-entry bin/loose-ends-scan."
fi

gate_pass "recurring scans budget local input before buffering or sorting"
