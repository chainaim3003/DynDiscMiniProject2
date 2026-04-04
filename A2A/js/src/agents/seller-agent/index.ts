// ================= SELLER AGENT WITH HYBRID LLM + RULE-BASED DECISION MAKING =================
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import { A2AClient } from "@a2a-js/sdk/client";
import { AgentCard, TaskStatusUpdateEvent, Message, MessageSendParams } from "@a2a-js/sdk";
import { InMemoryTaskStore, AgentExecutor, RequestContext, ExecutionEventBus, DefaultRequestHandler } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";

import { SellerNegotiationState, NegotiationDecision, OfferData, CounterOfferData, AcceptanceData, EscalationNoticeData, InvoiceData, PurchaseOrderData, NegotiationData, DDOfferData, DDAcceptData, TreasuryConsultationSummary } from "../../shared/negotiation-types.js";
import { LLMNegotiationClient, LLMPromptContext } from "../../shared/llm-client.js";
import { NegotiationLogger, logInternal, suppressSDKNoise } from "../../shared/logger.js";
import { SSEBroadcaster } from "../../shared/sse-broadcaster.js";

// Module-level SSE broadcaster — shared across all requests
const sseBroadcaster = new SSEBroadcaster("seller");
import { computeSafeDDRate, computeLinearDiscount, addDays } from "../../shared/dd-calculator.js";
import { ActusClient } from "../../shared/actus-client.js";
import { getMarketSnapshot, computeAdjustedSafetyFactor, computeAdjustedMarginPrice, printMarketSnapshot } from "../../shared/market-data-client.js";
import { verifyCounterparty, readAgentCardMetadata, printVerificationResult } from "../../shared/vlei-verification-client.js";
import { saveSellerAuditJSON } from "../../shared/audit-writer.js";
import type { TreasuryResult } from "../treasury-agent/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });
suppressSDKNoise();

const SELLER_CONFIG = {
  marginPrice: 350, targetProfitPercentage: 0.1, maxRounds: 3,
  strategyParams: { flexibility: 0.5, dealPriority: 0.7, minProfitMargin: 5 },
  dd: { paymentTermsDays: 30, proposedEarlyPayDays: 10, safetyFactor: 0.5, hurdleRateAnnualized: 0.075 },
  treasury: { url: "http://localhost:7070/consult", enabled: true, timeoutMs: 5000 },
  vlei: { enabled: true, timeoutMs: 30000 },
};
const TARGET_PRICE = Math.round(SELLER_CONFIG.marginPrice * (1 + SELLER_CONFIG.targetProfitPercentage));

class SellerAgentExecutor implements AgentExecutor {
  private negotiations = new Map<string, SellerNegotiationState>();
  private loggers = new Map<string, NegotiationLogger>();
  private llmClient: LLMNegotiationClient;
  private actusClient: ActusClient;
  constructor() { this.llmClient = new LLMNegotiationClient(); this.actusClient = new ActusClient(); }
  async cancelTask(taskId: string): Promise<void> { logInternal(`Task cancellation requested: ${taskId}`); }

  async execute(ctx: RequestContext, bus: ExecutionEventBus) {
    const taskId = ctx.task?.id || uuidv4(); const contextId = ctx.task?.contextId || uuidv4();
    const dataParts = ctx.userMessage.parts.filter((p) => p.kind === "data");
    if (dataParts.length === 0) { this.respond(bus, taskId, contextId, "🏪 Seller Agent Ready. Waiting for buyer..."); return; }
    const data = (dataParts[0] as any).data as NegotiationData;
    switch (data.type) {
      case "OFFER": await this.handleBuyerOffer(data as OfferData, contextId, bus, taskId); break;
      case "COUNTER_OFFER": await this.handleBuyerCounterOffer(data as CounterOfferData, contextId, bus, taskId); break;
      case "ACCEPT_OFFER": await this.handleBuyerAcceptance(data as AcceptanceData, contextId, bus, taskId); break;
      case "PURCHASE_ORDER": await this.handlePurchaseOrder(data as PurchaseOrderData, contextId, bus, taskId); break;
      case "ESCALATION_NOTICE": await this.handleEscalationNotice(data as EscalationNoticeData, contextId, bus, taskId); break;
      case "DD_ACCEPT": await this.handleDDAccept(data as DDAcceptData, contextId, bus, taskId); break;
      default: logInternal(`Unknown message type: ${(data as any).type}`);
    }
  }

