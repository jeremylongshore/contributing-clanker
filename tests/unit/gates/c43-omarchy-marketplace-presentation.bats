#!/usr/bin/env bats
# Regression coverage for the marketplace presentation denominator. These are
# release artifacts, not README decoration: the description is the listing's
# value proposition, preview.png is the product image, and the banner is the
# repository's authored identity.

load '../test_helper'
bats_require_minimum_version 1.5.0

setup() {
  TREE=$(mktemp -d)
  /usr/bin/git -C "$TREE" init -q .
  /usr/bin/git -C "$TREE" -c user.email=test@example.com -c user.name=test \
    commit -q --allow-empty -m init
  make_valid_presentation
}

teardown() { rm -rf "$TREE"; }

make_valid_presentation() {
  mkdir -p "$TREE/assets"
  DESC=$(/usr/bin/python3 - <<'PY'
base = "Mark a focused boundary, see the recent timeline, and keep the complete workflow private on this Omarchy machine. "
detail = "Use the visible controls to close one context before opening another, preserve bounded local history across shell restarts, and understand exactly what the widget reads, stores, and never sends. No account, cloud sync, telemetry, calendar access, hidden helper, or network request is required. "
text = (base + detail + "Designed for keyboard-first operators who want deliberate transitions without surveillance. ")
print((text + "Local, clear, reversible. " * 20)[:500], end="")
PY
)
  /usr/bin/jq -n --arg d "$DESC" \
    '{name:"Test Plugin",version:"1.0.0",description:$d,entryPoints:{bar:"Bar.qml"}}' \
    > "$TREE/manifest.json"
  cat > "$TREE/assets/banner.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 360">
 <title>Test Plugin</title><desc>A deliberate test-plugin signal</desc>
 <rect width="1280" height="360" fill="#101820"/>
 <path d="M40 180h280l60-90 80 180 70-90h180" fill="none" stroke="#ff7a59"/>
 <circle cx="710" cy="180" r="42" fill="#68d5c8"/>
 <text x="790" y="200" fill="#f4efe8">TEST PLUGIN</text>
</svg>
SVG
  /usr/bin/python3 - "$TREE/preview.png" <<'PY'
import binascii, struct, sys, zlib
w, h = 1280, 720
row = b"\x00" + bytes((25, 35, 45)) * w
data = zlib.compress(row * h, 9)
def chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", data) + chunk(b"IEND", b"")
open(sys.argv[1], "wb").write(png)
PY
  SHA=$(/usr/bin/sha256sum "$TREE/preview.png" | /usr/bin/cut -d' ' -f1)
  /usr/bin/jq -n --arg sha "$SHA" \
    '{sourceDirty:false,sourcePackageSha256:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",remotePackageSha256:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",runId:"test-plugin-123",rawShellLogSha256:"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",previewSha256:$sha,dimensions:"1280 x 720",nonblackCoverage:0.8,evidenceBoundary:"isolated real Omarchy shell; direct full-frame capture with no crop or post-processing",visualInspection:{status:"approved",previewSha256:$sha,checks:["product value visible at marketplace scale","no primary content clipped","plugin-specific visual identity"]}}' \
    > "$TREE/.render-proof.json"
}

run_gate() {
  local action="${1:-omarchy-submit}"
  local input_json
  input_json=$(/usr/bin/jq -nc --arg t "$TREE" --arg a "$action" \
    '{candidate:$t,dossier:"",action:$a,env:{repo:"o/r",branch:"main"}}')
  run --separate-stderr bash -c 'printf "%s" "$1" | "$2"' _ "$input_json" \
    "$GATES_DIR/c43-omarchy-marketplace-presentation.sh"
}

sev() { printf '%s' "$output" | /usr/bin/jq -r '.severity'; }

@test "c43 passes a full description, authored banner, and bound real-shell preview" {
  run_gate
  [ "$status" -eq 0 ]
  [ "$(sev)" = "PASS" ]
}

@test "c43 blocks a vague short marketplace description" {
  /usr/bin/jq '.description="A local ritual for intentional context boundaries."' \
    "$TREE/manifest.json" > "$TREE/manifest.next"
  mv -f "$TREE/manifest.next" "$TREE/manifest.json"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"characters"* ]]
}

@test "c43 blocks a missing or cloned placeholder banner" {
  rm -f "$TREE/assets/banner.svg"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"banner.svg is missing"* ]]

  make_valid_presentation
  sed -i 's/Test Plugin/Widget Template/g; s/TEST PLUGIN/WIDGET TEMPLATE/g; s/test-plugin/widget-template/g' "$TREE/assets/banner.svg"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"possible template placeholder"* ]]
}

@test "c43 blocks a preview whose bytes are not the certified render" {
  printf 'changed' >> "$TREE/preview.png"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"preview hash"* ]]
}

@test "c43 blocks dirty, provenance-free, distant render evidence" {
  /usr/bin/jq '.sourceDirty=true | .runId="" | .rawShellLogSha256="" | .nonblackCoverage=0.03' \
    "$TREE/.render-proof.json" > "$TREE/proof.next"
  mv -f "$TREE/proof.next" "$TREE/.render-proof.json"
  run_gate
  [ "$(sev)" = "BLOCK" ]
  [[ "$output" == *"dirty source tree"* ]]
  [[ "$output" == *"no exact rig run ID"* ]]
  [[ "$output" == *"below 0.35"* ]]
}

@test "c43 requires live preview proof only at submission time" {
  rm -f "$TREE/preview.png" "$TREE/.render-proof.json"
  run_gate pr_open
  [ "$status" -eq 0 ]
  [ "$(sev)" = "PASS" ]
}

@test "c43 exempts only the exact non-publishable template identity from live proof" {
  /usr/bin/jq '.id="io.github.YOURNAME.widget-name" | .name="Widget Name"' \
    "$TREE/manifest.json" > "$TREE/manifest.next"
  mv -f "$TREE/manifest.next" "$TREE/manifest.json"
  sed -i 's/Test Plugin/Widget Name/g; s/TEST PLUGIN/WIDGET NAME/g; s/test-plugin/widget-name/g' \
    "$TREE/assets/banner.svg"
  rm -f "$TREE/preview.png" "$TREE/.render-proof.json"
  run_gate
  [ "$status" -eq 0 ]
  [ "$(sev)" = "PASS" ]

  /usr/bin/jq '.id="io.github.someone.real-plugin"' "$TREE/manifest.json" > "$TREE/manifest.next"
  mv -f "$TREE/manifest.next" "$TREE/manifest.json"
  run_gate
  [ "$(sev)" = "BLOCK" ]
}
