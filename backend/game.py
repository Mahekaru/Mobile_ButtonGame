"""Server-authoritative match engine for Panic Button.

A single MatchManager holds all live matches in memory. Each match runs an
asyncio loop that (a) lets AI bots press the button based on their personality
and the rising global danger meter, and (b) resolves human presses that arrive
over HTTP. Clients poll GET /api/match/{id}/state to render the live HUD; the
danger meter animates client-side from `last_press_at`, so polling latency does
not affect the shared, server-decided outcome.
"""
from __future__ import annotations

import asyncio
import random
import time
import uuid
from typing import Dict, List, Optional

import challenges as CH
from config import (
    ABILITY_BY_ID,
    DEFENSIVE_ABILITIES,
    FRIEND_KO_BONUS,
    GAME_CONFIG,
    HOLD_XP_CAP,
    HOLD_XP_PER_SEC,
    LATE_TENSION,
    PERSONALITY_WEIGHTS,
    RIVAL_KO_BONUS,
    compute_match_xp,
    level_for_xp,
    make_bot_name,
    protection_for,
    roll_threshold,
)


def now() -> float:
    return time.time()


class Player:
    def __init__(self, pid: str, name: str, is_bot: bool,
                 user_id: Optional[str] = None, personality: Optional[str] = None,
                 ability: Optional[str] = None, icon: str = "skull",
                 friends: Optional[set] = None, rivals: Optional[set] = None):
        self.pid = pid
        self.name = name
        self.is_bot = is_bot
        self.user_id = user_id
        self.personality = personality
        self.icon = icon
        self.ability = ability            # equipped ability id (humans only)
        self.ability_used = False
        self.alive = True
        self.kills = 0
        self.placement: Optional[int] = None
        self.self_eliminated = False
        self.threshold = roll_threshold(personality) if personality else 0.0
        # social loop
        self.friends: set = friends or set()
        self.rivals: set = rivals or set()
        self.bonus_xp = 0
        self.friend_kos = 0
        self.rival_kos = 0
        self.ko_names: List[str] = []     # human names this player eliminated
        # personal danger + patience reward
        self.last_press_at = now()        # personal timer (set at activation)
        self.hold_xp = 0                  # banked patience reward
        # active-ability effect state
        self.hidden_until = 0.0           # untargetable/press-safe until this ts
        self.danger_bonus = 0.0           # overcharge: permanent +danger surcharge
        self.xp_multiplier = 1.0          # overcharge: multiplies base match XP
        self.hold_multiplier = 1.0        # adrenaline: multiplies banked patience XP
        self.freeze_until = 0.0           # steady: danger frozen until this ts
        self.frozen_danger = 0.0          # steady: value to hold while frozen
        self.self_safe_until = 0.0        # failsafe: no self-elimination until this ts


