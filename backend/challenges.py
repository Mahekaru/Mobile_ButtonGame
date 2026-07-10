"""Daily-challenge logic for Panic Button.

A deterministic set of challenges is drawn each UTC day (seeded by the date so
every player sees the same rotation). Progress accrues from match results and
is stored on the user document under `daily_challenges`.
"""
from __future__ import annotations

import random
from datetime import datetime, timezone

from config import CHALLENGE_BY_ID, CHALLENGE_POOL, DAILY_CHALLENGE_COUNT


def today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def generate_daily(date_str: str) -> list:
    seed = int(date_str.replace("-", ""))
    rng = random.Random(seed)
    chosen = rng.sample(CHALLENGE_POOL, min(DAILY_CHALLENGE_COUNT, len(CHALLENGE_POOL)))
    return [{"id": c["id"], "progress": 0, "claimed": False} for c in chosen]


def ensure_today(user: dict) -> tuple:
    """Return (daily_challenges_doc, changed) refreshed for today if needed."""
    dc = user.get("daily_challenges") or {}
    today = today_iso()
    if dc.get("date") != today or not dc.get("items"):
        return {"date": today, "items": generate_daily(today)}, True
    return dc, False


def _metric_deltas(result: dict) -> dict:
    return {
        "wins": 1 if result.get("won") else 0,
        "eliminations": result.get("kills", 0),
        "matches": 1,
        "top10": 1 if result.get("placement", 999) <= 10 else 0,
        "patience": result.get("patience_xp", 0),
        "survive": 0 if result.get("self_eliminated") else 1,
    }


def apply_progress(dc: dict, result: dict) -> list:
    """Mutate `dc` with match progress; return challenges newly completed
    by this match (not previously complete, not yet claimed)."""
    deltas = _metric_deltas(result)
    newly = []
    for item in dc["items"]:
        spec = CHALLENGE_BY_ID.get(item["id"])
        if not spec or item.get("claimed"):
            continue
        was_complete = item.get("progress", 0) >= spec["goal"]
        d = deltas.get(spec["metric"], 0)
        if d:
            item["progress"] = min(spec["goal"], item.get("progress", 0) + d)
        if not was_complete and item.get("progress", 0) >= spec["goal"]:
            newly.append({"id": item["id"], "name": spec["name"], "reward": spec["reward"]})
    return newly


def public_challenges(dc: dict) -> dict:
    items = []
    for item in dc["items"]:
        spec = CHALLENGE_BY_ID.get(item["id"])
        if not spec:
            continue
        progress = item.get("progress", 0)
        complete = progress >= spec["goal"]
        items.append({
            "id": item["id"],
            "name": spec["name"],
            "desc": spec["desc"],
            "icon": spec["icon"],
            "goal": spec["goal"],
            "reward": spec["reward"],
            "progress": progress,
            "complete": complete,
            "claimed": item.get("claimed", False),
        })
    completed = sum(1 for i in items if i["complete"])
    return {"date": dc["date"], "challenges": items,
            "completed": completed, "total": len(items)}