  // ================= TREASURY =================
  private async consultTreasury(negotiationId: string, pricePerUnit: number, quantity: number, round: number): Promise<TreasuryResult | null> {
    if (!SELLER_CONFIG.treasury.enabled) return null;
    try {
      const controller = new AbortController(); const tid = setTimeout(() => controller.abort(), SELLER_CONFIG.treasury.timeoutMs);
      const response = await fetch(SELLER_CONFIG.treasury.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ negotiationId, pricePerUnit, quantity, paymentTerms: SELLER_CONFIG.dd.paymentTermsDays, round }), signal: controller.signal });
      clearTimeout(tid);
      if (!response.ok) { logInternal(`Treasury returned HTTP ${response.status}`); return null; }
      return await response.json() as TreasuryResult;
    } catch (err: any) { logInternal(`Treasury ${err?.name === "AbortError" ? "timeout" : "unreachable"}: ${err?.message ?? err}`); return null; }
  }

  private applyTreasuryConstraint(decision: NegotiationDecision, treasuryResult: TreasuryResult | null, state: SellerNegotiationState, logger: NegotiationLogger): { decision: NegotiationDecision; overrideApplied: boolean } {
    if (!treasuryResult || treasuryResult.approved) return { decision, overrideApplied: false };
    const minPrice = Math.max(treasuryResult.minViablePrice ?? SELLER_CONFIG.marginPrice, SELLER_CONFIG.marginPrice + state.strategyParams.minProfitMargin);
    let overrideApplied = false;
    if (decision.action === "ACCEPT") {
      logger.log({ round: state.currentRound, messageType: "TREASURY_OVERRIDE", from: "SELLER", decision: "COUNTER_OFFER", reasoning: `Treasury rejected ₹${state.lastBuyerOffer}. Countering at ₹${minPrice}` } as any);
      decision = { action: "COUNTER", price: minPrice, reasoning: `Treasury override: ₹${minPrice}` }; overrideApplied = true;
    } else if (decision.action === "COUNTER" && decision.price !== undefined && decision.price < minPrice) {
      decision = { ...decision, price: minPrice, reasoning: `${decision.reasoning} [treasury floor: ₹${minPrice}]` }; overrideApplied = true;
    }
    return { decision, overrideApplied };
  }

  private recordTreasurySummary(state: SellerNegotiationState, tr: TreasuryResult | null, round: number, priceQueried: number, overrideApplied: boolean) {
    if (!tr) return; const prev = state.lastTreasuryResult;
    state.lastTreasuryResult = { round, priceQueried, approved: tr.approved, npvOfDeal: tr.npvOfDeal, netProfit: tr.netProfit, projectedMinBalance: tr.projectedMinBalance, safetyThreshold: tr.safetyThreshold, workingCapitalCost: tr.workingCapitalCost, minViablePrice: tr.minViablePrice, overrideApplied: overrideApplied || (prev?.overrideApplied ?? false) };
  }

  // ================= HANDLE BUYER INITIAL OFFER =================
  private async handleBuyerOffer(data: OfferData, contextId: string, bus: ExecutionEventBus, taskId: string) {
    const { negotiationId, pricePerUnit, quantity, deliveryDate } = data;
    const logger = new NegotiationLogger(negotiationId, "SELLER"); this.loggers.set(negotiationId, logger);
    logger.printSessionHeader(contextId); logger.printRoundHeader(1, SELLER_CONFIG.maxRounds);
    logger.log({ round: 1, messageType: "OFFER", from: "BUYER", offeredPrice: pricePerUnit, decision: "OFFER" });

    if (SELLER_CONFIG.vlei.enabled) {
      logInternal(`[vLEI] Verifying buyer delegation before negotiation...`);
      const vResult = await verifyCounterparty("seller", "DEEP", { timeoutMs: SELLER_CONFIG.vlei.timeoutMs });
      const vMeta = readAgentCardMetadata("tommyBuyerAgent");
      printVerificationResult(vResult, vMeta);
      if (!vResult.verified) { this.respond(bus, taskId, contextId, `❌ Negotiation REJECTED — buyer verification failed.\nReason: ${vResult.error}`); return; }
    }

    const state: SellerNegotiationState = {
      negotiationId, contextId, status: "NEGOTIATING", marginPrice: SELLER_CONFIG.marginPrice,
      targetProfitPercentage: SELLER_CONFIG.targetProfitPercentage, quantity, deliveryDate,
      currentRound: 1, maxRounds: SELLER_CONFIG.maxRounds, history: [],
      lastBuyerOffer: pricePerUnit, strategyParams: SELLER_CONFIG.strategyParams,
    };
    this.negotiations.set(negotiationId, state);

    // ── Store vLEI audit data on state ────────────────────────────────────────
    if (SELLER_CONFIG.vlei.enabled) {
      const vMeta = readAgentCardMetadata("tommyBuyerAgent");
      if (vMeta) {
        state.vleiVerification = {
          verified: true, agentName: vMeta.agentName, agentAID: vMeta.agentAID,
          oorHolderName: vMeta.oorHolderName, legalEntityName: vMeta.legalEntityName,
          lei: vMeta.lei, trustChain: vMeta.verificationPath,
          verifiedAt: new Date().toISOString(), verificationScript: "DEEP", verificationType: "STANDARD",
        };
      }
    }

    logInternal(`Consulting JupiterTreasuryAgent for Round 1 — buyer offer ₹${pricePerUnit}...`);
    const treasuryResult = await this.consultTreasury(negotiationId, pricePerUnit, quantity, 1);
    let decision = await this.makeNegotiationDecision(state);
    const { decision: finalDecision, overrideApplied } = this.applyTreasuryConstraint(decision, treasuryResult, state, logger);
    decision = finalDecision; this.recordTreasurySummary(state, treasuryResult, 1, pricePerUnit, overrideApplied);

    if (decision.action === "ACCEPT") { await this.sendAcceptance(state, logger, contextId); this.respond(bus, taskId, contextId, `✓ Accepting ₹${pricePerUnit}/unit`); }
    else if (decision.action === "COUNTER") { await this.sendCounterOffer(state, decision.price!, decision.reasoning, logger, contextId); this.respond(bus, taskId, contextId, `↓ Counter-offer: ₹${decision.price}/unit${overrideApplied ? " [treasury]" : ""}`); }
    else { state.status = "REJECTED"; this.respond(bus, taskId, contextId, "✗ Offer rejected"); }
  }

  // ================= HANDLE BUYER COUNTER OFFER =================
  private async handleBuyerCounterOffer(data: CounterOfferData, contextId: string, bus: ExecutionEventBus, taskId: string) {
    const state = this.negotiations.get(data.negotiationId); const logger = this.loggers.get(data.negotiationId);
    if (!state || !logger) { logInternal(`State not found: ${data.negotiationId}`); return; }
    state.lastBuyerOffer = data.pricePerUnit;
    const sellerLastPrice = state.lastSellerOffer;
    const priceMovement = sellerLastPrice !== undefined ? data.pricePerUnit - sellerLastPrice : 0;
    const priceMovementPercent = sellerLastPrice !== undefined && sellerLastPrice !== 0 ? (priceMovement / sellerLastPrice) * 100 : 0;
    logger.log({ round: state.currentRound, messageType: "COUNTER_OFFER", from: "BUYER", offeredPrice: data.pricePerUnit, previousPrice: sellerLastPrice, priceMovement, priceMovementPercent, decision: "COUNTER_OFFER", reasoning: data.reasoning });
    const currentHistory = state.history.find((h) => h.round === state.currentRound);
    if (currentHistory) { currentHistory.buyerOffer = data.pricePerUnit; currentHistory.buyerAction = "COUNTER_OFFER"; }
    state.currentRound += 1;
    if (state.currentRound > state.maxRounds) { state.status = "ESCALATED"; this.respond(bus, taskId, contextId, "⚠ Max rounds reached — awaiting escalation..."); return; }
    logger.printRoundHeader(state.currentRound, state.maxRounds);
    logInternal(`Consulting JupiterTreasuryAgent for Round ${state.currentRound}...`);
    const treasuryResult = await this.consultTreasury(state.negotiationId, data.pricePerUnit, state.quantity, state.currentRound);
    let decision = await this.makeNegotiationDecision(state);
<<<<<<< Updated upstream
    const { decision: finalDecision, overrideApplied } =
      this.applyTreasuryConstraint(decision, treasuryResult, state, logger);
    decision = finalDecision;

    this.recordTreasurySummary(state, treasuryResult, state.currentRound, data.pricePerUnit, overrideApplied);

    if (decision.action === "ACCEPT") {
      await this.sendAcceptance(state, logger, contextId);
      const profit = data.pricePerUnit - SELLER_CONFIG.marginPrice;
      this.respond(
        bus, taskId, contextId,
        `✓ Accepting buyer's offer: ₹${data.pricePerUnit}/unit\nProfit: ₹${profit}/unit (${((profit / SELLER_CONFIG.marginPrice) * 100).toFixed(1)}%)\nWaiting for buyer confirmation...`
      );
    } else if (decision.action === "COUNTER") {
      await this.sendCounterOffer(state, decision.price!, decision.reasoning, logger, contextId);
      this.respond(
        bus, taskId, contextId,
        `↓ Counter-offer sent: ₹${decision.price}/unit${overrideApplied ? "  [treasury floor applied]" : ""}\nWaiting for buyer response...`
      );
    } else {
      state.status = "REJECTED";
      logger.printNegotiationSummary("FAILED", {
        roundsUsed: state.currentRound,
        maxRounds:  state.maxRounds,
        quantity:   state.quantity,
      });
      this.respond(bus, taskId, contextId, "✗ Offer rejected — below margin price");
    }
=======
    const { decision: finalDecision, overrideApplied } = this.applyTreasuryConstraint(decision, treasuryResult, state, logger);
    decision = finalDecision; this.recordTreasurySummary(state, treasuryResult, state.currentRound, data.pricePerUnit, overrideApplied);
    if (decision.action === "ACCEPT") { await this.sendAcceptance(state, logger, contextId); this.respond(bus, taskId, contextId, `✓ Accepting ₹${data.pricePerUnit}/unit`); }
    else if (decision.action === "COUNTER") { await this.sendCounterOffer(state, decision.price!, decision.reasoning, logger, contextId); this.respond(bus, taskId, contextId, `↓ Counter: ₹${decision.price}/unit (R${state.currentRound}/${state.maxRounds})${overrideApplied ? " [treasury]" : ""}`); }
    else { state.status = "REJECTED"; logger.printNegotiationSummary("FAILED", { roundsUsed: state.currentRound, maxRounds: state.maxRounds, quantity: state.quantity }); this.respond(bus, taskId, contextId, "✗ Rejected"); }
>>>>>>> Stashed changes
  }

  private async handleEscalationNotice(data: EscalationNoticeData, contextId: string, bus: ExecutionEventBus, taskId: string) {
    const logger = this.loggers.get(data.negotiationId); const state = this.negotiations.get(data.negotiationId);
    if (state) state.status = "ESCALATED";
    if (logger) { logger.printEscalationReceived(data.gap, data.reportPath); const rp = logger.saveEscalationReport({ buyerFinalOffer: data.buyerFinalOffer, sellerFinalOffer: data.sellerFinalOffer, gap: data.gap, rounds: data.round, maxRounds: state?.maxRounds ?? data.round, quantity: state?.quantity ?? 0, deliveryDate: state?.deliveryDate ?? "—", logs: logger.getLogs() }); logger.printEscalationNotice(data.buyerFinalOffer, data.sellerFinalOffer, data.gap, rp); }
    this.respond(bus, taskId, contextId, `⚠ Escalated. Gap: ₹${data.gap}`);
  }

  private async handleBuyerAcceptance(data: AcceptanceData, contextId: string, bus: ExecutionEventBus, taskId: string) {
    const state = this.negotiations.get(data.negotiationId); const logger = this.loggers.get(data.negotiationId);
    if (!state || !logger) return; if (state.status === "COMPLETED" || state.status === "ACCEPTED") { logInternal(`Duplicate acceptance — already ${state.status}`); return; }
    logger.log({ round: state.currentRound, messageType: "ACCEPT", from: "BUYER", offeredPrice: data.acceptedPrice, decision: "ACCEPT", reasoning: "Buyer accepted" });
    state.agreedPrice = data.acceptedPrice; state.profitPerUnit = data.acceptedPrice - SELLER_CONFIG.marginPrice; state.totalRevenue = data.acceptedPrice * state.quantity; state.status = "ACCEPTED";
    const acceptanceData: AcceptanceData = { type: "ACCEPT_OFFER", negotiationId: state.negotiationId, round: state.currentRound, timestamp: new Date().toISOString(), acceptedPrice: data.acceptedPrice, from: "SELLER", finalTerms: { pricePerUnit: data.acceptedPrice, quantity: state.quantity, totalAmount: state.totalRevenue, deliveryDate: state.deliveryDate } };
    logger.log({ round: state.currentRound, messageType: "ACCEPT", from: "SELLER", offeredPrice: data.acceptedPrice, decision: "ACCEPT", reasoning: "bilateral acceptance" });
    await this.sendToBuyer(acceptanceData, contextId);
    const buyerStart = state.history[0]?.buyerOffer; const sellerStart = state.history[0]?.sellerOffer;
    logger.printNegotiationSummary("COMPLETED", { roundsUsed: state.currentRound, maxRounds: state.maxRounds, finalPrice: data.acceptedPrice, buyerStartPrice: buyerStart, sellerStartPrice: sellerStart, totalRevenue: state.totalRevenue, profitMargin: state.profitPerUnit, quantity: state.quantity });
    state.status = "COMPLETED";
    const tr = state.lastTreasuryResult;
    const reportPath = logger.saveSuccessReport({ finalPrice: data.acceptedPrice, quantity: state.quantity, totalDealValue: state.totalRevenue!, deliveryDate: state.deliveryDate, paymentTerms: `Net ${SELLER_CONFIG.dd.paymentTermsDays}`, roundsUsed: state.currentRound, maxRounds: state.maxRounds, logs: logger.getLogs(), buyerStartPrice: buyerStart, sellerStartPrice: sellerStart, profitPerUnit: state.profitPerUnit, totalRevenue: state.totalRevenue, marginPrice: SELLER_CONFIG.marginPrice, treasury: tr ? { consultedRounds: [tr.round], allApproved: tr.approved, overrideApplied: tr.overrideApplied, finalNPV: tr.npvOfDeal, finalNetProfit: tr.netProfit, projectedMinBalance: tr.projectedMinBalance, safetyThreshold: tr.safetyThreshold, workingCapitalCost: tr.workingCapitalCost } : undefined });
    logger.printSuccessNotice(data.acceptedPrice, state.totalRevenue!, reportPath);
<<<<<<< Updated upstream

    this.respond(
      bus, taskId, contextId,
      `✓✓ Deal Closed!\n\nFinal Price    : ₹${data.acceptedPrice}/unit\nProfit         : ₹${state.profitPerUnit}/unit\nTotal Revenue  : ₹${state.totalRevenue?.toLocaleString()}\nWaiting for Purchase Order...`
    );
=======
    this.respond(bus, taskId, contextId, `✓✓ Deal Closed!\nFinal: ₹${data.acceptedPrice}/unit | Profit: ₹${state.profitPerUnit}/unit | Revenue: ₹${state.totalRevenue?.toLocaleString()}\nReport: ${reportPath}`);
>>>>>>> Stashed changes
  }

  // ================= HANDLE PURCHASE ORDER =================
  private async handlePurchaseOrder(data: PurchaseOrderData, contextId: string, bus: ExecutionEventBus, taskId: string) {
    const state = this.negotiations.get(data.negotiationId); const logger = this.loggers.get(data.negotiationId);
    if (!state || !logger) return; logger.printPurchaseOrder(data);
    const invoiceId = `INV-${Date.now()}`; await this.sendInvoice(state, data.poId, invoiceId, logger, contextId);

    // ── IPEX: Issue invoice credential + grant to buyer ───────────────────────
    if (SELLER_CONFIG.vlei.enabled) {
      try {
        logInternal(`[IPEX] Issuing invoice credential and granting to buyer...`);
        const subtotalIpex = state.agreedPrice! * state.quantity; const taxIpex = Math.round(subtotalIpex * 0.18);
        const ipexResp = await fetch("http://localhost:4000/api/seller/ipex/issue-and-grant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, totalAmount: subtotalIpex + taxIpex, currency: "INR", pricePerUnit: state.agreedPrice, quantity: state.quantity, paymentTerms: `Net ${SELLER_CONFIG.dd.paymentTermsDays} days`, negotiationId: state.negotiationId, type: "INVOICE" }) });
        const ipexData = await ipexResp.json() as Record<string, unknown>;
        if (ipexData.success) { logInternal(`[IPEX] ✅ Invoice credential issued & granted — SAID: ${ipexData.credentialSAID}`); }
        else logInternal(`[IPEX] ⚠ Invoice credential failed: ${ipexData.error ?? "unknown"}`);
        // Store IPEX audit data
        state.ipexInvoice = { invoiceId, invoiceType: "INVOICE", credentialSAID: ipexData.credentialSAID as string, issued: ipexData.success === true, granted: ipexData.success === true, admitted: false, timestamp: new Date().toISOString(), error: ipexData.error as string };
      } catch (ipexErr: any) { logInternal(`[IPEX] ⚠ IPEX error: ${ipexErr?.message ?? ipexErr}`); }
    }
    state.status = "COMPLETED";

    // ── DD rate computation ───────────────────────────────────────────────────
    const agreedPrice = state.agreedPrice!;
    const market = await getMarketSnapshot();
    // Store market snapshot for audit
    state.marketSnapshot = { sofrRate: market.sofrRate, sofrSource: market.sofrSource, cottonPricePerLb: market.cottonPricePerLb, effectiveBorrowingRate: market.effectiveBorrowingRate, capturedAt: new Date().toISOString() };
    printMarketSnapshot(market, "L4 DD Offer — Market-Informed Parameters");
    const adjustedSafetyFactor = computeAdjustedSafetyFactor(market.effectiveBorrowingRate);
    const adjustedMarginPrice = computeAdjustedMarginPrice(SELLER_CONFIG.marginPrice, market.commodityIndex);
    logInternal(`[L4] margin ₹${SELLER_CONFIG.marginPrice}→₹${adjustedMarginPrice}  factor ${SELLER_CONFIG.dd.safetyFactor}→${adjustedSafetyFactor}  EBR ${(market.effectiveBorrowingRate * 100).toFixed(2)}%`);
    const safeDDRate = computeSafeDDRate(agreedPrice, SELLER_CONFIG.marginPrice, adjustedSafetyFactor);
    if (safeDDRate <= 0) { this.respond(bus, taskId, contextId, "📄 Invoice sent\nDD skipped (no margin)"); return; }

    const invoiceDate = new Date().toISOString().split("T")[0];
    const dueDate = addDays(invoiceDate, SELLER_CONFIG.dd.paymentTermsDays);
    const proposedSettlementDate = addDays(invoiceDate, SELLER_CONFIG.dd.proposedEarlyPayDays);
<<<<<<< Updated upstream

    const subtotal    = agreedPrice * state.quantity;
    const tax         = Math.round(subtotal * 0.18);
    const totalAmount = subtotal + tax;

    const discountAtProposed = computeLinearDiscount(
      totalAmount,
      safeDDRate,
      invoiceDate,
      dueDate,
      proposedSettlementDate
    );

    const ddOfferData: DDOfferData = {
      type:                    "DD_OFFER",
      invoiceId,
      negotiationId:           state.negotiationId,
      invoiceDate,
      dueDate,
      originalTotal:           totalAmount,
      maxDiscountRate:         safeDDRate,
      paymentTermsDays:        SELLER_CONFIG.dd.paymentTermsDays,
      proposedSettlementDate,
      discountAtProposedDate:  discountAtProposed,
    };

    logger.printDDOffer(ddOfferData);

    this.respond(
      bus, taskId, contextId,
      `📄 Invoice sent\n💰 DD Offer sent — max ${(safeDDRate * 100).toFixed(3)}% discount\n   Pay by ${proposedSettlementDate} → ₹${discountAtProposed.discountedAmount.toLocaleString()} (save ₹${discountAtProposed.savingAmount.toLocaleString()})\nAwaiting buyer's DD acceptance...`
    );

    // 800ms delay — ensures "Invoice sent / DD Offer sent" SSE reaches UI before buyer processes DD offer
    await new Promise(resolve => setTimeout(resolve, 800));
    await this.sendToBuyer(ddOfferData, contextId);
=======
    const subtotal = agreedPrice * state.quantity; const tax = Math.round(subtotal * 0.18); const totalAmount = subtotal + tax;
    const discountAtProposed = computeLinearDiscount(totalAmount, safeDDRate, invoiceDate, dueDate, proposedSettlementDate);
    const ddOfferData: DDOfferData = { type: "DD_OFFER", invoiceId, negotiationId: state.negotiationId, invoiceDate, dueDate, originalTotal: totalAmount, maxDiscountRate: safeDDRate, paymentTermsDays: SELLER_CONFIG.dd.paymentTermsDays, proposedSettlementDate, discountAtProposedDate: discountAtProposed };
    logger.printDDOffer(ddOfferData); await this.sendToBuyer(ddOfferData, contextId);
    this.respond(bus, taskId, contextId, `📄 Invoice sent\n💰 DD Offer: max ${(safeDDRate * 100).toFixed(3)}% discount`);
>>>>>>> Stashed changes
  }

  // ================= HANDLE DD_ACCEPT =================
  private async handleDDAccept(data: DDAcceptData, contextId: string, bus: ExecutionEventBus, taskId: string) {
    const state = this.negotiations.get(data.negotiationId); const logger = this.loggers.get(data.negotiationId);
    if (!state || !logger) return; logger.printDDAccept(data);
    const agreedPrice = state.agreedPrice!;
    const safeDDRate = computeSafeDDRate(agreedPrice, SELLER_CONFIG.marginPrice, SELLER_CONFIG.dd.safetyFactor);
    const invoiceDate = new Date().toISOString().split("T")[0]; const dueDate = addDays(invoiceDate, SELLER_CONFIG.dd.paymentTermsDays);
    const subtotal = agreedPrice * state.quantity; const tax = Math.round(subtotal * 0.18); const totalAmount = subtotal + tax;
    const ddResult = computeLinearDiscount(totalAmount, safeDDRate, invoiceDate, dueDate, data.chosenSettlementDate);

    logInternal(`Sub-delegating DD cashflow schedule to JupiterTreasuryAgent...`);
    let actusSuccess = false, actusContractId = data.invoiceId, actusScenarioId = "", actusError: string | undefined, marketCtx = "";
    try {
      const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 15000);
      const resp = await fetch("http://localhost:7070/dd-cashflow-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ negotiationId: data.negotiationId, invoiceId: data.invoiceId, settlementDate: data.chosenSettlementDate, notionalAmount: totalAmount, maxDiscountRate: safeDDRate, invoiceDate, dueDate, sellerRevenue: state.totalRevenue ?? subtotal }), signal: ctrl.signal });
      clearTimeout(tid);
      if (resp.ok) { const tv = await resp.json() as any; actusSuccess = tv.success ?? false; actusContractId = tv.contractId ?? data.invoiceId; actusScenarioId = tv.scenarioId ?? ""; actusError = tv.error; if (tv.market) { const m = tv.market; marketCtx = `  SOFR ${(m.sofrRate * 100).toFixed(2)}% hurdle ${(m.adjustedHurdleRate * 100).toFixed(2)}% EBR ${(m.effectiveBorrowingRate * 100).toFixed(2)}%`; } if (actusSuccess) logInternal(`Treasury cashflow ✓ — ${(tv.events ?? []).length} events${marketCtx}`); else logInternal(`Treasury cashflow failed: ${actusError}`); }
      else throw new Error(`Treasury HTTP ${resp.status}`);
    } catch (err: any) {
      logInternal(`Treasury sub-delegation failed — falling back to direct ACTUS`);
      const fb = await this.actusClient.submitDDContract({ contractId: data.invoiceId, negotiationId: data.negotiationId, invoiceDate, dueDate, settlementDate: data.chosenSettlementDate, notionalAmount: totalAmount, maxDiscountRate: safeDDRate, hurdleRateAnnualized: SELLER_CONFIG.dd.hurdleRateAnnualized, sellerRevenue: state.totalRevenue ?? totalAmount });
      actusSuccess = fb.success; actusContractId = fb.contractId; actusScenarioId = fb.scenarioId; actusError = fb.error;
    }

    const ddInvoice = { type: "DD_INVOICE", invoiceId: data.invoiceId, negotiationId: data.negotiationId, originalTotal: totalAmount, discountedTotal: ddResult.discountedAmount, savingAmount: ddResult.savingAmount, appliedRate: ddResult.appliedRate, settlementDate: data.chosenSettlementDate, dueDate, actusContractId, actusScenarioId, actusSimulationStatus: actusSuccess ? "SUCCESS" : "FAILED", actusError };
    logger.printDDInvoice(ddInvoice); await this.sendToBuyer(ddInvoice, contextId);

    // ── IPEX: Issue DD invoice credential + grant to buyer ────────────────────
    if (SELLER_CONFIG.vlei.enabled) {
      try {
        logInternal(`[IPEX] Issuing DD invoice credential and granting to buyer...`);
        const ipexResp = await fetch("http://localhost:4000/api/seller/ipex/issue-and-grant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId: data.invoiceId, totalAmount: ddResult.discountedAmount, currency: "INR", pricePerUnit: state.agreedPrice, quantity: state.quantity, paymentTerms: `Early payment by ${data.chosenSettlementDate}`, negotiationId: state.negotiationId, type: "DD_INVOICE" }) });
        const ipexData = await ipexResp.json() as Record<string, unknown>;
        if (ipexData.success) logInternal(`[IPEX] ✅ DD Invoice credential issued & granted — SAID: ${ipexData.credentialSAID}`);
        else logInternal(`[IPEX] ⚠ DD Invoice credential failed: ${ipexData.error ?? "unknown"}`);
        // Store IPEX DD audit data
        state.ipexDDInvoice = { invoiceId: data.invoiceId, invoiceType: "DD_INVOICE", credentialSAID: ipexData.credentialSAID as string, issued: ipexData.success === true, granted: ipexData.success === true, admitted: false, timestamp: new Date().toISOString(), error: ipexData.error as string };
      } catch (ipexErr: any) { logInternal(`[IPEX] ⚠ IPEX DD error: ${ipexErr?.message ?? ipexErr}`); }
    }

    // ── Save JSON audit file for UI consumption ───────────────────────────────
    try {
      const auditPath = saveSellerAuditJSON(state, {
        invoiceId: data.invoiceId, invoiceTotal: totalAmount, invoiceSubtotal: subtotal, invoiceTax: tax,
        ddOffered: true, ddDecision: "AUTO_ACCEPT", ddOriginalTotal: totalAmount, ddDiscountedTotal: ddResult.discountedAmount,
        ddSavingAmount: ddResult.savingAmount, ddAppliedRate: ddResult.appliedRate,
        ddSettlementDate: data.chosenSettlementDate, ddDueDate: dueDate,
        ddActusContractId: actusContractId, ddActusStatus: actusSuccess ? "SUCCESS" : "FAILED", ddActusError: actusError,
        paymentTerms: `Net ${SELLER_CONFIG.dd.paymentTermsDays}`,
      });
      logInternal(`[AUDIT] ✅ JSON audit saved → ${auditPath}`);
    } catch (e: any) { logInternal(`[AUDIT] Failed to save audit: ${e.message}`); }

<<<<<<< Updated upstream
    // ── Build and send DD_INVOICE ─────────────────────────────────────────────
    const ddInvoice = {
      type:                  "DD_INVOICE",
      invoiceId:             data.invoiceId,
      negotiationId:         data.negotiationId,
      originalTotal:         totalAmount,
      discountedTotal:       ddResult.discountedAmount,
      savingAmount:          ddResult.savingAmount,
      appliedRate:           ddResult.appliedRate,
      settlementDate:        data.chosenSettlementDate,
      dueDate,
      actusContractId,
      actusScenarioId,
      actusSimulationStatus: actusSuccess ? "SUCCESS" : "FAILED",
      actusError,
    };

    logger.printDDInvoice(ddInvoice);
    state.status = "DD_COMPLETED";

    this.respond(
      bus, taskId, contextId,
      `✓ DD Invoice dispatched to buyer\nSettle by : ${data.chosenSettlementDate}\nACTUS      : ${actusSuccess ? "✓ SUCCESS" : "⚠ " + actusError}`
    );

    // 800ms delay — ensures "DD Invoice dispatched" SSE reaches UI before buyer's "DD Invoice received"
    await new Promise(resolve => setTimeout(resolve, 800));
    await this.sendToBuyer(ddInvoice, contextId);
  }

  // ================= HYBRID DECISION MAKING =================
  private async makeNegotiationDecision(state: SellerNegotiationState): Promise<NegotiationDecision> {
    const llmDecision       = await this.getLLMDecision(state);
    const validatedDecision = this.applySellerConstraints(llmDecision, state);

    if (!validatedDecision) {
      logInternal("LLM decision invalid — using rule-based fallback");
      return this.ruleBasedDecision(state);
    }
    return validatedDecision;
=======
    state.status = "DD_COMPLETED";
    this.respond(bus, taskId, contextId, `✅ DD Invoice sent!\nOriginal: ₹${totalAmount.toLocaleString()} | Discounted: ₹${ddResult.discountedAmount.toLocaleString()} (${(ddResult.appliedRate * 100).toFixed(3)}% off)\nSaving: ₹${ddResult.savingAmount.toLocaleString()} | Settle by: ${data.chosenSettlementDate}\nACTUS: ${actusSuccess ? "✓" : "⚠ " + actusError}${marketCtx ? "\n" + marketCtx : ""}\nWorkflow complete!`);
>>>>>>> Stashed changes
  }

  // ================= DECISION MAKING =================
  private async makeNegotiationDecision(state: SellerNegotiationState): Promise<NegotiationDecision> { const d = await this.getLLMDecision(state); const v = this.applySellerConstraints(d, state); if (!v) { logInternal("LLM invalid — rule-based fallback"); return this.ruleBasedDecision(state); } return v; }
  private async getLLMDecision(state: SellerNegotiationState): Promise<NegotiationDecision> {
    const market = await getMarketSnapshot();
    const context: LLMPromptContext = { role: "SELLER", round: state.currentRound, maxRounds: state.maxRounds, lastOwnOffer: state.lastSellerOffer, lastTheirOffer: state.lastBuyerOffer, history: state.history, constraints: { marginPrice: state.marginPrice + state.strategyParams.minProfitMargin, quantity: state.quantity }, targetPrice: TARGET_PRICE, marketContext: { sofrRate: market.sofrRate, cottonPricePerLb: market.cottonPricePerLb, effectiveBorrowingRate: market.effectiveBorrowingRate, sofrSource: market.sofrSource } };
    const r = await this.llmClient.getNegotiationDecision(context); return { action: r.action, price: r.price, reasoning: r.reasoning };
  }
  private applySellerConstraints(decision: NegotiationDecision, state: SellerNegotiationState): NegotiationDecision | null {
    const minAcceptable = state.marginPrice + state.strategyParams.minProfitMargin;
    if (decision.action === "ACCEPT" && state.lastBuyerOffer && state.lastBuyerOffer < minAcceptable) {
      if (state.currentRound < state.maxRounds) { decision.action = "COUNTER"; decision.price = minAcceptable; decision.reasoning = `Below min ₹${minAcceptable}`; }
      else { decision.action = "REJECT"; decision.reasoning = `₹${state.lastBuyerOffer} below min in final round`; }
    }
    if (decision.action === "COUNTER") {
      if (!decision.price) return null;
      if (decision.price < state.marginPrice) { decision.price = state.marginPrice + state.strategyParams.minProfitMargin; decision.reasoning += " (floor)"; }
      if (state.lastSellerOffer && decision.price > state.lastSellerOffer) { decision.price = Math.max(state.lastSellerOffer - 5, state.marginPrice + state.strategyParams.minProfitMargin); decision.reasoning += " (decreased)"; }
      decision.price = Math.round(decision.price);
    }
    return decision;
  }
  private ruleBasedDecision(state: SellerNegotiationState): NegotiationDecision {
    const b = state.lastBuyerOffer!; const targets: Record<number, number> = { 1: state.marginPrice + 30, 2: state.marginPrice + 20, 3: state.marginPrice + 10 };
    const t = targets[state.currentRound] ?? state.marginPrice + 5;
    if (b >= t) return { action: "ACCEPT", reasoning: `₹${b} meets target` };
    if (state.currentRound === state.maxRounds) return b >= state.marginPrice + state.strategyParams.minProfitMargin ? { action: "ACCEPT", reasoning: "Final round — above margin" } : { action: "REJECT", reasoning: "Final round — below margin" };
    let p: number; if (!state.lastSellerOffer) p = Math.max(state.marginPrice * 1.25, b * 1.3);
    else { const g = state.lastSellerOffer - b; p = Math.max(state.lastSellerOffer - g * (state.currentRound === 2 ? 0.3 : 0.4), state.marginPrice + state.strategyParams.minProfitMargin); }
    return { action: "COUNTER", price: Math.round(p), reasoning: `Strategic counter — ₹${Math.round(p - state.marginPrice)} profit` };
  }

  // ================= MESSAGING =================
  private async sendCounterOffer(state: SellerNegotiationState, price: number, reasoning: string, logger: NegotiationLogger, contextId: string) {
    const prev = state.lastSellerOffer ?? state.lastBuyerOffer!; const gap = price - state.lastBuyerOffer!;
    logger.log({ round: state.currentRound, messageType: "COUNTER_OFFER", from: "SELLER", offeredPrice: price, previousPrice: prev, priceMovement: price - prev, priceMovementPercent: ((price - prev) / prev) * 100, gap, decision: "COUNTER_OFFER", reasoning });
    state.lastSellerOffer = price; state.history.push({ round: state.currentRound, sellerOffer: price, buyerOffer: state.lastBuyerOffer, sellerAction: "COUNTER_OFFER", timestamp: new Date().toISOString(), reasoning });
    await this.sendToBuyer({ type: "COUNTER_OFFER", negotiationId: state.negotiationId, round: state.currentRound, timestamp: new Date().toISOString(), pricePerUnit: price, previousPrice: prev, from: "SELLER", reasoning } as CounterOfferData, contextId);
  }
  private async sendAcceptance(state: SellerNegotiationState, logger: NegotiationLogger, contextId: string) {
    const p = state.lastBuyerOffer!; const t = p * state.quantity; const pr = p - state.marginPrice;
    logger.log({ round: state.currentRound, messageType: "ACCEPT", from: "SELLER", offeredPrice: p, decision: "ACCEPT", reasoning: `Profit: ₹${pr}/unit` });
    state.agreedPrice = p; state.profitPerUnit = pr; state.totalRevenue = t; state.status = "ACCEPTED";
    await this.sendToBuyer({ type: "ACCEPT_OFFER", negotiationId: state.negotiationId, round: state.currentRound, timestamp: new Date().toISOString(), acceptedPrice: p, from: "SELLER", finalTerms: { pricePerUnit: p, quantity: state.quantity, totalAmount: t, deliveryDate: state.deliveryDate } } as AcceptanceData, contextId);
  }
  private async sendInvoice(state: SellerNegotiationState, poId: string, invoiceId: string, logger: NegotiationLogger, contextId: string) {
    const s = state.agreedPrice! * state.quantity; const t = Math.round(s * 0.18); const total = s + t;
    const inv: InvoiceData = { type: "INVOICE", invoiceId, negotiationId: state.negotiationId, poId, invoiceDate: new Date().toISOString(), terms: { pricePerUnit: state.agreedPrice!, quantity: state.quantity, subtotal: s, tax: t, total }, paymentTerms: `Net ${SELLER_CONFIG.dd.paymentTermsDays} days`, deliveryDate: state.deliveryDate };
    logger.printInvoice(inv); await this.sendToBuyer(inv, contextId);
  }
  private async sendToBuyer(data: any, contextId: string): Promise<void> {
    try { const c = await A2AClient.fromCardUrl("http://localhost:9090/.well-known/agent-card.json"); const m: Message = { messageId: uuidv4(), kind: "message", role: "agent", contextId, parts: [{ kind: "data", data }, { kind: "text", text: `Negotiation ${data.type} - Round ${data.round || "N/A"}` }] }; const s = c.sendMessageStream({ message: m } as MessageSendParams); await Promise.race([(async () => { for await (const _ of s) {} })(), new Promise((r) => setTimeout(r, 10000))]); }
    catch (e: any) { if (e.code !== "UND_ERR_BODY_TIMEOUT" && e.message !== "terminated") logInternal(`Send-to-buyer error: ${e.message || e}`); }
  }
<<<<<<< Updated upstream

  private respond(bus: ExecutionEventBus, taskId: string, contextId: string, text: string, skipSse = false) {
    if (!skipSse) sseBroadcaster.broadcast(text);
    bus.publish({
      kind:      "status-update",
      taskId,
      contextId,
      status: {
        state:     "completed",
        timestamp: new Date().toISOString(),
        message: {
          kind:      "message",
          role:      "agent",
          messageId: uuidv4(),
          parts:     [{ kind: "text", text }],
          taskId,
          contextId,
        },
      },
      final: true,
    } as TaskStatusUpdateEvent);
=======
  private respond(bus: ExecutionEventBus, taskId: string, contextId: string, text: string) {
    bus.publish({ kind: "status-update", taskId, contextId, status: { state: "completed", timestamp: new Date().toISOString(), message: { kind: "message", role: "agent", messageId: uuidv4(), parts: [{ kind: "text", text }], taskId, contextId } }, final: true } as TaskStatusUpdateEvent);
>>>>>>> Stashed changes
  }
}

const cardPath = path.resolve(__dirname, "../../../agent-cards/jupiterSellerAgent-card.json");
const sellerCard: AgentCard = JSON.parse(fs.readFileSync(cardPath, "utf8"));
async function main() {
<<<<<<< Updated upstream
  const executor = new SellerAgentExecutor();
  const handler  = new DefaultRequestHandler(sellerCard, new InMemoryTaskStore(), executor);

  const app = express();
  app.use(cors());
  new A2AExpressApp(handler).setupRoutes(app);

  // SSE endpoint — UI subscribes here to receive live agent messages
  app.get('/negotiate-events', (req, res) => sseBroadcaster.addClient(req, res));

=======
  const executor = new SellerAgentExecutor(); const handler = new DefaultRequestHandler(sellerCard, new InMemoryTaskStore(), executor);
  const app = express(); app.use(cors()); new A2AExpressApp(handler).setupRoutes(app);
>>>>>>> Stashed changes
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => { console.log(`\n🏪  Seller Agent  →  http://localhost:${PORT}`); console.log(`    Margin: ₹${SELLER_CONFIG.marginPrice} | Target: ₹${TARGET_PRICE} | Rounds: ${SELLER_CONFIG.maxRounds} | DD: Net ${SELLER_CONFIG.dd.paymentTermsDays}\n`); });
}
main().catch(console.error);