class Match:
    def __init__(self, match_id: str, manager: "MatchManager"):
        self.id = match_id
        self.manager = manager
        self.phase = "lobby"           # lobby | active | ended
        self.players: Dict[str, Player] = {}
        self.user_index: Dict[str, str] = {}   # user_id -> pid
        self.feed: List[dict] = []
        self.created_at = now()
        self.start_at = now() + GAME_CONFIG["lobby_countdown_sec"]
        self.last_press_at = now()
        self.ended_at: Optional[float] = None
        self.winner_pid: Optional[str] = None
        self.lock = asyncio.Lock()
        self._loop_task: Optional[asyncio.Task] = None
        self._persisted_pids: set = set()
        self.party_code: Optional[str] = None
        self.is_party = False
        self.ws_conns: Dict[object, str] = {}   # websocket -> user_id

    async def broadcast(self):
        """Push a personalized state snapshot to every connected websocket."""
        if not self.ws_conns:
            return
        dead = []
        for ws, uid in list(self.ws_conns.items()):
            try:
                await ws.send_json(self.state_for(uid))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.ws_conns.pop(ws, None)

    # ---- helpers -----------------------------------------------------------
    def alive_players(self) -> List[Player]:
        return [p for p in self.players.values() if p.alive]

    def alive_count(self) -> int:
        return sum(1 for p in self.players.values() if p.alive)

    def eff_slope(self) -> float:
        """Danger climbs faster as the field shrinks (late-game tension)."""
        total = len(self.players) or 1
        shrink = 1.0 - (self.alive_count() / total)
        return GAME_CONFIG["danger_slope"] * (1.0 + LATE_TENSION * shrink)

    def danger_for(self, player: "Player") -> float:
        """Personal self-death chance %, based on time since THIS player's last press."""
        if self.phase != "active":
            return GAME_CONFIG["danger_base"]
        if player.freeze_until and now() < player.freeze_until:
            return max(GAME_CONFIG["danger_base"],
                       min(GAME_CONFIG["danger_cap"], player.frozen_danger))
        elapsed = now() - player.last_press_at
        val = GAME_CONFIG["danger_base"] + elapsed * self.eff_slope() + player.danger_bonus
        return max(GAME_CONFIG["danger_base"], min(GAME_CONFIG["danger_cap"], val))

    def danger_pct(self) -> float:
        # Lobby/default fallback only; per-player danger is the real driver.
        return GAME_CONFIG["danger_base"]

    def add_human(self, user_id: str, name: str, ability: Optional[str], icon: str,
                  friends: Optional[set] = None, rivals: Optional[set] = None) -> str:
        pid = f"u_{user_id}"
        if pid in self.players:
            return pid
        self.players[pid] = Player(pid, name, is_bot=False, user_id=user_id,
                                   ability=ability, icon=icon,
                                   friends=friends, rivals=rivals)
        self.user_index[user_id] = pid
        return pid

    def _backfill_bots(self):
        used = {p.name for p in self.players.values()}
        target = GAME_CONFIG["match_size"]
        while len(self.players) < target:
            pid = f"b_{uuid.uuid4().hex[:8]}"
            personality = random.choice(PERSONALITY_WEIGHTS)
            self.players[pid] = Player(pid, make_bot_name(used), is_bot=True,
                                       personality=personality)

    def _reroll_bot_thresholds(self):
        for p in self.players.values():
            if p.is_bot and p.alive:
                p.threshold = roll_threshold(p.personality)

    def _push_feed(self, event: dict):
        event["id"] = uuid.uuid4().hex[:10]
        event["ts"] = now()
        self.feed.append(event)
        if len(self.feed) > 40:
            self.feed = self.feed[-40:]

    # ---- elimination core --------------------------------------------------
    def _try_defensive(self, player: Player) -> bool:
        """Consume a defensive ability if available; True => player survives."""
        if player.ability in DEFENSIVE_ABILITIES and not player.ability_used:
            player.ability_used = True
            return True
        return False

    def _eliminate(self, victim: Player, killer: Optional[Player], self_elim: bool):
        victim.alive = False
        victim.placement = self.alive_count() + 1  # alive_count now excludes victim
        victim.self_eliminated = self_elim
        # Reward patience: bank the wait since this player's last press (unless
        # they pressed their own doom). The longer they held out, the more XP.
        if not self_elim:
            victim.hold_xp += int(min(HOLD_XP_CAP, (now() - victim.last_press_at) * HOLD_XP_PER_SEC) * victim.hold_multiplier)
        self._push_feed({
            "type": "elim",
            "victim": victim.name,
            "victim_icon": victim.icon,
            "killer": None if self_elim else (killer.name if killer else None),
            "self": self_elim,
        })
        self._schedule_persist(victim)

    def _schedule_persist(self, player: Player):
        if player.is_bot or not player.user_id or player.pid in self._persisted_pids:
            return
        self._persisted_pids.add(player.pid)
        try:
            asyncio.create_task(self.manager.persist_player(self, player))
        except RuntimeError:
            pass

    def _pick_victim(self, exclude_pids: set) -> Optional[Player]:
        t = now()
        pool = [p for p in self.players.values()
                if p.alive and p.pid not in exclude_pids
                and not (p.hidden_until and t < p.hidden_until)]
        if not pool:
            return None
        weights = [max(0.02, 1.0 - protection_for(p.kills)) for p in pool]
        return random.choices(pool, weights=weights, k=1)[0]

    def resolve_press(self, presser_pid: str, use_ability: bool) -> Optional[dict]:
        """Resolve a button press. Caller MUST hold self.lock. Returns outcome."""
        if self.phase != "active":
            return None
        presser = self.players.get(presser_pid)
        if presser is None or not presser.alive:
            return None

        wait_seconds = now() - presser.last_press_at
        danger = self.danger_for(presser)
        self_chance = (danger / 100.0) * (1.0 - protection_for(presser.kills))

        ability_note = None
        double_tap = False
        if use_ability and presser.ability and not presser.ability_used:
            if presser.ability == "lucky_press":
                self_chance *= GAME_CONFIG["lucky_press_multiplier"]
                presser.ability_used = True
                ability_note = "lucky_press"
            elif presser.ability == "double_tap":
                double_tap = True
                presser.ability_used = True
                ability_note = "double_tap"
            elif presser.ability == "hide":
                # Untargetable + press-safe for 5 seconds.
                presser.hidden_until = now() + 5.0
                self_chance = 0.0
                presser.ability_used = True
                ability_note = "hide"
            elif presser.ability == "overcharge":
                # Triple match XP at the cost of a permanent +15% danger surcharge.
                presser.xp_multiplier = 3.0
                presser.danger_bonus += 15.0
                presser.ability_used = True
                ability_note = "overcharge"
            elif presser.ability == "adrenaline":
                # Double all patience XP banked from here on.
                presser.hold_multiplier = 2.0
                presser.ability_used = True
                ability_note = "adrenaline"
            elif presser.ability == "steady":
                # Freeze danger near the floor for 6 seconds after this press.
                presser.frozen_danger = GAME_CONFIG["danger_base"]
                presser.freeze_until = now() + 6.0
                presser.ability_used = True
                ability_note = "steady"
            elif presser.ability == "failsafe":
                # Cannot self-eliminate for 2 seconds after pressing.
                presser.self_safe_until = now() + 2.0
                presser.ability_used = True
                ability_note = "failsafe"

        # Failsafe grace window: no self-elimination while active.
        if presser.self_safe_until and now() < presser.self_safe_until:
            self_chance = 0.0

        outcome = {"presser": presser.name, "danger": round(danger, 1),
                   "self_death": False, "victims": [], "ability": ability_note,
                   "saved": False, "hold_bonus": 0}

        presser_dies = random.random() < self_chance
        if presser_dies and self._try_defensive(presser):
            presser_dies = False
            outcome["saved"] = True

        if presser_dies:
            self._eliminate(presser, killer=None, self_elim=True)
            outcome["self_death"] = True
            outcome["victims"].append(presser.name)
        else:
            # Bank the patience reward — the longer the hold, the bigger the payout.
            hold = int(min(HOLD_XP_CAP, wait_seconds * HOLD_XP_PER_SEC) * presser.hold_multiplier)
            presser.hold_xp += hold
            outcome["hold_bonus"] = hold
            n = GAME_CONFIG["double_tap_count"] if double_tap else 1
            excluded = {presser.pid}
            for _ in range(n):
                victim = self._pick_victim(excluded)
                if victim is None:
                    break
                if self._try_defensive(victim):
                    excluded.add(victim.pid)
                    victim = self._pick_victim(excluded)
                    if victim is None:
                        break
                self._eliminate(victim, killer=presser, self_elim=False)
                presser.kills += 1
                excluded.add(victim.pid)
                outcome["victims"].append(victim.name)
                # Social bonus: knocking out humans you know is worth more.
                if not victim.is_bot and victim.user_id:
                    presser.ko_names.append(victim.name)
                    if victim.user_id in presser.friends:
                        presser.bonus_xp += FRIEND_KO_BONUS
                        presser.friend_kos += 1
                        outcome["bonus"] = "friend"
                    elif victim.user_id in presser.rivals:
                        presser.bonus_xp += RIVAL_KO_BONUS
                        presser.rival_kos += 1
                        outcome["bonus"] = "rival"

        # Only the PRESSER's personal danger resets.
        presser.last_press_at = now()
        if presser.is_bot and presser.alive:
            presser.threshold = roll_threshold(presser.personality)
        self._check_end()
        return outcome

    def _check_end(self):
        if self.phase != "active":
            return
        alive = self.alive_players()
        if len(alive) <= 1:
            self.phase = "ended"
            self.ended_at = now()
            if alive:
                winner = alive[0]
                winner.placement = 1
                winner.hold_xp += int(min(HOLD_XP_CAP, (now() - winner.last_press_at) * HOLD_XP_PER_SEC) * winner.hold_multiplier)
                self.winner_pid = winner.pid
                self._push_feed({"type": "win", "victim": winner.name,
                                 "victim_icon": winner.icon, "killer": None, "self": False})
                self._schedule_persist(winner)

    # ---- loop --------------------------------------------------------------
    async def run_loop(self):
        # Wait out the lobby countdown, allowing humans to gather.
        while now() < self.start_at and self.phase == "lobby":
            await asyncio.sleep(0.25)
            await self.broadcast()
        async with self.lock:
            if self.phase == "lobby":
                self._backfill_bots()
                self.phase = "active"
                t0 = now()
                for p in self.players.values():
                    p.last_press_at = t0          # everyone's personal timer starts now
                    if p.is_bot:
                        p.threshold = roll_threshold(p.personality)
        await self.broadcast()

        while True:
            await asyncio.sleep(GAME_CONFIG["tick_sec"])
            if self.phase != "active":
                break
            async with self.lock:
                if self.phase != "active":
                    break
                # A bot presses when ITS OWN personal danger crosses its threshold.
                ready = [p for p in self.players.values()
                         if p.is_bot and p.alive and self.danger_for(p) >= p.threshold]
                if ready:
                    # most-urgent bot (highest personal danger) acts first
                    ready.sort(key=lambda p: self.danger_for(p) - p.threshold, reverse=True)
                    presser = ready[0] if random.random() < 0.8 else random.choice(ready)
                    self.resolve_press(presser.pid, use_ability=False)
            await self.broadcast()

        # Match has ended — push the final state (results/spectator recap).
        await self.broadcast()
        # Safety net: persist any human not yet recorded (e.g. the winner).
        async with self.lock:
            humans = [p for p in self.players.values() if not p.is_bot and p.user_id]
        for p in humans:
            self._schedule_persist(p)

    # ---- serialization -----------------------------------------------------
    def state_for(self, user_id: Optional[str]) -> dict:
        pid = self.user_index.get(user_id) if user_id else None
        me = self.players.get(pid) if pid else None
        total = len(self.players) if self.phase != "lobby" else GAME_CONFIG["match_size"]

        me_danger = self.danger_for(me) if me else GAME_CONFIG["danger_base"]
        data = {
            "match_id": self.id,
            "phase": self.phase,
            "players_total": total,
            "players_alive": self.alive_count() if self.phase != "lobby" else len(self.players),
            "danger": round(me_danger, 1),
            "server_now": now(),
            "config": {
                "base": GAME_CONFIG["danger_base"],
                "slope": round(self.eff_slope(), 3),
                "cap": GAME_CONFIG["danger_cap"],
            },
            "feed": self.feed[-14:][::-1],
        }
        if self.phase == "lobby":
            data["countdown"] = max(0, round(self.start_at - now(), 1))
            data["party_code"] = self.party_code
            data["lobby_players"] = [
                {"name": p.name, "icon": p.icon}
                for p in list(self.players.values())[:24]
            ]
        if me:
            data["me"] = {
                "pid": me.pid,
                "name": me.name,
                "alive": me.alive,
                "kills": me.kills,
                "protection": round(protection_for(me.kills) * 100),
                "ability": me.ability,
                "ability_used": me.ability_used,
                "placement": me.placement,
                "self_eliminated": me.self_eliminated,
                "danger": round(me_danger, 1),
                "last_press_at": me.last_press_at,
                "hold_xp": me.hold_xp,
            }
            # Dead players keep watching (spectator mode) — expose their own
            # recap so they can bail to results at any time, but only auto-show
            # the results screen once the whole match has ended.
            if not me.alive:
                data["my_result"] = self._results_for(me)
            if self.phase == "ended":
                data["results"] = self._results_for(me)
        return data

    def _results_for(self, me: Player) -> dict:
        won = self.winner_pid == me.pid
        placement = me.placement or self.alive_count()
        base_xp = int(compute_match_xp(placement, me.kills, won, len(self.players)) * me.xp_multiplier)
        return {
            "won": won,
            "placement": placement,
            "kills": me.kills,
            "self_eliminated": me.self_eliminated,
            "bonus_xp": me.bonus_xp,
            "friend_kos": me.friend_kos,
            "rival_kos": me.rival_kos,
            "ko_names": me.ko_names[:5],
            "patience_xp": me.hold_xp,
            "xp_gained": base_xp + me.bonus_xp + me.hold_xp,
        }


