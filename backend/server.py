import logging
import os
import random
import string
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from contextlib import asynccontextmanager

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

import challenges as CH
import config as C
import seasons as S
from game import MatchManager
from namefilter import check_username
from ratelimit import enforce as rl_enforce, client_ip, is_public_ip

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 30

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    client.close()


app = FastAPI(lifespan=lifespan)
@app.get("/health")
async def health_check():
    return {"status": "ok"}
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=True)

manager = MatchManager(db)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("panic")


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=JWT_TTL_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    await _sync_unlocked_abilities(user)
    return user


async def _sync_unlocked_abilities(user: dict) -> None:
    """Persist the monotonic set of unlocked ability ids for `user`.

    Unlocks are ADDITIVE: an ability becomes unlocked when the player reaches its
    milestone rank (config unlock_level) or because it is currently equipped, and
    it then stays unlocked forever — even if the rank curve later changes or the
    player's recomputed rank would be lower. Idempotent: writes only when the set
    grows, so logging in / recalculating XP never "re-unlocks" the same ability.
    """
    level = C.level_for_xp(user.get("xp", 0))
    stored = set(user.get("unlocked_abilities") or [])
    merged = set(stored)
    merged.update(C.unlocked_ability_ids(level))
    if user.get("equipped_ability"):
        merged.add(user["equipped_ability"])
    ordered = [a["id"] for a in C.ABILITIES if a["id"] in merged]
    user["unlocked_abilities"] = ordered
    if merged != stored:
        await db.users.update_one({"_id": user["_id"]},
                                  {"$set": {"unlocked_abilities": ordered}})


FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars


async def generate_friend_code() -> str:
    for _ in range(30):
        code = "".join(random.choice(FRIEND_CODE_ALPHABET) for _ in range(6))
        exists = await db.users.find_one({"friend_code": code})
        if not exists:
            return code
    return uuid.uuid4().hex[:6].upper()


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------
def public_user(user: dict) -> dict:
    xp = user.get("xp", 0)
    prog = C.progression_snapshot(xp)
    level = prog["level"]
    matches = user.get("matches_played", 0)
    wins = user.get("wins", 0)
    placement_sum = user.get("placement_sum", 0)
    return {
        "id": user["_id"],
        "email": user.get("email"),
        "username": user["username"],
        "friend_code": user.get("friend_code"),
        "friends_count": len(user.get("friends", [])),
        "equipped_ability": user.get("equipped_ability"),
        "equipped_cosmetics": user.get("equipped_cosmetics", dict(C.DEFAULT_COSMETICS)),
        "progression": prog,
        "unlocked_abilities": user.get("unlocked_abilities") or C.unlocked_ability_ids(level),
        "stats": {
            "matches_played": matches,
            "wins": wins,
            "win_rate": round((wins / matches) * 100, 1) if matches else 0.0,
            "total_eliminations": user.get("total_eliminations", 0),
            "times_self_eliminated": user.get("times_self_eliminated", 0),
            "highest_streak": user.get("highest_streak", 0),
            "avg_placement": round(placement_sum / matches, 1) if matches else 0.0,
        },
    }


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterBody(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=16)
    password: str = Field(min_length=6, max_length=72)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class GuestBody(BaseModel):
    username: str = Field(min_length=2, max_length=16)


