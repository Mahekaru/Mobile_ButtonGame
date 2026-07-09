import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { SkinSurface } from "@/src/ui";

const CATEGORIES = [
  { key: "button_skin", label: "Skins" },
  { key: "icon", label: "Icons" },
  { key: "title", label: "Titles" },
  { key: "elim_effect", label: "Effects" },
  { key: "victory_anim", label: "Victory" },
];

export default function CosmeticsScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();
  const [categories, setCategories] = useState<any>({});
  const [equipped, setEquipped] = useState<any>({});
  const [active, setActive] = useState("button_skin");

  const load = useCallback(async () => {
    try {
      const data = await api.cosmetics();
      setCategories(data.categories);
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

  const equip = async (item: any) => {
    if (!item.unlocked || item.equipped) {
      if (!item.unlocked) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.selectionAsync();
    try {
      await api.equipCosmetic(active, item.id);
      await load();
      await refresh();
    } catch {
      /* ignore */
    }
  };

  const items = categories[active] || [];

  const renderPreview = (item: any) => {
    if (active === "button_skin") {
      return <SkinSurface skinId={item.id} color={item.color} pattern={item.pattern} size={64} />;
    }
    if (active === "icon") {
      return <MaterialCommunityIcons name={item.icon as any} size={46} color={colors.onSurface} />;
    }
    if (active === "title") {
      return <MaterialCommunityIcons name="format-quote-close" size={42} color={colors.amber} />;
    }
    const effectIcon = active === "victory_anim" ? "party-popper" : "star-four-points";
    return <MaterialCommunityIcons name={effectIcon as any} size={42} color={colors.amber} />;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.title}>COSMETICS</Text>
        <Text style={styles.subtitle}>Style points only · zero gameplay edge</Text>
      </View>

      {/* Category chip row (single horizontal scroller) */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CATEGORIES.map((c) => {
            const on = active === c.key;
            return (
              <Pressable
                key={c.key}
                testID={`cat-${c.key}`}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActive(c.key);
                }}
                style={[styles.chip, on && styles.chipActive]}
              >
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {items.map((item: any) => (
            <Pressable
              key={item.id}
              testID={`cosmetic-${item.id}`}
              onPress={() => equip(item)}
              style={[styles.item, item.equipped && styles.itemEquipped, !item.unlocked && styles.itemLocked]}
            >
              <View style={styles.preview}>{renderPreview(item)}</View>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {item.equipped ? (
                <View style={styles.itemTag}>
                  <MaterialCommunityIcons name="check-circle" size={13} color={colors.success} />
                  <Text style={[styles.itemTagText, { color: colors.success }]}>ON</Text>
                </View>
              ) : !item.unlocked ? (
                <View style={styles.itemTag}>
                  <MaterialCommunityIcons name="lock" size={12} color={colors.muted} />
                  <Text style={styles.itemTagText}>LV {item.unlock_level}</Text>
                </View>
              ) : (
                <Text style={[styles.itemTagText, { color: colors.onSurface3 }]}>TAP TO EQUIP</Text>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: space.xl, paddingBottom: space.md },
  title: { fontFamily: font.displayBold, fontSize: type["3xl"], color: colors.onSurface, letterSpacing: 1 },
  subtitle: { fontFamily: font.regular, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  chipRowWrap: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  chipRow: { gap: space.sm, paddingHorizontal: space.xl, alignItems: "center" },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { fontFamily: font.semi, fontSize: type.base, color: colors.muted },
  chipTextActive: { color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  item: {
    width: "48%",
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    alignItems: "center",
    marginBottom: space.md,
  },
  itemEquipped: { borderColor: colors.success },
  itemLocked: { opacity: 0.6 },
  preview: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  skinDot: { width: 64, height: 64, borderRadius: 32 },
  itemName: { fontFamily: font.semi, fontSize: type.base, color: colors.onSurface, textAlign: "center" },
  itemTag: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: space.xs },
  itemTagText: { fontFamily: font.semi, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5, marginTop: space.xs },
});
