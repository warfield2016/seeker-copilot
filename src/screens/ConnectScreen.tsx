import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from "react-native";
import { COLORS, APP_NAME } from "../config/constants";
import walletService from "../services/walletService";

interface Props {
  onConnected: (address: string) => void;
}

export default function ConnectScreen({ onConnected }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staggered fade-in animations
  const logoAnim = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const featuresAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const stagger = Animated.stagger(150, [
      Animated.spring(logoAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.spring(titleAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.spring(featuresAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.spring(buttonAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }),
    ]);
    stagger.start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    pulse.start();

    return () => { stagger.stop(); pulse.stop(); };
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const address = await walletService.connect();
      onConnected(address);
    } catch (err: any) {
      setError(err.message ?? "Failed to connect wallet");
    } finally {
      setLoading(false);
    }
  };

  const fadeUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
    ],
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Animated logo with glow */}
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: pulseAnim }] }, fadeUp(logoAnim)]}>
          <View style={styles.logoGlow}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>✦</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={fadeUp(titleAnim)}>
          <Text style={styles.title}>{APP_NAME}</Text>
          <Text style={styles.subtitle}>AI-powered portfolio intelligence{"\n"}for Solana Seeker</Text>
        </Animated.View>

        {/* Features — clean grid */}
        <Animated.View style={[styles.features, fadeUp(featuresAnim)]}>
          <View style={styles.featureGrid}>
            <FeatureChip icon="◎" label="Track" />
            <FeatureChip icon="✦" label="Analyze" />
            <FeatureChip icon="⚡" label="Intel" />
            <FeatureChip icon="⬡" label="SKR Pro" />
          </View>
        </Animated.View>

        {/* Connect button */}
        <Animated.View style={[{ width: "100%" }, fadeUp(buttonAnim)]}>
          <TouchableOpacity
            style={[styles.connectButton, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.connectText}>Connect Wallet</Text>
            )}
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.footer}>
            Secure connection via Seed Vault
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

function FeatureChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 32,
    alignItems: "center",
  },
  logoContainer: { marginBottom: 24 },
  logoGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + "18",
    justifyContent: "center",
    alignItems: "center",
    // Purple glow effect
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  features: {
    width: "100%",
    marginTop: 32,
    marginBottom: 32,
  },
  featureGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  chip: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.glow,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  chipIcon: {
    color: COLORS.secondary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  chipLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  connectButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  connectText: {
    color: COLORS.background,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  error: {
    color: COLORS.danger,
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  footer: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
  },
});
