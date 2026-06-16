#!/usr/bin/env python3
"""scout-refresh.py — re-evaluate existing candidates for momentum.

Walks ~/.contribute-system/candidates/, re-fetches each candidate's repo
metadata via gh, updates frontmatter (star_count, competing_prs,
last_refreshed, momentum), and drops candidates that decayed:
  - maintainer silent >60 days
  - 3+ competing PRs appeared
  - issue closed

Appends a `scout_refresh` event to ~/.contribute-system/log.jsonl.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

CANDIDATES_DIR = Path.home() / ".contribute-system" / "candidates"
LOG_PATH = Path.home() / ".contribute-system" / "log.jsonl"


def gh_json(args: list[str]) -> dict | list | None:
    """Run gh with --json args, return parsed JSON or None on failure."""
    try:
        result = subprocess.run(
            args, capture_output=True, text=True, check=True, timeout=30
        )
        return json.loads(result.stdout) if result.stdout.strip() else None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return None


def parse_frontmatter(text: str) -> tuple[dict, str]:
    match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
    if not match:
        return {}, text
    fm = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        fm[key.strip()] = value.strip()
    return fm, match.group(2)


def serialize_frontmatter(fm: dict) -> str:
    lines = ["---"]
    for k, v in fm.items():
        lines.append(f"{k}: {v}")
    lines.append("---\n")
    return "\n".join(lines)


def append_log(event: str, details: dict) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "event": event,
        "details": details,
    }
    with LOG_PATH.open("a") as f:
        f.write(json.dumps(entry) + "\n")


def main() -> int:
    if not CANDIDATES_DIR.exists():
        print("no candidates dir; nothing to refresh", file=sys.stderr)
        return 0

    refreshed = 0
    dropped = 0
    drop_reasons: dict[str, int] = {}
    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    for path in sorted(CANDIDATES_DIR.glob("*.md")):
        text = path.read_text()
        fm, body = parse_frontmatter(text)
        repo = fm.get("repo")
        issue_number = fm.get("issue_number")
        if not repo or not issue_number:
            continue

        # Refresh repo metadata
        repo_data = gh_json(
            ["gh", "api", f"repos/{repo}", "--jq",
             "{stargazers_count, pushed_at, archived}"]
        )
        if not repo_data:
            continue

        if repo_data.get("archived"):
            path.unlink()
            dropped += 1
            drop_reasons["archived"] = drop_reasons.get("archived", 0) + 1
            continue

        # Maintainer silence
        pushed = repo_data.get("pushed_at", "")
        try:
            pushed_dt = datetime.fromisoformat(pushed.replace("Z", "+00:00"))
            silent_days = (now_utc - pushed_dt).days
        except ValueError:
            silent_days = 0
        if silent_days > 60:
            path.unlink()
            dropped += 1
            drop_reasons["silent_>60d"] = drop_reasons.get("silent_>60d", 0) + 1
            continue

        # Issue still open?
        issue_data = gh_json(
            ["gh", "api", f"repos/{repo}/issues/{issue_number}", "--jq", ".state"]
        )
        if issue_data == "closed":
            path.unlink()
            dropped += 1
            drop_reasons["issue_closed"] = drop_reasons.get("issue_closed", 0) + 1
            continue

        # Competing PRs
        prs = gh_json(
            ["gh", "pr", "list", "--repo", repo, "--state", "open",
             "--search", f"{issue_number} in:title,body",
             "--limit", "10", "--json", "number"]
        )
        competing = len(prs) if isinstance(prs, list) else 0
        if competing >= 3:
            path.unlink()
            dropped += 1
            drop_reasons["competing_>=3"] = drop_reasons.get("competing_>=3", 0) + 1
            continue

        # Compute growth velocity
        old_stars = int(fm.get("star_count", "0"))
        new_stars = int(repo_data.get("stargazers_count", old_stars))
        delta = new_stars - old_stars
        if old_stars > 0:
            pct = round((delta / old_stars) * 100, 2)
        else:
            pct = 0.0
        if pct > 10:
            momentum = "growing"
        elif pct < -3:
            momentum = "decaying"
        else:
            momentum = "holding"

        # Update frontmatter
        fm["star_count"] = str(new_stars)
        fm["competing_prs"] = str(competing)
        fm["last_refreshed"] = now_str
        fm["growth_velocity_pct"] = str(pct)
        fm["momentum"] = momentum

        path.write_text(serialize_frontmatter(fm) + body)
        refreshed += 1

    append_log("scout_refresh", {
        "refreshed": refreshed,
        "dropped": dropped,
        "drop_reasons": drop_reasons,
    })
    print(f"refreshed {refreshed}, dropped {dropped} ({drop_reasons})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
