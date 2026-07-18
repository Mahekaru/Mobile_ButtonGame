# Panic Button — PRD

## Original Problem Statement
Multiplayer battle-royale game around a single shared button. 100 players; any living player can press; a press eliminates one player; last one alive wins. Global danger meter resets after each press and rises over time — the longer unpressed, the higher the chance the PRESSER dies (else a random other player dies). Kill-protection (diminishing returns). Persistent progression (XP/rank/wins/eliminations). Rank-unlocked abilities (one equipped per match). AI bots with personalities backfill lobbies. Cosmetics (no gameplay edge). Stats dashboard. Tone: simple, clean, tense, psychological.

## User Choices
- Real-time multiplayer with real humans (server-authoritative match, bot backfill).
- Backend MongoDB progression + accounts.
- Realistic tension / slower pacing.
- Visual style: agent's choice (bold, high-tension).
- Self-contained (NO third-party integrations).

## Architecture
- **Backend**: FastAPI + Motor(MongoDB). JWT auth (bcrypt + PyJWT). Server-authoritative `MatchManager` (in-memory) with per-match asyncio loop: bots press based on personality vs. the rising global danger meter; humans press via HTTP. Clients poll `GET /api/match/{id}/state` (700ms) and animate the danger meter client-side from `last_press_at`.
  - Files: `server.py` (routes/auth), `game.py` (Match/MatchManager engine), `config.py` (tunables, catalogs, progression math).
  - Danger: self-death % = clamp(base 5 + slope 1.0 * seconds, 5, 90). Protection: 5/9/12/14/15% cap. XP = 30 + kills*25 + placement bonus + 250 win.
- **Frontend**: Expo Router (SDK 54). Fonts: Barlow Condensed (display) + IBM Plex Sans (text). Bottom tabs: Play/Rank/Abilities/Cosmetics/Stats. Match screen is a full-screen route. `@gorhom/bottom-sheet`, `react-native-reanimated`, `react-native-keyboard-controller`. Auth token in secure storage.

## User Personas
- Casual competitive mobile player who enjoys quick, tense, luck+skill elimination games.

## Core Requirements (static)
- 100-player matches, bot backfill, shared button, danger meter, presser-vs-random elimination, kill protection, persistent progression, rank-gated abilities (equip one), cosmetics, stats.

## Implemented (2026-06 / build 5 — cosmetics come alive)
- Equipped ability indicator moved to the TOP HUD (under the feed/stats row) so it never overlaps the button/hint/patience text.
- Equipped elimination effect drives the in-match reveal animation (fade / shatter-zoom / burn / vaporize-slide).
- Equipped victory animation plays on the Results screen when you win (confetti / fireworks / gold rain) via a lightweight `VictoryFX` particle module.
- Party ready-up: `POST /api/match/{id}/start` + a START NOW button in the party lobby launches the match immediately (verified: 25s countdown → active + bot backfill).
- Live equipped-skin preview on the main menu ("YOUR BUTTON") using `SkinSurface` so players see their skin/pattern before a match.

## Implemented (2026-06 / build 4 — UI polish)
- Match HUD ability bar made compact + panic button/danger resized so it no longer overlaps the hint/patience text.
- "Play with Friends" (party) moved to the top header next to the Friends button.
- Abilities screen fixed to a true two-column grid.
- Cosmetics items enlarged to a two-column layout.
- Button skins now render distinct patterns (solid / concentric rings / hazard stripes / dot grid / gold shine) via a reusable `SkinSurface`, shown in cosmetics previews and the live match button.

## Implemented (2026-06 / build 3 — personal danger + retention)
- **Personal danger meter**: danger is now per-player and only resets when THAT player presses (no longer global). Self-death chance on a press uses the presser's personal danger. Bots press on their own personal danger vs. personality threshold.
- **Patience reward**: the longer you hold before pressing (or until eliminated), the more bonus XP you bank (capped at 140; forfeited only if you self-destruct on a press). Shown live on the HUD and on the recap.
- **No bot mentions** anywhere in the lobby ("Preparing the arena…").
- **Device-bound identity**: removed logout; token persists. Players can rename via `POST /api/profile/name` (menu pencil → bottom sheet).
- **Gameplay tuning**: slower bot cadence (tick 0.8s) and danger slope scales up as the field shrinks (LATE_TENSION) → pronounced late-game tension.
- **Level-up celebration** on the Results screen (client mirrors backend XP curve).
- **Party lobby**: `POST /api/match/party/create` → shareable 5-char code (25s countdown); `POST /api/match/party/join` → invited friends land in the SAME match, guaranteeing friend-KO bonuses fire.
- **Daily/weekly login bonus**: `GET /api/rewards/status`, `POST /api/rewards/claim` (streak + weekly boost); claimable card on the menu.
- Verified: 10/10 new backend tests + frontend smoke pass; prior 20/20 core + 11/11 social still green.

