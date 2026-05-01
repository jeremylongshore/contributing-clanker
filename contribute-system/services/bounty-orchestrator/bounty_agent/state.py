"""State schema for the bounty workflow."""

from typing import TypedDict, Optional


class BountyState(TypedDict):
    """State for the bounty workflow graph."""

    # Identifiers
    bounty_id: str
    issue_url: str
    repo: str
    repo_id: str

    # Analysis results (from Bob's Brain)
    issue_details: dict
    competition_analysis: dict
    implementation_plan: dict

    # Workflow state
    phase: str  # A, B, C, D, E, F
    human_approved: bool

    # Execution results
    execution_result: dict

    # Session management
    session_id: str

    # Repo knowledge (loaded from store)
    repo_profile: Optional[dict]
