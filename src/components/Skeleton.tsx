import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { COLORS } from "../config/constants";

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export default function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: Props) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: COLORS.surfaceLight,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonPortfolio() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.header}>
        <Skeleton width={180} height={12} />
        <View style={{ height: 8 }} />
        <Skeleton width={220} height={36} />
        <View style={{ height: 8 }} />
        <Skeleton width={120} height={16} />
      </View>

      <View style={skeletonStyles.card}>
        <Skeleton width={80} height={12} />
        <View style={{ height: 8 }} />
        <Skeleton width="100%" height={14} />
        <View style={{ height: 6 }} />
        <Skeleton width="80%" height={14} />
      </View>

      <View style={skeletonStyles.card}>
        <Skeleton width={100} height={12} />
        <View style={{ height: 12 }} />
        <Skeleton width="100%" height={80} borderRadius={40} />
      </View>

      {[1, 2, 3].map((i) => (
        <View key={i} style={skeletonStyles.tokenRow}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton width={60} height={14} />
            <View style={{ height: 6 }} />
            <Skeleton width={100} height={12} />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Skeleton width={70} height={14} />
            <View style={{ height: 6 }} />
            <Skeleton width={50} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  header: {
    alignItems: "center",
    paddingVertical: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.glow,
  },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
});
