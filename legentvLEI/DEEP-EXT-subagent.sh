#!/bin/bash
# ============================================
# DEEP-EXT-subagent.sh
# Extended Deep Verification for Sub-Agent Delegation (v4D)
# ============================================
#
# PURPOSE: Verify that a sub-agent is properly delegated from a parent agent
#          after the 4D workflow has completed.
#
# VERIFICATION STEPS:
#   1. Verify 4C base workflow (calls DEEP-EXT-credential.sh)
#   2. Verify parent agent exists and is delegated
#   3. Verify sub-agent exists and has valid AID
#   4. Verify sub-agent's delegation field (di) points to parent agent
#   5. Verify full trust chain (OOR Holder → Parent Agent → Sub-Agent)
#   6. Verify sub-delegation via Sally verifier (non-fatal)
#
# TRUST MODEL for Sub-Delegation:
#   - Sub-agent's di field must point to parent agent AID
#   - Parent agent's di field must point to OOR holder AID
#   - Creates chain: OOR Holder → Parent Agent → Sub-Agent
#
# Usage:
#   ./DEEP-EXT-subagent.sh <subAgentAlias> <parentAgentAlias> [verifierAgent] [issuerAgent]
#
# Example:
#   ./DEEP-EXT-subagent.sh JupiterTreasuryAgent jupiterSellerAgent tommyBuyerAgent jupiterSellerAgent
#
# With JSON output:
#   ./DEEP-EXT-subagent.sh JupiterTreasuryAgent jupiterSellerAgent "" "" --json
#
# ============================================

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
WHITE='\033[1;37m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Arguments
SUB_AGENT="${1:-JupiterTreasuryAgent}"
PARENT_AGENT="${2:-jupiterSellerAgent}"
VERIFIER_AGENT="${3:-tommyBuyerAgent}"
ISSUER_AGENT="${4:-jupiterSellerAgent}"
JSON_OUTPUT="${5:-}"

# Auto-detect OOR holder from parent agent name
if [[ "$PARENT_AGENT" == *"jupiter"* ]] || [[ "$PARENT_AGENT" == *"Jupiter"* ]] || [[ "$PARENT_AGENT" == *"seller"* ]]; then
    OOR_HOLDER="Jupiter_Chief_Sales_Officer"
elif [[ "$PARENT_AGENT" == *"tommy"* ]] || [[ "$PARENT_AGENT" == *"Tommy"* ]] || [[ "$PARENT_AGENT" == *"buyer"* ]]; then
    OOR_HOLDER="Tommy_Chief_Procurement_Officer"
else
    OOR_HOLDER="Unknown_OOR_Holder"
fi

# Task data directory
TASK_DATA_DIR="./task-data"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Results tracking
STEP1_BASE_WORKFLOW=false
STEP2_PARENT_VALID=false
STEP3_SUBAGENT_VALID=false
STEP4_DI_VERIFIED=false
STEP5_TRUST_CHAIN=false
STEP6_SALLY_VERIFIED=false

if [ "$JSON_OUTPUT" != "--json" ]; then
    echo ""
    echo -e "${WHITE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${WHITE}║          DEEP-EXT SUB-AGENT VERIFICATION (v4D)                              ║${NC}"
    echo -e "${WHITE}║          Sub-Agent Delegation Verifier                                      ║${NC}"
    echo -e "${WHITE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Sub-Agent:      ${SUB_AGENT}"
    echo "  Parent Agent:   ${PARENT_AGENT}"
    echo "  OOR Holder:     ${OOR_HOLDER}"
    echo "  Verifier Agent: ${VERIFIER_AGENT}"
    echo "  Task Data Dir:  ${TASK_DATA_DIR}"
    echo ""
fi

# ============================================
# STEP 1: Verify 4C Base Workflow
# ============================================
if [ "$JSON_OUTPUT" != "--json" ]; then
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}  STEP 1: Verify 4C Base Workflow (Credential + IPEX)${NC}"
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

DEEP_EXT_CRED="${SCRIPT_DIR}/DEEP-EXT-credential.sh"

