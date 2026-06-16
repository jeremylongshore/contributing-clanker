#!/usr/bin/env python3
"""scout-score.py — apply weighted scoring to discover JSONL.

Reads JSONL on stdin (one candidate per line, output of scout-discover.sh).
Reads ~/.contribute-system/profile.md frontmatter for preferred_langs and
target_star_tiers. Emits ranked JSONL on stdout, sorted by score descending.

Score weights:
  star_tier in target_star_tiers       0.30
  competing_prs == 0                   0.25
  repo updated within last 30 days     0.20
  repo_lang in preferred_langs         0.15
  primary_label == 'good first issue'  0.10  (else 0.05 for help wanted)
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROFILE_PATH = Path.home() / ".contribute-system" / "profile.md"


def load_profile() -> dict:
    """Parse the YAML-ish frontmatter of profile.md (no PyYAML dep)."""
    if not PROFILE_PATH.exists():
        return {}
    text = PROFILE_PATH.read_text()
    match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return {}
    fm = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            fm[key] = [v.strip().lower() for v in inner.split(",") if v.strip()] if inner else []
        else:
            fm[key] = value.lower()
    return fm


def score(candidate: dict, profile: dict) -> float:
    s = 0.0
    target_tiers = profile.get("target_star_tiers", [])
    preferred_langs = profile.get("preferred_langs", [])

    if candidate.get("star_tier", "").lower() in target_tiers:
        s += 0.30
    if int(candidate.get("competing_prs", 0)) == 0:
        s += 0.25
    updated = candidate.get("repo_updated_at", "")
    if updated:
        try:
            dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            if dt > datetime.now(timezone.utc) - timedelta(days=30):
                s += 0.20
        except ValueError:
            pass
    if candidate.get("repo_lang", "").lower() in preferred_langs:
        s += 0.15
    label = candidate.get("primary_label", "").lower()
    if label == "good first issue":
        s += 0.10
    elif label == "help wanted":
        s += 0.05

    return round(s, 3)


def main() -> int:
    profile = load_profile()
    candidates = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"scout-score: skipping bad line: {e}", file=sys.stderr)
            continue
        obj["scout_score"] = score(obj, profile)
        candidates.append(obj)

    candidates.sort(key=lambda c: c.get("scout_score", 0.0), reverse=True)
    for c in candidates:
        print(json.dumps(c))
    return 0


if __name__ == "__main__":
    sys.exit(main())
