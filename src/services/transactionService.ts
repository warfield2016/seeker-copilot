/**
 * Transaction Service — Helius Enhanced Transaction History
 *
 * Uses Helius's Enhanced Transactions API to fetch human-readable
 * transaction history. Returns structured data with type, description,
 * and token transfer info — ready for AI explanations.
 *
 * Docs: https://www.helius.dev/docs/enhanced-transactions-api
 */

import { HELIUS_API_URL, SOLANA_RPC_ENDPOINT } from "../config/constants";

const FETCH_TIMEOUT_MS = 12000;
const MAX_TRANSACTIONS = 20;

// Extract API key from the RPC endpoint URL
function getHeliusApiKey(): string {
  try {
    const url = new URL(SOLANA_RPC_ENDPOINT);
    return url.searchParams.get("api-key") ?? "";
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ParsedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  description: string;
  fee: number;
  source: string;
  tokenTransfers: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    mint: string;
    tokenAmount: number;
  }>;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
}

/**
 * Fetch human-readable transaction history for a wallet.
 * Uses Helius Enhanced Transactions API.
 */
export async function getTransactionHistory(
  walletAddress: string,
  limit: number = MAX_TRANSACTIONS
): Promise<ParsedTransaction[]> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return [];

  try {
    const url = (
      `${HELIUS_API_URL}/transactions`
      + `?api-key=${apiKey}`
      + `&address=${walletAddress}`
      + `&limit=${Math.min(limit, MAX_TRANSACTIONS)}`
      + `&type=SWAP,TRANSFER,NFT_SALE,NFT_MINT,STAKE_SOL,UNSTAKE_SOL`
    );

    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((tx: Record<string, unknown>) => ({
      signature:      (tx.signature as string) ?? "",
      timestamp:      (tx.timestamp as number) ?? 0,
      type:           (tx.type as string) ?? "UNKNOWN",
      description:    (tx.description as string) ?? "",
      fee:            (tx.fee as number) ?? 0,
      source:         (tx.source as string) ?? "",
      tokenTransfers: Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers as ParsedTransaction["tokenTransfers"] : [],
      nativeTransfers: Array.isArray(tx.nativeTransfers) ? tx.nativeTransfers as ParsedTransaction["nativeTransfers"] : [],
    }));
  } catch {
    return [];
  }
}

/**
 * Format transaction list as a compact string for AI context injection.
 */
export function formatTransactionsForAI(
  txs: ParsedTransaction[],
  walletAddress: string
): string {
  if (txs.length === 0) return "No recent transactions found.";

  const lines = txs.slice(0, 10).map((tx) => {
    const date = new Date(tx.timestamp * 1000).toLocaleDateString();
    const desc = tx.description || `${tx.type} transaction`;
    return `[${date}] ${tx.type}: ${desc}`;
  });

  return `Recent wallet activity (${txs.length} transactions):\n` + lines.join("\n");
}
