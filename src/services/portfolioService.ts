import { Connection, PublicKey } from "@solana/web3.js";
import { TokenBalance, DeFiPosition, NFTHolding, Portfolio, RiskScore } from "../types";
import { SKR_MINT, SKR_DECIMALS, SOLANA_RPC_ENDPOINT, API_BASE_URL } from "../config/constants";
import { enrichWith24hChanges } from "./priceService";

const FETCH_TIMEOUT_MS = 15000;
const STABLECOINS = new Set(["USDC", "USDT", "PYUSD", "DAI", "USDD", "TUSD", "FRAX", "USDH", "UXD"]);
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_LOGO = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
// Minimum USD value to show a token — filters out spam/dust
const MIN_TOKEN_VALUE_USD = 0.01;

// SKR staking program — escrow/vault model, tokens leave wallet when staked
const SKR_STAKING_PROGRAM = new PublicKey("SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ");
const SKR_STAKE_CONFIG = "4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw";
// UserStakeEntry: 169 bytes, discriminator 6635a36b098a5799
// Layout: [0..8] discriminator, [8] bump, [9..41] config, [41..73] user wallet,
//         [73..105] pool, [105..113] staked_amount (u64), [121..129] reward_per_token_paid (u64),
//         [153..161] unstake_amount (u64), [161..169] unstake_timestamp (u64)
const USER_STAKE_ENTRY_SIZE = 169;
const USER_STAKE_ENTRY_DISCRIMINATOR = "ZjWjawmKeZk="; // base64 of 6635a36b098a5799

// Scam NFT name patterns — phishing airdrops, fake mints, URLs in names
const SCAM_NFT_PATTERN = /claim|free\s*mint|airdrop|reward|\.com|\.xyz|\.io|\.net|visit\s|redeem/i;

// IPFS gateways in priority order (nftstorage.link deprecated, cloudflare-ipfs.com dead)
const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://4everland.io/ipfs/",
];

/** Read u64 LE from buffer — uses ONLY multiplication (no bitwise ops).
 *  JS bitwise operators truncate to 32-bit signed ints, corrupting large values.
 *  Multiplication stays in 64-bit float space (safe up to 2^53). */
function readU64LE(buf: Buffer | Uint8Array, offset: number): number {
  const lo = buf[offset] + buf[offset + 1] * 0x100 + buf[offset + 2] * 0x10000 + buf[offset + 3] * 0x1000000;
  const hi = buf[offset + 4] + buf[offset + 5] * 0x100 + buf[offset + 6] * 0x10000 + buf[offset + 7] * 0x1000000;
  return lo + hi * 0x100000000;
}

/** Resolve NFT image URI with reliable IPFS/Arweave gateway conversion */
function resolveImageUri(asset: DasAsset): string | undefined {
  // 1. Helius CDN-wrapped links (most reliable)
  let uri = asset.content?.links?.image;

  // 2. Files array — prefer cdn_uri (Helius CDN) over raw uri
  if (!uri) {
    const imageFile = asset.content?.files?.find(
      (f) => f.mime?.startsWith("image/") || f.uri?.match(/\.(png|jpg|jpeg|gif|webp)/i)
    );
    uri = imageFile?.cdn_uri || imageFile?.uri;
  }

  // 3. Any file with a cdn_uri (might be a thumbnail for video NFTs)
  if (!uri) {
    const anyFile = asset.content?.files?.find((f) => f.cdn_uri);
    uri = anyFile?.cdn_uri;
  }

  if (!uri) return undefined;

  // Convert IPFS to reliable gateway (Pinata > ipfs.io > dweb.link)
  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace("ipfs://", "");
    uri = IPFS_GATEWAYS[0] + cid;
  } else if (uri.includes("/ipfs/") && uri.includes("nftstorage.link")) {
    // Replace deprecated nftstorage.link with Pinata
    const cid = uri.split("/ipfs/")[1];
    uri = IPFS_GATEWAYS[0] + cid;
  }

  // Convert Arweave protocol URIs
  if (uri.startsWith("ar://")) {
    uri = "https://arweave.net/" + uri.replace("ar://", "");
  }

  return uri;
}

