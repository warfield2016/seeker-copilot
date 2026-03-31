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
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { COLORS } from "../config/constants";
import { Portfolio, RiskScore } from "../types";
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

export default function PortfolioScreen() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [protocolSafety, setProtocolSafety] = useState<ProtocolSafety[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        data = await svc.getPortfolio(walletService.getAddress()!);
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
  }, []);

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
      {/* Portfolio Header */}
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
        {portfolio.walletAddress && portfolio.walletAddress !== "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" && (
          <TouchableOpacity
            style={styles.walletBadge}
            onPress={async () => {
              await Clipboard.setStringAsync(portfolio.walletAddress);
              Alert.alert("Copied", "Wallet address copied to clipboard");
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.walletAddr}>
              {portfolio.walletAddress.slice(0, 6)}...{portfolio.walletAddress.slice(-4)} 📋
            </Text>
          </TouchableOpacity>
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

      {/* Portfolio Chart */}
      <PortfolioChart currentValue={portfolio.totalValueUsd} change24hPercent={portfolio.change24hPercent} tokens={portfolio.tokens} />

      {/* SKR Banner */}
      {portfolio.skrBalance > 0 && (
        <View style={styles.skrBanner}>
          <View>
            <Text style={styles.skrLabel}>SKR</Text>
            <Text style={styles.skrBalance}>{portfolio.skrBalance.toLocaleString()}</Text>
            <Text style={styles.skrSublabel}>Liquid balance</Text>
          </View>
          <View style={styles.skrRight}>
            {portfolio.skrStaked > 0 ? (
              <>
                <Text style={styles.skrStakedValue}>{portfolio.skrStaked.toLocaleString()}</Text>
                <Text style={styles.skrStakedLabel}>Staked</Text>
                <Text style={styles.skrApr}>~19.4% APR</Text>
              </>
            ) : (
              <>
                <Text style={styles.skrStakedLabel}>Not staked</Text>
                <Text style={styles.skrStakedCta}>Stake for Pro</Text>
              </>
            )}
          </View>
        </View>
      )}

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
    borderWidth: 1,
    borderColor: COLORS.skr + "33",
    shadowColor: COLORS.skr,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  skrLabel: { color: COLORS.skr, fontWeight: "700", fontSize: 14 },
  skrBalance: { color: COLORS.text, fontWeight: "800", fontSize: 22 },
  skrRight: { alignItems: "flex-end" },
  skrSublabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  skrStakedLabel: { color: COLORS.textSecondary, fontSize: 11 },
  skrStakedValue: { color: COLORS.secondary, fontWeight: "800", fontSize: 20 },
  skrApr: { color: COLORS.success, fontSize: 11, fontWeight: "700", marginTop: 2 },
  skrStakedCta: { color: COLORS.primary, fontSize: 13, fontWeight: "700", marginTop: 2 },
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
