"""Iteration 15 — Abuse protection: rate limits + alias/callsign profanity filter.

Verifies the new in-memory sliding-window rate limiter and the server-side name
filter that were added this session. Also asserts the user's hard constraint:
a normal single POST /api/match/join must ALWAYS return 200 (never 429),
including finish-a-match -> immediately join-the-next.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
        or os.environ.get("EXPO_BACKEND_URL")
        or "https://pressure-battle-1.preview.emergentagent.com").rstrip("/") + "/api"

# A fake but definitely-public IP we can inject via X-Forwarded-For to
# exercise the per-IP guest limit without throttling other tests coming
# from the shared egress IP. NOTE: do NOT use 203.0.113.x (RFC5737 docs
# range) — the limiter's is_public_ip() classifies it as reserved.
FAKE_PUB_IP = "44.55.66.77"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _uname(prefix: str) -> str:
    """Short, filter-clean username (<=16 chars)."""
    return f"{prefix}{uuid.uuid4().hex[:6]}"


def new_guest(username: str | None = None, xff: str | None = None) -> tuple[str, dict]:
    """Create a guest, return (token, user). Caller supplies XFF if desired."""
    body = {"username": username or _uname("TQA")}
    headers = {"Content-Type": "application/json"}
    if xff:
        headers["X-Forwarded-For"] = xff
    r = requests.post(f"{BASE}/auth/guest", json=body, headers=headers, timeout=15)
    assert r.status_code == 200, f"guest signup failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Alias / callsign filter
# ---------------------------------------------------------------------------
class TestAliasFilter:
    """POST /api/auth/guest and POST /api/profile/name reject bad callsigns."""

    @pytest.mark.parametrize("bad", ["fuck", "sh1t", "admin", "PRESSURE", "n1gger", "F.U.C.K"])
    def test_guest_signup_rejects_bad_names(self, bad):
        r = requests.post(f"{BASE}/auth/guest", json={"username": bad}, timeout=10)
        assert r.status_code == 400, f"expected 400 for {bad!r}, got {r.status_code} {r.text}"
        # user-facing message must be non-empty
        detail = r.json().get("detail", "")
        assert isinstance(detail, str) and len(detail) > 0

    @pytest.mark.parametrize("good", ["CleanName77", "AssassinKing", "class", "Ash_77", "Nova-9"])
    def test_guest_signup_accepts_clean_names(self, good):
        # unique-per-run suffix so we don't hit the exact same name twice
        u = f"{good[:10]}{uuid.uuid4().hex[:4]}"
        r = requests.post(f"{BASE}/auth/guest", json={"username": u}, timeout=10)
        assert r.status_code == 200, f"expected 200 for {u!r}, got {r.status_code} {r.text}"
        assert "token" in r.json() and "user" in r.json()

    def test_profile_rename_rejects_bad_names(self):
        token, _ = new_guest(_uname("TQA_rn"))
        for bad in ("fuck", "admin", "pressure"):
            r = requests.post(f"{BASE}/profile/name",
                              json={"username": bad}, headers=auth(token), timeout=10)
            assert r.status_code == 400, f"expected 400 for rename to {bad!r}, got {r.status_code}"

    def test_profile_rename_accepts_clean_name(self):
        token, _ = new_guest(_uname("TQA_rn"))
        new_name = _uname("Clean")
        r = requests.post(f"{BASE}/profile/name",
                          json={"username": new_name}, headers=auth(token), timeout=10)
        assert r.status_code == 200
        assert r.json()["user"]["username"] == new_name


# ---------------------------------------------------------------------------
# Rate limits — per user (bearer token identity)
# ---------------------------------------------------------------------------
class TestRateLimits:

    def test_press_limit_20_per_1s(self):
        """>20 presses within 1s -> at least one 429 (with Retry-After).

        Sequential HTTP over the public preview URL can easily exceed the 1s
        sliding window (each round-trip ~50-100 ms), so we fire requests
        concurrently from a thread pool to guarantee more than 20 land inside
        the same 1s window.
        """
        from concurrent.futures import ThreadPoolExecutor

        token, _ = new_guest(_uname("TQA_pr"))
        # Rate-limit gate runs BEFORE the match lookup, so a bogus match id
        # exercises the limiter without needing a real active match.
        def _press(_i):
            r = requests.post(f"{BASE}/match/deadbeef/press",
                              json={"use_ability": False}, headers=auth(token), timeout=10)
            return r.status_code, r.headers.get("Retry-After")

        with ThreadPoolExecutor(max_workers=30) as pool:
            results = list(pool.map(_press, range(30)))

        codes = [c for c, _ in results]
        n_429 = codes.count(429)
        n_other = len(codes) - n_429
        assert n_429 > 0, f"press limit never triggered, codes={codes}"
        # Every 429 must carry Retry-After
        for c, ra in results:
            if c == 429:
                assert ra, "429 missing Retry-After header"
        # We fired 30 in <1s -> at most 20 should have been allowed through
        # (the rest are limiter-rejects OR match-not-found 404s — both fine,
        # but 429 count MUST be at least 30 - 20 = 10).
        assert n_429 >= 10, f"expected >=10 x 429, got {n_429} (all codes={codes})"

    def test_join_limit_10_per_20s(self):
        """11th match join within 20s -> 429."""
        token, _ = new_guest(_uname("TQA_jn"))
        codes = []
        # First call auto-leaves any prior lobby; subsequent calls should
        # succeed (returning matchId) until the limiter kicks in on the 11th.
        for _ in range(11):
            r = requests.post(f"{BASE}/match/join", headers=auth(token), timeout=15)
            codes.append(r.status_code)
            if r.status_code == 429:
                assert r.headers.get("Retry-After"), "join 429 missing Retry-After"
                break
        assert codes.count(200) >= 10, f"expected >=10 successful joins, got {codes}"
        assert 429 in codes, f"join limit never triggered, codes={codes}"

    def test_party_create_limit_5_per_60s(self):
        """6th party create within 60s -> 429."""
        token, _ = new_guest(_uname("TQA_pc"))
        codes = []
        for _ in range(6):
            r = requests.post(f"{BASE}/match/party/create", headers=auth(token), timeout=15)
            codes.append(r.status_code)
            if r.status_code == 429:
                assert r.headers.get("Retry-After"), "party create 429 missing Retry-After"
                break
        assert codes.count(200) >= 5, f"expected >=5 successful party creates, got {codes}"
        assert 429 in codes, f"party create limit never triggered, codes={codes}"

    def test_party_join_limit_20_per_20s(self):
        """21st party join within 20s -> 429. Bogus code is fine — limiter runs first."""
        token, _ = new_guest(_uname("TQA_pj"))
        codes = []
        for _ in range(21):
            r = requests.post(f"{BASE}/match/party/join",
                              json={"code": "ZZZZ"}, headers=auth(token), timeout=10)
            codes.append(r.status_code)
            if r.status_code == 429:
                assert r.headers.get("Retry-After"), "party join 429 missing Retry-After"
                break
        # Non-429 responses should be 404 (bogus code) — but the important
        # thing is that the limiter triggered on/after call #21.
        assert 429 in codes, f"party join limit never triggered, codes={codes}"
        assert codes.index(429) >= 20, f"429 came too early at index {codes.index(429)}"


# ---------------------------------------------------------------------------
# Guest signup limit — per-IP, ONLY for public IPs
# ---------------------------------------------------------------------------
class TestGuestSignupLimit:

    def test_guest_limit_triggers_for_public_ip_via_xff(self):
        """31st guest signup within 60s from the same public IP -> 429.

        We inject a fake public IP via X-Forwarded-For so we don't contaminate
        the real egress-IP bucket that other tests share.
        """
        # Use a fresh fake IP per run so any prior test leftovers don't count
        fake_ip = f"44.55.{time.time_ns() % 250 + 1}.{time.time_ns() // 1000 % 250 + 1}"
        codes: list[int] = []
        for i in range(35):
            u = _uname(f"TQAg{i:02d}")
            r = requests.post(f"{BASE}/auth/guest",
                              json={"username": u},
                              headers={"X-Forwarded-For": fake_ip},
                              timeout=10)
            codes.append(r.status_code)
            if r.status_code == 429:
                assert r.headers.get("Retry-After"), "guest 429 missing Retry-After"
                break
        assert codes.count(200) >= 30, f"expected >=30 successful guest signups, got counts {codes}"
        assert 429 in codes, f"guest limit never triggered for public IP, codes={codes}"
        assert codes.index(429) >= 30, f"guest 429 came too early at index {codes.index(429)}"


# ---------------------------------------------------------------------------
# CRITICAL regression — a normal single join must ALWAYS return 200
# ---------------------------------------------------------------------------
class TestJoinNeverBlocksNormalUse:

    def test_single_fresh_user_single_join_returns_200(self):
        token, _ = new_guest(_uname("TQA_ok"))
        r = requests.post(f"{BASE}/match/join", headers=auth(token), timeout=15)
        assert r.status_code == 200, f"single join blocked! {r.status_code} {r.text}"
        assert "matchId" in r.json() or "match_id" in r.json() or "state" in r.json()

    def test_finish_match_then_join_next_is_never_blocked(self):
        """Simulate 'finish one, join the next': leave the current lobby
        and immediately join again. This must always succeed with 200."""
        token, _ = new_guest(_uname("TQA_fj"))
        # 3 join+leave cycles — well under the 10/20s limit.
        for cycle in range(3):
            r = requests.post(f"{BASE}/match/join", headers=auth(token), timeout=15)
            assert r.status_code == 200, f"cycle {cycle} join failed: {r.status_code} {r.text}"
            # leave (best-effort — endpoint should exist)
            r2 = requests.post(f"{BASE}/match/leave", headers=auth(token), timeout=10)
            # 200 or 404 acceptable — some code paths auto-leave
            assert r2.status_code in (200, 204, 404), f"unexpected leave code {r2.status_code}"
