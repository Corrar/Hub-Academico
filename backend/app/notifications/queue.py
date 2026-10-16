"""Notification queue: fan-out, deduplication, preferences, retries and delivery.

Texts are composed at send time from the current data, so an archived or edited
publication never sends stale content, and lock screens only show titles: never
grades, feedback or bodies.
"""

from datetime import timedelta

from sqlalchemy import or_, select, text

from ..academic.clock import ZONE, local_today
from ..models import (
    ClassGroup,
    Course,
    Membership,
    NotificationOutbox,
    NotificationPreference,
    Publication,
    PushSubscription,
    Subject,
    Submission,
    User,
    now,
)
from ..security import utc

MAX_ATTEMPTS = 5
PREFERENCE = {
    "notice": "notices",
    "activity": "activities",
    "material": "materials",
    "event": "events",
    "grade": "grades",
    "deadline": "deadlines",
}
PAGE = {
    "notice": "notice",
    "activity": "activity",
    "material": "material",
    "event": "event",
    "grade": "activity",
    "deadline": "activity",
    "test": "reminders",
}


def live(row, stamp):
    return (
        not row.draft
        and not row.archived
        and (row.publish_at is None or utc(row.publish_at) <= stamp)
        and (row.expires_at is None or utc(row.expires_at) > stamp)
    )


def members(group_id, on, role=None):
    stmt = (
        select(User.id)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.group_id == group_id,
            Membership.archived.is_(False),
            Membership.starts_on <= on,
            Membership.ends_on >= on,
            User.archived.is_(False),
        )
    )
    return stmt.where(User.role == role) if role else stmt


def group_active(db, group_id):
    return bool(
        db.scalar(
            select(ClassGroup.id)
            .join(Subject)
            .join(Course)
            .where(
                ClassGroup.id == group_id,
                ClassGroup.archived.is_(False),
                Subject.archived.is_(False),
                Course.archived.is_(False),
            )
        )
    )


def can_see(db, user_id, row, on):
    user = db.get(User, user_id)
    if not user or user.archived:
        return False
    if row.audience == "institution":
        return True
    if user.role == "coordinator":
        return group_active(db, row.group_id)
    return group_active(db, row.group_id) and bool(
        db.scalar(members(row.group_id, on).where(User.id == user_id))
    )


def add(db, user_id, category, key, when, publication_id=None, submission_id=None):
    if db.scalar(select(NotificationOutbox.id).where(NotificationOutbox.dedup_key == key)):
        return False
    db.add(
        NotificationOutbox(
            user_id=user_id,
            category=category,
            dedup_key=key,
            deliver_after=when,
            publication_id=publication_id,
            submission_id=submission_id,
        )
    )
    return True


def fanout(db, row, stamp=None):
    """Queue one notification per recipient the first time a publication is visible."""
    stamp = stamp or now()
    if row.fanout_at or not live(row, stamp):
        return 0
    today = local_today()
    if row.audience == "institution":
        people = db.scalars(select(User.id).where(User.archived.is_(False)))
    else:
        people = db.scalars(members(row.group_id, today)) if group_active(db, row.group_id) else []
    count = 0
    for user_id in set(people) - {row.creator_id}:
        count += add(db, user_id, row.kind, f"pub:{row.id}:{user_id}", stamp, row.id)
    row.fanout_at = stamp
    return count


def graded(db, submission):
    """Tell the student that the submission was graded or reopened."""
    db.flush()
    add(
        db,
        submission.student_id,
        "grade",
        f"grade:{submission.id}:{submission.version}",
        now(),
        submission.publication_id,
        submission.id,
    )


def fanout_due(db, stamp):
    count = 0
    for row in db.scalars(
        select(Publication)
        .where(
            Publication.fanout_at.is_(None),
            Publication.draft.is_(False),
            Publication.archived.is_(False),
            or_(Publication.publish_at.is_(None), Publication.publish_at <= stamp),
        )
        .limit(50)
    ):
        count += fanout(db, row, stamp)
        row.fanout_at = row.fanout_at or stamp
    return count


def deadline_reminders(db, stamp):
    """One reminder per student, within 24 hours of a deadline without a submission."""
    count, today = 0, local_today()
    for row in db.scalars(
        select(Publication).where(
            Publication.kind == "activity",
            Publication.draft.is_(False),
            Publication.archived.is_(False),
            Publication.due_at > stamp + timedelta(hours=1),
            Publication.due_at <= stamp + timedelta(hours=24),
            or_(Publication.publish_at.is_(None), Publication.publish_at <= stamp),
        )
    ):
        if not group_active(db, row.group_id):
            continue
        sent = select(Submission.student_id).where(
            Submission.publication_id == row.id,
            Submission.draft.is_(False),
            Submission.archived.is_(False),
        )
        for user_id in db.scalars(
            members(row.group_id, today, "student").where(User.id.not_in(sent))
        ):
            count += add(db, user_id, "deadline", f"due:{row.id}:{user_id}", stamp, row.id)
    return count


