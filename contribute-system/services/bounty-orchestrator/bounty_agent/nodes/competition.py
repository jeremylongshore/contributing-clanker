"""Competition check node - asks Bob to check for competing work."""

from typing import Literal

from ..state import BountyState
from ..bobs_brain_client import bob


async def check_competition(state: BountyState) -> BountyState:
    """Ask Bob to check for competing work on this bounty.

    This is a critical gate - if competition exists, we stop.
    """
    prompt = f"""
    Check for competition on this bounty:

    Issue: {state["issue_url"]}
    Repository: {state["repo"]}

    Look for:
    1. Open PRs that reference this issue
    2. Comments from people claiming the bounty
    3. Recent activity suggesting someone is working on it

    Return as JSON:
    {{
        "competing_prs": <number>,
        "claimants": [<list of usernames>],
        "recommendation": "proceed" | "skip",
        "reason": "<explanation>"
    }}
    """

    result = await bob.ask_bob(
        prompt=prompt,
        session_id=state["session_id"],
    )

    return {
        **state,
        "competition_analysis": result.get("response", {}),
    }


def should_proceed(state: BountyState) -> Literal["continue", "skip"]:
    """Routing function - decide if we should proceed based on competition."""
    analysis = state.get("competition_analysis", {})

    if isinstance(analysis, dict):
        competing = analysis.get("competing_prs", 0)
        recommendation = analysis.get("recommendation", "proceed")
    else:
        competing = 0
        recommendation = "proceed"

    if competing == 0 and recommendation != "skip":
        return "continue"
    return "skip"
