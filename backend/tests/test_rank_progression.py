"""Validation tests for the rank XP progression fix.

Confirms the authoritative curve in config.py:
  * exactly 50 ranks
  * strictly increasing cumulative thresholds (no consecutive duplicates)
  * milestone thresholds land exactly on rank*1000 (R10..R50)
  * milestone abilities unlock at ranks 3, 6, 10, 14, 18, 22, 27, 33, 40, 50
  * level_for_xp maps lifetime XP back to the right rank
  * xpForNextRank == difference of consecutive cumulative thresholds
"""
import config as C


def _thresholds():
    return [C.rank_threshold(r) for r in range(1, C.MAX_LEVEL + 1)]


def test_exactly_50_ranks():
    assert C.MAX_LEVEL == 50
    assert len(_thresholds()) == 50


def test_strictly_increasing_no_duplicates():
    t = _thresholds()
    for i in range(len(t) - 1):
        assert t[i] < t[i + 1], f"rank {i+1}->{i+2} not increasing: {t[i]} !< {t[i+1]}"


def test_milestone_thresholds_exact():
    assert C.rank_threshold(10) == 10_000
    assert C.rank_threshold(20) == 20_000
    assert C.rank_threshold(30) == 30_000
    assert C.rank_threshold(40) == 40_000
    assert C.rank_threshold(50) == 50_000


def test_rank_1_is_zero_and_new_player_starts_rank_1():
    assert C.rank_threshold(1) == 0
    assert C.level_for_xp(0) == 1


def test_eased_curve_within_tier():
    # First ranks in a tier are cheap; increments grow toward the milestone.
    t = _thresholds()
    incs = [t[i + 1] - t[i] for i in range(len(t) - 1)]
    # within tier 2 (ranks 11..20) increments are non-decreasing and end far
    # larger than they start (eased curve; equal steps allowed from 100-rounding).
    tier = incs[10:19]  # deltas for ranks 11->12 .. 19->20
    assert all(tier[i] <= tier[i + 1] for i in range(len(tier) - 1)), tier
    assert tier[-1] > tier[0] * 2, tier


def test_level_for_xp_boundaries():
    assert C.level_for_xp(9_999) == 9
    assert C.level_for_xp(10_000) == 10
    assert C.level_for_xp(49_999) == 49
    assert C.level_for_xp(50_000) == 50
    assert C.level_for_xp(10_000_000) == 50  # clamped to max


def test_milestone_ability_unlock_ranks():
    expected = [3, 6, 10, 14, 18, 22, 27, 33, 40, 50]
    got = sorted(a["unlock_level"] for a in C.ABILITIES)
    assert got == expected, got
    # each milestone rank owns exactly one ability
    assert len(set(got)) == len(got)


def test_xp_for_next_rank_is_threshold_difference():
    for r in range(1, C.MAX_LEVEL):
        snap = C.progression_snapshot(C.rank_threshold(r))
        assert snap["level"] == r
        assert snap["xp_for_next"] == C.rank_threshold(r + 1) - C.rank_threshold(r)
        assert snap["xp_into_level"] == 0


def test_progress_bar_uses_current_rank_window():
    # Halfway between rank 5 and rank 6 thresholds => ~0.5 progress, positive xp_into.
    lo, hi = C.rank_threshold(5), C.rank_threshold(6)
    mid = (lo + hi) // 2
    snap = C.progression_snapshot(mid)
    assert snap["level"] == 5
    assert snap["xp_into_level"] == mid - lo
    assert 0.0 < snap["progress"] < 1.0
