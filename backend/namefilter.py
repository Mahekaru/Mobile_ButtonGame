"""Alias / callsign moderation for PRESSURE.

Server-authoritative filter that rejects inappropriate usernames (profanity,
slurs, sexual content, impersonation of the game/staff) before an account is
created or renamed. Handles common evasion tricks (leetspeak, repeated
letters, and separator characters like ._- spaces).
"""
import re

# --- Allowed character set ----------------------------------------------------
# Letters, digits, space, underscore, hyphen, period. Anything else is rejected.
_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ._-]+$")

# Leetspeak / homoglyph normalization applied before matching.
_LEET_MAP = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g",
    "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i",
    "|": "i", "£": "e", "€": "e", "+": "t",
})

# Hard blocks: matched as a substring of the collapsed (letters-only) string, so
# "f.u_c k" or "sh1t" are caught. Reserve this tier for slurs and unambiguous
# profanity that is virtually never part of a legitimate word.
_HARD_BLOCK = {
    "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "penis",
    "vagina", "boobs", "whore", "slut", "bastard", "wanker", "bollock",
    "nigger", "nigga", "faggot", "fag", "retard", "spic", "chink", "kike",
    "coon", "wetback", "tranny", "dyke", "nazi", "hitler", "rape", "rapist",
    "pedo", "paedo", "pedophile", "molest", "incest", "cum", "jizz", "dildo",
    "blowjob", "handjob", "anus", "asshole", "arsehole", "twat", "prick",
    "motherfucker", "bugger", "goddamn", "jerkoff", "titties", "boner",
    "clit", "cameltoe", "gangbang", "creampie", "bukkake", "porn", "porno",
    "xxx", "hentai", "sex", "sexy", "orgasm", "masturbate", "ejaculate",
    "queef", "smegma", "skank", "nutsack", "ballsack", "cocksucker",
}

# Word blocks: matched only as whole tokens (word-boundary), so short words
# that appear inside safe names ("ass" in "class", "hell" in "shell") do not
# trigger false positives.
_WORD_BLOCK = {
    "ass", "arse", "damn", "hell", "crap", "piss", "tit", "tits", "hoe",
    "wtf", "stfu", "milf", "bdsm", "nude", "nudes", "horny",
}

# Impersonation / reserved names.
_RESERVED = {
    "admin", "administrator", "moderator", "mod", "staff", "system",
    "root", "official", "support", "pressure", "pressureteam",
    "gamemaster", "gm", "owner", "developer", "server",
}

_SEP_RE = re.compile(r"[^a-z]")


def _collapse(text: str) -> str:
    """Lowercase, de-leet, strip repeated letters and all non-letters."""
    t = text.lower().translate(_LEET_MAP)
    t = _SEP_RE.sub("", t)
    # collapse runs of the same char (e.g. "shhhit" -> "shit")
    t = re.sub(r"(.)\1{2,}", r"\1", t)
    return t


def _tokens(text: str) -> set:
    return set(re.findall(r"[a-z]+", text.lower().translate(_LEET_MAP)))


def check_username(raw: str):
    """Return (ok, message). message is user-facing when not ok."""
    name = (raw or "").strip()
    if len(name) < 2:
        return False, "Pick a callsign with at least 2 characters."
    if len(name) > 16:
        return False, "Callsign must be 16 characters or fewer."
    if not _ALLOWED_RE.match(name):
        return False, "Callsigns can only use letters, numbers, spaces, . _ and -"
    if not re.search(r"[A-Za-z0-9]", name):
        return False, "Callsign must contain at least one letter or number."

    collapsed = _collapse(name)
    for bad in _HARD_BLOCK:
        if bad in collapsed:
            return False, "That callsign isn't allowed. Please choose another."

    tokens = _tokens(name)
    if tokens & _WORD_BLOCK:
        return False, "That callsign isn't allowed. Please choose another."

    if collapsed in _RESERVED or tokens & _RESERVED:
        return False, "That callsign is reserved. Please choose another."

    return True, ""
