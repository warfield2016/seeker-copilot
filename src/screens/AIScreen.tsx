import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { COLORS, FREE_QUERIES_PER_DAY, PRO_QUERIES_PER_DAY, SKR_STAKE_PRO_THRESHOLD } from "../config/constants";
import { Portfolio, UserTier } from "../types";
import AIChat from "../components/AIChat";
import PortfolioService from "../services/portfolioService";
import walletService from "../services/walletService";
import { DEMO_PORTFOLIO } from "../services/demoData";

export default function AIScreen() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [userTier, setUserTier] = useState<UserTier>({
    level: "free",
    skrStaked: 0,
    queriesRemaining: FREE_QUERIES_PER_DAY,
    queriesPerDay: FREE_QUERIES_PER_DAY,
  });

  useEffect(() => {
    const load = async () => {
      let data: Portfolio;
      if (Platform.OS === "web" || !walletService.isConnected()) {
        data = DEMO_PORTFOLIO;
      } else {
        const svc = new PortfolioService(walletService.getConnection());
        data = await svc.getPortfolio(walletService.getAddress()!);
      }
      setPortfolio(data);
      const isPro = data.skrStaked >= SKR_STAKE_PRO_THRESHOLD;
      const qpd = isPro ? PRO_QUERIES_PER_DAY : FREE_QUERIES_PER_DAY;
      setUserTier({ level: isPro ? "pro" : "free", skrStaked: data.skrStaked, queriesRemaining: qpd, queriesPerDay: qpd });
    };
    load();
  }, []);

  return (
    <View style={styles.container}>
      <AIChat
        portfolio={portfolio}
        userTier={userTier}
        onQueryUsed={() => setUserTier((p) => ({ ...p, queriesRemaining: Math.max(0, p.queriesRemaining - 1) }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
});
