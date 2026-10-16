"""LGPD support: data subject export, privacy contact and retention of transient data.

Academic records (submissions, grades, attendance, audit) are institutional
records and are never purged here; only operational data with no further use.
"""

import json
import os
from datetime import timedelta

from fastapi import Response
from sqlalchemy import delete, select

from .models import (
    AdminGrant,
    Attachment,
    AttendanceLesson,
    AttendanceRecord,
    Audit,
    ClassGroup,
    Enrollment,
    LoginAttempt,
    Membership,
    MicrosoftIdentity,
    NotificationOutbox,
    NotificationPreference,
    OIDCFlow,
    Publication,
    PushSubscription,
    Session,
    Subject,
    Submission,
    now,
)


def retention_days():
    try:
        days = int(os.getenv("NOTIFICATION_RETENTION_DAYS", "90"))
    except ValueError:
        days = 0
    if not 7 <= days <= 3650:
        raise RuntimeError("NOTIFICATION_RETENTION_DAYS deve ser de 7 a 3650.")
    return days


def purge(db, stamp=None, notification_days=None):
    """Delete expired operational data; returns how many rows each step removed."""
    stamp = stamp or now()
    notification_days = notification_days or retention_days()
    removed = {
        "sessions": db.execute(delete(Session).where(Session.expires_at <= stamp)).rowcount,
        "login_attempts": db.execute(
            delete(LoginAttempt).where(LoginAttempt.window_start <= stamp - timedelta(days=1))
        ).rowcount,
        "oidc_flows": db.execute(delete(OIDCFlow).where(OIDCFlow.expires_at <= stamp)).rowcount,
        "notifications": db.execute(
            delete(NotificationOutbox).where(
                NotificationOutbox.status != "pending",
                NotificationOutbox.created_at <= stamp - timedelta(days=notification_days),
            )
        ).rowcount,
        "devices": db.execute(
            delete(PushSubscription).where(PushSubscription.failures >= 20)
        ).rowcount,
    }
    db.commit()
    return removed


def label(db, group_id):
    group = db.get(ClassGroup, group_id)
    if not group:
        return None
    subject = db.get(Subject, group.subject_id)
    return f"{subject.name} · {group.name} · {group.semester}"


def export(db, actor, public):
    """Everything the hub stores about the requesting person, in a portable format."""
    memberships = db.scalars(select(Membership).where(Membership.user_id == actor.id)).all()
    submissions = db.execute(
        select(Submission, Publication)
        .join(Publication, Publication.id == Submission.publication_id)
        .where(Submission.student_id == actor.id)
        .order_by(Submission.submitted_at)
    ).all()
    files = db.scalars(select(Attachment).where(Attachment.owner_id == actor.id)).all()
    marks = db.execute(
        select(AttendanceRecord.present, AttendanceLesson)
        .join(AttendanceLesson, AttendanceLesson.id == AttendanceRecord.lesson_id)
        .where(AttendanceRecord.student_id == actor.id)
        .order_by(AttendanceLesson.lesson_date)
    ).all()
    enrollments = db.execute(
        select(Enrollment, Publication.title)
        .join(Publication, Publication.id == Enrollment.publication_id)
        .where(Enrollment.user_id == actor.id)
    ).all()
    preference = db.get(NotificationPreference, actor.id)
    return {
        "generated_at": now(),
        "notice": (
            "Dados mantidos pelo Hub Acadêmico da Fatec Adamantina. Registros acadêmicos "
            "(entregas, avaliações, frequência e auditoria) seguem as regras de guarda da "
            "instituição. Para correções, procure a coordenação."
        ),
        "profile": {
            **public(actor),
            "administrator": bool(db.get(AdminGrant, actor.id)),
            "microsoft_linked": bool(db.get(MicrosoftIdentity, actor.id)),
        },
        "memberships": [
            {
                "group": label(db, row.group_id),
                "starts_on": row.starts_on,
                "ends_on": row.ends_on,
                "archived": row.archived,
            }
            for row in memberships
        ],
        "submissions": [
            {
                "activity": activity.title,
                "group": label(db, activity.group_id),
                "body": submission.body,
                "draft": submission.draft,
                "submitted_at": submission.submitted_at,
                "grade": submission.grade,
                "feedback": submission.feedback,
                "graded_at": submission.graded_at,
            }
            for submission, activity in submissions
        ],
        "files": [
            {
                "name": row.name,
                "type": row.media_type,
                "bytes": row.size,
                "created_at": row.created_at,
                "archived": row.archived,
            }
            for row in files
        ],
        "attendance": [
            {
                "date": lesson.lesson_date,
                "group": label(db, lesson.group_id),
                "present": present,
                "topic": lesson.topic,
                "archived": lesson.archived,
            }
            for present, lesson in marks
        ],
        "event_enrollments": [
            {"event": title, "created_at": row.created_at, "cancelled": row.archived}
            for row, title in enrollments
        ],
        "notification_preferences": (
            {
                key: getattr(preference, key)
                for key in ["notices", "activities", "materials", "events", "grades", "deadlines"]
            }
            if preference
            else "padrão: todas ativas"
        ),
        "devices": [
            {"label": row.label, "channel": row.channel, "created_at": row.created_at}
            for row in db.scalars(
                select(PushSubscription).where(PushSubscription.user_id == actor.id)
            )
        ],
        "sessions": [
            {
                "method": row.method,
                "authenticated_at": row.authenticated_at,
                "expires_at": row.expires_at,
            }
            for row in db.scalars(select(Session).where(Session.user_id == actor.id))
        ],
        "authored_publications": [
            {"kind": row.kind, "title": row.title, "created_at": row.created_at}
            for row in db.scalars(
                select(Publication)
                .where(Publication.creator_id == actor.id)
                .order_by(Publication.created_at)
            )
        ],
        "actions_recorded": [
            {"action": row.action, "entity": row.entity, "occurred_at": row.occurred_at}
            for row in db.scalars(
                select(Audit)
                .where(Audit.actor_id == actor.id)
                .order_by(Audit.occurred_at.desc())
                .limit(1000)
            )
        ],
    }


def install_privacy(app, DB, Actor, public):
    contact = os.getenv("PRIVACY_CONTACT", "").strip()[:200] or None
    retention_days()  # fail fast on an invalid configuration

    @app.get("/api/v1/privacy")
    def privacy():
        return {
            "contact": contact,
            "notification_retention_days": retention_days(),
            "session_idle_minutes": 30,
            "session_max_hours": 8,
        }

    @app.get("/api/v1/me/export")
    def my_data(db: DB, actor: Actor):
        data = export(db, actor, public)
        db.add(
            Audit(
                actor_id=actor.id,
                action="data_export",
                entity="users",
                entity_id=actor.id,
                changes=json.dumps({"sections": sorted(data)}),
            )
        )
        db.commit()
        return Response(
            json.dumps(data, ensure_ascii=False, indent=2, default=str),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="meus-dados-hub.json"'},
        )
