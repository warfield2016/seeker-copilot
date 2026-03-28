/**
 * Price Service — 24h price change enrichment
 *
 * Priority order:
 *  1. Birdeye multi_price API (if BIRDEYE_API_KEY is set — get a free key at birdeye.so)
 *  2. CoinGecko free API (no key, covers major Solana tokens)
 *
 * Used to enrich token 24h change data after Helius DAS fetch
 * (DAS API does not return 24h % change).
 */

import { BIRDEYE_API_URL, BIRDEYE_API_KEY, COINGECKO_API } from "../config/constants";

const FETCH_TIMEOUT_MS = 8000;

// CoinGecko IDs for common Solana tokens
const COINGECKO_ID_MAP: Record<string, string> = {
  SOL:     "solana",
  JUP:     "jupiter-exchange-solana",
  JTO:     "jito-governance-token",
  BONK:    "bonk",
  WIF:     "dogwifcoin",
  POPCAT:  "popcat",
  PYTH:    "pyth-network",
  RAY:     "raydium",
  MSOL:    "msol",
  JITOSOL: "jito-staked-sol",
  RENDER:  "render-token",
  HNT:     "helium",
  MOBILE:  "helium-mobile",
  RNDR:    "render-token",
  USDC:    "usd-coin",
  USDT:    "tether",
};

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch 24h price changes via Birdeye multi_price endpoint.
 * Requires EXPO_PUBLIC_BIRDEYE_KEY env var.
 */
async function fetchBirdeyeChanges(
  mints: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!BIRDEYE_API_KEY || mints.length === 0) return result;

  try {
    const addressList = mints.join(",");
    const response = await fetchWithTimeout(
      `${BIRDEYE_API_URL}/defi/multi_price?list_address=${addressList}`,
      {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
          "x-chain": "solana",
        },
      }
    );
    if (!response.ok) return result;
    const data = await response.json();

    const tokenData = data?.data ?? {};
    for (const mint of mints) {
      const item = tokenData[mint];
      if (item && typeof item.priceChange24h === "number") {
        result.set(mint, item.priceChange24h);
      }
    }
  } catch {
    // Non-fatal — fallback to CoinGecko
  }
  return result;
}

/**
 * Fetch 24h price changes from CoinGecko free API.
 * Covers major Solana tokens. No API key needed.
 */
async function fetchCoinGeckoChanges(
  symbols: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // Map symbols → CoinGecko IDs
  const symbolToId: Record<string, string> = {};
  for (const sym of symbols) {
    const id = COINGECKO_ID_MAP[sym.toUpperCase()];
    if (id) symbolToId[sym.toUpperCase()] = id;
  }

  const ids = Object.values(symbolToId);
  if (ids.length === 0) return result;

  try {
    const idsParam = [...new Set(ids)].join(",");
    const url = `${COINGECKO_API}/simple/price?ids=${idsParam}&vs_currencies=usd&include_24hr_change=true`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return result;
    const data = await response.json();

    // Map back to symbol
    for (const [sym, cgId] of Object.entries(symbolToId)) {
      const change = data?.[cgId]?.usd_24h_change;
      if (typeof change === "number") {
        result.set(sym, parseFloat(change.toFixed(2)));
      }
    }
  } catch {
    // Non-fatal
  }
  return result;
}

/**
 * Enrich an array of token objects with real 24h price changes.
 * Mutates in place, returns the same array.
 *
 * Uses Birdeye (by mint address) if API key available,
 * otherwise falls back to CoinGecko (by symbol) for known tokens.
 */
export async function enrichWith24hChanges<T extends {
  mint: string;
  symbol: string;
  change24h: number;
}>(tokens: T[]): Promise<T[]> {
  if (tokens.length === 0) return tokens;

  try {
    let changeMap: Map<string, number>;

    if (BIRDEYE_API_KEY) {
      // Birdeye: keyed by mint address
      const mints = tokens.map((t) => t.mint);
      const birdeyeMap = await fetchBirdeyeChanges(mints);
      changeMap = new Map(
        [...birdeyeMap.entries()].map(([mint, change]) => [mint, change])
      );
      // Apply by mint
      for (const token of tokens) {
        const change = changeMap.get(token.mint);
        if (typeof change === "number") token.change24h = change;
      }
    } else {
      // CoinGecko fallback: keyed by symbol
      const symbols = tokens.map((t) => t.symbol);
      const cgMap = await fetchCoinGeckoChanges(symbols);
      for (const token of tokens) {
        const change = cgMap.get(token.symbol.toUpperCase());
        if (typeof change === "number") token.change24h = change;
      }
    }
  } catch {
    // Non-fatal — tokens keep their existing change24h (0)
  }

  return tokens;
}
