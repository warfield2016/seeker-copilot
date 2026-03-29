import { TokenBalance } from "../types";

/**
 * Liquid Staking Token (LST) detection by mint address.
 * These tokens represent staked SOL in various DeFi protocols.
 */
export interface LSTInfo {
  symbol: string;
  protocol: string;
  type: "liquid-stake";
  aprEstimate: number; // Estimated APR from known data
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

// Known Liquid Staking Token mints on Solana mainnet
const LST_MINTS: Record<string, LSTInfo> = {
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {
    symbol: "mSOL",
    protocol: "Marinade",
    type: "liquid-stake",
    aprEstimate: 7.2,
  },
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": {
    symbol: "JitoSOL",
    protocol: "Jito",
    type: "liquid-stake",
    aprEstimate: 7.8,
  },
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": {
    symbol: "bSOL",
    protocol: "BlazeStake",
    type: "liquid-stake",
    aprEstimate: 7.0,
  },
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": {
    symbol: "stSOL",
    protocol: "Lido",
    type: "liquid-stake",
    aprEstimate: 6.8,
  },
  "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm": {
    symbol: "scnSOL",
    protocol: "Sanctum",
    type: "liquid-stake",
    aprEstimate: 7.5,
  },
  "he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A": {
    symbol: "hSOL",
    protocol: "Helius",
    type: "liquid-stake",
    aprEstimate: 7.3,
  },
  "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v": {
    symbol: "jupSOL",
    protocol: "Jupiter",
    type: "liquid-stake",
    aprEstimate: 7.6,
  },
  "LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp": {
    symbol: "LST",
    protocol: "Sanctum Infinity",
    type: "liquid-stake",
    aprEstimate: 7.4,
  },
  "edge86g9cVz87xcpKpy3J77vbp4wYd9idEV562CCntt": {
    symbol: "edgeSOL",
    protocol: "Edgevana",
    type: "liquid-stake",
    aprEstimate: 7.1,
  },
  "BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs": {
    symbol: "bonkSOL",
    protocol: "Sanctum bonkSOL",
    type: "liquid-stake",
    aprEstimate: 7.3,
  },
};

/**
 * Detect Liquid Staking Tokens in the user's token holdings.
 * Returns annotated staking positions without modifying the original tokens array.
 */
export function detectStakedPositions(tokens: TokenBalance[]): StakedPosition[] {
  const positions: StakedPosition[] = [];

  for (const token of tokens) {
    const lstInfo = LST_MINTS[token.mint];
    if (lstInfo) {
      positions.push({
        symbol: token.symbol || lstInfo.symbol,
        protocol: lstInfo.protocol,
        mint: token.mint,
        balance: token.balance,
        valueUsd: token.usdValue,
        priceUsd: token.priceUsd,
        aprEstimate: lstInfo.aprEstimate,
        change24h: token.change24h,
        logoUri: token.logoUri,
      });
    }
  }

  return positions;
}

/**
 * Check if a token mint is a known LST.
 */
export function isLST(mint: string): boolean {
  return mint in LST_MINTS;
}

/**
 * Get total staked value across all LSTs.
 */
export function getTotalStakedValue(positions: StakedPosition[]): number {
  return positions.reduce((sum, p) => sum + p.valueUsd, 0);
}

/**
 * Fetch live APY rates from DeFiLlama yields API.
 * Falls back to hardcoded estimates on failure.
 */
export async function enrichWithLiveAPY(positions: StakedPosition[]): Promise<void> {
  try {
    const response = await fetch("https://yields.llama.fi/pools", {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;

    const data = await response.json() as { data: Array<{ symbol: string; apy: number; project: string; chain: string }> };
    const solPools = data.data.filter(
      (p) => p.chain === "Solana" && p.apy > 0
    );

    for (const pos of positions) {
      const match = solPools.find(
        (p) =>
          p.symbol.toUpperCase().includes(pos.symbol.toUpperCase()) ||
          p.project.toLowerCase().includes(pos.protocol.toLowerCase())
      );
      if (match) {
        pos.aprEstimate = Math.round(match.apy * 10) / 10;
      }
    }
  } catch {
    // Keep hardcoded estimates
  }
}
