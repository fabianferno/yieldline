import * as circleSdk from "@circle-fin/developer-controlled-wallets";
// Works whether the runtime resolves the SDK's ESM build (named export) or its CJS build (under `default`).
const sdk = circleSdk as typeof circleSdk & { default?: typeof circleSdk };
const initiateDeveloperControlledWalletsClient =
  sdk.initiateDeveloperControlledWalletsClient ?? sdk.default!.initiateDeveloperControlledWalletsClient;
import type { Address } from "viem";
import { env, publicClient } from "./config.js";

export const circle = initiateDeveloperControlledWalletsClient({
  apiKey: env("CIRCLE_API_KEY"),
  entitySecret: env("CIRCLE_ENTITY_SECRET"),
});

const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

const DOMAIN_FIELDS: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

/** x402 ClientEvmSigner backed by a Circle developer-controlled wallet (EIP-712 signing via Circle API). */
export function circleSigner(walletId: string, address: Address) {
  return {
    address,
    async signTypedData(td: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) {
      const EIP712Domain = Object.keys(td.domain)
        .filter((k) => td.domain[k] !== undefined)
        .map((k) => ({ name: k, type: DOMAIN_FIELDS[k] }));
      const res = await circle.signTypedData({
        walletId,
        data: json({ ...td, types: { EIP712Domain, ...td.types } }),
      });
      return res.data!.signature as `0x${string}`;
    },
  };
}

/** Execute a contract call from a Circle wallet and wait for it to land on chain. */
export async function circleExecute(opts: {
  walletId: string;
  contractAddress: Address;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  refId?: string;
}): Promise<{ id: string; txHash: `0x${string}` }> {
  const res = await circle.createContractExecutionTransaction({
    walletId: opts.walletId,
    contractAddress: opts.contractAddress,
    abiFunctionSignature: opts.abiFunctionSignature,
    abiParameters: JSON.parse(json(opts.abiParameters)),
    refId: opts.refId,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = res.data!.id;
  for (let i = 0; i < 90; i++) {
    const t = (await circle.getTransaction({ id })).data!.transaction!;
    if (t.state === "COMPLETE" || t.state === "CONFIRMED") {
      const txHash = t.txHash as `0x${string}`;
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { id, txHash };
    }
    if (["FAILED", "CANCELLED", "DENIED"].includes(t.state!)) {
      throw new Error(`circle tx ${id} ${t.state}: ${t.errorReason ?? ""} ${t.errorDetails ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`circle tx ${id} timed out`);
}
