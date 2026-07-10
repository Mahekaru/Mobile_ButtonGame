import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, font, radius, space, type } from "@/src/theme";
import { useAuth } from "@/src/auth";

function Metric({ icon, value, label, tint, testID }: any) {
  return (
    <View style={styles.metric} testID={testID}>
      <MaterialCommunityIcons name={icon} size={20} color={tint || colors.onSurface3} />
      <Text style={[styles.metricValue, tint && { color: tint }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      refresh().then(() => setTick((t) => t + 1));
    }, [refresh]),
  );

  const s = user?.stats || {};
  const prog = user?.progression || { rank: "Rookie", level: 1 };
  const played = s.matches_played || 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.title}>STATISTICS</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {played === 0 ? (
          <View style={styles.empty} testID="stats-empty">
            <MaterialCommunityIcons name="chart-box-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>Play a match to reveal your stats.</Text>
          </View>
        ) : (
          <>
            <View style={styles.rankStrip}>
              <MaterialCommunityIcons name="medal" size={28} color={colors.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rankStripName}>{prog.rank}</Text>
                <Text style={styles.rankStripLevel}>LEVEL {prog.level} · {prog.xp} XP</Text>
              </View>
            </View>

            <View style={styles.grid}>
              <Metric testID="stat-matches" icon="sword-cross" value={played} label="MATCHES" />
              <Metric testID="stat-wins" icon="trophy" value={s.wins || 0} label="WINS" tint={colors.warning} />
              <Metric testID="stat-winrate" icon="percent" value={`${s.win_rate ?? 0}%`} label="WIN RATE" tint={colors.success} />
              <Metric testID="stat-elims" icon="skull" value={s.total_eliminations || 0} label="KOs" tint={colors.red} />
              <Metric testID="stat-streak" icon="fire" value={s.highest_streak || 0} label="BEST STREAK" tint={colors.amber} />
              <Metric testID="stat-self" icon="emoticon-dead" value={s.times_self_eliminated || 0} label="BACKFIRES" />
              <Metric testID="stat-avg" icon="flag-checkered" value={`#${s.avg_placement ?? 0}`} label="AVG PLACEMENT" />
              <Metric
                testID="stat-survival"
                icon="heart-pulse"
                value={`${Math.max(0, Math.round(((100 - (s.avg_placement || 100)) / 99) * 100))}%`}
                label="AVG SURVIVAL"
                tint={colors.success}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: space.xl, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface, letterSpacing: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 100, gap: space.md },
  emptyText: { fontFamily: font.regular, fontSize: type.lg, color: colors.muted },
  rankStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.lg,
  },
  rankStripName: { fontFamily: font.displayBold, fontSize: type["2xl"], color: colors.onSurface },
  rankStripLevel: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  metric: {
    width: "48%",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.md,
  },
  metricValue: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface, marginTop: space.xs },
  metricLabel: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5, marginTop: 2 },
});
