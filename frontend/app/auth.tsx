import React, { useState } from "react";
import { View, StyleSheet, Pressable, Text, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type } from "@/src/theme";
import { PrimaryButton } from "@/src/ui";
import { useAuth } from "@/src/auth";
import { ApiError } from "@/src/api";

const BG =
  "https://images.unsplash.com/photo-1642369717514-f73f300e7d32?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwyfHxkYXJrJTIwcmVkJTIwYWJzdHJhY3QlMjB0ZW5zaW9uJTIwdGV4dHVyZSUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzgzNTY1OTQyfDA&ixlib=rb-4.1.0&q=85";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password || (mode === "register" && !username.trim())) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "register") {
        await register(email.trim(), username.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong.";
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(15,15,19,0.55)", "rgba(15,15,19,0.85)", "#0F0F13"]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space["3xl"], paddingBottom: insets.bottom + space.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <MaterialCommunityIcons name="alert-octagon" size={40} color={colors.red} />
        </View>
        <Text style={styles.title}>PANIC BUTTON</Text>
        <Text style={styles.subtitle}>100 enter. One survives. Don&apos;t press it wrong.</Text>

        <View style={styles.card} testID="auth-card">
          <View style={styles.toggle}>
            <Pressable
              testID="tab-register"
              onPress={() => setMode("register")}
              style={[styles.toggleBtn, mode === "register" && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, mode === "register" && styles.toggleTextActive]}>
                SIGN UP
              </Text>
            </Pressable>
            <Pressable
              testID="tab-login"
              onPress={() => setMode("login")}
              style={[styles.toggleBtn, mode === "login" && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, mode === "login" && styles.toggleTextActive]}>
                LOG IN
              </Text>
            </Pressable>
          </View>

          <TextInput
            testID="input-email"
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          {mode === "register" && (
            <TextInput
              testID="input-username"
              placeholder="Callsign (username)"
              placeholderTextColor={colors.muted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              maxLength={16}
              style={styles.input}
            />
          )}
          <TextInput
            testID="input-password"
            placeholder="Password"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />

          {error && (
            <View style={styles.errorBox} testID="auth-error">
              <MaterialCommunityIcons name="alert-circle" size={16} color={colors.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <PrimaryButton
            testID="auth-submit"
            label={mode === "register" ? "ENTER THE ARENA" : "RETURN TO ARENA"}
            onPress={submit}
            loading={loading}
            style={{ marginTop: space.sm }}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: space.xl, justifyContent: "center" },
  brandRow: { alignItems: "center", marginBottom: space.md },
  title: {
    fontFamily: font.displayBold,
    fontSize: 52,
    color: colors.onSurface,
    textAlign: "center",
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: type.base,
    color: colors.onSurface3,
    textAlign: "center",
    marginTop: space.xs,
    marginBottom: space["2xl"],
  },
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.xs,
    marginBottom: space.lg,
  },
  toggleBtn: { flex: 1, paddingVertical: space.md, alignItems: "center", borderRadius: radius.sm },
  toggleActive: { backgroundColor: colors.red },
  toggleText: { fontFamily: font.semi, fontSize: type.base, color: colors.muted, letterSpacing: 1 },
  toggleTextActive: { color: "#FFFFFF" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    height: 52,
    color: colors.onSurface,
    fontFamily: font.regular,
    fontSize: type.lg,
    marginBottom: space.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.redDeep,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  errorText: { color: colors.red, fontFamily: font.medium, fontSize: type.base, flex: 1 },
});
