import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { COLORS, SKR_MINT, SKR_DECIMALS } from "../config/constants";
import { Portfolio, TradeRecommendation, TrendSignal, ProtocolSafety, SwapParams } from "../types";
import { DEMO_PORTFOLIO, DEMO_RECOMMENDATIONS, DEMO_TRENDS, DEMO_SECURITY } from "../services/demoData";
import aiService from "../services/aiService";
import PortfolioService from "../services/portfolioService";
import walletService from "../services/walletService";
import SwapSheet from "../components/SwapSheet";

// Map common symbols → mint addresses for one-tap swap execution
const SYMBOL_TO_MINT: Record<string, { mint: string; decimals: number }> = {
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  SKR: { mint: SKR_MINT, decimals: SKR_DECIMALS },
  JUP: { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 },
  JTO: { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", decimals: 9 },
  BONK: { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
  WIF: { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6 },
  mSOL: { mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", decimals: 9 },
  JitoSOL: { mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", decimals: 9 },
  bSOL: { mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1", decimals: 9 },
};

const ACTION_COLORS: Record<string, string> = {
  buy: COLORS.success,
  sell: COLORS.danger,
  hold: COLORS.warning,
  rebalance: COLORS.primary,
};

const CATEGORY_COLORS: Record<string, string> = {
  momentum: COLORS.secondary,
  narrative: COLORS.primary,
  opportunity: COLORS.success,
  risk: COLORS.danger,
};

const SAFETY_COLORS: Record<string, string> = {
  low: COLORS.success,
  medium: COLORS.warning,
  high: COLORS.danger,
  critical: "#FF0040",
};

type Tab = "signals" | "trends" | "security" | "info";

export default function RecommendationsScreen() {
  const [tab, setTab] = useState<Tab>("signals");
  const [recs, setRecs] = useState<TradeRecommendation[]>([]);
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [security, setSecurity] = useState<ProtocolSafety[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agentMeta, setAgentMeta] = useState<{ latency_seconds?: number; agents_run?: number } | null>(null);
  const [userPortfolio, setUserPortfolio] = useState<Portfolio | null>(null);

  // Swap sheet state — opens when user taps "Swap Now" on a recommendation
  const [swapSheet, setSwapSheet] = useState<{
    visible: boolean;
    inputMint: string; outputMint: string;
    inputSymbol: string; outputSymbol: string;
    inputDecimals: number; outputDecimals: number;
    inputAmount: number;
  } | null>(null);

  const handleSwapNow = (rec: TradeRecommendation) => {
    if (!rec.swap_params) {
      Alert.alert("Not executable", "This recommendation does not include swap parameters.");
      return;
    }
    if (!walletService.isConnected() || !userPortfolio) {
      Alert.alert("Wallet required", "Please connect your wallet to execute trades.");
      return;
    }
    const params = rec.swap_params;
    const inMeta = SYMBOL_TO_MINT[params.input_symbol];
    const outMeta = SYMBOL_TO_MINT[params.output_symbol];
    if (!inMeta || !outMeta) {
      Alert.alert("Unsupported token", `Token ${params.input_symbol} or ${params.output_symbol} is not yet supported for in-app swaps.`);
      return;
    }
    // Compute input amount from user's holding * percentage
    const holding = userPortfolio.tokens.find((t) => t.symbol === params.input_symbol);
    if (!holding || holding.balance <= 0) {
      Alert.alert("No balance", `You don't hold any ${params.input_symbol} to swap.`);
      return;
    }
    const amount = holding.balance * (params.input_amount_pct / 100);
    if (amount <= 0) {
      Alert.alert("Amount too small", "Suggested swap amount is too small to execute.");
      return;
    }
    setSwapSheet({
      visible: true,
      inputMint: inMeta.mint,
      outputMint: outMeta.mint,
      inputSymbol: params.input_symbol,
      outputSymbol: params.output_symbol,
      inputDecimals: inMeta.decimals,
      outputDecimals: outMeta.decimals,
      inputAmount: amount,
    });
  };

  const fetchAll = useCallback(async () => {
    try {
      // Use real portfolio if wallet is connected, otherwise demo
      let portfolio: Portfolio = DEMO_PORTFOLIO;
      if (Platform.OS !== "web" && walletService.isConnected()) {
        try {
          const svc = new PortfolioService(walletService.getConnection());
          portfolio = await svc.getPortfolio(walletService.getAddress()!);
        } catch { /* fall back to demo */ }
      }
      setUserPortfolio(portfolio);
      const result = await aiService.getDeepAnalysis(portfolio);
      if (result) {
        setRecs(result.recommendations?.length > 0 ? result.recommendations : DEMO_RECOMMENDATIONS);
        setTrends(result.trends?.length > 0 ? result.trends : DEMO_TRENDS);
        setSecurity(result.security?.length > 0 ? result.security : DEMO_SECURITY);
        setAgentMeta(result.meta || null);
      } else {
        setRecs(DEMO_RECOMMENDATIONS);
        setTrends(DEMO_TRENDS);
        setSecurity(DEMO_SECURITY);
      }
    } catch {
      setRecs(DEMO_RECOMMENDATIONS);
      setTrends(DEMO_TRENDS);
      setSecurity(DEMO_SECURITY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // Animated progress steps for the multi-agent pipeline
  const [loadStep, setLoadStep] = React.useState(0);
  const pipelineSteps = [
    "Analyzing risk factors...",
    "Scanning market trends...",
    "Auditing protocol security...",
    "Generating trade signals...",
    "Cross-validating results...",
  ];
  React.useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadStep((s) => Math.min(s + 1, pipelineSteps.length - 1));
    }, 12000); // ~12s per step = ~60s total visual
    return () => clearInterval(interval);
  }, [loading]);

  if (loading) {
    const progress = ((loadStep + 1) / pipelineSteps.length) * 100;
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>{pipelineSteps[loadStep]}</Text>
        <Text style={styles.loadingSub}>Agent {loadStep + 1} of {pipelineSteps.length}</Text>
        {/* Progress bar */}
        <View style={{ width: 200, height: 3, backgroundColor: COLORS.surfaceLight, borderRadius: 2, marginTop: 16 }}>
          <View style={{ width: `${progress}%` as any, height: 3, backgroundColor: COLORS.primary, borderRadius: 2 }} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <Text style={styles.header}>Intelligence Hub</Text>
      {agentMeta && (
        <Text style={styles.metaText}>
          {agentMeta.agents_run} agents · {agentMeta.latency_seconds}s
        </Text>
      )}

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(["signals", "trends", "security", "info"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "signals" ? `Signals (${recs.length})`
                : t === "trends" ? `Trends (${trends.length})`
                : t === "security" ? `Security (${security.length})`
                : "How It Works"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Signals Tab */}
      {tab === "signals" && recs.map((rec, i) => {
        const color = ACTION_COLORS[rec.action] ?? COLORS.textSecondary;
        const isExecutable = !!rec.swap_params && !!SYMBOL_TO_MINT[rec.swap_params.input_symbol]
          && !!SYMBOL_TO_MINT[rec.swap_params.output_symbol];
        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.badge, { backgroundColor: color + "22" }]}>
                <Text style={[styles.badgeText, { color }]}>{rec.action.toUpperCase()}</Text>
              </View>
              <Text style={styles.token}>{rec.token}</Text>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreLabel}>Confidence</Text>
                <Text style={[styles.score, { color }]}>{rec.confidence}%</Text>
              </View>
            </View>
            <Text style={styles.description}>{rec.reason}</Text>
            {rec.risk_note && (
              <Text style={styles.riskNote}>⚠ {rec.risk_note}</Text>
            )}
            {isExecutable && (
              <TouchableOpacity style={styles.swapNowBtn} onPress={() => handleSwapNow(rec)} activeOpacity={0.8}>
                <Text style={styles.swapNowText}>
                  Swap {rec.swap_params!.input_amount_pct}% {rec.swap_params!.input_symbol} → {rec.swap_params!.output_symbol}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Trends Tab */}
      {tab === "trends" && trends.map((signal, i) => {
        const color = CATEGORY_COLORS[signal.category] ?? COLORS.textSecondary;
        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.badge, { backgroundColor: color + "22" }]}>
                <Text style={[styles.badgeText, { color }]}>{signal.category.toUpperCase()}</Text>
              </View>
              <Text style={[styles.relevanceText, { color }]}>{signal.relevance}</Text>
            </View>
            <Text style={styles.trendTitle}>{signal.title}</Text>
            <Text style={styles.description}>{signal.description}</Text>
            <View style={styles.actionRow}>
              <Text style={styles.actionLabel}>Action:</Text>
              <Text style={styles.actionValue}>{signal.action}</Text>
            </View>
            {signal.tokens && signal.tokens.length > 0 && (
              <View style={styles.tokenTags}>
                {signal.tokens.map((t) => (
                  <View key={t} style={styles.tokenTag}>
                    <Text style={styles.tokenTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {/* Security Tab */}
      {tab === "security" && security.map((proto, i) => {
        const color = SAFETY_COLORS[proto.risk_level] ?? COLORS.textSecondary;
        const barWidth = `${proto.safety_score}%`;
        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.protoName}>{proto.protocol}</Text>
              <View style={[styles.badge, { backgroundColor: color + "22" }]}>
                <Text style={[styles.badgeText, { color }]}>{proto.risk_level.toUpperCase()}</Text>
              </View>
              <Text style={[styles.safetyScore, { color }]}>{proto.safety_score}</Text>
            </View>
            {/* Safety bar */}
            <View style={styles.safetyBarBg}>
              <View style={[styles.safetyBarFill, { width: barWidth as any, backgroundColor: color }]} />
            </View>
            <Text style={styles.auditText}>Audited by: {proto.audit_status}</Text>
            {proto.top_concern !== "No known concerns" && (
              <Text style={styles.concernText}>{proto.top_concern}</Text>
            )}
            <Text style={styles.description}>{proto.recommendation}</Text>
          </View>
        );
      })}

      {/* Info Tab — How It Works */}
      {tab === "info" && (
        <View>
          <View style={styles.card}>
            <Text style={styles.infoTitle}>Signals</Text>
            <Text style={styles.infoText}>
              Trade signals are generated by analyzing momentum indicators, narrative trends, and on-chain data.
              Each signal includes a confidence score (0-100) and a recommended action (buy, sell, hold, or rebalance).
              Signals consider your current portfolio allocation to provide personalized recommendations.
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.infoTitle}>Trends</Text>
            <Text style={styles.infoText}>
              Market trends are detected using live data from DeFiLlama (TVL, protocol flows) and CoinGecko (price momentum, volume).
              Trends are categorized as momentum, narrative, opportunity, or risk. Relevance scoring ranks how each trend
              impacts your specific holdings.
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.infoTitle}>Security</Text>
            <Text style={styles.infoText}>
              Protocol safety scores are derived from audit status, TVL history, smart contract risk analysis, and
              community reports. Risk levels (low/medium/high/critical) help you understand exposure to each protocol
              in your portfolio. Scores update as new audit information becomes available.
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.infoTitle}>Multi-Agent Pipeline</Text>
            <Text style={styles.infoText}>
              The Intelligence Hub runs 4 specialized AI agents in parallel: Risk Analyst, Trend Researcher,
              Security Auditor, and Trade Generator. Results are orchestrated and cross-validated before presentation.
              The pipeline completes in under 90 seconds.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.githubBtn}
            onPress={() => Linking.openURL("https://github.com/warfield2016/seeker-copilot#intelligence-hub")}
            activeOpacity={0.7}
          >
            <Text style={styles.githubBtnText}>View Full Documentation on GitHub</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.disclaimer}>
        Multi-agent AI analysis. Not financial advice. Verify all data independently.
      </Text>

      {/* Swap Sheet — opens when user taps "Swap Now" on an executable recommendation */}
      {swapSheet && userPortfolio && (
        <SwapSheet
          visible={swapSheet.visible}
          onClose={() => setSwapSheet(null)}
          inputMint={swapSheet.inputMint}
          outputMint={swapSheet.outputMint}
          inputSymbol={swapSheet.inputSymbol}
          outputSymbol={swapSheet.outputSymbol}
          inputDecimals={swapSheet.inputDecimals}
          outputDecimals={swapSheet.outputDecimals}
          inputAmount={swapSheet.inputAmount}
          userPublicKey={userPortfolio.walletAddress}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  loadingText: { color: COLORS.text, marginTop: 16, fontSize: 16, fontWeight: "700" },
  loadingSub: { color: COLORS.textSecondary, marginTop: 4, fontSize: 12 },
  header: { color: COLORS.text, fontSize: 22, fontWeight: "800", marginBottom: 2 },
  metaText: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 12 },
  // Tab bar
  tabBar: { flexDirection: "row", marginBottom: 16, gap: 8 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: COLORS.primary + "33" },
  tabText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: COLORS.primary },
  // Cards
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.glow, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.06, shadowRadius: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  token: { color: COLORS.text, fontSize: 18, fontWeight: "700", flex: 1 },
  scoreContainer: { alignItems: "flex-end" },
  scoreLabel: { color: COLORS.textSecondary, fontSize: 10 },
  score: { fontSize: 20, fontWeight: "800" },
  description: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  riskNote: { color: COLORS.warning, fontSize: 11, fontStyle: "italic", marginTop: 8 },
  swapNowBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  swapNowText: { color: COLORS.text, fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  // Trends
  trendTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  relevanceText: { fontSize: 18, fontWeight: "800", marginLeft: "auto" },
  actionRow: { flexDirection: "row", marginTop: 8, gap: 4 },
  actionLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "700" },
  actionValue: { color: COLORS.secondary, fontSize: 12, flex: 1 },
  tokenTags: { flexDirection: "row", marginTop: 8, gap: 6 },
  tokenTag: { backgroundColor: COLORS.surfaceLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tokenTagText: { color: COLORS.text, fontSize: 11, fontWeight: "700" },
  // Security
  protoName: { color: COLORS.text, fontSize: 16, fontWeight: "700", flex: 1 },
  safetyScore: { fontSize: 20, fontWeight: "800" },
  safetyBarBg: { height: 4, backgroundColor: COLORS.surfaceLight, borderRadius: 2, marginBottom: 8 },
  safetyBarFill: { height: 4, borderRadius: 2 },
  auditText: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 },
  concernText: { color: COLORS.warning, fontSize: 12, marginBottom: 4, fontStyle: "italic" },
  // Footer
  disclaimer: { color: COLORS.textSecondary, fontSize: 11, textAlign: "center", paddingVertical: 20, lineHeight: 16 },
  infoTitle: { color: COLORS.primary, fontSize: 15, fontWeight: "700", marginBottom: 6 },
  infoText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  githubBtn: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
  },
  githubBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: "700" },
});
