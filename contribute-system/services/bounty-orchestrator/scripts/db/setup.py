#!/usr/bin/env python3
"""Database setup script for Intentional Bounty.

Verifies PostgreSQL connection and initializes pgvector extension.
Run this once before deploying the bounty-orchestrator.

Usage:
    python scripts/db/setup.py

Requires DATABASE_URL environment variable:
    export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
"""

import os
import sys

try:
    import psycopg
except ImportError:
    print("Error: psycopg not installed. Run: pip install 'psycopg[binary]>=3.1.0'")
    sys.exit(1)


def main():
    database_url = os.environ.get("DATABASE_URL")

    if not database_url:
        print("Error: DATABASE_URL environment variable not set")
        print("")
        print("Set it with:")
        print("  export DATABASE_URL='postgresql://user:pass@host:5432/dbname'")
        print("")
        print("Or create a .env file with:")
        print("  DATABASE_URL=postgresql://user:pass@host:5432/dbname")
        sys.exit(1)

    # Mask password in output
    display_url = database_url
    if "@" in database_url and ":" in database_url.split("@")[0]:
        parts = database_url.split("@")
        creds = parts[0].split(":")
        if len(creds) >= 3:
            display_url = f"{creds[0]}:{creds[1]}:****@{parts[1]}"

    print(f"Connecting to: {display_url}")
    print("")

    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                # Check PostgreSQL version
                cur.execute("SELECT version()")
                version = cur.fetchone()[0]
                print(f"PostgreSQL: {version.split(',')[0]}")

                # Check if pgvector is available
                cur.execute("""
                    SELECT EXISTS(
                        SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
                    )
                """)
                pgvector_available = cur.fetchone()[0]

                if not pgvector_available:
                    print("")
                    print("ERROR: pgvector extension not available!")
                    print("")
                    print("Install pgvector on your PostgreSQL server:")
                    print("  # Ubuntu/Debian:")
                    print("  sudo apt install postgresql-15-pgvector")
                    print("")
                    print("  # Or from source:")
                    print("  git clone https://github.com/pgvector/pgvector.git")
                    print("  cd pgvector && make && sudo make install")
                    sys.exit(1)

                # Enable pgvector extension
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
                conn.commit()
                print("pgvector: Enabled")

                # Verify vector type works
                cur.execute("SELECT '[1,2,3]'::vector")
                result = cur.fetchone()[0]
                print(f"Vector test: {result}")

                # Create langgraph schema
                cur.execute("CREATE SCHEMA IF NOT EXISTS langgraph")
                conn.commit()
                print("Schema: langgraph created")

                # Check for existing LangGraph tables
                cur.execute("""
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema = 'langgraph'
                """)
                tables = [row[0] for row in cur.fetchall()]

                if tables:
                    print(f"Existing tables: {', '.join(tables)}")
                else:
                    print("Tables: None yet (LangGraph will create on first use)")

                print("")
                print("Database setup complete!")
                print("")
                print("Next steps:")
                print("1. Update .env with your DATABASE_URL")
                print("2. Run: python main.py")
                print("3. Or deploy to Agent Engine: python deploy.py")

    except psycopg.OperationalError as e:
        print(f"Connection failed: {e}")
        print("")
        print("Check that:")
        print("  1. PostgreSQL server is running")
        print("  2. DATABASE_URL is correct")
        print("  3. User has permission to connect")
        print("  4. Network allows connection (firewall/pg_hba.conf)")
        sys.exit(1)


if __name__ == "__main__":
    main()
