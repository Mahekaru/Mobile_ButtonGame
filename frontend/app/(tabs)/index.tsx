import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

const BG =
  "https://images.unsplash.com/photo-1642369717514-f73f300e7d32?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwyfHxkYXJrJTIwcmVkJTIwYWJzdHJhY3QlMjB0ZW5zaW9uJTIwdGV4dHVyZSUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzgzNTY1OTQyfDA&ixlib=rb-4.1.0&q=85";

const ABILITY_ICONS: Record<string, string> = {
  second_chance: "shield-refresh",
  lucky_press: "clover",
  deflect: "shield-sword",
  double_tap: "gesture-double-tap",
};
const ABILITY_NAMES: Record<string, string> = {
  second_chance: "Second Chance",
  lucky_press: "Lucky Press",
  deflect: "Deflect",
  double_tap: "Double Tap",
};

export default function PlayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh, logout } = useAuth();
  const [searching, setSearching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const prog = user?.progression || { level: 1, rank: "Rookie", progress: 0, xp: 0 };
  const equippedAbility = user?.equipped_ability;

  const findMatch = async () => {
    if (searching) return;
    setSearching(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const { match_id } = await api.joinMatch();
      router.push(`/match/${match_id}`);
    } catch {
      setSearching(false);
    } finally {
      setTimeout(() => setSearching(false), 1200);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(15,15,19,0.7)", "rgba(15,15,19,0.5)", "#0F0F13"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 180 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: profile + rank */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>OPERATIVE</Text>
            <Text style={styles.username} numberOfLines={1} testID="menu-username">
              {user?.username || "Player"}
            </Text>
          </View>
          <Pressable testID="logout-btn" onPress={logout} style={styles.iconBtn}>
            <MaterialCommunityIcons name="logout" size={20} color={colors.onSurface3} />
          </Pressable>
        </View>

        {/* Rank card */}
        <Pressable style={styles.rankCard} testID="rank-card" onPress={() => router.push("/(tabs)/rank")}>
          <View style={styles.rankTop}>
            <View style={styles.rankBadge}>
              <MaterialCommunityIcons name="medal" size={22} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankName}>{prog.rank}</Text>
              <Text style={styles.rankLevel}>LEVEL {prog.level}</Text>
            </View>
            <Text style={styles.xpText}>{prog.xp} XP</Text>
          </View>
          <View style={styles.xpBar}>
            <View style={[styles.xpFill, { width: `${Math.round((prog.progress || 0) * 100)}%` }]} />
          </View>
        </Pressable>

        {/* Center tension graphic */}
        <View style={styles.centerArt}>
          <View style={styles.ringOuter}>
            <View style={styles.ringInner}>
              <MaterialCommunityIcons name="alert-octagon" size={92} color={colors.red} />
            </View>
          </View>
          <Text style={styles.artCaption}>THE BUTTON AWAITS</Text>
        </View>

        {/* Equipped ability */}
        <Pressable
          testID="equipped-ability"
          style={styles.abilityRow}
          onPress={() => router.push("/(tabs)/abilities")}
        >
          <MaterialCommunityIcons
            name={(equippedAbility ? ABILITY_ICONS[equippedAbility] : "flash-off") as any}
            size={22}
            color={equippedAbility ? colors.amber : colors.muted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.abilityLabel}>EQUIPPED ABILITY</Text>
            <Text style={styles.abilityName}>
              {equippedAbility ? ABILITY_NAMES[equippedAbility] : "None — tap to equip"}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
      </ScrollView>

      {/* Floating Find Match button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 76 }]}>
        <Pressable
          testID="find-match-btn"
          onPress={findMatch}
          style={({ pressed }) => [styles.findBtn, { opacity: pressed ? 0.9 : 1 }]}
        >
          <LinearGradient
            colors={[colors.red, "#C41F16"]}
            style={StyleSheet.absoluteFill}
          />
          <MaterialCommunityIcons
            name={searching ? "radar" : "sword-cross"}
            size={24}
            color="#fff"
          />
          <Text style={styles.findText}>{searching ? "SEARCHING FOR TARGETS…" : "FIND MATCH"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xl,
    marginBottom: space.lg,
  },
  hello: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 1.5 },
  username: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rankCard: {
    marginHorizontal: space.xl,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  rankTop: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.md },
  rankBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.redDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  rankName: { fontFamily: font.displayBold, fontSize: type.xl, color: colors.onSurface },
  rankLevel: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 1 },
  xpText: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.amber },
  xpBar: { height: 8, backgroundColor: colors.surface, borderRadius: radius.pill, overflow: "hidden" },
  xpFill: { height: "100%", backgroundColor: colors.amber, borderRadius: radius.pill },
  centerArt: { alignItems: "center", marginTop: space["3xl"], marginBottom: space["2xl"] },
  ringOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: "rgba(255,59,48,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  ringInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: "rgba(255,59,48,0.5)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(50,10,8,0.4)",
  },
  artCaption: {
    fontFamily: font.displaySemi,
    fontSize: type.lg,
    color: colors.onSurface3,
    letterSpacing: 3,
    marginTop: space.xl,
  },
  abilityRow: {
    marginHorizontal: space.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  abilityLabel: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 1 },
  abilityName: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface, marginTop: 2 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
  },
  findBtn: {
    height: 64,
    borderRadius: radius.lg,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
  findText: { fontFamily: font.displayBold, fontSize: type["2xl"], color: "#fff", letterSpacing: 1.5 },
});