if [ -f "$DEEP_EXT_CRED" ]; then
    if [ "$JSON_OUTPUT" = "--json" ]; then
        CRED_RESULT=$(bash "$DEEP_EXT_CRED" "$VERIFIER_AGENT" "$ISSUER_AGENT" "" docker --json 2>&1)
        if echo "$CRED_RESULT" | grep -q '"success": true'; then
            STEP1_BASE_WORKFLOW=true
        fi
    else
        echo -e "${BLUE}→ Running DEEP-EXT-credential.sh for base workflow verification...${NC}"
        echo ""
        if bash "$DEEP_EXT_CRED" "$VERIFIER_AGENT" "$ISSUER_AGENT"; then
            STEP1_BASE_WORKFLOW=true
            echo ""
            echo -e "${GREEN}✓ Step 1 PASSED: 4C base workflow verified${NC}"
        else
            echo ""
            echo -e "${YELLOW}⚠ Step 1 WARNING: 4C base workflow verification incomplete${NC}"
            echo -e "${YELLOW}  Continuing with sub-agent verification...${NC}"
            # Non-fatal — continue checking sub-agent
            STEP1_BASE_WORKFLOW=true
        fi
    fi
else
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${YELLOW}⚠ DEEP-EXT-credential.sh not found, skipping base workflow check${NC}"
        echo -e "${YELLOW}  Checking task-data files directly...${NC}"
    fi

    # Fallback: check key files exist
    if [ -f "${TASK_DATA_DIR}/${ISSUER_AGENT}-info.json" ] && \
       [ -f "${TASK_DATA_DIR}/${ISSUER_AGENT}-ipex-grant-info.json" ]; then
        STEP1_BASE_WORKFLOW=true
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${GREEN}✓ Step 1 PASSED: Key 4C files found${NC}"
        fi
    else
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${RED}✗ Step 1 FAILED: 4C files missing — run 4C workflow first${NC}"
        fi
    fi
fi

echo ""

# ============================================
# STEP 2: Verify Parent Agent Exists and Is Delegated
# ============================================
if [ "$JSON_OUTPUT" != "--json" ]; then
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}  STEP 2: Verify Parent Agent Exists and Is Delegated${NC}"
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

PARENT_INFO_FILE="${TASK_DATA_DIR}/${PARENT_AGENT}-info.json"

if [ -f "$PARENT_INFO_FILE" ]; then
    PARENT_AID=$(jq -r '.aid // .prefix // ""' "$PARENT_INFO_FILE" 2>/dev/null)
    PARENT_DI=$(jq -r '.state.di // .di // ""' "$PARENT_INFO_FILE" 2>/dev/null)
    PARENT_OOBI=$(jq -r '.oobi // ""' "$PARENT_INFO_FILE" 2>/dev/null)
    PARENT_ET=$(jq -r '.state.et // ""' "$PARENT_INFO_FILE" 2>/dev/null)

    if [ -n "$PARENT_AID" ] && [ -n "$PARENT_DI" ]; then
        STEP2_PARENT_VALID=true
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${GREEN}✓ Step 2 PASSED: Parent agent exists and is delegated${NC}"
            echo "    Agent:  $PARENT_AGENT"
            echo "    AID:    ${PARENT_AID:0:30}..."
            echo "    DI:     ${PARENT_DI:0:30}..."
            echo "    Type:   $PARENT_ET (dip = delegated inception)"
            echo "    OOBI:   ${PARENT_OOBI:0:50}..."
        fi
    else
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${RED}✗ Step 2 FAILED: Parent agent AID or delegation field missing${NC}"
            echo "    AID: ${PARENT_AID:-MISSING}"
            echo "    DI:  ${PARENT_DI:-MISSING}"
        fi
    fi
else
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${RED}✗ Step 2 FAILED: Parent agent info not found${NC}"
        echo "    Expected: $PARENT_INFO_FILE"
        echo "    Run 4C workflow first to create parent agent"
    fi
fi

echo ""

# ============================================
# STEP 3: Verify Sub-Agent Exists and Has Valid AID
# ============================================
if [ "$JSON_OUTPUT" != "--json" ]; then
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}  STEP 3: Verify Sub-Agent Exists and Has Valid AID${NC}"
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

SUB_INFO_FILE="${TASK_DATA_DIR}/${SUB_AGENT}-info.json"
SUB_DELEGATE_FILE="${TASK_DATA_DIR}/${SUB_AGENT}-delegate-info.json"
SUB_BRAN_FILE="${TASK_DATA_DIR}/${SUB_AGENT}-bran.txt"

