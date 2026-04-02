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

// Cyberpunk neon palette for pie chart — high contrast, distinct hues
const SLICE_COLORS = [
  "#B14EFF", // neon purple
  "#14F195", // matrix green
  "#00F0FF", // electric cyan
  "#FFB800", // cyber gold
  "#FF006E", // hot pink
  "#3FB950", // acid lime
  "#8B5CF6", // deep violet
  "#F97316", // plasma orange
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

/** Pure RN line chart with dots and gradient fill area */
function LineChart({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = height * 0.08;
  const chartH = height - padding * 2;

  // Calculate points
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padding + chartH - ((v - min) / range) * chartH,
  }));

  // Fill area — thin horizontal bars below the line with fading opacity
  const fillBars: React.ReactNode[] = [];
  const fillSteps = 12;
  for (let step = 0; step < fillSteps; step++) {
    const frac = step / fillSteps;
    const barY = points.map((p) => p.y + (height - p.y) * frac);
    const avgY = barY.reduce((a, b) => a + b, 0) / barY.length;
    fillBars.push(
      <View
        key={`fill-${step}`}
        style={{
          position: "absolute",
          left: 0,
          top: avgY,
          width,
          height: Math.max(1, (height - avgY) / fillSteps),
          backgroundColor: color,
          opacity: 0.12 - frac * 0.1,
        }}
      />
    );
  }

  // Line segments
  const segments = points.slice(0, -1).map((p, i) => {
    const next = points[i + 1];
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { x: p.x, y: p.y, len, angle };
  });

  return (
    <View style={{ width, height, position: "relative" }}>
      {fillBars}
      {segments.map((seg, i) => (
        <View
          key={`seg-${i}`}
          style={{
            position: "absolute",
            left: seg.x,
            top: seg.y - 1,
            width: seg.len,
            height: 2.5,
            backgroundColor: color,
            borderRadius: 1.25,
            transform: [{ rotate: `${seg.angle}deg` }],
            transformOrigin: "left center",
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 4,
          }}
        />
      ))}
      {/* Dots at each data point */}
      {points.map((p, i) => (
        <View
          key={`dot-${i}`}
          style={{
            position: "absolute",
            left: p.x - 2.5,
            top: p.y - 2.5,
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: color,
            opacity: i === 0 || i === points.length - 1 ? 1 : 0.6,
          }}
        />
      ))}
    </View>
  );
}

/** Pure RN donut chart — wedge-based rendering, zero overlap.
 *  Each 3° of the circle is an independent colored wedge. */
