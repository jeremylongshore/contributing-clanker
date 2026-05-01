"""Learning from submission outcomes.

This module records what happened with each bounty submission so the system
can learn from successes and failures. Uses semantic search to find similar
situations in the future.
"""

import uuid
from typing import Optional

from ..bobs_brain_client import bob


async def record_submission_outcome(
    bounty_id: str,
    outcome: str,  # merged | rejected | stale | abandoned
    reviewer_feedback: Optional[str],
    store,
) -> None:
    """Record what happened so we learn from it.

    Stored in semantic-searchable memory for future reference.

    Args:
        bounty_id: The bounty identifier
        outcome: What happened (merged, rejected, stale, abandoned)
        reviewer_feedback: Feedback from maintainers if any
        store: LangGraph Store instance
    """
    # Get bounty state
    try:
        bounty = await store.aget(("bounties", bounty_id), "state")
    except Exception:
        bounty = None

    if not bounty:
        return

    repo = bounty.get("repo", "unknown")
    repo_id = bounty.get("repo_id", "")

    if outcome == "rejected" and reviewer_feedback:
        # Ask Bob to extract the lesson
        result = await bob.ask_bob(f"""
        Our PR was rejected. Extract the key lesson:

        Repo: {repo}
        Feedback: {reviewer_feedback}

        Return a single clear lesson we should remember for future PRs to this repo.
        Keep it concise (1-2 sentences).
        """)

        learning = result.get("response", reviewer_feedback)

        # Store as semantic-searchable learning
        learning_id = f"learn_{uuid.uuid4().hex[:8]}"
        await store.aput(
            namespace=("learnings", "rejections"),
            key=learning_id,
            value={
                "bounty_id": bounty_id,
                "repo": repo,
                "what_happened": reviewer_feedback,
                "lesson": learning,
                "embedding_text": f"{repo} rejection {learning}",  # For semantic search
                "created_at": __import__("datetime").datetime.now().isoformat(),
            },
        )

        # Also add to repo's gotchas
        if repo_id:
            try:
                repo_profile = await store.aget(("repos", repo_id), "profile")
                if repo_profile:
                    gotchas = repo_profile.get("gotchas", [])
                    if learning not in gotchas:
                        gotchas.append(learning)
                        repo_profile["gotchas"] = gotchas
                        await store.aput(("repos", repo_id), "profile", repo_profile)
            except Exception:
                pass  # Don't fail if repo profile update fails

    elif outcome == "merged":
        # Record success for future reference
        success_id = f"success_{uuid.uuid4().hex[:8]}"
        await store.aput(
            namespace=("learnings", "successes"),
            key=success_id,
            value={
                "bounty_id": bounty_id,
                "repo": repo,
                "what_worked": bounty.get("approach_summary", ""),
                "embedding_text": f"{repo} success merged",
                "created_at": __import__("datetime").datetime.now().isoformat(),
            },
        )

    # Update bounty state with outcome
    bounty["outcome"] = outcome
    bounty["phase"] = "F"  # Post-submission phase
    await store.aput(("bounties", bounty_id), "state", bounty)


async def search_similar_learnings(
    query: str,
    store,
    limit: int = 3,
) -> list:
    """Search for similar learnings from past bounties.

    Args:
        query: Search query (e.g., repo name, issue type)
        store: LangGraph Store instance
        limit: Max number of results

    Returns:
        List of relevant learnings
    """
    try:
        results = await store.asearch(
            namespace=("learnings",),
            query=query,
            limit=limit,
        )
        return results
    except Exception:
        return []
