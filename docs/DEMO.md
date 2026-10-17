# Demo runbook + video script (< 3 min)

## Before recording

```bash
cd agent
pnpm api                                   # :4021 facilitator + Yieldline Lien Oracle + read API
pnpm buy 20000 http://localhost:4021 extbuyer- 4000   # arm's-length traffic (faucet-funded Circle wallets)
cd ../web && NEXT_PUBLIC_YIELDLINE_API=http://localhost:4021 pnpm dev -p 4310
```

Seller under test: `0xb6cb2d219abbf11ce61525d35b49513d9a2fa80f` (Yieldline Lien Oracle, our own x402 business).
Wash seller: `0x43f10820df70545f0b308ed014e5b5e5b7f28f28` (endpoint on :4022).

## Script

| t | Scene | Screen | Line |
|---|---|---|---|
| 0:00 | Problem | Arc explorer: stream of `transferWithAuthorization` receipts into the seller | "x402 sellers have revenue that is on-chain, per call, in real time. Nobody lends against it." |
| 0:20 | Underwrite | terminal `pnpm yieldline underwrite <seller> <endpoint>` → dashboard decision card | "The underwriting agent reads the receipts, checks every payer, checks the public lien registry and the pool, probes the live 402, and proposes terms, with its reasons. Published on Arc." |
| 1:00 | Accept + verify + fund | `pnpm yieldline accept <id>` → oracle `/oracle` shows payTo = splitter → `pnpm yieldline fund <id>` | "The seller points payTo at a splitter. The agent refuses to fund until it sees that on the endpoint buyers actually hit. Then USDC moves, and the lien appears in the public registry." |
| 1:30 | Sweeps | dashboard lien progress bar moving; explorer `Split` events | "Every paid call lands in the splitter. A slice goes to the pool until the cap; the rest goes to the seller, automatically." |
| 2:00 | Diversion | `pnpm yieldline divert <sellerWallet>` → `pnpm yieldline monitor` → lien turns Frozen; buyer call to own wallet refused by facilitator | "The seller tries to route revenue back to themselves. The monitor catches the payTo change and freezes the line in public; our facilitator refuses to settle to the seller while the lien is live." |
| 2:30 | Wash trader | `/seller/0x43f1…` payer forensics, reject card | "A seller paying itself through wallets it funded is rejected, with the evidence." |
| 2:50 | Numbers | dashboard metric row | advanced, repaid via sweeps, decisions, escalated, rejected, frozen. |