## Implemented (2026-06 / build 2 — social loop)
- **Name-only onboarding**: removed email/password; `POST /api/auth/guest {username}` creates a device-bound account with a unique 6-char friend code (JWT token persisted in secure storage). Old email/password endpoints retained but unused.
- **Friends**: friend codes, mutual add-by-code (`/api/friends`, `/api/friends/add`), Friends screen with share-invite (native share sheet) + squad list.
- **Rivals**: after each match, the other humans in it are recorded as future "rivals" (`$addToSet`).
- **Social bonus XP**: KO a friend in-match = +50 XP, KO a rival = +25 XP (verified deterministically + via results payload).
- **Shareable recap card**: Results screen renders a branded, capture-ready recap (placement, kills, XP, KO bonuses, auto-generated taunt) with one-tap Share (react-native-view-shot + expo-sharing on native, text share fallback on web).
- **Lobby** no longer shows the human count.
- Verified: 11/11 new social tests + 20/20 core regression pass; recap card + share confirmed on preview.

## Implemented (2026-06 / build 1)
- JWT auth (register/login/me).
- Profile/progression: XP, level, rank tiers, unlocked abilities, equipped cosmetics.
- Abilities: list + equip/unequip (rank-gated). Second Chance, Lucky Press, Deflect, Double Tap (defensive auto-trigger; offensive arm-before-press).
- Cosmetics: 5 categories, equip (rank-gated), no gameplay effect.
- Stats dashboard (matches, wins, win rate, eliminations, streak, self-elims, avg placement, avg survival).
- Match: matchmaking lobby (8s countdown) with bot backfill to 100; live HUD (danger %, remaining, kills+protection, elimination feed, panic button w/ heavy haptics + squish, ability indicator); reveal banner; results (victory/defeat) with placement + XP; per-player result persistence on elimination/leave.
- 4 bot personalities (Coward/Greedy/Veteran/Chaos).
- Verified: 20/20 backend tests pass; frontend flows smoke-tested.

## Backlog / Next
- P1: Real-time transport upgrade (WebSocket) for lower-latency multi-human sync; spectator view after death with live feed until match end.
- P1: Gameplay tuning pass (danger slope / bot thresholds) so mid/late-game tension (higher danger %) is more pronounced; level-up celebration on results.
- P2: Cosmetic visual effects actually applied (elimination effects, victory animations); friends/party lobbies; leaderboards; daily challenges.
- P2: Web font delivery via WOFF2 (native Expo Go already loads TTFs fine).

## Known Notes
- Full 100→1 matches take several minutes; humans typically exit mid-match (battle-royale variance) — expected.
- Web preview falls back to system font for the custom TTFs over the proxy; native builds load them correctly.

## Rewarded Ads (User Request 6 — DONE, iteration_4 verified)
- After each match, user can watch a rewarded ad for DOUBLE match XP; 3-min cooldown (AD_COOLDOWN_SEC=180) blocks repeat bonus.
- Backend: GET /api/ads/status, POST /api/ads/reward; reward = last_match_xp, idempotent per match (ad_claimed_for).
- SIMULATED ad overlay ("GALAXY CLASH") shown in Expo Go / web preview.
- REAL Google AdMob wired for native builds via react-native-google-mobile-ads + expo-build-properties config plugin (app.json uses Google TEST app IDs; frontend/.env has empty EXPO_PUBLIC_ADMOB_REWARDED_ANDROID/IOS for real unit IDs). src/ads.ts (native) + src/ads.web.ts (web stub) gate real ads behind adsSupported; falls back to simulated overlay when unsupported.
- AdMob requires a native build + user's AdMob App IDs & Rewarded Ad Unit IDs to go live — not testable in preview.

## Update — Interstitial Ads + Button FX + New Skins (this session)
- Ad is now a REWARDED INTERSTITIAL shown BETWEEN the results screen and the lobby (triggered by the RETURN/CLAIM button). Watch fully = DOUBLE XP; SKIP = no reward. 3-min cooldown unchanged. Simulated overlay on web/Expo Go; real AdMob uses RewardedInterstitialAd (src/ads.ts) on native builds.
- New cosmetic category `button_fx` (none/glow/fire/electric) renders an animated aura AROUND the panic button in-match (src/fx.tsx ButtonFX). Unlocks: glow L2, fire L5, electric L8.
- New button skins: wood (Oak Panel L3), retro (Retro Arcade L5), panic (Panic Station L7), carbon (Carbon Fiber L9), neon (Neon Pulse L10) with new SkinSurface patterns (ui.tsx).

