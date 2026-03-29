import React, { useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { TokenBalance } from "../types";
import { COLORS } from "../config/constants";

interface Props {
  token: TokenBalance;
}

/** Format a balance for display — never show scientific notation */
function formatBalance(balance: number): string {
  if (balance <= 0) return "0";
  if (balance >= 1_000_000) return balance.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (balance >= 1) return balance.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (balance >= 0.001) return balance.toFixed(4);
  if (balance >= 0.000001) return balance.toFixed(6);
  return "< 0.000001";
}

/** Format USD value — show "< $0.01" for dust instead of $0.00 */
function formatUsdValue(value: number): string {
  if (value <= 0) return "$0.00";
  if (value < 0.01) return "< $0.01";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format token price — compact for very small prices */
function formatPrice(price: number): string {
  if (price <= 0) return "";
  if (price >= 1) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.000001) return `$${price.toFixed(6)}`;
  return "< $0.000001";
}

function TokenRow({ token }: Props) {
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
          <Text style={styles.balance}>{formatBalance(safeBalance)}</Text>
          {token.priceUsd > 0 && (
            <Text style={styles.price}>{formatPrice(token.priceUsd)}</Text>
          )}
        </View>
      </View>

      <View style={styles.right}>
        <Text style={[styles.value, safeValue < 0.01 && safeValue > 0 && { color: COLORS.textSecondary }]}>
          {formatUsdValue(safeValue)}
        </Text>
        <Text style={[styles.change, { color: changeColor }]}>
          {safeChange >= 0 ? "+" : ""}{safeChange.toFixed(1)}%
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 16,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  logoPlaceholder: {
    backgroundColor: COLORS.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
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
    fontWeight: "700",
    fontSize: 15,
  },
  balance: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  price: {
    color: "#6E7681",
    fontSize: 11,
    marginTop: 1,
  },
  right: {
    alignItems: "flex-end",
    minWidth: 80,
  },
  value: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 15,
  },
  change: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: "600",
  },
});

export default React.memo(TokenRow);