class FriendAddBody(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class ChangeNameBody(BaseModel):
    username: str = Field(min_length=2, max_length=16)


class EquipAbilityBody(BaseModel):
    ability_id: Optional[str] = None


class EquipCosmeticBody(BaseModel):
    category: str
    item_id: str


class PressBody(BaseModel):
    use_ability: bool = False


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
def _new_user_doc(user_id: str, username: str, friend_code: str, email=None, password_hash=None) -> dict:
    return {
        "_id": user_id,
        "email": email,
        "username": username,
        "password_hash": password_hash,
        "friend_code": friend_code,
        "friends": [],
        "rivals": [],
        "last_daily_claim": None,
        "daily_streak": 0,
        "daily_challenges": None,
        "last_match_challenges": [],
        "season_id": S.current_season_id(),
        "season_xp": 0,
        "last_ad_at": None,
        "last_match_xp": 0,
        "last_match_id": None,
        "ad_claimed_for": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "xp": 0,
        "level": 1,
        "wins": 0,
        "matches_played": 0,
        "total_eliminations": 0,
        "times_self_eliminated": 0,
        "highest_streak": 0,
        "placement_sum": 0,
        "equipped_ability": None,
        "equipped_cosmetics": dict(C.DEFAULT_COSMETICS),
        "unlocked_abilities": [],
    }


@api_router.post("/auth/guest")
async def guest(body: GuestBody, request: Request):
    """Name-only onboarding — creates a device-bound account with a friend code."""
    ip = client_ip(request)
    if is_public_ip(ip):
        await rl_enforce(f"guest:{ip}", C.RL_GUEST_LIMIT, C.RL_GUEST_WINDOW)
    ok, reason = check_username(body.username)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    user_id = str(uuid.uuid4())
    code = await generate_friend_code()
    doc = _new_user_doc(user_id, body.username.strip(), code)
    await db.users.insert_one(doc)
    return {"token": create_token(user_id), "user": public_user(doc)}


@api_router.post("/auth/register")
async def register(body: RegisterBody):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    code = await generate_friend_code()
    doc = _new_user_doc(user_id, body.username, code,
                        email=body.email.lower(), password_hash=hash_password(body.password))
    await db.users.insert_one(doc)
    return {"token": create_token(user_id), "user": public_user(doc)}


@api_router.post("/auth/login")
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": create_token(user["_id"]), "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": public_user(user)}


# ---------------------------------------------------------------------------
# Ads — after each match:
#   • MANDATORY interstitial on "Continue" once 3 min have passed since the
#     last ad (mandatory_due). Watching it just resets the cooldown.
#   • Optional DOUBLE-XP ad, offered at random by the client (reward_available):
#     watching grants double the match XP; skipping grants nothing.
# ---------------------------------------------------------------------------
def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


def _fullscreen_ad_state(user: dict) -> dict:
    """Return the state for naturally displayed interstitial ads.

    A successful rewarded ad also updates last_ad_at. This intentionally
    prevents a natural interstitial from appearing immediately after the
    player has watched a Double-XP ad.
    """
    last_fullscreen_ad_at = user.get("last_ad_at")

    elapsed = (
        _now_ts() - last_fullscreen_ad_at
        if last_fullscreen_ad_at is not None
        else None
    )

    interstitial_due = (
        elapsed is None
        or elapsed >= C.FULLSCREEN_AD_COOLDOWN_SEC
    )

    cooldown_remaining = (
        0
        if interstitial_due
        else max(
            0,
            round(C.FULLSCREEN_AD_COOLDOWN_SEC - elapsed),
        )
    )

    return {
        # Keep the existing API field name so the frontend does not break.
        "mandatory_due": interstitial_due,
        "cooldown_remaining": cooldown_remaining,
    }


def _rewarded_ad_state(user: dict) -> dict:
    """Return the state for the opt-in Double-XP rewarded ad."""
    reward = max(
        0,
        int(user.get("last_match_xp") or 0),
    )

    last_match_id = user.get("last_match_id")

    already_claimed = (
        last_match_id is not None
        and user.get("ad_claimed_for") == last_match_id
    )

    reward_available = (
        reward > 0
        and not already_claimed
    )

    return {
        "reward": reward,
        "reward_available": reward_available,

        # Retained for compatibility with older clients.
        "can_watch": reward_available,

        "already_claimed": already_claimed,
    }


def _ad_state(user: dict) -> dict:
    """Return the combined public ad status response."""
    return {
        **_fullscreen_ad_state(user),
        **_rewarded_ad_state(user),
    }


@api_router.get("/ads/status")
async def ads_status(user: dict = Depends(get_current_user)):
    return _ad_state(user)


@api_router.post("/ads/seen")
async def ads_seen(user: dict = Depends(get_current_user)):
    """Record that a (mandatory) ad was shown — resets the 3-minute cooldown."""
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_ad_at": _now_ts()}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return _ad_state(updated)


@api_router.post("/ads/reward")
async def ads_reward(user: dict = Depends(get_current_user)):
    reward_state = _rewarded_ad_state(user)
    if not reward_state["reward_available"]:
        raise HTTPException(status_code=400, detail="No reward available")
    reward = reward_state["reward"]
    new_xp = user.get("xp", 0) + reward
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$inc": {"xp": reward},
         "$set": {"last_ad_at": _now_ts(),
                  "ad_claimed_for": user.get("last_match_id"),
                  "level": C.level_for_xp(new_xp)}},
    )
    await db.users.update_one({"_id": user["_id"]}, S.season_award_ops(user, reward))
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"rewarded": reward, "user": public_user(updated)}


@api_router.post("/profile/name")
async def change_name(body: ChangeNameBody, user: dict = Depends(get_current_user)):
    ok, reason = check_username(body.username)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"username": body.username.strip()}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"user": public_user(updated)}


