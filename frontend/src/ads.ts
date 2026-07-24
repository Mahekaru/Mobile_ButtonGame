import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * AdMob integration
 *
 * Rewarded ads:
 * - Player explicitly chooses to watch.
 * - Completing the ad can grant Double XP.
 *
 * Interstitial ads:
 * - Shown at a natural transition, such as returning to the main screen.
 * - Never grants XP or another reward.
 *
 * Real ads only work inside a native build.
 * Expo Go and web use the simulated overlay in match/[id].tsx.
 */

// -----------------------------------------------------------------------------
// Production AdMob ad-unit IDs
// -----------------------------------------------------------------------------

const REWARDED_AD_UNIT_ID_ANDROID =
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID || "";

const REWARDED_AD_UNIT_ID_IOS =
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS || "";

const INTERSTITIAL_AD_UNIT_ID_ANDROID =
  process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID || "";

const INTERSTITIAL_AD_UNIT_ID_IOS =
  process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS || "";

// Expo Go reports "storeClient".
// Native development and production builds do not.
export const isExpoGo =
  Constants.executionEnvironment === "storeClient";

// Native AdMob is unavailable on web and inside Expo Go.
export const adsSupported =
  Platform.OS !== "web" && !isExpoGo;

// -----------------------------------------------------------------------------
// Result types
// -----------------------------------------------------------------------------

export type RewardedResult =
  | "earned"
  | "closed"
  | "unsupported"
  | "error";

export type InterstitialResult =
  | "closed"
  | "unsupported"
  | "error";

// -----------------------------------------------------------------------------
// Native module initialization
// -----------------------------------------------------------------------------

let mod: any = null;
let initializePromise: Promise<unknown> | null = null;

/**
 * Loads the native Google Mobile Ads module.
 *
 * The lazy require prevents Expo Go and web from attempting to load native
 * code that does not exist in those environments.
 */
function getModule(): any | null {
  if (!adsSupported) {
    return null;
  }

  if (mod) {
    return mod;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-google-mobile-ads");
    return mod;
  } catch (error) {
    console.error(
      "[AdMob] Failed to load react-native-google-mobile-ads:",
      error,
    );

    mod = null;
    return null;
  }
}

/**
 * Initializes Google Mobile Ads once.
 */
async function ensureInitialized(m: any): Promise<boolean> {
  if (!m?.default) {
    console.error("[AdMob] Mobile Ads default export is unavailable.");
    return false;
  }

  try {
    if (!initializePromise) {
      initializePromise = Promise.resolve(
        m.default().initialize(),
      );
    }

    await initializePromise;
    return true;
  } catch (error) {
    console.error(
      "[AdMob] Google Mobile Ads initialization failed:",
      error,
    );

    // Allow a later request to retry initialization.
    initializePromise = null;
    return false;
  }
}

// -----------------------------------------------------------------------------
// Ad-unit selection
// -----------------------------------------------------------------------------

function rewardedUnitId(m: any): string {
  // Development builds always use Google's official Rewarded test unit.
  if (__DEV__) {
    return m.TestIds.REWARDED;
  }

  const productionId =
    Platform.OS === "ios"
      ? REWARDED_AD_UNIT_ID_IOS
      : REWARDED_AD_UNIT_ID_ANDROID;

  if (!productionId) {
    console.warn(
      "[AdMob] Rewarded ad-unit ID is missing. Using Google's test unit.",
    );
  }

  return productionId || m.TestIds.REWARDED;
}

function interstitialUnitId(m: any): string {
  // Development builds always use Google's official Interstitial test unit.
  if (__DEV__) {
    return m.TestIds.INTERSTITIAL;
  }

  const productionId =
    Platform.OS === "ios"
      ? INTERSTITIAL_AD_UNIT_ID_IOS
      : INTERSTITIAL_AD_UNIT_ID_ANDROID;

  if (!productionId) {
    console.warn(
      "[AdMob] Interstitial ad-unit ID is missing. Using Google's test unit.",
    );
  }

  return productionId || m.TestIds.INTERSTITIAL;
}

// -----------------------------------------------------------------------------
// Opt-in Rewarded ad
// -----------------------------------------------------------------------------

/**
 * Loads and displays a normal Rewarded ad.
 *
 * This function is only for an explicit player choice, such as:
 * "Watch Ad · Double XP".
 *
 * Returns:
 * - "earned": the SDK fired EARNED_REWARD.
 * - "closed": the ad closed without earning the reward.
 * - "unsupported": native AdMob is unavailable.
 * - "error": initialization, loading, or showing failed.
 */
