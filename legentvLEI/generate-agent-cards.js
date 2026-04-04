#!/usr/bin/env node

/**
 * Agent Card Generator
 * 
 * Generates complete agent cards from vLEI workflow output data.
 * This script reads the generated JSON files from task-data/
 * to produce agent cards with real AIDs from the 4D workflow.
 * 
 * Key fields for DEEP-EXT verification:
 *   - vLEImetadata.agentName: Used as parameter for DEEP-EXT.sh
 *   - vLEImetadata.oorHolderName: Used as parameter for DEEP-EXT.sh
 * 
 * Outputs to TWO directories:
 *   1. ../Legent/A2A/agent-cards/   — generated from scratch
 *   2. ../A2A/js/agent-cards/       — updates existing cards in-place (preserves format)
 * 
 * Handles sub-agents (e.g., JupiterTreasuryAgent) from the subdelegation config.
 * 
 * Usage: node generate-agent-cards.js
 * Called automatically at the end of run-all-buyerseller-4D-with-subdelegation.sh
 */

const fs = require('fs');
const path = require('path');

// File paths
const SCRIPT_DIR = __dirname;
const CONFIG_FILE = path.join(SCRIPT_DIR, 'appconfig', 'configBuyerSellerAIAgent1-with-subdelegation.json');
const TASK_DATA_DIR = path.join(SCRIPT_DIR, 'task-data');

// Output directory 1: Legent/A2A/agent-cards (generated from scratch)
const OUTPUT_DIR = path.join(SCRIPT_DIR, '..', 'Legent', 'A2A', 'agent-cards');

// Output directory 2: A2A/js/agent-cards (update existing cards in-place)
const OUTPUT_DIR_A2A = path.join(SCRIPT_DIR, '..', 'A2A', 'js', 'agent-cards');

// ═══════════════════════════════════════════════════════════════
// Read helpers — all read from task-data/
// ═══════════════════════════════════════════════════════════════

function readConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    console.log('✓ Configuration loaded');
    return config;
  } catch (error) {
    console.error('✗ Failed to read configuration:', error.message);
    process.exit(1);
  }
}

function readAgentInfo(agentAlias) {
  const filePath = path.join(TASK_DATA_DIR, `${agentAlias}-info.json`);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`✓ Agent info loaded: ${agentAlias}`);
    return data;
  } catch (error) {
    console.error(`✗ Failed to read agent info (${agentAlias}):`, error.message);
    return null;
  }
}

function readPersonInfo(personAlias) {
  const filePath = path.join(TASK_DATA_DIR, `${personAlias}-info.json`);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`✓ Person info loaded: ${personAlias}`);
    return data;
  } catch (error) {
    console.error(`✗ Failed to read person info (${personAlias}):`, error.message);
    return null;
  }
}

function readLEInfo(leAlias) {
  const filePath = path.join(TASK_DATA_DIR, `${leAlias}-info.json`);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`✓ LE info loaded: ${leAlias}`);
    return data;
  } catch (error) {
    console.error(`✗ Failed to read LE info (${leAlias}):`, error.message);
    return null;
  }
}

function readOORCredentialInfo() {
  const filePath = path.join(TASK_DATA_DIR, 'oor-credential-info.json');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log('✓ OOR credential info loaded');
    return data;
  } catch (error) {
    console.error('✗ Failed to read OOR credential info:', error.message);
    return null;
  }
}

