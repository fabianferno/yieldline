import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

export const ROOT = resolve(import.meta.dirname, "../..");
loadEnv({ path: resolve(ROOT, ".env"), quiet: true });

export const env = (k: string, fallback?: string): string => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${k}`);
  return v;
};

export const NETWORK = "eip155:5042002" as const;
export const RPC_URL = env("ARC_RPC_URL", "https://rpc.testnet.arc.io");
export const EXPLORER = env("EXPLORER_URL", "https://explorer.testnet.arc.io");

const deployments = JSON.parse(readFileSync(resolve(ROOT, "deployments/arc-testnet.json"), "utf8"));
export const ADDR = {
  usdc: deployments.usdc as Address,
  registry: deployments.lienRegistry as Address,
  pool: deployments.lenderPool as Address,
  teller: deployments.mockUsycTeller as Address,
  admin: deployments.admin as Address,
  wallets: deployments.circleWallets as {
    underwritingAgent: Address;
    monitorAgent: Address;
    seller: Address;
    buyers: Address[];
  },
};

export const circleWallets = (): { name: string; id: string; address: Address }[] =>
  JSON.parse(readFileSync(resolve(ROOT, ".circle/wallets.json"), "utf8")).wallets;

export const circleWallet = (name: string) => {
  const w = circleWallets().find((w) => w.name === name);
  if (!w) throw new Error(`no circle wallet ${name}`);
  return w;
};

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

export const operatorAccount = privateKeyToAccount(env("DEPLOYER_PRIVATE_KEY") as `0x${string}`);
export const operatorClient = createWalletClient({
  account: operatorAccount,
  chain: arcTestnet,
  transport: http(RPC_URL),
});

export const usdc = (n: bigint) => Number(n) / 1e6;
export const toUnits = (n: number) => BigInt(Math.round(n * 1e6));
