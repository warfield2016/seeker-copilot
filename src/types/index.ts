// Core types for Seeker AI Portfolio Copilot

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  usdValue: number;
  priceUsd: number;
  change24h: number;
  logoUri?: string;
}

export interface DeFiPosition {
  protocol: string; // "Jupiter" | "Drift" | "Kamino" | "Orca" | "Marinade"
  type: "lp" | "stake" | "lend" | "borrow" | "perp";
  tokenA?: TokenBalance;
  tokenB?: TokenBalance;
  valueUsd: number;
  apy?: number;
  unrealizedPnl?: number;
  health?: number; // for lending positions
}

export interface NFTHolding {
  mint: string;
  name: string;
  collection?: string;
  imageUri?: string;
  estimatedValueUsd?: number;
}

export interface StakedPosition {
  symbol: string;
  protocol: string;
  mint: string;
  balance: number;
  valueUsd: number;
  priceUsd: number;
  aprEstimate: number;
  change24h: number;
  logoUri?: string;
}

export interface Portfolio {
  walletAddress: string;
  totalValueUsd: number;
  change24hUsd: number;
  change24hPercent: number;
  tokens: TokenBalance[];
  defiPositions: DeFiPosition[];
  nfts: NFTHolding[];
  stakedSol: number;
  stakedSolValueUsd: number;
  skrBalance: number;
  skrStaked: number;
  stakedPositions?: StakedPosition[];
  lastUpdated: Date;
}

export interface AIQuery {
  id: string;
  question: string;
  response: string;
  timestamp: Date;
  type: "summary" | "risk" | "recommendation" | "general";
}

export interface RiskScore {
  overall: number; // 0-100
  concentrationRisk: number;
  volatilityExposure: number;
  impermanentLossRisk: number;
  liquidationRisk: number;
  details: string;
}

export interface TradeRecommendation {
  action: "buy" | "sell" | "hold" | "rebalance";
  token: string;
  reason: string;
  confidence: number; // 0-100
  suggestedSize?: number;
  suggestedEntry?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface UserTier {
  level: "free" | "pro";
  skrStaked: number;
  queriesRemaining: number;
  queriesPerDay: number;
}

// Multi-agent analysis types
export interface TrendSignal {
  category: "momentum" | "narrative" | "opportunity" | "risk";
  title: string;
  description: string;
  relevance: number; // 0-100
  action: string;
  tokens?: string[];
}

export interface ProtocolSafety {
  protocol: string;
  safety_score: number; // 0-100
  risk_level: "low" | "medium" | "high" | "critical";
  audit_status: string;
  top_concern: string;
  recommendation: string;
  source?: string;
}

export interface DeepAnalysis {
  risk: RiskScore & { protocol_risk?: number; top_risk?: string; mitigation?: string };
  trends: TrendSignal[];
  security: ProtocolSafety[];
  recommendations: TradeRecommendation[];
  meta: {
    agents_run: number;
    agents_failed: number;
    failed_agents: string[];
    latency_seconds: number;
    pipeline: string;
  };
}

