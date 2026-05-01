#!/bin/bash

# Multi-Site Deployment Script
# Deploys the contributions dashboard to all configured Firebase hosting targets

set -e

echo "========================================"
echo "  Contribute System Multi-Site Deployment"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
command -v firebase >/dev/null 2>&1 || { echo "firebase CLI required. Install with: npm install -g firebase-tools"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm required. Install with: npm install -g pnpm"; exit 1; }

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Build the dashboard
echo -e "${YELLOW}Building dashboard...${NC}"
pnpm build --filter=@contribute/dashboard

# Deploy to all targets
echo ""
echo -e "${YELLOW}Deploying to Firebase Hosting targets...${NC}"
echo ""

# Deploy Intent Solutions
echo -e "${GREEN}Deploying to intentsolutions.io (target: intent)${NC}"
firebase deploy --only hosting:intent

# Deploy Start AI Tools
echo -e "${GREEN}Deploying to startaitools.io (target: startai)${NC}"
firebase deploy --only hosting:startai

# Deploy Jeremy Longshore
echo -e "${GREEN}Deploying to jeremylongshore.com (target: jeremy)${NC}"
firebase deploy --only hosting:jeremy

echo ""
echo -e "${GREEN}========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "Sites deployed:"
echo "  - https://intentsolutions.io/portal"
echo "  - https://startaitools.io/portal"
echo "  - https://jeremylongshore.com/portal"
echo ""
