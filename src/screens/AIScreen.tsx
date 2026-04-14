import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, FREE_QUERIES_PER_DAY, PRO_QUERIES_PER_DAY, SKR_STAKE_PRO_THRESHOLD } from "../config/constants";
import { Portfolio, UserTier, AIQuery } from "../types";
import AIChat from "../components/AIChat";
import PortfolioService from "../services/portfolioService";
import walletService from "../services/walletService";
import { DEMO_PORTFOLIO } from "../services/demoData";

const CHAT_HISTORY_KEY = "@seeker_chat_history_v1";
const MAX_STORED_MESSAGES = 50;

export default function AIScreen() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [messages, setMessages] = useState<AIQuery[]>([]);
  const [userTier, setUserTier] = useState<UserTier>({
    level: "free",
    skrStaked: 0,
    queriesRemaining: FREE_QUERIES_PER_DAY,
    queriesPerDay: FREE_QUERIES_PER_DAY,
  });

  // Load chat history from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(CHAT_HISTORY_KEY)
      .then((val) => {
        if (val) {
          const parsed = JSON.parse(val) as AIQuery[];
          // Restore Date objects from JSON
          setMessages(parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
        }
      })
      .catch(() => {});
  }, []);

  // Persist messages when they change
  const handleNewMessage = useCallback((msg: AIQuery) => {
    setMessages((prev) => {
      const updated = [msg, ...prev].slice(0, MAX_STORED_MESSAGES);
      AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    AsyncStorage.removeItem(CHAT_HISTORY_KEY).catch(() => {});
  }, []);

  useEffect(() => {
    let aborted = false;
    const load = async () => {
      let data: Portfolio;
      if (Platform.OS === "web" || !walletService.isConnected()) {
        data = DEMO_PORTFOLIO;
      } else {
        try {
          const svc = new PortfolioService(walletService.getConnection());
          data = await svc.getPortfolio(walletService.getAddress()!);
        } catch {
          data = DEMO_PORTFOLIO;
        }
      }
      if (aborted) return;
      setPortfolio(data);
      const isPro = data.skrStaked >= SKR_STAKE_PRO_THRESHOLD;
      const qpd = isPro ? PRO_QUERIES_PER_DAY : FREE_QUERIES_PER_DAY;
      setUserTier({ level: isPro ? "pro" : "free", skrStaked: data.skrStaked, queriesRemaining: qpd, queriesPerDay: qpd });
    };
    load();
    return () => { aborted = true; };
  }, []);

  return (
    <View style={styles.container}>
      <AIChat
        portfolio={portfolio}
        userTier={userTier}
        messages={messages}
        onNewMessage={handleNewMessage}
        onClearChat={handleClearChat}
        onQueryUsed={() => setUserTier((p) => ({ ...p, queriesRemaining: Math.max(0, p.queriesRemaining - 1) }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
});
