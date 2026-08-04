"""Pure functions that turn a player's raw training entries into
gamification stats: XP, levels, weekly practice streaks and badges.

Nothing here touches the database - callers pass in rows already
fetched, which keeps this module easy to unit test and reuse for both
the player list and the player detail page.
"""

from datetime import date

LEVELS = [
    (0, "Tee Starter", "\U0001F331"),
    (100, "Fairway Finder", "\U0001F9ED"),
    (250, "Bunker Buster", "\U0001F4A5"),
    (500, "Green Reader", "\U0001F50D"),
    (900, "Par Chaser", "\U0001F3C3"),
    (1400, "Birdie Hunter", "\U0001F426"),
    (2000, "Eagle Seeker", "\U0001F985"),
    (2800, "Course Master", "\U0001F393"),
    (3800, "Tour Ready", "\U0001F680"),
    (5000, "DB Elite", "\U0001F451"),
]

SESSION_BASE_XP = 15
PER_DRILL_XP = 5
PERFECT_SESSION_BONUS = 25

BADGE_DEFS = [
    {"id": "first_tee", "name": "First Tee", "icon": "\U0001F3CC",
     "desc": "Log your very first training session.",
     "test": lambda s: s["total_sessions"] >= 1,
     "progress": lambda s: (min(s["total_sessions"], 1), 1)},
    {"id": "warming_up", "name": "Warming Up", "icon": "\U0001F525",
     "desc": "Practice 2 weeks in a row.",
     "test": lambda s: s["longest_week_streak"] >= 2,
     "progress": lambda s: (min(s["longest_week_streak"], 2), 2)},
    {"id": "on_fire", "name": "On Fire", "icon": "\U0001F525\U0001F525",
     "desc": "Practice 4 weeks in a row.",
     "test": lambda s: s["longest_week_streak"] >= 4,
     "progress": lambda s: (min(s["longest_week_streak"], 4), 4)},
    {"id": "unstoppable", "name": "Unstoppable", "icon": "\U0001F525\U0001F525\U0001F525",
     "desc": "Practice 8 weeks in a row.",
     "test": lambda s: s["longest_week_streak"] >= 8,
     "progress": lambda s: (min(s["longest_week_streak"], 8), 8)},
    {"id": "century_club", "name": "Century Club", "icon": "\U0001F4AF",
     "desc": "Log 100 drill results in total.",
     "test": lambda s: s["total_filled"] >= 100,
     "progress": lambda s: (min(s["total_filled"], 100), 100)},
    {"id": "perfect_session", "name": "Perfect Session", "icon": "✅",
     "desc": "Fill in every drill in a single session.",
     "test": lambda s: s["perfect_sessions"] >= 1,
     "progress": lambda s: (min(s["perfect_sessions"], 1), 1)},
    {"id": "iron_will", "name": "Iron Will", "icon": "\U0001F3CB",
     "desc": "Log 10 training sessions.",
     "test": lambda s: s["total_sessions"] >= 10,
     "progress": lambda s: (min(s["total_sessions"], 10), 10)},
    {"id": "marathoner", "name": "Marathoner", "icon": "\U0001F3C3",
     "desc": "Log 25 training sessions.",
     "test": lambda s: s["total_sessions"] >= 25,
     "progress": lambda s: (min(s["total_sessions"], 25), 25)},
    {"id": "level_up", "name": "Leveling Up", "icon": "⭐",
     "desc": "Reach Green Reader or higher.",
     "test": lambda s: s["level_index"] >= 3,
     "progress": lambda s: (min(s["level_index"], 3), 3)},
    {"id": "legend", "name": "DB Elite", "icon": "\U0001F451",
     "desc": "Reach the top level: DB Elite.",
     "test": lambda s: s["level_index"] >= len(LEVELS) - 1,
     "progress": lambda s: (min(s["level_index"], len(LEVELS) - 1), len(LEVELS) - 1)},
]


def _auto_level_index(xp):
    idx = 0
    for i, (threshold, _name, _icon) in enumerate(LEVELS):
        if xp >= threshold:
            idx = i
    return idx


