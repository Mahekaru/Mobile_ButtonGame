"""Iteration 6 — verifies:
  1. New ad model: {mandatory_due, cooldown_remaining, reward, reward_available, ...}
     - Fresh guest: mandatory_due=True, reward=0, reward_available=False
     - After join+leave: reward>0, reward_available=True, mandatory_due=True
     - /ads/seen sets 3-min cooldown -> mandatory_due=False, cooldown_remaining~180
     - /ads/reward claims double-XP -> reward_available=False, mandatory_due=False; second call -> 400
  2. Eased rank curve: rank_threshold(2)=800, rank_threshold(5)=3300
     - Compute XP for a single average match is small (<200) -> no multi-level jump
  3. Abilities catalog: /abilities returns 10 items including hide/overcharge/adrenaline/steady
  4. Equipping new active abilities (once unlocked via direct XP bump in DB) succeeds
  5. Match with new abilities completes without server error
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path("/app/backend/.env"))

BASE = "https://pressure-battle-1.preview.emergentagent.com/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _guest(prefix="I6"):
    name = f"{prefix}_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/auth/guest", json={"username": name[:16]}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user"]


def _wait_active(tok, mid, deadline_s=25):
    end = time.time() + deadline_s
    while time.time() < end:
        s = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15).json()
        if s.get("phase") == "active":
            return s
        time.sleep(0.7)
    raise AssertionError("match never became active")


def _play_and_leave(tok):
    r = requests.post(f"{BASE}/match/join", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    mid = r.json()["match_id"]
    _wait_active(tok, mid)
    time.sleep(1.2)
    r = requests.post(f"{BASE}/match/{mid}/leave", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    time.sleep(1.5)
    return mid


# ---------------------------------------------------------------------------
# 1. New ad model
# ---------------------------------------------------------------------------
class TestAdModel:
    def test_fresh_guest_status_shape(self):
        tok, _ = _guest("AdFresh")
        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        for k in ("mandatory_due", "cooldown_remaining", "reward",
                  "reward_available", "can_watch", "already_claimed"):
            assert k in s, f"missing key {k}"
        assert s["mandatory_due"] is True
        assert s["reward"] == 0
        assert s["reward_available"] is False
        assert s["cooldown_remaining"] == 0
        assert s["already_claimed"] is False

    def test_after_match_reward_available_but_mandatory_still_due(self):
        tok, _ = _guest("AdM1")
        _play_and_leave(tok)
        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s["reward"] > 0, s
        assert s["reward_available"] is True
        assert s["mandatory_due"] is True  # no ad seen yet
        assert s["already_claimed"] is False

    def test_ads_seen_starts_cooldown(self):
        tok, _ = _guest("AdSeen")
        r = requests.post(f"{BASE}/ads/seen", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["mandatory_due"] is False
        assert 170 <= s["cooldown_remaining"] <= 180

        # status again keeps mandatory_due False
        s2 = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s2["mandatory_due"] is False
        assert s2["cooldown_remaining"] > 0

    def test_reward_after_seen_still_claimable(self):
        # Order: match -> ads/seen (cooldown active, no reward yet claimed)
        #        -> reward available should still be True
        tok, _ = _guest("AdSR")
        _play_and_leave(tok)
        s0 = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s0["reward_available"] is True

        requests.post(f"{BASE}/ads/seen", headers=_hdr(tok), timeout=15)
        s1 = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s1["mandatory_due"] is False
        assert s1["cooldown_remaining"] > 0
        # reward_available is independent of cooldown as long as not claimed
        assert s1["reward_available"] is True

    def test_ads_reward_double_xp_and_second_fails(self):
        tok, _ = _guest("AdRw")
        _play_and_leave(tok)
        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        reward = s["reward"]
        assert reward > 0

        me = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
        xp_before = me["progression"]["xp"]

        r = requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["rewarded"] == reward
        assert body["user"]["progression"]["xp"] == xp_before + reward

        s2 = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s2["reward_available"] is False
        assert s2["already_claimed"] is True
        # Reward also resets cooldown (mandatory_due=False)
        assert s2["mandatory_due"] is False

        r2 = requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15)
        assert r2.status_code == 400


# ---------------------------------------------------------------------------
# 2. XP curve
# ---------------------------------------------------------------------------
class TestXpCurve:
    def test_thresholds_via_daily_reward(self):
        """Daily claim +125 XP should NOT reach L2 (threshold=200 now)."""
        tok, _ = _guest("XpDay")
        r = requests.post(f"{BASE}/rewards/claim", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        prog = r.json()["user"]["progression"]
        assert prog["xp"] == 125
        assert prog["level"] == 1, f"expected L1 with 125 xp (L2=800), got {prog}"
        assert prog["xp_for_next"] == 800  # rank_threshold(2)

    def test_single_match_xp_is_small(self):
        """A single average match should not bump multiple levels."""
        tok, _ = _guest("XpMatch")
        _play_and_leave(tok)
        me = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
        # Leave in the middle -> low xp; strictly < 200 keeps us at L1
        assert me["progression"]["level"] == 1
        assert 0 < me["progression"]["xp"] < 200, me["progression"]

    def test_math_via_direct_xp_bump(self):
        """rank_threshold(5) should equal 3300; below it stays L4."""
        assert MONGO_URL and DB_NAME
        tok, u = _guest("XpBump")
        cli = MongoClient(MONGO_URL)
        try:
            cli[DB_NAME].users.update_one({"_id": u["id"]}, {"$set": {"xp": 3299, "level": 4}})
            me = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
            assert me["progression"]["level"] == 4  # not yet L5

            cli[DB_NAME].users.update_one({"_id": u["id"]}, {"$set": {"xp": 3300}})
            me = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
            assert me["progression"]["level"] == 5
        finally:
            cli.close()


# ---------------------------------------------------------------------------
# 3. Abilities catalog
# ---------------------------------------------------------------------------
class TestAbilitiesCatalog:
    def test_returns_eight_abilities_with_new_actives(self):
        tok, _ = _guest("AbCat")
        d = requests.get(f"{BASE}/abilities", headers=_hdr(tok), timeout=15).json()
        ids = {a["id"] for a in d["abilities"]}
        assert len(d["abilities"]) == 10, ids
        for req in ("second_chance", "lucky_press", "deflect", "double_tap",
                    "hide", "overcharge", "adrenaline", "steady"):
            assert req in ids, f"missing ability {req}"

    def test_new_abilities_unlock_levels_and_type(self):
        tok, _ = _guest("AbLvl")
        d = requests.get(f"{BASE}/abilities", headers=_hdr(tok), timeout=15).json()
        by_id = {a["id"]: a for a in d["abilities"]}
        assert by_id["hide"]["unlock_level"] == 14 and by_id["hide"]["type"] == "active"
        assert by_id["overcharge"]["unlock_level"] == 22 and by_id["overcharge"]["type"] == "active"
        assert by_id["adrenaline"]["unlock_level"] == 33 and by_id["adrenaline"]["type"] == "active"
        assert by_id["steady"]["unlock_level"] == 40 and by_id["steady"]["type"] == "active"
        # locked for a fresh guest
        for k in ("hide", "overcharge", "adrenaline", "steady"):
            assert by_id[k]["unlocked"] is False


# ---------------------------------------------------------------------------
# 4/5. Equip new abilities (bump level in Mongo) + match completes
# ---------------------------------------------------------------------------
def _bump_level(user_id, xp):
    cli = MongoClient(MONGO_URL)
    try:
        cli[DB_NAME].users.update_one({"_id": user_id}, {"$set": {"xp": xp}})
    finally:
        cli.close()


@pytest.mark.parametrize("ability,min_xp", [
    ("hide", 12300),         # L14
    ("overcharge", 20800),   # L22
    ("adrenaline", 31500),   # L33
    ("steady", 40000),       # L40
])
class TestNewAbilityEquipAndMatch:
    def test_equip_after_unlock(self, ability, min_xp):
        assert MONGO_URL and DB_NAME
        tok, u = _guest(f"Eq_{ability[:3]}")
        _bump_level(u["id"], min_xp)
        r = requests.post(f"{BASE}/profile/ability", headers=_hdr(tok),
                          json={"ability_id": ability}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["equipped_ability"] == ability

    def test_match_completes_with_ability(self, ability, min_xp):
        """Join a match with the ability, press once with use_ability=True,
        leave. Verify no 5xx and state serializes fine."""
        tok, u = _guest(f"Play_{ability[:3]}")
        _bump_level(u["id"], min_xp)
        r = requests.post(f"{BASE}/profile/ability", headers=_hdr(tok),
                          json={"ability_id": ability}, timeout=15)
        assert r.status_code == 200

        r = requests.post(f"{BASE}/match/join", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        mid = r.json()["match_id"]
        _wait_active(tok, mid)

        # try to press using the ability
        pr = requests.post(f"{BASE}/match/{mid}/press", headers=_hdr(tok),
                           json={"use_ability": True}, timeout=15)
        # 200 outcome, or 409 if we already died from a prior tick; NEVER 5xx
        assert pr.status_code in (200, 409), pr.text
        if pr.status_code == 200:
            out = pr.json().get("outcome", {})
            if ability == "hide":
                # hide: press-safe
                assert out.get("self_death") is False
            if ability == "overcharge":
                # noted in ability field
                assert out.get("ability") in ("overcharge", None)

        # state should still serialize
        st = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15)
        assert st.status_code == 200
        st.json()  # not raising = fine

        requests.post(f"{BASE}/match/{mid}/leave", headers=_hdr(tok), timeout=15)
        time.sleep(1.2)
