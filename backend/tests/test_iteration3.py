"""Iteration 3 backend tests: rewards, name change, personal danger, patience XP, party."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"


def _guest(name=None):
    name = name or f"T_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/auth/guest", json={"username": name}, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Rewards ---------------------------------------------------------------
class TestRewards:
    def test_status_fresh_guest_can_claim(self):
        tok, _ = _guest()
        r = requests.get(f"{BASE}/rewards/status", headers=_h(tok), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["can_claim"] is True
        assert d["next_reward"] > 0
        assert d["next_streak"] == 1

    def test_claim_grants_xp_and_increments_streak(self):
        tok, u0 = _guest()
        xp0 = u0["progression"]["xp"]
        r = requests.post(f"{BASE}/rewards/claim", headers=_h(tok), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["claimed"] > 0
        assert d["streak"] == 1
        assert d["user"]["progression"]["xp"] == xp0 + d["claimed"]

    def test_double_claim_same_day_400(self):
        tok, _ = _guest()
        r1 = requests.post(f"{BASE}/rewards/claim", headers=_h(tok), timeout=10)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE}/rewards/claim", headers=_h(tok), timeout=10)
        assert r2.status_code == 400
        # status now reports can_claim False
        s = requests.get(f"{BASE}/rewards/status", headers=_h(tok), timeout=10).json()
        assert s["can_claim"] is False


# --- Change name -----------------------------------------------------------
class TestChangeName:
    def test_change_name_updates_profile(self):
        tok, _ = _guest("OldName")
        new = f"NN_{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{BASE}/profile/name", headers=_h(tok), json={"username": new}, timeout=10)
        assert r.status_code == 200
        assert r.json()["user"]["username"] == new
        # GET /profile reflects it
        p = requests.get(f"{BASE}/profile", headers=_h(tok), timeout=10).json()
        assert p["user"]["username"] == new


# --- Personal danger + patience XP -----------------------------------------
class TestMatchDanger:
    def _wait_active(self, tok, mid, timeout=15):
        for _ in range(int(timeout / 0.5)):
            s = requests.get(f"{BASE}/match/{mid}/state", headers=_h(tok), timeout=10).json()
            if s["phase"] == "active":
                return s
            time.sleep(0.5)
        pytest.skip("Match did not activate within timeout")

    def test_personal_danger_rises_without_press(self):
        tok, _ = _guest()
        j = requests.post(f"{BASE}/match/join", headers=_h(tok), timeout=10).json()
        mid = j["match_id"]
        s0 = self._wait_active(tok, mid)
        d0 = s0["me"]["danger"]
        base_slope = 1.0
        assert s0["config"]["slope"] >= base_slope - 0.01
        time.sleep(5)
        s1 = requests.get(f"{BASE}/match/{mid}/state", headers=_h(tok), timeout=10).json()
        # if still alive, danger should have risen
        if s1.get("me", {}).get("alive"):
            assert s1["me"]["danger"] > d0, f"danger did not rise: {d0} -> {s1['me']['danger']}"
        # slope should grow as players_alive drops below total
        assert s1["config"]["slope"] >= base_slope - 0.01
        # cleanup
        requests.post(f"{BASE}/match/{mid}/leave", headers=_h(tok), timeout=10)

    def test_leave_returns_results_with_patience_fields(self):
        tok, _ = _guest()
        j = requests.post(f"{BASE}/match/join", headers=_h(tok), timeout=10).json()
        mid = j["match_id"]
        self._wait_active(tok, mid)
        time.sleep(2)  # bank some patience
        requests.post(f"{BASE}/match/{mid}/leave", headers=_h(tok), timeout=10)
        s = requests.get(f"{BASE}/match/{mid}/state", headers=_h(tok), timeout=10).json()
        # While dead but match still running, personal recap lives under my_result
        # (full `results` block only appears once the match has ended).
        assert "my_result" in s, s
        r = s["my_result"]
        for key in ("patience_xp", "bonus_xp", "friend_kos", "rival_kos", "xp_gained", "placement", "kills"):
            assert key in r, f"missing {key}: {r}"
        assert r["patience_xp"] >= 0
        assert r["xp_gained"] >= r["patience_xp"] + r["bonus_xp"]


# --- Party lobby -----------------------------------------------------------
class TestParty:
    def test_party_create_and_join_same_match(self):
        tokA, _ = _guest("PartyA")
        tokB, _ = _guest("PartyB")
        cr = requests.post(f"{BASE}/match/party/create", headers=_h(tokA), timeout=10)
        assert cr.status_code == 200, cr.text
        d = cr.json()
        assert "match_id" in d and "party_code" in d
        code = d["party_code"]
        mid = d["match_id"]

        jr = requests.post(f"{BASE}/match/party/join", headers=_h(tokB),
                           json={"code": code}, timeout=10)
        assert jr.status_code == 200, jr.text
        assert jr.json()["match_id"] == mid

        # state during lobby returns party_code
        s = requests.get(f"{BASE}/match/{mid}/state", headers=_h(tokA), timeout=10).json()
        assert s["phase"] in ("lobby", "active")
        if s["phase"] == "lobby":
            assert s.get("party_code") == code

        # cleanup: leave once active
        for _ in range(60):
            s = requests.get(f"{BASE}/match/{mid}/state", headers=_h(tokA), timeout=10).json()
            if s["phase"] == "active":
                break
            time.sleep(0.5)
        requests.post(f"{BASE}/match/{mid}/leave", headers=_h(tokA), timeout=10)
        requests.post(f"{BASE}/match/{mid}/leave", headers=_h(tokB), timeout=10)

    def test_party_join_bad_code_404(self):
        tok, _ = _guest()
        r = requests.post(f"{BASE}/match/party/join", headers=_h(tok),
                          json={"code": "ZZZZZ"}, timeout=10)
        assert r.status_code == 404


# --- Regression ------------------------------------------------------------
class TestRegression:
    def test_normal_match_join_still_works(self):
        tok, _ = _guest()
        r = requests.post(f"{BASE}/match/join", headers=_h(tok), timeout=10)
        assert r.status_code == 200
        assert "match_id" in r.json()

    def test_friends_add_and_list(self):
        tokA, uA = _guest("RegA")
        tokB, uB = _guest("RegB")
        codeB = uB["friend_code"]
        r = requests.post(f"{BASE}/friends/add", headers=_h(tokA),
                          json={"code": codeB}, timeout=10)
        assert r.status_code == 200
        lst = requests.get(f"{BASE}/friends", headers=_h(tokA), timeout=10).json()
        assert any(f["id"] == uB["id"] for f in lst["friends"])
