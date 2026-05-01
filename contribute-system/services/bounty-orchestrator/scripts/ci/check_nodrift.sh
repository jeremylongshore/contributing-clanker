#!/bin/bash
# Intentional Bounty - Framework Drift Detection
# Mirrors Bob's Brain R8 enforcement
# MUST RUN FIRST in CI - blocks all other steps on failure
#
# Hard Rules (L1-L6):
# L1: LangGraph-Only (No raw LLM calls)
# L2: Vertex AI LLM (langchain-google-vertexai >= 3.2.1)
# L3: No Direct Provider API Calls
# L4: CI-Only Deployments (No local creds)
# L5: PostgreSQL Checkpointing in Prod
# L6: Additional Framework Checks

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
VIOLATIONS=0

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate to the service root (two levels up from scripts/ci/)
SERVICE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$SERVICE_DIR"

echo "🔍 Scanning for LangChain framework drift..."
echo "Working directory: $SERVICE_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ============================================
# L1: LangGraph-Only (No raw LLM calls)
# ============================================
echo -e "\n[L1] Checking for raw LLM usage outside LangGraph nodes..."

if grep -rE "ChatVertexAI\(\)\.invoke\(|\.generate\(|\.predict\(" \
    --include="*.py" bounty_agent/ 2>/dev/null | \
    grep -v "test_" | grep -v "__pycache__"; then
    echo -e "${RED}❌ VIOLATION L1: Raw LLM calls found. Use LangGraph nodes.${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L1: All LLM calls are in LangGraph nodes${NC}"
fi

# ============================================
# L2: Vertex AI LLM (langchain-google-vertexai >= 3.2.1)
# ============================================
echo -e "\n[L2] Checking langchain-google-vertexai version..."

REQ_VERSION=$(grep "langchain-google-vertexai" requirements.txt 2>/dev/null | grep -oP '>=\K[0-9.]+' | head -1)
if [[ -z "$REQ_VERSION" ]]; then
    echo -e "${RED}❌ VIOLATION L2: langchain-google-vertexai not in requirements.txt${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    # Compare versions (3.2.1 minimum)
    MIN_VERSION="3.2.1"
    if [[ "$(printf '%s\n' "$MIN_VERSION" "$REQ_VERSION" | sort -V | head -n1)" != "$MIN_VERSION" ]]; then
        echo -e "${RED}❌ VIOLATION L2: langchain-google-vertexai version $REQ_VERSION < 3.2.1${NC}"
        VIOLATIONS=$((VIOLATIONS + 1))
    else
        echo -e "${GREEN}✅ L2: langchain-google-vertexai >= 3.2.1${NC}"
    fi
fi

# ============================================
# L3: No Direct Provider API Calls
# ============================================
echo -e "\n[L3] Checking for direct provider API imports..."

# Exclude: tests, __pycache__, .venv, archive
EXCLUDE_PATTERN="\.venv|__pycache__|archive|tests"

if grep -rE "^[^#]*import openai|^[^#]*import anthropic|^[^#]*from google\.generativeai" \
    --include="*.py" bounty_agent/ 2>/dev/null | \
    grep -vE "$EXCLUDE_PATTERN"; then
    echo -e "${RED}❌ VIOLATION L3: Direct provider imports found. Use LangChain abstractions.${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L3: Using LangChain abstractions only${NC}"
fi

# ============================================
# L4: CI-Only Deployments (No local creds)
# ============================================
echo -e "\n[L4] Checking for local credential files..."

CRED_FILES=$(find . -type f \( -name "application_default_credentials.json" -o -name "*-key.json" -o -name "service-account*.json" \) \
    ! -path "./.venv/*" ! -path "./venv/*" 2>/dev/null || true)

if [[ -n "$CRED_FILES" ]]; then
    echo -e "${RED}❌ VIOLATION L4: Service account key files found. Use WIF.${NC}"
    echo "$CRED_FILES"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L4: No credential files in repo${NC}"
fi

# Check for manual deployment scripts
if grep -rE "gcloud run deploy|gcloud functions deploy" scripts/ 2>/dev/null | \
    grep -v "check_nodrift"; then
    echo -e "${RED}❌ VIOLATION L4: Manual deployment commands found in scripts/${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L4: No manual deployment commands${NC}"
