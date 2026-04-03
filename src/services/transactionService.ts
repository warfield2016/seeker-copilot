/**
 * Transaction Service — fetches transaction history via backend proxy.
 * No API keys in client — all requests go through /api/proxy/rpc.
 */

import { API_BASE_URL } from "../config/constants";

const FETCH_TIMEOUT_MS = 12000;
const MAX_TRANSACTIONS = 20;

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
 * Fetch transaction signatures via backend RPC proxy, then fetch details.
 * No API keys leave the client — everything goes through the backend.
 */
export async function getTransactionHistory(
  walletAddress: string,
  limit: number = MAX_TRANSACTIONS
): Promise<ParsedTransaction[]> {
  try {
    const proxyUrl = `${API_BASE_URL}/api/proxy/rpc`;

    // Step 1: Get recent signatures
    const sigResp = await fetchWithTimeout(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "getSignaturesForAddress",
        params: [walletAddress, { limit: Math.min(limit, MAX_TRANSACTIONS) }],
      }),
    });
    if (!sigResp.ok) return [];
    const sigJson = await sigResp.json();
    const signatures: Array<{ signature: string }> = sigJson.result ?? [];
    if (signatures.length === 0) return [];

    // Step 2: Fetch each transaction's details
    const txPromises = signatures.slice(0, 10).map(async (sig) => {
      try {
        const txResp = await fetchWithTimeout(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "getTransaction",
            params: [sig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
          }),
        });
        if (!txResp.ok) return null;
        const txJson = await txResp.json();
        const tx = txJson.result;
        if (!tx) return null;

        return {
          signature: sig.signature,
          timestamp: tx.blockTime ?? 0,
          type: "TRANSFER",
          description: `Transaction ${sig.signature.slice(0, 8)}...`,
          fee: (tx.meta?.fee ?? 0) / 1e9,
          source: "solana",
          tokenTransfers: [] as ParsedTransaction["tokenTransfers"],
          nativeTransfers: [] as ParsedTransaction["nativeTransfers"],
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(txPromises);
    return results.filter(Boolean) as ParsedTransaction[];
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
