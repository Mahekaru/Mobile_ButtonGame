import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type } from "@/src/theme";
import { api } from "@/src/api";

type Scope = "global" | "friends";

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("global");
  const [rows, setRows] = useState<any[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Scope) => {
    setLoading(true);
    try {
      const res = await api.leaderboard(s);
      setRows(res.rows);
      setMyRank(res.my_rank);
    } catch {
      setRows([]);
      setMyRank(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(scope);
    }, [load, scope]),
  );

  const switchScope = (s: Scope) => {
    if (s === scope) return;
    Haptics.selectionAsync();
    setScope(s);
  };

  const medal = (rank: number) => {
    if (rank === 1) return colors.warning;
    if (rank === 2) return "#C0C0C0";
    if (rank === 3) return "#CD7F32";
    return colors.muted;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Pressable testID="leaderboard-back" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>LEADERBOARD</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.tabs}>
        <Pressable
          testID="lb-tab-global"
          onPress={() => switchScope("global")}
          style={[styles.tab, scope === "global" && styles.tabActive]}
        >
          <Text style={[styles.tabText, scope === "global" && styles.tabTextActive]}>GLOBAL</Text>
        </Pressable>
        <Pressable
          testID="lb-tab-friends"
          onPress={() => switchScope("friends")}
          style={[styles.tab, scope === "friends" && styles.tabActive]}
        >
          <Text style={[styles.tabText, scope === "friends" && styles.tabTextActive]}>FRIENDS</Text>
        </Pressable>
      </View>

      {myRank != null && (
        <View style={styles.myRankChip} testID="my-rank-chip">
          <MaterialCommunityIcons name="account-star" size={16} color={colors.amber} />
          <Text style={styles.myRankText}>YOUR RANK · #{myRank}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center} testID="leaderboard-empty">
          <MaterialCommunityIcons name="trophy-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyText}>
            {scope === "friends" ? "Add friends to compare ranks." : "No operatives ranked yet."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xl }}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((r) => (
            <View
              key={r.id}
              style={[styles.row, r.is_me && styles.rowMe]}
              testID={r.is_me ? "leaderboard-row-me" : `leaderboard-row-${r.rank}`}
            >
              <View style={styles.rankCol}>
                {r.rank <= 3 ? (
                  <MaterialCommunityIcons name="medal" size={22} color={medal(r.rank)} />
                ) : (
                  <Text style={styles.rankNum}>{r.rank}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {r.username}
                  {r.is_me ? "  (You)" : ""}
                </Text>
                <Text style={styles.rowMeta}>
                  {r.rank_name} · LVL {r.level} · {r.wins} wins
                </Text>
              </View>
              <Text style={styles.rowXp}>{r.xp.toLocaleString()} XP</Text>
            </View>
          ))}
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
  tabs: {
    flexDirection: "row",
    marginHorizontal: space.xl,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.red },
  tabText: { fontFamily: font.semi, fontSize: type.base, color: colors.muted, letterSpacing: 1 },
  tabTextActive: { color: "#fff" },
  myRankChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    alignSelf: "center",
    marginTop: space.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: space.md,
  },
  myRankText: { fontFamily: font.displaySemi, fontSize: type.base, color: colors.amber, letterSpacing: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md },
  emptyText: { fontFamily: font.regular, fontSize: type.lg, color: colors.muted, textAlign: "center", paddingHorizontal: space.xl },
  row: {
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
  rowMe: { borderColor: colors.amber, backgroundColor: "#241A00" },
  rankCol: { width: 34, alignItems: "center" },
  rankNum: { fontFamily: font.displayBold, fontSize: type.xl, color: colors.onSurface3 },
  rowName: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface },
  rowMeta: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, marginTop: 1 },
  rowXp: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.amber },
});
