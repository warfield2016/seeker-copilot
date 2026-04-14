/**
 * Jupiter Swap Service — monetization-enabled token swaps on Solana.
 *
 * Integrates Jupiter V6 Quote API with platformFeeBps for revenue:
 *  - 25 bps (0.25%) platform fee per swap
 *  - 70% cheaper than Phantom (85 bps)
 *  - Fee collected to pre-initialized SWAP_FEE_ACCOUNT
 *
 * Architecture:
 *  - getQuote(): fetches price quote from Jupiter
 *  - buildSwapTransaction(): builds serialized tx via Jupiter swap endpoint
 *  - executeSwap(): signs & sends via MWA (Seed Vault)
 *  - trackSwap(): POSTs to backend /api/metrics/swap for revenue tracking
 *
 * No SDK dependency — direct HTTPS to Jupiter V6 API keeps bundle small.
 */

import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  API_BASE_URL,
  JUPITER_QUOTE_API,
  SOLANA_CLUSTER,
  SWAP_DEFAULT_SLIPPAGE_BPS,
  SWAP_FEE_ACCOUNT,
  SWAP_PLATFORM_FEE_BPS,
} from "../config/constants";

const QUOTE_TIMEOUT_MS = 10_000;
const SWAP_BUILD_TIMEOUT_MS = 15_000;

// ── Types ───────────────────────────────────────────────────────────────────

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;        // raw units (lamports or token base units)
  outAmount: string;       // raw units
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  platformFee?: { amount: string; feeBps: number };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;       // DEX name (e.g., "Raydium", "Orca", "Meteora")
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export interface SwapQuoteParams {
  inputMint: string;
  outputMint: string;
  /** Input amount in raw units (lamports for SOL, base units for SPL tokens) */
  amount: number;
  /** Slippage tolerance in basis points (50 = 0.5%). Defaults to SWAP_DEFAULT_SLIPPAGE_BPS */
  slippageBps?: number;
}

export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  inputMint: string;
  outputMint: string;
  platformFeeAmount: number;
  priceImpactPct: number;
  routeLabels: string[];
}

// ── Fetch with timeout ──────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = QUOTE_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Quote Fetching ──────────────────────────────────────────────────────────

/**
 * Fetch a Jupiter quote for a swap. Applies platformFeeBps if SWAP_FEE_ACCOUNT is configured.
 */