## Update — Ad rework, new abilities, XP curve (iteration_6 verified)
- Ads: CONTINUE always shown -> MANDATORY full-screen ad only if 3 min since last ad (else straight to menu). Separate DOUBLE-XP button appears at RANDOM (~50%) = opt-in rewarded ad (watch=double XP, skip=none). Endpoints: /ads/status {mandatory_due,reward_available,...}, /ads/seen (new, records mandatory view), /ads/reward. Full-screen simulated overlay; real AdMob native-only.
- New abilities (type 'active', arm-before-press): Vanish/hide L4 (5s untargetable+press-safe), Overcharge L6 (3x match XP, +15 danger surcharge), Adrenaline L8 (2x patience XP), Steady Hand L10 (freeze danger 6s).
- XP curve steepened: xp_for_level = 100*(n-1)*n (L2=200, L5=2000); compute_match_xp reduced (base 20, kills*18, win 150, placement//3) -> standard slower progression.

## Update — Lobby loading bar, chip wrap, tab safe-area, polished FX
- Lobby: reanimated loading bar + "LOADING OPERATIVES · n/100" that fills to "ARENA READY" as the countdown elapses (match/[id].tsx LobbyView).
- Cosmetics category chips now WRAP into 2 rows (no horizontal scroll) so all 6 are always reachable (cosmetics.tsx).
- Tab bar height/paddingBottom now include useSafeAreaInsets bottom so buttons aren't cut off on devices with a home indicator ((tabs)/_layout.tsx).
- ButtonFX rewritten with reanimated: glow = layered breathing bloom (GlowAura); fire = warm base bloom + 20 gradient flame tongues rising/flickering (fx.tsx). electric unchanged.

## Update — Failsafe ability, intense glow, press burst, HUD align, bottom clearance
- New ability 'failsafe' (Failsafe, L3, active): for 2s after you press you cannot self-eliminate (game.py self_safe_until; resolve_press zeroes self_chance in window).
- Glow FX reworked to an intense light-leak bloom: large outward disc bleed (f up to 1.85×) + bright pulsing rim ring with colored shadow (fx.tsx GlowAura/GlowRim). Fire flames now hug the button edge (R=size*0.5).
- New PressBurst FX (fx.tsx): one-shot ring+sparks fired on every panic press, tinted by button_fx (fire/electric/glow) or skin color otherwise (match onPanic -> burstKey).
- HUD: elimination-feed bottom aligned with KILLS card bottom (statCard flex:1).
- Bottom-button clearance bumped: tab bar includes safe-area inset; menu footer insets.bottom+96; results/lobby footers insets.bottom+space.xl.

## Update — Leaderboards + Daily Challenges + WebSocket + Spectator (2026-07 / iteration_10 verified)
- **Leaderboards**: GET /api/leaderboard?scope=global|friends (top 100 by xp desc, tiebreak wins; is_me + my_rank fallback via count_documents). New /leaderboard modal screen with GLOBAL/FRIENDS tabs, medal top-3, "YOUR RANK" chip; trophy header icon on Play menu.
- **Daily challenges**: deterministic 3/day draw seeded by UTC date (challenges.py CHALLENGE_POOL, 8 defs). Progress accrues in game.persist_player after each match (metrics: wins/eliminations/matches/top10/patience/survive). GET /api/challenges, POST /api/challenges/claim/{id} (grants reward XP once). New /challenges modal screen with progress bars + claim; summary card on Play menu.
- **WebSocket real-time transport**: /api/match/{id}/ws?token=JWT. Match.broadcast() pushes personalized state on lobby countdown, each 0.8s tick, every press, leave, and match end. Verified working through external wss ingress. Client uses WS with automatic HTTP-polling fallback (src/api.ts matchWsUrl).
- **Spectator view**: state_for now returns `results` only when phase==ended and `my_result` while dead. Dead players see SpectatorView (live feed + remaining + kills + VIEW MY RESULTS + LEAVE TO MENU) until they opt into results or the match ends.
- **Fixes**: auth screen auto-redirects to /(tabs) when session becomes valid (iter9 residual resolved); client progression mirror xpForLevel aligned to backend curve (removed erroneous /2).
- Verified: 10/10 new backend tests + full frontend flows (leaderboard, challenges, WS match, spectator, auth redirect).

## Update — Rank XP progression bug fix (2026-06)
- **Root cause:** the old XP_TABLE used constant per-tier increments (e.g. ranks 26–30 each cost +1,000), so consecutive higher ranks displayed identical XP-to-next requirements.
- **Fix (single authoritative source):** `config.rank_threshold(rank)` = `tierStartXp + 10000·pow(tierProgress, 1.6)` rounded to nearest 100 — an eased curve within each 10-rank tier (early ranks cheap, later ranks steeper), with milestones landing exactly on rank×1000: **R10=10k · R20=20k · R30=30k · R40=40k · R50=50k**. Thresholds strictly increasing, no consecutive duplicates. Rank 1 = 0 XP. `progression.ts` mirrors it (backend authoritative).
- **Milestone abilities** remapped to unlock ranks **3, 6, 10, 14, 18, 22, 27, 33, 40, 50** (one per milestone).
- **Preserve/idempotent unlocks:** new persistent `unlocked_abilities` set synced in `get_current_user` — additive (never revoked, keeps equipped ability, survives curve changes) and idempotent (writes only when the set grows, so re-login/XP-recalc never re-unlocks). `/abilities` + equip now gate on this set.
- **Progress bar** uses current-rank threshold → next-rank threshold, counting only in-rank XP (`progression_snapshot`). Rank roadmap now shows cumulative total XP per level (strictly increasing).
- **Validation:** `tests/test_rank_progression.py` (9/9) + live API `tests/test_iteration13_rank_bug_fix.py` (9/9) — full 18/18 via testing_agent; frontend roadmap verified (all 50 levels, unlock labels, L50 Immortal capstone).


- **XP curve** reworked to a hand-tuned cumulative table (config.py XP_TABLE, mirrored in progression.ts). Early levels cheap, later progressively pricier. Round milestones: L10=2,000 · L15=4,000 · L20=7,000 · L25=11,000 · L30=16,000 · L35=22,000 · L40=30,000 · L45=42,000 · L50=60,000 (max). Per-level cost rises from +100 (L2) to +3,600 (L46–50).
- **Level 50 = "Immortal"** final milestone tier, and reaching it unlocks TWO exclusive rewards: (1) new capstone ability **Immortality** (active, unlock_level 50 — once/match become fully untargetable + press-safe for 8s; game.py resolve_press branch), and (2) **Immortal** title cosmetic (unlock_level 50).
- Rank roadmap lists every level 1–50 with XP-to-reach + unlock callouts; L50 row shows "MAX RANK · Unlocks: Immortality ability + Immortal title".

## Update — Level cap 1–50 with full per-level roadmap (2026-06)
- MAX_LEVEL kept at 50 (reverted the brief 100 experiment). XP curve unchanged: cumulative 100·(n-1)·n → per-level cost 200·(n-1) (standard RPG: early levels quick, later progressively harder; L2=200 … L50=+9,800, cumulative 245,000).
- Rank tiers restored to Rookie→Legend (1–30), with a final milestone **Immortal at Level 50**. Rank roadmap screen (rank.tsx) now lists EVERY level 1–50 (no skips): level badge, rank tier shown at tier-starts, XP needed to reach that level, and ability/cosmetic unlock callouts. Reached/current levels highlighted.

## Update — Rebrand to "Pressure" + terminology (2026-06)
- Game renamed **Panic Button → PRESSURE** across all user-facing text (auth title, recap brand, share/party/friends messages, ad line).
- New tagline: "100 players. One button. Every press eliminates someone. It could be you."
- Outcome copy: in-match reveal — own kill = "PLAYER ELIMINATED", self = "SELF-ELIMINATION"; results title — win = "YOU SURVIVED", self = "SELF-ELIMINATION", killed by another = "YOU WERE ELIMINATED".
- All user-facing "Danger" → "Pressure" (match HUD label "PRESSURE", hint text, ability descriptions in config.py + catalog.ts). Internal code identifiers (dangerColor/dangerLabel/state.danger keys) unchanged — layout/functionality/style untouched.

## Deployment fix — AdMob Kotlin incompatibility (2026-07)
- **Symptom:** EAS Android app-bundle build failed at `:react-native-google-mobile-ads:compileReleaseKotlin` — `play-services-ads-25.4.0 ... Module was compiled with an incompatible version of Kotlin. metadata is 2.3.0, expected 2.1.0`.
- **Root cause:** `react-native-google-mobile-ads@16.4.0` pins `play-services-ads:25.4.0` (compiled with Kotlin 2.3.0), but the Expo SDK 54 / RN 0.81 build toolchain uses Kotlin 2.1.0, which can't read 2.3.0 metadata.
- **Fix (code-level, no Docker changes):** pinned `react-native-google-mobile-ads` to **16.0.2** (exact, no caret) → `play-services-ads:24.6.0` (Kotlin 2.1.0 line). Installed via `yarn expo install` so package.json + yarn.lock both updated. Metro re-bundles cleanly (1462 modules); ads are simulated in preview (native SDK only loads in real builds) so no runtime change in preview.

## Update — Abuse protection: rate limiting (2026-06)
- New `backend/ratelimit.py`: in-memory async sliding-window limiter (deque + asyncio.Lock), `enforce()` → HTTP 429 + `Retry-After`; `client_ip()` (left-most X-Forwarded-For, else socket peer); `is_public_ip()` (skips private/loopback/reserved incl. RFC5737 doc ranges).
- Limits (`config.py`): press **20/1s per user**, match join **10/20s per user** (deliberately generous — finish-match→join-next is 1 req, NEVER blocked), party-create **5/60s per user**, party-join **20/20s per user**, guest signup **30/60s per PUBLIC IP only** (loopback/shared-proxy skipped so NAT users + local pytest aren't throttled). Wired into `/match/{id}/press`, `/match/join`, `/match/party/create`, `/match/party/join`, `/auth/guest`.
- Self-verified via curl: press→429 after 20/s (409 once dead), join→429 after 10, party→429 after 5, guest public-XFF→429 after 30, guest loopback→unlimited.

## Update — Callsign profanity/alias filter (2026-06)
- New `backend/namefilter.py` (`check_username`) rejects inappropriate callsigns: profanity/slurs (hard-block substrings, leet + separator + repeat-letter normalization), common profanity as whole-word tokens (avoids false positives like class/assassin/pass), reserved/impersonation names (admin/pressure/staff…), charset (letters/digits/space . _ -) and 2–16 length. Wired into `POST /api/auth/guest` and `POST /api/profile/name` → HTTP 400 with a friendly message. Frontend rename sheet now surfaces the error (was swallowed); auth screen already did. Verified live: bad names 400, clean names 200; e2e screenshot shows error on entry.

## Known residual (low priority)
- RN-Web warning `props.pointerEvents is deprecated` at match/[id].tsx reveal banner (web-only cosmetic).
- IBM Plex TTFs fail to decode via preview proxy (web-only; native builds load fine).

## Update — Erratic human-like bot AI + protection rework (2026-07)
- **Bot AI rewrite** (game.py `_bots_tick`, config BOT_* tunables): replaced the constant "one ready bot per tick" model with human-like pacing — match-level LULLS (30% ticks nobody presses) and CASCADES (panic spreads to 2-4 bots at once); each bot takes a random pause (1.0-3.6s) after acting; danger reactions — when personal danger is "nearly full" (>=75% of cap) a bot either gets EXCITED (rapid burst of 2-3 presses) or PANICS and FREEZES (2.5-6s). Actor chosen randomly among the 5 most-urgent bots for unpredictability. Verified: all-bot field lasts ~1.25 min avg with visible cascades + lulls; live match 100→79 in ~20s with variable rate.
- **Kill-protection**: now a linear spread reaching the 15% cap at 10 kills (+1.5%/kill) — config PROTECTION_PER_KILL=0.015, PROTECTION_CAP=0.15.
- **HUD copy**: match HUD now reads "KILLS · X% PROTECTION" (was cryptic "PROT").
- **Spectator "Leave to menu"** now goes through the same mandatory-ad gate as Results "Continue" (shared useMandatoryAdExit hook in match/[id].tsx).

## Update — Late-game tension + Season leaderboard + Challenge toast (2026-07)
- **Late-game tension**: LATE_TENSION 2.2→3.2; new FINAL_STRETCH surge (eff_slope ×1.7 when ≤8 alive) so end-game danger climbs sharply. Client auto-reflects via state.config.slope.
- **Season/weekly leaderboard**: seasons.py (ISO-week id, Monday-00:00-UTC reset). Users track season_xp (lazy reset on next award via season_award_ops); credited in persist_player + rewards/ads/challenge claims. GET /api/leaderboard?scope=&period=season|alltime — season filters season_id==current, returns reset_seconds + season_id. Leaderboard screen: THIS WEEK / ALL-TIME toggle, "Resets in Xd Yh" label, "PLAY TO RANK THIS WEEK" when unranked. Lifetime level/rank unaffected.
- **Challenge-complete toast**: challenges.apply_progress now returns newly-completed items; persist_player stores them in user.last_match_challenges. GET /api/challenges/recent. ResultsView shows an amber "CHALLENGE COMPLETE!" toast (retry-once for winner write race) that taps through to /challenges. Verified end-to-end via seeded session.
