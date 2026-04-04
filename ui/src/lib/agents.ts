// Autonomous Agent System

import { Contract, calculateDiscountSavings, calculatePDScore } from './calculations';

export type AgentType = 'buyer' | 'seller' | 'treasury';
export type AgentStatus = 'idle' | 'active' | 'thinking' | 'paused';

export interface AgentAction {
  id: string;
  timestamp: Date;
  agent: AgentType;
  action: string;
  status: 'success' | 'pending' | 'warning' | 'error';
  details?: string;
  calculation?: string;
}

export interface AgentMessage {
  id: string;
  timestamp: Date;
  from: AgentType;
  to: AgentType;
  message: string;
  type: 'question' | 'response' | 'notification';
  // Link to transaction event when applicable
  eventId?: string;
  // Optional UI helpers
  highlight?: boolean;
  badge?: string;
} 

export interface TransactionEvent {
  id: string;
  timestamp?: Date;
  actor?: AgentType;
  action?: string;
  message?: string;
  highlight?: boolean;
  badge?: string;
}

export interface Transaction {
  id: string;
  poId: string;
  originalAmount: number;
  discountPercent?: number;
  finalAmount?: number;
  invoiceId?: string;
  events: TransactionEvent[];
  currentEventIndex: number;
  status: 'open' | 'complete';
}

export function createDemoTransaction(): Transaction {
  const po = 'PO-17641';
  const invoice = 'INV-89234';
  const original = 100000;
  const discountPercent = 2;
  const final = 98000;

  const events: TransactionEvent[] = [
    { id: crypto.randomUUID(), timestamp: new Date(), message: 'Agents Verified — Buyer, Seller, Treasury authenticated', actor: undefined },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'buyer', action: `Purchase Order ${po} issued for $${original.toLocaleString()}` },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'seller', action: `${po} accepted. Order confirmed for fulfillment.` },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'seller', message: `Early payment discount available: ${discountPercent}% / 15 Net 30.`, },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'buyer', message: `Requesting Treasury evaluation on discount offer.`, },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'treasury', message: `APPROVED. APR 36.8% exceeds Cost of Capital 12%. Recommendation: Take discount.`, highlight: true, badge: 'Treasury Authorized' },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'seller', action: `Invoice ${invoice} issued for $${final.toLocaleString()} after discount.` },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'treasury', message: `Payment authorized. Initiating transfer of $${final.toLocaleString()}.`, badge: 'Treasury Authorized' },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'seller', action: `Payment received. Generating receipt and proof of delivery.`, },
    { id: crypto.randomUUID(), timestamp: new Date(), actor: 'buyer', message: `Receipt / POD confirmed. Transaction ${po} marked complete.`, },
  ];

  return {
    id: crypto.randomUUID(),
    poId: po,
    originalAmount: original,
    discountPercent,
    finalAmount: final,
    invoiceId: invoice,
    events,
    currentEventIndex: 0,
    status: 'open',
  };
}

export interface Agent {
  type: AgentType;
  name: string;
  status: AgentStatus;
  objective: string;
  taskQueue: string[];
  lastAction: AgentAction | null;
  successRate: number;
  totalActions: number;
  metrics: Record<string, number>;
}

export interface AgentState {
  buyer: Agent;
  seller: Agent;
  buyerTreasury: Agent;
  sellerTreasury: Agent;
}

