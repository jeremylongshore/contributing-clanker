"""Execute node - asks Bob to implement the fix."""

from ..state import BountyState
from ..bobs_brain_client import bob
from ..prompts.implement import IMPLEMENT_PROMPT


async def execute_via_bob(state: BountyState) -> BountyState:
    """Ask Bob to implement the fix and prepare PR.

    This is the main execution node - Bob does the actual work.
    Only called after human approval.
    """
    # Build context with all relevant information
    repo_profile = state.get("repo_profile", {})
    style_rules = repo_profile.get("style_rules", {})
    commands = repo_profile.get("commands", {})
    gotchas = repo_profile.get("gotchas", [])

    # Format the implementation prompt
    prompt = IMPLEMENT_PROMPT.format(
        issue_url=state["issue_url"],
        repo=state["repo"],
        guidelines=state.get("issue_details", {}).get("guidelines", ""),
        plan=state.get("implementation_plan", {}),
        style_rules=style_rules,
        lint_command=commands.get("lint", ""),
        test_command=commands.get("test", ""),
        gotchas="\n".join(f"- {g}" for g in gotchas) if gotchas else "None",
    )

    result = await bob.ask_bob(
        prompt=prompt,
        context={
            "plan": state.get("implementation_plan", {}),
            "human_approved": True,  # Signal that human approved
            "repo_profile": repo_profile,
        },
        session_id=state["session_id"],
    )

    return {
        **state,
        "execution_result": result.get("response", {}),
        "phase": "E",  # Move to PR Submission phase
    }