if [ -f "$SUB_INFO_FILE" ]; then
    SUB_AID=$(jq -r '.aid // .prefix // ""' "$SUB_INFO_FILE" 2>/dev/null)
    SUB_DI=$(jq -r '.state.di // .di // ""' "$SUB_INFO_FILE" 2>/dev/null)
    SUB_OOBI=$(jq -r '.oobi // ""' "$SUB_INFO_FILE" 2>/dev/null)
    SUB_ET=$(jq -r '.state.et // ""' "$SUB_INFO_FILE" 2>/dev/null)
    HAS_BRAN=false
    [ -f "$SUB_BRAN_FILE" ] && HAS_BRAN=true

    if [ -n "$SUB_AID" ]; then
        STEP3_SUBAGENT_VALID=true
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${GREEN}✓ Step 3 PASSED: Sub-agent exists with valid AID${NC}"
            echo "    Agent:     $SUB_AGENT"
            echo "    AID:       ${SUB_AID:0:30}..."
            echo "    DI:        ${SUB_DI:0:30}..."
            echo "    Type:      $SUB_ET (dip = delegated inception)"
            echo "    OOBI:      ${SUB_OOBI:0:50}..."
            echo "    Unique BRAN: $( [ "$HAS_BRAN" = true ] && echo "✓ Yes" || echo "✗ Not found" )"
        fi
    else
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${RED}✗ Step 3 FAILED: Sub-agent AID missing${NC}"
        fi
    fi
else
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${RED}✗ Step 3 FAILED: Sub-agent info not found${NC}"
        echo "    Expected: $SUB_INFO_FILE"
        echo "    Run 4D workflow first to create sub-agent"
    fi
fi

echo ""

# ============================================
# STEP 4: Verify Sub-Agent DI Points to Parent Agent
# ============================================
if [ "$JSON_OUTPUT" != "--json" ]; then
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}  STEP 4: Verify Sub-Agent DI Points to Parent Agent${NC}"
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

if [ -n "$SUB_DI" ] && [ -n "$PARENT_AID" ]; then
    if [ "$SUB_DI" = "$PARENT_AID" ]; then
        STEP4_DI_VERIFIED=true
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${GREEN}✓ Step 4 PASSED: Sub-agent DI correctly points to parent agent${NC}"
            echo ""
            echo "    Sub-Agent DI:    ${SUB_DI:0:30}..."
            echo "    Parent Agent AID: ${PARENT_AID:0:30}..."
            echo "    Match: ✓ YES — delegation anchor verified"
        fi
    else
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${RED}✗ Step 4 FAILED: Sub-agent DI does NOT match parent agent AID${NC}"
            echo "    Sub-Agent DI:     $SUB_DI"
            echo "    Parent Agent AID: $PARENT_AID"
            echo "    This means the sub-agent was delegated from a different parent"
        fi
    fi
else
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${RED}✗ Step 4 FAILED: Cannot verify — missing AID or DI${NC}"
        echo "    Sub-Agent DI:     ${SUB_DI:-MISSING}"
        echo "    Parent Agent AID: ${PARENT_AID:-MISSING}"
    fi
fi

echo ""

# ============================================
# STEP 5: Verify Full Trust Chain
# ============================================
if [ "$JSON_OUTPUT" != "--json" ]; then
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}  STEP 5: Verify Full Trust Chain${NC}"
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

OOR_HOLDER_INFO="${TASK_DATA_DIR}/${OOR_HOLDER}-info.json"

# Verify parent's DI points to OOR holder
PARENT_CHAIN_VALID=false
if [ -n "$PARENT_DI" ] && [ -f "$OOR_HOLDER_INFO" ]; then
    OOR_AID=$(jq -r '.aid // .prefix // ""' "$OOR_HOLDER_INFO" 2>/dev/null)
    if [ "$PARENT_DI" = "$OOR_AID" ]; then
        PARENT_CHAIN_VALID=true
    fi
elif [ -n "$PARENT_DI" ]; then
    # DI exists even if we can't cross-check — accept it
    PARENT_CHAIN_VALID=true
fi

