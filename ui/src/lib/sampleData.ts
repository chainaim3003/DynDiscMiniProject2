// Sample Data for Demonstration

import { Contract, PAMContract, ANNContract } from './calculations';

// Pre-loaded sample contracts
export const sampleContracts: Contract[] = [
  {
    id: 'C001',
    type: 'PAM',
    counterparty: 'Acme Corp',
    principal: 100000,
    rate: 6,
    maturity: '2026-03-15',
    startDate: '2025-03-15',
    direction: 'receivable',
    riskScore: 15,
  } as PAMContract,
  {
    id: 'C002',
    type: 'ANN',
    counterparty: 'Beta Industries',
    loanAmount: 50000,
    rate: 8,
    periods: 12,
    frequency: 'monthly',
    startDate: '2025-01-01',
    direction: 'payable',
    riskScore: 45,
  } as ANNContract,
  {
    id: 'C003',
    type: 'PAM',
    counterparty: 'Gamma Solutions',
    principal: 75000,
    rate: 5.5,
    maturity: '2025-09-30',
    startDate: '2025-01-01',
    direction: 'receivable',
    riskScore: 22,
  } as PAMContract,
  {
    id: 'C004',
    type: 'ANN',
    counterparty: 'Delta Partners',
    loanAmount: 120000,
    rate: 7,
    periods: 24,
    frequency: 'monthly',
    startDate: '2025-02-01',
    direction: 'payable',
    riskScore: 35,
  } as ANNContract,
  {
    id: 'C005',
    type: 'PAM',
    counterparty: 'Epsilon Trading',
    principal: 200000,
    rate: 6.5,
    maturity: '2026-06-30',
    startDate: '2025-06-30',
    direction: 'receivable',
    riskScore: 8,
  } as PAMContract,
  {
    id: 'C006',
    type: 'ANN',
    counterparty: 'Zeta Corp',
    loanAmount: 35000,
    rate: 9,
    periods: 6,
    frequency: 'quarterly',
    startDate: '2025-01-15',
    direction: 'payable',
    riskScore: 55,
  } as ANNContract,
];

// Sample counterparties for risk analysis
export const counterparties = [
  { name: 'Acme Corp', daysOverdue: 3, paymentVariance: 1.5, invoiceCount: 24 },
  { name: 'Beta Industries', daysOverdue: 12, paymentVariance: 4.2, invoiceCount: 15 },
  { name: 'Gamma Solutions', daysOverdue: 0, paymentVariance: 0.8, invoiceCount: 42 },
  { name: 'Delta Partners', daysOverdue: 8, paymentVariance: 3.5, invoiceCount: 18 },
  { name: 'Epsilon Trading', daysOverdue: 1, paymentVariance: 1.0, invoiceCount: 56 },
  { name: 'Zeta Corp', daysOverdue: 25, paymentVariance: 6.8, invoiceCount: 8 },
];

// Generate sample transactions
export function generateSampleTransactions(count: number = 20) {
  const types = ['PO Created', 'Invoice Generated', 'Payment Approved', 'Discount Offered', 'Settlement'];
  const agents = ['buyer', 'seller', 'treasury'] as const;
  const statuses = ['success', 'pending', 'warning'] as const;
  
  const transactions = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const time = new Date(now.getTime() - (count - i) * 30000); // 30 seconds apart
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const amount = Math.floor(10000 + Math.random() * 40000);
    
    let action = '';
    switch (type) {
      case 'PO Created':
        action = `Created PO #${2000 + i} - $${amount.toLocaleString()}`;
        break;
      case 'Invoice Generated':
        action = `Invoice #${1000 + i} generated - $${amount.toLocaleString()}`;
        break;
      case 'Payment Approved':
        action = `✓ Payment approved for $${amount.toLocaleString()}`;
        break;
      case 'Discount Offered':
        action = `Offering ${Math.floor(1 + Math.random() * 2.5)}% discount`;
        break;
      case 'Settlement':
        action = `💰 Settlement: $${amount.toLocaleString()} transferred`;
        break;
    }
    
    transactions.push({
      id: crypto.randomUUID(),
      timestamp: time,
      agent,
      action,
      status: statuses[Math.floor(Math.random() * statuses.length)],
    });
  }
  
  return transactions;
}

// Working capital sample data
export const workingCapitalData = {
  accountsReceivable: 450000,
  accountsPayable: 320000,
  inventory: 180000,
  annualRevenue: 3200000,
  annualCOGS: 2100000,
};

// Cash flow projection sample
export const cashFlowProjection = [
  { week: 1, inflows: 45000, outflows: 38000, net: 7000, cumulative: 107000 },
  { week: 2, inflows: 32000, outflows: 55000, net: -23000, cumulative: 84000 },
  { week: 3, inflows: 58000, outflows: 42000, net: 16000, cumulative: 100000 },
  { week: 4, inflows: 28000, outflows: 62000, net: -34000, cumulative: 66000 },
  { week: 5, inflows: 72000, outflows: 35000, net: 37000, cumulative: 103000 },
  { week: 6, inflows: 41000, outflows: 48000, net: -7000, cumulative: 96000 },
  { week: 7, inflows: 55000, outflows: 40000, net: 15000, cumulative: 111000 },
  { week: 8, inflows: 38000, outflows: 52000, net: -14000, cumulative: 97000 },
  { week: 9, inflows: 65000, outflows: 38000, net: 27000, cumulative: 124000 },
  { week: 10, inflows: 42000, outflows: 58000, net: -16000, cumulative: 108000 },
  { week: 11, inflows: 48000, outflows: 35000, net: 13000, cumulative: 121000 },
  { week: 12, inflows: 52000, outflows: 45000, net: 7000, cumulative: 128000 },
];
