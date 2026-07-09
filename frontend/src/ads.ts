import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * AdMob rewarded INTERSTITIAL ads (shown between results and the lobby).
 *
 * Real Google AdMob ads only run inside a NATIVE build (dev-client / production).
 * They do NOT work in Expo Go or the web preview because the library ships
 * custom native code. In those environments we fall back to a simulated
 * interstitial overlay (see AdOverlay in match/[id].tsx). Watching to
 * completion grants the reward; skipping grants nothing.
 */

// Real ad unit IDs (set these in frontend/.env once you have them from AdMob).
const AD_UNIT_ID_ANDROID = process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID || "";
const AD_UNIT_ID_IOS = process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS || "";

// Expo Go reports "storeClient"; native dev/prod builds report "standalone".
export const isExpoGo = Constants.executionEnvironment === "storeClient";

// Real AdMob is only usable on a native (non-web, non-Expo-Go) build.
export const adsSupported = Platform.OS !== "web" && !isExpoGo;

let mod: any = null;
let initialized = false;

function getModule(): any | null {
  if (!adsSupported) return null;
  if (mod) return mod;
  try {
    // Lazy require so the native module is never touched in Expo Go / web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-google-mobile-ads");
    if (!initialized && mod?.default) {
      mod.default().initialize();
      initialized = true;
    }
  } catch {
    mod = null;
  }
  return mod;
}

function rewardedUnitId(m: any): string {
  // Always use Google test ads in development to avoid AdMob policy strikes.
  if (__DEV__) return m.TestIds.REWARDED_INTERSTITIAL;
  const id = Platform.OS === "ios" ? AD_UNIT_ID_IOS : AD_UNIT_ID_ANDROID;
  return id || m.TestIds.REWARDED_INTERSTITIAL;
}

export type RewardedResult = "earned" | "closed" | "unsupported" | "error";

/**
 * Loads and shows a real AdMob rewarded interstitial ad.
 * Resolves "earned" only if the user watched to completion (EARNED_REWARD),
 * "closed" if they skipped, "unsupported" where real ads can't run.
 */
export function showRewardedInterstitial(userId: string): Promise<RewardedResult> {
  const m = getModule();
  if (!m) return Promise.resolve("unsupported");

  return new Promise<RewardedResult>((resolve) => {
    const { RewardedInterstitialAd, RewardedAdEventType, AdEventType } = m;
    let settled = false;
    let earned = false;
    const subs: (() => void)[] = [];
    const cleanup = () => subs.forEach((s) => s());
    const finish = (r: RewardedResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(r);
    };

    try {
      const ad = RewardedInterstitialAd.createForAdRequest(rewardedUnitId(m), {
        requestNonPersonalizedAdsOnly: true,
        serverSideVerificationOptions: { userId, customData: "after-match" },
      });
      subs.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show()),
      );
      subs.push(
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
      );
      // CLOSED fires whether earned or skipped — award ONLY if EARNED_REWARD fired.
      subs.push(
        ad.addAdEventListener(AdEventType.CLOSED, () =>
          finish(earned ? "earned" : "closed"),
        ),
      );
      subs.push(ad.addAdEventListener(AdEventType.ERROR, () => finish("error")));
      ad.load();
    } catch {
      finish("error");
    }
  });
}
