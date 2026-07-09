// Web stub for AdMob. Real rewarded ads only run on native builds, so on web
// we report "unsupported" and the app falls back to the simulated ad overlay.
export const isExpoGo = false;
export const adsSupported = false;

export type RewardedResult = "earned" | "closed" | "unsupported" | "error";

export function showRewardedAd(_userId: string): Promise<RewardedResult> {
  return Promise.resolve("unsupported");
}
