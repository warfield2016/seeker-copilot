/**
 * Transaction Service v3 — Helius Enhanced Transactions with proper formatting.
 *
 * Fixes from device testing:
 *  - Swap amounts now show correct precision (was off by 2 orders of magnitude)
 *  - Swap display shows "0.1 SOL → 498 SKR" with both token symbols
 *  - 30+ known mints for symbol resolution
 *  - Date grouping for "Today", "Yesterday", date headers
 *  - Heuristic-based unknown type resolution
 *  - Consistent address truncation
 */

import { API_BASE_URL } from "../config/constants";

const FETCH_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 25;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Helius Types ────────────────────────────────────────────────────────────

export interface TokenTransfer {
  fromUserAccount: string | null;
  toUserAccount: string | null;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  tokenAmount: number;
  mint: string;
}

export interface NativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

export interface EnhancedTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
  source: string;
  description: string;
  fee: number;
  feePayer: string;
  nativeTransfers: NativeTransfer[];
  tokenTransfers: TokenTransfer[];
  events: {
    nft?: { buyer: string; seller: string; amount: number; nfts: Array<{ mint: string }> };
    swap?: {
      nativeInput: { account: string; amount: string } | null;
      nativeOutput: { account: string; amount: string } | null;
      tokenInputs: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>;
      tokenOutputs: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>;
    };
  };
  transactionError?: Record<string, unknown> | null;
}

export interface ParsedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  description: string;
  fee: number;
  source: string;
  tokenTransfers: Array<{ fromUserAccount?: string; toUserAccount?: string; mint: string; tokenAmount: number }>;
  nativeTransfers: Array<{ fromUserAccount: string; toUserAccount: string; amount: number }>;
}

// ── Utilities ───────────────────────────────────────────────────────────────

/** Truncate a Solana address for display: "8Hvf...Zzaj" */
export function truncateAddress(addr: string, front = 4, back = 4): string {
  if (!addr || addr.length <= front + back + 3) return addr || "";
  return `${addr.slice(0, front)}...${addr.slice(-back)}`;
}

/** Smart amount formatter — adapts decimal places to value magnitude */
function formatAmount(val: number): string {
  if (val === 0) return "0";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return (val / 1_000_000).toFixed(2) + "M";
  if (abs >= 10_000) return Math.round(val).toLocaleString();
  if (abs >= 100) return val.toFixed(2);
  if (abs >= 1) return val.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (abs >= 0.0001) return val.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return val.toExponential(2);
}

// ── Token Symbol Resolution ─────────────────────────────────────────────────

const KNOWN_MINTS: Record<string, string> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3": "SKR",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": "JTO",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "WIF",
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "POPCAT",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "mSOL",
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": "JitoSOL",
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": "bSOL",
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "PYTH",
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": "JLP",
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof": "RENDER",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": "ORCA",
  "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt": "SRM",
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": "stSOL",
  "SAMoiCPL7g9QMFXpA6UKLGdRakgBKqDvJtBnxdSHuqo": "SAMO",
  "DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ": "DUST",
  "mb1eu7TzEc71KxDpsmsKoucSSuuo6KWzSY2PzDaewth": "MOBILE",
  "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux": "HNT",
  "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ": "W",
  "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS": "KMNO",
  "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7": "DRIFT",
  "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6": "TENSOR",
  "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v": "jupSOL",
  "he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A": "hSOL",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETHER",
  "StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT": "STEP",
};

function resolveTokenSymbol(mint: string): string {
  return KNOWN_MINTS[mint] ?? truncateAddress(mint, 4, 3);
}

