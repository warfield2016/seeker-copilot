import { Portfolio, AIQuery, TradeRecommendation, TrendSignal, ProtocolSafety, DeepAnalysis } from "../types";
import { API_BASE_URL } from "../config/constants";

/**
 * AI Analysis Service - communicates with FastAPI backend
 * for multi-agent orchestrated portfolio analysis.
 */
class AIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
    if (__DEV__) console.log("[AIService] Backend URL:", this.baseUrl);
  }

  /** Fetch with retry and timeout */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    { retries = 2, timeoutMs = 45000 } = {}
  ): Promise<Response> {
    let lastError: Error | null = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < retries) {
          const wait = 1000 * (i + 1);
          if (__DEV__) console.warn(`[AIService] Retry ${i + 1}/${retries} in ${wait}ms:`, lastError.message);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    throw lastError ?? new Error("Fetch failed");
  }

  /**
   * Get natural-language portfolio summary (fast, single-agent)
   */
  async getPortfolioSummary(portfolio: Portfolio): Promise<string> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/ai/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: portfolio.walletAddress,
          total_value_usd: portfolio.totalValueUsd,
          change_24h_percent: portfolio.change24hPercent,
          tokens: portfolio.tokens.map((t) => ({
            symbol: t.symbol,
            balance: t.balance,
            usd_value: t.usdValue,
            price_usd: t.priceUsd,
            change_24h: t.change24h,
          })),
          defi_positions: portfolio.defiPositions.map((p) => ({
            protocol: p.protocol,
            type: p.type,
            value_usd: p.valueUsd,
            apy: p.apy,
            unrealized_pnl: p.unrealizedPnl,
          })),
          skr_balance: portfolio.skrBalance,
          skr_staked: portfolio.skrStaked,
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      return data.summary;
    } catch (error) {
      if (__DEV__) console.error("AI summary failed:", error);
      return this.generateLocalSummary(portfolio);
    }
  }

  /**
   * Ask a free-form question about the portfolio
   */
  async askQuestion(portfolio: Portfolio, question: string): Promise<AIQuery> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: portfolio.walletAddress,
          question,
          portfolio_summary: {
            total_value: portfolio.totalValueUsd,
            tokens: portfolio.tokens.map((t) => ({
              symbol: t.symbol,
              balance: t.balance,
              usd_value: t.usdValue,
            })),
          },
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();

      return {
        id: data.id,
        question,
        response: data.response,
        timestamp: new Date(),
        type: data.type ?? "general",
      };
    } catch (error) {
      if (__DEV__) console.error("AI question failed:", error);
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const msg = isTimeout
        ? "Request timed out. The AI service is taking too long — try a simpler question."
        : `Unable to reach the AI service (${this.baseUrl}). Check your connection and try again.`;
      return {
        id: Date.now().toString(),
        question,
        response: msg,
        timestamp: new Date(),
        type: "general",
      };
    }
  }

  /**
   * Get trade recommendations
   */
  async getRecommendations(portfolio: Portfolio): Promise<TradeRecommendation[]> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/ai/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: portfolio.walletAddress,
          tokens: portfolio.tokens.map((t) => ({
            symbol: t.symbol,
            balance: t.balance,
            usd_value: t.usdValue,
            price_usd: t.priceUsd,
            change_24h: t.change24h,
          })),
          defi_positions: portfolio.defiPositions.map((p) => ({
            protocol: p.protocol,
            type: p.type,
            value_usd: p.valueUsd,
            apy: p.apy,
            unrealized_pnl: p.unrealizedPnl,
          })),
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      return data.recommendations;
    } catch (error) {
      if (__DEV__) console.error("AI recommendations failed:", error);
      return [];
    }
  }

  /**
   * Full multi-agent deep analysis pipeline
   * Runs Risk + Trend + Security in parallel → Trade Generator
   */
  async getDeepAnalysis(portfolio: Portfolio): Promise<DeepAnalysis | null> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/ai/deep-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: portfolio.walletAddress,
          tokens: portfolio.tokens.map((t) => ({
            symbol: t.symbol,
            balance: t.balance,
            usd_value: t.usdValue,
            price_usd: t.priceUsd,
            change_24h: t.change24h,
          })),
          defi_positions: portfolio.defiPositions.map((p) => ({
            protocol: p.protocol,
            type: p.type,
            value_usd: p.valueUsd,
            apy: p.apy,
            unrealized_pnl: p.unrealizedPnl,
          })),
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (__DEV__) console.error("Deep analysis failed:", error);
      return null;
    }
  }

  /**
   * Fallback local summary when backend is unavailable
   */
  private generateLocalSummary(portfolio: Portfolio): string {
    const { totalValueUsd, change24hPercent, tokens } = portfolio;
    const direction = change24hPercent >= 0 ? "up" : "down";
    const topTokens = tokens.slice(0, 3);
    const topHoldings = topTokens
      .map(
        (t) =>
          `${t.symbol} ($${t.usdValue.toFixed(2)}, ${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(1)}%)`
      )
      .join(", ");

    return `Your portfolio is worth $${totalValueUsd.toFixed(2)}, ${direction} ${Math.abs(change24hPercent).toFixed(1)}% today. Top holdings: ${topHoldings}. ${
      portfolio.skrBalance > 0
        ? `You hold ${portfolio.skrBalance.toFixed(0)} SKR.`
        : ""
    }`;
  }
}

export const aiService = new AIService();
export default aiService;
