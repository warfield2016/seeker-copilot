import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { COLORS } from "../config/constants";

interface DataPoint {
  date: string;
  value: number;
}

interface Props {
  currentValue: number;
  change24hPercent: number;
}

type Period = "24H" | "7D" | "30D";

/** Generate realistic mock history data from current value */
function generateHistory(currentValue: number, change24h: number, period: Period): DataPoint[] {
  const points: DataPoint[] = [];
  const count = period === "24H" ? 24 : period === "7D" ? 7 : 30;
  const dailyVol = 0.025; // 2.5% daily vol
  const now = new Date();

  // Work backwards from current value
  let value = currentValue;
  const values: number[] = [value];
  for (let i = 1; i < count; i++) {
    const noise = (Math.random() - 0.48) * dailyVol * value;
    value = value - noise;
    values.unshift(value);
  }

  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    if (period === "24H") d.setHours(d.getHours() - (count - 1 - i));
    else d.setDate(d.getDate() - (count - 1 - i));
    points.push({
      date: period === "24H" ? d.toLocaleTimeString([], { hour: "2-digit" }) : `${d.getMonth() + 1}/${d.getDate()}`,
      value: values[i],
    });
  }
  return points;
}

/** Pure RN sparkline — no SVG dependency */
function Sparkline({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const barWidth = width / data.length;

  return (
    <View style={{ width, height, flexDirection: "row", alignItems: "flex-end" }}>
      {data.map((v, i) => {
        const h = ((v - min) / range) * height * 0.85 + height * 0.1;
        const isLast = i === data.length - 1;
        return (
          <View
            key={i}
            style={{
              width: barWidth - 1,
              height: h,
              backgroundColor: isLast ? color : color + "55",
              marginRight: 1,
              borderTopLeftRadius: 1,
              borderTopRightRadius: 1,
            }}
          />
        );
      })}
    </View>
  );
}

export default function PortfolioChart({ currentValue, change24hPercent }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 64, 360); // 32px padding each side
  const [period, setPeriod] = useState<Period>("7D");
  const data = useMemo(() => generateHistory(currentValue, change24hPercent, period), [currentValue, change24hPercent, period]);
  const values = data.map((d) => d.value);
  const periodChange = values.length > 1 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : 0;
  const isUp = periodChange >= 0;
  const color = isUp ? COLORS.success : COLORS.danger;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Performance</Text>
          <Text style={[styles.periodChange, { color }]}>
            {isUp ? "+" : ""}{periodChange.toFixed(2)}% ({period})
          </Text>
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
        <Sparkline data={values} width={chartWidth} height={80} color={color} />
      </View>
      <View style={styles.range}>
        <Text style={styles.rangeText}>{data[0]?.date}</Text>
        <Text style={styles.rangeText}>{data[data.length - 1]?.date}</Text>
      </View>
    </View>
  );
}

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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  label: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  periodChange: { fontSize: 18, fontWeight: "800", marginTop: 2 },
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
