/**
 * Web stub for AdMob.
 *
 * Real Google Mobile Ads require native Android or iOS code and therefore
 * cannot run in the web build. The match screen sees adsSupported=false
 * and uses its simulated ad overlay instead.
 */

export const isExpoGo = false;
export const adsSupported = false;

export type RewardedResult =
  | "earned"
  | "closed"
  | "unsupported"
  | "error";

export type InterstitialResult =
  | "closed"
  | "unsupported"
  | "error";

/**
 * Web replacement for the opt-in Rewarded ad.
 *
 * Normally this will not be called because adsSupported is false, but the
 * function must exist so imports from "@/src/ads" work on every platform.
 */
export function showRewardedAd(
  _userId: string,
): Promise<RewardedResult> {
  return Promise.resolve("unsupported");
}

/**
 * Web replacement for the natural-transition Interstitial ad.
 */
export function showInterstitialAd(): Promise<InterstitialResult> {
  return Promise.resolve("unsupported");
}