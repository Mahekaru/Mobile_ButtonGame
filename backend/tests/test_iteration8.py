"""Iteration 8 — verifies the new 'failsafe' ability:

  1. /api/abilities catalog includes failsafe (id, name, icon, unlock_level=3, type='active')
  2. A fresh guest (L1) sees failsafe as locked
  3. Bump user to L3 (xp=600) in Mongo -> failsafe becomes equippable
  4. Match with failsafe completes without server error; press with use_ability=true
     while alive should NOT self-eliminate within the 2-second window even if
     danger is boosted client-side (danger stays <=100). We verify:
       - press returns 200 or 409, never 5xx
       - within the 2s window: outcome.self_death is false AND
         a second press within 2s also returns without self_death
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

BASE = "https://button-royale-pvp.preview.emergentagent.com/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _guest(prefix="I8"):
    name = f"{prefix}_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/auth/guest", json={"username": name[:16]}, timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    return b["token"], b["user"]


def _wait_active(tok, mid, deadline_s=25):
    end = time.time() + deadline_s
    while time.time() < end:
        s = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15).json()
        if s.get("phase") == "active":
            return s
        time.sleep(0.7)
    raise AssertionError("match never became active")


def _bump(user_id, xp):
    cli = MongoClient(MONGO_URL)
    try:
        cli[DB_NAME].users.update_one({"_id": user_id}, {"$set": {"xp": xp}})
    finally:
        cli.close()


# 1. Catalog
class TestFailsafeCatalog:
    def test_failsafe_in_abilities(self):
        tok, _ = _guest("FsCat")
        d = requests.get(f"{BASE}/abilities", headers=_hdr(tok), timeout=15).json()
        by_id = {a["id"]: a for a in d["abilities"]}
        assert "failsafe" in by_id, list(by_id.keys())
        fs = by_id["failsafe"]
        assert fs["name"] == "Failsafe"
        assert fs["icon"] == "shield-check"
        assert fs["unlock_level"] == 3
        assert fs["type"] == "active"

    def test_locked_for_fresh_guest(self):
        tok, _ = _guest("FsLock")
        d = requests.get(f"{BASE}/abilities", headers=_hdr(tok), timeout=15).json()
        by_id = {a["id"]: a for a in d["abilities"]}
        assert by_id["failsafe"]["unlocked"] is False


# 2. Equip after L3 unlock
class TestFailsafeEquip:
    def test_equip_after_bump(self):
        assert MONGO_URL and DB_NAME
        tok, u = _guest("FsEq")
        # Try to equip while locked -> should fail
        r = requests.post(f"{BASE}/profile/ability", headers=_hdr(tok),
                          json={"ability_id": "failsafe"}, timeout=15)
        assert r.status_code in (400, 403), r.text

        _bump(u["id"], 600)  # L3
        r = requests.post(f"{BASE}/profile/ability", headers=_hdr(tok),
                          json={"ability_id": "failsafe"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["equipped_ability"] == "failsafe"
        # profile echoes
        me = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
        assert me["equipped_ability"] == "failsafe"
        assert me["progression"]["level"] == 3


# 3/4. Match with failsafe completes; press within 2s never self-eliminates
class TestFailsafeMatch:
    def test_match_press_and_grace_window(self):
        assert MONGO_URL and DB_NAME
        tok, u = _guest("FsPlay")
        _bump(u["id"], 600)
        r = requests.post(f"{BASE}/profile/ability", headers=_hdr(tok),
                          json={"ability_id": "failsafe"}, timeout=15)
        assert r.status_code == 200

        r = requests.post(f"{BASE}/match/join", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        mid = r.json()["match_id"]
        _wait_active(tok, mid)

        # Press with use_ability=True (activates failsafe -> 2s grace)
        pr = requests.post(f"{BASE}/match/{mid}/press", headers=_hdr(tok),
                           json={"use_ability": True}, timeout=15)
        assert pr.status_code in (200, 409), pr.text
        if pr.status_code == 200:
            out = pr.json().get("outcome", {})
            assert out.get("self_death") is False, out
            # ability field should mark failsafe was invoked on this press
            assert out.get("ability") in ("failsafe", None)

            # Immediate second press within the 2s grace window: must NOT self-die.
            time.sleep(0.4)
            pr2 = requests.post(f"{BASE}/match/{mid}/press", headers=_hdr(tok),
                                json={"use_ability": False}, timeout=15)
            assert pr2.status_code in (200, 409), pr2.text
            if pr2.status_code == 200:
                out2 = pr2.json().get("outcome", {})
                assert out2.get("self_death") is False, out2

        # State still serializes fine
        st = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15)
        assert st.status_code == 200
        st.json()

        requests.post(f"{BASE}/match/{mid}/leave", headers=_hdr(tok), timeout=15)
        time.sleep(1.2)
