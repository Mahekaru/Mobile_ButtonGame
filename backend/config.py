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

# Kill-protection: diminishing returns. Maps kills -> protection fraction.
PROTECTION_TABLE = {0: 0.0, 1: 0.05, 2: 0.09, 3: 0.12, 4: 0.14}
PROTECTION_CAP = 0.15  # 5+ kills


def protection_for(kills: int) -> float:
    if kills >= 5:
        return PROTECTION_CAP
    return PROTECTION_TABLE.get(kills, 0.0)


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
        "unlock_level": 2,
        "type": "defensive",
        "desc": "Once per match: if selected for elimination, survive and reroll the target.",
    },
    {
        "id": "lucky_press", "name": "Lucky Press", "icon": "clover",
        "unlock_level": 3,
        "type": "offensive",
        "desc": "Once per match: reduce your current self-elimination risk by 25%.",
    },
    {
        "id": "deflect", "name": "Deflect", "icon": "shield-sword",
        "unlock_level": 5,
        "type": "defensive",
        "desc": "Once per match: if selected for elimination, force a reroll.",
    },
    {
        "id": "double_tap", "name": "Double Tap", "icon": "gesture-double-tap",
        "unlock_level": 7,
        "type": "offensive",
        "desc": "Once per match: trigger two eliminations from a single button press.",
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
    ],
    "title": [
        {"id": "rookie", "name": "Rookie", "unlock_level": 1},
        {"id": "survivor", "name": "The Survivor", "unlock_level": 3},
        {"id": "executioner", "name": "Executioner", "unlock_level": 5},
        {"id": "untouchable", "name": "Untouchable", "unlock_level": 7},
        {"id": "legend", "name": "Living Legend", "unlock_level": 10},
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
}

DEFAULT_COSMETICS = {
    "button_skin": "classic",
    "title": "rookie",
    "icon": "skull",
    "elim_effect": "fade",
    "victory_anim": "confetti",
}


# ---------------------------------------------------------------------------
# Progression / rank math
# ---------------------------------------------------------------------------
MAX_LEVEL = 50


def xp_for_level(level: int) -> int:
    """Cumulative XP required to REACH `level` (level 1 = 0 xp)."""
    if level <= 1:
        return 0
    return int(100 * (level - 1) * level / 2)


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
    xp = 30 + kills * 25
    xp += max(0, (match_size - placement)) // 2
    if won:
        xp += 250
    return xp


# Bonus XP for knocking out humans you know (drives the social loop)
FRIEND_KO_BONUS = 50   # eliminating a friend
RIVAL_KO_BONUS = 25    # eliminating a human you've matched with before

# Patience / hold reward — the longer you wait before pressing, the bigger the
# banked reward when you survive the press (lost entirely if you self-destruct).
HOLD_XP_PER_SEC = 2
HOLD_XP_CAP = 140

# Late-game tension: danger climbs faster as the field shrinks.
LATE_TENSION = 2.2

# Daily / weekly login rewards
DAILY_XP = 100
DAILY_STREAK_BONUS = 25   # per consecutive day (capped by streak %7)
WEEKLY_XP = 350           # every 7th consecutive day
