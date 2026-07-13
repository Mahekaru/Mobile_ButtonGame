"""Lightweight in-memory rate limiting / abuse protection.

Single-uvicorn-worker friendly (per-process sliding-window counters guarded by
an asyncio.Lock). Not a security boundary against determined attackers — it's a
cheap backstop against floods (button-press spam, repeated match/party creation,
guest-account spam). If the backend ever scales to multiple workers, move these
counters to a shared store (e.g. Redis) or an ingress/WAF.
"""
import asyncio
import ipaddress
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class _SlidingWindow:
    def __init__(self):
        self._buckets: dict[str, deque] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def hit(self, key: str, limit: int, window: float):
        """Record a hit. Returns None if allowed, else seconds to retry."""
        now = time.monotonic()
        async with self._lock:
            q = self._buckets[key]
            cutoff = now - window
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(window - (now - q[0])) + 1)
            q.append(now)
            # opportunistic cleanup so idle keys don't accumulate forever
            if len(self._buckets) > 5000:
                for k in [k for k, dq in self._buckets.items() if not dq]:
                    self._buckets.pop(k, None)
            return None


_window = _SlidingWindow()


async def enforce(key: str, limit: int, window: float) -> None:
    """Raise HTTP 429 (with Retry-After) if `key` exceeds `limit` per `window`s."""
    retry = await _window.hit(key, limit, window)
    if retry:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests — slow down a moment.",
            headers={"Retry-After": str(retry)},
        )


def client_ip(request: Request) -> str:
    """Best-effort client IP: left-most X-Forwarded-For entry, else socket peer."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_public_ip(ip: str) -> bool:
    """True only for a routable public address.

    Used to decide whether a per-IP limit is meaningful. Behind a shared proxy
    that doesn't forward a real client IP we'd otherwise see one private/loopback
    address for everyone — limiting on that would throttle ALL users, so we skip.
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (addr.is_private or addr.is_loopback
                or addr.is_reserved or addr.is_link_local or addr.is_unspecified)