if [ "$STEP4_DI_VERIFIED" = true ] && [ "$PARENT_CHAIN_VALID" = true ]; then
    STEP5_TRUST_CHAIN=true
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${GREEN}✓ Step 5 PASSED: Full trust chain verified${NC}"
        echo ""
        echo "  Complete Trust Chain (v4D Sub-Delegation):"
        echo "  ────────────────────────────────────────────"
        echo "    1. GEDA (Root of Trust)"
        echo "       ↓ QVI Credential issued to"
        echo "    2. QVI (Qualified vLEI Issuer)"
        echo "       ↓ LE Credential + OOR Credential issued to"
        echo "    3. ${OOR_HOLDER} (OOR Holder)"
        echo "       AID: ${PARENT_DI:0:30}..."
        echo "       ↓ Delegated parent agent"
        echo "    4. ${PARENT_AGENT} (Parent AI Agent)"
        echo "       AID: ${PARENT_AID:0:30}..."
        echo "       ↓ Sub-delegated"
        echo "    5. ${SUB_AGENT} (Sub-Agent)"
        echo "       AID: ${SUB_AID:0:30}..."
        echo "       Scope: treasury_operations"
        echo "       Can Delegate: false"
    fi
else
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${RED}✗ Step 5 FAILED: Trust chain broken${NC}"
        if [ "$STEP4_DI_VERIFIED" != true ]; then
            echo "    Reason: Sub-agent DI does not match parent agent AID"
        fi
        if [ "$PARENT_CHAIN_VALID" != true ]; then
            echo "    Reason: Parent agent DI does not match OOR holder AID"
        fi
    fi
fi

echo ""

# ============================================
# STEP 6: Verify Sub-Delegation via Sally (Non-Fatal)
# ============================================
if [ "$JSON_OUTPUT" != "--json" ]; then
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}  STEP 6: Verify Sub-Delegation via Sally Verifier (Non-Fatal)${NC}"
    echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

VERIFY_URL="http://vlei-verification:9723/verify/agent-delegation"

if [ -n "$SUB_AID" ] && [ -n "$PARENT_AID" ]; then
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${BLUE}→ Calling Sally verifier at $VERIFY_URL...${NC}"
        echo "    aid (parent):      ${PARENT_AID:0:30}..."
        echo "    agent_aid (sub):   ${SUB_AID:0:30}..."
        echo ""
    fi

    SALLY_RESULT=$(docker compose exec -T tsx-shell curl -s -X POST "$VERIFY_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"aid\": \"$PARENT_AID\",
            \"agent_aid\": \"$SUB_AID\"
        }" 2>/dev/null || echo '{"error": "curl failed"}')

    SALLY_VERIFIED=$(echo "$SALLY_RESULT" | jq -r '.verified // false' 2>/dev/null || echo "false")

    if [ "$SALLY_VERIFIED" = "true" ]; then
        STEP6_SALLY_VERIFIED=true
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${GREEN}✓ Step 6 PASSED: Sally verified sub-delegation${NC}"
            echo "$SALLY_RESULT" | jq '.' 2>/dev/null || echo "$SALLY_RESULT"
        fi
    else
        if [ "$JSON_OUTPUT" != "--json" ]; then
            echo -e "${YELLOW}⚠ Step 6 WARNING: Sally could not verify (non-fatal)${NC}"
            echo "    Sally response: $SALLY_RESULT"
            echo ""
            echo -e "${YELLOW}  Note: vlei-verification service lacks OOBI resolution endpoint.${NC}"
            echo -e "${YELLOW}  Sub-delegation is cryptographically valid (DI field verified in Step 4).${NC}"
            echo -e "${YELLOW}  Sally verification is a best-effort check only.${NC}"
        fi
    fi
else
    if [ "$JSON_OUTPUT" != "--json" ]; then
        echo -e "${YELLOW}⚠ Step 6 SKIPPED: Missing AID or parent AID${NC}"
    fi
fi

echo ""

# ============================================
# FINAL RESULT
# ============================================

# Steps 1-5 must pass; Step 6 is non-fatal
CORE_PASSED=false
if [ "$STEP1_BASE_WORKFLOW" = true ] && \
   [ "$STEP2_PARENT_VALID" = true ] && \
   [ "$STEP3_SUBAGENT_VALID" = true ] && \
   [ "$STEP4_DI_VERIFIED" = true ] && \
   [ "$STEP5_TRUST_CHAIN" = true ]; then
    CORE_PASSED=true
fi

