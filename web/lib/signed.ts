// Signed requests to the Yieldline API. The format mirrors agent/src/auth.ts: one passkey signature per action.
import { API } from "./api";

type Sign = (message: string) => Promise<`0x${string}`>;

export function buildMessage(f: { action: string; subject: string; account: string; nonce: string; expires: string }) {
  return ["Yieldline request", `action: ${f.action}`, `subject: ${f.subject}`, `account: ${f.account}`, `nonce: ${f.nonce}`, `expires: ${f.expires}`].join("\n");
}

export async function signedPost<T>(
  path: string,
  { action, subject, account, sign }: { action: string; subject: string; account: string; sign: Sign },
  body: Record<string, unknown> = {},
): Promise<T> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  const message = buildMessage({ action, subject, account, nonce, expires: new Date(Date.now() + 10 * 60_000).toISOString() });
  const signature = await sign(message);
  return post<T>(path, { ...body, message, signature });
}

export async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok || j.error) throw Object.assign(new Error(j.error ?? `HTTP ${r.status}`), { data: j });
  return j as T;
}
