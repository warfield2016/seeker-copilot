import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, Share } from "react-native";
import { COLORS } from "../config/constants";
import { Portfolio, RiskScore } from "../types";

interface Props {
  portfolio: Portfolio;
  riskScore: RiskScore | null;
}

export default function ShareCard({ portfolio, riskScore }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isUp = portfolio.change24hPercent >= 0;
  const changeColor = isUp ? COLORS.success : COLORS.danger;
  const topTokens = portfolio.tokens.slice(0, 3);

  const handleShare = async () => {
    const text = [
      `My Solana Portfolio: $${portfolio.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      `${isUp ? "+" : ""}${portfolio.change24hPercent.toFixed(1)}% today`,
      `Top: ${topTokens.map((t) => `${t.symbol} $${t.usdValue.toFixed(0)}`).join(", ")}`,
      riskScore ? `Risk: ${riskScore.overall}/100` : "",
      `\nTracked with Seeker AI Copilot\nhttps://store.solanamobile.com/app/com.seekerai.copilot`,
    ].filter(Boolean).join("\n");

    if (Platform.OS === "web" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      Alert.alert("Copied!", "Portfolio summary copied to clipboard.");
    } else {
      try {
        await Share.share({ message: text, title: "My Solana Portfolio" });
      } catch {
        Alert.alert("Share", text);
      }
    }
  };

  if (!expanded) {
    return (
      <TouchableOpacity style={styles.shareBtn} onPress={() => setExpanded(true)}>
        <Text style={styles.shareBtnText}>Share Portfolio</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      {/* Card preview */}
      <View style={styles.preview}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>Solana Portfolio</Text>
          <Text style={styles.previewBadge}>SEEKER</Text>
        </View>

        <Text style={styles.previewValue}>
          ${portfolio.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={[styles.previewChange, { color: changeColor }]}>
          {isUp ? "+" : ""}{portfolio.change24hPercent.toFixed(2)}% today
        </Text>

        <View style={styles.previewTokens}>
          {topTokens.map((t) => (
            <View key={t.mint} style={styles.previewToken}>
              <Text style={styles.previewTokenSymbol}>{t.symbol}</Text>
              <Text style={styles.previewTokenValue}>${t.usdValue.toFixed(0)}</Text>
            </View>
          ))}
        </View>

        {riskScore && (
          <View style={styles.previewRisk}>
            <Text style={styles.previewRiskLabel}>Risk Score</Text>
            <Text style={styles.previewRiskValue}>{riskScore.overall}/100</Text>
          </View>
        )}

        <Text style={styles.previewWatermark}>Seeker AI Copilot</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Text style={styles.actionText}>📋 Copy Summary</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={() => setExpanded(false)}>
          <Text style={styles.closeText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shareBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shareBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: "700" },
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  preview: {
    padding: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.primary + "44",
    borderRadius: 12,
    margin: 12,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  previewTitle: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  previewBadge: {
    color: COLORS.skr,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    backgroundColor: COLORS.skr + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  previewValue: { color: COLORS.text, fontSize: 28, fontWeight: "800" },
  previewChange: { fontSize: 16, fontWeight: "700", marginTop: 2, marginBottom: 16 },
  previewTokens: { flexDirection: "row", gap: 12, marginBottom: 12 },
  previewToken: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  previewTokenSymbol: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  previewTokenValue: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  previewRisk: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  previewRiskLabel: { color: COLORS.textSecondary, fontSize: 12 },
  previewRiskValue: { color: COLORS.warning, fontSize: 12, fontWeight: "800" },
  previewWatermark: {
    color: COLORS.primary + "66",
    fontSize: 10,
    textAlign: "center",
    letterSpacing: 1,
  },
  actions: { flexDirection: "row", padding: 12, gap: 8 },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  actionText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  closeBtn: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 10,
    padding: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  closeText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "600" },
});
