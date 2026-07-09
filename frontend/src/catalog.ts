// Client-side ability metadata (mirrors backend catalog for HUD rendering).
export type AbilityType = "offensive" | "defensive";

export const ABILITY_META: Record<
  string,
  { name: string; icon: string; type: AbilityType; short: string }
> = {
  second_chance: {
    name: "Second Chance",
    icon: "shield-refresh",
    type: "defensive",
    short: "Survive + reroll once",
  },
  lucky_press: {
    name: "Lucky Press",
    icon: "clover",
    type: "offensive",
    short: "-25% self risk",
  },
  deflect: {
    name: "Deflect",
    icon: "shield-sword",
    type: "defensive",
    short: "Force a reroll",
  },
  double_tap: {
    name: "Double Tap",
    icon: "gesture-double-tap",
    type: "offensive",
    short: "Eliminate two",
  },
};
