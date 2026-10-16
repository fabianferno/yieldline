# Product brief: Revenue-based financing for x402 sellers (working name: Horos)

## Context
- Hackathon: Tameion Agents Hackathon (Canteen × Circle), https://tameion.thecanteenapp.com
- Must run on Arc, settle in USDC, use the Circle stack.
- Deadline: Oct 17, 11:59 PM ET (Oct 18, ~9:30 AM IST).
- Deliverables: public GitHub repo, video demo under 3 min, live link strongly encouraged.
- Judging: Agentic sophistication 30%, Traction 30%, Circle tool usage 20%, Innovation 20%.

## One-line pitch
Working capital for businesses that earn through x402: an agent advances USDC against a seller's
proven x402 revenue, repayment is swept automatically from incoming payments, and every advance
is published as a public on-chain lien so no one can borrow twice against the same revenue.

## Core loop (the demo)
1. Seller connects: we read their historical x402 receipts on Arc.
2. Underwriting agent scores the revenue and proposes an advance (amount, sweep %, cap, term), with a written rationale.
3. Seller accepts: sets `payTo` in their x402 middleware to a per-seller Splitter contract. Lien is published to the registry.
4. Advance is disbursed in USDC from the lender pool.
5. Every incoming payment hits the Splitter: X% goes to the pool until repaid, the rest forwards to the seller.
6. Monitoring agent watches revenue and the seller's live 402 responses; adjusts, freezes, or flags default, logging every decision with reasoning.
7. When fully repaid, lien is released and repayment history improves the next offer.

## Components
1. Splitter contract — permissionless `split()`, outstanding-balance tracking.
2. Lien registry contract — public encumbrance record.
3. Lender pool — USDC for advances; idle balance into USYC.
4. Underwriting agent — size, sweep %, term, rationale.
5. Monitoring agent — continue / shrink / freeze / default.
6. Decision log — append-only, inputs + reasoning.
7. Seller dashboard.
8. Public lien explorer.

## Key risks
1. Diversion (payTo switch) — monitor live 402s, public lien + default record, small advances, optional stake.
2. Wash trading — distinct payers, wallet age, funding source / circular flows, concentration, timing.
3. Double financing — lien registry.
4. Volatility — percentage sweep; track expected vs actual pace.

## Scope
Must: Splitter, lien registry, underwriting agent w/ logged rationale, payTo monitor that freezes, one real seller through full loop, 3-min video.
Nice: USYC idle capital, wash-trade rejection demo, public lien explorer, Nanopayments receivables mode.
Cut: multi-lender marketplace, governance, tokens, cross-chain.

## Video outline (<3 min)
Problem (20s) → connect + offer w/ reasoning (40s) → accept, payTo switch, lien public (30s) → live calls + sweeps (30s) → payTo diversion caught + freeze (30s) → wash-trader rejected (20s) → numbers (10s).
