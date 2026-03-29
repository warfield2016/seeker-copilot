import "./src/utils/polyfills";
import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { COLORS } from "./src/config/constants";
import ConnectScreen from "./src/screens/ConnectScreen";
import PortfolioScreen from "./src/screens/PortfolioScreen";
import AIScreen from "./src/screens/AIScreen";
import RecommendationsScreen from "./src/screens/RecommendationsScreen";

const Tab = createBottomTabNavigator();

// Solana Seeker phone: 6.36" AMOLED, 1080x2400 → logical 393x873
const SEEKER_WIDTH = 393;
const SEEKER_HEIGHT = 873;

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  const color = focused ? COLORS.secondary : COLORS.textSecondary;
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text style={{ fontSize: 18, color }}>{icon}</Text>
      <Text style={{ fontSize: 9, fontWeight: "600", color, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

function MainApp() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background, elevation: 0, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: "700" },
          tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, borderTopWidth: 1, height: 60, paddingBottom: 8, paddingTop: 4 },
          tabBarActiveTintColor: COLORS.secondary,
          tabBarInactiveTintColor: COLORS.textSecondary,
        }}
      >
        <Tab.Screen
          name="Portfolio"
          component={PortfolioScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="◎" label="Portfolio" focused={focused} />, tabBarLabel: () => null }}
        />
        <Tab.Screen
          name="AI Copilot"
          component={AIScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="✦" label="Copilot" focused={focused} />, tabBarLabel: () => null }}
        />
        <Tab.Screen
          name="Intel"
          component={RecommendationsScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚡" label="Intel" focused={focused} />, tabBarLabel: () => null }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

/** Desktop phone frame that simulates Solana Seeker device */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  // Only show frame on wide screens (desktop browser)
  if (width < 500) return <>{children}</>;

  return (
    <View style={frameStyles.backdrop}>
      {/* Device label */}
      <Text style={frameStyles.deviceLabel}>Solana Seeker</Text>
      {/* Phone bezel */}
      <View style={frameStyles.bezel}>
        {/* Notch / camera cutout */}
        <View style={frameStyles.notchRow}>
          <View style={frameStyles.notch}>
            <View style={frameStyles.camera} />
          </View>
        </View>
        {/* App content */}
        <View style={frameStyles.screen}>{children}</View>
      </View>
      <Text style={frameStyles.hint}>Demo Mode — Simulated Seeker Phone</Text>
    </View>
  );
}

export default function App() {
  const [connected, setConnected] = useState(Platform.OS === "web"); // Auto-connect on web for demo

  const appContent = connected ? <MainApp /> : <ConnectScreen onConnected={() => setConnected(true)} />;

  return (
    <>
      <StatusBar style="light" />
      {Platform.OS === "web" ? <PhoneFrame>{appContent}</PhoneFrame> : appContent}
    </>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 16, fontWeight: "800" },
});

const frameStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#0a0a0f",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
  },
  deviceLabel: {
    color: "#666",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  bezel: {
    width: SEEKER_WIDTH + 16,
    height: SEEKER_HEIGHT + 16,
    backgroundColor: "#1a1a2e",
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#333",
    padding: 8,
    // Shadow for depth
    shadowColor: "#9945FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    overflow: "hidden",
  },
  notchRow: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: "center",
  },
  notch: {
    width: 100,
    height: 28,
    backgroundColor: "#000",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  camera: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#333",
  },
  screen: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: COLORS.background,
  },
  hint: {
    color: "#555",
    fontSize: 11,
    marginTop: 12,
    letterSpacing: 0.5,
  },
});
