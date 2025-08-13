#!/bin/bash

# Morph Configuration Verification Script
# This script verifies that all configurations are properly set for Morph deployment

set -e

echo "🔍 Verifying Morph Configuration..."
echo "=================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if foundry is installed
if command -v forge &> /dev/null; then
    echo -e "${GREEN}✅ Foundry is installed${NC}"
else
    echo -e "${RED}❌ Foundry is not installed${NC}"
    exit 1
fi

# Check if .env file exists
if [ -f .env ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
    source .env
else
    echo -e "${YELLOW}⚠️  .env file not found (using .env.example as reference)${NC}"
fi

# Check private key
if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ PRIVATE_KEY not set in .env${NC}"
    echo "Please set PRIVATE_KEY in your .env file"
else
    echo -e "${GREEN}✅ PRIVATE_KEY is set${NC}"
fi

# Check Morph RPC URL
if [ -z "$MORPH_HOLESKY_RPC_URL" ]; then
    echo -e "${YELLOW}⚠️  MORPH_HOLESKY_RPC_URL not set, using default${NC}"
    MORPH_HOLESKY_RPC_URL="https://rpc-holesky.morphl2.io"
else
    echo -e "${GREEN}✅ MORPH_HOLESKY_RPC_URL is set: $MORPH_HOLESKY_RPC_URL${NC}"
fi

# Test connection to Morph RPC
echo -e "${BLUE}🔗 Testing connection to Morph Holesky...${NC}"
if curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$MORPH_HOLESKY_RPC_URL" > /dev/null; then
    
    # Get chain ID
    CHAIN_ID=$(curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
        "$MORPH_HOLESKY_RPC_URL" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    
    # Convert hex to decimal
    CHAIN_ID_DEC=$((16#${CHAIN_ID#0x}))
    
    if [ "$CHAIN_ID_DEC" = "2810" ]; then
        echo -e "${GREEN}✅ Connected to Morph Holesky (Chain ID: $CHAIN_ID_DEC)${NC}"
    else
        echo -e "${RED}❌ Wrong chain ID: $CHAIN_ID_DEC (expected 2810)${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Cannot connect to Morph RPC${NC}"
    exit 1
fi

# Check if contracts can be built
echo -e "${BLUE}🔨 Testing contract build...${NC}"
if forge build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Contracts build successfully${NC}"
else
    echo -e "${RED}❌ Contract build failed${NC}"
    exit 1
fi

# Check if tests pass
echo -e "${BLUE}🧪 Testing contract tests...${NC}"
if forge test > /dev/null 2>&1; then
    echo -e "${GREEN}✅ All tests pass${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed or no tests found${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Morph Configuration Verification Complete!${NC}"
echo "============================================="
echo ""
echo -e "${BLUE}📋 Configuration Summary:${NC}"
echo "  Network: Morph Holesky Testnet"
echo "  Chain ID: 2810"
echo "  RPC URL: $MORPH_HOLESKY_RPC_URL"
echo "  Private Key: ${PRIVATE_KEY:+Set}${PRIVATE_KEY:-Not Set}"
echo ""
echo -e "${BLUE}🚀 Ready to deploy!${NC}"
echo "  Run: ./deploy.sh morph-holesky --verify"
echo "  Or:  make morph-holesky"
echo ""