/** Fetch image + animation from off-chain metadata JSON as fallback */
async function fetchMetadataFromJsonUri(jsonUri: string): Promise<{ image?: string; animation_url?: string }> {
  try {
    const resp = await fetchWithTimeout(jsonUri, {}, 5000);
    if (!resp.ok) return {};
    const json = await resp.json() as { image?: string; animation_url?: string };
    let image = json.image;
    let animation = json.animation_url;
    if (image?.startsWith("ipfs://")) image = IPFS_GATEWAYS[0] + image.replace("ipfs://", "");
    if (image?.startsWith("ar://")) image = "https://arweave.net/" + image.replace("ar://", "");
    if (animation?.startsWith("ipfs://")) animation = IPFS_GATEWAYS[0] + animation.replace("ipfs://", "");
    if (animation?.startsWith("ar://")) animation = "https://arweave.net/" + animation.replace("ar://", "");
    return { image, animation_url: animation };
  } catch {
    return {};
  }
}

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

/** Route RPC calls through backend proxy when available (keeps API key server-side).
 *  Falls back to direct RPC if proxy is unavailable — portfolio viewing is essential
 *  and uses only public on-chain data, so direct RPC is acceptable as fallback. */
async function heliusRpc(method: string, params: unknown): Promise<unknown> {
  // Try backend proxy first (no API key in request)
  const proxyUrl = `${API_BASE_URL}/api/proxy/rpc`;
  try {
    const proxyResp = await fetchWithTimeout(
      proxyUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params }),
      },
      10000, // 10s timeout — don't block too long if proxy is down
    );
    if (proxyResp.ok) {
      const json = await proxyResp.json() as { result?: unknown; error?: { message: string } };
      if (json.error) throw new Error(`RPC: ${json.error.message}`);
      return json.result;
    }
  } catch {
    if (__DEV__) console.log("[RPC] Proxy unavailable, using direct RPC");
  }

  // Fallback: direct Helius RPC (uses EXPO_PUBLIC_HELIUS_RPC_URL if set at build time)
  if (!SOLANA_RPC_ENDPOINT || SOLANA_RPC_ENDPOINT.includes("YOUR_HELIUS_KEY")) {
    throw new Error("RPC endpoint not configured — set HELIUS_RPC_URL on backend");
  }
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

  /** Fetch all tokens + NFTs for a wallet via Helius DAS. */
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
        showUnverifiedCollections: true,  // include all collections (scam filter handles spam)
        showCollectionMetadata: true,      // get collection names/images
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

      // --- NFTs (blocklist approach: everything not fungible is a potential NFT) ---
      // Covers V1_NFT, V2_NFT, ProgrammableNFT, LEGACY_NFT, MplCoreAsset,
      // Token-2022 SBTs (Seeker Genesis Token, Moonbirds SBT), and future types.
      } else if (
        iface !== "FungibleToken" &&
        iface !== "FungibleAsset"
      ) {
        // Skip burned NFTs
        if ((asset as any).burnt) continue;

        const collectionGroup = asset.grouping?.find((g) => g.group_key === "collection");
        const collection = collectionGroup?.group_value;
        const name = asset.content?.metadata?.name ?? "Unknown NFT";

        // Skip compressed NFTs without collection (almost always spam)
        if (asset.compression?.compressed && !collection) continue;

        // Spam detection: flag but don't remove — user can reveal
        const isSpam = !collection || SCAM_NFT_PATTERN.test(name);

        // Collection name: prefer DAS collection_metadata, then parse from NFT name
        const collectionMeta = collectionGroup?.collection_metadata;
        const collectionName = collectionMeta?.name
          || name.replace(/#\d+\s*$/, "").replace(/\s*\d+\s*$/, "").trim()
          || undefined;

        // Animation URI: check content.links.animation_url or video files
        const animationUri = (asset.content?.links as any)?.animation_url
          || asset.content?.files?.find((f) => f.mime?.startsWith("video/") || f.mime?.startsWith("model/") || f.uri?.match(/\.(mp4|webm|gif|glb)$/i))?.cdn_uri
          || asset.content?.files?.find((f) => f.mime?.startsWith("video/") || f.mime?.startsWith("model/") || f.uri?.match(/\.(mp4|webm|gif|glb)$/i))?.uri;

        nfts.push({
          mint: asset.id,
          name,
          collection: collection || "unknown",
          collectionName,
          description: asset.content?.metadata?.description,
          imageUri: resolveImageUri(asset),
          animationUri: animationUri || undefined,
          jsonUri: asset.content?.json_uri,
          isSpam,
          estimatedValueUsd: undefined,
        });
      }
    }

    // Fallback: fetch images/animations from off-chain JSON for NFTs missing media
    const missingMedia = nfts.filter((n) => (!n.imageUri || !n.animationUri) && n.jsonUri);
    if (missingMedia.length > 0) {
      await Promise.allSettled(
        missingMedia.slice(0, 20).map(async (nft) => {
          const meta = await fetchMetadataFromJsonUri(nft.jsonUri!);
          if (!nft.imageUri && meta.image) nft.imageUri = meta.image;
          if (!nft.animationUri && meta.animation_url) nft.animationUri = meta.animation_url;
        })
      );
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

  /** Risk score: normalized HHI + volatility + IL + liquidation, weighted 0.3/0.3/0.2/0.2 */
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

    // Concentration risk: Normalized HHI on token weights
    // Raw HHI ranges from 1/n (perfect diversification) to 1.0 (all in one asset)
    // Normalize to 0-100 where 0 = fully diversified, 100 = single asset
    const n = tokens.length;
    const hhi = tokenValue > 0
      ? tokens.reduce((sum, t) => {
          const w = t.usdValue / tokenValue;
          return sum + w * w;
        }, 0)
      : 0;
    const minHhi = n > 0 ? 1 / n : 0;
    const concentrationRisk = n > 1
      ? Math.min(100, Math.round(((hhi - minHhi) / (1 - minHhi)) * 100))
      : (n === 1 ? 100 : 0);

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
   * Read staked SKR from on-chain UserStakeEntry accounts.
   * SKR staking uses an escrow/vault model — tokens leave the wallet.
   * Each user has a 169-byte PDA with staked_amount at offset 105 (u64, 9 decimals).
   * Also reads pending unstake amount (offset 153) and reward rate for pending rewards.
   */
  async getSkrStakeInfo(walletAddress: string): Promise<{ staked: number; liquid: number; pendingUnstake: number; pendingRewards: number }> {
    try {
      const walletPubkey = new PublicKey(walletAddress);

      // Find UserStakeEntry accounts for this wallet via getProgramAccounts
      // Wallet pubkey is at offset 41 in the 169-byte account
      const accounts = await this.connection.getProgramAccounts(SKR_STAKING_PROGRAM, {
        filters: [
          { dataSize: USER_STAKE_ENTRY_SIZE },
          { memcmp: { offset: 41, bytes: walletPubkey.toBase58() } },
        ],
      });

      if (accounts.length === 0) {
        if (__DEV__) console.log(`[SKR] No stake accounts found for ${walletAddress}`);
        return { staked: 0, liquid: 0, pendingUnstake: 0, pendingRewards: 0 };
      }

      // Read global reward rate from StakeConfig for pending rewards calculation
      let globalRewardPerToken = 0;
      try {
        const configInfo = await this.connection.getAccountInfo(new PublicKey(SKR_STAKE_CONFIG));
        if (configInfo?.data) {
          let configData: Uint8Array;
          if (Buffer.isBuffer(configInfo.data)) {
            configData = configInfo.data;
          } else if ((configInfo.data as any) instanceof Uint8Array) {
            configData = configInfo.data;
          } else if (Array.isArray(configInfo.data)) {
            configData = Buffer.from(configInfo.data[0] as string, "base64");
          } else {
            configData = new Uint8Array(0);
          }
          if (configData.length >= 145) {
            globalRewardPerToken = readU64LE(configData, 137);
          }
        }
      } catch { /* non-fatal — rewards will show as 0 */ }

      let totalStaked = 0;
      let totalPendingUnstake = 0;
      let totalPendingRewards = 0;

      for (const { account } of accounts) {
        // Ensure data is accessible as byte array (RN may return different types)
        let data: Uint8Array;
        if (Buffer.isBuffer(account.data)) {
          data = account.data;
        } else if ((account.data as any) instanceof Uint8Array) {
          data = account.data;
        } else if (Array.isArray(account.data)) {
          // @solana/web3.js sometimes returns [base64string, "base64"]
          data = Buffer.from(account.data[0] as string, "base64");
        } else {
          continue;
        }
        if (data.length < USER_STAKE_ENTRY_SIZE) continue;

        // staked_amount: u64 at offset 105 (raw lamports — SKR has 6 decimals)
        const skrDivisor = Math.pow(10, SKR_DECIMALS); // 1e6
        const stakedRaw = readU64LE(data, 105);
        const staked = stakedRaw / skrDivisor;
        totalStaked += staked;

        if (__DEV__) {
          const rawBytes = Array.from(data.slice(105, 113)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`[SKR] raw @105: ${rawBytes}, rawU64: ${stakedRaw}, ÷1e${SKR_DECIMALS}=${staked} tokens`);
        }

        // unstake_amount: u64 at offset 153 (tokens in cooldown)
        const unstakeRaw = readU64LE(data, 153);
        totalPendingUnstake += unstakeRaw / skrDivisor;

        // Pending rewards: staked_tokens * (global_rate - user_rate) / 1e9
        // Note: reward rate uses 1e9 precision multiplier (separate from token decimals)
        if (globalRewardPerToken > 0 && stakedRaw > 0) {
          const userRewardPerToken = readU64LE(data, 121);
          const rateDiff = globalRewardPerToken - userRewardPerToken;
          if (rateDiff > 0) {
            totalPendingRewards += (staked * rateDiff) / 1e9;
          }
        }
      }

      if (__DEV__) console.log(`[SKR] staked=${totalStaked}, pendingUnstake=${totalPendingUnstake}, rewards=${totalPendingRewards} for ${walletAddress}`);
      return { staked: totalStaked, liquid: 0, pendingUnstake: totalPendingUnstake, pendingRewards: totalPendingRewards };
    } catch (error) {
      if (__DEV__) console.warn("Failed to check SKR staking (non-fatal):", error);
      return { staked: 0, liquid: 0, pendingUnstake: 0, pendingRewards: 0 };
    }
  }

  /**
   * Build complete portfolio snapshot using Helius DAS API.
   * Includes LST detection for staked positions and correct SKR staking.
   */
  async getPortfolio(walletAddress: string): Promise<Portfolio> {
    const { detectStakedPositions, enrichWithLiveAPY } = await import("./defiDetectionService");

    // Fetch tokens/NFTs and SKR stake info in parallel
    const [{ tokens, nfts }, skrStakeInfo] = await Promise.all([
      this.getAssets(walletAddress),
      this.getSkrStakeInfo(walletAddress).catch(() => ({ staked: 0, liquid: 0, pendingUnstake: 0, pendingRewards: 0 })),
    ]);

    const skrToken = tokens.find((t) => t.mint === SKR_MINT);

    // Detect LST staked positions from token holdings
    const stakedPositions = detectStakedPositions(tokens);
    enrichWithLiveAPY(stakedPositions).catch(() => {}); // fire-and-forget APY enrichment

    // SKR staking uses escrow/vault: tokens leave wallet when staked.
    // Liquid SKR = what DAS reports in wallet. Staked principal + rewards from on-chain PDA.
    // Staked value is NOT in token balances (tokens left wallet), so add to total.
    const liquidSkrBalance = skrToken?.balance ?? 0;
    const stakedSkrPrincipal = skrStakeInfo.staked;
    const stakedSkrRewards = skrStakeInfo.pendingRewards;
    const totalStakedSkr = stakedSkrPrincipal + stakedSkrRewards;
    const skrPrice = skrToken?.priceUsd ?? 0;
    const stakedSkrValueUsd = totalStakedSkr * skrPrice;

    // Token value from DAS (liquid only). Staked SKR left the wallet, add separately.
    const tokenValue = tokens.reduce((sum, t) => sum + t.usdValue, 0);
    const defiPositions: DeFiPosition[] = [];
    const defiValue = defiPositions.reduce((sum, p) => sum + p.valueUsd, 0);
    const totalValueUsd = tokenValue + defiValue + stakedSkrValueUsd;

    const change24hUsd = tokens.reduce(
      (sum, t) => sum + (t.usdValue * t.change24h) / 100,
      0
    );
    const change24hPercent = totalValueUsd > 0 ? (change24hUsd / totalValueUsd) * 100 : 0;

    // Total staked SOL value across all LSTs
    const stakedSolValue = stakedPositions.reduce((sum, p) => sum + p.valueUsd, 0);

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
      skrBalance: liquidSkrBalance,
      skrStaked: stakedSkrPrincipal,
      skrStakedRewards: stakedSkrRewards,
      skrStakedValueUsd: stakedSkrValueUsd,
      stakedPositions,
      lastUpdated: new Date(),
    };
  }

  /**
   * Fetch and merge portfolios from multiple wallet addresses.
   * Tokens are merged by mint (balances summed), NFTs concatenated.
   */
  async getMultiWalletPortfolio(addresses: string[]): Promise<Portfolio> {
    const portfolios = await Promise.all(
      addresses.map((addr) => this.getPortfolio(addr).catch(() => null))
    );
    const valid = portfolios.filter(Boolean) as Portfolio[];
    if (valid.length === 0) throw new Error("Failed to fetch all wallets");
    if (valid.length === 1) return { ...valid[0], walletAddresses: addresses };

    // Merge tokens by mint — sum balances and USD values
    const tokenMap = new Map<string, TokenBalance>();
    for (const p of valid) {
      for (const t of p.tokens) {
        const existing = tokenMap.get(t.mint);
        if (existing) {
          existing.balance += t.balance;
          existing.usdValue += t.usdValue;
        } else {
          tokenMap.set(t.mint, { ...t });
        }
      }
    }
    const mergedTokens = Array.from(tokenMap.values()).sort((a, b) => b.usdValue - a.usdValue);

    // Merge NFTs — concatenate, deduplicate by mint
    const seenMints = new Set<string>();
    const mergedNfts: NFTHolding[] = [];
    for (const p of valid) {
      for (const nft of p.nfts) {
        if (!seenMints.has(nft.mint)) {
          seenMints.add(nft.mint);
          mergedNfts.push(nft);
        }
      }
    }

    // Merge staked positions
    const mergedStaked = valid.flatMap((p) => p.stakedPositions ?? []);

    const totalValueUsd = mergedTokens.reduce((s, t) => s + t.usdValue, 0);
    const change24hUsd = mergedTokens.reduce((s, t) => s + (t.usdValue * t.change24h) / 100, 0);

    return {
      walletAddress: addresses[0],
      walletAddresses: addresses,
      totalValueUsd,
      change24hUsd,
      change24hPercent: totalValueUsd > 0 ? (change24hUsd / totalValueUsd) * 100 : 0,
      tokens: mergedTokens,
      defiPositions: valid.flatMap((p) => p.defiPositions),
      nfts: mergedNfts,
      stakedSol: valid.reduce((s, p) => s + p.stakedSol, 0),
      stakedSolValueUsd: valid.reduce((s, p) => s + p.stakedSolValueUsd, 0),
      skrBalance: valid.reduce((s, p) => s + p.skrBalance, 0),
      skrStaked: valid.reduce((s, p) => s + p.skrStaked, 0),
      skrStakedRewards: valid.reduce((s, p) => s + p.skrStakedRewards, 0),
      skrStakedValueUsd: valid.reduce((s, p) => s + p.skrStakedValueUsd, 0),
      stakedPositions: mergedStaked.length > 0 ? mergedStaked : undefined,
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
    json_uri?: string;
  };
  grouping?: Array<{ group_key: string; group_value: string; collection_metadata?: { name?: string; image?: string } }>;
  compression?: { compressed: boolean };
}

export default PortfolioService;
