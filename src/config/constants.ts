// App configuration constants

export const APP_NAME = "Seeker AI Copilot";
export const APP_VERSION = "0.1.0";

// Solana configuration
export const SOLANA_RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY";
export const SOLANA_CLUSTER = "mainnet-beta";

// SKR Token
export const SKR_MINT = "SKRtRYxgEQuYwuMqEkmCBFyNn93fpd1kJFh1WMBcFwc"; // placeholder - update with real mint
export const SKR_DECIMALS = 9;
export const SKR_STAKE_PRO_THRESHOLD = 200; // 200 SKR staked for Pro tier

// API endpoints — set EXPO_PUBLIC_API_URL env var for production
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
export const HELIUS_API_URL = "https://api.helius.xyz/v0";
export const BIRDEYE_API_URL = "https://public-api.birdeye.so";
export const BIRDEYE_API_KEY = process.env.EXPO_PUBLIC_BIRDEYE_KEY || "";
export const JUPITER_PRICE_API = "https://price.jup.ag/v6/price";
export const JUPITER_TOKEN_API = "https://api.jup.ag/tokens/v2";
export const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Query limits per day
export const FREE_QUERIES_PER_DAY = 20;
export const PRO_QUERIES_PER_DAY = 100;

// UI
export const COLORS = {
  primary: "#9945FF",       // Solana purple
  secondary: "#14F195",     // Solana green
  background: "#0D1117",    // Dark background
  surface: "#161B22",       // Card background
  surfaceLight: "#21262D",  // Elevated surface
  text: "#F0F6FC",          // Primary text
  textSecondary: "#8B949E", // Secondary text
  success: "#3FB950",       // Green
  warning: "#D29922",       // Yellow/amber
  danger: "#F85149",        // Red
  border: "#30363D",        // Border color
  skr: "#FFB800",           // SKR token gold
};

export const FONTS = {
  regular: "System",
  bold: "System",
  mono: "Courier",
};
