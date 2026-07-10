"""Weekly-reset leaderboard seasons for Panic Button.

A season is one ISO week (UTC). Lifetime XP / level / rank persist forever;
`season_xp` tracks only the current week and resets automatically (lazily, on
the next XP award) when the season rolls over. This powers a competitive
"This Week" leaderboard alongside the All-Time board.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def current_season_id() -> str:
    iso = datetime.now(timezone.utc).isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def season_reset_seconds() -> int:
    """Seconds until the next Monday 00:00 UTC (season rollover)."""
    now = datetime.now(timezone.utc)
    days_ahead = (7 - now.weekday()) % 7 or 7  # 0 => a full week away
    nxt = (now + timedelta(days=days_ahead)).replace(
        hour=0, minute=0, second=0, microsecond=0)
    return max(0, int((nxt - now).total_seconds()))


def season_award_ops(user: dict, amount: int) -> dict:
    """Mongo update ops to credit `amount` to the user's season score,
    resetting it first if their stored season is stale."""
    sid = current_season_id()
    if user.get("season_id") != sid:
        return {"$set": {"season_id": sid, "season_xp": amount}}
    return {"$inc": {"season_xp": amount}, "$set": {"season_id": sid}}
