/**
 * Price Service — token prices + 24h change enrichment
 *
 * Jupiter Price API is now auth-gated (2025). Strategy:
 *  1. Birdeye multi_price (if EXPO_PUBLIC_BIRDEYE_KEY set) — all tokens + 24h change
 *  2. CoinGecko free API — covers major Solana tokens, no key needed
 *
 * Also provides price discovery for tokens Helius DAS doesn't price.
 */

import { BIRDEYE_API_URL, BIRDEYE_API_KEY, COINGECKO_API } from "../config/constants";

const FETCH_TIMEOUT_MS = 8000;

// CoinGecko IDs for common Solana tokens — covers >90% of user portfolios
const COINGECKO_ID_MAP: Record<string, string> = {
  SOL:      "solana",
  JUP:      "jupiter-exchange-solana",
  JTO:      "jito-governance-token",
  BONK:     "bonk",
  WIF:      "dogwifcoin",
  POPCAT:   "popcat",
  PYTH:     "pyth-network",
  RAY:      "raydium",
  MSOL:     "msol",
  JITOSOL:  "jito-staked-sol",
  RENDER:   "render-token",
  RNDR:     "render-token",
  HNT:      "helium",
  MOBILE:   "helium-mobile",
  USDC:     "usd-coin",
  USDT:     "tether",
  PYUSD:    "paypal-usd",
  SRM:      "serum",
  ORCA:     "orca",
  MNGO:     "mango-markets",
  SAMO:     "samoyedcoin",
  STEP:     "step-finance",
  FIDA:     "bonfida",
  ATLAS:    "star-atlas",
  POLIS:    "star-atlas-dao",
  GMT:      "stepn",
  GST:      "green-satoshi-token",
  DUST:     "dust-protocol",
  MEANS:    "meanfi",
  SKR:      "solana-mobile",
};

export interface TokenPriceData {
  priceUsd: number;
  change24h: number;
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

/**
 * Fetch prices + 24h changes via Birdeye multi_price.
 * Most comprehensive — covers all Solana tokens by mint address.
 * Requires EXPO_PUBLIC_BIRDEYE_KEY.
 */
async function fetchBirdeyePrices(
  mints: string[]
): Promise<Map<string, TokenPriceData>> {
  const result = new Map<string, TokenPriceData>();
  if (!BIRDEYE_API_KEY || mints.length === 0) return result;

  try {
    const addressList = mints.slice(0, 100).join(",");
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
      if (item && typeof item.value === "number") {
        result.set(mint, {
          priceUsd: item.value,
          change24h: typeof item.priceChange24h === "number" ? parseFloat(item.priceChange24h.toFixed(2)) : 0,
        });
      }
    }
  } catch {
    // Non-fatal — fall through to CoinGecko
  }
  return result;
}

/**
 * Fetch prices + 24h changes from CoinGecko free API.
 * No key required. Covers the top ~30 Solana tokens by market cap.
 */
async function fetchCoinGeckoPrices(
  symbols: string[]
): Promise<Map<string, TokenPriceData>> {
  const result = new Map<string, TokenPriceData>();

  const symbolToId: Record<string, string> = {};
  for (const sym of symbols) {
    const id = COINGECKO_ID_MAP[sym.toUpperCase()];
    if (id) symbolToId[sym.toUpperCase()] = id;
  }

  const ids = [...new Set(Object.values(symbolToId))];
  if (ids.length === 0) return result;

  try {
    const url = (
      `${COINGECKO_API}/simple/price`
      + `?ids=${ids.join(",")}`
      + `&vs_currencies=usd`
      + `&include_24hr_change=true`
    );
    const response = await fetchWithTimeout(url);
    if (!response.ok) return result;
    const data = await response.json();

    for (const [sym, cgId] of Object.entries(symbolToId)) {
      const entry = data?.[cgId];
      if (entry && typeof entry.usd === "number") {
        result.set(sym, {
          priceUsd: entry.usd,
          change24h: typeof entry.usd_24h_change === "number"
            ? parseFloat(entry.usd_24h_change.toFixed(2))
            : 0,
        });
      }
    }
  } catch {
    // Non-fatal
  }
  return result;
}

/**
 * Enrich token array with real prices + 24h changes.
 * Also fills in missing priceUsd from DAS where CoinGecko/Birdeye knows it.
 * Mutates in place; returns the same array.
 */
export async function enrichWith24hChanges<T extends {
  mint: string;
  symbol: string;
  balance: number;
  priceUsd: number;
  usdValue: number;
  change24h: number;
}>(tokens: T[]): Promise<T[]> {
  if (tokens.length === 0) return tokens;

  try {
    if (BIRDEYE_API_KEY) {
      // Birdeye: complete coverage by mint address
      const mints = tokens.map((t) => t.mint);
      const birdeyeMap = await fetchBirdeyePrices(mints);
      for (const token of tokens) {
        const data = birdeyeMap.get(token.mint);
        if (data) {
          token.change24h = data.change24h;
          // Fill in missing price from Birdeye
          if (token.priceUsd === 0 && data.priceUsd > 0) {
            token.priceUsd = data.priceUsd;
            token.usdValue = token.balance * data.priceUsd;
          }
        }
      }
    } else {
      // CoinGecko: covers major tokens by symbol
      const symbols = tokens.map((t) => t.symbol);
      const cgMap = await fetchCoinGeckoPrices(symbols);
      for (const token of tokens) {
        const data = cgMap.get(token.symbol.toUpperCase());
        if (data) {
          token.change24h = data.change24h;
          // Fill in missing price from CoinGecko
          if (token.priceUsd === 0 && data.priceUsd > 0) {
            token.priceUsd = data.priceUsd;
            token.usdValue = token.balance * data.priceUsd;
          }
        }
      }
    }
  } catch {
    // Non-fatal — tokens keep existing values
  }

  return tokens;
}
