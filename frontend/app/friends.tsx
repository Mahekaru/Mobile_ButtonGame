import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, TextInput, Pressable, Share } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type } from "@/src/theme";
import { PrimaryButton } from "@/src/ui";
import { api, ApiError } from "@/src/api";

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [code, setCode] = useState<string>("");
  const [friends, setFriends] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.friends();
      setCode(data.friend_code);
      setFriends(data.friends);
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const invite = async () => {
    Haptics.selectionAsync();
    try {
      await Share.share({
        message: `Think you can survive PRESSURE? Add me and I'll knock you out first. My code: ${code}`,
      });
    } catch {
      /* dismissed */
    }
  };

  const add = async () => {
    const c = input.trim().toUpperCase();
    if (c.length < 4) return;
    setBusy(true);
    setMsg(null);
    try {
      const { added } = await api.addFriend(c);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMsg({ text: `Added ${added.username}!`, ok: true });
      setInput("");
      await load();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMsg({ text: e instanceof ApiError ? e.message : "Could not add friend", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.title}>FRIENDS</Text>
        <Pressable testID="friends-close" onPress={() => router.back()} style={styles.close}>
          <MaterialCommunityIcons name="close" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={20}
        contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Your code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>YOUR FRIEND CODE</Text>
          <Text style={styles.codeValue} testID="my-friend-code">{code || "······"}</Text>
          <Text style={styles.codeHint}>Knock out friends in a match for +50 XP · rivals +25 XP</Text>
          <PrimaryButton
            testID="invite-btn"
            label="SHARE INVITE"
            onPress={invite}
            color={colors.amber}
            textColor={colors.surface}
            style={{ marginTop: space.lg }}
          />
        </View>

        {/* Add by code */}
        <Text style={styles.sectionTitle}>ADD A FRIEND</Text>
        <View style={styles.addRow}>
          <TextInput
            testID="friend-code-input"
            placeholder="ENTER CODE"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            autoCapitalize="characters"
            maxLength={8}
            style={styles.input}
          />
          <Pressable
            testID="add-friend-btn"
            onPress={add}
            disabled={busy}
            style={[styles.addBtn, busy && { opacity: 0.5 }]}
          >
            <MaterialCommunityIcons name="account-plus" size={22} color="#fff" />
          </Pressable>
        </View>
        {msg && (
          <Text style={[styles.msg, { color: msg.ok ? colors.success : colors.red }]} testID="friend-msg">
            {msg.text}
          </Text>
        )}

        {/* Friends list */}
        <Text style={styles.sectionTitle}>YOUR SQUAD ({friends.length})</Text>
        {friends.length === 0 ? (
          <View style={styles.empty} testID="friends-empty">
            <MaterialCommunityIcons name="account-group-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyText}>No friends yet. Share your code to build a rivalry.</Text>
          </View>
        ) : (
          friends.map((f) => (
            <View key={f.id} style={styles.friendRow} testID={`friend-${f.id}`}>
              <View style={styles.friendAvatar}>
                <MaterialCommunityIcons name="account" size={20} color={colors.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>{f.username}</Text>
                <Text style={styles.friendMeta}>{f.rank} · LV {f.level} · {f.friend_code}</Text>
              </View>
              <MaterialCommunityIcons name="sword" size={18} color={colors.muted} />
            </View>
          ))
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface, letterSpacing: 1 },
  close: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  codeCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.xl,
    alignItems: "center",
  },
  codeLabel: { fontFamily: font.semi, fontSize: type.sm, color: colors.muted, letterSpacing: 1.5 },
  codeValue: {
    fontFamily: font.displayBold,
    fontSize: 56,
    color: colors.amber,
    letterSpacing: 6,
    marginVertical: space.sm,
  },
  codeHint: { fontFamily: font.regular, fontSize: type.sm, color: colors.onSurface3, textAlign: "center" },
  sectionTitle: {
    fontFamily: font.semi,
    fontSize: type.sm,
    color: colors.muted,
    letterSpacing: 1.5,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  addRow: { flexDirection: "row", gap: space.md },
  input: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    height: 54,
    color: colors.onSurface,
    fontFamily: font.semi,
    fontSize: type.xl,
    letterSpacing: 3,
  },
  addBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  msg: { fontFamily: font.medium, fontSize: type.base, marginTop: space.sm },
  empty: { alignItems: "center", paddingVertical: space["2xl"], gap: space.sm },
  emptyText: { fontFamily: font.regular, fontSize: type.base, color: colors.muted, textAlign: "center", paddingHorizontal: space.xl },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.redDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  friendName: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface },
  friendMeta: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, marginTop: 1 },
});
