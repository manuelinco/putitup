/**
 * TON on-chain payout service.
 *
 * Requires two environment secrets:
 *   TON_TREASURY_MNEMONIC  — 24-word BIP39 mnemonic of the treasury wallet
 *   TON_ENDPOINT           — (optional) custom RPC, defaults to mainnet
 *
 * If TON_TREASURY_MNEMONIC is not set the service runs in dry-run mode:
 * rewards are recorded in the DB ledger but no blockchain transaction is sent.
 */

import { logger } from "./logger";

let tonModule: typeof import("@ton/ton") | null = null;
let cryptoModule: typeof import("@ton/crypto") | null = null;

async function getTon() {
  if (!tonModule) tonModule = await import("@ton/ton");
  if (!cryptoModule) cryptoModule = await import("@ton/crypto");
  return { ton: tonModule, crypto: cryptoModule };
}

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  dryRun: boolean;
  error?: string;
}

// Convert TON float → nanoTON bigint
function toNano(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000_000));
}

// Cache the wallet so we don't re-derive keys on every call
let walletCache: { sender: unknown; contract: unknown; client: unknown } | null = null;

async function getWallet() {
  if (walletCache) return walletCache;

  const mnemonic = process.env["TON_TREASURY_MNEMONIC"];
  if (!mnemonic) return null;

  const { ton, crypto } = await getTon();
  const { TonClient, WalletContractV4, internal } = ton;
  const { mnemonicToPrivateKey } = crypto;

  const endpoint = process.env["TON_ENDPOINT"] ?? "https://toncenter.com/api/v2/jsonRPC";
  const apiKey = process.env["TON_CENTER_API_KEY"];

  const client = new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });
  const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
  const contract = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const opened = client.open(contract);
  const sender = opened.sender(keyPair.secretKey);

  walletCache = { sender, contract: opened, client };
  return walletCache;
}

export async function sendTonPayout(
  toAddress: string,
  amountTon: number,
  comment?: string,
): Promise<PayoutResult> {
  const mnemonic = process.env["TON_TREASURY_MNEMONIC"];

  if (!mnemonic) {
    logger.info({ toAddress, amountTon }, "TON dry-run: treasury mnemonic not set");
    return { success: true, dryRun: true };
  }

  try {
    const { ton } = await getTon();
    const { Address, toNano: toNanoLib, comment: commentCell } = ton;

    const wallet = await getWallet();
    if (!wallet) return { success: false, dryRun: false, error: "Could not init wallet" };

    const { sender } = wallet as { sender: { send: (args: unknown) => Promise<void> } };

    // Build message
    const msgBody = comment ? commentCell(comment) : undefined;
    const nanoAmount = toNano(amountTon);

    await sender.send({
      to: Address.parse(toAddress),
      value: nanoAmount,
      body: msgBody,
    });

    logger.info({ toAddress, amountTon, nanoAmount: nanoAmount.toString() }, "TON payout sent");
    return { success: true, dryRun: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, toAddress, amountTon }, "TON payout failed");
    return { success: false, dryRun: false, error: msg };
  }
}
