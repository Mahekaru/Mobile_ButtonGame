import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, Text, ScrollView, Pressable, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";

import { colors, font, radius, space, type, SKIN_COLORS } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api, ApiError } from "@/src/api";
import { PrimaryButton, SkinSurface } from "@/src/ui";
import { ButtonFX, PressBurst } from "@/src/fx";

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
  const { user, refresh, changeName } = useAuth();
  const [searching, setSearching] = useState(false);
  const [reward, setReward] = useState<any>(null);
  const [challengeSummary, setChallengeSummary] = useState<{ completed: number; total: number; allClaimed: boolean } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{ amount: number; weekly: boolean } | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const nameSheet = useRef<BottomSheetModal>(null);
  const partySheet = useRef<BottomSheetModal>(null);
  const [partyCode, setPartyCode] = useState("");
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyErr, setPartyErr] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);

  const loadRewards = useCallback(async () => {
    try {
      setReward(await api.rewardsStatus());
    } catch {
      /* ignore */
    }
    try {
      const c = await api.challenges();
      const allClaimed = (c.challenges?.length ?? 0) > 0 && c.challenges.every((x: any) => x.claimed);
      setChallengeSummary({ completed: c.completed, total: c.total, allClaimed });
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadRewards();
    }, [refresh, loadRewards]),
  );

  const prog = user?.progression || { level: 1, rank: "Rookie", progress: 0, xp: 0 };
  const equippedAbility = user?.equipped_ability;
  const skinId = user?.equipped_cosmetics?.button_skin || "classic";
  const skinColor = SKIN_COLORS[skinId] || colors.red;
  const buttonFx = user?.equipped_cosmetics?.button_fx || "none";

  const previewPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBurstKey((k) => k + 1);
  };

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await api.claimReward();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setClaimed({ amount: res.claimed, weekly: res.is_weekly });
      await refresh();
      await loadRewards();
    } catch {
      /* ignore */
    } finally {
      setClaiming(false);
    }
  };

  const openNameSheet = () => {
    setNameInput(user?.username || "");
    nameSheet.current?.present();
  };

  const saveName = async () => {
    if (nameInput.trim().length < 2) return;
    setSavingName(true);
    try {
      await changeName(nameInput.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nameSheet.current?.dismiss();
    } catch {
      /* ignore */
    } finally {
      setSavingName(false);
    }
  };

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

  const createParty = async () => {
    setPartyBusy(true);
    setPartyErr(null);
    try {
      const { match_id } = await api.createParty();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      partySheet.current?.dismiss();
      router.push(`/match/${match_id}`);
    } catch {
      setPartyErr("Could not create party");
    } finally {
      setPartyBusy(false);
    }
  };

  const joinParty = async () => {
    const c = partyCode.trim().toUpperCase();
    if (c.length < 4) return;
    setPartyBusy(true);
    setPartyErr(null);
    try {
      const { match_id } = await api.joinParty(c);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      partySheet.current?.dismiss();
      router.push(`/match/${match_id}`);
    } catch (e) {
      setPartyErr(e instanceof ApiError ? e.message : "Party not found");
    } finally {
      setPartyBusy(false);
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
          <Pressable style={{ flex: 1 }} testID="edit-name-btn" onPress={openNameSheet}>
            <Text style={styles.hello}>PLAYER</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Text style={styles.username} numberOfLines={1} testID="menu-username">
                {user?.username || "Player"}
              </Text>
              <MaterialCommunityIcons name="pencil" size={16} color={colors.muted} />
            </View>
          </Pressable>
          <Pressable
            testID="leaderboard-btn"
            onPress={() => router.push("/leaderboard")}
            style={[styles.iconBtn, { marginRight: space.sm }]}
          >
            <MaterialCommunityIcons name="trophy" size={20} color={colors.amber} />
          </Pressable>
          <Pressable
            testID="party-btn"
            onPress={() => {
              setPartyErr(null);
              setPartyCode("");
              partySheet.current?.present();
            }}
            style={[styles.iconBtn, { marginRight: space.sm }]}
          >
            <MaterialCommunityIcons name="account-multiple-plus" size={20} color={colors.amber} />
          </Pressable>
          <Pressable
            testID="friends-btn"
            onPress={() => router.push("/friends")}
            style={styles.iconBtn}
          >
            <MaterialCommunityIcons name="account-group" size={20} color={colors.amber} />
          </Pressable>
        </View>

        {/* Daily reward */}
        {reward?.can_claim && !claimed && (
          <Pressable style={styles.rewardCard} testID="daily-reward-card" onPress={claim} disabled={claiming}>
            <View style={styles.rewardIcon}>
              <MaterialCommunityIcons name="gift" size={24} color={colors.surface} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>
                {reward.next_is_weekly ? "WEEKLY BONUS READY" : "DAILY REWARD READY"}
              </Text>
              <Text style={styles.rewardSub}>
                +{reward.next_reward} XP · Day {reward.next_streak} streak
              </Text>
            </View>
            <Text style={styles.rewardCta}>{claiming ? "…" : "CLAIM"}</Text>
          </Pressable>
        )}
        {claimed && (
          <View style={[styles.rewardCard, { borderColor: colors.success }]} testID="daily-reward-claimed">
            <View style={[styles.rewardIcon, { backgroundColor: colors.success }]}>
              <MaterialCommunityIcons name="check-bold" size={22} color={colors.surface} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rewardTitle, { color: colors.success }]}>
                +{claimed.amount} XP CLAIMED{claimed.weekly ? " · WEEKLY!" : ""}
              </Text>
              <Text style={styles.rewardSub}>Come back tomorrow to keep your streak.</Text>
            </View>
          </View>
        )}

        {/* Daily challenges — hidden once every challenge is claimed */}
        {!challengeSummary?.allClaimed && (
          <Pressable
            testID="challenges-card"
            style={styles.challengeCard}
            onPress={() => router.push("/challenges")}
          >
            <View style={styles.challengeIcon}>
              <MaterialCommunityIcons name="target" size={22} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.challengeTitle}>DAILY CHALLENGES</Text>
              <Text style={styles.challengeSub}>
                {challengeSummary
                  ? `${challengeSummary.completed}/${challengeSummary.total} complete today`
                  : "Earn bonus XP every day"}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        )}

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

        {/* Center: live equipped-skin + effects preview (tap to preview) */}
        <View style={styles.centerArt}>
          <Pressable style={styles.ringOuter} testID="preview-button" onPress={previewPress}>
            <ButtonFX type={buttonFx} size={200} />
            {burstKey > 0 && <PressBurst key={burstKey} type={buttonFx} color={skinColor} size={200} />}
            <SkinSurface skinId={skinId} color={skinColor} size={150} radius={75}>
              <MaterialCommunityIcons name="gesture-tap-button" size={40} color="rgba(255,255,255,0.9)" />
              <Text style={styles.previewPress}>PRESS</Text>
            </SkinSurface>
          </Pressable>
          <Text style={styles.artCaption}>TAP TO PREVIEW</Text>
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

      {/* Floating action buttons */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 96 }]}>
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
          <Text style={styles.findText}>{searching ? "SEARCHING FOR PLAYERS…" : "ENTER MATCHMAKING"}</Text>
        </Pressable>
      </View>

      {/* Change-name bottom sheet */}
      <BottomSheetModal
        ref={nameSheet}
        snapPoints={["40%"]}
        backgroundStyle={{ backgroundColor: colors.surface2 }}
        handleIndicatorStyle={{ backgroundColor: colors.muted }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
      >
        <BottomSheetView style={{ padding: space.xl, paddingBottom: insets.bottom + space.xl }}>
          <Text style={styles.sheetTitle}>CHANGE CALLSIGN</Text>
          <TextInput
            testID="name-input"
            value={nameInput}
            onChangeText={setNameInput}
            autoCapitalize="none"
            maxLength={16}
            placeholder="New callsign"
            placeholderTextColor={colors.muted}
            style={styles.nameInput}
          />
          <PrimaryButton
            testID="save-name-btn"
            label="SAVE"
            onPress={saveName}
            loading={savingName}
            style={{ marginTop: space.lg }}
          />
        </BottomSheetView>
      </BottomSheetModal>

      {/* Party bottom sheet */}
      <BottomSheetModal
        ref={partySheet}
        snapPoints={["52%"]}
        backgroundStyle={{ backgroundColor: colors.surface2 }}
        handleIndicatorStyle={{ backgroundColor: colors.muted }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
      >
        <BottomSheetView style={{ padding: space.xl, paddingBottom: insets.bottom + space.xl }}>
          <Text style={styles.sheetTitle}>PLAY WITH FRIENDS</Text>
          <Text style={styles.partySheetHint}>Create a party and share the code — everyone lands in the SAME match. KO a friend for +50 XP.</Text>
          <PrimaryButton
            testID="create-party-btn"
            label="CREATE PARTY"
            onPress={createParty}
            loading={partyBusy}
            color={colors.amber}
            textColor={colors.surface}
            style={{ marginTop: space.lg }}
          />
          <Text style={styles.partyOr}>OR JOIN WITH A CODE</Text>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <TextInput
              testID="party-code-input"
              value={partyCode}
              onChangeText={setPartyCode}
              autoCapitalize="characters"
              maxLength={8}
              placeholder="PARTY CODE"
              placeholderTextColor={colors.muted}
              style={[styles.nameInput, { flex: 1, letterSpacing: 3 }]}
            />
            <Pressable testID="join-party-btn" onPress={joinParty} disabled={partyBusy} style={styles.joinPartyBtn}>
              <MaterialCommunityIcons name="arrow-right" size={24} color="#fff" />
            </Pressable>
          </View>
          {partyErr && <Text style={styles.partyErr} testID="party-err">{partyErr}</Text>}
        </BottomSheetView>
      </BottomSheetModal>
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
  rewardCard: {
    marginHorizontal: space.xl,
    marginBottom: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.amber,
    padding: space.md,
  },
  rewardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardTitle: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.amber, letterSpacing: 0.5 },
  rewardSub: { fontFamily: font.regular, fontSize: type.sm, color: colors.onSurface3, marginTop: 1 },
  rewardCta: { fontFamily: font.displayBold, fontSize: type.xl, color: colors.amber, letterSpacing: 1 },
  sheetTitle: { fontFamily: font.displaySemi, fontSize: type.xl, color: colors.onSurface, letterSpacing: 1, marginBottom: space.md },
  nameInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    height: 54,
    color: colors.onSurface,
    fontFamily: font.semi,
    fontSize: type.xl,
  },
  partyBtn: {
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  partyText: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.amber, letterSpacing: 1 },
  partySheetHint: { fontFamily: font.regular, fontSize: type.base, color: colors.onSurface3, lineHeight: 20 },
  partyOr: { fontFamily: font.semi, fontSize: type.sm, color: colors.muted, letterSpacing: 1, marginTop: space.xl, marginBottom: space.md },
  joinPartyBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  partyErr: { fontFamily: font.medium, fontSize: type.base, color: colors.red, marginTop: space.md },
  rankCard: {
    marginHorizontal: space.xl,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  challengeCard: {
    marginHorizontal: space.xl,
    marginBottom: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "#2B2200",
    alignItems: "center",
    justifyContent: "center",
  },
  challengeTitle: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.onSurface, letterSpacing: 0.5 },
  challengeSub: { fontFamily: font.regular, fontSize: type.sm, color: colors.onSurface3, marginTop: 1 },
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
  previewPress: { fontFamily: font.displayBold, fontSize: 26, color: "#fff", letterSpacing: 2, marginTop: 2 },
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
