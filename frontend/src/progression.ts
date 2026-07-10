// Client mirror of the backend rank progression (for the level-up celebration
// and the rank roadmap). Must stay in sync with backend/config.py rank_threshold.
// The BACKEND is authoritative for a player's actual rank/XP; this is display-only.
export const MAX_LEVEL = 50;
const XP_CURVE_EXPONENT = 1.6;

// Cumulative lifetime XP required to REACH `rank` (rank 1 = 0). Eased curve
// within each 10-rank tier; milestones land exactly on rank*1000 (R10=10k … R50=50k).
export function rankThreshold(rank: number): number {
  if (rank <= 1) return 0;
  if (rank > MAX_LEVEL) rank = MAX_LEVEL;
  const tierStartRank = Math.floor((rank - 1) / 10) * 10;
  const tierStartXp = tierStartRank * 1000;
  const tierProgress = (rank - tierStartRank) / 10;
  const raw = tierStartXp + 10000 * Math.pow(tierProgress, XP_CURVE_EXPONENT);
  return Math.round(raw / 100) * 100;
}

export function xpForLevel(level: number): number {
  return rankThreshold(level);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

const RANK_TIERS: [number, string][] = [
  [1, "Rookie"],
  [3, "Bronze"],
  [5, "Silver"],
  [8, "Gold"],
  [11, "Platinum"],
  [15, "Diamond"],
  [20, "Elite"],
  [25, "Master"],
  [30, "Legend"],
  [50, "Immortal"],
];

export function rankName(level: number): string {
  let name = "Rookie";
  for (const [min, tier] of RANK_TIERS) if (level >= min) name = tier;
  return name;
}