// Initial agent states
export function createInitialAgentState(): AgentState {
  return {
    buyer: {
      type: 'buyer',
      name: 'Buyer Agent',
      status: 'idle',
      objective: 'Monitoring procurement opportunities...',
      taskQueue: [],
      lastAction: null,
      successRate: 94,
      totalActions: 0,
      metrics: {
        poCreated: 12,
        discountsTaken: 8,
        savingsRealized: 15420,
      },
    },
    seller: {
      type: 'seller',
      name: 'Seller Agent',
      status: 'idle',
      objective: 'Managing accounts receivable...',
      taskQueue: [],
      lastAction: null,
      successRate: 91,
      totalActions: 0,
      metrics: {
        invoicesGenerated: 28,
        discountsOffered: 15,
        collectionRate: 96,
      },
    },
    buyerTreasury: {
      type: 'treasury',
      name: "Buyer's Treasury Agent",
      status: 'active',
      objective: 'Optimizing buyer cash position...',
      taskQueue: [],
      lastAction: null,
      successRate: 97,
      totalActions: 0,
      metrics: {
        cashPosition: 125000,
        liquidityAlerts: 2,
        optimizations: 6,
      },
    },
    sellerTreasury: {
      type: 'treasury',
      name: "Seller's Treasury Agent",
      status: 'active',
      objective: 'Optimizing seller cash position...',
      taskQueue: [],
      lastAction: null,
      successRate: 95,
      totalActions: 0,
      metrics: {
        cashPosition: 85000,
        liquidityAlerts: 1,
        optimizations: 4,
      },
    },
  };
}

// Generate random PO number
function generatePONumber(): string {
  return `PO-${Math.floor(2000 + Math.random() * 100)}`;
}

// Generate random invoice number
function generateInvoiceNumber(): string {
  return `INV-${Math.floor(1000 + Math.random() * 100)}`;
}

// Generate random amount
function generateAmount(): number {
  return Math.floor(10000 + Math.random() * 40000);
}

// Agent action generators
export function generateBuyerAction(contracts: Contract[]): {
  action: AgentAction;
  message?: AgentMessage;
} {
  const actions = [
    () => {
      const poNum = generatePONumber();
      const amount = generateAmount();
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'buyer' as AgentType,
          action: `Created ${poNum} - $${amount.toLocaleString()}`,
          status: 'success' as const,
          details: 'Purchase order submitted for approval',
        },
      };
    },
    () => {
      const invNum = generateInvoiceNumber();
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'buyer' as AgentType,
          action: `Reviewing invoice ${invNum}`,
          status: 'pending' as const,
          details: 'Matching against PO and GRN',
        },
      };
    },
    () => {
      const discount = Math.floor(1.5 + Math.random() * 1.5);
      const days = Math.floor(10 + Math.random() * 20);
      const invNum = generateInvoiceNumber();
      const { apr } = calculateDiscountSavings(25000, discount, days);
      
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'buyer' as AgentType,
          action: `Evaluating ${discount}% discount on ${invNum}`,
          status: 'pending' as const,
          calculation: `APR equivalent: ${apr}%`,
        },
        message: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          from: 'buyer' as AgentType,
          to: 'treasury' as AgentType,
          message: `${invNum}: ${discount}% discount for ${days} days early?`,
          type: 'question' as const,
        },
      };
    },
    () => {
      const invNum = generateInvoiceNumber();
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'buyer' as AgentType,
          action: `✓ Approved payment for ${invNum}`,
          status: 'success' as const,
          details: 'Payment scheduled for next batch',
        },
      };
    },
  ];
  
  return actions[Math.floor(Math.random() * actions.length)]();
}

export function generateSellerAction(contracts: Contract[]): {
  action: AgentAction;
  message?: AgentMessage;
} {
  const actions = [
    () => {
      const invNum = generateInvoiceNumber();
      const amount = generateAmount();
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'seller' as AgentType,
          action: `Generated ${invNum} - $${amount.toLocaleString()}`,
          status: 'success' as const,
          details: 'Invoice sent to buyer',
        },
      };
    },
    () => {
      const invNum = generateInvoiceNumber();
      const pdResult = calculatePDScore(5, 2, 15);
      const discount = pdResult.riskScore < 20 ? '2%' : '1%';
      
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'seller' as AgentType,
          action: `Offering ${discount} discount on ${invNum}`,
          status: 'success' as const,
          calculation: `Buyer PD: ${pdResult.riskScore}% (${pdResult.riskClass})`,
        },
        message: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          from: 'seller' as AgentType,
          to: 'buyer' as AgentType,
          message: `${discount}/10 net 30 available on ${invNum}`,
          type: 'notification' as const,
        },
      };
    },
    () => {
      const invNum = generateInvoiceNumber();
      const daysOverdue = Math.floor(Math.random() * 10);
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'seller' as AgentType,
          action: `Payment reminder sent for ${invNum}`,
          status: daysOverdue > 5 ? 'warning' as const : 'success' as const,
          details: `${daysOverdue} days past due`,
        },
      };
    },
    () => {
      const amount = generateAmount();
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'seller' as AgentType,
          action: `💰 Payment received: $${amount.toLocaleString()}`,
          status: 'success' as const,
          details: 'Funds cleared and applied',
        },
      };
    },
  ];
  
  return actions[Math.floor(Math.random() * actions.length)]();
}

