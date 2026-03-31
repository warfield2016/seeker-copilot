import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { COLORS } from "../config/constants";
import { TokenBalance } from "../types";

interface Props {
  currentValue: number;
  change24hPercent: number;
  tokens?: TokenBalance[];
}

type ChartMode = "allocation" | "performance";
type Period = "24H" | "7D" | "30D";

// Distinct colors for pie chart slices
const SLICE_COLORS = [
  "#B14EFF", // purple
  "#14F195", // green
  "#00F0FF", // cyan
  "#FFB800", // gold
  "#FF006E", // pink
  "#3FB950", // lime
  "#8B5CF6", // violet
  "#F97316", // orange
];

/** Generate mock history data */
function generateHistory(currentValue: number, period: Period): { date: string; value: number }[] {
  const count = period === "24H" ? 24 : period === "7D" ? 7 : 30;
  const dailyVol = 0.025;
  const now = new Date();
  let value = currentValue;
  const values: number[] = [value];
  for (let i = 1; i < count; i++) {
    const noise = (Math.random() - 0.48) * dailyVol * value;
    value = value - noise;
    values.unshift(value);
  }
  return values.map((v, i) => {
    const d = new Date(now);
    if (period === "24H") d.setHours(d.getHours() - (count - 1 - i));
    else d.setDate(d.getDate() - (count - 1 - i));
    return {
      date: period === "24H" ? d.toLocaleTimeString([], { hour: "2-digit" }) : `${d.getMonth() + 1}/${d.getDate()}`,
      value: v,
    };
  });
}

