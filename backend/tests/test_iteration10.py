"""Iteration 10 — Leaderboards, Daily Challenges, WebSocket match transport.

Covers the four new features added this session:
  (a) GET /api/leaderboard (global + friends scope)
  (b) GET /api/challenges — 3 deterministic daily challenges w/ progress
  (c) POST /api/challenges/claim/{id} — 400 incomplete, 404 unknown, grants XP once
  (d) WebSocket /api/match/{id}/ws — auth ok/fail + personalised state frame
"""
from __future__ import annotations

import json
import os
import time
import uuid

import pytest
import requests
import websocket  # websocket-client

BASE_URL = "https://panic-4.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _guest(name_prefix: str) -> dict:
    name = f"{name_prefix}{uuid.uuid4().hex[:6]}"[:16]
    r = requests.post(f"{API}/auth/guest", json={"username": name}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def alice() -> dict:
    return _guest("TEST_A")


@pytest.fixture(scope="module")
def bob() -> dict:
    return _guest("TEST_B")


def _auth(session: dict) -> dict:
    return {"Authorization": f"Bearer {session['token']}"}


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------
class TestLeaderboard:
    def test_global_scope_returns_rows_sorted_desc_and_my_rank(self, alice):
        r = requests.get(f"{API}/leaderboard?scope=global", headers=_auth(alice), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["scope"] == "global"
        assert isinstance(data["rows"], list)
        assert len(data["rows"]) <= 100
        # sorted by xp desc
        xps = [row["xp"] for row in data["rows"]]
        assert xps == sorted(xps, reverse=True), f"rows must be xp-desc: {xps[:8]}"
        # my_rank must be an int (either from the top-100 window or synthesised)
        assert isinstance(data["my_rank"], int) and data["my_rank"] >= 1
        # every row has required shape
        for row in data["rows"]:
            for k in ("rank", "id", "username", "level", "rank_name", "xp", "wins", "is_me"):
                assert k in row, f"row missing key {k}: {row}"

    def test_friends_scope_contains_self_only_when_no_friends(self, alice):
        r = requests.get(f"{API}/leaderboard?scope=friends", headers=_auth(alice), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["scope"] == "friends"
        assert len(data["rows"]) == 1
        assert data["rows"][0]["is_me"] is True
        assert data["rows"][0]["id"] == alice["user"]["id"]
        assert data["my_rank"] == 1

    def test_friends_scope_includes_added_friend(self, alice, bob):
        # alice adds bob
        r = requests.post(f"{API}/friends/add", headers=_auth(alice),
                          json={"code": bob["user"]["friend_code"]}, timeout=15)
        assert r.status_code == 200, r.text
        r = requests.get(f"{API}/leaderboard?scope=friends", headers=_auth(alice), timeout=15)
        assert r.status_code == 200
        ids = {row["id"] for row in r.json()["rows"]}
        assert alice["user"]["id"] in ids
        assert bob["user"]["id"] in ids


# ---------------------------------------------------------------------------
# Daily challenges — GET + claim rules
# ---------------------------------------------------------------------------
class TestChallenges:
    def test_get_returns_three_challenges_with_progress_shape(self, alice):
        r = requests.get(f"{API}/challenges", headers=_auth(alice), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "date" in data
        assert data["total"] == 3
        assert len(data["challenges"]) == 3
        assert 0 <= data["completed"] <= 3
        for c in data["challenges"]:
            for k in ("id", "name", "desc", "icon", "goal", "reward",
                      "progress", "complete", "claimed"):
                assert k in c, f"challenge missing key {k}: {c}"
            assert isinstance(c["complete"], bool)
            assert isinstance(c["claimed"], bool)
            assert c["progress"] <= c["goal"]

    def test_get_is_deterministic_for_today(self, alice, bob):
        a = requests.get(f"{API}/challenges", headers=_auth(alice), timeout=15).json()
        b = requests.get(f"{API}/challenges", headers=_auth(bob), timeout=15).json()
        assert a["date"] == b["date"]
        assert [c["id"] for c in a["challenges"]] == [c["id"] for c in b["challenges"]]

    def test_claim_unknown_returns_404(self, alice):
        r = requests.post(f"{API}/challenges/claim/no_such_challenge",
                          headers=_auth(alice), timeout=15)
        assert r.status_code == 404

    def test_claim_incomplete_returns_400(self, alice):
        data = requests.get(f"{API}/challenges", headers=_auth(alice), timeout=15).json()
        # pick any incomplete challenge (fresh user -> all progress=0)
        target = next((c for c in data["challenges"] if not c["complete"]), None)
        assert target is not None, "fresh user should have at least one incomplete"
        r = requests.post(f"{API}/challenges/claim/{target['id']}",
                          headers=_auth(alice), timeout=15)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Challenge progress accrues after a match ends (persist_player -> daily_challenges)
# ---------------------------------------------------------------------------
class TestChallengeProgressAfterMatch:
    def test_progress_accrues_after_match_ends(self):
        """After a completed match, at least ONE challenge metric must have
        advanced (matches always ticks, survive/top10/patience may too)."""
        sess = _guest("TEST_P")
        before = requests.get(f"{API}/challenges", headers=_auth(sess), timeout=15).json()
        prog_before = {c["id"]: c["progress"] for c in before["challenges"]}

        j = requests.post(f"{API}/match/join", headers=_auth(sess), timeout=15).json()
        match_id = j["match_id"]
        # Wait for active phase (lobby countdown ~8s)
        for _ in range(30):
            time.sleep(0.5)
            s = requests.get(f"{API}/match/{match_id}/state",
                             headers=_auth(sess), timeout=15).json()
            if s.get("phase") == "active":
                break
        # Leave during active -> _eliminate -> _schedule_persist -> apply_progress
        requests.post(f"{API}/match/{match_id}/leave",
                      headers=_auth(sess), timeout=15)
        time.sleep(3.0)

        after = requests.get(f"{API}/challenges", headers=_auth(sess), timeout=15).json()
        prog_after = {c["id"]: c["progress"] for c in after["challenges"]}
        bumped = [cid for cid in prog_before if prog_after[cid] > prog_before[cid]]
        assert bumped, (f"no challenge progress advanced after match — "
                        f"before={prog_before} after={prog_after}")


# ---------------------------------------------------------------------------
# WebSocket match transport
# ---------------------------------------------------------------------------
class TestMatchWebSocket:
    def _ws_url(self, match_id: str, token: str) -> str:
        return (BASE_URL.replace("http", "ws")
                + f"/api/match/{match_id}/ws?token={token}")

    def test_bad_token_is_rejected(self):
        """Server closes with 4401 before/during handshake for invalid tokens.
        The Cloudflare ingress may surface this as a 403 during handshake or
        as an immediate close frame with code 4401 — both are valid rejections.
        """
        sess = _guest("TEST_W")
        j = requests.post(f"{API}/match/join", headers=_auth(sess), timeout=15).json()
        match_id = j["match_id"]
        rejected = False
        closed_code = None
        try:
            ws = websocket.WebSocket()
            try:
                ws.connect(self._ws_url(match_id, "not-a-jwt"), timeout=10)
            except websocket.WebSocketBadStatusException:
                rejected = True
            else:
                # handshake succeeded — expect an immediate close with code 4401
                try:
                    ws.settimeout(5)
                    ws.recv()
                except websocket.WebSocketException:
                    pass
                closed_code = ws.close_status_code
                if closed_code == 4401:
                    rejected = True
                ws.close()
        finally:
            requests.post(f"{API}/match/{match_id}/leave", headers=_auth(sess), timeout=15)
        assert rejected, f"bad token was not rejected (close_code={closed_code})"

    def test_valid_token_receives_state_frame(self):
        sess = _guest("TEST_W")
        j = requests.post(f"{API}/match/join", headers=_auth(sess), timeout=15).json()
        match_id = j["match_id"]
        ws = websocket.WebSocket()
        frame = None
        try:
            ws.connect(self._ws_url(match_id, sess["token"]), timeout=10)
            ws.settimeout(5)
            raw = ws.recv()
            frame = json.loads(raw)
        finally:
            try:
                ws.close()
            except Exception:
                pass
            requests.post(f"{API}/match/{match_id}/leave", headers=_auth(sess), timeout=15)

        assert frame is not None, "no state frame received on valid WS connect"
        assert frame["match_id"] == match_id
        assert frame["phase"] in ("lobby", "active", "ended")
        # Personalised: the frame must include a 'me' block for this user
        assert "me" in frame, f"frame missing personalised 'me' block: {frame.keys()}"
        assert frame["me"]["name"] == sess["user"]["username"]