class MatchManager:
    def __init__(self, db):
        self.db = db
        self.matches: Dict[str, Match] = {}
        self.open_lobby_id: Optional[str] = None
        self.party_index: Dict[str, str] = {}   # party_code -> match_id
        self._lock = asyncio.Lock()

    def _make_party_code(self) -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        for _ in range(30):
            code = "".join(random.choice(alphabet) for _ in range(5))
            if code not in self.party_index:
                return code
        return uuid.uuid4().hex[:5].upper()

    async def create_party(self, user_id, name, ability, icon, friends=None, rivals=None) -> dict:
        async with self._lock:
            self._prune()
            mid = uuid.uuid4().hex[:12]
            lobby = Match(mid, self)
            lobby.is_party = True
            lobby.party_code = self._make_party_code()
            lobby.start_at = now() + GAME_CONFIG["party_countdown_sec"]
            self.matches[mid] = lobby
            self.party_index[lobby.party_code] = mid
            lobby._loop_task = asyncio.create_task(lobby.run_loop())
            pid = lobby.add_human(user_id, name, ability, icon, friends, rivals)
            return {"match_id": lobby.id, "party_code": lobby.party_code, "pid": pid}

    async def join_party(self, code, user_id, name, ability, icon, friends=None, rivals=None) -> dict:
        async with self._lock:
            mid = self.party_index.get(code)
            lobby = self.matches.get(mid) if mid else None
            if (lobby is None or lobby.phase != "lobby" or now() >= lobby.start_at
                    or len(lobby.players) >= GAME_CONFIG["match_size"]):
                return {"error": "not_found"}
            pid = lobby.add_human(user_id, name, ability, icon, friends, rivals)
            return {"match_id": lobby.id, "party_code": code, "pid": pid}

    def _prune(self):
        cutoff = now() - 180
        for mid in list(self.matches.keys()):
            m = self.matches[mid]
            if m.phase == "ended" and m.ended_at and m.ended_at < cutoff:
                del self.matches[mid]

    async def join(self, user_id: str, name: str, ability: Optional[str], icon: str,
                   friends: Optional[set] = None, rivals: Optional[set] = None) -> dict:
        async with self._lock:
            self._prune()
            lobby = self.matches.get(self.open_lobby_id) if self.open_lobby_id else None
            joinable = (lobby is not None and lobby.phase == "lobby"
                        and now() < lobby.start_at
                        and len(lobby.players) < GAME_CONFIG["match_size"])
            if not joinable:
                mid = uuid.uuid4().hex[:12]
                lobby = Match(mid, self)
                self.matches[mid] = lobby
                self.open_lobby_id = mid
                lobby._loop_task = asyncio.create_task(lobby.run_loop())
            pid = lobby.add_human(user_id, name, ability, icon, friends, rivals)
            return {"match_id": lobby.id, "pid": pid}

    def get(self, match_id: str) -> Optional[Match]:
        return self.matches.get(match_id)

    async def persist_player(self, match: "Match", p: "Player"):
        if p.is_bot or not p.user_id:
            return
        won = match.winner_pid == p.pid
        placement = p.placement or match.alive_count()
        xp_gained = (int(compute_match_xp(placement, p.kills, won, len(match.players)) * p.xp_multiplier)
                     + p.bonus_xp + p.hold_xp)

        user = await self.db.users.find_one({"_id": p.user_id})
        if not user:
            return
        new_xp = user.get("xp", 0) + xp_gained
        new_level = level_for_xp(new_xp)
        update = {
            "$inc": {
                "xp": xp_gained,
                "matches_played": 1,
                "wins": 1 if won else 0,
                "total_eliminations": p.kills,
                "times_self_eliminated": 1 if p.self_eliminated else 0,
                "placement_sum": placement,
            },
            "$max": {"highest_streak": p.kills},
            "$set": {"level": new_level, "last_match_xp": xp_gained, "last_match_id": match.id},
        }
        # Remember the other humans from this match as future "rivals".
        others = [q.user_id for q in match.players.values()
                  if not q.is_bot and q.user_id and q.user_id != p.user_id]
        if others:
            update["$addToSet"] = {"rivals": {"$each": others}}
        await self.db.users.update_one({"_id": p.user_id}, update)

        # Daily-challenge progress from this match result.
        fresh = await self.db.users.find_one({"_id": p.user_id})
        if fresh:
            dc, _ = CH.ensure_today(fresh)
            result = {"won": won, "placement": placement, "kills": p.kills,
                      "self_eliminated": p.self_eliminated, "patience_xp": p.hold_xp}
            CH.apply_progress(dc, result)
            await self.db.users.update_one({"_id": p.user_id},
                                           {"$set": {"daily_challenges": dc}})
