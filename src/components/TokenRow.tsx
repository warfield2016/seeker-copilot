import React, { useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { TokenBalance } from "../types";
import { COLORS } from "../config/constants";

interface Props {
  token: TokenBalance;
}

export default function TokenRow({ token }: Props) {
  const safeValue = Number.isFinite(token.usdValue) ? token.usdValue : 0;
  const safeChange = Number.isFinite(token.change24h) ? token.change24h : 0;
  const safeBalance = Number.isFinite(token.balance) ? token.balance : 0;
  const changeColor = safeChange >= 0 ? COLORS.success : COLORS.danger;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {token.logoUri && !imgFailed ? (
          <Image
            source={{ uri: token.logoUri }}
            style={styles.logo}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder]}>
            <Text style={styles.logoText}>{token.symbol.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.symbol}>{token.symbol}</Text>
          <Text style={styles.balance}>
            {safeBalance < 0.001
              ? safeBalance.toExponential(2)
              : safeBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            {token.priceUsd > 0 && (
              ` · $${token.priceUsd < 0.01
                ? token.priceUsd.toExponential(2)
                : token.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
            )}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.value}>
          ${safeValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
        <Text style={[styles.change, { color: changeColor }]}>
          {safeChange >= 0 ? "+" : ""}
          {safeChange.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  logoPlaceholder: {
    backgroundColor: COLORS.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: 16,
  },
  info: {
    flex: 1,
  },
  symbol: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 16,
  },
  balance: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  right: {
    alignItems: "flex-end",
  },
  value: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 16,
  },
  change: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: "500",
  },
});
