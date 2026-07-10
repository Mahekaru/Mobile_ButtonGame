"""Static game configuration, catalogs and progression math for Panic Button."""
from __future__ import annotations

import math
import random

# ---------------------------------------------------------------------------
# Core tunable gameplay values (all configurable in one place)
# ---------------------------------------------------------------------------
GAME_CONFIG = {
    "match_size": 100,          # total players per match (humans + bots)
    "lobby_countdown_sec": 8,   # time the lobby waits for humans before bots fill
    "party_countdown_sec": 25,  # longer wait for a private party so friends can join
    "danger_base": 5.0,         # self-death chance % right after a press (0s)
    "danger_slope": 1.0,        # % added per second since last press
    "danger_cap": 90.0,         # max self-death chance %
    "tick_sec": 0.8,            # server bot-evaluation tick (slower = more tension)
    "double_tap_count": 2,
    "lucky_press_multiplier": 0.75,  # -25% self risk
}

# Kill-protection: linear spread that reaches its 15% cap at 10 kills
# (+1.5% per kill). Maps kills -> protection fraction.
PROTECTION_PER_KILL = 0.015
PROTECTION_CAP = 0.15      # reached at 10 kills
PROTECTION_MAX_KILLS = 10


def protection_for(kills: int) -> float:
    return min(PROTECTION_CAP, max(0, kills) * PROTECTION_PER_KILL)


# ---------------------------------------------------------------------------
# Bot personalities — each has a press-threshold range (on the danger %).
# The bot with the lowest threshold currently satisfied presses first.
# ---------------------------------------------------------------------------
BOT_PERSONALITIES = {
    "coward":  {"label": "Coward",  "range": (4, 14)},   # presses very early
    "greedy":  {"label": "Greedy",  "range": (12, 26)},  # waits for low-risk windows
    "veteran": {"label": "Veteran", "range": (18, 30)},  # near-optimal timing
    "chaos":   {"label": "Chaos",   "range": (5, 45)},   # acts randomly
}
PERSONALITY_WEIGHTS = ["coward", "greedy", "veteran", "chaos"]


def roll_threshold(personality: str) -> float:
    lo, hi = BOT_PERSONALITIES[personality]["range"]
    return random.uniform(lo, hi)


# ---------------------------------------------------------------------------
# Bot behaviour — erratic, human-like pacing (bursts + random pauses + nerves).
# Evaluated every tick; keeps the average press rate close to one actor per
# tick while adding lulls, panic cascades, excited bursts and freezes.
# ---------------------------------------------------------------------------
BOT_LULL_CHANCE = 0.30            # tick where everyone hesitates (no press)
BOT_CASCADE_CHANCE = 0.18         # tick where panic spreads (several bots act)
BOT_CASCADE_RANGE = (2, 4)        # how many bots act during a cascade
BOT_PAUSE_RANGE = (1.0, 3.6)      # random pause a bot takes after acting (sec)
BOT_PANIC_FREEZE_RANGE = (2.5, 6.0)  # how long a panicking bot freezes (sec)
BOT_PANIC_CHANCE = 0.20           # chance a near-full-danger bot freezes instead
BOT_EXCITED_DANGER = 0.75         # danger ratio (of cap) that counts as "nearly full"
BOT_BURST_RANGE = (2, 3)          # extra rapid presses when excited
BOT_BURST_CHANCE = 0.6            # chance an excited bot fires a burst
BOT_EARLY_JITTER = 0.06           # chance a below-threshold bot presses anyway
BOT_TOPK = 5                      # actor is chosen randomly among K most urgent


BOT_FIRST = [
    "Ash", "Rune", "Vex", "Nova", "Kilo", "Zed", "Onyx", "Fury", "Jinx", "Rex",
    "Blaze", "Ghost", "Crank", "Pyro", "Dagger", "Echo", "Riot", "Hex", "Sable", "Talon",
    "Volt", "Wraith", "Frost", "Grim", "Havoc", "Ion", "Juno", "Karma", "Lynx", "Maze",
    "Nyx", "Orbit", "Puck", "Quill", "Raze", "Slate", "Trix", "Ursa", "Viper", "Wisp",
]
BOT_LAST = [
    "77", "X", "Prime", "Jr", "V2", "Zero", "Max", "Neo", "Ace", "Pro",
    "TX", "9", "One", "Kid", "King", "Lord", "Duke", "Boss", "Star", "Alpha",
]


