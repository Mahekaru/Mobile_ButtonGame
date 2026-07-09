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

from config import (
    ABILITY_BY_ID,
    DEFENSIVE_ABILITIES,
    FRIEND_KO_BONUS,
    GAME_CONFIG,
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

    # ---- helpers -----------------------------------------------------------
    def alive_players(self) -> List[Player]:
        return [p for p in self.players.values() if p.alive]

    def alive_count(self) -> int:
        return sum(1 for p in self.players.values() if p.alive)

    def danger_pct(self) -> float:
        if self.phase != "active":
            return GAME_CONFIG["danger_base"]
        elapsed = now() - self.last_press_at
        val = GAME_CONFIG["danger_base"] + elapsed * GAME_CONFIG["danger_slope"]
        return max(GAME_CONFIG["danger_base"], min(GAME_CONFIG["danger_cap"], val))

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
        pool = [p for p in self.players.values() if p.alive and p.pid not in exclude_pids]
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

        danger = self.danger_pct()
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

        outcome = {"presser": presser.name, "danger": round(danger, 1),
                   "self_death": False, "victims": [], "ability": ability_note,
                   "saved": False}

        presser_dies = random.random() < self_chance
        if presser_dies and self._try_defensive(presser):
            presser_dies = False
            outcome["saved"] = True

        if presser_dies:
            self._eliminate(presser, killer=None, self_elim=True)
            outcome["self_death"] = True
            outcome["victims"].append(presser.name)
        else:
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

        self.last_press_at = now()
        self._reroll_bot_thresholds()
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
                self.winner_pid = winner.pid
                self._push_feed({"type": "win", "victim": winner.name,
                                 "victim_icon": winner.icon, "killer": None, "self": False})
                self._schedule_persist(winner)

    # ---- loop --------------------------------------------------------------
    async def run_loop(self):
        # Wait out the lobby countdown, allowing humans to gather.
        while now() < self.start_at and self.phase == "lobby":
            await asyncio.sleep(0.25)
        async with self.lock:
            if self.phase == "lobby":
                self._backfill_bots()
                self.phase = "active"
                self.last_press_at = now()
                self._reroll_bot_thresholds()

        while True:
            await asyncio.sleep(GAME_CONFIG["tick_sec"])
            if self.phase != "active":
                break
            async with self.lock:
                if self.phase != "active":
                    break
                danger = self.danger_pct()
                ready = [p for p in self.players.values()
                         if p.is_bot and p.alive and danger >= p.threshold]
                if ready:
                    # eager bots (lowest threshold) act first; small randomness
                    ready.sort(key=lambda p: p.threshold)
                    presser = ready[0] if random.random() < 0.8 else random.choice(ready)
                    self.resolve_press(presser.pid, use_ability=False)

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

        data = {
            "match_id": self.id,
            "phase": self.phase,
            "players_total": total,
            "players_alive": self.alive_count() if self.phase != "lobby" else len(self.players),
            "humans": sum(1 for p in self.players.values() if not p.is_bot),
            "danger": round(self.danger_pct(), 1),
            "last_press_at": self.last_press_at,
            "server_now": now(),
            "config": {
                "base": GAME_CONFIG["danger_base"],
                "slope": GAME_CONFIG["danger_slope"],
                "cap": GAME_CONFIG["danger_cap"],
            },
            "feed": self.feed[-14:][::-1],
        }
        if self.phase == "lobby":
            data["countdown"] = max(0, round(self.start_at - now(), 1))
            data["lobby_players"] = [
                {"name": p.name, "icon": p.icon, "is_bot": p.is_bot}
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
            }
            if self.phase == "ended" or not me.alive:
                data["results"] = self._results_for(me)
        return data

    def _results_for(self, me: Player) -> dict:
        won = self.winner_pid == me.pid
        placement = me.placement or self.alive_count()
        base_xp = compute_match_xp(placement, me.kills, won, len(self.players))
        return {
            "won": won,
            "placement": placement,
            "kills": me.kills,
            "self_eliminated": me.self_eliminated,
            "bonus_xp": me.bonus_xp,
            "friend_kos": me.friend_kos,
            "rival_kos": me.rival_kos,
            "ko_names": me.ko_names[:5],
            "xp_gained": base_xp + me.bonus_xp,
        }


class MatchManager:
    def __init__(self, db):
        self.db = db
        self.matches: Dict[str, Match] = {}
        self.open_lobby_id: Optional[str] = None
        self._lock = asyncio.Lock()

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
        xp_gained = compute_match_xp(placement, p.kills, won, len(match.players)) + p.bonus_xp

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
            "$set": {"level": new_level},
        }
        # Remember the other humans from this match as future "rivals".
        others = [q.user_id for q in match.players.values()
                  if not q.is_bot and q.user_id and q.user_id != p.user_id]
        if others:
            update["$addToSet"] = {"rivals": {"$each": others}}
        await self.db.users.update_one({"_id": p.user_id}, update)
