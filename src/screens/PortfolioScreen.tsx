import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  FlatList,
  TextInput,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { COLORS } from "../config/constants";
import { Portfolio, RiskScore, NFTHolding } from "../types";
import TokenRow from "../components/TokenRow";
import RiskGauge from "../components/RiskGauge";
import PortfolioChart from "../components/PortfolioChart";
import ShareCard from "../components/ShareCard";
import { SkeletonPortfolio } from "../components/Skeleton";
import PortfolioService from "../services/portfolioService";
import walletService from "../services/walletService";
import { DEMO_PORTFOLIO, DEMO_RISK, DEMO_SECURITY } from "../services/demoData";
import { ProtocolSafety } from "../types";
import aiService from "../services/aiService";
import { WalletContext } from "../../App";

export default function PortfolioScreen() {
  const { watchAddresses, disconnect, addWatchAddress, removeWatchAddress } = React.useContext(WalletContext);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [protocolSafety, setProtocolSafety] = useState<ProtocolSafety[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllNfts, setShowAllNfts] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFTHolding | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [showSpamNfts, setShowSpamNfts] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [watchInput, setWatchInput] = useState("");
  const [watchError, setWatchError] = useState("");
  // Track override URIs for images that failed with original URI
  const [imageOverrides, setImageOverrides] = useState<Map<string, string>>(new Map());

  /** Get the best image URI for an NFT, using override if original failed */
  const getNftImageUri = (nft: NFTHolding): string | undefined => {
    return imageOverrides.get(nft.mint) || nft.imageUri;
  };

  /** Handle image load failure — try alternate gateways for IPFS/Arweave */
  const handleImageError = (nft: NFTHolding) => {
    const uri = getNftImageUri(nft);
    if (!uri) {
      setFailedImages((prev) => new Set(prev).add(nft.mint));
      return;
    }
    // Try alternate IPFS gateways
    const gateways = ["gateway.pinata.cloud/ipfs/", "ipfs.io/ipfs/", "dweb.link/ipfs/", "4everland.io/ipfs/"];
    for (let i = 0; i < gateways.length - 1; i++) {
      if (uri.includes(gateways[i])) {
        const cid = uri.split("/ipfs/")[1];
        const newUri = "https://" + gateways[i + 1] + cid;
        setImageOverrides((prev) => new Map(prev).set(nft.mint, newUri));
        return;
      }
    }
    // Try alternate Arweave gateway
    if (uri.includes("arweave.net/")) {
      const txId = uri.split("arweave.net/")[1];
      setImageOverrides((prev) => new Map(prev).set(nft.mint, "https://ar-io.dev/" + txId));
      return;
    }
    // No more fallbacks
    setFailedImages((prev) => new Set(prev).add(nft.mint));
  };

  const fetchPortfolio = useCallback(async (ctrl: { aborted: boolean }) => {
    try {
      const isWeb = Platform.OS === "web";
      let data: Portfolio;
      let risk: RiskScore;

      if (isWeb || !walletService.isConnected()) {
        data = { ...DEMO_PORTFOLIO, lastUpdated: new Date() };
        risk = DEMO_RISK;
      } else {
        const svc = new PortfolioService(walletService.getConnection());
        const primaryAddr = walletService.getAddress()!;
        const allAddresses = [primaryAddr, ...watchAddresses];
        if (allAddresses.length > 1) {
          data = await svc.getMultiWalletPortfolio(allAddresses);
        } else {
          data = await svc.getPortfolio(primaryAddr);
        }
        risk = svc.calculateRiskScore(data.tokens, data.defiPositions);
      }

      if (ctrl.aborted) return;
      setPortfolio(data);
      setRiskScore(risk);
      setProtocolSafety(DEMO_SECURITY);

      // Fetch AI summary in background
      aiService.getPortfolioSummary(data)
        .then((s) => { if (!ctrl.aborted) setSummary(s); })
        .catch(() => {});
    } catch (err) {
      if (ctrl.aborted) return;
      setPortfolio({ ...DEMO_PORTFOLIO, lastUpdated: new Date() });
      setRiskScore(DEMO_RISK);
    } finally {
      if (!ctrl.aborted) setLoading(false);
    }
  }, [watchAddresses]);

  useEffect(() => {
    const ctrl = { aborted: false };
    fetchPortfolio(ctrl);
    return () => { ctrl.aborted = true; };
  }, [fetchPortfolio]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPortfolio({ aborted: false });
    setRefreshing(false);
  }, [fetchPortfolio]);

  if (loading) {
    return <SkeletonPortfolio />;
  }

  if (!portfolio) return null;

  const changeColor = portfolio.change24hPercent >= 0 ? COLORS.success : COLORS.danger;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Portfolio Header with Wallet Management */}
      <View style={styles.header}>
        <Text style={styles.totalLabel}>TOTAL PORTFOLIO VALUE</Text>
        <Text style={styles.totalValue}>
          ${portfolio.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={[styles.change, { color: changeColor }]}>
          {portfolio.change24hPercent >= 0 ? "+" : ""}{portfolio.change24hPercent.toFixed(2)}%{" "}
          <Text style={{ fontWeight: "400" }}>
            (${Math.abs(portfolio.change24hUsd).toFixed(2)}) today
          </Text>
        </Text>

        {/* Wallet address + management toggle */}
        <TouchableOpacity
          style={styles.walletBadge}
          onPress={() => setShowWalletMenu(!showWalletMenu)}
          activeOpacity={0.7}
        >
          <Text style={styles.walletAddr}>
            {portfolio.walletAddresses && portfolio.walletAddresses.length > 1
              ? `Bundled (${portfolio.walletAddresses.length} wallets)`
              : portfolio.walletAddress && portfolio.walletAddress !== "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                ? `${portfolio.walletAddress.slice(0, 6)}...${portfolio.walletAddress.slice(-4)}`
                : "Demo wallet"
            }
            {showWalletMenu ? " ▲" : " ▼"}
          </Text>
        </TouchableOpacity>

        {/* Expandable wallet management panel */}
        {showWalletMenu && (
          <View style={styles.walletPanel}>
            {/* Primary wallet with copy + disconnect */}
            {portfolio.walletAddress && portfolio.walletAddress !== "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" && (
              <View style={styles.walletRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={async () => {
                    await Clipboard.setStringAsync(portfolio.walletAddress);
                    Alert.alert("Copied", "Wallet address copied");
                  }}
                >
                  <Text style={styles.walletRowLabel}>Primary</Text>
                  <Text style={styles.walletRowAddr}>{portfolio.walletAddress.slice(0, 8)}...{portfolio.walletAddress.slice(-6)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => {
                    Alert.alert("Disconnect", "Disconnect your wallet?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Disconnect", style: "destructive", onPress: () => disconnect() },
                    ]);
                  }}
                >
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Watch wallets */}
            {watchAddresses.map((addr, i) => (
              <View key={addr} style={styles.walletRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletRowLabel}>Watch #{i + 1}</Text>
                  <Text style={styles.walletRowAddr}>{addr.slice(0, 8)}...{addr.slice(-6)}</Text>
                </View>
                <TouchableOpacity onPress={() => removeWatchAddress(addr)}>
                  <Text style={styles.removeWatchText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Add watch wallet */}
            <View style={styles.addWatchRow}>
              <TextInput
                style={styles.watchInput}
                placeholder="Paste Solana address..."
                placeholderTextColor={COLORS.textMuted}
                value={watchInput}
                onChangeText={(t) => { setWatchInput(t); setWatchError(""); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.addWatchBtn}
                onPress={async () => {
                  const addr = watchInput.trim();
                  if (!addr) return;
                  try {
                    // Validate Solana address (base58, 32-44 chars)
                    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) throw new Error("Invalid");
                    await addWatchAddress(addr);
                    setWatchInput("");
                    setWatchError("");
                  } catch {
                    setWatchError("Invalid Solana address");
                  }
                }}
              >
                <Text style={styles.addWatchBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            {watchError ? <Text style={styles.watchErrorText}>{watchError}</Text> : null}
            <TouchableOpacity
              style={styles.pasteBtn}
              onPress={async () => {
                const text = await Clipboard.getStringAsync();
                if (text) setWatchInput(text.trim());
              }}
            >
              <Text style={styles.pasteBtnText}>Paste from clipboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* AI Summary — structured bullet card */}
      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
            <Text style={styles.summaryLabel}>Analysis</Text>
          </View>
          {summary.replace(/\*\*/g, "").split(/\.\s+/).filter(Boolean).map((line, i) => (
            <View key={i} style={styles.summaryRow}>
              <Text style={styles.summaryDot}>●</Text>
              <Text style={styles.summaryText}>{line.trim()}{line.trim().endsWith(".") ? "" : "."}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Portfolio Chart — includes staked SKR in allocation */}
      <PortfolioChart
        currentValue={portfolio.totalValueUsd}
        change24hPercent={portfolio.change24hPercent}
        tokens={[
          ...portfolio.tokens,
          // Inject staked SKR as a synthetic token for pie chart
          ...(portfolio.skrStaked > 0 && portfolio.skrStakedValueUsd > 0 ? [{
            mint: "skr-staked",
            symbol: "SKR Staked",
            name: "SKR (Staked)",
            balance: portfolio.skrStaked + portfolio.skrStakedRewards,
            decimals: 6,
            usdValue: portfolio.skrStakedValueUsd,
            priceUsd: 0,
            change24h: 0,
          }] : []),
        ]}
      />

      {/* Staked Positions (LSTs) */}
      {portfolio.stakedPositions && portfolio.stakedPositions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Staked ({portfolio.stakedPositions.length})</Text>
          <View style={styles.stakedList}>
            {portfolio.stakedPositions.map((pos) => (
              <View key={pos.mint} style={styles.stakedRow}>
                <View style={styles.stakedLeft}>
                  <Text style={styles.stakedSymbol}>{pos.symbol}</Text>
                  <Text style={styles.stakedProtocol}>{pos.protocol}</Text>
                </View>
                <View style={styles.stakedCenter}>
                  <Text style={styles.stakedBalance}>{pos.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</Text>
                </View>
                <View style={styles.stakedRight}>
                  <Text style={styles.stakedValue}>${pos.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                  <Text style={styles.stakedApy}>{pos.aprEstimate.toFixed(1)}% APR</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Risk Score */}
      {riskScore && <RiskGauge riskScore={riskScore} />}

      {/* DeFi Positions */}
      {portfolio.defiPositions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DeFi Positions ({portfolio.defiPositions.length})</Text>
          {portfolio.defiPositions.map((pos, i) => {
            const safety = protocolSafety.find((s) => s.protocol.toLowerCase() === pos.protocol.toLowerCase());
            const safetyColor = safety
              ? safety.risk_level === "low" ? COLORS.success
                : safety.risk_level === "medium" ? COLORS.warning
                : COLORS.danger
              : COLORS.textSecondary;
            return (
              <View key={i} style={styles.defiRow}>
                <View style={styles.defiLeft}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.defiProtocol}>{pos.protocol}</Text>
                    {safety && (
                      <View style={[styles.safetyBadge, { backgroundColor: safetyColor + "22" }]}>
                        <Text style={[styles.safetyBadgeText, { color: safetyColor }]}>{safety.safety_score}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.defiType}>{pos.type.toUpperCase()}</Text>
                </View>
                <View style={styles.defiRight}>
                  <Text style={styles.defiValue}>${pos.valueUsd.toFixed(2)}</Text>
                  {pos.apy != null && <Text style={styles.defiApy}>{pos.apy.toFixed(1)}% APY</Text>}
                  {pos.unrealizedPnl != null && (
                    <Text style={[styles.defiPnl, { color: pos.unrealizedPnl >= 0 ? COLORS.success : COLORS.danger }]}>
                      {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Token Holdings — includes staked SKR as a separate row */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Holdings ({portfolio.tokens.length + (portfolio.skrStaked > 0 ? 1 : 0)})</Text>
        <View style={styles.tokenList}>
          {/* Staked SKR row at top if user has staked tokens */}
          {portfolio.skrStaked > 0 && (
            <TokenRow
              token={{
                mint: "skr-staked",
                symbol: "SKR Staked",
                name: "SKR (Staked)",
                balance: portfolio.skrStaked + portfolio.skrStakedRewards,
                decimals: 6,
                usdValue: portfolio.skrStakedValueUsd,
                priceUsd: portfolio.skrStakedValueUsd / (portfolio.skrStaked + portfolio.skrStakedRewards || 1),
                change24h: 0,
                logoUri: portfolio.tokens.find(t => t.symbol === "SKR")?.logoUri,
              }}
            />
          )}
          {portfolio.tokens.map((token) => (
            <TokenRow key={token.mint} token={token} />
          ))}
        </View>
      </View>

      {/* Collectibles — spam filtered with reveal button */}
      {portfolio.nfts.length > 0 && (() => {
        const verifiedNfts = portfolio.nfts.filter((n) => !n.isSpam);
        const spamNfts = portfolio.nfts.filter((n) => n.isSpam);
        const displayNfts = showSpamNfts ? portfolio.nfts : verifiedNfts;
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Collectibles ({verifiedNfts.length})</Text>
            <View style={styles.nftGrid}>
              {displayNfts.slice(0, 4).map((nft) => (
                <TouchableOpacity key={nft.mint} style={[styles.nftCard, nft.isSpam && { opacity: 0.5, borderColor: COLORS.danger + "44" }]} activeOpacity={0.7} onPress={() => setSelectedNft(nft)}>
                  {getNftImageUri(nft) && !failedImages.has(nft.mint) ? (
                    <Image
                      source={{ uri: getNftImageUri(nft) }}
                      style={styles.nftImage}
                      resizeMode="cover"
                      onError={() => handleImageError(nft)}
                    />
                  ) : (
                    <View style={styles.nftImagePlaceholder}>
                      <Text style={styles.nftPlaceholderEmoji}>{nft.name?.match(/#\d+/) ? nft.name.match(/#\d+/)?.[0] : nft.name?.[0] ?? "?"}</Text>
                      <Text style={styles.nftPlaceholderSub}>No image</Text>
                    </View>
                  )}
                  <View style={styles.nftInfo}>
                    <Text style={styles.nftName} numberOfLines={1}>{nft.name}</Text>
                    {nft.collectionName && (
                      <Text style={styles.nftCollection} numberOfLines={1}>{nft.collectionName}</Text>
                    )}
                    {nft.isSpam && <Text style={{ color: COLORS.danger, fontSize: 8, paddingHorizontal: 8 }}>SPAM</Text>}
                  </View>
                </TouchableOpacity>
              ))}
              {displayNfts.length > 4 && (
                <TouchableOpacity style={[styles.nftCard, styles.nftMoreCard]} activeOpacity={0.7} onPress={() => setShowAllNfts(true)}>
                  <Text style={styles.nftMore}>+{displayNfts.length - 4}</Text>
                  <Text style={styles.nftMoreLabel}>View all</Text>
                </TouchableOpacity>
              )}
            </View>
            {spamNfts.length > 0 && (
              <TouchableOpacity
                style={styles.spamToggle}
                onPress={() => setShowSpamNfts(!showSpamNfts)}
                activeOpacity={0.7}
              >
                <Text style={styles.spamToggleText}>
                  {showSpamNfts ? "Hide" : "Show"} {spamNfts.length} hidden NFT{spamNfts.length > 1 ? "s" : ""}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })()}

      {/* NFT Gallery Modal — show all NFTs */}
      <Modal visible={showAllNfts} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.nftModalHeader}>
            <Text style={styles.nftModalTitle}>All NFTs ({portfolio.nfts.length})</Text>
            <TouchableOpacity onPress={() => setShowAllNfts(false)} activeOpacity={0.7}>
              <Text style={styles.nftModalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={portfolio.nfts}
            numColumns={3}
            keyExtractor={(item) => item.mint}
            contentContainerStyle={{ padding: 10 }}
            columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
            renderItem={({ item: nft }) => (
              <TouchableOpacity style={[styles.nftCard, { flex: 1, width: "auto" }]} activeOpacity={0.7} onPress={() => { setShowAllNfts(false); setSelectedNft(nft); }}>
                {getNftImageUri(nft) && !failedImages.has(nft.mint) ? (
                  <Image
                    source={{ uri: getNftImageUri(nft) }}
                    style={[styles.nftImage, { width: "100%", height: undefined, aspectRatio: 1 }]}
                    resizeMode="cover"
                    onError={() => handleImageError(nft)}
                  />
                ) : (
                  <View style={[styles.nftImagePlaceholder, { width: "100%", height: undefined, aspectRatio: 1 }]}>
                    <Text style={styles.nftPlaceholderEmoji}>{nft.name?.match(/#\d+/) ? nft.name.match(/#\d+/)?.[0] : nft.name?.[0] ?? "?"}</Text>
                    <Text style={styles.nftPlaceholderSub}>No image</Text>
                  </View>
                )}
                <View style={styles.nftInfo}>
                  <Text style={styles.nftName} numberOfLines={1}>{nft.name}</Text>
                  {nft.collectionName && <Text style={styles.nftCollection} numberOfLines={1}>{nft.collectionName}</Text>}
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* NFT Detail Modal */}
      <Modal visible={!!selectedNft} animationType="fade" transparent statusBarTranslucent>
        <TouchableOpacity style={styles.nftDetailBackdrop} activeOpacity={1} onPress={() => setSelectedNft(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.nftDetailCard} onPress={() => {}}>
            {selectedNft && (
              <>
                {getNftImageUri(selectedNft) && !failedImages.has(selectedNft.mint) ? (
                  <Image
                    source={{ uri: getNftImageUri(selectedNft) }}
                    style={styles.nftDetailImage}
                    resizeMode="contain"
                    onError={() => handleImageError(selectedNft)}
                  />
                ) : (
                  <View style={[styles.nftImagePlaceholder, { width: "100%", height: 260, borderRadius: 14 }]}>
                    <Text style={[styles.nftPlaceholderEmoji, { fontSize: 48 }]}>{selectedNft.name?.[0] ?? "?"}</Text>
                    <Text style={[styles.nftPlaceholderSub, { fontSize: 12 }]}>Image unavailable</Text>
                  </View>
                )}
                <Text style={styles.nftDetailName}>{selectedNft.name}</Text>
                {selectedNft.collectionName && (
                  <View style={styles.nftDetailCollectionBadge}>
                    <Text style={styles.nftDetailCollection}>{selectedNft.collectionName}</Text>
                  </View>
                )}
                {selectedNft.collection && !selectedNft.collectionName && (
                  <View style={styles.nftDetailCollectionBadge}>
                    <Text style={styles.nftDetailCollection}>
                      {selectedNft.collection.slice(0, 8)}...{selectedNft.collection.slice(-6)}
                    </Text>
                  </View>
                )}
                {selectedNft.description && (
                  <Text style={styles.nftDetailDescription} numberOfLines={6}>{selectedNft.description}</Text>
                )}
                <Text style={styles.nftDetailMint}>Mint: {selectedNft.mint.slice(0, 12)}...{selectedNft.mint.slice(-8)}</Text>
                <TouchableOpacity style={styles.nftDetailCloseBtn} onPress={() => setSelectedNft(null)} activeOpacity={0.7}>
                  <Text style={styles.nftDetailCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Share Card */}
      <ShareCard portfolio={portfolio} riskScore={riskScore} />

      <Text style={styles.lastUpdated}>Updated {portfolio.lastUpdated.toLocaleTimeString()}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingTop: 20, paddingBottom: 16, paddingHorizontal: 24, alignItems: "center" },
  totalLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" },
  totalValue: { color: COLORS.text, fontSize: 34, fontWeight: "800", letterSpacing: -1 },
  change: { fontSize: 15, fontWeight: "600", marginTop: 6 },
  walletBadge: {
    marginTop: 8,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.glow,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  summaryHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  aiBadge: {
    backgroundColor: COLORS.primary + "33",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  aiBadgeText: { color: COLORS.primary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  summaryLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },
  summaryRow: { flexDirection: "row", marginBottom: 4, paddingRight: 8 },
  summaryDot: { color: COLORS.primary, fontSize: 8, marginTop: 5, marginRight: 8, width: 10 },
  summaryText: { color: COLORS.text, fontSize: 13, lineHeight: 19, flex: 1 },
  // SKR banner removed — staked SKR now shown in pie chart + holdings
  section: { marginTop: 16 },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tokenList: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.glow,
  },
  defiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.glow,
  },
  defiLeft: {},
  defiProtocol: { color: COLORS.text, fontWeight: "700", fontSize: 15 },
  defiType: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  defiRight: { alignItems: "flex-end" },
  defiValue: { color: COLORS.text, fontWeight: "600", fontSize: 15 },
  defiApy: { color: COLORS.secondary, fontSize: 12, marginTop: 2 },
  defiPnl: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  safetyBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  safetyBadgeText: { fontSize: 10, fontWeight: "800" },
  walletAddr: { color: COLORS.textSecondary, fontSize: 12, marginTop: 6, fontFamily: "Courier" },
  bundledBadge: {
    marginTop: 6,
    backgroundColor: COLORS.secondary + "22",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  bundledText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: "700",
  },
  lastUpdated: { color: COLORS.textSecondary, fontSize: 12, textAlign: "center", paddingVertical: 24 },
  stakedList: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.secondary + "33",
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  stakedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stakedLeft: { flex: 1 },
  stakedSymbol: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  stakedProtocol: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  stakedCenter: { flex: 1, alignItems: "center" },
  stakedBalance: { color: COLORS.textSecondary, fontSize: 13 },
  stakedRight: { flex: 1, alignItems: "flex-end" },
  stakedValue: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  stakedApy: { color: COLORS.success, fontSize: 11, fontWeight: "700", marginTop: 2 },
  nftGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
  },
  nftCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    width: 108,
    borderWidth: 1,
    borderColor: COLORS.glow,
    overflow: "hidden",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  nftImage: {
    width: 108,
    height: 108,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  nftImagePlaceholder: {
    width: 108,
    height: 108,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  nftPlaceholderEmoji: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  nftPlaceholderSub: {
    color: COLORS.textMuted,
    fontSize: 8,
    marginTop: 4,
  },
  nftInfo: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  nftName: { color: COLORS.text, fontSize: 11, fontWeight: "700" },
  nftCollection: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  nftMoreCard: {
    justifyContent: "center",
    alignItems: "center",
    height: 108,
    borderStyle: "dashed" as any,
  },
  nftMore: { color: COLORS.primary, fontSize: 22, fontWeight: "800" },
  nftMoreLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "600", marginTop: 2 },
  nftModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  nftModalTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  nftModalClose: { color: COLORS.primary, fontSize: 15, fontWeight: "700" },
  nftDetailBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  nftDetailCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: COLORS.glow,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  nftDetailImage: {
    width: "100%",
    height: 260,
    borderRadius: 14,
    marginBottom: 16,
    backgroundColor: COLORS.surfaceLight,
  },
  nftDetailName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  nftDetailCollectionBadge: {
    backgroundColor: COLORS.primary + "18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  nftDetailCollection: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  nftDetailDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  nftDetailMint: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontFamily: "Courier",
    marginBottom: 16,
  },
  nftDetailCloseBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  nftDetailCloseBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  // Wallet management panel
  walletPanel: {
    width: "100%",
    marginTop: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.glow,
  },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  walletRowLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: "600" },
  walletRowAddr: { color: COLORS.text, fontSize: 12, fontFamily: "Courier", marginTop: 2 },
  disconnectBtn: {
    backgroundColor: COLORS.danger + "22",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  disconnectText: { color: COLORS.danger, fontSize: 11, fontWeight: "700" },
  removeWatchText: { color: COLORS.danger, fontSize: 11, fontWeight: "600" },
  addWatchRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  watchInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 12,
  },
  addWatchBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  addWatchBtnText: { color: COLORS.text, fontSize: 12, fontWeight: "700" },
  watchErrorText: { color: COLORS.danger, fontSize: 10, marginTop: 4 },
  pasteBtn: { marginTop: 6, alignSelf: "center" },
  pasteBtnText: { color: COLORS.primary, fontSize: 11, fontWeight: "600" },
  // Spam NFT toggle
  spamToggle: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
  },
  spamToggleText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
});
