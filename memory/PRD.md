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
