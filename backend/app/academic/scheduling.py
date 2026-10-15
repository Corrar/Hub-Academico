"""Conflict checks honor the intersection of schedule and teacher validity dates."""

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, text

from ..models import Membership, Schedule, User


def lock_schedule(db):
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(819260909)"))


def has_weekday(start, end, weekday):
    return start + timedelta(days=(weekday - start.weekday()) % 7) <= end


def validate_schedule(db, body, exclude=None):
    candidates = db.scalars(
        select(Schedule).where(
            Schedule.archived.is_(False),
            Schedule.weekday == body.weekday,
            Schedule.starts_minute < body.ends_minute,
            Schedule.ends_minute > body.starts_minute,
            Schedule.starts_on <= body.ends_on,
            Schedule.ends_on >= body.starts_on,
        )
    )

    def teachers(group):
        return list(
            db.scalars(
                select(Membership)
                .join(User)
                .where(
                    Membership.group_id == group,
                    Membership.archived.is_(False),
                    User.role == "teacher",
                    User.archived.is_(False),
                    Membership.starts_on <= body.ends_on,
                    Membership.ends_on >= body.starts_on,
                )
            )
        )

    ours = teachers(str(body.group_id))
    for row in candidates:
        if row.id == exclude:
            continue
        start, end = max(row.starts_on, body.starts_on), min(row.ends_on, body.ends_on)
        if not has_weekday(start, end, body.weekday):
            continue
        conflict = row.group_id == str(body.group_id) or row.room.casefold() == body.room.casefold()
        if not conflict:
            for other in teachers(row.group_id):
                for own in ours:
                    if own.user_id == other.user_id and has_weekday(
                        max(start, own.starts_on, other.starts_on),
                        min(end, own.ends_on, other.ends_on),
                        body.weekday,
                    ):
                        conflict = True
        if conflict:
            raise HTTPException(409, "Conflito de horário na turma, sala ou professor")


def validate_group_schedules(db, group_id):
    db.flush()
    for row in db.scalars(
        select(Schedule).where(Schedule.group_id == group_id, Schedule.archived.is_(False))
    ):
        validate_schedule(db, row, row.id)