// ── Type Labels & Icons ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  SWAP: "Swap", TRANSFER: "Transfer",
  NFT_SALE: "NFT Sale", NFT_MINT: "NFT Mint", NFT_LISTING: "Listed",
  NFT_CANCEL_LISTING: "Delisted", NFT_BID: "Bid", BURN_NFT: "NFT Burn",
  COMPRESSED_NFT_MINT: "cNFT Mint", COMPRESSED_NFT_TRANSFER: "cNFT Send",
  STAKE_SOL: "Stake", UNSTAKE_SOL: "Unstake", INIT_STAKE: "Stake Init",
  MERGE_STAKE: "Merge Stake", SPLIT_STAKE: "Split Stake",
  STAKE_TOKEN: "Stake", UNSTAKE_TOKEN: "Unstake", CLAIM_REWARDS: "Rewards",
  ADD_LIQUIDITY: "Add LP", WITHDRAW_LIQUIDITY: "Remove LP",
  DEPOSIT: "Deposit", WITHDRAW: "Withdraw",
  TOKEN_MINT: "Mint", BURN: "Burn", LOAN: "Borrow", REPAY_LOAN: "Repay",
  CREATE_ORDER: "Order", CANCEL_ORDER: "Cancel", FILL_ORDER: "Fill",
  CLOSE_ACCOUNT: "Close", SET_AUTHORITY: "Auth Change",
  EXECUTE_TRANSACTION: "Execute", PLATFORM_FEE: "Fee",
  UNKNOWN: "Transaction", UNLABELED: "Transaction",
};

const TYPE_COLORS: Record<string, string> = {
  SWAP: "#00F0FF", TRANSFER: "#B14EFF",
  NFT_SALE: "#FF006E", NFT_MINT: "#FF006E",
  STAKE_SOL: "#14F195", UNSTAKE_SOL: "#FFB800",
  CLAIM_REWARDS: "#00FF88",
  ADD_LIQUIDITY: "#14F195", WITHDRAW_LIQUIDITY: "#FFB800",
  DEPOSIT: "#14F195", WITHDRAW: "#FFB800",
  BURN: "#FF2D55", UNKNOWN: "#8B949E", UNLABELED: "#8B949E",
};

export const TX_TYPE_ICONS: Record<string, string> = {
  SWAP: "⇄", TRANSFER: "↗", NFT_SALE: "◆", NFT_MINT: "◇",
  STAKE_SOL: "⊕", UNSTAKE_SOL: "⊖", STAKE_TOKEN: "⊕", UNSTAKE_TOKEN: "⊖",
  CLAIM_REWARDS: "★", ADD_LIQUIDITY: "⊞", WITHDRAW_LIQUIDITY: "⊟",
  DEPOSIT: "↓", WITHDRAW: "↑", BURN: "✕", TOKEN_MINT: "◇",
  LOAN: "↓", REPAY_LOAN: "↑",
  UNKNOWN: "•", UNLABELED: "•",
};

const SOURCE_LABELS: Record<string, string> = {
  JUPITER: "Jupiter", RAYDIUM: "Raydium", ORCA: "Orca",
  MAGIC_EDEN: "Magic Eden", TENSOR: "Tensor", MARINADE: "Marinade",
  SYSTEM_PROGRAM: "System", STAKE_PROGRAM: "Stake", PHANTOM: "Phantom",
  DRIFT: "Drift", METEORA: "Meteora", LIFINITY: "Lifinity",
  METAPLEX: "Metaplex", BUBBLEGUM: "Bubblegum", SANCTUM: "Sanctum",
};

/** Get type label — falls back to heuristic from Helius description for UNKNOWN types */
function getTypeLabel(type: string, description?: string): string {
  if (type !== "UNKNOWN" && type !== "UNLABELED") {
    return TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 14);
  }
  // Heuristic for unknown types: check the Helius description
  if (description) {
    const d = description.toLowerCase();
    if (d.includes("swap")) return "Swap";
    if (d.includes("transfer") || d.includes("sent") || d.includes("received")) return "Transfer";
    if (d.includes("stake")) return "Stake";
    if (d.includes("mint")) return "Mint";
    if (d.includes("burn")) return "Burn";
  }
  return "Transaction";
}

function getTypeColor(type: string, description?: string): string {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type];
  if (description) {
    const d = description.toLowerCase();
    if (d.includes("swap")) return "#00F0FF";
    if (d.includes("stake")) return "#14F195";
  }
  return "#8B949E";
}

// ── Display Row ─────────────────────────────────────────────────────────────

