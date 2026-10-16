"""Academic calendar dates follow the campus clock (São Paulo), never the client."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ZONE = ZoneInfo("America/Sao_Paulo")


def local_today():
    return datetime.now(ZONE).date()


def occurrences(start, end, weekday):
    """Number of dates in [start, end] that fall on ``weekday`` (Monday = 0)."""
    if end < start:
        return 0
    first = start + timedelta(days=(weekday - start.weekday()) % 7)
    return 0 if first > end else (end - first).days // 7 + 1
