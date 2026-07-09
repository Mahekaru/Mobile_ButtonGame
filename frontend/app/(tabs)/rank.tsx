import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, font, radius, space, type } from "@/src/theme";
import { useAuth } from "@/src/auth";

const RANK_TIERS = [
  { level: 1, name: "Rookie" },
  { level: 3, name: "Bronze" },
  { level: 5, name: "Silver" },
  { level: 8, name: "Gold" },
  { level: 11, name: "Platinum" },
  { level: 15, name: "Diamond" },
  { level: 20, name: "Elite" },
  { level: 25, name: "Master" },
  { level: 30, name: "Legend" },
];
const ABILITY_UNLOCKS: Record<number, string> = {
  2: "Unlocks: Second Chance",
  3: "Unlocks: Lucky Press",
  5: "Unlocks: Deflect",
  7: "Unlocks: Double Tap",
};

export default function RankScreen() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      refresh().then(() => setTick((t) => t + 1));
    }, [refresh]),
  );

  const prog = user?.progression || { level: 1, rank: "Rookie", progress: 0, xp: 0, xp_into_level: 0, xp_for_next: 0 };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.title}>RANK</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* Current rank hero */}
        <View style={styles.hero} testID="rank-hero">
          <MaterialCommunityIcons name="medal" size={48} color={colors.amber} />
          <Text style={styles.heroRank}>{prog.rank}</Text>
          <Text style={styles.heroLevel}>LEVEL {prog.level}</Text>
          <View style={styles.xpBar}>
            <View style={[styles.xpFill, { width: `${Math.round((prog.progress || 0) * 100)}%` }]} />
          </View>
          <Text style={styles.xpMeta}>
            {prog.is_max ? "MAX LEVEL" : `${prog.xp_into_level} / ${prog.xp_for_next} XP to next level`}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>PROGRESSION ROADMAP</Text>
        {RANK_TIERS.map((tier) => {
          const reached = prog.level >= tier.level;
          const isCurrent = prog.rank === tier.name;
          return (
            <View key={tier.level} style={[styles.tierRow, isCurrent && styles.tierCurrent]}>
              <View style={[styles.tierBadge, reached && { backgroundColor: colors.redDeep }]}>
                <MaterialCommunityIcons
                  name={reached ? "medal" : "lock"}
                  size={18}
                  color={reached ? colors.amber : colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tierName, !reached && { color: colors.muted }]}>{tier.name}</Text>
                {ABILITY_UNLOCKS[tier.level] && (
                  <Text style={styles.tierUnlock}>{ABILITY_UNLOCKS[tier.level]}</Text>
                )}
              </View>
              <Text style={[styles.tierLevel, reached && { color: colors.amber }]}>LV {tier.level}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: space.xl, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface, letterSpacing: 1 },
  hero: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    marginBottom: space.xl,
  },
  heroRank: { fontFamily: font.displayBold, fontSize: 40, color: colors.onSurface, marginTop: space.sm },
  heroLevel: { fontFamily: font.medium, fontSize: type.base, color: colors.muted, letterSpacing: 1, marginBottom: space.lg },
  xpBar: { width: "100%", height: 10, backgroundColor: colors.surface, borderRadius: radius.pill, overflow: "hidden" },
  xpFill: { height: "100%", backgroundColor: colors.amber, borderRadius: radius.pill },
  xpMeta: { fontFamily: font.medium, fontSize: type.sm, color: colors.onSurface3, marginTop: space.sm },
  sectionTitle: { fontFamily: font.semi, fontSize: type.sm, color: colors.muted, letterSpacing: 1.5, marginBottom: space.md },
  tierRow: {
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
  tierCurrent: { borderColor: colors.amber },
  tierBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tierName: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface },
  tierUnlock: { fontFamily: font.medium, fontSize: type.sm, color: colors.amber, marginTop: 1 },
  tierLevel: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.muted },
});