fi

# ============================================
# L5: PostgreSQL Checkpointing in Prod
# ============================================
echo -e "\n[L5] Checking for InMemorySaver in production code..."

# Allow InMemorySaver only in agent.py (dev fallback) and tests
if grep -rE "InMemorySaver|MemorySaver\(\)" --include="*.py" bounty_agent/ 2>/dev/null | \
    grep -v "test_" | grep -v "agent.py" | grep -v "__pycache__"; then
    echo -e "${RED}❌ VIOLATION L5: InMemorySaver found outside agent.py fallback${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L5: PostgresSaver for production${NC}"
fi

# ============================================
# L6: Additional Framework Checks
# ============================================
echo -e "\n[L6] Additional framework checks..."

# Check .env not committed
if git ls-files --error-unmatch .env 2>/dev/null; then
    echo -e "${RED}❌ VIOLATION L6: .env file committed to git${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L6: .env not in git (only .env.example)${NC}"
fi

# Check langgraph.json exists and is valid JSON
if [[ ! -f "langgraph.json" ]]; then
    echo -e "${RED}❌ VIOLATION L6: langgraph.json missing${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
elif ! python3 -m json.tool langgraph.json > /dev/null 2>&1; then
    echo -e "${RED}❌ VIOLATION L6: langgraph.json is not valid JSON${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L6: langgraph.json exists and is valid${NC}"
fi

# Check langchain version is 1.0+
LC_VERSION=$(grep "^langchain>=" requirements.txt 2>/dev/null | grep -oP '>=\K[0-9.]+' | head -1)
if [[ -z "$LC_VERSION" ]]; then
    echo -e "${YELLOW}⚠️  L6: langchain version not explicitly pinned${NC}"
else
    MIN_LC="1.0.0"
    if [[ "$(printf '%s\n' "$MIN_LC" "$LC_VERSION" | sort -V | head -n1)" != "$MIN_LC" ]]; then
        echo -e "${RED}❌ VIOLATION L6: langchain version $LC_VERSION < 1.0.0 (unstable API)${NC}"
        VIOLATIONS=$((VIOLATIONS + 1))
    else
        echo -e "${GREEN}✅ L6: langchain >= 1.0.0${NC}"
    fi
fi

# Check critical serialization pins
echo -e "\n[L6] Checking Agent Engine serialization pins..."

# cloudpickle must be pinned exactly
if ! grep -q "cloudpickle==3.0.0" requirements.txt 2>/dev/null; then
    echo -e "${RED}❌ VIOLATION L6: cloudpickle not pinned to ==3.0.0 (Agent Engine requirement)${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L6: cloudpickle==3.0.0 pinned${NC}"
fi

# pydantic must be pinned exactly
if ! grep -q "pydantic==2.7.4" requirements.txt 2>/dev/null; then
    echo -e "${RED}❌ VIOLATION L6: pydantic not pinned to ==2.7.4 (Agent Engine requirement)${NC}"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "${GREEN}✅ L6: pydantic==2.7.4 pinned${NC}"
fi

# Check required dependencies
echo -e "\n[L6] Checking required dependencies..."
REQUIRED_DEPS=("langgraph" "langchain" "langchain-google-vertexai" "langgraph-checkpoint-postgres" "google-cloud-aiplatform")
for dep in "${REQUIRED_DEPS[@]}"; do
    if ! grep -q "^$dep" requirements.txt 2>/dev/null; then
        echo -e "${RED}❌ VIOLATION L6: Missing required dependency: $dep${NC}"
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
done
echo -e "${GREEN}✅ L6: All required dependencies present${NC}"

# ============================================
# SUMMARY
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $VIOLATIONS -gt 0 ]; then
    echo -e "${RED}❌ DRIFT DETECTED: $VIOLATIONS violation(s) found${NC}"
    echo "Fix all violations before deployment can proceed."
    exit 1
else
    echo -e "${GREEN}✅ NO DRIFT DETECTED - Framework compliance verified${NC}"
    exit 0
fi
