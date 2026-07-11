# Self-Hosting / Running the Pressure Frontend (Expo)

The frontend is an **Expo (React Native)** app using **Expo Router** file-based
routing. It runs on iOS, Android, and Web from a single codebase, and talks to
the backend purely over HTTP + WebSocket using one environment variable
(`EXPO_PUBLIC_BACKEND_URL`).

---

## 1. Tech stack

| Piece            | Version / Tool                     | Notes                                   |
|------------------|------------------------------------|-----------------------------------------|
| Runtime          | Node.js 20.x                       | 18+ works; 20 recommended               |
| Package manager  | **Yarn 1 (classic, 1.22.x)**       | pinned via `packageManager` field       |
| Framework        | Expo SDK **54**                    | React 19.1, React Native 0.81           |
| Routing          | Expo Router 6 (`main: expo-router/entry`) | screens live in `app/`           |
| Bundler          | Metro                              | started by `expo start`                 |
| Native config    | `app.json` + config plugins        | expo-router, expo-splash-screen, react-native-google-mobile-ads, expo-build-properties |

> Uses only cross-platform React Native / Expo libraries (no web-only DOM libs).

---

## 2. The ONE variable that matters: point at your backend

In `frontend/.env`:

```
EXPO_PUBLIC_BACKEND_URL=http://<your-backend-host>:8001
```

- The app appends `/api` automatically for REST calls.
- The WebSocket URL for live matches is derived from the same base
  (`ws(s)://<host>/api/match/{id}/ws?token=...`), with an automatic
  HTTP-polling fallback if the socket can't connect.
- **Physical device testing:** `localhost` won't work from a phone. Use your
  machine's LAN IP (e.g. `http://192.168.1.50:8001`) or a tunnel, and make sure
  the phone and the backend are on the same network / reachable.
- **HTTPS + WSS in production:** iOS/Android require secure origins for real
  builds — serve the backend behind TLS (`https://api.yourdomain.com`) so both
  fetch and `wss://` work.

> `EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time, so
> **rebuild/restart** after changing them. Do **not** put secrets in
> `EXPO_PUBLIC_*` — anything prefixed this way ships to the client.

Other keys already present:
- `EXPO_PUBLIC_ADMOB_REWARDED_IOS` (and an Android counterpart) — optional AdMob
  rewarded-ad unit IDs. Leave empty to use the built-in **simulated** ad overlay;
  real ads only work in a native build with valid IDs.
- `EXPO_PACKAGER_*` / `EXPO_TUNNEL_SUBDOMAIN` / `METRO_CACHE_ROOT` — Emergent
  preview-infra vars; irrelevant for your own local/hosted runs.

---

## 3. Run in development

```bash
cd frontend
yarn install            # respects the pinned Yarn 1.22.x

# Start Metro (choose a target):
yarn start              # dev menu / QR code for Expo Go
yarn web                # open in a browser
yarn android            # build+open on Android emulator/device
yarn ios                # build+open on iOS simulator (macOS only)
```

Scan the QR code with **Expo Go** to run on a physical device during development.

> Note: features that need native modules (e.g. real AdMob ads, background audio)
> do **not** work in Expo Go — they require a development or production build
> (section 4).

---

## 4. Build for the stores / standalone apps

Because native config plugins are used (AdMob, build-properties), production
builds must be compiled. Two paths:

### A) Emergent (simplest)
Use the **Publish** button in the Emergent UI to generate iOS/Android builds —
it manages the build pipeline and credentials for you. (No EAS account needed.)

### B) Your own Expo/EAS account
If you host the code yourself:
```bash
npm i -g eas-cli
eas login
eas build:configure
eas build -p android --profile production
eas build -p ios --profile production
```
Before building, set real identifiers in `app.json`:
- `expo.android.package` and `expo.ios.bundleIdentifier`
  (currently `com.emergent.dangermeter.gt98hx` — change to your own),
- `expo.name` / `expo.slug` (currently `frontend`),
- add your AdMob app IDs and rewarded unit IDs (in `app.json` +
  `EXPO_PUBLIC_ADMOB_REWARDED_*`) if you want live ads.

### Web (static hosting)
```bash
cd frontend
npx expo export --platform web       # outputs static files to dist/
```
Serve `dist/` on any static host (Netlify, Vercel, S3, nginx). Make sure
`EXPO_PUBLIC_BACKEND_URL` was set to your public HTTPS backend before exporting.

---

## 5. Project layout (where to edit)

```
frontend/
  app/                 # Expo Router screens (file path = route)
    (tabs)/            # Play / Rank / Abilities / Cosmetics / Stats
    match/[id].tsx     # full-screen match + results + spectator
    auth.tsx           # name-only onboarding
    leaderboard.tsx, challenges.tsx, friends.tsx
  src/                 # non-route code: api client, theme, ui, fx, progression, ads
  app.json             # Expo/native config + plugins
  .env                 # EXPO_PUBLIC_BACKEND_URL etc.
```

---

## 6. Quick checklist to run against your own backend

1. Start the backend (see `backend/SELF_HOSTING.md`) — note its reachable URL.
2. Set `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to that URL (LAN IP for a
   phone; HTTPS domain for production).
3. `yarn install && yarn start` (or `yarn web`).
4. Enter a callsign on the auth screen — if the roster/rank loads, you're wired
   up correctly. If requests hang, re-check the URL, that `/api` is reachable,
   and (for devices) that HTTPS/WSS + network access are in place.
