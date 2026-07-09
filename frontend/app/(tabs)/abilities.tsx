import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PrimaryButton } from "@/src/ui";

export default function AbilitiesScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();
  const [abilities, setAbilities] = useState<any[]>([]);
  const [equipped, setEquipped] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.abilities();
      setAbilities(data.abilities);
      setEquipped(data.equipped);
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openDetail = (ab: any) => {
    if (!ab.unlocked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setSelected(ab);
    sheetRef.current?.present();
  };

  const equip = async (abilityId: string | null) => {
    setBusy(true);
    try {
      await api.equipAbility(abilityId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      await refresh();
      sheetRef.current?.dismiss();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.title}>ABILITIES</Text>
        <Text style={styles.subtitle}>Equip one per match · unlock by rank</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <Pressable
          testID="ability-none"
          onPress={() => equip(null)}
          style={[styles.noneRow, !equipped && styles.cardEquipped]}
        >
          <MaterialCommunityIcons name="flash-off" size={20} color={colors.muted} />
          <Text style={styles.noneText}>No Ability</Text>
          {!equipped && <MaterialCommunityIcons name="check-circle" size={20} color={colors.success} />}
        </Pressable>

        <View style={styles.grid}>
          {abilities.map((ab) => (
            <Pressable
              key={ab.id}
              testID={`ability-${ab.id}`}
              onPress={() => openDetail(ab)}
              style={[
                styles.card,
                ab.equipped && styles.cardEquipped,
                !ab.unlocked && styles.cardLocked,
              ]}
            >
              {ab.equipped && (
                <View style={styles.equipBadge}>
                  <Text style={styles.equipBadgeText}>EQUIPPED</Text>
                </View>
              )}
              <MaterialCommunityIcons
                name={ab.icon as any}
                size={38}
                color={ab.unlocked ? colors.amber : colors.muted}
              />
              <Text style={[styles.cardName, !ab.unlocked && { color: colors.muted }]} numberOfLines={1}>
                {ab.name}
              </Text>
              <Text style={styles.cardDesc} numberOfLines={3}>
                {ab.desc}
              </Text>
              {!ab.unlocked && (
                <View style={styles.lockRow}>
                  <MaterialCommunityIcons name="lock" size={13} color={colors.muted} />
                  <Text style={styles.lockText}>LEVEL {ab.unlock_level}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["46%"]}
        backgroundStyle={{ backgroundColor: colors.surface2 }}
        handleIndicatorStyle={{ backgroundColor: colors.muted }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
      >
        <BottomSheetView style={{ padding: space.xl, paddingBottom: insets.bottom + space.xl }}>
          {selected && (
            <>
              <View style={styles.sheetHead}>
                <View style={styles.sheetIcon}>
                  <MaterialCommunityIcons name={selected.icon as any} size={32} color={colors.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetName}>{selected.name}</Text>
                  <Text style={styles.sheetType}>
                    {selected.type === "defensive" ? "DEFENSIVE · auto-triggers" : "ACTIVE · arm before press"}
                  </Text>
                </View>
              </View>
              <Text style={styles.sheetDesc}>{selected.desc}</Text>
              <PrimaryButton
                testID="equip-ability-btn"
                label={selected.equipped ? "EQUIPPED" : "EQUIP ABILITY"}
                disabled={selected.equipped}
                loading={busy}
                color={colors.amber}
                textColor={colors.surface}
                onPress={() => equip(selected.id)}
                style={{ marginTop: space.xl }}
              />
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: space.xl, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface, letterSpacing: 1 },
  subtitle: { fontFamily: font.regular, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  noneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.lg,
  },
  noneText: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface, flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: {
    width: "48%",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    minHeight: 168,
    marginBottom: space.md,
  },
  cardEquipped: { borderColor: colors.amber },
  cardLocked: { opacity: 0.7 },
  cardName: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface, marginTop: space.sm },
  cardDesc: { fontFamily: font.regular, fontSize: type.sm, color: colors.onSurface3, marginTop: space.xs, lineHeight: 18 },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: space.sm },
  lockText: { fontFamily: font.semi, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5 },
  equipBadge: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    backgroundColor: colors.amber,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  equipBadgeText: { fontFamily: font.bold, fontSize: 9, color: colors.surface, letterSpacing: 0.5 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.lg },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.redDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetName: { fontFamily: font.displayBold, fontSize: type["2xl"], color: colors.onSurface },
  sheetType: { fontFamily: font.medium, fontSize: type.sm, color: colors.amber, letterSpacing: 0.5 },
  sheetDesc: { fontFamily: font.regular, fontSize: type.lg, color: colors.onSurface2, lineHeight: 24 },
});
