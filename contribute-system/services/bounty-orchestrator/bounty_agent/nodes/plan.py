"""Plan creation node - asks Bob to create implementation plan."""

from typing import Literal

from ..state import BountyState
from ..bobs_brain_client import bob


async def create_plan(state: BountyState) -> BountyState:
    """Ask Bob to create an implementation plan for this bounty.

    Uses the analysis results and repo knowledge to create a detailed plan.
    """
    prompt = f"""
    Create an implementation plan for this bounty:

    Issue: {state["issue_url"]}
    Repository: {state["repo"]}

    Analysis from previous step:
    {state.get("issue_details", {})}

    Create a step-by-step plan including:
    1. Files to modify (specific paths)
    2. Changes needed (detailed description)
    3. Tests to add/modify
    4. Estimated lines of code
    5. Potential risks or blockers

    Return as JSON:
    {{
        "files_to_modify": [<list of file paths>],
        "changes": [<list of change descriptions>],
        "tests": [<list of test changes>],
        "estimated_lines": <number>,
        "risks": [<list of potential issues>],
        "approach_summary": "<2-3 sentence summary>"
    }}
    """

    result = await bob.ask_bob(
        prompt=prompt,
        context={
            "issue_details": state.get("issue_details", {}),
            "repo_profile": state.get("repo_profile", {}),
        },
        session_id=state["session_id"],
    )

    return {
        **state,
        "implementation_plan": result.get("response", {}),
        "phase": "C",  # Move to Claim phase (awaiting approval)
    }


def is_approved(state: BountyState) -> Literal["execute", "rejected"]:
    """Routing function - check if human approved execution."""
    return "execute" if state.get("human_approved") else "rejected"
