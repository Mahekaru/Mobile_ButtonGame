// Lightweight in-match victory particle effects (confetti / fireworks / gold rain).
import React, { useEffect } from "react";
import type { SharedValue } from "react-native-reanimated";
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
const FIRE_GRAD = [
  "#FFE39A",
  "#FF9500",
  "#FF3B30",
] as const;

function Layer({ children }: { children: React.ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
      {children}
    </View>
  );
}

// --- GLOW: intense light-leak bloom — big outward bleed + bright pulsing rim -
// f is a multiple of the button radius; layers >1 bleed OUTSIDE the button edge.
const GLOW_LAYERS = [
  { f: 1.85, color: "rgba(255,64,32,0.10)" },
  { f: 1.55, color: "rgba(255,92,28,0.16)" },
  { f: 1.32, color: "rgba(255,120,20,0.24)" },
  { f: 1.14, color: "rgba(255,150,0,0.34)" },
  { f: 1.02, color: "rgba(255,196,96,0.46)" },
];

function GlowDisc({
  t,
  discSize,
  color,
}: {
  t: SharedValue<number>;
  discSize: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0, 1], [0.8, 1.18]) }],
    opacity: interpolate(t.value, [0, 1], [0.4, 1]),
  }));
  return (
    <Layer>
      <Animated.View
        style={[{ width: discSize, height: discSize, borderRadius: discSize / 2, backgroundColor: color }, style]}
      />
    </Layer>
  );
}

// Bright ring hugging the button edge — reads as light leaking out of the seams.
function GlowRim({
  t,
  discSize,
}: {
  t: SharedValue<number>;
  discSize: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.35, 0.95]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.98, 1.07]) }],
  }));
  return (
    <Layer>
      <Animated.View
        style={[
          {
            width: discSize,
            height: discSize,
            borderRadius: discSize / 2,
            borderWidth: 5,
            borderColor: "rgba(255,204,128,0.95)",
            shadowColor: "#FF9500",
            shadowOpacity: 0.9,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 0 },
            elevation: 18,
          },
          style,
        ]}
      />
    </Layer>
  );
}

function GlowAura({ size }: { size: number }) {
  // size ≈ button diameter. base = radius unit used by the layers.
  const base = size;
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1350, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  return (
    <>
      {GLOW_LAYERS.map((l, i) => (
        <GlowDisc key={i} t={t} discSize={base * l.f} color={l.color} />
      ))}
      <GlowRim t={t} discSize={base * 1.05} />
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
  // Spread flames across the lower ~270° arc, hugging the button edge.
  const arc = Math.PI * 1.5;
  const a = Math.PI * 0.75 + (index / (total - 1)) * arc;
  const R = size * 0.5;
  const bx = Math.cos(a) * R;
  const by = Math.sin(a) * R * 0.7 + size * 0.04;
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

export function ButtonFX({ type, size = 210 }: { type?: string; size?: number }) {
  if (!type || type === "none") return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
    >
      {type === "glow" && <GlowAura size={size} />}
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

// --- PRESS BURST: one-shot click FX played each time the button is pressed ----
const BURST_TINT: Record<string, string> = {
  fire: "#FF7A18",
  electric: "#00E5FF",
  glow: "#FF3B30",
};

function BurstSpark({
  index,
  p,
  color,
  total,
}: {
  index: number;
  p: SharedValue<number>;
  color: string;
  total: number;
}) {
  const a = (index / total) * Math.PI * 2;
  const style = useAnimatedStyle(() => {
    const d = interpolate(p.value, [0, 1], [46, 128]);
    return {
      opacity: interpolate(p.value, [0, 0.2, 1], [0, 1, 0]),
      transform: [
        { translateX: Math.cos(a) * d },
        { translateY: Math.sin(a) * d },
        { scale: interpolate(p.value, [0, 1], [1, 0.25]) },
      ],
    };
  });
  return (
    <Layer>
      <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }, style]} />
    </Layer>
  );
}

export function PressBurst({ type, color, size = 210 }: { type?: string; color?: string; size?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 540, easing: Easing.out(Easing.quad) });
  }, []);
  const tint = (type && BURST_TINT[type]) || color || "#FF3B30";
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.1, 1], [0, 0.85, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.55, 2.2]) }],
  }));
  const N = 10;
  const rSize = size * 0.7;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      <Layer>
        <Animated.View
          style={[
            { width: rSize, height: rSize, borderRadius: rSize / 2, borderWidth: 4, borderColor: tint },
            ring,
          ]}
        />
      </Layer>
      {Array.from({ length: N }).map((_, i) => (
        <BurstSpark key={i} index={i} p={p} color={tint} total={N} />
      ))}
    </View>
  );
}
