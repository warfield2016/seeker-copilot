import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, APP_NAME, APP_VERSION, FREE_QUERIES_PER_DAY, PRO_QUERIES_PER_DAY, SKR_STAKE_PRO_THRESHOLD } from "../config/constants";

const DISCLAIMER_KEY = "@seeker_copilot_disclaimer_v1";

const LINKS = {
  privacy: "https://seekeraiapp.com/privacy",
  terms: "https://seekeraiapp.com/terms",
  eula: "https://docs.solanamobile.com/dapp-publishing/dapp-store-sample-eula",
  github: "https://github.com/warfield2016/seeker-ai-copilot",
  support: "mailto:support@seekeraiapp.com",
  helius: "https://helius.xyz",
  solana: "https://solana.com",
};

function openLink(url: string) {
  Linking.openURL(url).catch(() =>
    Alert.alert("Cannot Open Link", "Please visit: " + url)
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsRow({
  icon,
  label,
  sublabel,
  onPress,
  accent,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowIcon}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, accent && { color: COLORS.primary }]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {onPress && <Text style={styles.rowChevron}>›</Text>}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const resetDisclaimer = () => {
    Alert.alert(
      "Reset Disclaimer",
      "The disclaimer will show again on next launch.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () =>
            AsyncStorage.removeItem(DISCLAIMER_KEY).catch(() => null),
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* App info */}
      <View style={styles.appCard}>
        <View style={styles.appLogoCircle}>
          <Text style={styles.appLogoText}>✦</Text>
        </View>
        <Text style={styles.appName}>{APP_NAME}</Text>
        <Text style={styles.appVersion}>Version {APP_VERSION}</Text>
        <Text style={styles.appTagline}>
          AI-powered portfolio intelligence for Solana Seeker
        </Text>
      </View>

      {/* Disclaimer banner */}
      <View style={styles.disclaimerBanner}>
        <Text style={styles.disclaimerText}>
          ⚠️  This app provides AI-generated analysis for{" "}
          <Text style={{ fontWeight: "700", color: COLORS.text }}>
            informational purposes only.
          </Text>{" "}
          Nothing here constitutes financial advice. Always DYOR.
        </Text>
      </View>

      {/* Pro tier */}
      <SectionHeader title="SKR Pro Tier" />
      <View style={styles.card}>
        <SettingsRow icon="◎" label="Free tier" sublabel={`${FREE_QUERIES_PER_DAY} AI queries per day`} />
        <View style={styles.divider} />
        <SettingsRow icon="✦" label="Pro tier" sublabel={`${PRO_QUERIES_PER_DAY} AI queries per day`} accent />
        <View style={styles.divider} />
        <SettingsRow
          icon="⬡"
          label="Unlock Pro"
          sublabel={`Stake ${SKR_STAKE_PRO_THRESHOLD} SKR tokens to upgrade`}
          onPress={() => openLink("https://solanamonile.com")}
        />
      </View>

      {/* Legal */}
      <SectionHeader title="Legal" />
      <View style={styles.card}>
        <SettingsRow
          icon="🔒"
          label="Privacy Policy"
          sublabel="How we handle your data"
          onPress={() => openLink(LINKS.privacy)}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon="📄"
          label="Terms of Service"
          sublabel="App terms and conditions"
          onPress={() => openLink(LINKS.terms)}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon="📋"
          label="End-User License (EULA)"
          sublabel="Solana dApp Store standard EULA"
          onPress={() => openLink(LINKS.eula)}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon="⚠️"
          label="View Disclaimer Again"
          sublabel="AI analysis is not financial advice"
          onPress={resetDisclaimer}
        />
      </View>

      {/* About */}
      <SectionHeader title="About" />
      <View style={styles.card}>
        <SettingsRow
          icon="🌐"
          label="GitHub"
          sublabel="Open source — MIT license"
          onPress={() => openLink(LINKS.github)}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon="✉️"
          label="Contact Support"
          sublabel="support@seekeraiapp.com"
          onPress={() => openLink(LINKS.support)}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon="⚡"
          label="Powered by Helius DAS API"
          sublabel="Real-time Solana portfolio data"
          onPress={() => openLink(LINKS.helius)}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon="◎"
          label="Built on Solana"
          sublabel="Mobile Wallet Adapter v2"
          onPress={() => openLink(LINKS.solana)}
        />
      </View>

      {/* Credits */}
      <Text style={styles.credits}>
        Made with ✦ for the Solana Seeker ecosystem{"\n"}
        © 2026 Seeker AI Copilot
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  appCard: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 8,
  },
  appLogoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  appLogoText: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: "900",
  },
  appName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  appVersion: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  appTagline: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  disclaimerBanner: {
    backgroundColor: COLORS.warning + "18",
    borderWidth: 1,
    borderColor: COLORS.warning + "44",
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  disclaimerText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  rowIconText: {
    fontSize: 15,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  rowSublabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  rowChevron: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: "300",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 58,
  },
  credits: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
  },
});