def make_bot_name(used: set) -> str:
    for _ in range(50):
        name = f"{random.choice(BOT_FIRST)}_{random.choice(BOT_LAST)}"
        if name not in used:
            used.add(name)
            return name
    name = f"Bot_{random.randint(1000, 9999)}"
    used.add(name)
    return name


# ---------------------------------------------------------------------------
# Abilities (unlocked by rank level, one equipped per match)
# ---------------------------------------------------------------------------
ABILITIES = [
    {
        "id": "second_chance", "name": "Second Chance", "icon": "shield-refresh",
        "unlock_level": 3,
        "type": "defensive",
        "desc": "Once per match: if selected for elimination, survive and reroll the target.",
    },
    {
        "id": "lucky_press", "name": "Lucky Press", "icon": "clover",
        "unlock_level": 6,
        "type": "offensive",
        "desc": "Once per match: reduce your current self-elimination risk by 25%.",
    },
    {
        "id": "deflect", "name": "Deflect", "icon": "shield-sword",
        "unlock_level": 18,
        "type": "defensive",
        "desc": "Once per match: if selected for elimination, force a reroll.",
    },
    {
        "id": "double_tap", "name": "Double Tap", "icon": "gesture-double-tap",
        "unlock_level": 27,
        "type": "offensive",
        "desc": "Once per match: trigger two eliminations from a single button press.",
    },
    {
        "id": "hide", "name": "Vanish", "icon": "ghost",
        "unlock_level": 14,
        "type": "active",
        "desc": "Once per match: press and become untargetable (and press-safe) for 5 seconds.",
    },
    {
        "id": "overcharge", "name": "Overcharge", "icon": "lightning-bolt",
        "unlock_level": 22,
        "type": "active",
        "desc": "Once per match: TRIPLE your match XP, but your danger rises +15% for the rest of the match.",
    },
    {
        "id": "adrenaline", "name": "Adrenaline", "icon": "run-fast",
        "unlock_level": 33,
        "type": "active",
        "desc": "Once per match: DOUBLE every patience XP you bank from here on.",
    },
    {
        "id": "steady", "name": "Steady Hand", "icon": "timer-sand",
        "unlock_level": 40,
        "type": "active",
        "desc": "Once per match: freeze your danger meter for 6 seconds after you press.",
    },
    {
        "id": "failsafe", "name": "Failsafe", "icon": "shield-check",
        "unlock_level": 10,
        "type": "active",
        "desc": "Once per match: for 2 seconds after you press, you cannot eliminate yourself.",
    },
    {
        "id": "immortal", "name": "Immortality", "icon": "shield-star",
        "unlock_level": 50,
        "type": "active",
        "desc": "MAX RANK REWARD. Once per match: become completely untargetable and press-safe for 8 seconds — nothing can eliminate you.",
    },
]
ABILITY_BY_ID = {a["id"]: a for a in ABILITIES}
DEFENSIVE_ABILITIES = {a["id"] for a in ABILITIES if a["type"] == "defensive"}


