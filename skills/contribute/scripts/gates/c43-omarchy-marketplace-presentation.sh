#!/usr/bin/env bash
# Catalog: C43 — an Omarchy marketplace submission whose first impression was
# never treated as a release artifact.
#
# This gate exists because structurally valid plugins reached the marketplace
# with fifty-character descriptions, distant panels floating in black frames,
# and cloned placeholder banners. Correct code does not rescue a listing that
# cannot explain or show its value. The marketplace currently accepts 500
# description characters, derives its initials tile itself, and renders the
# root preview as the product image. Those are release contracts.
#
# During development, enforce the authored copy and banner. At omarchy-submit,
# additionally require a hash-bound receipt from a real-shell render. Visual
# judgement still belongs to a human, but blank, stale, distant, synthetic, or
# provenance-free evidence must never arrive for that judgement.
source "$(dirname "$0")/lib/preamble.sh"

gate_read_input
gate_resolve_tree

if [[ -z "$GATE_TREE_DIR" || ! -f "$GATE_TREE_DIR/manifest.json" ]]; then
  gate_skip "not an Omarchy plugin tree"
fi

MANIFEST="$GATE_TREE_DIR/manifest.json"
NAME=$(/usr/bin/jq -r '.name // ""' "$MANIFEST" 2>/dev/null)
PLUGIN_ID=$(/usr/bin/jq -r '.id // ""' "$MANIFEST" 2>/dev/null)
DESCRIPTION=$(/usr/bin/jq -r '.description // ""' "$MANIFEST" 2>/dev/null)
BAR_DESCRIPTION=$(/usr/bin/jq -r '.barWidget.description // ""' "$MANIFEST" 2>/dev/null)
HAS_BAR_WIDGET=$(/usr/bin/jq -r 'has("barWidget") and (.barWidget | type == "object")' "$MANIFEST" 2>/dev/null)
DESC_LENGTH=$(/usr/bin/python3 - "$DESCRIPTION" <<'PY'
import sys
print(len(sys.argv[1]))
PY
)
BAR_DESC_LENGTH=$(/usr/bin/python3 - "$BAR_DESCRIPTION" <<'PY'
import sys
print(len(sys.argv[1]))
PY
)

FINDINGS=()

# The catalog schema's current hard maximum is 500 characters. Requiring the
# complete allowance is deliberate for this estate: every short description
# that escaped was generic, while the full copy can state the action, outcome,
# persistence/privacy boundary, and exclusions a user actually evaluates.
if [[ "$DESC_LENGTH" != "500" ]]; then
  FINDINGS+=("manifest description uses $DESC_LENGTH/500 characters")
fi
if [[ "$HAS_BAR_WIDGET" == "true" && "$BAR_DESC_LENGTH" != "500" ]]; then
  FINDINGS+=("barWidget description uses $BAR_DESC_LENGTH/500 characters")
fi
if [[ "$HAS_BAR_WIDGET" == "true" && "$DESCRIPTION" != "$BAR_DESCRIPTION" ]]; then
  FINDINGS+=("manifest and barWidget descriptions tell different product stories")
fi

