// Lightweight in-match victory particle effects (confetti / fireworks / gold rain).
import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

const { width: W, height: H } = Dimensions.get("window");

const PALETTES: Record<string, { motion: "fall" | "burst"; colors: string[]; w: number; h: number; r: number; count: number }> = {
  confetti: { motion: "fall", colors: ["#FF3B30", "#FF9500", "#34C759", "#FFCC00", "#FFFFFF"], w: 9, h: 9, r: 2, count: 26 },
  goldrain: { motion: "fall", colors: ["#FFCC00", "#FFD700", "#FFF3B0"], w: 4, h: 16, r: 2, count: 24 },
  fireworks: { motion: "burst", colors: ["#FF9500", "#FF3B30", "#FFCC00", "#FFFFFF"], w: 8, h: 8, r: 4, count: 30 },
};

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function FallParticle({ color, w, h, r, index }: any) {
  const startX = rand(0, W);
  const dur = rand(2200, 3600);
  const y = useSharedValue(-40);
  const rot = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(index * 90, withRepeat(withTiming(H + 60, { duration: dur, easing: Easing.linear }), -1));
    rot.value = withRepeat(withTiming(1, { duration: rand(800, 1600), easing: Easing.linear }), -1);
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { rotate: `${rot.value * 360}deg` }],
  }));
  return (
    <Animated.View
      style={[{ position: "absolute", left: startX, top: 0, width: w, height: h, borderRadius: r, backgroundColor: color }, style]}
    />
  );
}

function BurstParticle({ color, w, h, r, index }: any) {
  const angle = rand(0, Math.PI * 2);
  const radius = rand(80, 190);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      (index % 10) * 120,
      withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1),
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * radius * p.value },
      { translateY: Math.sin(angle) * radius * p.value },
      { scale: 1 - p.value * 0.4 },
    ],
  }));
  return (
    <Animated.View
      style={[{ position: "absolute", width: w, height: h, borderRadius: r, backgroundColor: color }, style]}
    />
  );
}

export function VictoryFX({ type }: { type?: string }) {
  const conf = PALETTES[type || "confetti"] || PALETTES.confetti;
  const items = Array.from({ length: conf.count });
  if (conf.motion === "burst") {
    return (
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
        {items.map((_, i) => (
          <BurstParticle key={i} index={i} color={conf.colors[i % conf.colors.length]} w={conf.w} h={conf.h} r={conf.r} />
        ))}
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((_, i) => (
        <FallParticle key={i} index={i} color={conf.colors[i % conf.colors.length]} w={conf.w} h={conf.h} r={conf.r} />
      ))}
    </View>
  );
}
