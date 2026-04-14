/**
 * SwapSheet — bottom sheet UI for confirming & executing Jupiter swaps.
 *
 * Flow:
 *  1. Opens with inputMint, outputMint, amount pre-filled (from AI recommendation or token row)
 *  2. Fetches Jupiter quote → shows rate, output amount, platform fee, slippage
 *  3. User confirms → MWA signs & sends
 *  4. Shows success with Solscan link, or error with retry
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SWAP_PLATFORM_FEE_BPS } from "../config/constants";
import {
  executeSwap,
  getQuote,
  getEffectiveRate,
  getPlatformFeeAmount,
  fromRawAmount,
  toRawAmount,
  JupiterQuote,
  SwapResult,
} from "../services/swapService";

export interface SwapSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Pre-filled swap parameters */
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  inputDecimals: number;
  outputDecimals: number;
  /** Human-readable amount (e.g., 0.1 for 0.1 SOL) */
  inputAmount: number;
  /** User's wallet address (must be connected) */
  userPublicKey: string;
}

type SheetState = "quoting" | "ready" | "signing" | "success" | "error";

export default function SwapSheet(props: SwapSheetProps) {
  const {
    visible, onClose,
    inputMint, outputMint, inputSymbol, outputSymbol,
    inputDecimals, outputDecimals, inputAmount, userPublicKey,
  } = props;

  const [state, setState] = useState<SheetState>("quoting");
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch quote when sheet opens
  const fetchQuote = useCallback(async () => {
    setState("quoting");
    setError(null);
    try {
      const raw = toRawAmount(inputAmount, inputDecimals);
      const q = await getQuote({ inputMint, outputMint, amount: raw });
      setQuote(q);
      setState("ready");
    } catch (e: any) {
      setError(e?.message ?? "Failed to get quote");
      setState("error");
    }
  }, [inputMint, outputMint, inputAmount, inputDecimals]);

  useEffect(() => {
    if (visible) fetchQuote();
    else {
      setQuote(null); setResult(null); setError(null); setState("quoting");
    }
  }, [visible, fetchQuote]);

  const handleConfirm = useCallback(async () => {
    if (!quote) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setState("signing");
    setError(null);
    try {
      const r = await executeSwap(quote, userPublicKey);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(r);
      setState("success");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message ?? "Swap failed. Please try again.");
      setState("error");
    }
  }, [quote, userPublicKey]);

  // Render derived values
  const outAmount = quote ? fromRawAmount(quote.outAmount, outputDecimals) : 0;
  const rate = quote ? getEffectiveRate(quote, inputDecimals, outputDecimals) : 0;
  const feeAmount = quote ? getPlatformFeeAmount(quote, outputDecimals) : 0;
  const priceImpact = quote ? Number(quote.priceImpactPct) : 0;
  const routeLabels = quote ? Array.from(new Set(quote.routePlan.map((r) => r.swapInfo.label))).join(" → ") : "";
  const minOut = quote ? fromRawAmount(quote.otherAmountThreshold, outputDecimals) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Confirm Swap</Text>
            <Text style={styles.subtitle}>Powered by Jupiter · {SWAP_PLATFORM_FEE_BPS / 100}% platform fee</Text>
          </View>

          {/* Swap visual */}
          <View style={styles.swapVisual}>
            <View style={styles.swapSide}>
              <Text style={styles.swapLabel}>You pay</Text>
              <Text style={styles.swapAmount}>{inputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</Text>
              <Text style={styles.swapSymbol}>{inputSymbol}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
            <View style={styles.swapSide}>
              <Text style={styles.swapLabel}>You receive</Text>
              <Text style={styles.swapAmount}>
                {state === "quoting" ? "..." : outAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </Text>
              <Text style={styles.swapSymbol}>{outputSymbol}</Text>
            </View>
          </View>

          {/* Quote details */}
          {state === "ready" && quote && (
            <View style={styles.detailsGrid}>
              <DetailRow label="Rate" value={`1 ${inputSymbol} = ${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${outputSymbol}`} />
              <DetailRow label="Route" value={routeLabels || "Jupiter"} />
              <DetailRow label="Price impact" value={`${priceImpact.toFixed(3)}%`} valueColor={priceImpact > 1 ? COLORS.warning : COLORS.textSecondary} />
              <DetailRow label="Min received" value={`${minOut.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${outputSymbol}`} />
              {feeAmount > 0 && (
                <DetailRow label="Platform fee" value={`${feeAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${outputSymbol}`} valueColor={COLORS.textMuted} />
              )}
              <DetailRow label="Slippage" value={`${quote.slippageBps / 100}%`} />
            </View>
          )}

          {/* Loading states */}
          {state === "quoting" && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.centerText}>Finding best price...</Text>
            </View>
          )}

          {state === "signing" && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.centerText}>Approve in your wallet...</Text>
            </View>
          )}

          {/* Success state */}
          {state === "success" && result && (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Swap Complete</Text>
              <Text style={styles.successSub}>Signature: {result.signature.slice(0, 8)}...{result.signature.slice(-8)}</Text>
              <TouchableOpacity
                style={styles.solscanBtn}
                onPress={() => Linking.openURL(`https://solscan.io/tx/${result.signature}`)}
              >
                <Text style={styles.solscanText}>View on Solscan</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error state */}
          {state === "error" && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Swap failed</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchQuote}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {state === "ready" && (
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmText}>Confirm Swap</Text>
              </TouchableOpacity>
            )}
            {state === "success" && (
              <TouchableOpacity style={styles.confirmBtn} onPress={onClose}>
                <Text style={styles.confirmText}>Done</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={state === "signing"}>
              <Text style={[styles.cancelText, state === "signing" && { opacity: 0.4 }]}>
                {state === "success" ? "Close" : "Cancel"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    borderWidth: 1, borderColor: COLORS.glow, borderBottomWidth: 0,
  },
  handle: { width: 40, height: 4, backgroundColor: COLORS.textMuted, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  header: { alignItems: "center", marginBottom: 20 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },

  swapVisual: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.surfaceLight, borderRadius: 14, padding: 16, marginBottom: 16,
  },
  swapSide: { alignItems: "center", flex: 1 },
  swapLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: "600", textTransform: "uppercase", marginBottom: 6 },
  swapAmount: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  swapSymbol: { color: COLORS.accent, fontSize: 12, fontWeight: "700", marginTop: 2 },
  arrow: { color: COLORS.accent, fontSize: 22, fontWeight: "800", paddingHorizontal: 8 },

  detailsGrid: { marginBottom: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  detailLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600" },
  detailValue: { color: COLORS.text, fontSize: 12, fontWeight: "600", textAlign: "right", maxWidth: "60%" },

  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 },
  centerText: { color: COLORS.textSecondary, fontSize: 13 },

  successBox: { backgroundColor: COLORS.success + "18", borderWidth: 1, borderColor: COLORS.success + "44", borderRadius: 12, padding: 14, marginBottom: 12 },
  successTitle: { color: COLORS.success, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  successSub: { color: COLORS.textSecondary, fontSize: 11, fontFamily: "Courier", marginBottom: 10 },
  solscanBtn: { backgroundColor: COLORS.success + "22", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  solscanText: { color: COLORS.success, fontSize: 12, fontWeight: "700" },

  errorBox: { backgroundColor: COLORS.danger + "18", borderWidth: 1, borderColor: COLORS.danger + "44", borderRadius: 12, padding: 14, marginBottom: 12 },
  errorTitle: { color: COLORS.danger, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  errorText: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 10 },
  retryBtn: { backgroundColor: COLORS.danger + "22", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  retryText: { color: COLORS.danger, fontSize: 12, fontWeight: "700" },

  actions: { gap: 8 },
  confirmBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  confirmText: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },
});
