import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { COLORS } from "../config/constants";
import { Portfolio, RiskScore } from "../types";
import TokenRow from "../components/TokenRow";
import RiskGauge from "../components/RiskGauge";
import PortfolioChart from "../components/PortfolioChart";
import ShareCard from "../components/ShareCard";
import PortfolioService from "../services/portfolioService";
import walletService from "../services/walletService";
import { DEMO_PORTFOLIO, DEMO_RISK, DEMO_SECURITY } from "../services/demoData";
import { ProtocolSafety } from "../types";
import aiService from "../services/aiService";

export default function PortfolioScreen() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [protocolSafety, setProtocolSafety] = useState<ProtocolSafety[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPortfolio = useCallback(async (aborted = false) => {
    try {
      const isWeb = Platform.OS === "web";
      let data: Portfolio;
      let risk: RiskScore;

      if (isWeb || !walletService.isConnected()) {
        // Demo mode for web / grant presentations
        data = { ...DEMO_PORTFOLIO, lastUpdated: new Date() };
        risk = DEMO_RISK;
      } else {
        const svc = new PortfolioService(walletService.getConnection());
        data = await svc.getPortfolio(walletService.getAddress()!);
        risk = svc.calculateRiskScore(data.tokens, data.defiPositions);
      }

      setPortfolio(data);
      setRiskScore(risk);
      setProtocolSafety(DEMO_SECURITY);

      // Fetch AI summary in background (guarded by abort flag)
      if (!aborted) {
        aiService.getPortfolioSummary(data).then((s) => { if (!aborted) setSummary(s); }).catch(() => {});
      }
    } catch (err) {
      // Fallback to demo
      setPortfolio({ ...DEMO_PORTFOLIO, lastUpdated: new Date() });
      setRiskScore(DEMO_RISK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let aborted = false;
    fetchPortfolio(aborted);
    return () => { aborted = true; };
  }, [fetchPortfolio]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPortfolio();
    setRefreshing(false);
  }, [fetchPortfolio]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading portfolio...</Text>
      </View>
    );
  }

  if (!portfolio) return null;

  const changeColor = portfolio.change24hPercent >= 0 ? COLORS.success : COLORS.danger;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Portfolio Header */}
      <View style={styles.header}>
        <Text style={styles.totalLabel}>Total Portfolio Value</Text>
        <Text style={styles.totalValue}>
          ${portfolio.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={[styles.change, { color: changeColor }]}>
          {portfolio.change24hPercent >= 0 ? "+" : ""}{portfolio.change24hPercent.toFixed(2)}% (${Math.abs(portfolio.change24hUsd).toFixed(2)}) today
        </Text>
        {portfolio.walletAddress && portfolio.walletAddress !== "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" && (
          <Text style={styles.walletAddr}>
            {portfolio.walletAddress.slice(0, 4)}...{portfolio.walletAddress.slice(-4)}
          </Text>
        )}
      </View>

      {/* AI Summary */}
      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>AI Summary</Text>
          <Text style={styles.summaryText}>{summary.replace(/\*\*/g, "").replace(/^[-*] /gm, "  \u2022 ")}</Text>
        </View>
      )}

      {/* Portfolio Chart */}
      <PortfolioChart currentValue={portfolio.totalValueUsd} change24hPercent={portfolio.change24hPercent} />

      {/* SKR Banner */}
      {portfolio.skrBalance > 0 && (
        <View style={styles.skrBanner}>
          <View>
            <Text style={styles.skrLabel}>SKR</Text>
            <Text style={styles.skrBalance}>{portfolio.skrBalance.toLocaleString()}</Text>
          </View>
          <View style={styles.skrRight}>
            <Text style={styles.skrStakedLabel}>{portfolio.skrStaked > 0 ? "Staked" : "Not staked"}</Text>
            <Text style={styles.skrStakedValue}>
              {portfolio.skrStaked > 0 ? portfolio.skrStaked.toLocaleString() : "Stake for Pro"}
            </Text>
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

      {/* Token Holdings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Holdings ({portfolio.tokens.length})</Text>
        <View style={styles.tokenList}>
          {portfolio.tokens.map((token) => (
            <TokenRow key={token.mint} token={token} />
          ))}
        </View>
      </View>

      {/* NFT Count */}
      {portfolio.nfts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NFTs ({portfolio.nfts.length})</Text>
          <View style={styles.nftRow}>
            {portfolio.nfts.slice(0, 6).map((nft) => (
              <View key={nft.mint} style={styles.nftCard}>
                <Text style={styles.nftName} numberOfLines={1}>{nft.name}</Text>
                {nft.collection && (
                  <Text style={styles.nftCollection} numberOfLines={1}>{nft.collection.slice(0, 8)}...</Text>
                )}
              </View>
            ))}
            {portfolio.nfts.length > 6 && (
              <View style={styles.nftCard}>
                <Text style={styles.nftMore}>+{portfolio.nfts.length - 6} more</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Share Card */}
      <ShareCard portfolio={portfolio} riskScore={riskScore} />

      <Text style={styles.lastUpdated}>Updated {portfolio.lastUpdated.toLocaleTimeString()}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  loadingText: { color: COLORS.textSecondary, marginTop: 12, fontSize: 14 },
  header: { padding: 24, alignItems: "center" },
  totalLabel: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 4 },
  totalValue: { color: COLORS.text, fontSize: 36, fontWeight: "800" },
  change: { fontSize: 16, fontWeight: "600", marginTop: 4 },
  summaryCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  summaryLabel: { color: COLORS.primary, fontSize: 12, fontWeight: "700", marginBottom: 6, letterSpacing: 0.5 },
  summaryText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  skrBanner: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.skr,
  },
  skrLabel: { color: COLORS.skr, fontWeight: "700", fontSize: 14 },
  skrBalance: { color: COLORS.text, fontWeight: "800", fontSize: 22 },
  skrRight: { alignItems: "flex-end" },
  skrStakedLabel: { color: COLORS.textSecondary, fontSize: 12 },
  skrStakedValue: { color: COLORS.secondary, fontWeight: "700", fontSize: 16 },
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
  tokenList: { backgroundColor: COLORS.surface, marginHorizontal: 16, borderRadius: 12, overflow: "hidden" },
  defiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
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
  lastUpdated: { color: COLORS.textSecondary, fontSize: 12, textAlign: "center", paddingVertical: 24 },
  nftRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8 },
  nftCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 10,
    minWidth: 90,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nftName: { color: COLORS.text, fontSize: 11, fontWeight: "600" },
  nftCollection: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
  nftMore: { color: COLORS.primary, fontSize: 11, fontWeight: "700" },
});
