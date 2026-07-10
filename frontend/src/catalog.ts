// Client-side ability metadata (mirrors backend catalog for HUD rendering).
export type AbilityType = "offensive" | "defensive" | "active";

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
    short: "KO two",
  },
  hide: {
    name: "Vanish",
    icon: "ghost",
    type: "active",
    short: "5s untargetable",
  },
  overcharge: {
    name: "Overcharge",
    icon: "lightning-bolt",
    type: "active",
    short: "3x XP · +15% pressure",
  },
  adrenaline: {
    name: "Adrenaline",
    icon: "run-fast",
    type: "active",
    short: "2x patience XP",
  },
  steady: {
    name: "Steady Hand",
    icon: "timer-sand",
    type: "active",
    short: "Freeze pressure 6s",
  },
  failsafe: {
    name: "Failsafe",
    icon: "shield-check",
    type: "active",
    short: "No self-KO 2s",
  },
};
