import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

export const ROOT = resolve(import.meta.dirname, "../..");
if (!process.env.VERCEL) loadEnv({ path: resolve(ROOT, ".env"), quiet: true });

export const env = (k: string, fallback?: string): string => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${k}`);
  return v;
};

export const NETWORK = "eip155:5042002" as const;
export const RPC_URL = env("ARC_RPC_URL", "https://rpc.testnet.arc.io");
export const EXPLORER = env("EXPLORER_URL", "https://explorer.testnet.arc.io");

import { deployments, circleWalletSet } from "./deployments.js";
export { deployments };
export const ADDR = {
  usdc: deployments.usdc as Address,
  registry: deployments.lienRegistry as Address,
  pool: deployments.lenderPool as Address,
  teller: deployments.mockUsycTeller as Address,
  factory: (deployments as any).poolFactory as Address | undefined,
  core: ((deployments as any).corePool ?? deployments.lenderPool) as Address,
  admin: deployments.admin as Address,
  wallets: deployments.circleWallets as {
    underwritingAgent: Address;
    monitorAgent: Address;
    seller: Address;
    buyers: Address[];
  },
};

export const circleWallets = (): { name: string; id: string; address: Address }[] =>
  circleWalletSet.wallets as { name: string; id: string; address: Address }[];

export const circleWallet = (name: string) => {
  const w = circleWallets().find((w) => w.name === name);
  if (!w) throw new Error(`no circle wallet ${name}`);
  return w;
};

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

// Facilitator + keeper signer: a gas-only key, separate from the pool admin.
export const operatorAccount = privateKeyToAccount(
  env("FACILITATOR_PRIVATE_KEY", process.env.DEPLOYER_PRIVATE_KEY) as `0x${string}`,
);
export const operatorClient = createWalletClient({
  account: operatorAccount,
  chain: arcTestnet,
  transport: http(RPC_URL),
});

export const usdc = (n: bigint) => Number(n) / 1e6;
export const toUnits = (n: number) => BigInt(Math.round(n * 1e6));