# ---------------------------------------------------------------------------
# Daily / weekly login rewards
# ---------------------------------------------------------------------------
def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _preview_reward(streak: int) -> dict:
    reward = C.DAILY_XP + min(streak, 7) * C.DAILY_STREAK_BONUS
    is_weekly = streak % 7 == 0
    if is_weekly:
        reward += C.WEEKLY_XP
    return {"reward": reward, "is_weekly": is_weekly}


@api_router.get("/rewards/status")
async def rewards_status(user: dict = Depends(get_current_user)):
    last = user.get("last_daily_claim")
    streak = user.get("daily_streak", 0)
    today = _today_iso()
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    can_claim = last != today
    next_streak = streak + 1 if last == yesterday else 1
    preview = _preview_reward(next_streak)
    return {
        "can_claim": can_claim,
        "current_streak": streak,
        "next_streak": next_streak,
        "next_reward": preview["reward"],
        "next_is_weekly": preview["is_weekly"],
    }


@api_router.post("/rewards/claim")
async def rewards_claim(user: dict = Depends(get_current_user)):
    last = user.get("last_daily_claim")
    streak = user.get("daily_streak", 0)
    today = _today_iso()
    if last == today:
        raise HTTPException(status_code=400, detail="Already claimed today")
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    new_streak = streak + 1 if last == yesterday else 1
    preview = _preview_reward(new_streak)
    reward = preview["reward"]
    new_xp = user.get("xp", 0) + reward
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$inc": {"xp": reward},
         "$set": {"last_daily_claim": today, "daily_streak": new_streak,
                  "level": C.level_for_xp(new_xp)}},
    )
    await db.users.update_one({"_id": user["_id"]}, S.season_award_ops(user, reward))
    updated = await db.users.find_one({"_id": user["_id"]})
    return {
        "claimed": reward,
        "streak": new_streak,
        "is_weekly": preview["is_weekly"],
        "user": public_user(updated),
    }


# ---------------------------------------------------------------------------
# Friends routes
# ---------------------------------------------------------------------------
def _friend_summary(u: dict) -> dict:
    prog = C.progression_snapshot(u.get("xp", 0))
    return {
        "id": u["_id"],
        "username": u["username"],
        "friend_code": u.get("friend_code"),
        "rank": prog["rank"],
        "level": prog["level"],
    }


@api_router.get("/friends")
async def get_friends(user: dict = Depends(get_current_user)):
    ids = user.get("friends", [])
    friends = []
    if ids:
        cursor = db.users.find({"_id": {"$in": ids}})
        friends = [_friend_summary(f) async for f in cursor]
    return {"friend_code": user.get("friend_code"), "friends": friends}


@api_router.post("/friends/add")
async def add_friend(body: FriendAddBody, user: dict = Depends(get_current_user)):
    code = body.code.strip().upper()
    if code == user.get("friend_code"):
        raise HTTPException(status_code=400, detail="That's your own code")
    target = await db.users.find_one({"friend_code": code})
    if not target:
        raise HTTPException(status_code=404, detail="No player with that code")
    if target["_id"] in user.get("friends", []):
        raise HTTPException(status_code=400, detail="Already friends")
    # mutual add
    await db.users.update_one({"_id": user["_id"]}, {"$addToSet": {"friends": target["_id"]}})
    await db.users.update_one({"_id": target["_id"]}, {"$addToSet": {"friends": user["_id"]}})
    return {"added": _friend_summary(target)}


# ---------------------------------------------------------------------------
# Profile / progression routes
# ---------------------------------------------------------------------------
@api_router.get("/profile")
async def profile(user: dict = Depends(get_current_user)):
    return {"user": public_user(user)}


@api_router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    return public_user(user)["stats"]


@api_router.get("/abilities")
async def abilities(user: dict = Depends(get_current_user)):
    equipped = user.get("equipped_ability")
    unlocked = set(user.get("unlocked_abilities") or [])
    return {
        "equipped": equipped,
        "abilities": [
            {**a, "unlocked": a["id"] in unlocked,
             "equipped": a["id"] == equipped}
            for a in C.ABILITIES
        ],
    }


@api_router.post("/profile/ability")
async def equip_ability(body: EquipAbilityBody, user: dict = Depends(get_current_user)):
    unlocked = set(user.get("unlocked_abilities") or [])
    if body.ability_id is not None:
        ab = C.ABILITY_BY_ID.get(body.ability_id)
        if not ab:
            raise HTTPException(status_code=404, detail="Ability not found")
        if body.ability_id not in unlocked:
            raise HTTPException(status_code=403, detail="Ability locked")
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"equipped_ability": body.ability_id}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"user": public_user(updated)}


