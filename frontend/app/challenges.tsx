import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useAuth();
  const [data, setData] = useState<{ challenges: any[]; completed: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.challenges());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const claim = async (id: string) => {
    if (claimingId) return;
    setClaimingId(id);
    try {
      const res = await api.claimChallenge(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setData(res.challenges);
      await refresh();
    } catch {
      /* ignore */
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Pressable testID="challenges-back" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>DAILY CHALLENGES</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xl }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.summary} testID="challenges-summary">
            {data?.completed ?? 0} / {data?.total ?? 0} COMPLETE · resets at midnight UTC
          </Text>

          {(data?.challenges || []).map((c) => {
            const pct = Math.min(1, c.progress / c.goal);
            const canClaim = c.complete && !c.claimed;
            return (
              <View key={c.id} style={styles.card} testID={`challenge-${c.id}`}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconWrap, c.claimed && { backgroundColor: colors.surface3 }]}>
                    <MaterialCommunityIcons
                      name={(c.claimed ? "check-bold" : c.icon) as any}
                      size={22}
                      color={c.claimed ? colors.success : colors.amber}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{c.name}</Text>
                    <Text style={styles.cardDesc}>{c.desc}</Text>
                  </View>
                  <View style={styles.rewardTag}>
                    <Text style={styles.rewardTagText}>+{c.reward}</Text>
                    <Text style={styles.rewardTagXp}>XP</Text>
                  </View>
                </View>

                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${pct * 100}%`, backgroundColor: c.complete ? colors.success : colors.amber },
                    ]}
                  />
                </View>
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    {Math.min(c.progress, c.goal)} / {c.goal}
                  </Text>
                  {canClaim ? (
                    <Pressable
                      testID={`claim-${c.id}`}
                      onPress={() => claim(c.id)}
                      disabled={claimingId === c.id}
                      style={styles.claimBtn}
                    >
                      <Text style={styles.claimText}>{claimingId === c.id ? "…" : "CLAIM"}</Text>
                    </Pressable>
                  ) : c.claimed ? (
                    <Text style={styles.claimedText}>CLAIMED ✓</Text>
                  ) : (
                    <Text style={styles.inProgressText}>IN PROGRESS</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  backBtn: { width: 28, alignItems: "flex-start" },
  title: { fontFamily: font.displayBold, fontSize: type["2xl"], color: colors.onSurface, letterSpacing: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  summary: { fontFamily: font.semi, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5, marginBottom: space.lg },
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "#2B2200",
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: { fontFamily: font.displaySemi, fontSize: type.xl, color: colors.onSurface },
  cardDesc: { fontFamily: font.regular, fontSize: type.sm, color: colors.onSurface3, marginTop: 1 },
  rewardTag: { alignItems: "center" },
  rewardTagText: { fontFamily: font.displayBold, fontSize: type.xl, color: colors.amber, lineHeight: 22 },
  rewardTagXp: { fontFamily: font.medium, fontSize: 10, color: colors.muted, letterSpacing: 1 },
  progressBar: {
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginTop: space.md,
  },
  progressFill: { height: "100%", borderRadius: radius.pill },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm },
  progressText: { fontFamily: font.displaySemi, fontSize: type.base, color: colors.onSurface2 },
  claimBtn: {
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  claimText: { fontFamily: font.displayBold, fontSize: type.base, color: colors.surface, letterSpacing: 1 },
  claimedText: { fontFamily: font.semi, fontSize: type.base, color: colors.success, letterSpacing: 0.5 },
  inProgressText: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5 },
});
