"""Iteration 5 — Verify:
  - Cosmetics: new button_fx category (none/glow/fire/electric) and expanded button_skin.
  - Cosmetic equip flow (locked/unlocked based on level).
  - Regression on rewarded ad flow (ads/status + ads/reward, cooldown).
"""
import time
import pytest
import requests

BASE = "https://button-royale-pvp.preview.emergentagent.com/api"


def _guest(name_prefix="TEST_Iter5"):
    r = requests.post(
        f"{BASE}/auth/guest",
        json={"username": f"{name_prefix}_{int(time.time()*1000)%1_000_000}"[:16]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    b = r.json()
    return b["token"], b["user"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _play_and_leave(tok):
    r = requests.post(f"{BASE}/match/join", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    mid = r.json()["match_id"]
    deadline = time.time() + 25
    active = False
    while time.time() < deadline:
        s = requests.get(f"{BASE}/match/{mid}/state", headers=_hdr(tok), timeout=15).json()
        if s.get("phase") == "active":
            active = True
            break
        time.sleep(0.7)
    assert active, "match never active"
    time.sleep(1.5)
    r = requests.post(f"{BASE}/match/{mid}/leave", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    time.sleep(1.5)
    return mid


# ---------------------------------------------------------------------------
# Cosmetics catalog
# ---------------------------------------------------------------------------
class TestCosmeticsCatalog:
    def test_categories_include_button_fx(self):
        tok, _ = _guest()
        r = requests.get(f"{BASE}/cosmetics", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        cats = d["categories"]
        assert "button_fx" in cats
        assert "button_skin" in cats
        ids = [i["id"] for i in cats["button_fx"]]
        assert ids == ["none", "glow", "fire", "electric"], ids
        unlock = {i["id"]: i["unlock_level"] for i in cats["button_fx"]}
        assert unlock == {"none": 1, "glow": 2, "fire": 5, "electric": 8}

    def test_button_skin_includes_new_items(self):
        tok, _ = _guest()
        d = requests.get(f"{BASE}/cosmetics", headers=_hdr(tok), timeout=15).json()
        skin_ids = {i["id"] for i in d["categories"]["button_skin"]}
        # includes original + new (wood, retro, panic, carbon, neon)
        expected = {"classic", "amber", "toxic", "void", "gold",
                    "wood", "retro", "panic", "carbon", "neon"}
        assert expected.issubset(skin_ids), (expected - skin_ids)

    def test_default_equipped_includes_button_fx_none(self):
        tok, _ = _guest()
        d = requests.get(f"{BASE}/cosmetics", headers=_hdr(tok), timeout=15).json()
        assert d["equipped"].get("button_fx") == "none"

    def test_fresh_guest_lock_state(self):
        tok, _ = _guest()
        d = requests.get(f"{BASE}/cosmetics", headers=_hdr(tok), timeout=15).json()
        fx = {i["id"]: i["unlocked"] for i in d["categories"]["button_fx"]}
        assert fx["none"] is True
        assert fx["glow"] is False
        assert fx["fire"] is False
        assert fx["electric"] is False
        skins = {i["id"]: i["unlocked"] for i in d["categories"]["button_skin"]}
        # Only level-1 unlocked at fresh guest
        assert skins["classic"] is True
        for lock in ("amber", "wood", "toxic", "retro", "void", "panic", "gold", "carbon", "neon"):
            assert skins[lock] is False, f"{lock} should be locked for fresh guest"


# ---------------------------------------------------------------------------
# Cosmetics equip flow
# ---------------------------------------------------------------------------
class TestCosmeticEquip:
    def test_equip_locked_glow_fails(self):
        tok, _ = _guest()
        r = requests.post(
            f"{BASE}/profile/cosmetic",
            headers=_hdr(tok),
            json={"category": "button_fx", "item_id": "glow"},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_daily_claim_unlocks_glow_and_equip_persists(self):
        tok, _ = _guest()
        # Claim daily reward (+125 XP -> level 2)
        r = requests.post(f"{BASE}/rewards/claim", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["progression"]["level"] >= 2, body["user"]["progression"]

        # Now glow should be unlocked
        d = requests.get(f"{BASE}/cosmetics", headers=_hdr(tok), timeout=15).json()
        fx = {i["id"]: i["unlocked"] for i in d["categories"]["button_fx"]}
        assert fx["glow"] is True
        # fire/electric still locked
        assert fx["fire"] is False
        assert fx["electric"] is False

        # Equip glow
        r = requests.post(
            f"{BASE}/profile/cosmetic",
            headers=_hdr(tok),
            json={"category": "button_fx", "item_id": "glow"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["equipped_cosmetics"]["button_fx"] == "glow"

        # Verify persistence
        me = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]
        assert me["equipped_cosmetics"]["button_fx"] == "glow"

        # And it's flagged equipped in /cosmetics
        d2 = requests.get(f"{BASE}/cosmetics", headers=_hdr(tok), timeout=15).json()
        glow_entry = next(i for i in d2["categories"]["button_fx"] if i["id"] == "glow")
        assert glow_entry["equipped"] is True


# ---------------------------------------------------------------------------
# Rewarded ad regression (unchanged backend behavior)
# ---------------------------------------------------------------------------
class TestAdsRegression:
    def test_fresh_guest_cannot_watch(self):
        tok, _ = _guest()
        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s["can_watch"] is False
        assert s["reward"] == 0
        assert s["cooldown_remaining"] == 0

    def test_reward_flow_after_match(self):
        tok, _ = _guest()
        _play_and_leave(tok)
        s = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s["can_watch"] is True, s
        reward = s["reward"]
        assert reward > 0

        xp_before = requests.get(f"{BASE}/profile", headers=_hdr(tok), timeout=15).json()["user"]["progression"]["xp"]
        assert s["reward"] == xp_before

        r = requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["rewarded"] == reward
        assert body["user"]["progression"]["xp"] == xp_before + reward

        s2 = requests.get(f"{BASE}/ads/status", headers=_hdr(tok), timeout=15).json()
        assert s2["can_watch"] is False
        assert 0 < s2["cooldown_remaining"] <= 180
        assert s2["already_claimed"] is True

        # Second POST -> 400
        r2 = requests.post(f"{BASE}/ads/reward", headers=_hdr(tok), timeout=15)
        assert r2.status_code == 400
