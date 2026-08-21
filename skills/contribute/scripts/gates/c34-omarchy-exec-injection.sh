#!/usr/bin/env bash
# Catalog: C34 — shell-string command injection via a notification/exec action
# built by concatenating untrusted data.
#
# Mitigates an RCE class a four-agent security review caught on the Listening
# Post / X Files entries only after the code was written: Omarchy dispatches a
# notification click action (the `--exec` value handed to
# omarchy-notification-send) by running it as `bash -lc "<value>"` (see the
# shell's Commons/Util.qml execDetached, which calls
# Quickshell.execDetached(["bash","-lc", command])). So an `--exec` value built
# as `"xdg-open " + url` is command injection the moment a feed- or
# reply-derived URL carries a shell metacharacter (`;`, `$(...)`, backtick,
# `|`, `${IFS}` …). The same is true of any Util.execDetached / execDetached
# call whose argument is concatenated from data.
#
# The safe form single-quotes every interpolated segment, so the shell treats
# it as one literal word: `"xdg-open '" + url + "'"`. That quoting is only
# actually safe when the data cannot contain a single quote — which is why the
# poller must also validate the URL against a strict charset — but the
# single-quote wrap is the necessary primitive, and its ABSENCE is the
# mechanically detectable defect this gate blocks.
#
# Rule: in any .qml / .js / .mjs file, for every `--exec` value or
# `execDetached(...)` argument built by string concatenation, each
# double-quoted literal that is immediately followed by `+` (i.e. has an
# interpolation spliced onto it) must END in a single quote, and every
# template-literal `${...}` reaching such a call must be wrapped in single
# quotes. A concatenation that splices data onto a literal not ending in `'`
# (or an unquoted `${...}`) is a BLOCK.
#
# Whole-file scan (the exec statement's structure is not visible in a diff
# hunk); only files in the change set for diff-mode candidates. Skips when no
# .qml/.js/.mjs.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" ]]; then
  gate_skip "no tree to scan"
fi

# The exec value is built in QML panels AND in the poller CLIs, which ship as
# EXTENSIONLESS node scripts (bin/<name>-poll). Scan .qml/.js/.mjs by
# extension, plus any in-scope file whose first line is a node/bash/sh
# shebang, so an extensionless poller is never skipped (the original RCE lived
# in exactly such a file).
ALL_FILES=$(gate_tree_files '.*')
CODE_FILES=""
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  if [[ "$REL" =~ \.(qml|js|mjs)$ ]]; then
    CODE_FILES="${CODE_FILES}${REL}"$'\n'
    continue
  fi
  F="$GATE_TREE_DIR/$REL"
  [[ -f "$F" ]] || continue
  if /usr/bin/head -n1 "$F" 2>/dev/null | /usr/bin/grep -qE '^#!.*(node|bash|/sh|env )'; then
    CODE_FILES="${CODE_FILES}${REL}"$'\n'
  fi
done <<< "$ALL_FILES"
CODE_FILES=$(/usr/bin/printf '%s' "$CODE_FILES" | /usr/bin/grep -v '^$' || true)

if [[ -z "$CODE_FILES" ]]; then
  gate_skip "no .qml/.js/.mjs or shebang-script files in scope"
fi

VIOLATIONS=""
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  FILE="$GATE_TREE_DIR/$REL"
  [[ -f "$FILE" ]] || continue

  # For every trigger line (--exec value, or an execDetached call), form a
  # three-line window (the value can spill onto the next line or two) and test
  # the concatenations that feed the command. A double-quoted literal that has
  # `+` spliced right after it must end in a single quote; an unquoted
  # template `${...}` is likewise unsafe. Comment-only lines are ignored so a
  # doc line mentioning --exec never trips the gate.
  BAD=$(/usr/bin/awk '
    function trimmed(s){ sub(/^[[:space:]]+/,"",s); return s }
    function is_comment(s,   t){ t=trimmed(s); return (t ~ /^\/\// || t ~ /^\*/ || t ~ /^#/) }
    # returns 1 if the joined window splices data onto an unquoted command literal
    function unsafe(w,   i, lit, rest) {
      # Case 1: a double-quoted literal immediately followed by + . Walk every
      # occurrence of `" +` and inspect the literal that closes there.
      rest = w
      while (match(rest, /"[[:space:]]*\+/)) {
        # the char just before the closing quote of that literal:
        # find the closing quote position
        i = RSTART            # points at the closing double-quote
        if (i >= 2) {
          lit = substr(rest, i-1, 1)   # last content char inside the literal
          if (lit != "\x27") return 1  # not ending in a single quote -> unsafe
        } else {
          return 1
        }
        rest = substr(rest, RSTART + RLENGTH)
      }
      # Case 2: a template-literal interpolation ${...} not wrapped in single
      # quotes (i.e. not \x27${...}\x27).
      if (w ~ /\$\{[^}]*\}/ && w !~ /\x27\$\{[^}]*\}\x27/) {
        if (w ~ /`[^`]*\$\{[^}]*\}[^`]*`/) return 1
      }
      return 0
    }
    {
      lines[NR] = $0
    }
    END {
      for (n = 1; n <= NR; n++) {
        if (is_comment(lines[n])) continue
        if (lines[n] ~ /--exec/ || lines[n] ~ /[Ee]xecDetached[[:space:]]*\(/) {
          w = lines[n]
          if (n+1 <= NR && !is_comment(lines[n+1])) w = w " " lines[n+1]
          if (n+2 <= NR && !is_comment(lines[n+2])) w = w " " lines[n+2]
          # only concern ourselves with windows that actually concatenate or
          # interpolate; a pure-literal exec value is safe.
          if (w ~ /"[[:space:]]*\+/ || w ~ /\$\{[^}]*\}/) {
            if (unsafe(w)) { printf "%d,", n }
          }
        }
      }
    }
  ' "$FILE")

  if [[ -n "$BAD" ]]; then
    VIOLATIONS="${VIOLATIONS}${REL}: exec/notification command built from unquoted data at line(s) ${BAD%,}; "
  fi
done <<< "$CODE_FILES"

if [[ -z "$VIOLATIONS" ]]; then
  gate_pass "no --exec/execDetached command is built from unquoted data"
fi

gate_block "shell-injection risk: ${VIOLATIONS% }" "the --exec value runs as \`bash -lc\`; single-quote every interpolated segment (\"xdg-open '\" + url + \"'\") AND validate the data against a strict charset upstream, or pass an argv array to a wrapper instead of a shell string"
