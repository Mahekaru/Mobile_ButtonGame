"""End-to-end backend tests for Panic Button API.

Covers auth, profile/progression, abilities, cosmetics, stats and the
in-memory server-authoritative match flow (join -> lobby -> active -> press
-> leave / persistence).
"""
import os
import time
import uuid

import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api" \
    if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else \
    "https://button-royale-pvp.preview.emergentagent.com/api"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def fresh_user(s):
    """Register a fresh user for isolated tests."""
    email = f"TEST_{uuid.uuid4().hex[:8]}@panictest.io"
    pw = "Test1234"
    r = s.post(f"{BASE}/auth/register",
               json={"email": email, "username": f"TU{uuid.uuid4().hex[:4]}",
                     "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "password": pw, "token": d["token"], "user": d["user"]}


def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TestAuth:
    def test_register(self, fresh_user):
        u = fresh_user["user"]
        assert "id" in u and u["email"].startswith("test_")
        assert u["progression"]["level"] == 1
        assert u["stats"]["matches_played"] == 0

    def test_duplicate_register(self, s, fresh_user):
        r = s.post(f"{BASE}/auth/register",
                   json={"email": fresh_user["email"], "username": "Dup",
                         "password": "Test1234"})
        assert r.status_code == 400

    def test_login(self, s, fresh_user):
        r = s.post(f"{BASE}/auth/login",
                   json={"email": fresh_user["email"], "password": fresh_user["password"]})
        assert r.status_code == 200 and "token" in r.json()

    def test_login_bad(self, s, fresh_user):
        r = s.post(f"{BASE}/auth/login",
                   json={"email": fresh_user["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, s, fresh_user):
        r = s.get(f"{BASE}/auth/me", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        assert r.json()["user"]["id"] == fresh_user["user"]["id"]

    def test_me_no_auth(self, s):
        r = s.get(f"{BASE}/auth/me")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Profile / stats
# ---------------------------------------------------------------------------
class TestProfile:
    def test_profile(self, s, fresh_user):
        r = s.get(f"{BASE}/profile", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        u = r.json()["user"]
        for k in ("progression", "stats", "unlocked_abilities", "equipped_cosmetics"):
            assert k in u
        assert u["progression"]["rank"] == "Rookie"

    def test_stats(self, s, fresh_user):
        r = s.get(f"{BASE}/stats", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["matches_played"] == 0 and d["wins"] == 0


# ---------------------------------------------------------------------------
# Abilities
# ---------------------------------------------------------------------------
class TestAbilities:
    def test_list(self, s, fresh_user):
        r = s.get(f"{BASE}/abilities", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        d = r.json()
        assert len(d["abilities"]) == 4
        # At level 1, all abilities locked
        assert all(not a["unlocked"] for a in d["abilities"])

    def test_equip_locked_forbidden(self, s, fresh_user):
        r = s.post(f"{BASE}/profile/ability", json={"ability_id": "second_chance"},
                   headers=auth_h(fresh_user["token"]))
        assert r.status_code == 403

    def test_unequip_ok(self, s, fresh_user):
        r = s.post(f"{BASE}/profile/ability", json={"ability_id": None},
                   headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        assert r.json()["user"]["equipped_ability"] is None

    def test_equip_bad_id(self, s, fresh_user):
        r = s.post(f"{BASE}/profile/ability", json={"ability_id": "nope"},
                   headers=auth_h(fresh_user["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Cosmetics
# ---------------------------------------------------------------------------
class TestCosmetics:
    def test_list(self, s, fresh_user):
        r = s.get(f"{BASE}/cosmetics", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        d = r.json()
        assert "button_skin" in d["categories"]

    def test_equip_unlocked(self, s, fresh_user):
        # 'classic' unlocks at level 1
        r = s.post(f"{BASE}/profile/cosmetic",
                   json={"category": "button_skin", "item_id": "classic"},
                   headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        assert r.json()["user"]["equipped_cosmetics"]["button_skin"] == "classic"

    def test_equip_locked(self, s, fresh_user):
        # 'gold' unlocks at level 8
        r = s.post(f"{BASE}/profile/cosmetic",
                   json={"category": "button_skin", "item_id": "gold"},
                   headers=auth_h(fresh_user["token"]))
        assert r.status_code == 403

    def test_bad_category(self, s, fresh_user):
        r = s.post(f"{BASE}/profile/cosmetic",
                   json={"category": "nope", "item_id": "x"},
                   headers=auth_h(fresh_user["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Match flow
# ---------------------------------------------------------------------------
class TestMatch:
    def _join(self, s, token):
        r = s.post(f"{BASE}/match/join", headers=auth_h(token))
        assert r.status_code == 200, r.text
        return r.json()["match_id"]

    def _wait_active(self, s, token, mid, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = s.get(f"{BASE}/match/{mid}/state", headers=auth_h(token))
            assert r.status_code == 200
            st = r.json()
            if st["phase"] == "active":
                return st
            time.sleep(0.6)
        pytest.fail(f"Match did not reach active phase: {st}")

    def test_join_and_state(self, s, fresh_user):
        mid = self._join(s, fresh_user["token"])
        r = s.get(f"{BASE}/match/{mid}/state", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        st = r.json()
        assert st["phase"] in ("lobby", "active")
        assert "me" in st and st["me"]["alive"] is True
        # cleanup
        s.post(f"{BASE}/match/{mid}/leave", headers=auth_h(fresh_user["token"]))

    def test_state_not_found(self, s, fresh_user):
        r = s.get(f"{BASE}/match/nope-xxxx/state", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 404

    def test_active_backfill_and_press(self, s, fresh_user):
        mid = self._join(s, fresh_user["token"])
        st = self._wait_active(s, fresh_user["token"], mid)
        assert st["players_total"] == 100
        assert st["players_alive"] <= 100 and st["players_alive"] > 0

        # Press up to 3 times; may 409 if already dead
        outcomes = []
        for _ in range(3):
            r = s.post(f"{BASE}/match/{mid}/press", json={"use_ability": False},
                       headers=auth_h(fresh_user["token"]))
            if r.status_code == 409:
                break
            assert r.status_code == 200, r.text
            outcomes.append(r.json()["outcome"])
            time.sleep(0.4)
        # feed should show eliminations after some presses
        r = s.get(f"{BASE}/match/{mid}/state", headers=auth_h(fresh_user["token"]))
        st2 = r.json()
        assert st2["players_alive"] < 100
        # cleanup
        s.post(f"{BASE}/match/{mid}/leave", headers=auth_h(fresh_user["token"]))

    def test_progression_persistence_after_leave(self, s):
        """Register a new user, join a match, leave, verify stats updated."""
        # Create fresh user for this test
        email = f"TEST_{uuid.uuid4().hex[:8]}@panictest.io"
        r = s.post(f"{BASE}/auth/register",
                   json={"email": email, "username": f"TP{uuid.uuid4().hex[:4]}",
                         "password": "Test1234"})
        assert r.status_code == 200
        tok = r.json()["token"]

        before = s.get(f"{BASE}/profile", headers=auth_h(tok)).json()["user"]
        assert before["stats"]["matches_played"] == 0

        mid = self._join(s, tok)
        self._wait_active(s, tok, mid)
        # Leave to force persistence
        r = s.post(f"{BASE}/match/{mid}/leave", headers=auth_h(tok))
        assert r.status_code == 200

        # persistence is scheduled as a task; give it a moment
        for _ in range(10):
            time.sleep(0.4)
            after = s.get(f"{BASE}/profile", headers=auth_h(tok)).json()["user"]
            if after["stats"]["matches_played"] == 1:
                break
        else:
            pytest.fail(f"Stats not persisted after leave: {after}")

        assert after["stats"]["matches_played"] == 1
        assert after["progression"]["xp"] > 0
