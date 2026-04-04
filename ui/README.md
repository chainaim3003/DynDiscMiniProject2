# AgentFlow UI

Procurement AI dashboard — real-time interface for the A2A multi-agent negotiation system.

## Overview

This UI connects to three live backend agents and displays real negotiation, treasury, and ACTUS cashflow data. No mock data is used once the agents are running.

## Pages

### Dashboard (`/`)
- Agent status cards — Buyer, Seller, Seller's Treasury (live status from SSE streams)
- Net Cash Flow chart — real ACTUS PAM cashflow events (IED outflow + MD inflow) from treasury agent
- Contract Summary — real PAM contract count, total notional, total savings
- Risk Alerts — failed ACTUS simulations + liquidity below safety threshold
- Cash Position — real `currentBalance`, `availableLiquidity`, `safetyThreshold` from `GET /health`
- Recent Activity — real DD contracts sorted by creation time

### Agents (`/agents`)
- Buyer and Seller chat panels — live SSE streams from buyer (:9090) and seller (:8080) agents
- Treasury Chat — live SSE stream from treasury agent (:7070), shows Seller→Treasury consultations and ACTUS verdicts
- Negotiation flow tracker — real-time round tracking, PO, invoice, DD offer, DD invoice steps
- Agent verification and fetch flows

### Treasury Management (`/contracts`)
- ACTUS DD Cashflow Contracts — fetched from `GET http://localhost:7070/actus-contracts`
- Persisted in localStorage as history across page refreshes
- Amortization schedule table — real ACTUS PAM cashflow events (IED, IP, MD) with payoff and nominal value
- Download All Contracts — exports real ACTUS contract JSON
- Clear History — removes localStorage cache

### Risk & Analytics (`/risk`)
- All data from `GET http://localhost:7070/actus-contracts` + localStorage history
- Probability of Default Scoring — derived from hurdle rate vs applied discount rate gap
- Liquidity Analysis — real ACTUS cashflow events plotted as inflow/outflow/balance
- Discount Rate Analysis — max DD rate vs applied rate vs hurdle per invoice
- Working Capital Metrics — DSO/DPO/CCC from real settlement and due dates
- Contract Portfolio donut — PAM(AR) / PAM(AP) / ANN(AR) / ANN(AP)
- Savings per Invoice bar chart
- Risk Summary — low/medium/high based on PD scores
- Drag & drop upload — import exported ACTUS contract JSON to populate analytics

## Backend Dependencies

| Agent | Port | Key Endpoints |
|---|---|---|
| Buyer Agent | 9090 | `GET /negotiate-events` (SSE), `POST /` (A2A) |
| Seller Agent | 8080 | `GET /negotiate-events` (SSE), `POST /` (A2A) |
| Treasury Agent | 7070 | `GET /negotiate-events` (SSE), `POST /consult`, `POST /dd-cashflow-schedule`, `GET /actus-contracts`, `GET /health` |

## Running the UI

```sh
# Install dep
This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
