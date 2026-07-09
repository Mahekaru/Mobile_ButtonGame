import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Text, Pressable, ScrollView, Share, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  FadeInDown,
  FadeIn,
} from "react-native-reanimated";

import { colors, font, radius, space, type, dangerColor, SKIN_COLORS } from "@/src/theme";
import { ABILITY_META } from "@/src/catalog";
import { levelForXp, rankName } from "@/src/progression";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { GlassCard, SkinSurface } from "@/src/ui";

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [state, setState] = useState<any>(null);
  const [localDanger, setLocalDanger] = useState(5);
  const [armed, setArmed] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [reveal, setReveal] = useState<{ text: string; tone: string } | null>(null);

  const offsetRef = useRef(0); // clientNowSec - serverNow
  const endedRef = useRef(false);
  const scale = useSharedValue(1);

  const skinColor = SKIN_COLORS[user?.equipped_cosmetics?.button_skin || "classic"] || colors.red;
  const skinId = user?.equipped_cosmetics?.button_skin || "classic";

  const applyState = useCallback((s: any) => {
    offsetRef.current = Date.now() / 1000 - s.server_now;
    setState(s);
    if (s.results) endedRef.current = true;
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const s = await api.matchState(id);
      applyState(s);
    } catch {
      /* transient */
    }
  }, [id, applyState]);

  // Poll match state
  useEffect(() => {
    fetchState();
    const iv = setInterval(() => {
      if (!endedRef.current) fetchState();
    }, 700);
    return () => clearInterval(iv);
  }, [fetchState]);

  // Client-side personal danger animation (resets only on MY press)
  useEffect(() => {
    const iv = setInterval(() => {
      if (!state || state.phase !== "active" || !state.me) {
        setLocalDanger(state?.config?.base ?? 5);
        return;
      }
      const nowSec = Date.now() / 1000 - offsetRef.current;
      const elapsed = nowSec - state.me.last_press_at;
      const { base, slope, cap } = state.config;
      const d = Math.max(base, Math.min(cap, base + elapsed * slope));
      setLocalDanger(d);
    }, 100);
    return () => clearInterval(iv);
  }, [state]);

  const showReveal = (outcome: any) => {
    let text = "";
    let tone = colors.red;
    if (outcome.saved) {
      text = "ABILITY SAVED YOU!";
      tone = colors.success;
    } else if (outcome.self_death) {
      text = "YOU PANICKED";
      tone = colors.red;
    } else if (outcome.victims.length > 1) {
      text = `DOUBLE KILL: ${outcome.victims.join(" & ")}`;
      tone = colors.amber;
    } else if (outcome.victims.length === 1) {
      text = `ELIMINATED: ${outcome.victims[0]}`;
      tone = colors.amber;
    } else {
      text = "SURVIVED";
      tone = colors.success;
    }
    setReveal({ text, tone });
    setTimeout(() => setReveal(null), 1600);
  };

  const me = state?.me;
  const canPress = state?.phase === "active" && me?.alive && !pressing && !state?.results;

  const onPanic = async () => {
    if (!canPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    scale.value = withTiming(0.88, { duration: 70 }, () => {
      scale.value = withSpring(1, { damping: 8, stiffness: 200 });
    });
    setPressing(true);
    try {
      const { outcome, state: newState } = await api.press(id, armed);
      setArmed(false);
      applyState(newState);
      showReveal(outcome);
      if (outcome.self_death) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      /* someone else pressed first */
    } finally {
      setPressing(false);
    }
  };

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const leave = async () => {
    endedRef.current = true;
    api.leaveMatch(id).catch(() => {});
    await refresh();
    router.replace("/(tabs)");
  };

  const dColor = dangerColor(localDanger);

  // ---- Results overlay ----
  if (state?.results) {
    return <ResultsView results={state.results} skinColor={skinColor} username={user?.username} oldXp={user?.progression?.xp ?? 0} onExit={leave} />;
  }

  // ---- Lobby ----
  if (state && state.phase === "lobby") {
    return (
      <LobbyView state={state} insets={insets} onCancel={leave} />
    );
  }

  const ability = me?.ability ? ABILITY_META[me.ability] : null;

  return (
    <View style={styles.root} testID="match-screen">
      <LinearGradient
        colors={["#2A0705", "#160303", colors.surface]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* HUD row */}
      <View style={[styles.hudRow, { paddingTop: insets.top + space.sm }]}>
        <GlassCard testID="elim-feed" style={styles.feedCard} intensity={25}>
          <Text style={styles.feedTitle}>ELIMINATION FEED</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 108 }}>
            {(state?.feed || []).length === 0 && (
              <Text style={styles.feedEmpty}>Awaiting first press…</Text>
            )}
            {(state?.feed || []).map((f: any) => (
              <Text key={f.id} style={styles.feedLine} numberOfLines={1}>
                {f.type === "win" ? (
                  <Text style={{ color: colors.warning }}>👑 {f.victim} WINS</Text>
                ) : f.self ? (
                  <Text><Text style={{ color: colors.red }}>{f.victim}</Text> panicked</Text>
                ) : (
                  <Text>
                    <Text style={{ color: colors.amber }}>{f.killer}</Text>
                    {" ✕ "}
                    <Text style={{ color: colors.onSurface3 }}>{f.victim}</Text>
                  </Text>
                )}
              </Text>
            ))}
          </ScrollView>
        </GlassCard>

        <View style={styles.statsCol}>
          <GlassCard style={styles.statCard} intensity={25}>
            <Text style={styles.statNum} testID="remaining-count">{state?.players_alive ?? "—"}</Text>
            <Text style={styles.statCap}>REMAINING</Text>
          </GlassCard>
          <GlassCard style={styles.statCard} intensity={25}>
            <Text style={[styles.statNum, { color: colors.amber }]} testID="kill-count">
              {me?.kills ?? 0}
            </Text>
            <Text style={styles.statCap}>KILLS · {me?.protection ?? 0}% PROT</Text>
          </GlassCard>
        </View>
      </View>

      {/* Center: danger + button */}
      <View style={styles.center}>
        <Text style={styles.dangerLabel}>DANGER</Text>
        <Text style={[styles.dangerNum, { color: dColor }]} testID="danger-pct">
          {Math.round(localDanger)}%
        </Text>

        <Animated.View style={[btnStyle, { marginTop: space.lg }]}>
          <Pressable testID="panic-button" onPress={onPanic} disabled={!canPress}>
            <View style={[styles.panicOuter, { borderColor: dColor, opacity: canPress ? 1 : 0.5 }]}>
              <SkinSurface skinId={skinId} color={skinColor} size={188} radius={94}>
                <MaterialCommunityIcons
                  name="gesture-tap-button"
                  size={38}
                  color="rgba(255,255,255,0.9)"
                />
                <Text style={styles.panicText}>{me?.alive ? "PRESS" : "OUT"}</Text>
              </SkinSurface>
            </View>
          </Pressable>
        </Animated.View>

        <Text style={styles.hint}>
          {me?.alive
            ? "The longer you hold, the more XP you bank — but your danger keeps rising."
            : "You are spectating…"}
        </Text>
        {me?.alive && (me?.hold_xp ?? 0) > 0 && (
          <Text style={styles.holdXp} testID="hold-xp">PATIENCE BANKED +{me.hold_xp} XP</Text>
        )}
      </View>

      {/* Bottom: ability */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        {ability ? (
          <Pressable
            testID="ability-button"
            disabled={me?.ability_used || !me?.alive || ability.type === "defensive"}
            onPress={() => {
              if (ability.type === "offensive" && !me?.ability_used) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setArmed((a) => !a);
              }
            }}
            style={[
              styles.abilityBtn,
              armed && ability.type === "offensive" && styles.abilityArmed,
              me?.ability_used && styles.abilityUsed,
            ]}
          >
            <MaterialCommunityIcons
              name={ability.icon as any}
              size={22}
              color={me?.ability_used ? colors.muted : armed ? "#fff" : colors.amber}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.abilityName, me?.ability_used && { color: colors.muted }]}>
                {ability.name}
              </Text>
              <Text style={styles.abilityHint}>
                {me?.ability_used
                  ? "USED"
                  : ability.type === "defensive"
                    ? "AUTO · triggers if selected"
                    : armed
                      ? "ARMED · your next press"
                      : `TAP TO ARM · ${ability.short}`}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.abilityBtn, { opacity: 0.6 }]}>
            <MaterialCommunityIcons name="flash-off" size={22} color={colors.muted} />
            <Text style={styles.abilityHint}>No ability equipped</Text>
          </View>
        )}
      </View>

      {/* Reveal banner */}
      {reveal && (
        <Animated.View
          entering={FadeInDown.springify().damping(14)}
          style={[styles.revealWrap, { pointerEvents: "none" }]}
        >
          <View style={[styles.revealBanner, { borderColor: reveal.tone }]}>
            <Text style={[styles.revealText, { color: reveal.tone }]}>{reveal.text}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function LobbyView({ state, insets, onCancel }: any) {
  const alive = state.players_alive;
  const total = state.players_total;
  return (
    <View style={styles.root} testID="lobby-screen">
      <LinearGradient colors={["#2A0705", colors.surface]} style={StyleSheet.absoluteFill} />
      <View style={{ paddingTop: insets.top + space.xl, alignItems: "center", flex: 1, paddingHorizontal: space.xl }}>
        <Text style={styles.lobbyTitle}>LOBBY</Text>
        <Text style={styles.lobbyCountdown} testID="lobby-countdown">
          {Math.ceil(state.countdown ?? 0)}
        </Text>
        <Text style={styles.lobbySub}>
          {state.party_code ? "Waiting for your squad…" : "Preparing the arena…"}
        </Text>

        {state.party_code && (
          <Pressable
            testID="party-code-share"
            onPress={() =>
              Share.share({
                message: `Join my PANIC BUTTON party! Code: ${state.party_code} — last one alive wins.`,
              }).catch(() => {})
            }
            style={styles.partyCodeBox}
          >
            <View>
              <Text style={styles.partyCodeLabel}>PARTY CODE · TAP TO SHARE</Text>
              <Text style={styles.partyCodeValue}>{state.party_code}</Text>
            </View>
            <MaterialCommunityIcons name="share-variant" size={22} color={colors.amber} />
          </Pressable>
        )}

        <View style={styles.lobbyMeter}>
          <View style={[styles.lobbyFill, { width: `${(alive / total) * 100}%` }]} />
        </View>
        <Text style={styles.lobbyCount}>
          {alive} / {total} operatives
        </Text>

        <ScrollView style={{ marginTop: space.xl, width: "100%" }} showsVerticalScrollIndicator={false}>
          <View style={styles.lobbyGrid}>
            {(state.lobby_players || []).map((p: any, i: number) => (
              <View key={i} style={styles.lobbyChip}>
                <MaterialCommunityIcons name="account" size={14} color={colors.amber} />
                <Text style={styles.lobbyChipText} numberOfLines={1}>{p.name}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.lg }}>
        <Pressable testID="lobby-cancel" onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>LEAVE LOBBY</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeTaunt(results: any, username: string): string {
  const p = results.placement;
  if (results.won) return `${username} was the LAST ONE ALIVE. 99 pressed. One survived. 💀`;
  if (results.self_eliminated) return `${username} panicked and pressed their OWN doom at #${p}/100. 🤡`;
  if (p <= 10) return `${username} clawed to #${p}/100 before the button blinked. 🔥`;
  if (results.kills >= 3) return `${username} dropped ${results.kills} operatives before falling at #${p}/100. Revenge? 😏`;
  return `${username} went out at #${p}/100. Think you'd last longer? 👀`;
}

function ResultsView({ results, skinColor, username, oldXp, onExit }: any) {
  const insets = useSafeAreaInsets();
  const won = results.won;
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const taunt = makeTaunt(results, username || "Someone");
  const koBonus = (results.friend_kos || 0) + (results.rival_kos || 0) > 0;

  const newXp = (oldXp || 0) + (results.xp_gained || 0);
  const oldLevel = levelForXp(oldXp || 0);
  const newLevel = levelForXp(newXp);
  const leveledUp = newLevel > oldLevel;

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    Haptics.selectionAsync();
    const message = `${taunt}\n\n🔴 PANIC BUTTON — 100 enter, one survives. Can you beat me?`;
    try {
      if (Platform.OS !== "web" && cardRef.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(cardRef, { format: "png", quality: 0.95 });
        await Sharing.shareAsync(uri, { dialogTitle: "Share your match recap" });
      } else {
        await Share.share({ message });
      }
    } catch {
      try {
        await Share.share({ message });
      } catch {
        /* dismissed */
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.root} testID="results-screen">
      <LinearGradient
        colors={won ? ["#3D2E00", "#1A1300", colors.surface] : ["#2A0705", "#160303", colors.surface]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl, paddingTop: insets.top + space.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Shareable recap card */}
        <View ref={cardRef} collapsable={false} style={styles.recapCard} testID="recap-card">
          <View style={styles.recapHead}>
            <MaterialCommunityIcons name="alert-octagon" size={18} color={colors.red} />
            <Text style={styles.recapBrand}>PANIC BUTTON</Text>
          </View>
          <MaterialCommunityIcons
            name={won ? "trophy" : "skull"}
            size={64}
            color={won ? colors.warning : colors.red}
          />
          <Text style={[styles.resultTitle, { color: won ? colors.warning : colors.red }]}>
            {won ? "LAST ALIVE" : "ELIMINATED"}
          </Text>
          <Text style={styles.recapUser}>{username}</Text>
          <Text style={styles.resultPlace} testID="result-placement">
            {won ? "1st of 100" : `#${results.placement} of 100`}
          </Text>

          <View style={styles.resultStats}>
            <View style={styles.resultStat}>
              <Text style={styles.resultStatNum}>{results.kills}</Text>
              <Text style={styles.resultStatCap}>ELIMINATIONS</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultStat}>
              <Text style={[styles.resultStatNum, { color: colors.amber }]}>+{results.xp_gained}</Text>
              <Text style={styles.resultStatCap}>XP EARNED</Text>
            </View>
          </View>

          {(koBonus || results.patience_xp > 0) && (
            <View style={styles.bonusRow} testID="bonus-row">
              <MaterialCommunityIcons name="star-four-points" size={16} color={colors.amber} />
              <Text style={styles.bonusText}>
                {results.patience_xp > 0 && `Patience +${results.patience_xp} `}
                {results.friend_kos > 0 && `· ${results.friend_kos} friend KO +${results.friend_kos * 50} `}
                {results.rival_kos > 0 && `· ${results.rival_kos} rival KO +${results.rival_kos * 25}`}
              </Text>
            </View>
          )}

          <Text style={styles.taunt}>&ldquo;{taunt}&rdquo;</Text>
        </View>

        {leveledUp && (
          <Animated.View entering={FadeInDown.springify().damping(13)} style={styles.levelUp} testID="level-up-banner">
            <MaterialCommunityIcons name="chevron-double-up" size={28} color={colors.warning} />
            <View>
              <Text style={styles.levelUpTitle}>LEVEL UP!</Text>
              <Text style={styles.levelUpSub}>Level {newLevel} · {rankName(newLevel)}</Text>
            </View>
          </Animated.View>
        )}

        {results.self_eliminated && (
          <Text style={styles.selfElim}>You pressed the button on yourself.</Text>
        )}

        <Pressable testID="share-recap-btn" onPress={share} style={styles.shareBtn}>
          <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
          <Text style={styles.shareText}>{sharing ? "SHARING…" : "SHARE RECAP"}</Text>
        </Pressable>
      </ScrollView>

      <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.lg }}>
        <Pressable testID="return-lobby-btn" onPress={onExit} style={styles.returnBtn}>
          <Text style={styles.returnText}>RETURN TO LOBBY</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hudRow: { flexDirection: "row", paddingHorizontal: space.md, gap: space.sm },
  feedCard: { flex: 1.4, height: 150 },
  feedTitle: {
    fontFamily: font.semi,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: space.xs,
  },
  feedEmpty: { fontFamily: font.regular, fontSize: type.sm, color: colors.muted },
  feedLine: { fontFamily: font.medium, fontSize: type.sm, marginBottom: 3, color: colors.onSurface2 },
  statsCol: { flex: 1, gap: space.sm },
  statCard: { alignItems: "center", paddingVertical: space.sm },
  statNum: { fontFamily: font.displayBold, fontSize: 34, color: colors.onSurface, lineHeight: 38 },
  statCap: { fontFamily: font.medium, fontSize: 9, color: colors.muted, letterSpacing: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dangerLabel: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.onSurface3, letterSpacing: 4 },
  dangerNum: { fontFamily: font.displayBold, fontSize: 74, lineHeight: 78 },
  panicOuter: {
    width: 208,
    height: 208,
    borderRadius: 104,
    borderWidth: 4,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  panicText: { fontFamily: font.displayBold, fontSize: 32, color: "#fff", letterSpacing: 2, marginTop: 2 },
  hint: { fontFamily: font.regular, fontSize: type.sm, color: colors.muted, marginTop: space.md, textAlign: "center", paddingHorizontal: space.xl },
  holdXp: { fontFamily: font.displaySemi, fontSize: type.sm, color: colors.amber, marginTop: space.xs, letterSpacing: 0.5 },
  bottom: { paddingHorizontal: space.xl },
  abilityBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  abilityArmed: { borderColor: colors.amber, backgroundColor: "#3A2A00" },
  abilityUsed: { opacity: 0.6 },
  abilityName: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface },
  abilityHint: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, marginTop: 1 },
  revealWrap: { position: "absolute", top: "38%", left: 0, right: 0, alignItems: "center" },
  revealBanner: {
    backgroundColor: "rgba(15,15,19,0.92)",
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  revealText: { fontFamily: font.displayBold, fontSize: type["2xl"], letterSpacing: 1 },
  // lobby
  lobbyTitle: { fontFamily: font.displaySemi, fontSize: type.xl, color: colors.onSurface3, letterSpacing: 4 },
  lobbyCountdown: { fontFamily: font.displayBold, fontSize: 96, color: colors.red, lineHeight: 100 },
  lobbySub: { fontFamily: font.regular, fontSize: type.base, color: colors.muted, marginBottom: space.xl },
  partyCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    marginBottom: space.xl,
  },
  partyCodeLabel: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 1 },
  partyCodeValue: { fontFamily: font.displayBold, fontSize: 40, color: colors.amber, letterSpacing: 4 },
  lobbyMeter: {
    width: "100%",
    height: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  lobbyFill: { height: "100%", backgroundColor: colors.red, borderRadius: radius.pill },
  lobbyCount: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.onSurface2, marginTop: space.md },
  lobbyGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" },
  lobbyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    maxWidth: 140,
  },
  lobbyChipText: { fontFamily: font.medium, fontSize: type.sm, color: colors.onSurface3 },
  cancelBtn: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface3, letterSpacing: 1 },
  // results
  recapCard: {
    backgroundColor: "rgba(20,20,26,0.85)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.xl,
    alignItems: "center",
  },
  recapHead: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.md },
  recapBrand: { fontFamily: font.displayBold, fontSize: type.base, color: colors.onSurface3, letterSpacing: 2 },
  recapUser: { fontFamily: font.semi, fontSize: type.lg, color: colors.onSurface2, marginTop: 2 },
  resultTitle: { fontFamily: font.displayBold, fontSize: 52, letterSpacing: 2, marginTop: space.sm },
  resultPlace: { fontFamily: font.displaySemi, fontSize: type["2xl"], color: colors.onSurface, marginTop: space.xs },
  resultStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space["2xl"],
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.lg,
    paddingHorizontal: space["2xl"],
  },
  resultStat: { alignItems: "center", minWidth: 100 },
  resultStatNum: { fontFamily: font.displayBold, fontSize: 40, color: colors.onSurface },
  resultStatCap: { fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5 },
  resultDivider: { width: 1, height: 44, backgroundColor: colors.border, marginHorizontal: space.lg },
  bonusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: "#3A2A00",
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginTop: space.lg,
  },
  bonusText: { fontFamily: font.semi, fontSize: type.sm, color: colors.amber },
  levelUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    alignSelf: "center",
    backgroundColor: "#2B2200",
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    marginTop: space.lg,
  },
  levelUpTitle: { fontFamily: font.displayBold, fontSize: type.xl, color: colors.warning, letterSpacing: 1 },
  levelUpSub: { fontFamily: font.semi, fontSize: type.base, color: colors.onSurface2 },
  taunt: {
    fontFamily: font.medium,
    fontSize: type.base,
    color: colors.onSurface3,
    textAlign: "center",
    marginTop: space.lg,
    fontStyle: "italic",
    lineHeight: 20,
  },
  selfElim: { fontFamily: font.regular, fontSize: type.base, color: colors.red, marginTop: space.lg, textAlign: "center" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: space.xl,
  },
  shareText: { fontFamily: font.displaySemi, fontSize: type.lg, color: "#fff", letterSpacing: 1 },
  returnBtn: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  returnText: { fontFamily: font.displayBold, fontSize: type.xl, color: "#fff", letterSpacing: 1 },
});