export function generateTreasuryAction(contracts: Contract[], cashFlows: { cumulative: number }[]): {
  action: AgentAction;
  message?: AgentMessage;
} {
  const minCash = Math.min(...cashFlows.map(cf => cf.cumulative));
  const cashPosition = cashFlows[0]?.cumulative || 100000;
  
  const actions = [
    () => {
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'treasury' as AgentType,
          action: `Cash position: $${cashPosition.toLocaleString()}`,
          status: 'success' as const,
          details: `7-day runway: ${Math.floor(cashPosition / 15000)} days`,
        },
      };
    },
    () => {
      if (minCash < 50000) {
        const gapWeek = cashFlows.findIndex(cf => cf.cumulative < 50000) + 1;
        return {
          action: {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            agent: 'treasury' as AgentType,
            action: `⚠️ Liquidity gap detected Week ${gapWeek}`,
            status: 'warning' as const,
            calculation: `Projected low: $${minCash.toLocaleString()}`,
          },
          message: {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            from: 'treasury' as AgentType,
            to: 'buyer' as AgentType,
            message: `Defer non-critical payments Week ${gapWeek}`,
            type: 'notification' as const,
          },
        };
      }
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'treasury' as AgentType,
          action: `✓ Liquidity adequate for next 12 weeks`,
          status: 'success' as const,
          details: `Minimum projected: $${minCash.toLocaleString()}`,
        },
      };
    },
    () => {
      const apr = Math.floor(30 + Math.random() * 20);
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'treasury' as AgentType,
          action: `Discount analysis: ${apr}% APR equivalent`,
          status: apr > 12 ? 'success' as const : 'warning' as const,
          calculation: `Cost of capital: 12%`,
        },
        message: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          from: 'treasury' as AgentType,
          to: 'buyer' as AgentType,
          message: apr > 15 ? `✅ APPROVE. APR: ${apr}%. Above threshold.` : `⚠️ REVIEW. APR: ${apr}%. Near threshold.`,
          type: 'response' as const,
        },
      };
    },
    () => {
      const dso = Math.floor(30 + Math.random() * 15);
      const dpo = Math.floor(25 + Math.random() * 20);
      const ccc = dso - dpo + 10;
      return {
        action: {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          agent: 'treasury' as AgentType,
          action: `Working capital metrics updated`,
          status: 'success' as const,
          calculation: `DSO: ${dso}d | DPO: ${dpo}d | CCC: ${ccc}d`,
        },
      };
    },
  ];
  
  return actions[Math.floor(Math.random() * actions.length)]();
}

// Format timestamp
export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Get agent color class
export function getAgentColorClass(agent: AgentType): string {
  switch (agent) {
    case 'buyer':
      return 'text-agent-buyer';
    case 'seller':
      return 'text-agent-seller';
    case 'treasury':
      return 'text-agent-treasury';
  }
}

// Get agent background class
export function getAgentBgClass(agent: AgentType): string {
  switch (agent) {
    case 'buyer':
      return 'bg-agent-buyer/20';
    case 'seller':
      return 'bg-agent-seller/20';
    case 'treasury':
      return 'bg-agent-treasury/20';
  }
}

// Get agent icon
export function getAgentEmoji(agent: AgentType): string {
  switch (agent) {
    case 'buyer':
      return '🛒';
    case 'seller':
      return '📦';
    case 'treasury':
      return '💼';
  }
}
