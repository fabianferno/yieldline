"use client";
// Passkey wallets through Circle Modular Wallets: a WebAuthn passkey owns a Circle smart account (MSCA) on Arc
// testnet; transactions go out as user operations through Circle's bundler (gas sponsored by Circle's paymaster
// where available, otherwise paid in USDC from the account).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, erc20Abi, http, type Address, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { createBundlerClient, toWebAuthnAccount, type WebAuthnAccount } from "viem/account-abstraction";

export const CLIENT_KEY = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY ?? "";
export const CLIENT_URL = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL ?? "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
export const USDC: Address = "0x3600000000000000000000000000000000000000";
export const FAUCET = "https://faucet.circle.com";

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

export type Call = { to: Address; data: Hex; value?: bigint };
type Status = "unconfigured" | "idle" | "connecting" | "ready" | "error";

type Wallet = {
  status: Status;
  error?: string;
  address?: Address;
  username?: string;
  usdc?: number;
  connect(mode: "register" | "login", username?: string): Promise<void>;
  disconnect(): void;
  send(calls: Call[]): Promise<{ userOpHash: Hex; txHash: Hex }>;
  signMessage(message: string): Promise<Hex>;
  refresh(): Promise<void>;
};

const Ctx = createContext<Wallet | null>(null);
const STORE = "horos.passkey";

type Stored = { id: string; publicKey: Hex; username?: string };

async function sdk() {
  return import("@circle-fin/modular-wallets-core");
}

async function accountFor(cred: Stored) {
  const { toCircleSmartAccount, toModularTransport } = await sdk();
  const transport = toModularTransport(`${CLIENT_URL}/arcTestnet`, CLIENT_KEY);
  const client = createPublicClient({ chain: arcTestnet, transport });
  const owner: WebAuthnAccount = toWebAuthnAccount({ credential: { id: cred.id, publicKey: cred.publicKey } });
  const account = await toCircleSmartAccount({ client, owner });
  const bundler = createBundlerClient({ account, chain: arcTestnet, transport });
  return { account, bundler };
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(CLIENT_KEY ? "idle" : "unconfigured");
  const [error, setError] = useState<string>();
  const [cred, setCred] = useState<Stored | null>(null);
  const [usdc, setUsdc] = useState<number>();
  const ctx = useRef<Awaited<ReturnType<typeof accountFor>> | null>(null);
  const [address, setAddress] = useState<Address>();

  const load = useCallback(async (c: Stored) => {
    setStatus("connecting");
    try {
      ctx.current = await accountFor(c);
      setCred(c);
      setAddress(ctx.current.account.address);
      setStatus("ready");
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
      setStatus("error");
    }
  }, []);

  // Restore the last passkey account on load (no prompt: signing is only needed for transactions).
  useEffect(() => {
    if (!CLIENT_KEY) return;
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) load(JSON.parse(raw));
    } catch {}
  }, [load]);

  const refresh = useCallback(async () => {
    if (!address) return;
    const bal = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    setUsdc(Number(bal) / 1e6);
  }, [address]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const connect = useCallback(
    async (mode: "register" | "login", username?: string) => {
      if (!CLIENT_KEY) return;
      setError(undefined);
      setStatus("connecting");
      try {
        const { toPasskeyTransport, toWebAuthnCredential, WebAuthnMode } = await sdk();
        const credential = await toWebAuthnCredential({
          transport: toPasskeyTransport(CLIENT_URL, CLIENT_KEY),
          mode: mode === "register" ? WebAuthnMode.Register : WebAuthnMode.Login,
          ...(mode === "register" ? { username: username || `horos-${Date.now().toString(36)}` } : {}),
        } as any);
        const stored: Stored = { id: credential.id, publicKey: credential.publicKey, username };
        try {
          localStorage.setItem(STORE, JSON.stringify(stored));
        } catch {}
        await load(stored);
      } catch (e: any) {
        setError(e?.name === "NotAllowedError" ? "Passkey prompt was dismissed." : (e?.shortMessage ?? e?.message ?? String(e)));
        setStatus("error");
      }
    },
    [load],
  );

  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    ctx.current = null;
    setCred(null);
    setAddress(undefined);
    setUsdc(undefined);
    setStatus(CLIENT_KEY ? "idle" : "unconfigured");
  }, []);

  const send = useCallback(async (calls: Call[]) => {
    const c = ctx.current;
    if (!c) throw new Error("Connect a wallet first.");
    let userOpHash: Hex;
    try {
      userOpHash = await c.bundler.sendUserOperation({ calls, paymaster: true });
    } catch (e: any) {
      // No sponsorship available: pay gas in USDC from the account.
      if (/paymaster|sponsor/i.test(e?.message ?? "")) userOpHash = await c.bundler.sendUserOperation({ calls });
      else throw e;
    }
    const receipt = await c.bundler.waitForUserOperationReceipt({ hash: userOpHash });
    if (!receipt.success) throw new Error(receipt.reason || "The transaction reverted.");
    return { userOpHash, txHash: receipt.receipt.transactionHash };
  }, []);

  const signMessage = useCallback(async (message: string) => {
    const c = ctx.current;
    if (!c) throw new Error("Connect a wallet first.");
    return c.account.signMessage({ message });
  }, []);

  const value = useMemo<Wallet>(
    () => ({ status, error, address, username: cred?.username, usdc, connect, disconnect, send, signMessage, refresh }),
    [status, error, address, cred, usdc, connect, disconnect, send, signMessage, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const w = useContext(Ctx);
  if (!w) throw new Error("useWallet outside WalletProvider");
  return w;
}
