#!/usr/bin/env python3
"""Main entry point for the bounty orchestrator API server.

Run with: python main.py
Or with: uvicorn main:app --reload
"""

import uvicorn

from bounty_agent.api import app

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
    )
