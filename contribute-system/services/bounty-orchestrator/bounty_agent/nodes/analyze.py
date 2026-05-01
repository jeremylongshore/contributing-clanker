"""Analyze bounty node - asks Bob to analyze the opportunity."""

import logging

from ..state import BountyState
from ..bobs_brain_client import bob
from ..prompts.analyze import ANALYZE_PROMPT
from ..memory import MemoryManager, get_store
from ..knowledge import sync_repo_knowledge, is_stale

logger = logging.getLogger(__name__)

# Global memory manager - created lazily
_memory_manager = None


def _get_memory():
    """Get or create memory manager."""
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = MemoryManager()
    return _memory_manager


async def analyze_bounty(state: BountyState) -> BountyState:
    """Ask Bob to analyze the bounty opportunity.

    This node:
    1. Loads repo knowledge from long-term memory (syncs if stale)
    2. Searches for relevant past learnings
    3. Generates a context-rich prompt for Bob
    4. Sends to Bob's Brain for execution
    """
    memory = _get_memory()
    store = get_store()

    # Load repo profile from long-term memory
    repo_id = state["repo_id"]
    repo_profile = await memory.get_repo_profile(repo_id)

    # Sync repo knowledge if missing or stale
    if not repo_profile or is_stale(repo_profile.get("last_synced")):
        logger.info(f"Syncing repo knowledge for {state['repo']}")
        try:
            repo_url = f"https://github.com/{state['repo']}"
            await sync_repo_knowledge(repo_url, store)
            repo_profile = await memory.get_repo_profile(repo_id)
        except Exception as e:
            logger.warning(f"Failed to sync repo knowledge: {e}")

    # Search for relevant learnings (semantic search)
    learnings = []
    try:
        learnings = await memory.search_learnings(
            query=f"bounty {state['repo']}",
            limit=3,
        )
    except Exception as e:
        logger.warning(f"Failed to search learnings: {e}")

    # Build enhanced prompt with memory context
    prompt = ANALYZE_PROMPT.format(
        issue_url=state["issue_url"],
        repo=state["repo"],
    )

    # Add repo knowledge to prompt if available
    if repo_profile:
        repo_context = _format_repo_context(repo_profile)
        prompt = f"{prompt}\n\n=== REPO KNOWLEDGE (from memory) ===\n{repo_context}"

    # Add learnings to prompt if available
    if learnings:
        learnings_context = _format_learnings(learnings)
        prompt = f"{prompt}\n\n=== PAST LEARNINGS (similar situations) ===\n{learnings_context}"

    # Build context for Bob
    context = {"bounty_id": state["bounty_id"]}
    if repo_profile:
        context["repo_profile"] = repo_profile

    # Ask Bob to analyze
    result = await bob.ask_bob(
        prompt=prompt,
        context=context,
        session_id=state["session_id"],
    )

    # Update state with analysis results
    return {
        **state,
        "issue_details": result.get("response", {}),
        "repo_profile": repo_profile,  # Store for later nodes
        "phase": "B",  # Move to Issue Analysis phase
    }


def _format_repo_context(profile: dict) -> str:
    """Format repo profile for prompt inclusion."""
    lines = []

    # Quick summary bullets
    if profile.get("quick_summary"):
        for point in profile["quick_summary"]:
            lines.append(f"• {point}")

    # Commands
    if profile.get("commands"):
        lines.append("\nCommands:")
        for name, cmd in profile["commands"].items():
            lines.append(f"  {name}: {cmd}")

    # Style rules
    if profile.get("style_rules"):
        lines.append("\nStyle Rules:")
        for rule, value in profile["style_rules"].items():
            lines.append(f"  {rule}: {value}")

    # Gotchas
    if profile.get("gotchas"):
        lines.append("\nGotchas to avoid:")
        for gotcha in profile["gotchas"]:
            lines.append(f"  ⚠️ {gotcha}")

    return "\n".join(lines)


def _format_learnings(learnings: list) -> str:
    """Format learnings for prompt inclusion."""
    lines = []
    for learning in learnings:
        lesson = learning.get("lesson", "")
        repo = learning.get("repo", "")
        if lesson:
            lines.append(f"• [{repo}] {lesson}")
    return "\n".join(lines) if lines else "No relevant learnings found."