/** Pure RN area chart — smooth bars with gradient feel */
function AreaChart({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const barWidth = Math.max(1, width / data.length - 1);

  return (
    <View style={{ width, height, flexDirection: "row", alignItems: "flex-end" }}>
      {data.map((v, i) => {
        const h = ((v - min) / range) * height * 0.85 + height * 0.1;
        const opacity = 0.3 + (i / data.length) * 0.7;
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: h,
              backgroundColor: color,
              opacity,
              marginRight: 1,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

/** Pure RN pie chart using conic segments via border trick */
function PieChart({ tokens, size }: { tokens: TokenBalance[]; size: number }) {
  const total = tokens.reduce((sum, t) => sum + t.usdValue, 0);
  if (total <= 0) return null;

  // Group into top 5 + "Other"
  const sorted = [...tokens].sort((a, b) => b.usdValue - a.usdValue);
  const top = sorted.slice(0, 5);
  const otherValue = sorted.slice(5).reduce((sum, t) => sum + t.usdValue, 0);
  const slices: { label: string; value: number; pct: number; color: string }[] = top.map((t, i) => ({
    label: t.symbol,
    value: t.usdValue,
    pct: (t.usdValue / total) * 100,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (otherValue > 0) {
    slices.push({ label: "Other", value: otherValue, pct: (otherValue / total) * 100, color: COLORS.surfaceLight });
  }
  // Ensure percentages sum to exactly 100 (fix floating-point drift)
  const pctSum = slices.reduce((s, sl) => s + sl.pct, 0);
  if (slices.length > 0 && Math.abs(pctSum - 100) > 0.01) {
    slices[slices.length - 1].pct += 100 - pctSum;
  }

  // Build concentric ring segments using rotation transforms
  let currentAngle = 0;
  const radius = size / 2;
  const segments = slices.map((slice, i) => {
    const angle = (slice.pct / 100) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...slice, startAngle, angle };
  });

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: COLORS.surfaceLight }}>
        {segments.map((seg, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              width: size,
              height: size,
              transform: [{ rotate: `${seg.startAngle}deg` }],
            }}
          >
            <View
              style={{
                position: "absolute",
                width: size / 2,
                height: size,
                left: size / 2,
                backgroundColor: seg.color,
                opacity: 1,
              }}
            />
            {seg.angle < 180 && (
              <View
                style={{
                  position: "absolute",
                  width: size / 2,
                  height: size,
                  left: size / 2,
                  backgroundColor: COLORS.surfaceLight,
                  transform: [{ rotate: `${seg.angle}deg` }],
                  transformOrigin: "left center",
                }}
              />
            )}
            {seg.angle > 180 && (
              <View
                style={{
                  position: "absolute",
                  width: size / 2,
                  height: size,
                  left: 0,
                  backgroundColor: seg.color,
                  transform: [{ rotate: `${seg.angle - 180}deg` }],
                  transformOrigin: "right center",
                }}
              />
            )}
          </View>
        ))}
        {/* Center hole */}
        <View style={{
          position: "absolute",
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: size * 0.275,
          backgroundColor: COLORS.surface,
          top: size * 0.225,
          left: size * 0.225,
          justifyContent: "center",
          alignItems: "center",
        }}>
          <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: "800" }}>
            ${total >= 1000 ? (total / 1000).toFixed(1) + "K" : total.toFixed(0)}
          </Text>
        </View>
      </View>

      {/* Legend */}
      <View style={pieStyles.legend}>
        {slices.map((s, i) => (
          <View key={i} style={pieStyles.legendRow}>
            <View style={[pieStyles.legendDot, { backgroundColor: s.color }]} />
            <Text style={pieStyles.legendLabel}>{s.label}</Text>
            <Text style={pieStyles.legendPct}>{s.pct.toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pieStyles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "600" },
  legendPct: { color: COLORS.textMuted, fontSize: 10 },
});

export default React.memo(function PortfolioChart({ currentValue, change24hPercent, tokens }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 64, 360);
  const [mode, setMode] = useState<ChartMode>("allocation");
  const [period, setPeriod] = useState<Period>("7D");

  const historyData = useMemo(
    () => generateHistory(currentValue, period),
    [currentValue, period]
  );
  const values = historyData.map((d) => d.value);
  const periodChange = values.length > 1 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : 0;
  const isUp = periodChange >= 0;
  const color = isUp ? COLORS.success : COLORS.danger;

  return (
    <View style={styles.container}>
      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "allocation" && styles.modeBtnActive]}
          onPress={() => setMode("allocation")}
        >
          <Text style={[styles.modeBtnText, mode === "allocation" && styles.modeBtnTextActive]}>Allocation</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "performance" && styles.modeBtnActive]}
          onPress={() => setMode("performance")}
        >
          <Text style={[styles.modeBtnText, mode === "performance" && styles.modeBtnTextActive]}>Performance</Text>
        </TouchableOpacity>
      </View>

      {mode === "allocation" && tokens && tokens.length > 0 ? (
        <PieChart tokens={tokens} size={160} />
      ) : (
        <>
          <View style={styles.header}>
            <View>
              <Text style={[styles.periodChange, { color }]}>
                {isUp ? "+" : ""}{periodChange.toFixed(2)}%
              </Text>
              <Text style={styles.simLabel}>Simulated</Text>
            </View>
            <View style={styles.periods}>
              {(["24H", "7D", "30D"] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodBtn, period === p && styles.periodActive]}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.chartArea}>
            <AreaChart data={values} width={chartWidth} height={90} color={color} />
          </View>
          <View style={styles.range}>
            <Text style={styles.rangeText}>{historyData[0]?.date}</Text>
            <Text style={styles.rangeText}>{historyData[historyData.length - 1]?.date}</Text>
          </View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.glow,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    padding: 2,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 6,
  },
  modeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  modeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  modeBtnTextActive: {
    color: COLORS.text,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  periodChange: { fontSize: 18, fontWeight: "800" },
  simLabel: { color: COLORS.textMuted, fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
  periods: { flexDirection: "row", gap: 4 },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLight,
  },
  periodActive: { backgroundColor: COLORS.primary },
  periodText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "700" },
  periodTextActive: { color: COLORS.text },
  chartArea: { alignItems: "center", marginBottom: 8 },
  range: { flexDirection: "row", justifyContent: "space-between" },
  rangeText: { color: COLORS.textSecondary, fontSize: 10 },
});
