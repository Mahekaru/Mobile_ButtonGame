// Client mirror of the backend progression math (for the level-up celebration).
export const MAX_LEVEL = 50;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * (level - 1) * level);
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
];

export function rankName(level: number): string {
  let name = "Rookie";
  for (const [min, tier] of RANK_TIERS) if (level >= min) name = tier;
  return name;
}