def _level_info_for_index(idx, xp, is_manual):
    idx = max(0, min(idx, len(LEVELS) - 1))
    threshold, name, icon = LEVELS[idx]
    if idx + 1 < len(LEVELS):
        next_threshold = LEVELS[idx + 1][0]
        xp_for_next_level = next_threshold - threshold
        xp_into_level = max(0, min(xp - threshold, xp_for_next_level))
        progress_pct = round(100 * xp_into_level / xp_for_next_level, 1)
    else:
        xp_into_level = max(0, xp - threshold)
        xp_for_next_level = None
        progress_pct = 100.0
    return {
        "level_index": idx,
        "level_name": name,
        "level_icon": icon,
        "xp_into_level": xp_into_level,
        "xp_for_next_level": xp_for_next_level,
        "level_progress_pct": progress_pct,
        "is_max_level": idx == len(LEVELS) - 1,
        "level_is_manual": is_manual,
    }


def _level_for_xp(xp, level_override=None):
    if level_override is not None and 0 <= level_override < len(LEVELS):
        return _level_info_for_index(level_override, xp, True)
    return _level_info_for_index(_auto_level_index(xp), xp, False)


def _parse_date(s):
    try:
        y, m, d = (int(part) for part in s.split("-"))
        return date(y, m, d)
    except (ValueError, AttributeError):
        return None


def _week_streaks(session_dates):
    mondays = set()
    for ds in session_dates:
        d = _parse_date(ds)
        if d is None:
            continue
        iso_year, iso_week, _ = d.isocalendar()
        mondays.add(date.fromisocalendar(iso_year, iso_week, 1))

    if not mondays:
        return 0, 0

    sorted_mondays = sorted(mondays)
    longest = run = 1
    for i in range(1, len(sorted_mondays)):
        if (sorted_mondays[i] - sorted_mondays[i - 1]).days == 7:
            run += 1
        else:
            run = 1
        longest = max(longest, run)

    today = date.today()
    this_monday = date.fromisocalendar(*today.isocalendar()[:2], 1)
    last_monday = sorted_mondays[-1]
    gap_weeks = (this_monday - last_monday).days // 7

    if gap_weeks > 1:
        current = 0
    else:
        current = 1
        for i in range(len(sorted_mondays) - 1, 0, -1):
            if (sorted_mondays[i] - sorted_mondays[i - 1]).days == 7:
                current += 1
            else:
                break

    return current, longest


def compute_player_stats(entries, num_drills, level_override=None):
    """entries: iterable of dicts with entry_date, drill_id, value."""
    sessions = {}
    for e in entries:
        value = (e.get("value") or "").strip() if isinstance(e, dict) else ""
        if not value:
            continue
        sessions.setdefault(e["entry_date"], set()).add(e["drill_id"])

    total_sessions = len(sessions)
    total_filled = sum(len(v) for v in sessions.values())
    perfect_sessions = sum(
        1 for v in sessions.values() if num_drills > 0 and len(v) >= num_drills
    )

    xp = 0
    for drill_ids in sessions.values():
        xp += SESSION_BASE_XP + PER_DRILL_XP * len(drill_ids)
        if num_drills > 0 and len(drill_ids) >= num_drills:
            xp += PERFECT_SESSION_BONUS

    current_streak, longest_streak = _week_streaks(sessions.keys())

    stats = {
        "xp": xp,
        "total_sessions": total_sessions,
        "total_filled": total_filled,
        "perfect_sessions": perfect_sessions,
        "current_week_streak": current_streak,
        "longest_week_streak": longest_streak,
    }
    stats.update(_level_for_xp(xp, level_override))

    badges = []
    for b in BADGE_DEFS:
        current, target = b["progress"](stats)
        badges.append({
            "id": b["id"],
            "name": b["name"],
            "icon": b["icon"],
            "desc": b["desc"],
            "earned": bool(b["test"](stats)),
            "current": current,
            "target": target,
            "pct": round(100 * current / target, 1) if target else 100.0,
        })
    stats["badges"] = badges

    return stats
