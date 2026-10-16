// Guard for fetching seller-supplied URLs from the hosted API: public http(s) on standard ports, and every address the
// name resolves to must be public. (A DNS answer that changes between this check and the fetch is not covered.)
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UrlError extends Error {}

function v4Private(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isPrivateIp(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(s) === 4) return v4Private(s);
  if (s === "::" || s === "::1") return true;
  if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s)) return true;
  const mapped = s.match(/^::ffff:(.+)$/);
  if (mapped) {
    const rest = mapped[1];
    if (isIP(rest) === 4) return v4Private(rest);
    const hex = rest.split(":");
    if (hex.length === 2) {
      const n = (parseInt(hex[0], 16) << 16) | parseInt(hex[1], 16);
      return v4Private([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
    }
    return true;
  }
  return false;
}

type Resolve = (host: string) => Promise<string[]>;
const dnsResolve: Resolve = async (h) => (await lookup(h, { all: true })).map((r) => r.address);

export async function checkPublicUrl(url: string, resolve: Resolve = dnsResolve) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new UrlError("That is not a valid URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new UrlError("Use an https:// endpoint URL.");
  if (u.port && u.port !== "443" && u.port !== "80") throw new UrlError("Use your public endpoint on the standard port (443).");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new UrlError("Use your public endpoint URL.");
    return;
  }
  let addrs: string[] = [];
  try {
    addrs = await resolve(host);
  } catch {}
  if (!addrs.length) throw new UrlError("That hostname does not resolve.");
  if (addrs.some(isPrivateIp)) throw new UrlError("Use your public endpoint URL.");
}
