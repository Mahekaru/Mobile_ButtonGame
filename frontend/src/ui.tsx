// Shared UI primitives for Panic Button.
import React from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { colors, font, radius, space, type, shade, SKIN_PATTERNS } from "@/src/theme";

type TxtProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  display?: boolean;
};
export function Txt({ children, style, numberOfLines, display }: TxtProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: colors.onSurface, fontFamily: display ? font.displayMedium : font.regular }, style]}
    >
      {children}
    </Text>
  );
}

export function GlassCard({
  children,
  style,
  intensity = 30,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.glassWrap, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glassInner}>{children}</View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  color = colors.red,
  textColor = "#FFFFFF",
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
  textColor?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: color, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.btnText, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function StatPill({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View testID={testID} style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

function PatternOverlay({ pattern, size }: { pattern: string; size: number }) {
  if (pattern === "rings") {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[0.9, 0.62, 0.36].map((f, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              width: size * f,
              height: size * f,
              borderRadius: (size * f) / 2,
              borderWidth: Math.max(2, size * 0.02),
              borderColor: "rgba(255,255,255,0.28)",
              top: (size - size * f) / 2,
              left: (size - size * f) / 2,
            }}
          />
        ))}
      </View>
    );
  }
  if (pattern === "stripes") {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              width: size * 2,
              height: size * 0.11,
              backgroundColor: "rgba(0,0,0,0.22)",
              top: i * size * 0.26 - size * 0.5,
              left: -size * 0.5,
              transform: [{ rotate: "45deg" }],
            }}
          />
        ))}
      </View>
    );
  }
  if (pattern === "dots") {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 5 }).flatMap((_, r) =>
          Array.from({ length: 5 }).map((__, c) => (
            <View
              key={`${r}-${c}`}
              style={{
                position: "absolute",
                width: size * 0.06,
                height: size * 0.06,
                borderRadius: 99,
                backgroundColor: "rgba(255,255,255,0.22)",
                top: size * 0.14 + r * size * 0.18,
                left: size * 0.14 + c * size * 0.18,
              }}
            />
          )),
        )}
      </View>
    );
  }
  if (pattern === "shine") {
    return (
      <LinearGradient
        colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    );
  }
  if (pattern === "wood") {
    // Horizontal oak grain: darker bands + fine grain lines.
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={["rgba(0,0,0,0.18)", "rgba(255,255,255,0.06)", "rgba(0,0,0,0.22)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {Array.from({ length: 9 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 1.5,
              top: size * (0.08 + i * 0.1),
              backgroundColor: i % 2 === 0 ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </View>
    );
  }
  if (pattern === "retro") {
    // CRT scanlines.
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 18 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: size * 0.02,
              top: i * size * 0.055,
              backgroundColor: "rgba(0,0,0,0.28)",
            }}
          />
        ))}
      </View>
    );
  }
  if (pattern === "panic") {
    // Industrial emergency-stop look: bold white ring + inner ring.
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[0.94, 0.66].map((f, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              width: size * f,
              height: size * f,
              borderRadius: (size * f) / 2,
              borderWidth: Math.max(3, size * (i === 0 ? 0.05 : 0.03)),
              borderColor: i === 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
              top: (size - size * f) / 2,
              left: (size - size * f) / 2,
            }}
          />
        ))}
      </View>
    );
  }
  if (pattern === "carbon") {
    // Woven carbon-fiber diagonal weave.
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 14 }).map((_, i) => (
          <View
            key={`a${i}`}
            style={{
              position: "absolute",
              width: size * 2,
              height: size * 0.045,
              backgroundColor: "rgba(255,255,255,0.06)",
              top: i * size * 0.16 - size * 0.5,
              left: -size * 0.5,
              transform: [{ rotate: "45deg" }],
            }}
          />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <View
            key={`b${i}`}
            style={{
              position: "absolute",
              width: size * 2,
              height: size * 0.045,
              backgroundColor: "rgba(0,0,0,0.22)",
              top: i * size * 0.16 - size * 0.5,
              left: -size * 0.5,
              transform: [{ rotate: "-45deg" }],
            }}
          />
        ))}
      </View>
    );
  }
  if (pattern === "neon") {
    // Bright inner glow ring.
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View
          style={{
            position: "absolute",
            width: size * 0.86,
            height: size * 0.86,
            borderRadius: (size * 0.86) / 2,
            borderWidth: Math.max(2, size * 0.03),
            borderColor: "rgba(255,255,255,0.85)",
            top: size * 0.07,
            left: size * 0.07,
          }}
        />
        <View
          style={{
            position: "absolute",
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: (size * 0.6) / 2,
            borderWidth: Math.max(1, size * 0.015),
            borderColor: "rgba(255,255,255,0.4)",
            top: size * 0.2,
            left: size * 0.2,
          }}
        />
      </View>
    );
  }
  return null;
}

export function SkinSurface({
  skinId,
  color,
  pattern,
  size,
  radius: r,
  children,
  style,
}: {
  skinId?: string;
  color: string;
  pattern?: string;
  size: number;
  radius?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pat = pattern || (skinId ? SKIN_PATTERNS[skinId] : "solid") || "solid";
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: r ?? size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <LinearGradient colors={[color, shade(color)]} style={StyleSheet.absoluteFill} />
      <PatternOverlay pattern={pat} size={size} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glassWrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(28,28,34,0.5)",
  },
  glassInner: { padding: space.md },
  btn: {
    height: 54,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  btnText: { fontFamily: font.displayBold, fontSize: type.xl, letterSpacing: 1 },
  statPill: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    flex: 1,
  },
  statValue: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface },
  statLabel: {
    fontFamily: font.medium,
    fontSize: type.sm,
    color: colors.muted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
});
