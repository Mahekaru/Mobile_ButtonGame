"""Iteration 4 — Rewarded ad flow (double XP after match + 3-min cooldown).

Uses the PUBLIC HTTPS base for user-visible parity. All auth is guest.
"""
import time
import pytest
import requests

BASE = "https://panic-ranks.preview.emergentagent.com/api"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _guest(name_prefix="TEST_AdUser"):
    r = requests.post(f"{BASE}/auth/guest",
                      json={"username": f"{name_prefix}_{int(time.time()*1000)%10_000_000}"[:16]},
                      timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _play_and_leave(tok):
    """Join match, wait for phase='active', leave -> populates last_match_xp."""
    r = requests.post(f"{BASE}/match/join", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    mid = r.json()["match_id"]
    # Lobby countdown is 8s; poll until active or up to ~20s
    deadline = time.time() + 25
    active = False
    while time.time() < deadline:
        s = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15).json()
        if s.get("phase") == "active":
            active = True
            break
        time.sleep(0.7)
    assert active, "Match never reached active phase"
    # Wait a beat so patience_xp is nonzero, then leave.
    time.sleep(1.5)
    r = requests.post(f"{BASE}/match/{mid}/leave", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    # Give the persist_player task a moment to write last_match_xp
    time.sleep(1.5)
    return mid


# ---------------------------------------------------------------------------
# Ads: status + reward
# ---------------------------------------------------------------------------
class TestAdsFresh:
    def test_status_fresh_guest_cannot_watch(self):
        tok, _ = _guest()
        r = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["can_watch"] is False
        assert s["reward"] == 0
        assert s["cooldown_remaining"] == 0
        assert s["already_claimed"] is False

    def test_reward_without_match_returns_400(self):
        tok, _ = _guest()
        r = requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15)
        assert r.status_code == 400


class TestAdsAfterMatch:
    def test_status_after_match_can_watch(self):
        tok, _ = _guest()
        _play_and_leave(tok)
        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s["can_watch"] is True, s
        assert s["reward"] > 0, s
        assert s["cooldown_remaining"] == 0
        assert s["already_claimed"] is False

        # And reward equals persisted last_match_xp (via profile)
        me = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
        # xp is total xp; last_match_xp is not exposed publicly, but reward == last_match_xp
        # so reward should equal the xp that was gained (since baseline xp was 0)
        assert s["reward"] == me["progression"]["xp"], (s, me["progression"])

    def test_claim_grants_double_xp_and_sets_cooldown(self):
        tok, _ = _guest()
        _play_and_leave(tok)
        me_before = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
        xp_before = me_before["progression"]["xp"]

        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s["can_watch"] is True
        reward = s["reward"]
        assert reward > 0

        r = requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["rewarded"] == reward
        # user.xp incremented by exactly `reward` (i.e. DOUBLE the match XP once combined)
        assert body["user"]["progression"]["xp"] == xp_before + reward

        # Status after claim: cooldown active, cannot watch
        s2 = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s2["can_watch"] is False, s2
        assert 0 < s2["cooldown_remaining"] <= 180, s2
        # after claim already_claimed=True (same last_match_id)
        assert s2["already_claimed"] is True

        # Second reward attempt should 400
        r2 = requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15)
        assert r2.status_code == 400, r2.text

    def test_cooldown_bounds(self):
        tok, _ = _guest()
        _play_and_leave(tok)
        assert requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15).status_code == 200
        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert 0 < s["cooldown_remaining"] <= 180


class TestAdsRegression:
    """Basic sanity: normal match join+leave still returns results with xp_gained."""

    def test_match_results_still_render(self):
        tok, _ = _guest()
        r = requests.post(f"{BASE}/match/join", headers=_hdr(tok), timeout=15)
        mid = r.json()["match_id"]
        deadline = time.time() + 25
        while time.time() < deadline:
            s = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15).json()
            if s.get("phase") == "active":
                break
            time.sleep(0.7)
        time.sleep(1.2)
        requests.post(f"{BASE}/match/{mid}/leave", headers=_hdr(tok), timeout=15)
        time.sleep(1.0)
        s = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15).json()
        # once eliminated, results block is present
        assert "results" in s, s
        assert s["results"]["xp_gained"] > 0
