import { Connection, PublicKey } from "@solana/web3.js";
import { TokenBalance, DeFiPosition, NFTHolding, Portfolio, RiskScore } from "../types";
import { SKR_MINT, SOLANA_RPC_ENDPOINT } from "../config/constants";
import { enrichWith24hChanges } from "./priceService";

const FETCH_TIMEOUT_MS = 15000;
const STABLECOINS = new Set(["USDC", "USDT", "PYUSD", "DAI", "USDD", "TUSD", "FRAX", "USDH", "UXD"]);
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_LOGO = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
// Minimum USD value to show a token — filters out spam/dust
const MIN_TOKEN_VALUE_USD = 0.01;

/** Fetch with timeout using AbortController */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Make a Helius DAS JSON-RPC call */
async function heliusRpc(method: string, params: unknown): Promise<unknown> {
  const response = await fetchWithTimeout(
    SOLANA_RPC_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "seeker-copilot", method, params }),
    }
  );
  if (!response.ok) throw new Error(`Helius RPC error: ${response.status}`);
  const json = await response.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`Helius RPC: ${json.error.message}`);
  return json.result;
}

class PortfolioService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Fetch all assets (tokens + NFTs) via Helius DAS getAssetsByOwner.
   * Single call replaces: getParsedTokenAccountsByOwner + batch Jupiter prices.
   * Returns tokens with real logos, symbols, prices. Also separates out NFTs.
   */
  async getAssets(walletAddress: string): Promise<{
    tokens: TokenBalance[];
    nfts: NFTHolding[];
  }> {
    const result = await heliusRpc("getAssetsByOwner", {
      ownerAddress: walletAddress,
      page: 1,
      limit: 1000,
      displayOptions: {
        showFungible: true,
        showNativeBalance: true,
        showUnverifiedCollections: false,
        showCollectionMetadata: false,
        showInscription: false,
      },
    }) as {
      items: DasAsset[];
      nativeBalance?: { lamports: number; price_per_sol?: number; total_price?: number };
      total: number;
    };

    const tokens: TokenBalance[] = [];
    const nfts: NFTHolding[] = [];

    // SOL native balance
    const lamports = result.nativeBalance?.lamports ?? 0;
    const solPrice = result.nativeBalance?.price_per_sol ?? 0;
    const solBalance = lamports / 1e9;
    tokens.push({
      mint: SOL_MINT,
      symbol: "SOL",
      name: "Solana",
      balance: solBalance,
      decimals: 9,
      usdValue: result.nativeBalance?.total_price ?? solBalance * solPrice,
      priceUsd: solPrice,
      change24h: 0,
      logoUri: SOL_LOGO,
    });

    // Collect mints that have no price data for Jupiter fallback
    const missingPriceMints: string[] = [];

    for (const asset of result.items) {
      const iface = asset.interface ?? "";

      // --- Fungible tokens ---
      if (iface === "FungibleToken" || iface === "FungibleAsset") {
        const info = asset.token_info;
        if (!info) continue;

        const decimals = info.decimals ?? 0;
        const rawBalance = Number(info.balance ?? 0);
        const balance = rawBalance / Math.pow(10, decimals);
        if (balance <= 0) continue;

        const priceInfo = info.price_info;
        const priceUsd = priceInfo?.price_per_token ?? 0;
        const usdValue = priceInfo?.total_price ?? balance * priceUsd;

        if (usdValue < MIN_TOKEN_VALUE_USD && priceUsd === 0) {
          // Track for Jupiter price fallback
          missingPriceMints.push(asset.id);
        }

        const symbol =
          info.symbol ||
          asset.content?.metadata?.symbol ||
          asset.id.slice(0, 6);
        const name =
          asset.content?.metadata?.name ||
          symbol;
        const logoUri =
          asset.content?.links?.image ||
          asset.content?.files?.[0]?.uri;

        tokens.push({
          mint: asset.id,
          symbol,
          name,
          balance,
          decimals,
          usdValue,
          priceUsd,
          change24h: 0, // DAS doesn't return 24h change — enriched below
          logoUri,
        });

      // --- NFTs ---
      } else if (
        iface === "V1_NFT" ||
        iface === "V2_NFT" ||
        iface === "ProgrammableNFT" ||
        iface === "LEGACY_NFT"
      ) {
        nfts.push({
          mint: asset.id,
          name: asset.content?.metadata?.name ?? "Unknown NFT",
          collection: asset.grouping?.find((g) => g.group_key === "collection")?.group_value,
          imageUri: asset.content?.links?.image ?? asset.content?.files?.[0]?.uri,
          estimatedValueUsd: undefined,
        });
      }
    }

    // Filter out pure dust (no value, no known price from DAS)
    const filteredTokens = tokens.filter(
      (t) => t.mint === SOL_MINT || t.usdValue >= MIN_TOKEN_VALUE_USD || t.priceUsd > 0
    );

    filteredTokens.sort((a, b) => b.usdValue - a.usdValue);

    // Enrich with prices + 24h changes via Birdeye (key set) or CoinGecko (free fallback).
    // Also fills in missing prices for tokens DAS didn't price.
    await enrichWith24hChanges(filteredTokens);

    return { tokens: filteredTokens, nfts };
  }

  /**
   * Fetch token balances (legacy path — uses DAS internally now)
   */
  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    const { tokens } = await this.getAssets(walletAddress);
    return tokens;
  }

  /**
   * Calculate portfolio risk score.
   *
   * Formulas:
   * - Concentration: Herfindahl-Hirschman Index (HHI) on token weights, scaled 0-100
   * - Volatility: % of token value in non-stablecoins
   * - IL Risk: % of total value in LP positions
   * - Liquidation: average health deficit of borrow positions
   * - Overall: weighted average (0.3, 0.3, 0.2, 0.2)
   */
  calculateRiskScore(tokens: TokenBalance[], defiPositions: DeFiPosition[]): RiskScore {
    const tokenValue = tokens.reduce((sum, t) => sum + t.usdValue, 0);
    const defiValue = defiPositions.reduce((sum, p) => sum + p.valueUsd, 0);
    const totalValue = tokenValue + defiValue;

    if (totalValue <= 0) {
      return {
        overall: 0,
        concentrationRisk: 0,
        volatilityExposure: 0,
        impermanentLossRisk: 0,
        liquidationRisk: 0,
        details: "No positions to analyze.",
      };
    }

    // Concentration risk: HHI on token weights
    const hhi = tokenValue > 0
      ? tokens.reduce((sum, t) => {
          const w = t.usdValue / tokenValue;
          return sum + w * w;
        }, 0)
      : 0;
    const concentrationRisk = Math.min(100, Math.round(hhi * 100));

    // Volatility: % of token value NOT in stablecoins
    const stableValue = tokens
      .filter((t) => STABLECOINS.has(t.symbol.toUpperCase()))
      .reduce((sum, t) => sum + t.usdValue, 0);
    const volatilityExposure = tokenValue > 0
      ? Math.round(((tokenValue - stableValue) / tokenValue) * 100)
      : 0;

    // IL risk: LP positions as % of total portfolio
    const lpValue = defiPositions
      .filter((p) => p.type === "lp")
      .reduce((sum, p) => sum + p.valueUsd, 0);
    const impermanentLossRisk = Math.round((lpValue / totalValue) * 100);

    // Liquidation risk: average health deficit on borrows
    const borrowPositions = defiPositions.filter((p) => p.type === "borrow");
    const liquidationRisk = borrowPositions.length > 0
      ? Math.round(
          borrowPositions.reduce((sum, p) => sum + (100 - (p.health ?? 100)), 0) /
            borrowPositions.length
        )
      : 0;

    // Composite: weighted average
    const overall = Math.round(
      concentrationRisk * 0.3 +
        volatilityExposure * 0.3 +
        impermanentLossRisk * 0.2 +
        liquidationRisk * 0.2
    );

    const flags: string[] = [`Portfolio value: $${totalValue.toFixed(2)}.`];
    if (concentrationRisk > 50) flags.push(`High concentration (HHI ${concentrationRisk}).`);
    if (volatilityExposure > 80) flags.push("Heavy volatile asset exposure.");
    if (impermanentLossRisk > 20) flags.push("Significant IL risk from LP positions.");
    if (liquidationRisk > 40) flags.push("Borrow positions approaching liquidation.");

    return {
      overall,
      concentrationRisk,
      volatilityExposure,
      impermanentLossRisk,
      liquidationRisk,
      details: flags.join(" "),
    };
  }

  /**
   * Build complete portfolio snapshot using Helius DAS API
   */
  async getPortfolio(walletAddress: string): Promise<Portfolio> {
    const { tokens, nfts } = await this.getAssets(walletAddress);
    const skrToken = tokens.find((t) => t.mint === SKR_MINT);
    const defiPositions: DeFiPosition[] = [];

    const tokenValue = tokens.reduce((sum, t) => sum + t.usdValue, 0);
    const defiValue = defiPositions.reduce((sum, p) => sum + p.valueUsd, 0);
    const totalValueUsd = tokenValue + defiValue;

    const change24hUsd = tokens.reduce(
      (sum, t) => sum + (t.usdValue * t.change24h) / 100,
      0
    );
    const change24hPercent = totalValueUsd > 0 ? (change24hUsd / totalValueUsd) * 100 : 0;

    const stakedTokenSymbols = ["JitoSOL", "mSOL", "bSOL", "stSOL", "jitoSOL"];
    const stakedSolValue = tokens
      .filter((t) => stakedTokenSymbols.includes(t.symbol))
      .reduce((sum, t) => sum + t.usdValue, 0);

    return {
      walletAddress,
      totalValueUsd,
      change24hUsd,
      change24hPercent,
      tokens,
      defiPositions,
      nfts,
      stakedSol: 0,
      stakedSolValueUsd: stakedSolValue,
      skrBalance: skrToken?.balance ?? 0,
      skrStaked: 0,
      lastUpdated: new Date(),
    };
  }
}

// --- DAS API Type Definitions ---

interface DasAsset {
  id: string;
  interface?: string;
  token_info?: {
    symbol?: string;
    balance?: string | number;
    decimals?: number;
    price_info?: {
      price_per_token?: number;
      total_price?: number;
      currency?: string;
    };
  };
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
    };
    links?: {
      image?: string;
    };
    files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>;
  };
  grouping?: Array<{ group_key: string; group_value: string }>;
  compression?: { compressed: boolean };
}

export default PortfolioService;
