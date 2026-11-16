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
# Perl helpers are in scope with Perl-shaped rules. capture-conveyor-scan was
# rewritten in Perl, and the shell-only selector stopped opening it: the gate
# answered PASS over a corpus of one git hook while the scanner it was written
# for went unread. The Perl rules mirror the two shell hazards:
#
#   (a) `sort` over `readdir`, `glob` or `<*>` output, or over an array or hash
#       filled from them, when no entry budget runs first. The only budget that
#       bounds the buffer is a counter checked with `last` inside a SCALAR
#       `while (readdir ...)` loop (or a numeric bound in that loop's header).
#       `for (readdir ...)` and every `glob`/`<*>` form build the whole list
#       before the first iteration, so a `last` there caps nothing upstream.
#   (b) backticks, `qx//`, `readpipe`, a pipe `open`, or `system`/`exec`
#       running `hyprctl` or another input-sized command with no `alarm` in the
#       helper and no `timeout` in the command itself.
#
# A PASS names every file it scanned, by language, and an empty corpus is a
# SKIP, so "nothing was opened" can never read as "checked and clean".
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
# Every SHIPPED shell or Perl runtime file, whether or not it carries an
# extension. The runtime helpers (bin/quiet-queue, bin/loose-ends-scan,
# bin/capture-conveyor-scan) are extensionless, so an extension-only selector
# silently scanned nothing and the gate passed vacuously on exactly the files it
# exists to check. Match .sh/.bash/.pl/.pm by name AND any tree file whose first
# line is a shell or Perl shebang, then drop dev/rig tooling.
gate_runtime_files() {
  local rel first
  {
    gate_tree_files '\.(sh|bash|pl|pm)$'
    gate_tree_files '(^|/)[^./]+$' | while IFS= read -r rel; do
      [[ -n "$rel" ]] || continue
      first=$(/usr/bin/head -n1 "$GATE_TREE_DIR/$rel" 2>/dev/null || true)
      case "$first" in \#\!*sh*|\#\!*perl*) printf '%s\n' "$rel" ;; esac
    done
  } | while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    case "$rel" in
      scripts/*|tests/*|e2e/*|.github/*) continue ;;
    esac
    printf '%s\n' "$rel"
  done | LC_ALL=C sort -u
}

# "a, b, c (+N more)" for the verdict line; the full list would swamp it.
corpus_names() {
  local max=6 total=$# shown=0 out="" name
  for name in "$@"; do
    if (( shown >= max )); then break; fi
    out+="${out:+, }$name"
    shown=$((shown + 1))
  done
  if (( total > max )); then out+=" (+$((total - max)) more)"; fi
  printf '%s' "$out"
}

HITS=""
SCANNED_SHELL=()
SCANNED_PERL=()
while IFS= read -r REL; do
  [[ -n "$REL" ]] || continue
  # First output line names the language the file was analyzed as; the rest
  # are findings. No language line means the file could not be opened, and an
  # unopened file is never counted as scanned.
  RESULT=$(GATE_FILE="$GATE_TREE_DIR/$REL" GATE_REL="$REL" /usr/bin/python3 <<'PY'
import os, re
path = os.environ["GATE_FILE"]
rel  = os.environ["GATE_REL"]
try:
    src = open(path, encoding="utf-8", errors="replace").read()
except OSError:
    raise SystemExit(0)

lines = src.split("\n")
first = lines[0] if lines else ""
is_perl = rel.endswith((".pl", ".pm")) or re.match(r'#!.*perl', first) is not None
print("LANG perl" if is_perl else "LANG shell")

out = []  # (line, message)


# ------------------------------------------------------------------- shell

def code_lines():
    for i, line in enumerate(lines, 1):
        s = line.lstrip()
        if s.startswith(("#", "//", "*")):
            continue
        yield i, line

def shell_rules():
    # 1. `find` piped into `sort` with no `head`/budget between them. sort must
    #    consume the whole stream before it can emit, so an unbudgeted find is an
    #    unbounded buffer regardless of any cap applied after sort.
    #    Detected across adjacent code lines because the pipeline is multi-line.
    code_src = "\n".join(ln for _, ln in code_lines())
    # a find...sort pipeline segment with no `head` token between `find` and `sort`
    for m in re.finditer(r'\bfind\b(?P<mid>.*?)\bsort\b', code_src, re.S):
        mid = m.group("mid")
        if "head" not in mid:
            # map back to a source line containing 'find'
            for i, ln in code_lines():
                if "find" in ln:
                    out.append((i, f"{rel}:{i} `find` feeds `sort` with no `head`/entry budget between them (sort buffers the whole tree before any cap)"))
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
                out.append((i, f"{rel}:{i} captures hyprctl output with no `timeout` (client-influenced titles/classes can stall or bloat the scan)"))
                break


# -------------------------------------------------------------------- perl

# A Perl word that is not a sigiled variable, method, package path or option.
NB = r'(?<![\$@%&>:\w-])'
# readdir/glob calls (not hash keys) and glob-style angle brackets: <*.png>,
# <$dir/*>. A readline <$fh> has no wildcard, and <=> has no wildcard either.
SOURCE = re.compile(NB + r'(?:readdir|glob)\b(?!\s*(?:=>|\}))|<[^<>\s;=]*\*[^<>\s;]*>')
GLOBBY = re.compile(NB + r'glob\b(?!\s*(?:=>|\}))|<[^<>\s;=]*\*[^<>\s;]*>')
# @name, @$name, @{$name}, %name, %$name: a container a sort can order.
CONTAINER = re.compile(r'[@%]\{?\$?(\w+)\}?')
# Numeric comparison, excluding ->, =>, <=> and !=.
NUMCMP = re.compile(r'(?<![-=<>!])(?:>=?|<=?)(?![<>=])|(?<![=!<>])==(?!=)')
HEREDOC = re.compile(r'<<~?\s*(["\'])([A-Za-z_]\w*)\1|<<~?([A-Za-z_]\w*)')
# Commands whose output or runtime is sized by input the helper does not
# control: compositor state carrying client window titles, filesystem walks,
# the journal, and socket readers (Hyprland's event socket never closes).
UNBOUNDED = {"hyprctl", "find", "ls", "du", "fd", "fdfind", "locate",
             "plocate", "journalctl", "socat", "nc", "ncat"}
WRAPPERS = {"env", "nice", "ionice", "command", "exec", "stdbuf", "setsid", "nohup"}

def strip_comment(ln):
    # Drop a trailing `# comment` outside quotes. Lines that use # as a quote
    # delimiter (s#a#b#, qw#..#) keep their text; $#array never matches because
    # its # follows a sigil, not whitespace.
    if re.search(r'\b(?:s|m|q|qq|qw|qx|qr|tr|y)\s*#', ln):
        return ln
    quote = None
    i = 0
    while i < len(ln):
        c = ln[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'":
            quote = c
        elif c == "#" and (i == 0 or ln[i - 1] in " \t"):
            return ln[:i]
        i += 1
    return ln

def perl_code():
    # The source with the shebang, POD, comments, heredoc bodies and anything
    # after __END__/__DATA__ blanked. Line count is preserved, so an offset
    # still maps to the file's own line number.
    clean, in_pod, ended, heredoc = [], False, False, None
    for idx, ln in enumerate(lines):
        if ended or (idx == 0 and ln.startswith("#!")):
            clean.append("")
            continue
        if heredoc:
            term, indented = heredoc
            if (ln.strip() if indented else ln) == term:
                heredoc = None
            clean.append("")
            continue
        if in_pod:
            if re.match(r'=cut\b', ln):
                in_pod = False
            clean.append("")
            continue
        if re.match(r'=[A-Za-z]', ln):
            in_pod = True
            clean.append("")
            continue
        if re.match(r'__(?:END|DATA)__\s*$', ln):
            ended = True
            clean.append("")
            continue
        if ln.lstrip().startswith("#"):
            clean.append("")
            continue
        ln = strip_comment(ln)
        m = HEREDOC.search(ln)
        if m:
            term = m.group(2) or m.group(3)
            indented = "~" in m.group(0)
            # `<<` is also a shift. Only a terminator that actually appears
            # later makes it a heredoc, or the rest of the file would vanish.
            if any((r.strip() if indented else r) == term for r in lines[idx + 1:]):
                heredoc = (term, indented)
        clean.append(ln)
    return "\n".join(clean)

def balanced_end(s, i):
    # s[i] opens a bracket; return the index just past its match.
    close = {"(": ")", "[": "]", "{": "}", "<": ">"}[s[i]]
    depth, j = 0, i
    while j < len(s):
        c = s[j]
        if c == "\\":
            j += 2
            continue
        if c == s[i]:
            depth += 1
        elif c == close:
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    return len(s)

def expr_from(s, i):
    # The rest of one expression: to `;` at depth 0, or to the close bracket of
    # whatever encloses it.
    depth, j = 0, i
    while j < len(s):
        c = s[j]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            if depth == 0:
                break
            depth -= 1
        elif c == ";" and depth == 0:
            break
        j += 1
    return s[i:j]

def enclosing_condition(s, pos):
    # The condition of the innermost if/unless/elsif block containing pos.
    best = None
    for cm in re.finditer(r'\b(?:if|unless|elsif)\s*\(', s[:pos]):
        p = cm.end() - 1
        pe = balanced_end(s, p)
        k = pe
        while k < len(s) and s[k] in " \t\n":
            k += 1
        if k < len(s) and s[k] == "{" and k < pos < balanced_end(s, k):
            best = s[p + 1:pe - 1]
    return best

def has_budget(header, body):
    # A numeric bound in the loop header, or a `last` governed by a numeric
    # comparison in the body: `last if ++$n > $MAX`, or
    # `if ($seen > $BUDGET) { ...; last }`. A `last` on a name match is an
    # early exit, not a budget.
    if NUMCMP.search(header):
        return True
    for lm in re.finditer(NB + r'last\b', body):
        mod = re.match(r'last\s*(?:[A-Za-z_]\w*\s*)?(?:if|unless)\b([^;}]*)', body[lm.start():])
        if mod and NUMCMP.search(mod.group(1)):
            return True
        cond = enclosing_condition(body, lm.start())
        if cond is not None and NUMCMP.search(cond):
            return True
    return False

FILL = re.compile(
    NB + r'(?:push|unshift)\s*\(?\s*@\{?\$?(\w+)\}?'
    + r'|' + NB + r'\$(\w+)\s*\{[^{};]*\}\s*(?:=(?![=~>])|\+\+|--|\.=|\+=|//=|\|\|=)'
    + r'|\+\+\s*\$(\w+)\s*\{'
    + r'|' + NB + r'\$(\w+)\s*\[[^\[\];]*\]\s*=(?![=~>])')

def filled_names(text):
    return {next(g for g in m.groups() if g) for m in FILL.finditer(text)}

def perl_rules():
    code = perl_code()
    def line_of(pos):
        return code.count("\n", 0, pos) + 1

    # Containers that hold every entry of a directory or glob, with the line
    # and reason that made them unbudgeted. Iterate to a fixpoint so a copy or
    # a loop over a tainted container taints its target too.
    tainted = {}
    def taint(name, pos, why):
        if name not in tainted:
            tainted[name] = (line_of(pos), why)
            return True
        return False

    def source_of(text):
        m = SOURCE.search(text)
        if m:
            return m.group(0), None
        for n in CONTAINER.findall(text):
            if n in tainted:
                return None, n
        return None, None

    for _ in range(6):
        changed = False

        # List assignment: @x = readdir/glob/... reads every entry at once.
        for m in re.finditer(r'(?<![\$@%&>:\w-])[@%]\{?\$?(\w+)\}?\s*\)?\s*=(?![=~>])', code):
            src_tok, via = source_of(expr_from(code, m.end()))
            if src_tok:
                changed |= taint(m.group(1), m.start(), f"`{src_tok}` in list context reads every entry at once")
            elif via and via != m.group(1):
                changed |= taint(m.group(1), m.start(), f"copied from @{via}, which already holds every entry")
        # $ref = [ readdir ... ]
        for m in re.finditer(NB + r'\$(\w+)\s*=(?![=~>])\s*\[', code):
            br = m.end() - 1
            src_tok, via = source_of(code[br:balanced_end(code, br)])
            if src_tok:
                changed |= taint(m.group(1), m.start(), f"`{src_tok}` in list context reads every entry at once")

        # Loops whose header draws from a directory, a glob, or a tainted container.
        for m in re.finditer(NB + r'(while|until|for|foreach)\b\s*(?:(?:my|our|state)\s+)?(?:\$\w+\s*)?\(', code):
            kw = m.group(1)
            p = m.end() - 1
            hend = balanced_end(code, p)
            header = code[p + 1:hend - 1]
            k = hend
            while k < len(code) and code[k] in " \t\n":
                k += 1
            if k >= len(code) or code[k] != "{":
                continue
            body = code[k + 1:balanced_end(code, k) - 1]
            src_tok, via = source_of(header)
            if not (src_tok or via):
                continue
            scalar_readdir = (
                src_tok is not None
                and "readdir" in src_tok
                and not GLOBBY.search(header)
                and (kw in ("while", "until") or ";" in header)
            )
            if scalar_readdir and has_budget(header, body):
                continue
            if scalar_readdir:
                why = "the readdir loop has no entry counter checked with `last`"
            elif via:
                why = f"the loop walks @{via}, which already holds every entry"
            elif GLOBBY.search(header):
                why = f"`{src_tok}` builds the whole match list before the loop's first iteration, so no `last` inside it bounds the buffer"
            else:
                why = f"`{kw} (readdir ...)` reads every entry before the first iteration; iterate `while (defined(my $e = readdir $dh))` and count"
            for name in filled_names(body):
                changed |= taint(name, m.start(), why)

        # Statement modifiers: `push @x, $_ for readdir $dh;` leaves no room for a budget.
        for m in re.finditer(r'(?:' + NB + r'(?:push|unshift)\s*\(?\s*@\{?\$?(\w+)\}?|' + NB
                             + r'\$(\w+)\s*\{[^{};]*\})[^;{}]*?' + NB + r'(?:for|foreach|while|until)\b([^;]*);', code):
            src_tok, via = source_of(m.group(3))
            if src_tok or via:
                changed |= taint(m.group(1) or m.group(2), m.start(),
                                 "a statement-modifier loop has no place for an entry budget")

        if not changed:
            break

    # (a) every sort site.
    for m in re.finditer(NB + r'sort\b(?!\s*=>)', code):
        k = m.end()
        while k < len(code) and code[k] in " \t\n(":
            k += 1
        if k < len(code) and code[k] == "{":
            k = balanced_end(code, k)          # comparator block
        operand = expr_from(code, k)
        line = line_of(m.start())
        src_m = SOURCE.search(operand)
        if src_m:
            out.append((line, f"{rel}:{line} `sort` consumes `{src_m.group(0)}` output directly, so every entry is read and held before any cap"))
            continue
        for n in CONTAINER.findall(operand):
            if n in tainted:
                tl, why = tainted[n]
                out.append((line, f"{rel}:{line} `sort` orders @{n}, filled at line {tl} with no entry budget ({why})"))
                break

    # (b) command execution and capture. Only the word in COMMAND position
    # counts, so an argument or a die message that mentions `find` is not a
    # finding. A `timeout` wrapper in the same command, or a nonzero `alarm`
    # anywhere in the helper, is the guard.
    has_alarm = re.search(NB + r'alarm\s*\(?\s*(?!0\b)[\d\$]', code) is not None

    def call_args(pos):
        # A call's argument text: the parenthesised list, or the bare list up
        # to the first low-precedence `or`/`and`/`if`/`unless`.
        k = pos
        while k < len(code) and code[k] in " \t\n":
            k += 1
        if k < len(code) and code[k] == "(":
            return code[k + 1:balanced_end(code, k) - 1]
        return re.split(r'\b(?:or|and|if|unless)\b|\|\||&&|//', expr_from(code, k), maxsplit=1)[0]

    def elements(args):
        # String literals and plain variables of an argument list, in order.
        return [a or b or c for a, b, c in re.findall(
            r'"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|([\$@]\w+)', args)]

    def shell_programs(cmd):
        # Program names at command position in a shell command string.
        progs = []
        for seg in re.split(r'\|\||&&|[|;&]|\$\(', cmd):
            words = seg.split()
            i = 0
            while i < len(words):
                w = words[i].strip('\'"(){}')
                if (not w or re.match(r'[A-Za-z_]\w*=', w) or w in WRAPPERS
                        or w.startswith("-") or re.fullmatch(r'[\d.]+', w)):
                    i += 1
                    continue
                prog = os.path.basename(w)
                progs.append(prog)
                if prog != "timeout":
                    break
                i += 1
                while i < len(words) and re.match(r'-|[\d.]+[smhd]?$', words[i]):
                    i += 1
        return progs

    def list_programs(elems):
        # A list-form command: the first element is the program; a lone string
        # with spaces or shell syntax is a shell command line instead.
        if not elems:
            return []
        if len(elems) == 1 and re.search(r'[\s|;&<>$`]', elems[0]):
            return shell_programs(elems[0])
        progs = []
        rest = list(elems)
        while rest:
            prog = os.path.basename(rest.pop(0))
            progs.append(prog)
            if prog != "timeout":
                break
            while rest and re.match(r'-|[\d.]+[smhd]?$', rest[0]):
                rest.pop(0)
        return progs

    sites = []  # (pos, kind, program names)
    for m in re.finditer(r'(?<!\\)`((?:[^`\\\n]|\\.)*)`', code):
        sites.append((m.start(), "backticks", shell_programs(m.group(1))))
    for m in re.finditer(NB + r'qx\s*([^\w\s])', code):
        start = m.end() - 1
        if m.group(1) in "([{<":
            text = code[start + 1:balanced_end(code, start) - 1]
        else:
            end = code.find(m.group(1), start + 1)
            text = code[start + 1:end if end != -1 else len(code)]
        sites.append((m.start(), "qx//", shell_programs(text)))
    for m in re.finditer(NB + r'readpipe\b', code):
        sites.append((m.start(), "readpipe", list_programs(elements(call_args(m.end())))))
    for m in re.finditer(NB + r'open\b', code):
        elems = elements(call_args(m.end()))
        for j, e in enumerate(elems):
            if e in ("-|", "|-"):
                sites.append((m.start(), "a pipe open", list_programs(elems[j + 1:])))
                break
            if re.match(r'\s*\|.*\S|.*\S\s*\|\s*$', e, re.S):
                sites.append((m.start(), "a pipe open", shell_programs(e.strip().strip("|"))))
                break
    for m in re.finditer(NB + r'(system|exec)\b\s*(?=[("\'\$@])', code):
        sites.append((m.start(), f"`{m.group(1)}`", list_programs(elements(call_args(m.end())))))
    for pos, kind, progs in sites:
        hit = next((p for p in progs if p in UNBOUNDED), None)
        if not hit or has_alarm or "timeout" in progs:
            continue
        line = line_of(pos)
        out.append((line, f"{rel}:{line} runs `{hit}` through {kind} with no `alarm` or `timeout` (client-influenced or input-sized output can stall or bloat the scan)"))


(perl_rules if is_perl else shell_rules)()
seen = set()
for _, f in sorted(out):
    if f not in seen:
        seen.add(f)
        print(f)
        if len(seen) >= 6:
            break
PY
)
  case "${RESULT%%$'\n'*}" in
    "LANG perl")  SCANNED_PERL+=("$REL") ;;
    "LANG shell") SCANNED_SHELL+=("$REL") ;;
    *) continue ;;
  esac
  if [[ "$RESULT" == *$'\n'* ]]; then
    HITS+="${RESULT#*$'\n'}"$'\n'
  fi
done < <(gate_runtime_files)

HITS="${HITS%$'\n'}"
SCANNED=$(( ${#SCANNED_SHELL[@]} + ${#SCANNED_PERL[@]} ))

if (( SCANNED == 0 )); then
  gate_skip "no shipped shell or Perl runtime file to scan (scripts/, tests/, e2e/ and .github/ are excluded as dev tooling)"
fi

CORPUS=""
if (( ${#SCANNED_SHELL[@]} > 0 )); then
  CORPUS="shell: $(corpus_names "${SCANNED_SHELL[@]}")"
fi
if (( ${#SCANNED_PERL[@]} > 0 )); then
  CORPUS+="${CORPUS:+; }Perl: $(corpus_names "${SCANNED_PERL[@]}")"
fi

if [[ -n "$HITS" ]]; then
  COUNT=$(/usr/bin/printf '%s\n' "$HITS" | /usr/bin/grep -c . || true)
  SUMMARY=$(/usr/bin/printf '%s' "$HITS" | /usr/bin/tr '\n' ';' | /usr/bin/cut -c1-360)
  gate_warn "recurring scan buffers unbudgeted local input ($COUNT in $SCANNED scanned runtime file(s)): $SUMMARY" \
    "The final output cap does not protect the work upstream of it, which runs every few seconds. Budget the PRODUCER: put \`head -z -n <budget>\` between \`find\` and \`sort\` so find is SIGPIPE-terminated at the budget and sort never sees more; wrap the walk in \`timeout\`. In Perl, iterate \`while (defined(my \$e = readdir \$dh))\`, count every entry and \`last\` at the budget before pushing; never sort \`readdir\`/\`glob\` output directly (list-context readdir and every glob materialize the whole directory). For any command whose output a client can influence (\`hyprctl\`, window titles), run it under \`timeout N\` (Perl: an \`alarm\` around the capture) and \`head -c <bytes>\` before it reaches a variable, and length-cap the stored strings. Reference fixes: omarchy-capture-conveyor-entry bin/capture-conveyor-scan (Perl readdir budget), omarchy-workspace-storyboard-entry bin/workspace-storyboard-scan, omarchy-loose-ends-entry bin/loose-ends-scan."
fi

gate_pass "scanned $SCANNED shipped runtime file(s) ($CORPUS); each budgets local input before buffering or sorting"