export async function getQuote(params: SwapQuoteParams): Promise<JupiterQuote> {
  const slippage = params.slippageBps ?? SWAP_DEFAULT_SLIPPAGE_BPS;
  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(Math.floor(params.amount)),
    slippageBps: String(slippage),
    swapMode: "ExactIn",
    onlyDirectRoutes: "false",
    asLegacyTransaction: "false",
  });

  // Only include platformFeeBps when a fee account is configured.
  // Jupiter requires a matching feeAccount in the swap request — don't charge if we can't collect.
  if (SWAP_FEE_ACCOUNT) {
    query.set("platformFeeBps", String(SWAP_PLATFORM_FEE_BPS));
  }

  const url = `${JUPITER_QUOTE_API}/quote?${query.toString()}`;
  const resp = await fetchWithTimeout(url);

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Jupiter quote failed (${resp.status}): ${body.slice(0, 200)}`);
  }

  const quote = (await resp.json()) as JupiterQuote;
  if (!quote.outAmount || quote.outAmount === "0") {
    throw new Error("No route found for this swap. Try a different amount or token pair.");
  }
  return quote;
}

// ── Swap Transaction Building ───────────────────────────────────────────────

interface SwapBuildResponse {
  swapTransaction: string;    // base64-encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

/**
 * Request Jupiter to build the swap transaction.
 * Returns a base64-encoded VersionedTransaction ready to sign.
 */
async function buildSwapTransaction(quote: JupiterQuote, userPublicKey: string): Promise<SwapBuildResponse> {
  const body: Record<string, unknown> = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: "auto",
  };
  if (SWAP_FEE_ACCOUNT) {
    body.feeAccount = SWAP_FEE_ACCOUNT;
  }

  const resp = await fetchWithTimeout(
    `${JUPITER_QUOTE_API}/swap`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    SWAP_BUILD_TIMEOUT_MS,
  );

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Swap tx build failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  return (await resp.json()) as SwapBuildResponse;
}

// ── Swap Execution ──────────────────────────────────────────────────────────

/**
 * Execute a swap end-to-end: build tx → sign via MWA → return signature.
 * Caller provides the pre-fetched quote so the UI can show confirmation first.
 */
export async function executeSwap(quote: JupiterQuote, userPublicKey: string): Promise<SwapResult> {
  // Step 1: Ask Jupiter to build the transaction (includes routing, fee account, priority fee)
  const { swapTransaction } = await buildSwapTransaction(quote, userPublicKey);

  // Step 2: Deserialize the VersionedTransaction
  const txBytes = Buffer.from(swapTransaction, "base64");
  const versionedTx = VersionedTransaction.deserialize(txBytes);

  // Step 3: Sign + send via MWA (Seed Vault on Seeker)
  const signatures = await transact(async (wallet: Web3MobileWallet) => {
    const result = await wallet.signAndSendTransactions({
      transactions: [versionedTx],
    });
    return result;
  });

  const signature = Array.isArray(signatures) && signatures.length > 0
    ? bytesToBase58Signature(signatures[0])
    : "";

  if (!signature) {
    throw new Error("Swap signed but no signature returned");
  }

  const result: SwapResult = {
    signature,
    inputAmount: Number(quote.inAmount),
    outputAmount: Number(quote.outAmount),
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    platformFeeAmount: Number(quote.platformFee?.amount ?? 0),
    priceImpactPct: Number(quote.priceImpactPct),
    routeLabels: Array.from(new Set(quote.routePlan.map((r) => r.swapInfo.label))),
  };

  // Step 4: Fire-and-forget revenue tracking (non-blocking)
  trackSwap(result).catch(() => { /* tracking failures must not break the UX */ });

  return result;
}

// ── Signature Utilities ─────────────────────────────────────────────────────

/** Convert raw signature bytes (Uint8Array or number[]) to base58 string */
function bytesToBase58Signature(bytes: Uint8Array | number[] | any): string {
  // signAndSendTransactions returns Base64-encoded strings in MWA v2 protocol
  if (typeof bytes === "string") {
    // Might be base64 — decode to bytes, then encode as base58
    try {
      const raw = Buffer.from(bytes, "base64");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bs58 = require("bs58");
      return bs58.default?.encode?.(raw) ?? bs58.encode?.(raw) ?? bytes;
    } catch {
      return bytes;
    }
  }
  if (bytes instanceof Uint8Array || Array.isArray(bytes)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bs58 = require("bs58");
      const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
      return bs58.default?.encode?.(arr) ?? bs58.encode?.(arr) ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

// ── Revenue Tracking ────────────────────────────────────────────────────────

/**
 * Notify backend of a successful swap for revenue metrics.
 * Non-critical — failures are silently swallowed.
 */
async function trackSwap(result: SwapResult): Promise<void> {
  try {
    await fetchWithTimeout(
      `${API_BASE_URL}/api/metrics/swap`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: result.signature,
          input_mint: result.inputMint,
          output_mint: result.outputMint,
          input_amount: result.inputAmount,
          output_amount: result.outputAmount,
          platform_fee_amount: result.platformFeeAmount,
          price_impact_pct: result.priceImpactPct,
          routes: result.routeLabels,
        }),
      },
      5_000,
    );
  } catch {
    // non-critical
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a human-readable token amount (e.g., 0.1 SOL) to raw units for Jupiter (e.g., 100000000 lamports).
 * For SOL, decimals=9. For most SPL tokens, check the token's decimals field.
 */
export function toRawAmount(amount: number, decimals: number): number {
  return Math.floor(amount * Math.pow(10, decimals));
}

/** Inverse of toRawAmount: raw units → human-readable */
export function fromRawAmount(raw: string | number, decimals: number): number {
  return Number(raw) / Math.pow(10, decimals);
}

/**
 * Compute the effective rate for a quote (output per input).
 * Useful for display: "1 SOL = 4983.20 SKR"
 */
export function getEffectiveRate(quote: JupiterQuote, inputDecimals: number, outputDecimals: number): number {
  const inAmt = fromRawAmount(quote.inAmount, inputDecimals);
  const outAmt = fromRawAmount(quote.outAmount, outputDecimals);
  return inAmt === 0 ? 0 : outAmt / inAmt;
}

/**
 * Calculate the platform fee in human-readable output token units.
 * The fee is included in the quote's platformFee field when SWAP_FEE_ACCOUNT is configured.
 */
export function getPlatformFeeAmount(quote: JupiterQuote, outputDecimals: number): number {
  if (!quote.platformFee) return 0;
  return fromRawAmount(quote.platformFee.amount, outputDecimals);
}