# Length alone is not copy quality. A submission description must identify the
# product, explain what the user can see or do, and state a meaningful trust
# boundary. These checks deliberately reject generic 500-character filler while
# repo-specific contract tests pin the precise claims each plugin is allowed to
# make.
COPY_RESULT=$(DESCRIPTION="$DESCRIPTION" PLUGIN_NAME="$NAME" /usr/bin/python3 <<'PY'
import os
import re

description = os.environ["DESCRIPTION"].strip()
name = os.environ["PLUGIN_NAME"].strip()
lower = description.casefold()
findings = []

if name and name.casefold() not in lower:
    findings.append("description never names the plugin")

sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", description) if part.strip()]
if len(sentences) < 4:
    findings.append("description needs at least four readable sentences")
if sentences and len(sentences[0]) < 50:
    findings.append("opening sentence is too thin to establish the user outcome")

surface_terms = ("bar", "panel", "pill", "widget")
if not any(re.search(rf"\b{term}\b", lower) for term in surface_terms):
    findings.append("description never explains the visible bar, panel, pill, or widget")

interaction_terms = (
    "open", "click", "select", "start", "copy", "install", "jump", "focus",
    "mark", "refresh", "clear", "choose", "preview", "show", "shows", "see",
    "sort", "scan", "reads", "switch", "count", "counts",
)
if not any(re.search(rf"\b{term}\w*\b", lower) for term in interaction_terms):
    findings.append("description gives no concrete user interaction or visible behavior")

boundary_terms = ("no ", "never ", "only ", "without ", "offline", "local", "private", "fixed ")
if not any(term in lower for term in boundary_terms):
    findings.append("description gives no privacy, network, data, or write boundary")

banned = (
    "cutting-edge", "game-changer", "game-changing", "revolutionary", "supercharge",
    "seamless", "robust solution", "unlock your", "take your productivity to the next level",
)
present = [term for term in banned if term in lower]
if present:
    findings.append("description contains generic marketing filler: " + ", ".join(present))

print("; ".join(findings))
PY
)
[[ -n "$COPY_RESULT" ]] && FINDINGS+=("$COPY_RESULT")

BANNER="$GATE_TREE_DIR/assets/banner.svg"
if [[ ! -f "$BANNER" ]]; then
  FINDINGS+=("assets/banner.svg is missing")
else
  BANNER_RESULT=$(BANNER="$BANNER" PLUGIN_NAME="$NAME" /usr/bin/python3 <<'PY'
import os, re, sys, xml.etree.ElementTree as ET

path = os.environ["BANNER"]
name = os.environ["PLUGIN_NAME"].strip().lower()
try:
    raw = open(path, encoding="utf-8", errors="strict").read()
except (OSError, UnicodeError) as exc:
    print(f"banner is unreadable UTF-8: {exc}")
    raise SystemExit
if len(raw.encode("utf-8")) > 200_000:
    print("banner exceeds the 200 KiB authored-asset ceiling")
    raise SystemExit
lower = raw.lower()
if "<script" in lower or "<foreignobject" in lower or re.search(r'(?:href|src)\s*=\s*["\'](?:https?:|//)', lower):
    print("banner embeds executable or remote content")
    raise SystemExit
try:
    root = ET.fromstring(raw)
except ET.ParseError as exc:
    print(f"banner is not valid SVG XML: {exc}")
    raise SystemExit
if root.tag.split("}")[-1] != "svg":
    print("banner root is not svg")
    raise SystemExit
view = root.attrib.get("viewBox", "").replace(",", " ").split()
try:
    _, _, width, height = map(float, view)
except (ValueError, TypeError):
    print("banner needs a numeric viewBox")
    raise SystemExit
if width < 1000 or height < 240 or width / height < 2.5:
    print("banner needs a wide marketplace composition (at least 1000x240 and 2.5:1)")
    raise SystemExit
text = " ".join("".join(root.itertext()).split()).lower()
if name and name not in text:
    print("banner title/content does not name this plugin (possible template placeholder)")
    raise SystemExit
tags = {node.tag.split("}")[-1] for node in root.iter()}
if not tags.intersection({"path", "line", "polyline", "polygon", "circle", "ellipse", "linearGradient", "radialGradient"}):
    print("banner has no plugin-specific graphic beyond rectangles and text")
    raise SystemExit
colors = {c.lower() for c in re.findall(r"#[0-9a-fA-F]{6}\b", raw)}
if len(colors) < 3:
    print("banner needs at least three authored colors")
PY
)
  [[ -n "$BANNER_RESULT" ]] && FINDINGS+=("$BANNER_RESULT")
fi