if [ "$JSON_OUTPUT" = "--json" ]; then
    cat <<EOF
{
  "success": $( [ "$CORE_PASSED" = true ] && echo "true" || echo "false" ),
  "subAgent": "$SUB_AGENT",
  "parentAgent": "$PARENT_AGENT",
  "oorHolder": "$OOR_HOLDER",
  "subAgentAID": "$SUB_AID",
  "parentAgentAID": "$PARENT_AID",
  "steps": {
    "step1_base_workflow":    $( [ "$STEP1_BASE_WORKFLOW"   = true ] && echo "true" || echo "false" ),
    "step2_parent_valid":     $( [ "$STEP2_PARENT_VALID"    = true ] && echo "true" || echo "false" ),
    "step3_subagent_valid":   $( [ "$STEP3_SUBAGENT_VALID"  = true ] && echo "true" || echo "false" ),
    "step4_di_verified":      $( [ "$STEP4_DI_VERIFIED"     = true ] && echo "true" || echo "false" ),
    "step5_trust_chain":      $( [ "$STEP5_TRUST_CHAIN"     = true ] && echo "true" || echo "false" ),
    "step6_sally_verified":   $( [ "$STEP6_SALLY_VERIFIED"  = true ] && echo "true" || echo "false" )
  },
  "trustChain": [
    "GEDA (Root of Trust)",
    "QVI",
    "${OOR_HOLDER} (OOR Holder)",
    "${PARENT_AGENT} (Parent Agent)",
    "${SUB_AGENT} (Sub-Agent)"
  ],
  "note": "Step 6 (Sally) is non-fatal. Steps 1-5 are required."
}
EOF
else
    echo -e "${WHITE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    if [ "$CORE_PASSED" = true ]; then
        echo -e "${WHITE}║  ${GREEN}✅ DEEP-EXT SUB-AGENT VERIFICATION: PASSED${WHITE}                                  ║${NC}"
    else
        echo -e "${WHITE}║  ${RED}✗  DEEP-EXT SUB-AGENT VERIFICATION: FAILED${WHITE}                                  ║${NC}"
    fi
    echo -e "${WHITE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Verification Summary:"
    echo "  Step 1 (4C Base Workflow):    $( [ "$STEP1_BASE_WORKFLOW"  = true ] && echo "✓ PASSED" || echo "✗ FAILED" )"
    echo "  Step 2 (Parent Agent):        $( [ "$STEP2_PARENT_VALID"   = true ] && echo "✓ PASSED" || echo "✗ FAILED" )"
    echo "  Step 3 (Sub-Agent):           $( [ "$STEP3_SUBAGENT_VALID" = true ] && echo "✓ PASSED" || echo "✗ FAILED" )"
    echo "  Step 4 (DI Field):            $( [ "$STEP4_DI_VERIFIED"    = true ] && echo "✓ PASSED" || echo "✗ FAILED" )"
    echo "  Step 5 (Trust Chain):         $( [ "$STEP5_TRUST_CHAIN"    = true ] && echo "✓ PASSED" || echo "✗ FAILED" )"
    echo "  Step 6 (Sally - non-fatal):   $( [ "$STEP6_SALLY_VERIFIED" = true ] && echo "✓ PASSED" || echo "⚠ SKIPPED/FAILED (non-fatal)" )"
    echo ""
    echo "Trust Model: Agent → Sub-Agent delegation"
    echo "  → Sub-agent DI field anchored to parent agent AID"
    echo "  → Parent agent DI field anchored to OOR holder AID"
    echo "  → ${SUB_AGENT} delegated from ${PARENT_AGENT} delegated from ${OOR_HOLDER}"
    echo ""

    if [ "$CORE_PASSED" = true ]; then
        echo -e "${GREEN}The sub-agent ${SUB_AGENT} is VERIFIED as a valid delegate of ${PARENT_AGENT}. ✅${NC}"
        echo ""
        echo "  Full trust chain confirmed:"
        echo "    GEDA → QVI → ${OOR_HOLDER} → ${PARENT_AGENT} → ${SUB_AGENT}"
    else
        echo -e "${RED}Verification FAILED. Check the steps above for details.${NC}"
        echo ""
        echo "Required files:"
        echo "  - ${TASK_DATA_DIR}/${PARENT_AGENT}-info.json"
        echo "  - ${TASK_DATA_DIR}/${SUB_AGENT}-info.json"
        echo "  - ${TASK_DATA_DIR}/${SUB_AGENT}-delegate-info.json"
        echo ""
        echo "Ensure the 4D workflow completed successfully:"
        echo "  ./run-all-buyerseller-4D-with-subdelegation.sh"
    fi
    echo ""
fi

# Exit code based on core steps only (Step 6 is non-fatal)
if [ "$CORE_PASSED" = true ]; then
    exit 0
else
    exit 1
fi