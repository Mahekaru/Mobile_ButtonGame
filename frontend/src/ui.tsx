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
import * as Haptics from "expo-haptics";
import { colors, font, radius, space, type } from "@/src/theme";

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
