"""Repository knowledge synchronization.

This module handles syncing repository knowledge (CONTRIBUTING.md, style rules,
maintainer preferences) to the LangGraph Store for persistent access.
"""

from datetime import datetime, timedelta
from typing import Optional

from ..bobs_brain_client import bob


def is_stale(last_synced: Optional[str], days: int = 7) -> bool:
    """Check if repo knowledge is stale and needs refresh.

    Args:
        last_synced: ISO format timestamp of last sync
        days: Number of days before considering stale

    Returns:
        True if stale (or never synced), False otherwise
    """
    if not last_synced:
        return True

    try:
        synced_at = datetime.fromisoformat(last_synced.replace("Z", "+00:00"))
        return datetime.now(synced_at.tzinfo) - synced_at > timedelta(days=days)
    except (ValueError, TypeError):
        return True


async def sync_repo_knowledge(repo_url: str, store) -> str:
    """Fetch and store repo knowledge.

    Called when:
    1. First time seeing a repo
    2. Before executing a bounty (if stale > 7 days)

    Args:
        repo_url: GitHub repository URL
        store: LangGraph Store instance

    Returns:
        repo_id: The generated repo identifier
    """
    # Generate repo ID from URL
    repo_id = repo_url.replace("/", "_").replace(":", "_").replace("https___", "")

    # Ask Bob's Brain to analyze the repo
    result = await bob.ask_bob(
        prompt=f"""
        Analyze this repository for bounty work preparation:
        Repo: {repo_url}

        Examine:
        1. CONTRIBUTING.md - guidelines, CLA requirements
        2. Recent merged PRs (last 10) - style patterns, commit format
        3. Code style configs (.eslintrc, pyproject.toml, etc.)
        4. Test structure and requirements
        5. Any AGENTS.md or special instructions

        Return as JSON:
        {{
            "quick_summary": ["bullet point 1", "bullet point 2", ...],
            "commands": {{
                "lint": "<lint command>",
                "test": "<test command>",
                "typecheck": "<typecheck command if any>"
            }},
            "style_rules": {{
                "commit_format": "<commit message format>",
                "casing": "<naming conventions>",
                "pr_title_format": "<PR title format>"
            }},
            "maintainer_preferences": ["preference 1", ...],
            "gotchas": ["gotcha 1", ...],
            "cla_required": <boolean>,
            "links": {{
                "contributing": "<URL to CONTRIBUTING.md>",
                "style_guide": "<URL if separate style guide>"
            }}
        }}
        """,
        context={"purpose": "repo_knowledge_sync"},
    )

    response = result.get("response", {})

    # Ensure response is a dict
    if not isinstance(response, dict):
        response = {}

    # Store in LangGraph Store (persists forever)
    await store.aput(
        namespace=("repos", repo_id),
        key="profile",
        value={
            **response,
            "url": repo_url,
            "last_synced": datetime.now().isoformat(),
        },
    )

    return repo_id


async def get_repo_profile(repo_id: str, store) -> Optional[dict]:
    """Get repo profile from store.

    Args:
        repo_id: Repository identifier
        store: LangGraph Store instance

    Returns:
        Repo profile dict or None if not found
    """
    try:
        return await store.aget(("repos", repo_id), "profile")
    except Exception:
        return None
