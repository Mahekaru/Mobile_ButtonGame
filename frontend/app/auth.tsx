import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text, TextInput } from "react-native";
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
  const { enterAsGuest, user } = useAuth();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If an authenticated session becomes available (e.g. cold reload lands
  // here before bootstrap resolves), route straight into the app.
  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  const submit = async () => {
    setError(null);
    if (username.trim().length < 2) {
      setError("Pick a callsign (at least 2 characters).");
      return;
    }
    setLoading(true);
    try {
      await enterAsGuest(username.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
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
        <Text style={styles.title}>PRESSURE</Text>
        <Text style={styles.subtitle}>100 players. One button. Every press eliminates someone. It could be you.</Text>

        <View style={styles.card} testID="auth-card">
          <Text style={styles.label}>CHOOSE YOUR CALLSIGN</Text>
          <TextInput
            testID="input-username"
            placeholder="e.g. RedButton_Rex"
            placeholderTextColor={colors.muted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            maxLength={16}
            returnKeyType="go"
            onSubmitEditing={submit}
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
            label="ENTER THE ARENA"
            onPress={submit}
            loading={loading}
            style={{ marginTop: space.sm }}
          />
          <Text style={styles.note}>No email. No password. Just your callsign.</Text>
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
  label: {
    fontFamily: font.semi,
    fontSize: type.sm,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: space.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    height: 56,
    color: colors.onSurface,
    fontFamily: font.semi,
    fontSize: type.xl,
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
  note: {
    fontFamily: font.regular,
    fontSize: type.sm,
    color: colors.muted,
    textAlign: "center",
    marginTop: space.md,
  },
});