# The repository template is intentionally not a marketplace submission. It
# carries one exact, invalid-for-publication placeholder identity so its own CI
# can prove the authored copy/banner scaffold without manufacturing a fake live
# product preview. Any generated plugin changes the id/name and immediately
# falls through to the full submit-time preview proof below.
if [[ "$PLUGIN_ID" == "io.github.YOURNAME.widget-name" && "$NAME" == "Widget Name" && ${#FINDINGS[@]} -eq 0 ]]; then
  gate_pass "marketplace presentation scaffold is complete; exact template identity is not a submit candidate"
fi

if [[ "$GATE_ACTION" == "omarchy-submit" ]]; then
  PREVIEW="$GATE_TREE_DIR/preview.png"
  PROOF="$GATE_TREE_DIR/.render-proof.json"

  # A render receipt must certify the tree being submitted, not merely agree
  # with its own preview hash. Keep this scope identical to rig-render.sh:
  # manifest, QML, JavaScript, every executable shipped by the plugin, and all
  # deterministic render controls under e2e/. C37 deliberately covers runtime
  # only; presentation proof must also change when its fixture or framing does.
  # scripts/ is the vendored gate lane and is intentionally excluded.
  presentation_fingerprint() {
    ( cd "$GATE_TREE_DIR" && \
      /usr/bin/find . -type f \
        -not -path './.git/*' -not -path './tests/*' \
        -not -path './scripts/*' -not -path './node_modules/*' \
        \( -path './e2e/*' -o -name '*.qml' -o -name '*.js' -o -name 'manifest.json' -o -perm -u+x \) \
        -print0 2>/dev/null \
      | LC_ALL=C /usr/bin/sort -z \
      | /usr/bin/xargs -0 /usr/bin/cat 2>/dev/null \
      | /usr/bin/sha256sum | /usr/bin/cut -d' ' -f1 )
  }

  if [[ ! -f "$PREVIEW" ]]; then
    FINDINGS+=("preview.png is missing")
  fi
  if [[ ! -f "$PROOF" ]]; then
    FINDINGS+=(".render-proof.json is missing")
  fi

  if [[ -f "$PREVIEW" && -f "$PROOF" ]]; then
    PREVIEW_SHA=$(/usr/bin/sha256sum "$PREVIEW" | /usr/bin/cut -d' ' -f1)
    RECORDED_SHA=$(/usr/bin/jq -r '.previewSha256 // ""' "$PROOF" 2>/dev/null)
    RECORDED_FINGERPRINT=$(/usr/bin/jq -r '.fingerprint // ""' "$PROOF" 2>/dev/null)
    CURRENT_FINGERPRINT=$(presentation_fingerprint)
    SOURCE_DIRTY=$(/usr/bin/jq -r 'if has("sourceDirty") then .sourceDirty else true end' "$PROOF" 2>/dev/null)
    SOURCE_PACKAGE=$(/usr/bin/jq -r '.sourcePackageSha256 // ""' "$PROOF" 2>/dev/null)
    REMOTE_PACKAGE=$(/usr/bin/jq -r '.remotePackageSha256 // ""' "$PROOF" 2>/dev/null)
    RUN_ID=$(/usr/bin/jq -r '.runId // ""' "$PROOF" 2>/dev/null)
    LOG_SHA=$(/usr/bin/jq -r '.rawShellLogSha256 // ""' "$PROOF" 2>/dev/null)
    COVERAGE=$(/usr/bin/jq -r '.nonblackCoverage // 0' "$PROOF" 2>/dev/null)
    BOUNDARY=$(/usr/bin/jq -r '.evidenceBoundary // ""' "$PROOF" 2>/dev/null)
    INSPECTION_STATUS=$(/usr/bin/jq -r '.visualInspection.status // ""' "$PROOF" 2>/dev/null)
    INSPECTION_SHA=$(/usr/bin/jq -r '.visualInspection.previewSha256 // ""' "$PROOF" 2>/dev/null)
    INSPECTION_CHECKS=$(/usr/bin/jq -r '(.visualInspection.checks // []) | join("|")' "$PROOF" 2>/dev/null)
    RECORDED_DIMS=$(/usr/bin/jq -r '.dimensions // ""' "$PROOF" 2>/dev/null | /usr/bin/tr -d ' ')
    ACTUAL_DIMS=$(/usr/bin/python3 - "$PREVIEW" <<'PY'
import struct, sys
try:
    raw = open(sys.argv[1], "rb").read(24)
    if raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise ValueError
    print(f"{struct.unpack('>I', raw[16:20])[0]}x{struct.unpack('>I', raw[20:24])[0]}")
except (OSError, ValueError, struct.error):
    print("unreadable")
PY
)

    [[ "$PREVIEW_SHA" == "$RECORDED_SHA" ]] || FINDINGS+=("preview hash does not match the render receipt")
    [[ -n "$RECORDED_FINGERPRINT" && "$RECORDED_FINGERPRINT" == "$CURRENT_FINGERPRINT" ]] || \
      FINDINGS+=("render receipt does not match the current plugin tree")
    [[ "$SOURCE_DIRTY" == "false" ]] || FINDINGS+=("render receipt was produced from a dirty source tree")
    [[ -n "$SOURCE_PACKAGE" && "$SOURCE_PACKAGE" == "$REMOTE_PACKAGE" ]] || FINDINGS+=("source and remote render-package hashes do not match")
    [[ "$RUN_ID" =~ ^[a-z0-9][a-z0-9-]+$ ]] || FINDINGS+=("render receipt has no exact rig run ID")
    [[ "$LOG_SHA" =~ ^[a-f0-9]{64}$ ]] || FINDINGS+=("render receipt has no raw shell-log SHA")
    [[ "$ACTUAL_DIMS" == "$RECORDED_DIMS" ]] || FINDINGS+=("preview dimensions do not match the render receipt")

    WIDTH=${ACTUAL_DIMS%x*}
    HEIGHT=${ACTUAL_DIMS#*x}
    if [[ ! "$WIDTH" =~ ^[0-9]+$ || ! "$HEIGHT" =~ ^[0-9]+$ ]] || \
       (( WIDTH < 1280 || HEIGHT < 720 || WIDTH * 9 != HEIGHT * 16 )); then
      FINDINGS+=("preview must be a readable 16:9 PNG at least 1280x720 (found $ACTUAL_DIMS)")
    fi
    if ! /usr/bin/awk -v coverage="$COVERAGE" 'BEGIN { exit !(coverage >= 0.35) }'; then
      FINDINGS+=("preview nonblack coverage is $COVERAGE, below 0.35")
    fi
    case "$BOUNDARY" in
      *"real Omarchy shell"*"direct full-frame"*"no crop"*) ;;
      *) FINDINGS+=("render receipt does not prove a direct, uncropped real-shell capture") ;;
    esac
    [[ "$INSPECTION_STATUS" == "approved" && "$INSPECTION_SHA" == "$PREVIEW_SHA" ]] || \
      FINDINGS+=("preview lacks a hash-bound approved visual inspection")
    case "$INSPECTION_CHECKS" in
      *"product value visible at marketplace scale"*"no primary content clipped"*"plugin-specific visual identity"*) ;;
      *) FINDINGS+=("visual inspection checklist is incomplete") ;;
    esac
  fi
fi

if (( ${#FINDINGS[@]} )); then
  SUMMARY=$(/usr/bin/printf '%s;' "${FINDINGS[@]}" | /usr/bin/cut -c1-500)
  gate_block "marketplace presentation is incomplete: $SUMMARY" \
    "use the full 500-character manifest allowance; author assets/banner.svg specifically for this plugin; capture a focused 16:9 preview from the real Buzz Omarchy shell; retain a clean hash-bound .render-proof.json with exact run/log provenance; and inspect the final marketplace-scale image before submitting. initials tiles are generated by the marketplace and cannot replace these assets."
fi

if [[ "$GATE_ACTION" == "omarchy-submit" ]]; then
  gate_pass "marketplace copy, themed banner, and hash-bound live preview are submission-ready"
fi
gate_pass "marketplace copy and themed banner are authored for this plugin"
