// App configuration constants

export const APP_NAME = "Seeker AI Copilot";
export const APP_VERSION = "0.1.0";

// Solana configuration — Helius RPC key via env var, never hardcoded
// IMPORTANT: Set EXPO_PUBLIC_HELIUS_RPC_URL at build time. Never hardcode API keys.
export const SOLANA_RPC_ENDPOINT =
  process.env.EXPO_PUBLIC_HELIUS_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY";
export const SOLANA_CLUSTER = "mainnet-beta";

// SKR Token
export const SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3"; // Official SKR token mint
export const SKR_DECIMALS = 9;
export const SKR_STAKE_PRO_THRESHOLD = 200; // 200 SKR staked for Pro tier

// API endpoints — set EXPO_PUBLIC_API_URL env var for production
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
export const HELIUS_API_URL = "https://api.helius.xyz/v0";
export const BIRDEYE_API_URL = "https://public-api.birdeye.so";
export const BIRDEYE_API_KEY = process.env.EXPO_PUBLIC_BIRDEYE_KEY || "";
// Jupiter APIs (auth-gated since 2025 — kept for reference, not actively used)
export const JUPITER_PRICE_API = "https://price.jup.ag/v6/price";
export const JUPITER_TOKEN_API = "https://api.jup.ag/tokens/v2";
export const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Query limits per day
export const FREE_QUERIES_PER_DAY = 20;
export const PRO_QUERIES_PER_DAY = 100;

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
