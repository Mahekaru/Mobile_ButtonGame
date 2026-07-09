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

// ---------------------------------------------------------------------------
// ButtonFX — animated aura rendered AROUND the panic button (cosmetic).
// types: "glow" (pulsing halo), "fire" (rising flames), "electric" (spinning arc)
// ---------------------------------------------------------------------------
const FIRE_COLORS = ["#FF3B30", "#FF9500", "#FFCC00"];
const FIRE_COUNT = 14;

function Layer({ children }: { children: React.ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
      {children}
    </View>
  );
}

function GlowRing({ delay, ringSize, color }: { delay: number; ringSize: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: (1 - p.value) * 0.55,
    transform: [{ scale: 0.72 + p.value * 0.55 }],
  }));
  return (
    <Layer>
      <Animated.View
        style={[
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderWidth: 3, borderColor: color },
          style,
        ]}
      />
    </Layer>
  );
}

function FlameTongue({ index, size, color }: { index: number; size: number; color: string }) {
  const angle = (index / FIRE_COUNT) * Math.PI * 2;
  const rise = useSharedValue(0);
  const dur = rand(720, 1250);
  useEffect(() => {
    rise.value = withDelay(
      (index % 7) * 130,
      withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, []);
  const baseR = size * 0.42;
  const cx = Math.cos(angle) * baseR;
  const cy = Math.sin(angle) * baseR;
  const style = useAnimatedStyle(() => ({
    opacity: (1 - rise.value) * 0.9,
    transform: [
      { translateX: cx },
      { translateY: cy - rise.value * 26 },
      { scale: 1 - rise.value * 0.6 },
    ],
  }));
  return (
    <Layer>
      <Animated.View style={[{ width: 15, height: 20, borderRadius: 9, backgroundColor: color }, style]} />
    </Layer>
  );
}

function ElectricArc({ size }: { size: number }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value * 360}deg` }] }));
  const dashes = 16;
  return (
    <Layer>
      <Animated.View style={[{ width: size, height: size }, style]}>
        {Array.from({ length: dashes }).map((_, i) => {
          const a = (i / dashes) * Math.PI * 2;
          const r = size * 0.46;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: size / 2 + Math.cos(a) * r - 1.5,
                top: size / 2 + Math.sin(a) * r - 6,
                width: 3,
                height: 12,
                borderRadius: 2,
                backgroundColor: i % 2 ? "#00E5FF" : "#7DF9FF",
                transform: [{ rotate: `${a}rad` }],
              }}
            />
          );
        })}
      </Animated.View>
    </Layer>
  );
}

export function ButtonFX({ type, size = 260 }: { type?: string; size?: number }) {
  if (!type || type === "none") return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      {type === "glow" &&
        [0, 640, 1280].map((d, i) => (
          <GlowRing key={i} delay={d} ringSize={size * 0.82} color={i === 1 ? "#FF9500" : "#FF3B30"} />
        ))}
      {type === "fire" &&
        Array.from({ length: FIRE_COUNT }).map((_, i) => (
          <FlameTongue key={i} index={i} size={size} color={FIRE_COLORS[i % FIRE_COLORS.length]} />
        ))}
      {type === "electric" && <ElectricArc size={size} />}
    </View>
  );
}
