// Client mirror of the backend progression math (for the level-up celebration
// and the rank roadmap). Must stay in sync with backend/config.py XP_TABLE.
export const MAX_LEVEL = 50;

// Cumulative XP required to REACH each level (index 0 = level 1 = 0 xp).
const XP_TABLE = [
  0, 100, 250, 450, 700, 960, 1220, 1480, 1740, 2000,
  2400, 2800, 3200, 3600, 4000, 4600, 5200, 5800, 6400, 7000,
  7800, 8600, 9400, 10200, 11000, 12000, 13000, 14000, 15000, 16000,
  17200, 18400, 19600, 20800, 22000, 23600, 25200, 26800, 28400, 30000,
  32400, 34800, 37200, 39600, 42000, 45600, 49200, 52800, 56400, 60000,
];

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= MAX_LEVEL) return XP_TABLE[MAX_LEVEL - 1];
  return XP_TABLE[level - 1];
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