def brasilia(value):
    return utc(value).astimezone(ZONE).strftime("%d/%m às %H:%M")


def compose(db, item, stamp):
    """Current message for a queued item, or None when it no longer applies."""
    if item.category == "test":
        return {
            "title": "Notificações ativadas",
            "body": "Você receberá avisos do Hub Acadêmico neste dispositivo.",
        }
    row = db.get(Publication, item.publication_id) if item.publication_id else None
    if not row or not live(row, stamp) or not can_see(db, item.user_id, row, local_today()):
        return None
    where = ""
    if row.group_id:
        subject = db.scalar(
            select(Subject.name).join(ClassGroup).where(ClassGroup.id == row.group_id)
        )
        where = f" · {subject}"
    if item.category == "grade":
        submission = db.get(Submission, item.submission_id)
        if not submission or submission.archived:
            return None
        if submission.grade is None:
            return {"title": "Entrega reaberta", "body": f"{row.title}: veja a devolutiva."}
        return {"title": "Entrega avaliada", "body": f"{row.title}: confira a nota e a devolutiva."}
    if item.category == "deadline":
        done = db.scalar(
            select(Submission.id).where(
                Submission.publication_id == row.id,
                Submission.student_id == item.user_id,
                Submission.draft.is_(False),
                Submission.archived.is_(False),
            )
        )
        if done or utc(row.due_at) <= stamp:
            return None
        return {
            "title": "Prazo se aproximando",
            "body": f"{row.title} vence {brasilia(row.due_at)}.",
        }
    titles = {
        "notice": "Novo aviso",
        "activity": "Nova atividade",
        "material": "Novo material",
        "event": "Novo evento",
    }
    body = row.title + where
    if row.kind == "activity":
        body += f" · prazo {brasilia(row.due_at)}"
    if row.kind == "event":
        body += f" · {brasilia(row.starts_at)}"
    return {"title": titles[row.kind], "body": body}


def wanted(db, item):
    if item.category not in PREFERENCE:
        return True
    preference = db.get(NotificationPreference, item.user_id)
    return getattr(preference, PREFERENCE[item.category]) if preference else True


def dispatch(db, sender, stamp=None, batch=200):
    """Fan out, schedule reminders and deliver due items. Safe to run concurrently."""
    stamp = stamp or now()
    if db.bind.dialect.name == "postgresql":
        if not db.execute(text("SELECT pg_try_advisory_xact_lock(819261016)")).scalar():
            return {"busy": True}
    queued = fanout_due(db, stamp) + deadline_reminders(db, stamp)
    db.flush()
    counts = {"queued": queued, "sent": 0, "skipped": 0, "retry": 0, "failed": 0}
    items = db.scalars(
        select(NotificationOutbox)
        .where(
            NotificationOutbox.status == "pending",
            NotificationOutbox.deliver_after <= stamp,
        )
        .order_by(NotificationOutbox.deliver_after, NotificationOutbox.id)
        .limit(batch)
    ).all()
    for item in items:
        message = compose(db, item, stamp) if wanted(db, item) else None
        devices = (
            db.scalars(
                select(PushSubscription).where(PushSubscription.user_id == item.user_id)
            ).all()
            if message
            else []
        )
        if not message or not devices:
            item.status, item.last_error = "skipped", "" if message else "não se aplica"
            counts["skipped"] += 1
            continue
        message.update(page=PAGE[item.category], tag=item.dedup_key)
        results = []
        for device in devices:
            result = sender.send(device, message)
            results.append(result)
            if result == "ok":
                device.last_success_at, device.failures = stamp, 0
            elif result == "gone":
                db.delete(device)
            else:
                device.failures += 1
        item.attempts += 1
        if "ok" in results:
            item.status, item.sent_at = "sent", stamp
            counts["sent"] += 1
        elif "retry" not in results:
            item.status, item.last_error = "skipped", "dispositivos removidos"
            counts["skipped"] += 1
        elif item.attempts >= MAX_ATTEMPTS:
            item.status, item.last_error = "failed", "serviço de push indisponível"
            counts["failed"] += 1
        else:
            item.deliver_after = stamp + timedelta(minutes=2**item.attempts)
            item.last_error = "nova tentativa agendada"
            counts["retry"] += 1
    db.commit()
    return counts