function PieChart({ tokens, size }: { tokens: TokenBalance[]; size: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = tokens.reduce((sum, t) => sum + t.usdValue, 0);
  if (total <= 0) return null;

  const sorted = [...tokens].sort((a, b) => b.usdValue - a.usdValue);
  const top = sorted.slice(0, 6);
  const otherValue = sorted.slice(6).reduce((sum, t) => sum + t.usdValue, 0);
  const slices: { label: string; value: number; pct: number; color: string }[] = top.map((t, i) => ({
    label: t.symbol,
    value: t.usdValue,
    pct: (t.usdValue / total) * 100,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (otherValue > 0) {
    slices.push({ label: "Other", value: otherValue, pct: (otherValue / total) * 100, color: COLORS.textMuted });
  }
  const pctSum = slices.reduce((s, sl) => s + sl.pct, 0);
  if (slices.length > 0 && Math.abs(pctSum - 100) > 0.01) {
    slices[slices.length - 1].pct += 100 - pctSum;
  }

  // Build angle ranges per slice
  const sliceRanges: { startDeg: number; endDeg: number; idx: number }[] = [];
  let cumDeg = 0;
  slices.forEach((sl, i) => {
    const deg = (sl.pct / 100) * 360;
    sliceRanges.push({ startDeg: cumDeg, endDeg: cumDeg + deg, idx: i });
    cumDeg += deg;
  });

  // Generate wedges: thin rotated bars radiating from center
  const WEDGE_STEP = 3; // degrees per wedge
  const radius = size / 2;
  const ringWidth = size * 0.18; // donut ring thickness
  const innerR = radius - ringWidth;
  const wedges: React.ReactNode[] = [];

  for (let deg = 0; deg < 360; deg += WEDGE_STEP) {
    const range = sliceRanges.find((r) => deg >= r.startDeg && deg < r.endDeg);
    if (!range) continue;
    const sliceIdx = range.idx;
    const isSelected = selected === sliceIdx;
    const isDimmed = selected !== null && !isSelected;
    const color = slices[sliceIdx].color;

    // Each wedge: a thin rectangle starting at innerR, extending to outerR
    const wedgeLen = ringWidth + (isSelected ? 4 : 0);
    const wedgeWidth = Math.max(4, (WEDGE_STEP / 360) * 2 * Math.PI * (radius - ringWidth / 2) + 1.5);
    const radAngle = ((deg + WEDGE_STEP / 2 - 90) * Math.PI) / 180;
    const cx = radius + Math.cos(radAngle) * (innerR + wedgeLen / 2) - wedgeWidth / 2;
    const cy = radius + Math.sin(radAngle) * (innerR + wedgeLen / 2) - wedgeLen / 2;

    wedges.push(
      <View
        key={deg}
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          width: wedgeWidth,
          height: wedgeLen,
          backgroundColor: color,
          opacity: isDimmed ? 0.25 : isSelected ? 1 : 0.85,
          borderRadius: 1,
          transform: [{ rotate: `${deg + WEDGE_STEP / 2}deg` }],
          ...(isSelected ? {
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 8,
          } : {}),
        }}
      />
    );
  }

  // Thin separator lines between slices for clarity
  const separators = sliceRanges.slice(1).map((range, i) => {
    const deg = range.startDeg;
    const radAngle = ((deg - 90) * Math.PI) / 180;
    const cx = radius + Math.cos(radAngle) * (innerR + ringWidth / 2);
    const cy = radius + Math.sin(radAngle) * (innerR + ringWidth / 2);
    return (
      <View
        key={`sep-${i}`}
        style={{
          position: "absolute",
          left: cx - 1,
          top: cy - ringWidth / 2 - 2,
          width: 2,
          height: ringWidth + 4,
          backgroundColor: COLORS.surface,
          transform: [{ rotate: `${deg}deg` }],
          zIndex: 5,
        }}
      />
    );
  });

  // Tap zones — invisible overlays per slice for touch interaction
  const tapZones = sliceRanges.map((range, i) => {
    const midDeg = (range.startDeg + range.endDeg) / 2;
    const spanDeg = range.endDeg - range.startDeg;
    if (spanDeg < 5) return null; // too small to tap
    const radAngle = ((midDeg - 90) * Math.PI) / 180;
    const tapR = innerR + ringWidth / 2;
    const tapSize = Math.max(28, (spanDeg / 360) * 2 * Math.PI * tapR * 0.7);
    const cx = radius + Math.cos(radAngle) * tapR - tapSize / 2;
    const cy = radius + Math.sin(radAngle) * tapR - tapSize / 2;
    return (
      <TouchableOpacity
        key={`tap-${i}`}
        activeOpacity={1}
        onPress={() => setSelected(selected === i ? null : i)}
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          width: tapSize,
          height: tapSize,
          zIndex: 10,
        }}
      />
    );
  });

  const holeSize = innerR * 2 - 4;

  return (
    <View style={{ alignItems: "center" }}>
      {/* Outer glow ring */}
      <View style={{
        width: size + 8,
        height: size + 8,
        borderRadius: (size + 8) / 2,
        borderWidth: 1,
        borderColor: selected !== null ? slices[selected].color + "44" : COLORS.glow,
        justifyContent: "center",
        alignItems: "center",
      }}>
        <View style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: COLORS.surface,
          overflow: "hidden",
        }}>
          {wedges}
          {separators}
          {tapZones}

          {/* Center hole */}
          <View style={{
            position: "absolute",
            width: holeSize,
            height: holeSize,
            borderRadius: holeSize / 2,
            backgroundColor: COLORS.surface,
            top: (size - holeSize) / 2,
            left: (size - holeSize) / 2,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 20,
            borderWidth: 1,
            borderColor: selected !== null ? slices[selected].color + "33" : COLORS.border,
          }}>
            {selected !== null && slices[selected] ? (
              <>
                <Text style={{ color: slices[selected].color, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>
                  {slices[selected].label}
                </Text>
                <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "700" }}>
                  ${slices[selected].value >= 1000 ? (slices[selected].value / 1000).toFixed(1) + "K" : slices[selected].value.toFixed(0)}
                </Text>
                <Text style={{ color: slices[selected].color, fontSize: 10, fontWeight: "600" }}>
                  {slices[selected].pct.toFixed(1)}%
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: "600", letterSpacing: 1 }}>
                  TOTAL
                </Text>
                <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: "800" }}>
                  ${total >= 1000 ? (total / 1000).toFixed(1) + "K" : total.toFixed(0)}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Legend — cyberpunk styled, tap to highlight */}
      <View style={pieStyles.legend}>
        {slices.map((s, i) => {
          const isActive = selected === i;
          return (
            <TouchableOpacity
              key={i}
              style={[
                pieStyles.legendRow,
                isActive && { backgroundColor: s.color + "18", borderColor: s.color + "55" },
              ]}
              onPress={() => setSelected(selected === i ? null : i)}
              activeOpacity={0.7}
            >
              <View style={[
                pieStyles.legendDot,
                { backgroundColor: s.color },
                isActive && { shadowColor: s.color, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
              ]} />
              <Text style={[pieStyles.legendLabel, isActive && { color: s.color }]}>{s.label}</Text>
              <Text style={[pieStyles.legendPct, isActive && { color: COLORS.text }]}>{s.pct.toFixed(1)}%</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const pieStyles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 14 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "700" },
  legendPct: { color: COLORS.textMuted, fontSize: 10, fontWeight: "600" },
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
            <LineChart data={values} width={chartWidth} height={90} color={color} />
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
