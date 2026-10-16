# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience was left to the designer to choose (user said "choose the best yourself"). The choice:

- **Near term: hackathon judges** (Tameion Agents Hackathon, Canteen × Circle; deadline Oct 17 2026, 11:59 PM ET). Judges have about a minute per project, so they need to see quickly that the loop is real: real USDC moving, agents making decisions and giving reasons, and every claim provable on chain. Judging weights: agentic sophistication 30%, traction 30% (real USDC flows; synthetic doesn't count), use of Circle tools 20%, innovation 20%.
- **Long term, the product's real users:**
  - **x402 sellers:** businesses earning per-call USDC through x402. They want working capital without a bank, and need to see their credit line, repayment progress and what is pledged.
  - **Lenders / pool LPs:** they put USDC into the pool and need exposure, repayment pace, idle yield and risk at a glance.
  - **Anyone extending credit to an x402 business:** they use the public lien lookup to check whether a seller's revenue is already pledged.
  - **The operator:** the human who approves anything above the auto-approve limit, can override the agent, and alone can mark a default.

## Product Purpose

Revenue-based financing for x402 sellers on Arc testnet.

The loop:
- An underwriting agent (Claude Haiku) reads a seller's proven x402 revenue from Arc and Circle Gateway. It decides whether the revenue is real and offers terms.
- On acceptance, the seller sets `payTo` to a per-seller RevenueSplitter. The pool then advances USDC.
- Every incoming payment splits on arrival: a share goes to the pool until the debt is repaid, and the rest goes to the seller.
- Each advance is a lien in a public LienRegistry, which stops anyone financing the same revenue twice.
- A monitoring agent freezes the line if payTo is diverted.
- A treasury agent parks idle pool cash in USYC.
- Every decision is anchored on chain with its reasoning.

Success means a real seller goes through the full loop and the evidence holds up to anyone checking it.

## Positioning

The collateral is the revenue stream itself, enforced by where payments are routed rather than by a promise. Three things a neighbouring product can't honestly copy without the same machinery:
- The splitter set as `payTo` repays the advance automatically.
- The public lien registry acts as a shared guard against double financing.
- Every agent decision is published with its reasoning and checkable on Arc.

## Operating Context

- **Chain:** Arc testnet, chainId 5042002. Gas is paid in USDC. Explorer: explorer.testnet.arc.io.
- **Payments:** x402 v2 "exact" payments settle on chain. Circle Gateway nanopayments settle in batches, and paid-but-unsettled transfers count as receivables.
- **Circle Developer-Controlled Wallets** hold the agent wallets.
- **Live surfaces:**
  - Dashboard: https://horos-blue.vercel.app (`web/`, Next 15)
  - API and x402 seller/facilitator: https://horos-api.vercel.app (`agent/`)
  - Repo: https://github.com/sirbadenpowell/horos
- **Demo video:** must be under 3 minutes; runbook in `docs/DEMO.md`.

## Capabilities and Constraints

- **Hard limits live in the LenderPool contract, not the prompt:**
  - max advance $10
  - human approval above $5
  - at most 40% of NAV per seller
  - sweep between 5% and 50%
  - maximum term 14 days
  - only a human can mark a default
- **The underwriter refuses wash or related-party revenue,** so scripted test traffic is rejected honestly. The first lien was opened by an **operator override pilot**, and the UI must label it that way.
- **USYC is a mock teller on testnet** (the pool isn't allowlisted for real USYC). Label it "mock" wherever it appears.
- **Terminology:** lien, advance, sweep, splitter, payTo, encumbered / unencumbered, receivables, freeze, override pilot.

## Brand Commitments

- "Horos" is a **working title** and may change. Don't build anything that depends on the name being permanent.
- The ΟΡΟΣ / horos-stone story (Greek boundary stones that marked mortgaged land, i.e. debt recorded in public) is current flavour, not binding.

## Evidence on Hand

All of this is real and on Arc testnet:
- **Lien #1:** a $3 advance on the Horos Lien Oracle seller (0xb6cb…a80f), with a 30% sweep, 5% fee and 7-day term, repaid through sweeps.
- **The rejection behind it:** the agent rejected that seller first (risk 85) before the operator override.
- **Wash seller** 0x43f1…8f28: rejected at risk 95, with seller-funded payers.
- **Market scan** via Circle Gateway: 102 sellers.
- **Real seller** 0xa890…6466 (56 days of history, 14 payers): has a $3 offer outstanding.
- **Treasury:** parked $4.03 in mock USYC.
- **Contracts** (verified on Blockscout):
  - LienRegistry 0xD140…906F
  - LenderPool 0x3655…7506
  - MockUSYCTeller 0x6be9…A4D5

Do not invent testimonials, customers, TVL, APRs beyond the mock teller's 4.5%, or any traction that isn't on chain.

## Product Principles

1. **Proof over claims.** Every number on screen is read from chain or Circle and links to where it can be checked.
2. **Show the reasoning.** An agent decision is shown as verdict, then terms, then reasoning, never as just a number.
3. **Honest labels.** Overrides, mocks and testnet limits are named plainly, including when they weaken the story.
4. **The loop is the product.** Underwrite → advance → sweep → watch → park should be readable at a glance, and the live state of each stage should be visible.
5. **Built for the long term.** Design for real sellers and lenders even though judges are the first audience.