# ---------------------------------------------------------------------------
# Cosmetics (no gameplay advantage) — unlocked by rank level
# ---------------------------------------------------------------------------
COSMETICS = {
    "button_skin": [
        {"id": "classic", "name": "Classic Red", "unlock_level": 1, "color": "#FF3B30", "pattern": "solid"},
        {"id": "amber", "name": "Amber Rings", "unlock_level": 2, "color": "#FF9500", "pattern": "rings"},
        {"id": "toxic", "name": "Toxic Hazard", "unlock_level": 4, "color": "#34C759", "pattern": "stripes"},
        {"id": "void", "name": "Void Grid", "unlock_level": 6, "color": "#2B2B33", "pattern": "dots"},
        {"id": "gold", "name": "Golden Shine", "unlock_level": 8, "color": "#FFCC00", "pattern": "shine"},
        {"id": "wood", "name": "Oak Panel", "unlock_level": 3, "color": "#8B5A2B", "pattern": "wood"},
        {"id": "retro", "name": "Retro Arcade", "unlock_level": 5, "color": "#2EC4B6", "pattern": "retro"},
        {"id": "panic", "name": "Panic Station", "unlock_level": 7, "color": "#D7263D", "pattern": "panic"},
        {"id": "carbon", "name": "Carbon Fiber", "unlock_level": 9, "color": "#3A3A44", "pattern": "carbon"},
        {"id": "neon", "name": "Neon Pulse", "unlock_level": 10, "color": "#FF2E9A", "pattern": "neon"},
    ],
    "title": [
        {"id": "rookie", "name": "Rookie", "unlock_level": 1},
        {"id": "survivor", "name": "The Survivor", "unlock_level": 3},
        {"id": "executioner", "name": "Executioner", "unlock_level": 5},
        {"id": "untouchable", "name": "Untouchable", "unlock_level": 7},
        {"id": "legend", "name": "Living Legend", "unlock_level": 10},
        {"id": "immortal", "name": "Immortal", "unlock_level": 50},
    ],
    "icon": [
        {"id": "skull", "name": "Skull", "unlock_level": 1, "icon": "skull"},
        {"id": "target", "name": "Target", "unlock_level": 2, "icon": "target"},
        {"id": "bomb", "name": "Bomb", "unlock_level": 4, "icon": "bomb"},
        {"id": "crown", "name": "Crown", "unlock_level": 6, "icon": "crown"},
        {"id": "ghost", "name": "Ghost", "unlock_level": 8, "icon": "ghost"},
    ],
    "elim_effect": [
        {"id": "fade", "name": "Fade Out", "unlock_level": 1},
        {"id": "shatter", "name": "Shatter", "unlock_level": 3},
        {"id": "burn", "name": "Incinerate", "unlock_level": 5},
        {"id": "vaporize", "name": "Vaporize", "unlock_level": 7},
    ],
    "victory_anim": [
        {"id": "confetti", "name": "Confetti", "unlock_level": 1},
        {"id": "fireworks", "name": "Fireworks", "unlock_level": 4},
        {"id": "goldrain", "name": "Gold Rain", "unlock_level": 8},
    ],
    "button_fx": [
        {"id": "none", "name": "None", "unlock_level": 1},
        {"id": "glow", "name": "Aura Glow", "unlock_level": 2},
        {"id": "fire", "name": "Inferno", "unlock_level": 5},
        {"id": "electric", "name": "Overload", "unlock_level": 8},
    ],
}

DEFAULT_COSMETICS = {
    "button_skin": "classic",
    "title": "rookie",
    "icon": "skull",
    "elim_effect": "fade",
    "victory_anim": "confetti",
    "button_fx": "none",
}


# ---------------------------------------------------------------------------
# Progression / rank math
# ---------------------------------------------------------------------------
MAX_LEVEL = 50

# ---------------------------------------------------------------------------
# Authoritative rank progression (single source of truth).
#
# `rank_threshold(rank)` = cumulative lifetime XP a player must have to REACH
# `rank`. Rank 1 = 0 XP (everyone starts here). Within each 10-rank tier the
# curve is EASED (exponent 1.6): the first ranks are cheap and each subsequent
# rank costs progressively more, so no two consecutive ranks share a threshold.
# Every tenth rank (a "milestone") lands exactly on rank*1000:
#   R10 = 10,000 · R20 = 20,000 · R30 = 30,000 · R40 = 40,000 · R50 = 50,000
# Thresholds are rounded to the nearest 100 XP.
XP_CURVE_EXPONENT = 1.6


