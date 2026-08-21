#!/usr/bin/env bash
# test-submission-gates.sh — regression tests for the submission-content gates
# (c28-c35) added after the Pit Wall / Crew Chief submissions shipped with
# defects that only a hand sweep or a four-agent review panel caught:
#   - em dashes across README/docs/banner (c28)
#   - real private names in demo seed / fixtures, scrubbed via history rewrite (c29)
#   - stray tilde pair rendering as GitHub strikethrough (c30)
#   - Text rendering untrusted API strings as AutoText; curl with no
#     --max-filesize (c31)
#   - validator / lint issues caught late (c32, c33)
#   - an --exec action built from unquoted data, which Omarchy dispatches
#     through `bash -lc` (c34)
#   - a plugin depending on a runtime (node/python) that a stock Omarchy
#     install does not put on the graphical session PATH, so it installs
#     cleanly and then silently never populates (c35)
#
# Each test builds a synthetic tree that trips the gate and a sibling that
# passes, then asserts the exact severity. Sibling to test-known-traps.sh.
#
# Usage: test-submission-gates.sh [--verbose]
# Exit 0: all tests pass.  Exit 1: any test fails.

set -uo pipefail

VERBOSE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATES="$SCRIPT_DIR/gates"
TMPDIR=$(/usr/bin/mktemp -d)
trap '/usr/bin/rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0
RESULTS=()

red()    { /usr/bin/printf '\033[31m%s\033[0m' "$1"; }
green()  { /usr/bin/printf '\033[32m%s\033[0m' "$1"; }

# Run one gate with a directory candidate; echo its severity.
gate_severity() {
  local gate="$1" tree="$2"
  local input
  input=$(jq -nc --arg c "$tree" \
    '{candidate: $c, dossier: "", action: "omarchy-submit", env: {repo: "test/synthetic-entry", branch: "main"}}')
  local out
  out=$(/usr/bin/printf '%s' "$input" | "$GATES/$gate" 2>/dev/null)
  [[ "$VERBOSE" == "--verbose" ]] && /usr/bin/printf '    %s\n' "$out" >&2
  /usr/bin/printf '%s' "$out" | jq -r '.severity'
}

assert_severity() {
  local name="$1" expected="$2" actual="$3"
  /usr/bin/printf '  %-62s ' "$name"
  if [[ "$actual" == "$expected" ]]; then
    green "PASS"; /usr/bin/echo
    PASS=$((PASS + 1)); RESULTS+=("PASS: $name")
  else
    red "FAIL"; /usr/bin/echo
    /usr/bin/printf '    expected %s but got %s\n' "$expected" "$actual" >&2
    FAIL=$((FAIL + 1)); RESULTS+=("FAIL: $name (expected $expected got $actual)")
  fi
}

