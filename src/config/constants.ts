// App configuration constants

export const APP_NAME = "Copilot";
export const APP_VERSION = "1.1.0";

// Solana configuration — ALL RPC calls go through backend proxy. No Helius key in client.
// [C2 FIX] Removed EXPO_PUBLIC_HELIUS_RPC_URL — the key was baking into the APK via EXPO_PUBLIC_ prefix.
// The walletService still needs a basic RPC for getBalance(), so we use public mainnet-beta.
export const SOLANA_RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";
export const SOLANA_CLUSTER = "mainnet-beta";

// SKR Token
export const SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3"; // Official SKR token mint
export const SKR_DECIMALS = 6; // SKR token has 6 decimals (confirmed on-chain)
export const SKR_STAKE_PRO_THRESHOLD = 2000; // 2000 SKR staked for Pro tier

// API endpoints — set EXPO_PUBLIC_API_URL env var for production
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://seeker-copilot-production.up.railway.app";
// HELIUS_API_URL removed — all Helius calls go through backend proxy
export const BIRDEYE_API_URL = "https://public-api.birdeye.so";
export const BIRDEYE_API_KEY = process.env.EXPO_PUBLIC_BIRDEYE_KEY || "";
export const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Storage keys
export const DISCLAIMER_KEY = "@seeker_copilot_disclaimer_v1";

// Query limits per day
export const FREE_QUERIES_PER_DAY = 5;
export const PRO_QUERIES_PER_DAY = 20;

// ── Monetization: Jupiter Swap Integration ──
// Jupiter V6 API endpoints (no auth required for basic tier)
export const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";
// Platform fee in basis points (25 = 0.25%). Phantom uses 85 bps (0.85%).
// Our 0.25% is 70% cheaper than Phantom, positioning Copilot as the "fair-fee" option.
export const SWAP_PLATFORM_FEE_BPS = 25;
// Fee account where platform fees are collected (set via EXPO_PUBLIC_FEE_ACCOUNT at build time).
// Must be a pre-initialized Associated Token Account owned by the treasury wallet.
// If not set, platformFeeBps is omitted from quote requests (Jupiter returns no fee).
export const SWAP_FEE_ACCOUNT = process.env.EXPO_PUBLIC_FEE_ACCOUNT || "";
// Default slippage tolerance in basis points (50 = 0.5%)
export const SWAP_DEFAULT_SLIPPAGE_BPS = 50;

// UI — Cyberpunk neon palette
export const COLORS = {
  primary: "#B14EFF",       // Neon purple (brighter)
  secondary: "#14F195",     // Solana green (iconic, keep)
  accent: "#00F0FF",        // Cyan neon
  accentHot: "#FF006E",     // Hot pink
  background: "#080B12",    // Deep dark base
  surface: "#0F1419",       // Dark card background
  surfaceLight: "#1A2028",  // Elevated surface
  text: "#F0F6FC",          // Primary text
  textSecondary: "#8B949E", // Secondary text
  textMuted: "#6E7681",     // Tertiary/muted text
  success: "#00FF88",       // Neon green
  warning: "#FFB800",       // Amber
  danger: "#FF2D55",        // Hot red
  border: "#1E2530",        // Subtle border
  skr: "#FFB800",           // SKR token gold
  glow: "#B14EFF33",        // Purple glow for shadows/borders
  glowCyan: "#00F0FF22",    // Cyan glow
  glowStrong: "#B14EFF66",  // Strong purple glow
};

export const GRADIENTS = {
  header: ["#080B12", "#0F1419"],
  card: ["#0F1419", "#131A22"],
  accent: ["#B14EFF", "#00F0FF"],
  neonBorder: "#00F0FF33",
};

export const FONTS = {
  regular: "System",
  bold: "System",
  mono: "Courier",
};