def rank_threshold(rank: int) -> int:
    """Cumulative lifetime XP required to REACH `rank` (rank 1 = 0)."""
    if rank <= 1:
        return 0
    if rank > MAX_LEVEL:
        rank = MAX_LEVEL
    tier_start_rank = ((rank - 1) // 10) * 10
    tier_start_xp = tier_start_rank * 1000
    tier_progress = (rank - tier_start_rank) / 10.0
    raw = tier_start_xp + 10000.0 * (tier_progress ** XP_CURVE_EXPONENT)
    return int(round(raw / 100.0) * 100)


# Precomputed cumulative thresholds; index i == rank (i+1). XP_TABLE[0] == 0.
XP_TABLE = [rank_threshold(r) for r in range(1, MAX_LEVEL + 1)]


def xp_for_level(level: int) -> int:
    """Cumulative XP required to REACH `level` (alias of rank_threshold)."""
    if level <= 1:
        return 0
    if level >= MAX_LEVEL:
        return XP_TABLE[MAX_LEVEL - 1]
    return XP_TABLE[level - 1]


def level_for_xp(xp: int) -> int:
    level = 1
    while level < MAX_LEVEL and xp >= xp_for_level(level + 1):
        level += 1
    return level


RANK_TIERS = [
    (1, "Rookie"),
    (3, "Bronze"),
    (5, "Silver"),
    (8, "Gold"),
    (11, "Platinum"),
    (15, "Diamond"),
    (20, "Elite"),
    (25, "Master"),
    (30, "Legend"),
    (50, "Immortal"),
]


def rank_name(level: int) -> str:
    name = "Rookie"
    for min_level, tier in RANK_TIERS:
        if level >= min_level:
            name = tier
    return name


def progression_snapshot(xp: int) -> dict:
    level = level_for_xp(xp)
    current_floor = xp_for_level(level)
    next_floor = xp_for_level(level + 1) if level < MAX_LEVEL else current_floor
    span = max(1, next_floor - current_floor)
    return {
        "xp": xp,
        "level": level,
        "rank": rank_name(level),
        "xp_into_level": xp - current_floor,
        "xp_for_next": next_floor - current_floor if level < MAX_LEVEL else 0,
        "progress": min(1.0, (xp - current_floor) / span) if level < MAX_LEVEL else 1.0,
        "is_max": level >= MAX_LEVEL,
    }


def unlocked_ability_ids(level: int) -> list:
    return [a["id"] for a in ABILITIES if a["unlock_level"] <= level]


def compute_match_xp(placement: int, kills: int, won: bool, match_size: int) -> int:
    xp = 20 + kills * 18
    xp += max(0, (match_size - placement)) // 3
    if won:
        xp += 150
    return xp


# Bonus XP for knocking out humans you know (drives the social loop)
FRIEND_KO_BONUS = 50   # eliminating a friend
RIVAL_KO_BONUS = 25    # eliminating a human you've matched with before

# Patience / hold reward — the longer you wait before pressing, the bigger the
# banked reward when you survive the press (lost entirely if you self-destruct).
HOLD_XP_PER_SEC = 2
HOLD_XP_CAP = 140

# Late-game tension: danger climbs faster as the field shrinks, then surges
# for the final few survivors so end-game presses are genuinely nerve-wracking.
LATE_TENSION = 3.2
FINAL_STRETCH_COUNT = 8    # "final stretch" begins when this many remain
FINAL_STRETCH_MULT = 1.7   # extra danger-slope multiplier during the final stretch

# Daily / weekly login rewards
DAILY_XP = 100
DAILY_STREAK_BONUS = 25   # per consecutive day (capped by streak %7)
WEEKLY_XP = 350           # every 7th consecutive day

# Rewarded ads
AD_COOLDOWN_SEC = 180     # no bonus ad for 3 minutes after finishing one


# ---------------------------------------------------------------------------
# Daily challenges — a fresh set is drawn each day (deterministic by date).
# Progress accrues from match results; completing one grants bonus XP.
# ---------------------------------------------------------------------------
CHALLENGE_POOL = [
    {"id": "win_one", "name": "Sole Survivor", "desc": "Win a match",
     "icon": "trophy", "metric": "wins", "goal": 1, "reward": 250},
    {"id": "elim_five", "name": "Executioner", "desc": "Eliminate 5 operatives",
     "icon": "skull", "metric": "eliminations", "goal": 5, "reward": 150},
    {"id": "elim_ten", "name": "Rampage", "desc": "Eliminate 10 operatives",
     "icon": "skull-crossbones", "metric": "eliminations", "goal": 10, "reward": 260},
    {"id": "play_three", "name": "Warm Up", "desc": "Play 3 matches",
     "icon": "sword-cross", "metric": "matches", "goal": 3, "reward": 100},
    {"id": "top_ten", "name": "Final Ten", "desc": "Reach the top 10",
     "icon": "flag-checkered", "metric": "top10", "goal": 1, "reward": 120},
    {"id": "top_ten_two", "name": "Consistent", "desc": "Reach the top 10 twice",
     "icon": "flag-variant", "metric": "top10", "goal": 2, "reward": 200},
    {"id": "patience", "name": "Ice Veins", "desc": "Bank 150 patience XP",
     "icon": "timer-sand", "metric": "patience", "goal": 150, "reward": 130},
    {"id": "survive_two", "name": "No Panic", "desc": "Finish 2 matches without self-eliminating",
     "icon": "shield-check", "metric": "survive", "goal": 2, "reward": 110},
]
CHALLENGE_BY_ID = {c["id"]: c for c in CHALLENGE_POOL}
DAILY_CHALLENGE_COUNT = 3