@api_router.get("/cosmetics")
async def cosmetics(user: dict = Depends(get_current_user)):
    level = C.level_for_xp(user.get("xp", 0))
    equipped = user.get("equipped_cosmetics", dict(C.DEFAULT_COSMETICS))
    out = {}
    for category, items in C.COSMETICS.items():
        out[category] = [
            {**it, "unlocked": it["unlock_level"] <= level,
             "equipped": equipped.get(category) == it["id"]}
            for it in items
        ]
    return {"equipped": equipped, "categories": out}


@api_router.post("/profile/cosmetic")
async def equip_cosmetic(body: EquipCosmeticBody, user: dict = Depends(get_current_user)):
    level = C.level_for_xp(user.get("xp", 0))
    items = C.COSMETICS.get(body.category)
    if not items:
        raise HTTPException(status_code=404, detail="Category not found")
    item = next((i for i in items if i["id"] == body.item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item["unlock_level"] > level:
        raise HTTPException(status_code=403, detail="Item locked")
    equipped = user.get("equipped_cosmetics", dict(C.DEFAULT_COSMETICS))
    equipped[body.category] = body.item_id
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"equipped_cosmetics": equipped}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"user": public_user(updated)}


# ---------------------------------------------------------------------------
# Leaderboards
# ---------------------------------------------------------------------------
@api_router.get("/leaderboard")
async def leaderboard(scope: str = "global", period: str = "season",
                      user: dict = Depends(get_current_user)):
    season = period == "season"
    sid = S.current_season_id()
    sort_field = "season_xp" if season else "xp"
    query: dict = {}
    if scope == "friends":
        ids = list(set(user.get("friends", []) + [user["_id"]]))
        query["_id"] = {"$in": ids}
    if season:
        query["season_id"] = sid
    rows = []
    rank = 0
    cursor = db.users.find(
        query,
        {"_id": 1, "username": 1, "xp": 1, "season_xp": 1, "wins": 1, "season_id": 1},
    ).sort([(sort_field, -1), ("wins", -1)]).limit(100)
    async for u in cursor:
        rank += 1
        prog = C.progression_snapshot(u.get("xp", 0))
        rows.append({
            "rank": rank,
            "id": u["_id"],
            "username": u["username"],
            "level": prog["level"],
            "rank_name": prog["rank"],
            "score": u.get("season_xp", 0) if season else u.get("xp", 0),
            "xp": u.get("xp", 0),
            "wins": u.get("wins", 0),
            "is_me": u["_id"] == user["_id"],
        })
    my_rank = next((r["rank"] for r in rows if r["is_me"]), None)
    if my_rank is None and scope == "global":
        if season:
            if user.get("season_id") == sid:
                higher = await db.users.count_documents(
                    {"season_id": sid, "season_xp": {"$gt": user.get("season_xp", 0)}})
                my_rank = higher + 1
            # else: user hasn't scored this season -> unranked (None)
        else:
            higher = await db.users.count_documents({"xp": {"$gt": user.get("xp", 0)}})
            my_rank = higher + 1
    return {"scope": scope, "period": period, "rows": rows, "my_rank": my_rank,
            "season_id": sid, "reset_seconds": S.season_reset_seconds()}


# ---------------------------------------------------------------------------
# Daily challenges
# ---------------------------------------------------------------------------
@api_router.get("/challenges")
async def get_challenges(user: dict = Depends(get_current_user)):
    dc, changed = CH.ensure_today(user)
    if changed:
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"daily_challenges": dc}})
    return CH.public_challenges(dc)


@api_router.post("/challenges/claim/{challenge_id}")
async def claim_challenge(challenge_id: str, user: dict = Depends(get_current_user)):
    dc, changed = CH.ensure_today(user)
    spec = C.CHALLENGE_BY_ID.get(challenge_id)
    item = next((i for i in dc["items"] if i["id"] == challenge_id), None)
    if not spec or not item:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if item.get("progress", 0) < spec["goal"]:
        raise HTTPException(status_code=400, detail="Challenge not complete")
    if item.get("claimed"):
        raise HTTPException(status_code=400, detail="Already claimed")
    item["claimed"] = True
    reward = spec["reward"]
    new_xp = user.get("xp", 0) + reward
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$inc": {"xp": reward},
         "$set": {"daily_challenges": dc, "level": C.level_for_xp(new_xp)}},
    )
    await db.users.update_one({"_id": user["_id"]}, S.season_award_ops(user, reward))
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"claimed": reward, "user": public_user(updated),
            "challenges": CH.public_challenges(dc)}


