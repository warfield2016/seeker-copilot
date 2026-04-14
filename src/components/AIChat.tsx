import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { AIQuery, Portfolio, UserTier } from "../types";
import { COLORS } from "../config/constants";
import aiService from "../services/aiService";
import * as Haptics from "expo-haptics";

interface Props {
  portfolio: Portfolio | null;
  userTier: UserTier;
  messages: AIQuery[];
  onNewMessage: (msg: AIQuery) => void;
  onClearChat: () => void;
  onQueryUsed: () => void;
}

export default function AIChat({ portfolio, userTier, messages, onNewMessage, onClearChat, onQueryUsed }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const canQuery = userTier.queriesRemaining > 0;

  // Build conversation history for backend context (last 3 turns = 6 messages)
  const getConversationHistory = (): Array<{ role: string; content: string }> => {
    return messages.slice(0, 6).reverse().flatMap((m) => [
      { role: "user", content: m.question },
      { role: "assistant", content: m.response.slice(0, 200) },
    ]);
  };

  const handleSend = async () => {
    if (!input.trim() || !canQuery || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const question = input.trim();
    setInput("");
    setLoading(true);

    try {
      const result = await aiService.askQuestion(
        portfolio,
        question,
        getConversationHistory(),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onNewMessage(result);
      onQueryUsed();
    } catch (error) {
      onNewMessage({
        id: Date.now().toString(),
        question,
        response: "Something went wrong. Please try again.",
        timestamp: new Date(),
        type: "general",
      });
    } finally {
      setLoading(false);
    }
  };

  const portfolioQuestions = [
    "What's my biggest risk right now?",
    "Should I rebalance my portfolio?",
    "How can I earn more yield on my holdings?",
    "Analyze my SOL concentration risk",
  ];

  const generalQuestions = [
    "What is liquid staking on Solana?",
    "What are the top Solana DeFi protocols?",
    "What is Seeker Season 2 and how do I earn rewards?",
    "How does Solana consensus work?",
  ];

  const suggestedQuestions = portfolio
    ? [...portfolioQuestions, generalQuestions[0]]
    : generalQuestions;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Text style={[styles.queries, userTier.queriesRemaining <= 3 && { color: COLORS.warning }]}>
          {userTier.queriesRemaining}/{userTier.queriesPerDay} queries remaining
        </Text>
        {messages.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => Alert.alert("Clear Chat", "Remove all conversation history?", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear", style: "destructive", onPress: onClearChat },
            ])}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {messages.length === 0 && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsTitle}>Try asking:</Text>
          {suggestedQuestions.map((q) => (
            <TouchableOpacity
              key={q}
              style={styles.suggestionChip}
              onPress={() => setInput(q)}
            >
              <Text style={styles.suggestionText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        style={styles.messageList}
        ListHeaderComponent={loading ? (
          <View style={styles.typingIndicator}>
            <View style={styles.aiMessage}>
              <Text style={styles.typingDots}>{portfolio ? "Analyzing portfolio..." : "Thinking..."}</Text>
            </View>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={styles.messagePair}>
            <View style={styles.userMessage}>
              <Text style={styles.userText}>{item.question}</Text>
            </View>
            <View style={styles.aiMessage}>
              <Text style={styles.aiText}>{item.response.replace(/\*\*/g, "").replace(/^[-*] /gm, "  \u2022 ")}</Text>
              <Text style={styles.timestamp}>
                {item.timestamp.toLocaleTimeString()}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={
            canQuery
              ? "Ask about your portfolio or crypto in general..."
              : "Daily limit reached. Stake 2,000 SKR for Pro (20/day)."
          }
          placeholderTextColor={COLORS.textSecondary}
          editable={canQuery && !loading}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!canQuery || loading || !input.trim()) && styles.sendDisabled,
          ]}
          onPress={handleSend}
          disabled={!canQuery || loading || !input.trim()}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.background} size="small" />
          ) : (
            <Text style={styles.sendText}>Ask</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  clearBtn: {
    position: "absolute",
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLight,
  },
  clearBtnText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  queries: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  suggestions: {
    padding: 16,
  },
  suggestionsTitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 12,
  },
  suggestionChip: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.glow,
  },
  suggestionText: {
    color: COLORS.primary,
    fontSize: 14,
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagePair: {
    marginVertical: 8,
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 12,
    maxWidth: "80%",
    marginBottom: 8,
  },
  userText: {
    color: COLORS.text,
    fontSize: 14,
  },
  typingIndicator: {
    marginVertical: 8,
  },
  typingDots: {
    color: COLORS.accent,
    fontSize: 13,
    fontStyle: "italic",
  },
  aiMessage: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
    maxWidth: "90%",
    borderWidth: 1,
    borderColor: COLORS.glow,
  },
  aiText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  timestamp: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 6,
    alignSelf: "flex-end",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: COLORS.background,
    fontWeight: "700",
    fontSize: 14,
  },
});
