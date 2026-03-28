import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RiskScore } from "../types";
import { COLORS } from "../config/constants";

interface Props {
  riskScore: RiskScore;
}

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

export default function RiskGauge({ riskScore }: Props) {
  const color = getRiskColor(riskScore.overall);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Risk Score</Text>

      <View style={styles.scoreRow}>
        <Text style={[styles.score, { color }]}>{riskScore.overall}</Text>
        <Text style={[styles.label, { color }]}>
          {getRiskLabel(riskScore.overall)}
        </Text>
      </View>

      <View style={styles.barBackground}>
        <View
          style={[
            styles.barFill,
            {
              width: `${riskScore.overall}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>

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
  return (
    <View style={styles.riskItem}>
      <Text style={styles.riskLabel}>{label}</Text>
      <Text style={[styles.riskValue, { color: getRiskColor(value) }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  title: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 8,
  },
  score: {
    fontSize: 36,
    fontWeight: "800",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
  barBackground: {
    height: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 3,
    marginBottom: 16,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  breakdown: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  riskItem: {
    alignItems: "center",
  },
  riskLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  riskValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  details: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
});
