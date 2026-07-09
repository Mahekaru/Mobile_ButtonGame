// Design tokens for Panic Button — "Dark-First Utility" personality.
// Obsidian base, signal red + amber accents. No blues/indigos/purples.

export const colors = {
  surface: "#0F0F13",
  surface2: "#1C1C22",
  surface3: "#292932",
  onSurface: "#FFFFFF",
  onSurface2: "#EBEBEF",
  onSurface3: "#D1D1D6",
  muted: "#8A8A94",
  brand: "#E53935",
  red: "#FF3B30",
  amber: "#FF9500",
  redDeep: "#320A08",
  success: "#34C759",
  warning: "#FFCC00",
  info: "#0A84FF",
  border: "#292932",
  borderStrong: "#3A3A44",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 4, md: 8, lg: 16, pill: 999 };

export const font = {
  // display (numbers / headers) — Barlow Condensed
  displayMedium: "BarlowCondensed-Medium",
  displaySemi: "BarlowCondensed-SemiBold",
  displayBold: "BarlowCondensed-Bold",
  // text (labels / body) — IBM Plex Sans
  regular: "IBMPlexSans-Regular",
  medium: "IBMPlexSans-Medium",
  semi: "IBMPlexSans-SemiBold",
  bold: "IBMPlexSans-Bold",
};

export const type = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 48,
};

// Button-skin id -> color (mirrors backend cosmetics catalog for the match HUD)
export const SKIN_COLORS: Record<string, string> = {
  classic: "#FF3B30",
  amber: "#FF9500",
  toxic: "#34C759",
  void: "#2B2B33",
  gold: "#FFCC00",
};

// Interpolate danger color white -> amber -> red as % rises (base 5 .. cap 90)
export function dangerColor(pct: number): string {
  const t = Math.max(0, Math.min(1, (pct - 5) / 85));
  const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const k = t / 0.5; // white -> amber
    r = lerp(255, 255, k);
    g = lerp(255, 149, k);
    b = lerp(255, 0, k);
  } else {
    const k = (t - 0.5) / 0.5; // amber -> red
    r = lerp(255, 255, k);
    g = lerp(149, 59, k);
    b = lerp(0, 48, k);
  }
  return `rgb(${r},${g},${b})`;
}
