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
} from "react-native";
import { AIQuery, Portfolio, UserTier } from "../types";
import { COLORS } from "../config/constants";
import aiService from "../services/aiService";

interface Props {
  portfolio: Portfolio | null;
  userTier: UserTier;
  onQueryUsed: () => void;
}

export default function AIChat({ portfolio, userTier, onQueryUsed }: Props) {
  const [messages, setMessages] = useState<AIQuery[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const canQuery = userTier.queriesRemaining > 0;

  const handleSend = async () => {
    if (!input.trim() || !portfolio || !canQuery || loading) return;

    const question = input.trim();
    setInput("");
    setLoading(true);

    try {
      const result = await aiService.askQuestion(portfolio, question);
      setMessages((prev) => [result, ...prev]);
      onQueryUsed();
    } catch (error) {
      setMessages((prev) => [
        {
          id: Date.now().toString(),
          question,
          response: "Something went wrong. Please try again.",
          timestamp: new Date(),
          type: "general",
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestedQuestions = [
    "What's my biggest risk right now?",
    "Should I rebalance my portfolio?",
    "How diversified am I?",
    "What's my best performing asset?",
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>AI Copilot</Text>
        <Text style={styles.queries}>
          {userTier.queriesRemaining}/{userTier.queriesPerDay} queries
          {userTier.level === "free" ? " (Free)" : " (Pro)"}
        </Text>
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
              ? "Ask about your portfolio..."
              : "Daily limit reached. Stake SKR for Pro."
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  queries: {
    color: COLORS.textSecondary,
    fontSize: 13,
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
    borderColor: COLORS.border,
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
  aiMessage: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
    maxWidth: "90%",
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