function readQVIInfo() {
  const filePath = path.join(TASK_DATA_DIR, 'qvi-info.json');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log('✓ QVI info loaded');
    return data;
  } catch (error) {
    console.error('✗ Failed to read QVI info:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Generate agent card from scratch (for Legent/A2A/agent-cards)
// ═══════════════════════════════════════════════════════════════

function generateAgentCard(config, org, person, agent) {
  console.log(`\n→ Generating agent card for: ${agent.alias}`);
  
  const agentInfo = readAgentInfo(agent.alias);
  const personInfo = readPersonInfo(person.alias);
  const leInfo = readLEInfo(org.alias);
  const oorCredInfo = readOORCredentialInfo();
  const qviInfo = readQVIInfo();
  
  if (!agentInfo || !personInfo || !leInfo) {
    console.error(`✗ Missing required data for ${agent.alias}`);
    return null;
  }
  
  const isJupiter = org.id === 'jupiter';
  
  const agentCard = {
    name: isJupiter ? "Jupiter Seller Agent" : "Tommy Buyer Agent",
    description: isJupiter 
      ? "Autonomous AI agent responsible for initiating, negotiating, and managing sales orders for JUPITER KNITTING COMPANY."
      : "AI agent responsible for submitting, negotiating, and tracking purchase orders for TOMMY HILFIGER EUROPE B.V.",
    url: isJupiter ? "https://jupiter-agent.com/" : "https://tommy-agent.com/",
    provider: {
      organization: org.name,
      url: isJupiter ? "https://jupiterknitting.com" : "https://tommyhilfiger.com"
    },
    version: "1.0.0",
    capabilities: {
      streaming: true,
      stateTransitionHistory: true
    },
    skills: isJupiter ? [
      {
        id: "procurement_management",
        name: "Procurement Management",
        description: "Collaborates with verified buyer agents to review incoming trade requirements, evaluate purchase requests, and align production capacity with order feasibility. Ensures all interactions occur within verified GLEIF trust boundaries.",
        tags: ["seller", "procurement", "verification", "gleif", "trade", "compliance"]
      },
      {
        id: "purchase_order_management",
        name: "Purchase Order Management",
        description: "Receives and processes purchase orders from verified buyer agents. Confirms order terms, delivery schedules, and initiates production after GLEIF credential validation.",
        tags: ["seller", "sales", "purchase-order", "gleif", "automation", "order-processing"]
      },
      {
        id: "invoice_approval",
        name: "Invoice Approval & Dispatch",
        description: "Generates and approves digital invoices for completed or approved purchase orders. Ensures all invoices include embedded vLEI credentials and adhere to traceability standards.",
        tags: ["seller", "finance", "invoice", "verification", "traceability", "gleif"]
      },
      {
        id: "payment_authorization",
        name: "Payment Authorization & Reconciliation",
        description: "Validates incoming payment confirmations from buyer agents, authenticates transaction credentials, and updates order fulfillment status in coordination with verified payment channels.",
        tags: ["seller", "payment", "authentication", "finance", "gleif", "compliance"]
      }
    ] : [
      {
        id: "procurement_management",
        name: "Procurement Management",
        description: "Oversees the complete procurement lifecycle — from identifying verified seller agents and evaluating proposals to finalizing trade agreements. Ensures that all counterparties are GLEIF-verified and contract terms align with buyer requirements.",
        tags: ["buyer", "procurement", "trade", "negotiation", "gleif", "compliance"]
      },
      {
        id: "purchase_order",
        name: "Purchase Order Management",
        description: "Manages procurement negotiations, evaluates offers, and finalizes trade requirements.",
        tags: ["buyer", "procurement", "trade"]
      },
      {
        id: "Invoice_Approval",
        name: "Invoice Approval",
        description: "Manages procurement negotiations, evaluates offers, and finalizes trade requirements.",
        tags: ["buyer", "procurement", "trade"]
      },
      {
        id: "Payment_Authentication",
        name: "Payment Authentication",
        description: "Manages procurement negotiations, evaluates offers, and finalizes trade requirements.",
        tags: ["buyer", "procurement", "trade"]
      }
    ],
    extensions: {
      gleifIdentity: {
        lei: org.lei,
        legalEntityName: org.name,
        registryName: org.registryName,
        qvi: qviInfo ? qviInfo.aid : "QVI_AID_PLACEHOLDER"
      },
      vLEImetadata: {
        agentName: agent.alias,
        oorHolderName: person.alias,
        delegatorAID: personInfo.aid,
        delegateeAID: agentInfo.aid,
        delegatorSAID: oorCredInfo ? oorCredInfo.said : "CREDENTIAL_SAID_PLACEHOLDER",
        delegateeSAID: agentInfo.aid,
        delegatorOOBI: personInfo.oobi,
        delegateeOOBI: agentInfo.oobi,
        leAID: leInfo.aid,
        leOOBI: leInfo.oobi,
        verificationPath: [
          "GLEIF_ROOT → QVI",
          `QVI → ${org.name} → ${person.legalName} → ${agent.alias}`
        ]
      },
      gleifVerification: {
        gleifVerificationEndpoint: `https://gleif.org/api/v1/lei/${org.lei}`
      },
      keriIdentifiers: {
        agentAID: agentInfo.aid,
        oorHolderAID: personInfo.aid,
        legalEntityAID: leInfo.aid,
        qviAID: qviInfo ? qviInfo.aid : "QVI_AID_PLACEHOLDER"
      }
    }
  };
  
  console.log(`✓ Agent card generated for ${agent.alias}`);
  console.log(`  agentName: ${agent.alias}`);
  console.log(`  oorHolderName: ${person.alias}`);
  console.log(`  Agent AID: ${agentInfo.aid}`);
  console.log(`  Delegator AID: ${personInfo.aid}`);
  console.log(`  LEI: ${org.lei}`);
  
  return agentCard;
}

// ═══════════════════════════════════════════════════════════════
// Update existing A2A card in-place (preserves format)
// Only touches extensions.keriIdentifiers, extensions.vLEImetadata,
// and extensions.gleifIdentity.qvi — everything else stays as-is.
// ═══════════════════════════════════════════════════════════════

function updateA2ACard(cardPath, agentInfo, personInfo, leInfo, qviInfo, oorCredInfo, org, person, agent) {
  try {
    const existingCard = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
    console.log(`  ✓ Read existing A2A card: ${cardPath}`);

    // Update keriIdentifiers
    if (!existingCard.extensions) existingCard.extensions = {};

    existingCard.extensions.keriIdentifiers = {
      agentAID:        agentInfo.aid,
      oorHolderAID:    personInfo.aid,
      legalEntityAID:  leInfo.aid,
      qviAID:          qviInfo ? qviInfo.aid : "QVI_AID_PLACEHOLDER"
    };

    // Update vLEImetadata — preserve existing fields like status, verificationEndpoint, timestamp
    const existingMeta = existingCard.extensions.vLEImetadata || {};
    existingCard.extensions.vLEImetadata = {
      ...existingMeta,
      agentName:        agent.alias,
      oorHolderName:    person.alias,
      delegatorAID:     personInfo.aid,
      delegateeAID:     agentInfo.aid,
      delegatorSAID:    oorCredInfo ? oorCredInfo.said : (existingMeta.delegatorSAID || "CREDENTIAL_SAID_PLACEHOLDER"),
      delegateeSAID:    agentInfo.aid,
      delegatorOOBI:    personInfo.oobi,
      delegateeOOBI:    agentInfo.oobi,
      leAID:            leInfo.aid,
      leOOBI:           leInfo.oobi,
      verificationPath: [
        "GLEIF_ROOT → QVI",
        `QVI → ${org.name} → ${person.legalName} → ${agent.alias}`
      ],
      timestamp:        new Date().toISOString()
    };

    // Update gleifIdentity.qvi only — preserve officialRole, engagementRole, etc.
    if (existingCard.extensions.gleifIdentity) {
      existingCard.extensions.gleifIdentity.qvi = qviInfo ? qviInfo.aid : existingCard.extensions.gleifIdentity.qvi;
    }

    fs.writeFileSync(cardPath, JSON.stringify(existingCard, null, 2));
    console.log(`  ✓ Updated A2A card: ${cardPath}`);
    return true;

  } catch (error) {
    console.error(`  ✗ Failed to update A2A card ${cardPath}: ${error.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Update existing A2A card for sub-agent (treasury) in-place.
// Adds vLEImetadata and keriIdentifiers if they don't exist yet.
// ═══════════════════════════════════════════════════════════════

function updateA2ASubAgentCard(cardPath, subAgentInfo, parentAgentInfo, personInfo, leInfo, qviInfo, org, person, parentAgent, subAgent) {
  try {
    const existingCard = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
    console.log(`  ✓ Read existing A2A sub-agent card: ${cardPath}`);

    if (!existingCard.extensions) existingCard.extensions = {};

    // Update keriIdentifiers — add parentAgentAID for sub-delegation chain
    existingCard.extensions.keriIdentifiers = {
      agentAID:        subAgentInfo.aid,
      parentAgentAID:  parentAgentInfo.aid,
      oorHolderAID:    personInfo.aid,
      legalEntityAID:  leInfo.aid,
      qviAID:          qviInfo ? qviInfo.aid : "QVI_AID_PLACEHOLDER"
    };

    // Add publicKey if available from task-data
    if (subAgentInfo.publicKey) {
      existingCard.extensions.keriIdentifiers.publicKey = subAgentInfo.publicKey;
    }

    // Update vLEImetadata — sub-delegation: delegator is the PARENT AGENT, not OOR holder
    const existingMeta = existingCard.extensions.vLEImetadata || {};
    existingCard.extensions.vLEImetadata = {
      ...existingMeta,
      agentName:        subAgent.alias,
      oorHolderName:    person.alias,
      parentAgentName:  parentAgent.alias,
      isSubDelegation:  true,
      scope:            subAgent.permissions ? subAgent.permissions.scope : "treasury_operations",
      canDelegate:      subAgent.permissions ? subAgent.permissions.canDelegate : false,
      delegatorAID:     parentAgentInfo.aid,
      delegateeAID:     subAgentInfo.aid,
      delegatorOOBI:    parentAgentInfo.oobi,
      delegateeOOBI:    subAgentInfo.oobi,
      oorHolderAID:     personInfo.aid,
      oorHolderOOBI:    personInfo.oobi,
      leAID:            leInfo.aid,
      leOOBI:           leInfo.oobi,
      verificationPath: [
        "GLEIF_ROOT → QVI",
        `QVI → ${org.name} → ${person.legalName} → ${parentAgent.alias} → ${subAgent.alias}`
      ],
      timestamp:        new Date().toISOString()
    };

    // Update gleifIdentity.qvi — preserve officialRole, engagementRole, etc.
    if (existingCard.extensions.gleifIdentity) {
      existingCard.extensions.gleifIdentity.qvi = qviInfo ? qviInfo.aid : existingCard.extensions.gleifIdentity.qvi;
    }

    fs.writeFileSync(cardPath, JSON.stringify(existingCard, null, 2));
    console.log(`  ✓ Updated A2A sub-agent card: ${cardPath}`);
    return true;

  } catch (error) {
    console.error(`  ✗ Failed to update A2A sub-agent card ${cardPath}: ${error.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Generate sub-agent card from scratch (for Legent/A2A/agent-cards)
// ═══════════════════════════════════════════════════════════════

function generateSubAgentCard(config, org, person, parentAgent, subAgent) {
  console.log(`\n→ Generating sub-agent card for: ${subAgent.alias}`);

  const subAgentInfo    = readAgentInfo(subAgent.alias);
  const parentAgentInfo = readAgentInfo(parentAgent.alias);
  const personInfo      = readPersonInfo(person.alias);
  const leInfo          = readLEInfo(org.alias);
  const qviInfo         = readQVIInfo();

  if (!subAgentInfo || !parentAgentInfo || !personInfo || !leInfo) {
    console.error(`✗ Missing required data for sub-agent ${subAgent.alias}`);
    return null;
  }

  const subAgentCard = {
    name: "Jupiter Treasury Agent",
    description: "Autonomous treasury AI agent for JUPITER KNITTING COMPANY. Holds the company balance sheet, runs ACTUS PAM cash flow simulations, and validates whether accepting a sale at a given price is safe for liquidity before the seller commits to any deal.",
    url: "http://localhost:7070/",
    provider: {
      organization: org.name,
      url: "https://jupiterknitting.com"
    },
    version: "1.0.0",
    capabilities: {
      streaming: true,
      stateTransitionHistory: true
    },
    skills: [
      {
        id: "cash_flow_validation",
        name: "Cash Flow & Liquidity Validation",
        description: "Runs an ACTUS PAM simulation for a proposed sale: models production outflow (IED) and invoice inflow (Maturity), checks whether cash stays above the safety threshold during the Net-30 gap, computes working-capital financing cost, and calculates NPV at the hurdle rate.",
        tags: ["treasury", "actus", "cashflow", "liquidity", "risk", "simulation"]
      },
      {
        id: "balance_management",
        name: "Balance Sheet Management",
        description: "Maintains the real-time balance sheet of Jupiter Knitting Company including current cash, pending outflows for committed orders, and available free liquidity.",
        tags: ["treasury", "balance", "finance", "accounting"]
      },
      {
        id: "minimum_price_advisory",
        name: "Minimum Viable Price Advisory",
        description: "When a proposed sale price fails the treasury check, computes the minimum price that restores NPV-positivity and cash safety, enabling the seller agent to counter at the correct floor.",
        tags: ["treasury", "pricing", "advisory", "npv", "risk"]
      }
    ],
    extensions: {
      gleifIdentity: {
        lei: org.lei,
        legalEntityName: org.name,
        registryName: org.registryName,
        qvi: qviInfo ? qviInfo.aid : "QVI_AID_PLACEHOLDER",
        officialRole: "ChiefFinancialOfficer",
        engagementRole: "Treasury Agent"
      },
      vLEImetadata: {
        agentName:        subAgent.alias,
        oorHolderName:    person.alias,
        parentAgentName:  parentAgent.alias,
        isSubDelegation:  true,
        scope:            subAgent.permissions ? subAgent.permissions.scope : "treasury_operations",
        canDelegate:      subAgent.permissions ? subAgent.permissions.canDelegate : false,
        delegatorAID:     parentAgentInfo.aid,
        delegateeAID:     subAgentInfo.aid,
        delegatorOOBI:    parentAgentInfo.oobi,
        delegateeOOBI:    subAgentInfo.oobi,
        oorHolderAID:     personInfo.aid,
        oorHolderOOBI:    personInfo.oobi,
        leAID:            leInfo.aid,
        leOOBI:           leInfo.oobi,
        verificationPath: [
          "GLEIF_ROOT → QVI",
          `QVI → ${org.name} → ${person.legalName} → ${parentAgent.alias} → ${subAgent.alias}`
        ],
        timestamp:        new Date().toISOString()
      },
      gleifVerification: {
        gleifVerificationEndpoint: `https://gleif.org/api/v1/lei/${org.lei}`
      },
      keriIdentifiers: {
        agentAID:        subAgentInfo.aid,
        parentAgentAID:  parentAgentInfo.aid,
        oorHolderAID:    personInfo.aid,
        legalEntityAID:  leInfo.aid,
        qviAID:          qviInfo ? qviInfo.aid : "QVI_AID_PLACEHOLDER",
        publicKey:       subAgentInfo.publicKey || undefined
      }
    }
  };

  console.log(`✓ Sub-agent card generated for ${subAgent.alias}`);
  console.log(`  agentName: ${subAgent.alias}`);
  console.log(`  parentAgent: ${parentAgent.alias}`);
  console.log(`  Sub-Agent AID: ${subAgentInfo.aid}`);
  console.log(`  Parent Agent AID (delegator): ${parentAgentInfo.aid}`);
  console.log(`  OOR Holder: ${person.alias}`);
  console.log(`  LEI: ${org.lei}`);
  console.log(`  isSubDelegation: true`);

  return subAgentCard;
}

// ═══════════════════════════════════════════════════════════════
// Main execution
// ═══════════════════════════════════════════════════════════════

function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  vLEI Agent Card Generator');
  console.log(`  Script location: ${SCRIPT_DIR}`);
  console.log(`  Output (Legent): ${OUTPUT_DIR}`);
  console.log(`  Output (A2A):    ${OUTPUT_DIR_A2A}`);
  console.log('═══════════════════════════════════════════════\n');
  
  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✓ Created Legent output directory: ${OUTPUT_DIR}`);
  }
  if (!fs.existsSync(OUTPUT_DIR_A2A)) {
    fs.mkdirSync(OUTPUT_DIR_A2A, { recursive: true });
    console.log(`✓ Created A2A output directory: ${OUTPUT_DIR_A2A}`);
  }
  console.log('');
  
  // Load configuration
  const config = readConfig();
  
  // Pre-read shared data once
  const oorCredInfo = readOORCredentialInfo();
  const qviInfo     = readQVIInfo();
  
  let generatedCount = 0;
  let updatedCount   = 0;
  
  // Process each organization
  for (const org of config.organizations) {
    console.log(`\n─────────────────────────────────────────────`);
    console.log(`Processing: ${org.name}`);
    console.log(`─────────────────────────────────────────────`);
    
    for (const person of org.persons) {
      if (!person.agents || person.agents.length === 0) continue;

      for (const agent of person.agents) {
        // ── 1. Generate from scratch → Legent/A2A/agent-cards ────────
        const agentCard = generateAgentCard(config, org, person, agent);
        
        if (agentCard) {
          const outputFile = path.join(OUTPUT_DIR, `${agent.alias}-card.json`);
          fs.writeFileSync(outputFile, JSON.stringify(agentCard, null, 2));
          console.log(`✓ Agent card saved: ${outputFile}`);
          generatedCount++;
        }
        
        // ── 2. Update existing card in-place → A2A/js/agent-cards ────
        const a2aCardPath = path.join(OUTPUT_DIR_A2A, `${agent.alias}-card.json`);
        if (fs.existsSync(a2aCardPath)) {
          const agentInfo  = readAgentInfo(agent.alias);
          const personInfo = readPersonInfo(person.alias);
          const leInfo     = readLEInfo(org.alias);
          if (agentInfo && personInfo && leInfo) {
            const ok = updateA2ACard(a2aCardPath, agentInfo, personInfo, leInfo, qviInfo, oorCredInfo, org, person, agent);
            if (ok) updatedCount++;
          }
        } else {
          // No existing A2A card — write the generated one as a new file
          if (agentCard) {
            fs.writeFileSync(a2aCardPath, JSON.stringify(agentCard, null, 2));
            console.log(`✓ New A2A card created: ${a2aCardPath}`);
            updatedCount++;
          }
        }

        // ── 3. Process sub-agents ────────────────────────────────────
        if (agent.subAgents && agent.subAgents.length > 0) {
          for (const subAgent of agent.subAgents) {
            // Generate from scratch → Legent/A2A/agent-cards
            const subCard = generateSubAgentCard(config, org, person, agent, subAgent);
            if (subCard) {
              const subOutputFile = path.join(OUTPUT_DIR, `${subAgent.alias}-card.json`);
              fs.writeFileSync(subOutputFile, JSON.stringify(subCard, null, 2));
              console.log(`✓ Sub-agent card saved: ${subOutputFile}`);
              generatedCount++;
            }

            // Update existing card in-place → A2A/js/agent-cards
            const subA2APath = path.join(OUTPUT_DIR_A2A, `${subAgent.alias}-card.json`);
            if (fs.existsSync(subA2APath)) {
              const subAgentInfo    = readAgentInfo(subAgent.alias);
              const parentAgentInfo = readAgentInfo(agent.alias);
              const personInfo      = readPersonInfo(person.alias);
              const leInfo          = readLEInfo(org.alias);
              if (subAgentInfo && parentAgentInfo && personInfo && leInfo) {
                const ok = updateA2ASubAgentCard(subA2APath, subAgentInfo, parentAgentInfo, personInfo, leInfo, qviInfo, org, person, agent, subAgent);
                if (ok) updatedCount++;
              }
            } else {
              // No existing A2A card — write the generated one
              if (subCard) {
                fs.writeFileSync(subA2APath, JSON.stringify(subCard, null, 2));
                console.log(`✓ New A2A sub-agent card created: ${subA2APath}`);
                updatedCount++;
              }
            }
          }
        }
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  ✅ Generation Complete`);
  console.log(`  Generated ${generatedCount} card(s) → ${OUTPUT_DIR}`);
  console.log(`  Updated   ${updatedCount} card(s) → ${OUTPUT_DIR_A2A}`);
  console.log('');
  console.log('  Key fields for DEEP-EXT verification:');
  console.log('    - vLEImetadata.agentName');
  console.log('    - vLEImetadata.oorHolderName');
  console.log('');
  console.log('  Sub-delegation fields:');
  console.log('    - vLEImetadata.isSubDelegation');
  console.log('    - vLEImetadata.parentAgentName');
  console.log('    - keriIdentifiers.parentAgentAID');
  console.log('═══════════════════════════════════════════════\n');
}

main();
