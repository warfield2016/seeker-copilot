import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { COLORS } from "../config/constants";
import { TradeRecommendation, TrendSignal, ProtocolSafety } from "../types";
import { DEMO_PORTFOLIO, DEMO_RECOMMENDATIONS, DEMO_TRENDS, DEMO_SECURITY } from "../services/demoData";
import aiService from "../services/aiService";

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

type Tab = "signals" | "trends" | "security";

export default function RecommendationsScreen() {
  const [tab, setTab] = useState<Tab>("signals");
  const [recs, setRecs] = useState<TradeRecommendation[]>([]);
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [security, setSecurity] = useState<ProtocolSafety[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agentMeta, setAgentMeta] = useState<{ latency_seconds?: number; agents_run?: number } | null>(null);

  const fetchAll = async () => {
    try {
      const result = await aiService.getDeepAnalysis(DEMO_PORTFOLIO);
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
  };

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>4 AI agents analyzing...</Text>
        <Text style={styles.loadingSub}>Risk + Trends + Security → Recommendations</Text>
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
        {(["signals", "trends", "security"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "signals" ? `Signals (${recs.length})` : t === "trends" ? `Trends (${trends.length})` : `Security (${security.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Signals Tab */}
      {tab === "signals" && recs.map((rec, i) => {
        const color = ACTION_COLORS[rec.action] ?? COLORS.textSecondary;
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

      <Text style={styles.disclaimer}>
        Multi-agent AI analysis. Not financial advice. Verify all data independently.
      </Text>
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
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  token: { color: COLORS.text, fontSize: 18, fontWeight: "700", flex: 1 },
  scoreContainer: { alignItems: "flex-end" },
  scoreLabel: { color: COLORS.textSecondary, fontSize: 10 },
  score: { fontSize: 20, fontWeight: "800" },
  description: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
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
});
