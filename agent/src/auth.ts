// Signed requests from passkey accounts. No sessions: every request that changes something carries a short
// plain-text message signed by the account, with a one-time nonce and a near expiry. Smart-account signatures
// verify through ERC-1271 (deployed) or ERC-6492 (not yet deployed) via viem's publicClient.verifyMessage.
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { publicClient } from "./config.js";
import { kv } from "./kv.js";

export type Fields = { action: string; subject: string; account: string; nonce: string; expires: string };

const HEADER = "Horos request";
const KEYS = ["action", "subject", "account", "nonce", "expires"] as const;
const MAX_AHEAD_MS = 30 * 60_000;

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function buildMessage(f: Fields) {
  return [HEADER, ...KEYS.map((k) => `${k}: ${f[k]}`)].join("\n");
}

export function parseMessage(m: string): Fields {
  const lines = m.split("\n");
  if (lines[0] !== HEADER) throw new AuthError(401, "not a Horos request");
  const out: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(": ");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 2);
  }
  for (const k of KEYS) if (!out[k]) throw new AuthError(401, `missing ${k}`);
  return out as Fields;
}

type Verify = (a: { address: Address; message: string; signature: Hex }) => Promise<boolean>;
const chainVerify: Verify = (a) => publicClient.verifyMessage(a);

/** Returns the verified account, or throws AuthError(401). */
export async function verifyRequest(
  req: { message?: string; signature?: string },
  action: string,
  subject?: string,
  verify: Verify = chainVerify,
): Promise<Address> {
  if (!req.message || !req.signature) throw new AuthError(401, "signed message required");
  const f = parseMessage(req.message);
  if (f.action !== action) throw new AuthError(401, `signed for "${f.action}", not "${action}"`);
  if (subject !== undefined && f.subject !== subject) throw new AuthError(401, "signed for a different subject");
  if (!isAddress(f.account)) throw new AuthError(401, "bad account");
  const exp = Date.parse(f.expires);
  if (!Number.isFinite(exp) || exp < Date.now()) throw new AuthError(401, "request expired; sign again");
  if (exp > Date.now() + MAX_AHEAD_MS) throw new AuthError(401, "expiry too far ahead");

  const account = getAddress(f.account);
  let ok = false;
  try {
    ok = await verify({ address: account, message: req.message, signature: req.signature as Hex });
  } catch {
    ok = false;
  }
  if (!ok) throw new AuthError(401, "signature does not match the account");
  // Consume the nonce only after the signature checks out, so garbage cannot burn real nonces.
  const fresh = await kv.set(`nonce:${account}:${f.nonce}`, 1, { nx: true, exSec: Math.ceil(MAX_AHEAD_MS / 1000) });
  if (!fresh) throw new AuthError(401, "request already used");
  return account;
}
