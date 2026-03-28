import { Connection, PublicKey } from "@solana/web3.js";
import { TokenBalance, DeFiPosition, Portfolio, RiskScore } from "../types";
import { JUPITER_PRICE_API, SKR_MINT } from "../config/constants";

const FETCH_TIMEOUT_MS = 10000;
const STABLECOINS = new Set(["USDC", "USDT", "PYUSD", "DAI", "USDD", "TUSD", "FRAX"]);

/** Fetch with timeout using AbortController */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class PortfolioService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Fetch all token balances for a wallet
   */
  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    try {
      const pubkey = new PublicKey(walletAddress);

      // Get SOL balance
      const solBalance = await this.connection.getBalance(pubkey);

      // Get SPL token accounts
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        pubkey,
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );

      const tokens: TokenBalance[] = [];

      // Add SOL
      const solPriceData = await this.fetchTokenPrice("So11111111111111111111111111111111111111112");
      const solPrice = solPriceData?.price ?? 0;
      tokens.push({
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        balance: solBalance / 1e9,
        decimals: 9,
        usdValue: (solBalance / 1e9) * solPrice,
        priceUsd: solPrice,
        change24h: solPriceData?.change24h ?? 0,
        logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      });

      // Process SPL tokens
      const mints: string[] = [];
      const balanceMap = new Map<string, { balance: number; decimals: number }>();

      for (const account of tokenAccounts.value) {
        const parsed = account.account.data.parsed?.info;
        if (!parsed) continue;

        const mint = parsed.mint;
        const uiAmount = parsed.tokenAmount?.uiAmount;
        const decimals = parsed.tokenAmount?.decimals;

        if (typeof uiAmount !== "number" || typeof decimals !== "number") continue;
        if (uiAmount <= 0) continue;

        mints.push(mint);
        balanceMap.set(mint, { balance: uiAmount, decimals });
      }

      // Batch fetch prices
      if (mints.length > 0) {
        const prices = await this.fetchTokenPrices(mints);
        for (const [mint, data] of balanceMap) {
          const priceData = prices.get(mint);
          const price = priceData?.price ?? 0;
          if (price < 0) continue; // Skip negative prices from bad API data

          tokens.push({
            mint,
            symbol: priceData?.symbol ?? mint.slice(0, 6),
            name: priceData?.name ?? "Unknown Token",
            balance: data.balance,
            decimals: data.decimals,
            usdValue: data.balance * price,
            priceUsd: price,
            change24h: priceData?.change24h ?? 0,
            logoUri: priceData?.logoUri,
          });
        }
      }

      tokens.sort((a, b) => b.usdValue - a.usdValue);
      return tokens;
    } catch (error) {
      console.error("Failed to fetch token balances:", error);
      // Return SOL with zero balance so user sees something
      return [{
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        balance: 0,
        decimals: 9,
        usdValue: 0,
        priceUsd: 0,
        change24h: 0,
        logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      }];
    }
  }

  /**
   * Fetch price for a single token via Jupiter Price API
   */
  private async fetchTokenPrice(
    mint: string
  ): Promise<{ price: number; change24h: number } | null> {
    try {
      const response = await fetchWithTimeout(`${JUPITER_PRICE_API}?ids=${mint}`);
      if (!response.ok) return null;
      const data = await response.json();
      const tokenData = data.data?.[mint];
      if (!tokenData || typeof tokenData.price !== "number") return null;
      return { price: tokenData.price, change24h: 0 };
    } catch {
      return null;
    }
  }

  /**
   * Batch fetch prices for multiple tokens
   */
  private async fetchTokenPrices(
    mints: string[]
  ): Promise<Map<string, { price: number; change24h: number; symbol?: string; name?: string; logoUri?: string }>> {
    const result = new Map<string, { price: number; change24h: number; symbol?: string; name?: string; logoUri?: string }>();
    try {
      const ids = mints.join(",");
      const response = await fetchWithTimeout(`${JUPITER_PRICE_API}?ids=${ids}`);
      if (!response.ok) return result;
      const data = await response.json();

      for (const mint of mints) {
        const tokenData = data.data?.[mint];
        if (tokenData && typeof tokenData.price === "number") {
          result.set(mint, {
            price: tokenData.price,
            change24h: 0,
            symbol: tokenData.mintSymbol,
            name: tokenData.mintSymbol,
          });
        }
      }
    } catch (error) {
      console.error("Failed to batch fetch prices:", error);
    }
    return result;
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
      .filter((t) => STABLECOINS.has(t.symbol))
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
   * Build complete portfolio snapshot
   */
  async getPortfolio(walletAddress: string): Promise<Portfolio> {
    const tokens = await this.getTokenBalances(walletAddress);
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

    const stakedTokens = ["JitoSOL", "mSOL", "bSOL", "stSOL"];
    const stakedSolValue = tokens
      .filter((t) => stakedTokens.includes(t.symbol))
      .reduce((sum, t) => sum + t.usdValue, 0);

    return {
      walletAddress,
      totalValueUsd,
      change24hUsd,
      change24hPercent,
      tokens,
      defiPositions,
      nfts: [],
      stakedSol: 0,
      stakedSolValueUsd: stakedSolValue,
      skrBalance: skrToken?.balance ?? 0,
      skrStaked: 0,
      lastUpdated: new Date(),
    };
  }
}

export default PortfolioService;