export async function showRewardedAd(
  userId: string,
): Promise<RewardedResult> {
  const m = getModule();

  if (!m) {
    return "unsupported";
  }

  const initialized = await ensureInitialized(m);

  if (!initialized) {
    return "error";
  }

  return new Promise<RewardedResult>((resolve) => {
    const {
      RewardedAd,
      RewardedAdEventType,
      AdEventType,
    } = m;

    let settled = false;
    let earned = false;

    const subscriptions: Array<() => void> = [];

    const cleanup = () => {
      subscriptions.splice(0).forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // Ignore listener cleanup errors.
        }
      });
    };

    const finish = (result: RewardedResult) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    try {
      const ad = RewardedAd.createForAdRequest(
        rewardedUnitId(m),
        {
          requestNonPersonalizedAdsOnly: true,

          // These values are available if Server-Side Verification is
          // configured in AdMob later.
          serverSideVerificationOptions: {
            userId,
            customData: "double-xp",
          },
        },
      );

      subscriptions.push(
        ad.addAdEventListener(
          RewardedAdEventType.LOADED,
          () => {
            try {
              Promise.resolve(ad.show()).catch((error) => {
                console.error(
                  "[AdMob] Failed to show Rewarded ad:",
                  error,
                );

                finish("error");
              });
            } catch (error) {
              console.error(
                "[AdMob] Rewarded ad show threw an error:",
                error,
              );

              finish("error");
            }
          },
        ),
      );

      subscriptions.push(
        ad.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          () => {
            earned = true;
          },
        ),
      );

      subscriptions.push(
        ad.addAdEventListener(
          AdEventType.CLOSED,
          () => {
            finish(earned ? "earned" : "closed");
          },
        ),
      );

      subscriptions.push(
        ad.addAdEventListener(
          AdEventType.ERROR,
          (error: unknown) => {
            console.error(
              "[AdMob] Rewarded ad failed:",
              error,
            );

            finish("error");
          },
        ),
      );

      ad.load();
    } catch (error) {
      console.error(
        "[AdMob] Rewarded ad setup failed:",
        error,
      );

      finish("error");
    }
  });
}

// -----------------------------------------------------------------------------
// Natural-transition Interstitial ad
// -----------------------------------------------------------------------------

/**
 * Loads and displays a normal Interstitial ad.
 *
 * This function is for natural transitions, such as leaving the match results
 * and returning to the main screen. It never grants a reward.
 *
 * Returns:
 * - "closed": the ad was displayed and then closed.
 * - "unsupported": native AdMob is unavailable.
 * - "error": initialization, loading, or showing failed.
 */
export async function showInterstitialAd(): Promise<InterstitialResult> {
  const m = getModule();

  if (!m) {
    return "unsupported";
  }

  const initialized = await ensureInitialized(m);

  if (!initialized) {
    return "error";
  }

  return new Promise<InterstitialResult>((resolve) => {
    const {
      InterstitialAd,
      AdEventType,
    } = m;

    let settled = false;

    const subscriptions: Array<() => void> = [];

    const cleanup = () => {
      subscriptions.splice(0).forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // Ignore listener cleanup errors.
        }
      });
    };

    const finish = (result: InterstitialResult) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    try {
      const ad = InterstitialAd.createForAdRequest(
        interstitialUnitId(m),
        {
          requestNonPersonalizedAdsOnly: true,
        },
      );

      subscriptions.push(
        ad.addAdEventListener(
          AdEventType.LOADED,
          () => {
            try {
              Promise.resolve(ad.show()).catch((error) => {
                console.error(
                  "[AdMob] Failed to show Interstitial ad:",
                  error,
                );

                finish("error");
              });
            } catch (error) {
              console.error(
                "[AdMob] Interstitial ad show threw an error:",
                error,
              );

              finish("error");
            }
          },
        ),
      );

      subscriptions.push(
        ad.addAdEventListener(
          AdEventType.CLOSED,
          () => {
            finish("closed");
          },
        ),
      );

      subscriptions.push(
        ad.addAdEventListener(
          AdEventType.ERROR,
          (error: unknown) => {
            console.error(
              "[AdMob] Interstitial ad failed:",
              error,
            );

            finish("error");
          },
        ),
      );

      ad.load();
    } catch (error) {
      console.error(
        "[AdMob] Interstitial ad setup failed:",
        error,
      );

      finish("error");
    }
  });
}