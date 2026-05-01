#!/usr/bin/env python3
"""Deploy bounty orchestrator to Vertex AI Agent Engine.

This script deploys the LangGraph bounty workflow to Vertex AI Agent Engine
using the ReasoningEngine.create() API.

CRITICAL: The BountyOrchestrator class follows the serialization protocol:
- __init__: Only stores primitives (runs locally, gets pickled)
- set_up: Initializes clients and graph (runs remotely after unpickle)

Usage:
    python deploy.py [--env prod|staging]

Environment variables:
    GOOGLE_CLOUD_PROJECT: GCP project ID (default: intentional-bounty)
    GOOGLE_CLOUD_REGION: GCP region (default: us-central1)
    BOBS_BRAIN_A2A_URL: A2A endpoint for Bob's Brain
    DATABASE_URL: PostgreSQL connection string for checkpointing
"""

import argparse
import os
import sys


def deploy(env: str = "prod"):
    """Deploy the bounty orchestrator to Agent Engine.

    Args:
        env: Deployment environment ('prod' or 'staging')
    """
    # Lazy imports to avoid issues when just checking help
    import vertexai
    from vertexai.preview import reasoning_engines

    from bounty_agent.agent import BountyOrchestrator

    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "intentional-bounty")
    location = os.environ.get("GOOGLE_CLOUD_REGION", "us-central1")
    staging_bucket = f"gs://{project_id}-staging"

    print(f"Deploying bounty-orchestrator to Agent Engine")
    print(f"  Project: {project_id}")
    print(f"  Location: {location}")
    print(f"  Environment: {env}")
    print(f"  Staging bucket: {staging_bucket}")
    print()

    # Initialize Vertex AI
    vertexai.init(
        project=project_id,
        location=location,
        staging_bucket=staging_bucket,
    )

    # Create agent instance (only primitives in __init__)
    # These values get pickled and sent to Agent Engine
    agent = BountyOrchestrator(
        project_id=project_id,
        location=location,
        model_name="gemini-2.0-flash",
        bobs_brain_url=os.environ.get("BOBS_BRAIN_A2A_URL"),
    )

    print("Creating Agent Engine deployment...")
    print("  (This may take a few minutes)")
    print()

    # Deploy to Agent Engine using ReasoningEngine.create()
    # The agent's set_up() method will be called after unpickling in the cloud
    try:
        remote_agent = reasoning_engines.ReasoningEngine.create(
            reasoning_engine=agent,
            requirements=[
                # Core framework
                "langgraph>=1.0.0,<2.0.0",
                "langchain>=1.0.0,<2.0.0",
                "langchain-core>=0.3.0",
                "langchain-google-vertexai>=3.2.1",

                # CRITICAL: Serialization pins (must match exactly)
                "cloudpickle==3.0.0",
                "pydantic==2.7.4",

                # Vertex AI SDK with Agent Engine support
                "google-cloud-aiplatform[agent_engines,langchain,reasoningengine]>=1.112.0",

                # Checkpointing
                "langgraph-checkpoint-postgres>=2.0.0",
                "psycopg[binary]>=3.1.0",

                # A2A communication
                "httpx>=0.25.0",
            ],
            display_name=f"bounty-orchestrator-{env}",
            description="LangGraph bounty workflow orchestrator - integrates with Bob's Brain via A2A",
            sys_version="3.11",
            extra_packages=["./bounty_agent"],
        )

        print()
        print("=" * 60)
        print("DEPLOYMENT SUCCESSFUL")
        print("=" * 60)
        print(f"  Resource name: {remote_agent.resource_name}")
        print()
        print("To query the deployed agent:")
        print()
        print("  from vertexai.preview import reasoning_engines")
        print(f"  agent = reasoning_engines.ReasoningEngine('{remote_agent.resource_name}')")
        print("  result = agent.query('Analyze issue #123')")
        print()

        return remote_agent

    except Exception as e:
        print()
        print("=" * 60)
        print("DEPLOYMENT FAILED")
        print("=" * 60)
        print(f"  Error: {e}")
        print()
        print("Common issues:")
        print("  - cloudpickle version mismatch: Ensure cloudpickle==3.0.0 exactly")
        print("  - pydantic v1/v2 conflict: Ensure pydantic==2.7.4 exactly")
        print("  - Missing IAM permissions: Grant roles/aiplatform.user to deployer SA")
        print("  - Staging bucket doesn't exist: Create gs://<project>-staging bucket")
        print()
        sys.exit(1)


def main():
    """Parse arguments and run deployment."""
    parser = argparse.ArgumentParser(
        description="Deploy bounty orchestrator to Vertex AI Agent Engine"
    )
    parser.add_argument(
        "--env",
        choices=["prod", "staging"],
        default="prod",
        help="Deployment environment (default: prod)",
    )
    args = parser.parse_args()

    deploy(env=args.env)


if __name__ == "__main__":
    main()
