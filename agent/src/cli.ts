// Horos operator CLI.
//   underwrite <seller> <endpoint>   run the underwriting agent
//   accept <offerId>                 seller accepts: deploy their splitter
//   fund <offerId> [waitSec]         verify payTo on the live endpoint, then disburse
//   offers                           list offers
//   monitor [--force]                one monitoring tick
//   treasury [--force]               one treasury tick
//   loop [intervalSec]               run monitor + treasury forever
//   divert <address> | restore       (demo) local seller sets/clears a payTo override
import type { Address } from "viem";
import { underwrite } from "./underwriter.js";
import { acceptOffer, fundOffer } from "./lifecycle.js";
import { loop, monitorTick, treasuryTick } from "./monitor.js";
import { readState, writeState } from "./store.js";

const [cmd, ...args] = process.argv.slice(2);
const force = args.includes("--force");
const out = (v: unknown) => console.log(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));

switch (cmd) {
  case "underwrite": {
    const r = await underwrite(args[0] as Address, args[1]);
    out({ offer: r.offer, guardrailNotes: r.guardrailNotes, anchorTx: r.anchorTx });
    break;
  }
  case "accept":
    out(await acceptOffer(args[0]));
    break;
  case "fund":
    out(await fundOffer(args[0], { waitSec: Number(args[1] ?? 120) }));
    break;
  case "offers":
    out(readState("offers", []));
    break;
  case "monitor":
    out(await monitorTick({ force }));
    break;
  case "treasury":
    out(await treasuryTick({ force }));
    break;
  case "loop":
    await loop(Number(args[0] ?? 30));
    break;
  case "divert":
    writeState(`seller-${process.env.SELLER_NAME ?? "horos-api"}`, { payTo: args[0] });
    console.log("seller payTo override ->", args[0]);
    break;
  case "restore":
    writeState(`seller-${process.env.SELLER_NAME ?? "horos-api"}`, {});
    console.log("seller payTo override cleared");
    break;
  default:
    console.log("commands: underwrite accept fund offers monitor treasury loop divert restore");
}
