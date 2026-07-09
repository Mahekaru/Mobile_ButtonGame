// Lightweight in-match victory particle effects (confetti / fireworks / gold rain).
import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
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
const FIRE_COUNT = 20;
const FIRE_GRAD = ["#FFE39A", "#FF9500", "#FF3B30"];

function Layer({ children }: { children: React.ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
      {children}
    </View>
  );
}

// --- GLOW: a soft breathing bloom made of layered translucent discs ---------
const GLOW_LAYERS = [
  { f: 1.0, color: "rgba(255,59,48,0.14)" },
  { f: 0.84, color: "rgba(255,94,40,0.18)" },
  { f: 0.68, color: "rgba(255,120,32,0.24)" },
  { f: 0.54, color: "rgba(255,149,0,0.30)" },
  { f: 0.42, color: "rgba(255,201,128,0.38)" },
];

function GlowDisc({ t, discSize, color }: { t: Animated.SharedValue<number>; discSize: number; color: string }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0, 1], [0.88, 1.12]) }],
    opacity: interpolate(t.value, [0, 1], [0.6, 1]),
  }));
  return (
    <Layer>
      <Animated.View style={[{ width: discSize, height: discSize, borderRadius: discSize / 2, backgroundColor: color }, style]} />
    </Layer>
  );
}

function GlowAura({ size }: { size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  return (
    <>
      {GLOW_LAYERS.map((l, i) => (
        <GlowDisc key={i} t={t} discSize={size * l.f} color={l.color} />
      ))}
    </>
  );
}

// --- FIRE: warm base bloom + rising, flickering flame tongues ----------------
function FireBase({ size }: { size: number }) {
  return (
    <>
      <Layer>
        <View style={{ width: size * 0.72, height: size * 0.72, borderRadius: size, backgroundColor: "rgba(255,59,48,0.12)" }} />
      </Layer>
      <Layer>
        <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size, backgroundColor: "rgba(255,149,0,0.14)" }} />
      </Layer>
    </>
  );
}

function Flame({ index, size, total }: { index: number; size: number; total: number }) {
  const p = useSharedValue(0);
  const dur = 820 + ((index * 137) % 620);
  useEffect(() => {
    p.value = withDelay(
      (index % 9) * 80,
      withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, []);
  // Spread flames across the lower ~270° arc, biased toward the bottom.
  const arc = Math.PI * 1.5;
  const a = Math.PI * 0.75 + (index / (total - 1)) * arc;
  const R = size * 0.4;
  const bx = Math.cos(a) * R;
  const by = Math.sin(a) * R * 0.72 + size * 0.05;
  const csize = 13 + (index % 3) * 5;
  const sway = ((index % 5) - 2) * 4;
  const style = useAnimatedStyle(() => {
    const rise = p.value;
    return {
      opacity: interpolate(rise, [0, 0.15, 1], [0, 0.95, 0]),
      transform: [
        { translateX: bx + Math.sin(rise * Math.PI) * sway },
        { translateY: by - rise * size * 0.32 },
        { scale: interpolate(rise, [0, 1], [1, 0.15]) },
      ],
    };
  });
  return (
    <Layer>
      <Animated.View style={[{ width: csize, height: csize * 1.35 }, style]}>
        <LinearGradient
          colors={FIRE_GRAD}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flex: 1, borderRadius: csize / 2 }}
        />
      </Animated.View>
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
      {type === "glow" && <GlowAura size={size * 0.92} />}
      {type === "fire" && (
        <>
          <FireBase size={size} />
          {Array.from({ length: FIRE_COUNT }).map((_, i) => (
            <Flame key={i} index={i} size={size} total={FIRE_COUNT} />
          ))}
        </>
      )}
      {type === "electric" && <ElectricArc size={size} />}
    </View>
  );
}
