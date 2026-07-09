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
  ZoomIn,
  SlideInUp,
} from "react-native-reanimated";

import { colors, font, radius, space, type, dangerColor, SKIN_COLORS } from "@/src/theme";
import { ABILITY_META } from "@/src/catalog";
import { VictoryFX, ButtonFX, PressBurst } from "@/src/fx";
import { levelForXp, rankName } from "@/src/progression";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { adsSupported, showRewardedInterstitial } from "@/src/ads";
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
  const [burstKey, setBurstKey] = useState(0);

  const offsetRef = useRef(0); // clientNowSec - serverNow
  const endedRef = useRef(false);
  const scale = useSharedValue(1);

  const skinColor = SKIN_COLORS[user?.equipped_cosmetics?.button_skin || "classic"] || colors.red;
  const skinId = user?.equipped_cosmetics?.button_skin || "classic";
  const buttonFx = user?.equipped_cosmetics?.button_fx || "none";

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
    setBurstKey((k) => k + 1); // fire the cosmetic click burst
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

  const startNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    api.startMatch(id).catch(() => {});
  };

  const dColor = dangerColor(localDanger);

  // ---- Results overlay ----
  if (state?.results) {
    return <ResultsView results={state.results} skinColor={skinColor} username={user?.username} oldXp={user?.progression?.xp ?? 0} victoryAnim={user?.equipped_cosmetics?.victory_anim} onExit={leave} />;
  }

  // ---- Lobby ----
  if (state && state.phase === "lobby") {
    return (
      <LobbyView state={state} insets={insets} onCancel={leave} />
    );
  }

  const ability = me?.ability ? ABILITY_META[me.ability] : null;
  const elimEffect = user?.equipped_cosmetics?.elim_effect || "fade";
  const revealEntering = (
    {
      fade: FadeIn.duration(250),
      shatter: ZoomIn.springify().damping(6),
      burn: FadeInDown.springify().damping(14),
      vaporize: SlideInUp.springify().damping(15),
    } as any
  )[elimEffect] || FadeIn.duration(250);

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

      {/* Equipped ability (top HUD — kept away from the button/hint text) */}
      {ability ? (
        <Pressable
          testID="ability-button"
          disabled={me?.ability_used || !me?.alive || ability.type === "defensive"}
          onPress={() => {
            if (ability.type !== "defensive" && !me?.ability_used) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setArmed((a) => !a);
            }
          }}
          style={[
            styles.abilityTop,
            armed && ability.type !== "defensive" && styles.abilityArmed,
            me?.ability_used && styles.abilityUsed,
          ]}
        >
          <MaterialCommunityIcons
            name={ability.icon as any}
            size={20}
            color={me?.ability_used ? colors.muted : armed ? "#fff" : colors.amber}
          />
          <Text style={[styles.abilityName, { flex: 1 }, me?.ability_used && { color: colors.muted }]} numberOfLines={1}>
            {ability.name}
          </Text>
          <Text style={styles.abilityTopHint} numberOfLines={1}>
            {me?.ability_used
              ? "USED"
              : ability.type === "defensive"
                ? "AUTO"
                : armed
                  ? "ARMED"
                  : "TAP TO ARM"}
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.abilityTop, { opacity: 0.6 }]}>
          <MaterialCommunityIcons name="flash-off" size={20} color={colors.muted} />
          <Text style={styles.abilityTopHint}>No ability equipped</Text>
        </View>
      )}

      {/* Center: danger + button */}
      <View style={styles.center}>
        <Text style={styles.dangerLabel}>DANGER</Text>
        <Text style={[styles.dangerNum, { color: dColor }]} testID="danger-pct">
          {Math.round(localDanger)}%
        </Text>

        <View style={styles.panicWrap}>
          {me?.alive && <ButtonFX type={buttonFx} size={208} />}
          {me?.alive && burstKey > 0 && (
            <PressBurst key={burstKey} type={buttonFx} color={skinColor} size={208} />
          )}
          <Animated.View style={btnStyle}>
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
        </View>

        <Text style={styles.hint}>
          {me?.alive
            ? "The longer you hold, the more XP you bank — but your danger keeps rising."
            : "You are spectating…"}
        </Text>
        {me?.alive && (me?.hold_xp ?? 0) > 0 && (
          <Text style={styles.holdXp} testID="hold-xp">PATIENCE BANKED +{me.hold_xp} XP</Text>
        )}
      </View>

      {/* Reveal banner */}
      {reveal && (
        <Animated.View
          entering={revealEntering}
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

function LobbyView({ state, insets, onCancel, onStart }: any) {
  const alive = state.players_alive;
  const total = state.players_total;

  // Loading bar fills as the arena populates (driven by the lobby countdown).
  const totalRef = useRef(0);
  const cd = state.countdown ?? 0;
  if (cd > totalRef.current) totalRef.current = cd;
  const denom = totalRef.current || 1;
  const progress = Math.min(1, Math.max(0.05, 1 - cd / denom));
  const loaded = Math.min(total, Math.max(alive, Math.round(progress * total)));
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 450 });
  }, [progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

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
          <Animated.View style={[styles.lobbyFill, fillStyle]} />
        </View>
        <Text style={styles.lobbyCount} testID="lobby-loaded">
          {progress >= 0.99 ? "ARENA READY" : `LOADING OPERATIVES · ${loaded} / ${total}`}
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
      <View style={{ padding: space.xl, paddingBottom: insets.bottom + space.xl }}>
        {state.party_code && (
          <Pressable testID="lobby-start-now" onPress={onStart} style={styles.startNowBtn}>
            <MaterialCommunityIcons name="rocket-launch" size={20} color="#fff" />
            <Text style={styles.startNowText}>START NOW</Text>
          </Pressable>
        )}
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

function ResultsView({ results, skinColor, username, oldXp, victoryAnim, onExit }: any) {
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

  const [showAd, setShowAd] = useState(false);
  const [adMode, setAdMode] = useState<"mandatory" | "double">("mandatory");
  const [adReward, setAdReward] = useState(0);
  const [mandatoryDue, setMandatoryDue] = useState(false);
  const [offerDoubleXp, setOfferDoubleXp] = useState(false);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  const claimAd = async () => {
    try {
      await api.claimAdReward();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* ignore */
    }
  };
  const markAdSeen = async () => {
    try {
      await api.adsSeen();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let active = true;
    api
      .adsStatus()
      .then((s) => {
        if (!active) return;
        setAdReward(s.reward);
        setMandatoryDue(s.mandatory_due);
        // The DOUBLE-XP offer appears at RANDOM when a reward is available.
        setOfferDoubleXp(s.reward_available && Math.random() < 0.5);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // CONTINUE (always available): shows a mandatory ad if 3 min have passed
  // since the last ad, otherwise goes straight to the lobby.
  const handleContinue = async () => {
    if (busy) return;
    if (!mandatoryDue) {
      onExit();
      return;
    }
    if (adsSupported) {
      setBusy(true);
      await showRewardedInterstitial(user?.id || "guest"); // mandatory: no reward
      await markAdSeen();
      onExit();
      return;
    }
    setAdMode("mandatory");
    setShowAd(true);
  };

  // DOUBLE XP (offered at random): opt-in ad. Watch = double XP, skip = nothing.
  const handleDoubleXp = async () => {
    if (busy) return;
    if (adsSupported) {
      setBusy(true);
      const outcome = await showRewardedInterstitial(user?.id || "guest");
      if (outcome === "earned") await claimAd();
      onExit();
      return;
    }
    setAdMode("double");
    setShowAd(true);
  };

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
      {won && <VictoryFX type={victoryAnim} />}
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

      <View style={[styles.resultFooter, { paddingBottom: insets.bottom + space.xl }]}>
        {offerDoubleXp && (
          <Pressable
            testID="double-xp-btn"
            disabled={busy}
            onPress={handleDoubleXp}
            style={styles.doubleXpBtn}
          >
            <MaterialCommunityIcons name="star-four-points" size={20} color={colors.surface} />
            <Text style={styles.doubleXpText}>WATCH AD · DOUBLE XP (+{adReward})</Text>
          </Pressable>
        )}
        <Pressable
          testID="return-lobby-btn"
          disabled={busy}
          onPress={handleContinue}
          style={styles.returnBtn}
        >
          <Text style={styles.returnText}>{busy ? "LOADING AD…" : "CONTINUE"}</Text>
        </Pressable>
      </View>

      {showAd && (
        <AdOverlay
          mode={adMode}
          reward={adReward}
          onSkip={onExit}
          onClaim={adMode === "double" ? claimAd : markAdSeen}
          onProceed={onExit}
        />
      )}
    </Animated.View>
  );
}

function AdOverlay({ mode, reward, onSkip, onClaim, onProceed }: any) {
  const mandatory = mode === "mandatory";
  const [left, setLeft] = useState(5);
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => setLeft((l) => (l <= 1 ? 0 : l - 1)), 1000);
    return () => clearInterval(iv);
  }, []);
  const done = left <= 0;
  const act = async () => {
    if (busy) return;
    setBusy(true);
    await onClaim();
    if (mandatory) {
      onProceed();
    } else {
      setClaimed(true);
      setTimeout(onProceed, 1300);
    }
  };
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.adWrap} testID="ad-overlay">
      <View style={styles.adCard}>
        <View style={styles.adHeader}>
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>AD</Text>
          </View>
          <Text style={styles.adHeaderText}>ADVERTISEMENT · SIMULATED</Text>
          {/* Skip (no reward) only for the optional double-XP ad. */}
          {!mandatory ? (
            <Pressable testID="ad-skip" onPress={onSkip} style={styles.adSkip} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : (
            <View style={styles.adSkip} />
          )}
        </View>
        <LinearGradient colors={["#0A3D62", "#0C2461"]} style={styles.adBanner}>
          <MaterialCommunityIcons name="sword-cross" size={56} color="#FFD700" />
          <Text style={styles.adBannerTitle}>GALAXY CLASH</Text>
          <Text style={styles.adBannerSub}>Build your empire · Install free</Text>
          <View style={styles.adStars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <MaterialCommunityIcons key={i} name="star" size={16} color="#FFD700" />
            ))}
          </View>
        </LinearGradient>
        {mandatory ? (
          <Text style={styles.adRewardLine}>Sponsored break — thanks for playing Panic Button!</Text>
        ) : claimed ? (
          <Text style={[styles.adRewardLine, { color: colors.success }]} testID="ad-claimed">
            DOUBLE XP! +{reward} bonus applied 🎉
          </Text>
        ) : (
          <Text style={styles.adRewardLine}>Watch fully to earn +{reward} bonus XP (DOUBLE your match XP). Skip = no bonus.</Text>
        )}
        {claimed ? null : done ? (
          <Pressable testID="ad-claim" disabled={busy} onPress={act} style={styles.adClaimBtn}>
            <MaterialCommunityIcons name={mandatory ? "play" : "gift"} size={20} color={colors.surface} />
            <Text style={styles.adClaimText}>
              {busy ? "…" : mandatory ? "CONTINUE" : `CLAIM +${reward} XP`}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.adCountdown}>
            <Text style={styles.adCountdownText}>
              {mandatory ? `Continue in ${left}s…` : `Reward unlocks in ${left}s…`}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hudRow: { flexDirection: "row", paddingHorizontal: space.md, gap: space.sm },
  feedCard: { flex: 1.4 },
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
  statCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: space.sm },
  statNum: { fontFamily: font.displayBold, fontSize: 34, color: colors.onSurface, lineHeight: 38 },
  statCap: { fontFamily: font.medium, fontSize: 9, color: colors.muted, letterSpacing: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dangerLabel: { fontFamily: font.displaySemi, fontSize: type.lg, color: colors.onSurface3, letterSpacing: 4 },
  dangerNum: { fontFamily: font.displayBold, fontSize: 74, lineHeight: 78 },
  panicWrap: { width: 236, height: 236, alignItems: "center", justifyContent: "center" },
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
  abilityTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.md,
    marginTop: space.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  abilityTopHint: { fontFamily: font.semi, fontSize: type.sm, color: colors.muted, letterSpacing: 0.5 },
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
  startNowBtn: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  startNowText: { fontFamily: font.displayBold, fontSize: type.xl, color: colors.surface, letterSpacing: 1 },
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
  adNote: {
    fontFamily: font.displaySemi,
    fontSize: type.sm,
    color: colors.amber,
    textAlign: "center",
    marginTop: space.md,
    letterSpacing: 0.5,
  },
  returnBtn: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  returnText: { fontFamily: font.displayBold, fontSize: type.xl, color: "#fff", letterSpacing: 1 },
  resultFooter: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.md },
  doubleXpBtn: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  doubleXpText: { fontFamily: font.displayBold, fontSize: type.lg, color: colors.surface, letterSpacing: 0.5 },
  // Full-screen simulated ad
  adWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#05070D",
    zIndex: 50,
  },
  adCard: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: 60,
    paddingBottom: 48,
    justifyContent: "space-between",
  },
  adHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  adBadge: { backgroundColor: colors.amber, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  adBadgeText: { fontFamily: font.bold, fontSize: 10, color: colors.surface, letterSpacing: 0.5 },
  adHeaderText: { flex: 1, fontFamily: font.medium, fontSize: type.sm, color: colors.muted, letterSpacing: 1 },
  adSkip: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  adBanner: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: space.xl,
    gap: space.sm,
  },
  adBannerTitle: { fontFamily: font.displayBold, fontSize: type["4xl"], color: "#fff", letterSpacing: 2 },
  adBannerSub: { fontFamily: font.regular, fontSize: type.base, color: "rgba(255,255,255,0.85)" },
  adStars: { flexDirection: "row", gap: 2, marginTop: space.sm },
  adRewardLine: {
    fontFamily: font.semi,
    fontSize: type.base,
    color: colors.onSurface2,
    textAlign: "center",
    marginBottom: space.lg,
  },
  adClaimBtn: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  adClaimText: { fontFamily: font.displayBold, fontSize: type.xl, color: colors.surface, letterSpacing: 1 },
  adCountdown: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  adCountdownText: { fontFamily: font.semi, fontSize: type.base, color: colors.muted },
});
