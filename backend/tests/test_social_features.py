"""Iteration 2 backend tests: guest onboarding, friends, rivals, match co-lobby,
results payload shape, and progression persistence after leave.
"""
import os
import time
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
        or "https://panic-4.preview.emergentagent.com").rstrip("/") + "/api"


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _guest(s, name=None):
    name = name or f"G{uuid.uuid4().hex[:6]}"
    r = s.post(f"{BASE}/auth/guest", json={"username": name})
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ---------------------------------------------------------------- guest onboarding
class TestGuest:
    def test_guest_creates_user_with_friend_code(self, s):
        tok, u = _guest(s)
        assert tok and isinstance(u["friend_code"], str)
        assert len(u["friend_code"]) == 6
        assert u["friends_count"] == 0
        assert u["email"] is None
        assert u["progression"]["level"] == 1

    def test_guest_me_and_profile_expose_friend_code(self, s):
        tok, u = _guest(s)
        me = s.get(f"{BASE}/auth/me", headers=h(tok)).json()["user"]
        assert me["friend_code"] == u["friend_code"]
        assert me["friends_count"] == 0
        prof = s.get(f"{BASE}/profile", headers=h(tok)).json()["user"]
        assert prof["friend_code"] == u["friend_code"]
        assert "friends_count" in prof

    def test_guest_username_min_length(self, s):
        r = s.post(f"{BASE}/auth/guest", json={"username": "A"})
        assert r.status_code == 422


# ---------------------------------------------------------------- friends
class TestFriends:
    def test_get_friends_empty(self, s):
        tok, u = _guest(s)
        r = s.get(f"{BASE}/friends", headers=h(tok))
        assert r.status_code == 200
        d = r.json()
        assert d["friend_code"] == u["friend_code"]
        assert d["friends"] == []

    def test_mutual_add(self, s):
        tok_a, ua = _guest(s)
        tok_b, ub = _guest(s)
        # A adds B by B's code
        r = s.post(f"{BASE}/friends/add", json={"code": ub["friend_code"]},
                   headers=h(tok_a))
        assert r.status_code == 200, r.text
        added = r.json()["added"]
        assert added["id"] == ub["id"]

        # Both sides see each other
        la = s.get(f"{BASE}/friends", headers=h(tok_a)).json()["friends"]
        lb = s.get(f"{BASE}/friends", headers=h(tok_b)).json()["friends"]
        assert any(f["id"] == ub["id"] for f in la)
        assert any(f["id"] == ua["id"] for f in lb)

        # friends_count updated on profile
        pa = s.get(f"{BASE}/profile", headers=h(tok_a)).json()["user"]
        pb = s.get(f"{BASE}/profile", headers=h(tok_b)).json()["user"]
        assert pa["friends_count"] == 1 and pb["friends_count"] == 1

    def test_add_own_code_400(self, s):
        tok, u = _guest(s)
        r = s.post(f"{BASE}/friends/add", json={"code": u["friend_code"]},
                   headers=h(tok))
        assert r.status_code == 400

    def test_add_unknown_code_404(self, s):
        tok, _ = _guest(s)
        r = s.post(f"{BASE}/friends/add", json={"code": "ZZZZZZ"},
                   headers=h(tok))
        assert r.status_code == 404

    def test_add_twice_400(self, s):
        tok_a, _ = _guest(s)
        tok_b, ub = _guest(s)
        r1 = s.post(f"{BASE}/friends/add", json={"code": ub["friend_code"]},
                    headers=h(tok_a))
        assert r1.status_code == 200
        r2 = s.post(f"{BASE}/friends/add", json={"code": ub["friend_code"]},
                    headers=h(tok_a))
        assert r2.status_code == 400

    def test_add_case_insensitive(self, s):
        tok_a, _ = _guest(s)
        tok_b, ub = _guest(s)
        r = s.post(f"{BASE}/friends/add",
                   json={"code": ub["friend_code"].lower()},
                   headers=h(tok_a))
        assert r.status_code == 200


# ---------------------------------------------------------------- match: two humans same lobby
class TestCoLobby:
    def test_two_guests_share_match(self, s):
        tok_a, _ = _guest(s)
        tok_b, _ = _guest(s)
        r1 = s.post(f"{BASE}/match/join", headers=h(tok_a))
        r2 = s.post(f"{BASE}/match/join", headers=h(tok_b))
        assert r1.status_code == 200 and r2.status_code == 200
        mid_a = r1.json()["match_id"]
        mid_b = r2.json()["match_id"]
        assert mid_a == mid_b, f"Guests placed in different matches: {mid_a} vs {mid_b}"

        # Before bot backfill, humans>=2 in lobby state
        st = s.get(f"{BASE}/match/{mid_a}/state", headers=h(tok_a)).json()
        assert st["match_id"] == mid_a
        # Either still in lobby (humans>=2) or already active (backfilled)
        if st["phase"] == "lobby":
            assert st["humans"] >= 2
        # cleanup
        s.post(f"{BASE}/match/{mid_a}/leave", headers=h(tok_a))
        s.post(f"{BASE}/match/{mid_b}/leave", headers=h(tok_b))


# ---------------------------------------------------------------- results payload shape + persistence
class TestResultsAndPersistence:
    def _wait_active(self, s, tok, mid, timeout=14):
        deadline = time.time() + timeout
        while time.time() < deadline:
            st = s.get(f"{BASE}/match/{mid}/state", headers=h(tok)).json()
            if st["phase"] == "active":
                return st
            time.sleep(0.5)
        pytest.fail(f"never active: {st}")

    def test_results_shape_after_leave(self, s):
        tok, _ = _guest(s)
        before = s.get(f"{BASE}/profile", headers=h(tok)).json()["user"]
        assert before["stats"]["matches_played"] == 0
        before_xp = before["progression"]["xp"]

        mid = s.post(f"{BASE}/match/join", headers=h(tok)).json()["match_id"]
        self._wait_active(s, tok, mid)

        # Leave (self-eliminates in active phase)
        r = s.post(f"{BASE}/match/{mid}/leave", headers=h(tok))
        assert r.status_code == 200

        # State should now include results
        st = None
        deadline = time.time() + 5
        while time.time() < deadline:
            st = s.get(f"{BASE}/match/{mid}/state", headers=h(tok)).json()
            if st.get("results"):
                break
            time.sleep(0.3)
        assert st and st.get("results"), f"no results in state: {st}"
        res = st["results"]
        # verify required recap-card fields
        for k in ("won", "placement", "kills", "xp_gained",
                  "bonus_xp", "friend_kos", "rival_kos", "ko_names"):
            assert k in res, f"missing field {k}: {res}"
        assert isinstance(res["ko_names"], list)
        assert isinstance(res["friend_kos"], int)
        assert isinstance(res["rival_kos"], int)
        assert res["xp_gained"] >= res["bonus_xp"]

        # profile progression persisted
        after = None
        for _ in range(15):
            after = s.get(f"{BASE}/profile", headers=h(tok)).json()["user"]
            if after["stats"]["matches_played"] == 1:
                break
            time.sleep(0.4)
        assert after["stats"]["matches_played"] == 1, after
        assert after["progression"]["xp"] > before_xp