@api_router.get("/challenges/recent")
async def recent_challenges(user: dict = Depends(get_current_user)):
    """Challenges completed by the user's most recent match (for the
    results-screen toast). Cleared implicitly on the next match."""
    return {"challenges": user.get("last_match_challenges", [])}


# ---------------------------------------------------------------------------
# Match routes
# ---------------------------------------------------------------------------
@api_router.post("/match/join")
async def match_join(user: dict = Depends(get_current_user)):
    await rl_enforce(f"join:{user['_id']}", C.RL_JOIN_LIMIT, C.RL_JOIN_WINDOW)
    icon = user.get("equipped_cosmetics", {}).get("icon", "skull")
    result = await manager.join(
        user["_id"], user["username"], user.get("equipped_ability"), icon,
        friends=set(user.get("friends", [])), rivals=set(user.get("rivals", [])),
    )
    return result


@api_router.post("/match/party/create")
async def party_create(user: dict = Depends(get_current_user)):
    await rl_enforce(f"party:{user['_id']}", C.RL_PARTY_LIMIT, C.RL_PARTY_WINDOW)
    icon = user.get("equipped_cosmetics", {}).get("icon", "skull")
    return await manager.create_party(
        user["_id"], user["username"], user.get("equipped_ability"), icon,
        friends=set(user.get("friends", [])), rivals=set(user.get("rivals", [])),
    )


class PartyJoinBody(BaseModel):
    code: str = Field(min_length=4, max_length=8)


@api_router.post("/match/party/join")
async def party_join(body: PartyJoinBody, user: dict = Depends(get_current_user)):
    await rl_enforce(f"pjoin:{user['_id']}", C.RL_PARTY_JOIN_LIMIT, C.RL_PARTY_JOIN_WINDOW)
    icon = user.get("equipped_cosmetics", {}).get("icon", "skull")
    result = await manager.join_party(
        body.code.strip().upper(), user["_id"], user["username"],
        user.get("equipped_ability"), icon,
        friends=set(user.get("friends", [])), rivals=set(user.get("rivals", [])),
    )
    if result.get("error"):
        raise HTTPException(status_code=404, detail="Party not found or already started")
    return result


@api_router.get("/match/{match_id}/state")
async def match_state(match_id: str, user: dict = Depends(get_current_user)):
    match = manager.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match.state_for(user["_id"])


@api_router.post("/match/{match_id}/press")
async def match_press(match_id: str, body: PressBody, user: dict = Depends(get_current_user)):
    await rl_enforce(f"press:{user['_id']}", C.RL_PRESS_LIMIT, C.RL_PRESS_WINDOW)
    match = manager.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    pid = match.user_index.get(user["_id"])
    if not pid:
        raise HTTPException(status_code=403, detail="Not in this match")
    async with match.lock:
        outcome = match.resolve_press(pid, body.use_ability)
    if outcome is None:
        raise HTTPException(status_code=409, detail="Cannot press right now")
    await match.broadcast()
    return {"outcome": outcome, "state": match.state_for(user["_id"])}


@api_router.post("/match/{match_id}/start")
async def match_start(match_id: str, user: dict = Depends(get_current_user)):
    match = manager.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if user["_id"] not in match.user_index:
        raise HTTPException(status_code=403, detail="Not in this match")
    if match.phase == "lobby":
        match.start_at = 0.0  # run loop starts the match on its next tick
    return {"ok": True}


@api_router.post("/match/{match_id}/leave")
async def match_leave(match_id: str, user: dict = Depends(get_current_user)):
    match = manager.get(match_id)
    if not match:
        return {"ok": True}
    pid = match.user_index.get(user["_id"])
    if pid:
        async with match.lock:
            p = match.players.get(pid)
            if p and p.alive and match.phase == "active":
                match._eliminate(p, killer=None, self_elim=False)
                match._check_end()
        await match.broadcast()
    return {"ok": True}


@api_router.websocket("/match/{match_id}/ws")
async def match_ws(websocket: WebSocket, match_id: str, token: str = Query(None)):
    """Real-time match transport. Auth via ?token= (JWT). Server pushes a
    personalized state snapshot on every meaningful change; the client falls
    back to HTTP polling if the socket can't be established."""
    try:
        payload = jwt.decode(token or "", JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return
    match = manager.get(match_id)
    if not match or not user_id:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    match.ws_conns[websocket] = user_id
    try:
        await websocket.send_json(match.state_for(user_id))
        while True:
            # We don't expect client messages; receive() detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        match.ws_conns.pop(websocket, None)


@api_router.get("/")
async def root():
    return {"message": "Panic Button API", "status": "online"}


app.include_router(api_router)
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
