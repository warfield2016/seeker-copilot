import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RiskScore } from "../types";
import { COLORS } from "../config/constants";

interface Props {
  riskScore: RiskScore;
}

const ARC_SIZE = 160;
const ARC_WIDTH = 10;

function getRiskColor(score: number): string {
  if (score < 30) return COLORS.success;
  if (score < 60) return COLORS.warning;
  return COLORS.danger;
}

function getRiskLabel(score: number): string {
  if (score < 30) return "Low Risk";
  if (score < 60) return "Moderate";
  return "High Risk";
}

/** Semicircle arc gauge — the filled portion rotates based on score (0-100) */
function ArcGauge({ score, color }: { score: number; color: string }) {
  // Score 0 = left, 100 = right. Map to rotation: -90° (empty) to +90° (full)
  const rotation = -90 + (Math.min(score, 100) / 100) * 180;

  return (
    <View style={arcStyles.wrapper}>
      {/* Background arc (gray) */}
      <View style={arcStyles.arcContainer}>
        <View style={[arcStyles.halfCircle, { borderColor: COLORS.surfaceLight }]} />
      </View>
      {/* Foreground arc (colored fill) — clipped to score% */}
      <View style={arcStyles.arcContainer}>
        <View style={[arcStyles.halfCircle, { borderColor: color }]} />
        {/* Mask that hides the unfilled portion */}
        <View
          style={[
            arcStyles.mask,
            { transform: [{ rotate: `${rotation}deg` }] },
          ]}
        />
      </View>
      {/* Needle dot at the tip */}
      <View
        style={[
          arcStyles.needleContainer,
          { transform: [{ rotate: `${rotation}deg` }] },
        ]}
      >
        <View style={[arcStyles.needle, { backgroundColor: color }]} />
      </View>
      {/* Center score text */}
      <View style={arcStyles.center}>
        <Text style={[arcStyles.score, { color }]}>{score}</Text>
        <Text style={[arcStyles.label, { color }]}>{getRiskLabel(score)}</Text>
      </View>
    </View>
  );
}

export default function RiskGauge({ riskScore }: Props) {
  const color = getRiskColor(riskScore.overall);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RISK SCORE</Text>

      <ArcGauge score={riskScore.overall} color={color} />

      <View style={styles.breakdown}>
        <RiskItem label="Concentration" value={riskScore.concentrationRisk} />
        <RiskItem label="Volatility" value={riskScore.volatilityExposure} />
        <RiskItem label="IL Risk" value={riskScore.impermanentLossRisk} />
        <RiskItem label="Liquidation" value={riskScore.liquidationRisk} />
      </View>

      {riskScore.details ? (
        <Text style={styles.details}>{riskScore.details}</Text>
      ) : null}
    </View>
  );
}

function RiskItem({ label, value }: { label: string; value: number }) {
  const color = getRiskColor(value);
  return (
    <View style={styles.riskItem}>
      <Text style={styles.riskLabel}>{label}</Text>
      <View style={styles.riskValueRow}>
        <View style={[styles.riskDot, { backgroundColor: color }]} />
        <Text style={[styles.riskValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

const arcStyles = StyleSheet.create({
  wrapper: {
    width: ARC_SIZE,
    height: ARC_SIZE / 2 + 30,
    alignSelf: "center",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 4,
  },
  arcContainer: {
    position: "absolute",
    width: ARC_SIZE,
    height: ARC_SIZE / 2,
    overflow: "hidden",
  },
  halfCircle: {
    width: ARC_SIZE,
    height: ARC_SIZE,
    borderRadius: ARC_SIZE / 2,
    borderWidth: ARC_WIDTH,
    borderColor: COLORS.surfaceLight,
    borderBottomColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "-45deg" }],
  },
  mask: {
    position: "absolute",
    width: ARC_SIZE / 2,
    height: ARC_SIZE,
    backgroundColor: COLORS.surface,
    right: 0,
    top: 0,
  },
  needleContainer: {
    position: "absolute",
    width: ARC_SIZE,
    height: ARC_SIZE,
    alignItems: "center",
    transformOrigin: "center center",
  },
  needle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -1,
  },
  center: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
  },
  score: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: -2,
  },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.glow,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  title: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 4,
  },
  breakdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  riskItem: {
    alignItems: "center",
    flex: 1,
  },
  riskLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginBottom: 4,
    textAlign: "center",
  },
  riskValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  details: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 12,
    lineHeight: 16,
    textAlign: "center",
  },
});