# Build a synthetic entry tree. Args: name, then file/content pairs.
make_tree() {
  local name="$1"; shift
  local dir="$TMPDIR/$name"
  /usr/bin/mkdir -p "$dir"
  while [[ $# -gt 0 ]]; do
    local rel="$1" content="$2"; shift 2
    /usr/bin/mkdir -p "$dir/$(/usr/bin/dirname "$rel")"
    /usr/bin/printf '%s\n' "$content" > "$dir/$rel"
  done
  /usr/bin/printf '%s' "$dir"
}

/usr/bin/printf '\n=== submission-content gate regression tests (c28-c35) ===\n\n'

# ---- C28: em/en dashes ----
/usr/bin/printf 'C28 voice-no-dashes\n'
T=$(make_tree c28-dirty "README.md" "A widget for the bar — deep live data")
assert_severity "  em dash in README MUST BLOCK" "BLOCK" "$(gate_severity c28-voice-no-dashes.sh "$T")"
T=$(make_tree c28-endash "manifest.json" '{"desc":"laps 1–5"}')
assert_severity "  en dash in manifest.json MUST BLOCK" "BLOCK" "$(gate_severity c28-voice-no-dashes.sh "$T")"
T=$(make_tree c28-clean "README.md" "A widget for the bar. Deep live data, plain voice." "assets/banner.svg" "<svg><text>PIT WALL</text></svg>")
assert_severity "  clean prose MUST PASS" "PASS" "$(gate_severity c28-voice-no-dashes.sh "$T")"
T=$(make_tree c28-qml-literal "Panel.qml" 'Item {
  property string tooltip: "Widget — loading"
}')
assert_severity "  em dash in a QML string literal MUST BLOCK" "BLOCK" "$(gate_severity c28-voice-no-dashes.sh "$T")"
T=$(make_tree c28-qml-comment "Panel.qml" '// data state — last-good values stay visible
Item {
  property string tooltip: "Widget: loading"
}')
assert_severity "  em dash only in a QML comment MUST PASS" "PASS" "$(gate_severity c28-voice-no-dashes.sh "$T")"

# ---- C29: private names ----
/usr/bin/printf 'C29 private-names\n'
DL="$TMPDIR/denylist.txt"
/usr/bin/printf '# test denylist\nbraves-booth\nnixtla\n' > "$DL"
export PRIVATE_NAMES_FILE="$DL"
T=$(make_tree c29-content "tests/fixtures/seed.json" '{"project":"braves-booth","runs":3}')
assert_severity "  private name in fixture content MUST BLOCK" "BLOCK" "$(gate_severity c29-private-names.sh "$T")"
T=$(make_tree c29-filename "docs/nixtla-notes.md" "neutral content")
assert_severity "  private name in a FILENAME MUST BLOCK" "BLOCK" "$(gate_severity c29-private-names.sh "$T")"
T=$(make_tree c29-public "tests/fixtures/teams.json" '{"team":"Atlanta Braves","league":"NL East"}')
assert_severity "  public team name (Atlanta Braves) MUST PASS" "PASS" "$(gate_severity c29-private-names.sh "$T")"
export PRIVATE_NAMES_FILE="$TMPDIR/nonexistent-denylist.txt"
T=$(make_tree c29-nodeny "README.md" "clean")
assert_severity "  missing denylist MUST WARN (not pass silently)" "WARN" "$(gate_severity c29-private-names.sh "$T")"
unset PRIVATE_NAMES_FILE

# ---- C30: markdown strikethrough ----
/usr/bin/printf 'C30 md-strikethrough\n'
T=$(make_tree c30-double "README.md" "the old flow is ~~gone~~ replaced")
assert_severity "  ~~pair~~ MUST WARN" "WARN" "$(gate_severity c30-md-strikethrough.sh "$T")"
T=$(make_tree c30-single "README.md" "range is ~2s~ per lap wrong")
assert_severity "  flanking single-tilde pair MUST WARN" "WARN" "$(gate_severity c30-md-strikethrough.sh "$T")"
T=$(make_tree c30-paths "README.md" "config lives in ~/.config and scripts in ~/bin today")
assert_severity "  two ~/paths on one line MUST PASS (no flanking)" "PASS" "$(gate_severity c30-md-strikethrough.sh "$T")"
T=$(make_tree c30-fence "README.md" '```
tar -xf ~~weird~~ inside a fence
```
prose after')
assert_severity "  tildes inside a code fence MUST PASS" "PASS" "$(gate_severity c30-md-strikethrough.sh "$T")"

# ---- C31: QML security ----
/usr/bin/printf 'C31 omarchy-qml-security\n'
T=$(make_tree c31-autotext "Widget.qml" 'Item {
  Text {
    text: model.lastPlay
    color: "white"
  }
}')
assert_severity "  Text binds data w/o textFormat MUST BLOCK" "BLOCK" "$(gate_severity c31-omarchy-qml-security.sh "$T")"
T=$(make_tree c31-guarded "Widget.qml" 'Item {
  Text {
    text: model.lastPlay
    textFormat: Text.PlainText
  }
}')
assert_severity "  Text with textFormat MUST PASS" "PASS" "$(gate_severity c31-omarchy-qml-security.sh "$T")"
T=$(make_tree c31-literal "Widget.qml" 'Item {
  Text {
    text: "static label"
  }
}')
assert_severity "  Text with pure string literal MUST PASS" "PASS" "$(gate_severity c31-omarchy-qml-security.sh "$T")"
T=$(make_tree c31-curl "Fetcher.qml" 'Item {
  property var cmd: ["curl", "-fsS", "https://api.example.com/feed"]
}')
assert_severity "  curl argv w/o --max-filesize MUST BLOCK" "BLOCK" "$(gate_severity c31-omarchy-qml-security.sh "$T")"
T=$(make_tree c31-curlok "Fetcher.qml" 'Item {
  property var cmd: ["curl", "-fsS", "--max-filesize", "8000000", "https://api.example.com/feed"]
}')
assert_severity "  curl argv with --max-filesize MUST PASS" "PASS" "$(gate_severity c31-omarchy-qml-security.sh "$T")"
T=$(make_tree c31-noqml "README.md" "no qml here")
assert_severity "  tree without .qml MUST SKIP" "SKIP" "$(gate_severity c31-omarchy-qml-security.sh "$T")"

# ---- C32: omarchy-plugin-validate ----
/usr/bin/printf 'C32 omarchy-validate\n'
STUB_OK="$TMPDIR/validate-ok"; /usr/bin/printf '#!/bin/bash\nexit 0\n' > "$STUB_OK"; /usr/bin/chmod +x "$STUB_OK"
STUB_BAD="$TMPDIR/validate-bad"; /usr/bin/printf '#!/bin/bash\necho "manifest: id missing"; exit 1\n' > "$STUB_BAD"; /usr/bin/chmod +x "$STUB_BAD"
T=$(make_tree c32-entry "manifest.json" '{"id":"io.test.entry"}')
export OMARCHY_PLUGIN_VALIDATE="$STUB_OK"
assert_severity "  validator exit 0 MUST PASS" "PASS" "$(gate_severity c32-omarchy-validate.sh "$T")"
export OMARCHY_PLUGIN_VALIDATE="$STUB_BAD"
assert_severity "  validator exit 1 MUST BLOCK" "BLOCK" "$(gate_severity c32-omarchy-validate.sh "$T")"
export OMARCHY_PLUGIN_VALIDATE="$TMPDIR/no-such-validator"
assert_severity "  validator missing MUST SKIP" "SKIP" "$(gate_severity c32-omarchy-validate.sh "$T")"
T=$(make_tree c32-nomanifest "README.md" "not a plugin")
export OMARCHY_PLUGIN_VALIDATE="$STUB_OK"
assert_severity "  no manifest.json MUST SKIP" "SKIP" "$(gate_severity c32-omarchy-validate.sh "$T")"
unset OMARCHY_PLUGIN_VALIDATE

# ---- C33: qmllint ----
/usr/bin/printf 'C33 qmllint\n'
STUB_LINT_ERR="$TMPDIR/qmllint-err"; /usr/bin/printf '#!/bin/bash\necho "Error: unqualified access"; exit 1\n' > "$STUB_LINT_ERR"; /usr/bin/chmod +x "$STUB_LINT_ERR"
STUB_LINT_WARN="$TMPDIR/qmllint-warn"; /usr/bin/printf '#!/bin/bash\necho "Warning: unused import"; exit 0\n' > "$STUB_LINT_WARN"; /usr/bin/chmod +x "$STUB_LINT_WARN"
STUB_LINT_OK="$TMPDIR/qmllint-ok"; /usr/bin/printf '#!/bin/bash\nexit 0\n' > "$STUB_LINT_OK"; /usr/bin/chmod +x "$STUB_LINT_OK"
T=$(make_tree c33-entry "Widget.qml" 'Item {}')
export QMLLINT="$STUB_LINT_ERR"
assert_severity "  qmllint Error MUST BLOCK" "BLOCK" "$(gate_severity c33-qmllint.sh "$T")"
export QMLLINT="$STUB_LINT_WARN"
assert_severity "  qmllint Warning-only MUST INFORM (not block)" "INFORM" "$(gate_severity c33-qmllint.sh "$T")"
export QMLLINT="$STUB_LINT_OK"
assert_severity "  qmllint clean MUST PASS" "PASS" "$(gate_severity c33-qmllint.sh "$T")"
export QMLLINT="$TMPDIR/no-such-qmllint"
assert_severity "  qmllint missing MUST SKIP" "SKIP" "$(gate_severity c33-qmllint.sh "$T")"
unset QMLLINT

# ---- C34: exec/notification command injection ----
/usr/bin/printf 'C34 omarchy-exec-injection\n'
T=$(make_tree c34-bare "bin/poll.js" 'var flags = ["-u", "low"];
if (it.url) flags.push("--exec", "xdg-open " + it.url);')
assert_severity "  --exec value built by bare concat MUST BLOCK" "BLOCK" "$(gate_severity c34-omarchy-exec-injection.sh "$T")"
T=$(make_tree c34-wrapped "bin/poll.js" 'var flags = ["-u", "low"];
if (it.url) flags.push("--exec", "xdg-open '"'"'" + it.url + "'"'"'");')
assert_severity "  --exec value single-quote-wrapped MUST PASS" "PASS" "$(gate_severity c34-omarchy-exec-injection.sh "$T")"
T=$(make_tree c34-literal "bin/poll.js" 'flags.push("--exec", "xdg-open https://x.test/thread")')
assert_severity "  --exec pure-literal value MUST PASS" "PASS" "$(gate_severity c34-omarchy-exec-injection.sh "$T")"
T=$(make_tree c34-tmpl "bin/poll.mjs" 'Util.execDetached(`xdg-open ${url}`)')
assert_severity "  execDetached unquoted template MUST BLOCK" "BLOCK" "$(gate_severity c34-omarchy-exec-injection.sh "$T")"
T=$(make_tree c34-tmpl-ok "bin/poll.mjs" 'Util.execDetached(`xdg-open '"'"'${url}'"'"'`)')
assert_severity "  execDetached single-quoted template MUST PASS" "PASS" "$(gate_severity c34-omarchy-exec-injection.sh "$T")"
T=$(make_tree c34-comment "bin/poll.js" '// the --exec value runs as bash -lc "cmd " + so we quote it
var x = "safe";')
assert_severity "  comment mentioning --exec MUST PASS" "PASS" "$(gate_severity c34-omarchy-exec-injection.sh "$T")"
T=$(make_tree c34-nocode "README.md" "docs only, no exec")
assert_severity "  tree without code files MUST SKIP" "SKIP" "$(gate_severity c34-omarchy-exec-injection.sh "$T")"


# ---- C35: runtime dependency a stock Omarchy install lacks ----
/usr/bin/printf 'C35 omarchy-runtime-dependency\n'
MANIFEST='{"id":"io.test.p","entryPoints":{"barWidget":"BarWidget.qml"}}'
T=$(make_tree c35-node "manifest.json" "$MANIFEST" "bin/p-poll" '#!/usr/bin/env node
console.log(1)')
assert_severity "  shipped node script MUST BLOCK" "BLOCK" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"
T=$(make_tree c35-python "manifest.json" "$MANIFEST" "helper" '#!/usr/bin/env python3
print(1)')
assert_severity "  shipped python script MUST BLOCK" "BLOCK" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"
T=$(make_tree c35-bash "manifest.json" "$MANIFEST" "bin/p-login" '#!/usr/bin/env bash
echo hi')
assert_severity "  shipped bash script MUST PASS" "PASS" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"
T=$(make_tree c35-qmlnode "manifest.json" "$MANIFEST" "Service.qml" 'Process { command: ["node", "x.js"] }')
assert_severity "  QML spawning node MUST BLOCK" "BLOCK" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"
T=$(make_tree c35-qmlcurl "manifest.json" "$MANIFEST" "Service.qml" 'Process { command: ["curl", "-fsS", "--", url] }')
assert_severity "  QML spawning curl MUST PASS" "PASS" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"
T=$(make_tree c35-qmlcomment "manifest.json" "$MANIFEST" "Service.qml" '// not node: command: ["node"]
Process { command: ["curl"] }')
assert_severity "  QML comment naming node MUST PASS" "PASS" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"
T=$(make_tree c35-testsonly "manifest.json" "$MANIFEST" "tests/run.js" '#!/usr/bin/env node')
assert_severity "  node under tests/ MUST PASS (dev-only)" "PASS" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"
T=$(make_tree c35-notplugin "README.md" "not a plugin")
assert_severity "  tree without a manifest MUST SKIP" "SKIP" "$(gate_severity c35-omarchy-runtime-dependency.sh "$T")"

# ---- Historical regression: the real pre-fix node-poller trees ----
# Both entries shipped a bin/<name>-poll running under `#!/usr/bin/env node`,
# which a stock Omarchy install cannot execute from the graphical session.
for PAIR in "omarchy-listening-post-entry:fad97bf" "omarchy-x-files-entry:2829b83"; do
  REPO="$HOME/000-projects/${PAIR%%:*}"
  SHA="${PAIR##*:}"
  if [[ -d "$REPO/.git" ]] && /usr/bin/git -C "$REPO" cat-file -e "$SHA" 2>/dev/null; then
    /usr/bin/printf 'Historical (c35): %s @ %s\n' "${PAIR%%:*}" "$SHA"
    /usr/bin/git -C "$REPO" worktree add "$TMPDIR/c35-${SHA}" "$SHA" >/dev/null 2>&1
    assert_severity "  pre-fix node-poller tree MUST BLOCK on c35" "BLOCK" "$(gate_severity c35-omarchy-runtime-dependency.sh "$TMPDIR/c35-${SHA}")"
    assert_severity "  current (node-free) tree MUST PASS c35" "PASS" "$(gate_severity c35-omarchy-runtime-dependency.sh "$REPO")"
    /usr/bin/git -C "$REPO" worktree remove --force "$TMPDIR/c35-${SHA}" >/dev/null 2>&1
  else
    /usr/bin/printf 'Historical (c35): SKIP (%s @ %s unavailable)\n' "${PAIR%%:*}" "$SHA"
  fi
done

# ---- Historical regression: the real pre-fix Pit Wall states ----
# Proves the gates would have blocked what actually shipped. Conditional on
# the entry repo being present (like B13's clone-conditional tests).
PITWALL="$HOME/000-projects/omarchy-pit-wall-entry"
if [[ -d "$PITWALL/.git" ]] \
  && /usr/bin/git -C "$PITWALL" cat-file -e 2e314a7 2>/dev/null \
  && /usr/bin/git -C "$PITWALL" cat-file -e a6f14f4 2>/dev/null; then
  /usr/bin/printf 'Historical: real pre-fix Pit Wall trees\n'
  /usr/bin/git -C "$PITWALL" worktree add "$TMPDIR/pw-pre-emdash" 2e314a7^ >/dev/null 2>&1
  /usr/bin/git -C "$PITWALL" worktree add "$TMPDIR/pw-pre-security" a6f14f4^ >/dev/null 2>&1
  assert_severity "  pre-emdash-sweep tree MUST BLOCK on c28" "BLOCK" "$(gate_severity c28-voice-no-dashes.sh "$TMPDIR/pw-pre-emdash")"
  assert_severity "  pre-security-fix tree MUST BLOCK on c31" "BLOCK" "$(gate_severity c31-omarchy-qml-security.sh "$TMPDIR/pw-pre-security")"
  assert_severity "  current (fixed) tree MUST PASS c28" "PASS" "$(gate_severity c28-voice-no-dashes.sh "$PITWALL")"
  assert_severity "  current (fixed) tree MUST PASS c31" "PASS" "$(gate_severity c31-omarchy-qml-security.sh "$PITWALL")"
  /usr/bin/git -C "$PITWALL" worktree remove --force "$TMPDIR/pw-pre-emdash" >/dev/null 2>&1
  /usr/bin/git -C "$PITWALL" worktree remove --force "$TMPDIR/pw-pre-security" >/dev/null 2>&1
else
  /usr/bin/printf 'Historical: SKIP (no local omarchy-pit-wall-entry with known commits)\n'
fi

# ---- Historical regression: the real pre-fix Listening Post exec RCE ----
# b8316bb shipped `flags.push("--exec", "xdg-open " + it.url)` before the
# review panel caught it; d37a20a hardened it. Proves c34 would have blocked
# the RCE the moment it was written.
LP="$HOME/000-projects/omarchy-listening-post-entry"
if [[ -d "$LP/.git" ]] && /usr/bin/git -C "$LP" cat-file -e b8316bb 2>/dev/null; then
  /usr/bin/printf 'Historical: real pre-fix Listening Post exec RCE\n'
  /usr/bin/git -C "$LP" worktree add "$TMPDIR/lp-pre-exec" b8316bb >/dev/null 2>&1
  assert_severity "  pre-fix Listening Post tree MUST BLOCK on c34" "BLOCK" "$(gate_severity c34-omarchy-exec-injection.sh "$TMPDIR/lp-pre-exec")"
  assert_severity "  current (hardened) tree MUST PASS c34" "PASS" "$(gate_severity c34-omarchy-exec-injection.sh "$LP")"
  /usr/bin/git -C "$LP" worktree remove --force "$TMPDIR/lp-pre-exec" >/dev/null 2>&1
else
  /usr/bin/printf 'Historical (c34): SKIP (no local omarchy-listening-post-entry at b8316bb)\n'
fi

/usr/bin/echo
/usr/bin/printf '=== summary: %s passed · %s failed ===\n\n' \
  "$(green "$PASS")" "$([ "$FAIL" -gt 0 ] && red "$FAIL" || /usr/bin/echo 0)"

if [[ "$FAIL" -gt 0 ]]; then
  /usr/bin/printf 'Failures:\n'
  for R in "${RESULTS[@]}"; do
    [[ "$R" == FAIL:* ]] && /usr/bin/printf '  %s\n' "$R"
  done
  exit 1
fi
exit 0
