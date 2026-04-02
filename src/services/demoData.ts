import { Portfolio, RiskScore, TradeRecommendation, TrendSignal, ProtocolSafety } from "../types";

/**
 * Demo portfolio data for web preview and grant demonstrations.
 * On a real Seeker device, this is replaced by live on-chain data.
 *
 * Math verification:
 * Tokens: 9040 + 2142 + 1115.50 + 245 + 5.375 = 12,547.875
 * DeFi:   2000 + 2000 + 1500 + 500 = 6,000
 * Total:  18,547.875 ≈ 18,547.88
 *
 * Change24h calc from tokens:
 * SOL:     9040 * 0.041  = 370.64
 * JitoSOL: 2142 * 0.043  = 92.11
 * USDC:    1115.50 * 0   = 0
 * SKR:     245 * -0.023  = -5.64
 * BONK:    5.375 * 0.125 = 0.67
 * Sum = 457.78
 * Percent = 457.78 / 18547.88 = 2.47%
 */
export const DEMO_PORTFOLIO: Portfolio = {
  walletAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  totalValueUsd: 18547.88,
  change24hUsd: 457.78,
  change24hPercent: 2.47,
  tokens: [
    {
      mint: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      name: "Solana",
      balance: 45.2,
      decimals: 9,
      usdValue: 9040.0,
      priceUsd: 200.0,
      change24h: 4.1,
      logoUri: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    },
    {
      mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      symbol: "JitoSOL",
      name: "Jito Staked SOL",
      balance: 10.5,
      decimals: 9,
      usdValue: 2142.0,
      priceUsd: 204.0,
      change24h: 4.3,
    },
    {
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      symbol: "USDC",
      name: "USD Coin",
      balance: 1115.5,
      decimals: 6,
      usdValue: 1115.5,
      priceUsd: 1.0,
      change24h: 0.0,
    },
    {
      mint: "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3",
      symbol: "SKR",
      name: "Seeker",
      balance: 5000,
      decimals: 9,
      usdValue: 245.0,
      priceUsd: 0.049,
      change24h: -2.3,
    },
    {
      mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      symbol: "BONK",
      name: "Bonk",
      balance: 12500000,
      decimals: 5,
      usdValue: 5.375,
      priceUsd: 0.00000043,
      change24h: 12.5,
    },
  ],
  defiPositions: [
    {
      protocol: "Kamino",
      type: "lend",
      valueUsd: 2000.0,
      apy: 8.2,
      unrealizedPnl: 45.2,
    },
    {
      protocol: "Jupiter",
      type: "lp",
      tokenA: {
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        balance: 5.0,
        decimals: 9,
        usdValue: 1000.0,
        priceUsd: 200.0,
        change24h: 4.1,
      },
      tokenB: {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "USDC",
        name: "USD Coin",
        balance: 1000.0,
        decimals: 6,
        usdValue: 1000.0,
        priceUsd: 1.0,
        change24h: 0.0,
      },
      valueUsd: 2000.0,
      apy: 24.5,
      unrealizedPnl: -12.3,
    },
    {
      protocol: "Marinade",
      type: "stake",
      valueUsd: 1500.0,
      apy: 7.1,
    },
    {
      protocol: "Drift",
      type: "perp",
      valueUsd: 500.0,
      unrealizedPnl: 78.5,
    },
  ],
  nfts: [],
  stakedSol: 10.5,
  stakedSolValueUsd: 2142.0,
  skrBalance: 5000,
  skrStaked: 200,
  skrStakedRewards: 9.14,
  skrStakedValueUsd: 41.83,
  stakedPositions: [
    {
      symbol: "JitoSOL",
      protocol: "Jito",
      mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      balance: 12.5,
      valueUsd: 2187.5,
      priceUsd: 175.0,
      aprEstimate: 7.8,
      change24h: 3.2,
    },
    {
      symbol: "mSOL",
      protocol: "Marinade",
      mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
      balance: 5.2,
      valueUsd: 910.0,
      priceUsd: 175.0,
      aprEstimate: 7.2,
      change24h: 3.1,
    },
  ],
  lastUpdated: new Date(),
};

