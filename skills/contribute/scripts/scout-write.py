#!/usr/bin/env python3
"""scout-write.py — write ranked candidates to ~/.contribute-system/candidates/.

Reads ranked JSONL on stdin (output of scout-score.py). For each candidate,
writes a markdown file with frontmatter to candidates/. Idempotent: if a
candidate file already exists, updates the frontmatter in place rather than
overwriting the body (so user notes survive).

Limits: top 20 per tier when --limit-per-tier is passed (default), or top N
overall via --limit-overall.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

CANDIDATES_DIR = Path.home() / ".contribute-system" / "candidates"
LOG_PATH = Path.home() / ".contribute-system" / "log.jsonl"


def slug(repo: str, issue_number: int) -> str:
    repo_slug = repo.replace("/", "__")
    return f"{repo_slug}__issue{issue_number}.md"


def dossier_path(repo: str) -> str:
    """Path the researcher subagent writes/reads for this repo.

    Empty string if the dossier doesn't yet exist — the SKILL.md Step 0.5
    handler will see the empty value and invoke @researcher before any
    transition that needs it.
    """
    slug = repo.replace("/", "__")
    candidate = Path.home() / ".contribute-system" / "research" / f"{slug}.md"
    return str(candidate) if candidate.exists() else ""


def render(c: dict) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    labels = ", ".join(c.get("labels", []))
    research = dossier_path(c["repo"])
    return f"""---
discovered_at: {now}
repo: {c['repo']}
issue_number: {c['issue_number']}
issue_url: {c.get('issue_url', '')}
star_tier: {c['star_tier']}
star_count: {c['star_count']}
repo_lang: {c.get('repo_lang', 'unknown')}
competing_prs: {c.get('competing_prs', 0)}
primary_label: {c.get('primary_label', '')}
scout_score: {c.get('scout_score', 0.0)}
research_path: {research}
status: open
last_refreshed: {now}
---

# {c['repo']} #{c['issue_number']} — {c.get('issue_title', '(no title)')}

## Why scout flagged this

- {c['star_tier']} tier ({c['star_count']:,} ★)
- Language: {c.get('repo_lang', 'unknown')}
- Competing PRs: {c.get('competing_prs', 0)}
- Primary label: `{c.get('primary_label', '?')}`
- Other labels: {labels or '(none)'}
- Score: {c.get('scout_score', 0.0)}

## Issue link

{c.get('issue_url', '')}

## Notes

(Add your own notes here — scout preserves this section across refreshes.)
"""


def update_frontmatter_inplace(path: Path, c: dict) -> None:
    """Rewrite the frontmatter while preserving the body (user notes)."""
    text = path.read_text()
    parts = text.split("---\n", 2)
    body = parts[2] if len(parts) >= 3 else ""
    new_text = render(c).split("## Notes")[0] + "## Notes" + body.split("## Notes", 1)[-1]
    path.write_text(new_text)


def append_log(event: str, details: dict) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "event": event,
        "details": details,
    }
    with LOG_PATH.open("a") as f:
        f.write(json.dumps(entry) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-per-tier", type=int, default=20)
    parser.add_argument("--limit-overall", type=int, default=None)
    parser.add_argument("--mode", default="baseline")
    args = parser.parse_args()

    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)

    by_tier: dict[str, list[dict]] = defaultdict(list)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        by_tier[obj.get("star_tier", "unknown")].append(obj)

    written = 0
    skipped = 0
    for tier, items in by_tier.items():
        items.sort(key=lambda c: c.get("scout_score", 0), reverse=True)
        keep = items[: args.limit_per_tier]
        for c in keep:
            path = CANDIDATES_DIR / slug(c["repo"], c["issue_number"])
            if path.exists():
                update_frontmatter_inplace(path, c)
                skipped += 1
            else:
                path.write_text(render(c))
                written += 1

    if args.limit_overall is not None:
        # Trim if we overshot. Sort by score across all tiers.
        all_files = sorted(
            CANDIDATES_DIR.glob("*.md"),
            key=lambda p: extract_score(p),
            reverse=True,
        )
        for p in all_files[args.limit_overall :]:
            p.unlink()

    append_log(
        f"scout_{args.mode}",
        {"written": written, "updated": skipped, "tiers": list(by_tier.keys())},
    )
    print(f"wrote {written}, updated {skipped}")
    return 0


def extract_score(path: Path) -> float:
    text = path.read_text()
    match = re.search(r"^scout_score:\s*([0-9.]+)", text, re.MULTILINE)
    return float(match.group(1)) if match else 0.0


if __name__ == "__main__":
    sys.exit(main())