export type TxFilterCategory = "ALL" | "SWAPS" | "TRANSFERS" | "NFT" | "STAKING" | "DEFI";

export interface TxDisplayRow {
  signature: string;
  timestamp: number;
  date: string;
  time: string;
  type: string;
  typeLabel: string;
  typeColor: string;
  typeIcon: string;
  source: string;
  sourceLabel: string;
  description: string;
  feeSol: number;
  explorerUrl: string;
  // Swap-specific (both sides)
  swapInAmount?: string;
  swapInSymbol?: string;
  swapOutAmount?: string;
  swapOutSymbol?: string;
  // Generic amount (transfers, etc.)
  amountDisplay?: string;
  amountColor?: string;
  counterparty?: string;
}

// ── Date Grouping ───────────────────────────────────────────────────────────

export interface TxDateSection {
  title: string;
  data: TxDisplayRow[];
}

export function groupByDate(rows: TxDisplayRow[]): TxDateSection[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const groups = new Map<string, TxDisplayRow[]>();
  for (const row of rows) {
    const d = new Date(row.timestamp * 1000);
    const ds = d.toDateString();
    let label: string;
    if (ds === todayStr) label = "Today";
    else if (ds === yesterdayStr) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(row);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

// ── Core Fetch ──────────────────────────────────────────────────────────────

export async function getEnhancedHistory(
  walletAddress: string,
  options: { limit?: number; beforeSignature?: string | null; type?: string } = {}
): Promise<EnhancedTransaction[]> {
  try {
    const body: Record<string, unknown> = {
      address: walletAddress,
      limit: options.limit ?? PAGE_SIZE,
    };
    if (options.beforeSignature) body.before_signature = options.beforeSignature;
    if (options.type) body.type = options.type;

    const resp = await fetchWithTimeout(
      `${API_BASE_URL}/api/proxy/transactions/history`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getTransactionHistory(walletAddress: string, limit = 20): Promise<ParsedTransaction[]> {
  const txs = await getEnhancedHistory(walletAddress, { limit });
  return txs.map((tx) => ({
    signature: tx.signature, timestamp: tx.timestamp, type: tx.type,
    description: tx.description, fee: tx.fee / 1e9, source: tx.source,
    tokenTransfers: tx.tokenTransfers?.map((tt) => ({
      fromUserAccount: tt.fromUserAccount ?? undefined, toUserAccount: tt.toUserAccount ?? undefined,
      mint: tt.mint, tokenAmount: tt.tokenAmount,
    })) ?? [],
    nativeTransfers: tx.nativeTransfers ?? [],
  }));
}

// ── Transform to Display Rows ───────────────────────────────────────────────

export function toDisplayRows(txs: EnhancedTransaction[], walletAddress: string): TxDisplayRow[] {
  return txs.map((tx) => {
    const d = new Date(tx.timestamp * 1000);
    const row: TxDisplayRow = {
      signature: tx.signature,
      timestamp: tx.timestamp,
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      type: tx.type,
      typeLabel: getTypeLabel(tx.type, tx.description),
      typeColor: getTypeColor(tx.type, tx.description),
      typeIcon: TX_TYPE_ICONS[tx.type] ?? "•",
      source: tx.source,
      sourceLabel: SOURCE_LABELS[tx.source] ?? tx.source,
      description: tx.description,
      feeSol: tx.fee / 1e9,
      explorerUrl: `https://solscan.io/tx/${tx.signature}`,
    };

    // ── SWAP: show both input and output with proper precision ──
    // BUG FIX: Check nativeInput/nativeOutput FIRST — when swapping native SOL,
    // Helius also returns a wSOL entry in tokenInputs with wrong magnitude.
    // nativeInput.amount is in lamports (string), divide by 1e9 for SOL.
    if (tx.type === "SWAP" && tx.events?.swap) {
      const s = tx.events.swap;
      // Input side — native SOL takes priority over wSOL in tokenInputs
      if (s.nativeInput) {
        const val = Number(s.nativeInput.amount) / 1e9;
        row.swapInAmount = formatAmount(val);
        row.swapInSymbol = "SOL";
      } else if (s.tokenInputs?.[0]) {
        const ti = s.tokenInputs[0];
        const val = Number(ti.rawTokenAmount.tokenAmount) / Math.pow(10, ti.rawTokenAmount.decimals);
        row.swapInAmount = formatAmount(val);
        row.swapInSymbol = resolveTokenSymbol(ti.mint);
      }
      // Output side — native SOL takes priority over wSOL in tokenOutputs
      if (s.nativeOutput) {
        const val = Number(s.nativeOutput.amount) / 1e9;
        row.swapOutAmount = formatAmount(val);
        row.swapOutSymbol = "SOL";
      } else if (s.tokenOutputs?.[0]) {
        const to = s.tokenOutputs[0];
        const val = Number(to.rawTokenAmount.tokenAmount) / Math.pow(10, to.rawTokenAmount.decimals);
        row.swapOutAmount = formatAmount(val);
        row.swapOutSymbol = resolveTokenSymbol(to.mint);
      }
      // Fallback amountDisplay for non-swap-aware UI
      if (row.swapInAmount && row.swapOutAmount) {
        row.amountDisplay = `${row.swapInAmount} ${row.swapInSymbol} → ${row.swapOutAmount} ${row.swapOutSymbol}`;
        row.amountColor = "#00F0FF";
      }

    // ── Native SOL transfers ──
    } else if (tx.nativeTransfers?.length > 0) {
      const outgoing = tx.nativeTransfers.find((t) => t.fromUserAccount === walletAddress);
      const incoming = tx.nativeTransfers.find((t) => t.toUserAccount === walletAddress);
      if (outgoing) {
        row.amountDisplay = `-${formatAmount(outgoing.amount / 1e9)} SOL`;
        row.amountColor = "#FF2D55";
        row.counterparty = truncateAddress(outgoing.toUserAccount);
      } else if (incoming) {
        row.amountDisplay = `+${formatAmount(incoming.amount / 1e9)} SOL`;
        row.amountColor = "#00FF88";
        row.counterparty = truncateAddress(incoming.fromUserAccount);
      }

    // ── Token transfers ──
    } else if (tx.tokenTransfers?.length > 0) {
      const tt = tx.tokenTransfers[0];
      const isOut = tt.fromUserAccount === walletAddress;
      const sign = isOut ? "-" : "+";
      const color = isOut ? "#FF2D55" : "#00FF88";
      row.amountDisplay = `${sign}${formatAmount(tt.tokenAmount)} ${resolveTokenSymbol(tt.mint)}`;
      row.amountColor = color;
      if (isOut && tt.toUserAccount) row.counterparty = truncateAddress(tt.toUserAccount);
      else if (!isOut && tt.fromUserAccount) row.counterparty = truncateAddress(tt.fromUserAccount);
    }

    return row;
  });
}

// ── Pagination ──────────────────────────────────────────────────────────────

export function getNextCursor(txs: EnhancedTransaction[]): string | null {
  if (txs.length < PAGE_SIZE) return null;
  return txs[txs.length - 1]?.signature ?? null;
}

// ── AI Context Formatter ────────────────────────────────────────────────────

export function formatTransactionsForAI(txs: ParsedTransaction[], walletAddress: string): string {
  if (txs.length === 0) return "No recent transactions found.";
  const lines = txs.slice(0, 15).map((tx) => {
    const date = new Date(tx.timestamp * 1000).toLocaleDateString();
    return `[${date}] ${tx.type}: ${tx.description} (via ${tx.source}, fee=${tx.fee.toFixed(6)} SOL)`;
  });
  const swapCount = txs.filter((t) => t.type === "SWAP").length;
  const transferCount = txs.filter((t) => t.type === "TRANSFER").length;
  const nftCount = txs.filter((t) => t.type.startsWith("NFT_")).length;
  return [`Recent activity (${txs.length} txs): ${swapCount} swaps, ${transferCount} transfers, ${nftCount} NFT ops`, "", ...lines].join("\n");
}