/**
 * Risk score calculated from DEMO_PORTFOLIO using portfolioService formulas:
 *
 * totalValue = 18547.88 (tokens + DeFi)
 *
 * Concentration (HHI on tokens only):
 *   SOL:     (9040/12547.88)^2   = 0.5190
 *   JitoSOL: (2142/12547.88)^2   = 0.0291
 *   USDC:    (1115.50/12547.88)^2 = 0.0079
 *   SKR:     (245/12547.88)^2    = 0.0004
 *   BONK:    (5.375/12547.88)^2  = 0.0000
 *   HHI = 0.5564 → min(100, round(55.64)) = 56
 *
 * Volatility: stableValue = 1115.50
 *   (12547.88 - 1115.50) / 12547.88 = 0.9111 → 91
 *   Note: uses token total, not full total
 *
 * IL Risk: LP value = 2000, totalValue = 18547.88
 *   2000 / 18547.88 = 0.1078 → 11
 *
 * Liquidation: 0 (no borrow positions)
 *
 * Overall = round(56*0.3 + 91*0.3 + 11*0.2 + 0*0.2) = round(46.3) = 46
 */
export const DEMO_RISK: RiskScore = {
  overall: 46,
  concentrationRisk: 56,
  volatilityExposure: 91,
  impermanentLossRisk: 11,
  liquidationRisk: 0,
  details:
    "Portfolio value: $18,547.88. High concentration in SOL (72% of token holdings). Heavy exposure to volatile assets (91%). Moderate impermanent loss risk from Jupiter LP.",
};

export const DEMO_RECOMMENDATIONS: TradeRecommendation[] = [
  {
    action: "rebalance",
    token: "SOL",
    reason: "72% concentration in SOL with high volatility (91). Risk + Trend agents agree: diversify 10-15% into stablecoins to reduce single-asset exposure while maintaining upside.",
    confidence: 88,
    suggestedSize: 5,
  },
  {
    action: "buy",
    token: "SKR",
    reason: "Trend signal: Seeker ecosystem gaining momentum. You have 200 SKR staked at Pro threshold. Increasing stake improves Guardian rewards and governance weight.",
    confidence: 75,
  },
  {
    action: "hold",
    token: "JitoSOL",
    reason: "Security audit: Jito scores 91/100 safety. 7.1% APY via liquid staking is solid risk-adjusted yield. No action needed.",
    confidence: 82,
  },
];

export const DEMO_TRENDS: TrendSignal[] = [
  {
    category: "momentum",
    title: "SOL +4.1% leads your portfolio",
    description: "SOL is outperforming the broader market today. Your 72% SOL allocation amplifies this move — $370 of your $458 daily gain comes from SOL alone.",
    relevance: 92,
    action: "Ride the momentum but consider taking partial profits above $210",
    tokens: ["SOL"],
  },
  {
    category: "narrative",
    title: "Liquid staking TVL surge on Solana",
    description: "JitoSOL and mSOL TVL grew 18% this month as Solana staking yields attract capital. Your JitoSOL position is well-aligned with this trend.",
    relevance: 85,
    action: "Hold JitoSOL. Consider adding mSOL for diversified staking exposure",
    tokens: ["JitoSOL", "mSOL"],
  },
  {
    category: "opportunity",
    title: "AI agent tokens gaining traction",
    description: "AI narrative tokens on Solana seeing 40%+ volume increases. Your portfolio has zero AI token exposure — potential alpha opportunity.",
    relevance: 78,
    action: "Research AI-related tokens like GRIFFAIN or ai16z for small allocation",
    tokens: ["GRIFFAIN", "AI16Z"],
  },
  {
    category: "risk",
    title: "BONK memecoin volatility warning",
    description: "BONK showing 12.5% daily swing with declining volume. Memecoin narratives tend to fade after initial pumps — your $5 position is negligible risk.",
    relevance: 45,
    action: "Position too small to matter. Hold or sell — no impact on portfolio",
    tokens: ["BONK"],
  },
];

export const DEMO_SECURITY: ProtocolSafety[] = [
  {
    protocol: "Jupiter",
    safety_score: 92,
    risk_level: "low",
    audit_status: "OtterSec, Neodyme",
    top_concern: "No known concerns",
    recommendation: "Position is well-secured",
  },
  {
    protocol: "Kamino",
    safety_score: 88,
    risk_level: "low",
    audit_status: "OtterSec, Offside Labs",
    top_concern: "No known concerns",
    recommendation: "Position is well-secured",
  },
  {
    protocol: "Marinade",
    safety_score: 90,
    risk_level: "low",
    audit_status: "Neodyme, Kudelski",
    top_concern: "No known concerns",
    recommendation: "Position is well-secured",
  },
  {
    protocol: "Drift",
    safety_score: 85,
    risk_level: "low",
    audit_status: "OtterSec",
    top_concern: "Minor oracle issue 2023, resolved",
    recommendation: "Monitor for updates. Protocol is generally safe.",
  },
];
