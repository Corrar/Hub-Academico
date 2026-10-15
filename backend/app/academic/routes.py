"""Scoped academic workflows; drafts, deadlines and capacity enforced by the server."""

import json
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import HTTPException, Query, Request, Response
from sqlalchemy import and_, func, or_, select
from starlette.concurrency import run_in_threadpool

from .. import schemas, security
from ..models import (
    Attachment,
    AttendanceLesson,
    Audit,
    ClassGroup,
    Enrollment,
    Membership,
    NotificationState,
    Publication,
    Schedule,
    Submission,
    User,
    now,
)
from ..notifications import queue as push_queue
from . import files
from .clock import ZONE, local_today
from .scheduling import lock_schedule, validate_schedule
from .schemas import GradeInput, PublicationInput, ScheduleInput, SubmissionInput


def live(stamp):
    """Published, already visible and not yet taken down, by the server clock."""
    return and_(
        Publication.draft.is_(False),
        or_(Publication.publish_at.is_(None), Publication.publish_at <= stamp),
        or_(Publication.expires_at.is_(None), Publication.expires_at > stamp),
    )


def state(row, stamp=None):
    stamp = stamp or now()
    if row.archived:
        return "archived"
    if row.draft:
        return "draft"
    if row.publish_at and security.utc(row.publish_at) > stamp:
        return "scheduled"
    if row.expires_at and security.utc(row.expires_at) <= stamp:
        return "expired"
    return "published"


# Publications appear in feeds from the moment they become visible.
visible_since = func.coalesce(Publication.publish_at, Publication.created_at)


def install_learning(app, DB, Actor, Coordinator, visible_groups, public, audit):
    upload_limit = files.max_bytes()

    def present(row):
        return {**public(row), "state": state(row)}

    def active_students(group_id, on=None):
        on = on or local_today()
        return (
            select(User.id)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.group_id == group_id,
                Membership.archived.is_(False),
                Membership.starts_on <= on,
                Membership.ends_on >= on,
                User.role == "student",
                User.archived.is_(False),
            )
        )

    def group_allowed(db, actor, key):
        if not db.scalar(visible_groups(actor).where(ClassGroup.id == key)):
            raise HTTPException(404, "Turma não encontrada")

    def manager(db, actor, row):
        if actor.role == "student":
            raise HTTPException(403, "Escrita restrita à equipe acadêmica")
        if row.audience == "institution" and actor.role != "coordinator":
            raise HTTPException(403, "Publicação institucional exige coordenação")
        if row.group_id:
            group_allowed(db, actor, str(row.group_id))

    def publication(db, actor, key, write=False, include_archived=False, lock=False):
        query = select(Publication).where(Publication.id == key)
        row = db.scalar(query.with_for_update() if lock else query)
        if not row or (row.archived and not include_archived):
            raise HTTPException(404, "Publicação não encontrada")
        if row.group_id:
            group_allowed(db, actor, row.group_id)
        if write or row.archived or state(row) != "published":
            manager(db, actor, row)
        return row

    def payload(body):
        values = body.model_dump(exclude={"version"})
        if values.get("group_id"):
            values["group_id"] = str(values["group_id"])
        return values

    @app.get("/api/v1/learning/groups")
    def groups(
        db: DB,
        actor: Actor,
        offset: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
        ids: list[str] = Query(default=[], max_length=100),
    ):
        from ..models import Subject

        query = visible_groups(actor)
        if ids:
            query = query.where(ClassGroup.id.in_(ids))
        return [
            {
                "id": row.id,
                "label": db.get(Subject, row.subject_id).name
                + " · "
                + row.name
                + " · "
                + row.semester,
            }
            for row in db.scalars(query.order_by(ClassGroup.id).offset(offset).limit(limit))
        ]

    @app.get("/api/v1/learning/averages")
    def averages(db: DB, actor: Actor):
        query = (
            select(Publication.group_id, func.count(Submission.id), func.avg(Submission.grade))
            .join(Submission, Submission.publication_id == Publication.id)
            .where(
                Submission.student_id == actor.id,
                Submission.grade.is_not(None),
                Submission.draft.is_(False),
                Submission.archived.is_(False),
                Publication.archived.is_(False),
                Publication.draft.is_(False),
                Publication.group_id.in_(visible_groups(actor).with_only_columns(ClassGroup.id)),
            )
            .group_by(Publication.group_id)
        )
        return [
            {"group_id": key, "count": count, "average": average}
            for key, count, average in db.execute(query)
        ]

    @app.get("/api/v1/learning/overview")
    def overview(db: DB, actor: Actor):
        """Home counters from the same membership scope as academic reads."""
        groups = visible_groups(actor).with_only_columns(ClassGroup.id)
        scope = or_(Publication.audience == "institution", Publication.group_id.in_(groups))
        published = select(Publication).where(scope, Publication.archived.is_(False), live(now()))
        activities = published.where(Publication.kind == "activity")
        sent = select(Submission.publication_id).where(
            Submission.student_id == actor.id,
            Submission.draft.is_(False),
            Submission.archived.is_(False),
        )
        if actor.role == "student":
            pending = activities.where(Publication.id.not_in(sent))
            pending_count = db.scalar(select(func.count()).select_from(pending.subquery()))
        else:
            pending = activities
            pending_count = db.scalar(
                select(func.count())
                .select_from(Submission)
                .where(
                    Submission.publication_id.in_(activities.with_only_columns(Publication.id)),
                    Submission.draft.is_(False),
                    Submission.archived.is_(False),
                    Submission.grade.is_(None),
                )
            )
        today = local_today()
        lessons = (
            select(Schedule)
            .where(
                Schedule.group_id.in_(groups),
                Schedule.archived.is_(False),
                Schedule.starts_on <= today,
                Schedule.ends_on >= today,
                Schedule.weekday == today.weekday(),
            )
            .order_by(Schedule.starts_minute, Schedule.id)
        )
        materials = published.where(Publication.kind == "material")
        recorded = []
        if actor.role != "student":
            recorded = list(
                db.scalars(
                    select(AttendanceLesson.schedule_id).where(
                        AttendanceLesson.lesson_date == today,
                        AttendanceLesson.archived.is_(False),
                        AttendanceLesson.group_id.in_(groups),
                    )
                )
            )
        return {
            "date": today.isoformat(),
            "recorded_today": recorded,
            "groups_count": db.scalar(select(func.count()).select_from(groups.subquery())),
            "pending_count": pending_count,
            "material_count": db.scalar(select(func.count()).select_from(materials.subquery())),
            "lessons_today": [public(row) for row in db.scalars(lessons)],
            "upcoming": [
                present(row)
                for row in db.scalars(
                    pending.where(Publication.due_at >= now())
                    .order_by(Publication.due_at, Publication.id)
                    .limit(5)
                )
            ],
            "recent": [
                present(row)
                for row in db.scalars(
                    published.where(Publication.kind.in_(["notice", "event"]))
                    .order_by(visible_since.desc(), Publication.id)
                    .limit(8)
                )
            ],
        }

    @app.get("/api/v1/learning/calendar")
    def calendar(db: DB, actor: Actor, month: str = Query(pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")):
        year, number = map(int, month.split("-"))
        zone = ZONE
        start = datetime(year, number, 1, tzinfo=zone).astimezone(timezone.utc)
        end = datetime(year + (number == 12), number % 12 + 1, 1, tzinfo=zone).astimezone(
            timezone.utc
        )
        groups = visible_groups(actor).with_only_columns(ClassGroup.id)
        publications = list(
            db.scalars(
                select(Publication)
                .where(
                    or_(Publication.audience == "institution", Publication.group_id.in_(groups)),
                    Publication.archived.is_(False),
                    live(now()),
                    or_(
                        (Publication.kind == "activity")
                        & (Publication.due_at >= start)
                        & (Publication.due_at < end),
                        (Publication.kind == "event")
                        & (Publication.starts_at < end)
                        & (Publication.ends_at >= start),
                    ),
                )
                .order_by(Publication.id)
                .limit(501)
            )
        )
        lessons = list(
            db.scalars(
                select(Schedule)
                .where(
                    Schedule.group_id.in_(groups),
                    Schedule.archived.is_(False),
                    Schedule.starts_on < end.astimezone(zone).date(),
                    Schedule.ends_on >= date(year, number, 1),
                )
                .order_by(Schedule.weekday, Schedule.starts_minute, Schedule.id)
                .limit(501)
            )
        )
        return {
            "publications": [present(row) for row in publications[:500]],
            "lessons": [public(row) for row in lessons[:500]],
            "truncated": len(publications) > 500 or len(lessons) > 500,
        }

    @app.get("/api/v1/learning/publications")
    def listing(
        db: DB,
        actor: Actor,
        kind: Literal["activity", "material", "notice", "event"],
        archived: bool = False,
        q: str = Query("", max_length=120),
        group_id: str | None = Query(None, max_length=36),
        offset: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
    ):
        groups = visible_groups(actor).with_only_columns(ClassGroup.id)
        scope = or_(Publication.audience == "institution", Publication.group_id.in_(groups))
        query = select(Publication).where(
            Publication.kind == kind, Publication.archived == archived, scope
        )
        if group_id:
            query = query.where(Publication.group_id == group_id)
        if q:
            query = query.where(
                or_(
                    Publication.title.icontains(q, autoescape=True),
                    Publication.body.icontains(q, autoescape=True),
                )
            )
        if actor.role == "student":
            if archived:
                raise HTTPException(403, "Histórico restrito à equipe acadêmica")
            query = query.where(live(now()))
        elif actor.role == "teacher":
            query = query.where(or_(live(now()), Publication.audience == "group"))
            if archived:
                query = query.where(Publication.audience == "group")
        rows = list(
            db.scalars(
                query.order_by(visible_since.desc(), Publication.id).offset(offset).limit(limit)
            )
        )
        result = [present(row) for row in rows]
        if kind == "activity" and rows:
            if actor.role == "student":
                mine = {
                    item.publication_id: item
                    for item in db.scalars(
                        select(Submission).where(
                            Submission.student_id == actor.id,
                            Submission.publication_id.in_([row.id for row in rows]),
                            Submission.archived.is_(False),
                        )
                    )
                }
                for item in result:
                    item["my_submission"] = submission_state(mine.get(item["id"]))
            else:
                for item in result:
                    item.update(delivery_counts(db, item["id"], item["group_id"]))
        return result

    def submission_state(row):
        if row is None:
            return None
        return {
            "state": "graded" if row.grade is not None else "draft" if row.draft else "submitted",
            "grade": row.grade,
            "submitted_at": row.submitted_at,
        }

    def delivery_counts(db, key, group_id):
        submitted, graded = db.execute(
            select(func.count(Submission.id), func.count(Submission.grade)).where(
                Submission.publication_id == key,
                Submission.draft.is_(False),
                Submission.archived.is_(False),
            )
        ).one()
        students = db.scalar(select(func.count()).select_from(active_students(group_id).subquery()))
        return {"students_count": students, "submitted_count": submitted, "graded_count": graded}

    @app.post("/api/v1/learning/publications", status_code=201)
    def create(body: PublicationInput, db: DB, actor: Actor):
        manager(db, actor, body)
        row = Publication(**payload(body), creator_id=actor.id)
        db.add(row)
        audit(db, actor, "create", row)
        push_queue.fanout(db, row)
        db.commit()
        return present(row)

    @app.put("/api/v1/learning/publications/{key}")
    def update(key: str, body: PublicationInput, db: DB, actor: Actor):
        row = publication(db, actor, key, write=True, lock=True)
        if row.version != body.version:
            raise HTTPException(409, "A publicação mudou. Atualize antes de salvar")
        if (
            row.kind != body.kind
            or row.group_id != (str(body.group_id) if body.group_id else None)
            or row.audience != body.audience
        ):
            raise HTTPException(409, "Não é permitido transferir publicação ou alterar o público")
        if not row.draft and body.draft:
            raise HTTPException(409, "Use arquivamento para retirar uma publicação")
        if state(row) == "published" and body.publish_at and security.utc(body.publish_at) > now():
            raise HTTPException(409, "Publicação já visível não pode voltar a ser agendada")
        if row.kind == "event":
            count = db.scalar(
                select(func.count())
                .select_from(Enrollment)
                .where(Enrollment.publication_id == key, Enrollment.archived.is_(False))
            )
            if body.capacity and count > body.capacity:
                raise HTTPException(409, "Capacidade menor que as inscrições existentes")
        before = public(row)
        for field, value in payload(body).items():
            setattr(row, field, value)
        row.version += 1
        audit(db, actor, "update", row, before)
        push_queue.fanout(db, row)
        db.commit()
        return present(row)

    @app.patch("/api/v1/learning/publications/{key}/archive")
    def archive(key: str, body: schemas.ArchiveInput, db: DB, actor: Actor):
        row = publication(db, actor, key, write=True, include_archived=True, lock=True)
        before = public(row)
        row.archived = body.archived
        row.version += 1
        audit(db, actor, "archive" if body.archived else "restore", row, before)
        db.commit()
        return present(row)

    @app.put("/api/v1/learning/activities/{key}/submission")
    def submit(key: str, body: SubmissionInput, db: DB, actor: Actor):
        row = publication(db, actor, key, lock=True)
        if actor.role != "student" or row.kind != "activity" or state(row) != "published":
            raise HTTPException(403, "Entrega restrita ao aluno da atividade publicada")
        if security.now() > security.utc(row.due_at):
            raise HTTPException(409, "Prazo de entrega encerrado")
        result = db.scalar(
            select(Submission).where(
                Submission.publication_id == key, Submission.student_id == actor.id
            )
        )
        before = public(result) if result else None
        if result and (result.version != body.version or result.grade is not None):
            raise HTTPException(
                409, "Entrega alterada ou já avaliada; atualize ou solicite reabertura"
            )
        if not result:
            if body.version:
                raise HTTPException(409, "Entrega inexistente")
            result = Submission(publication_id=key, student_id=actor.id)
            db.add(result)
        else:
            result.version += 1
        result.body, result.draft, result.archived = body.body, body.draft, False
        result.submitted_at = None if body.draft else security.now()
        audit(db, actor, "submission_saved" if body.draft else "submitted", result, before)
        db.commit()
        return public(result)

    @app.get("/api/v1/learning/activities/{key}/submissions")
    def submissions(
        key: str,
        db: DB,
        actor: Actor,
        offset: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
        pending: bool = False,
    ):
        activity = publication(db, actor, key)
        if activity.kind != "activity":
            raise HTTPException(404, "Atividade não encontrada")
        query = select(Submission).where(
            Submission.publication_id == key, Submission.archived.is_(False)
        )
        query = (
            query.where(Submission.student_id == actor.id)
            if actor.role == "student"
            else query.where(Submission.draft.is_(False))
        )
        if pending:
            query = query.where(Submission.grade.is_(None))
        rows = db.execute(
            query.join(User, User.id == Submission.student_id)
            .add_columns(User.name)
            .order_by(User.name, Submission.id)
            .offset(offset)
            .limit(limit)
        )
        return [
            {
                **public(row),
                "student_name": name,
                "late": bool(
                    row.submitted_at
                    and security.utc(row.submitted_at) > security.utc(activity.due_at)
                ),
            }
            for row, name in rows
        ]

    @app.get("/api/v1/learning/activities/{key}/summary")
    def delivery_summary(key: str, db: DB, actor: Actor):
        activity = publication(db, actor, key, write=True)
        if activity.kind != "activity":
            raise HTTPException(404, "Atividade não encontrada")
        sent = select(Submission.student_id).where(
            Submission.publication_id == key,
            Submission.draft.is_(False),
            Submission.archived.is_(False),
        )
        missing = db.execute(
            select(User.id, User.name)
            .where(User.id.in_(active_students(activity.group_id)), User.id.not_in(sent))
            .order_by(User.name, User.id)
            .limit(200)
        )
        counts = delivery_counts(db, key, activity.group_id)
        return {
            **counts,
            "pending_count": counts["submitted_count"] - counts["graded_count"],
            "missing": [{"id": item, "name": name} for item, name in missing],
            "due_at": activity.due_at,
            "closed": security.now() > security.utc(activity.due_at),
        }

    @app.put("/api/v1/learning/submissions/{key}/grade")
    def grade(key: str, body: GradeInput, db: DB, actor: Actor):
        row = db.get(Submission, key)
        if not row:
            raise HTTPException(404, "Entrega não encontrada")
        publication(db, actor, row.publication_id, write=True, lock=True)
        db.refresh(row)
        if row.draft or row.archived or row.version != body.version:
            raise HTTPException(409, "Entrega indisponível ou alterada")
        before = public(row)
        row.grade, row.feedback = body.grade, body.feedback
        row.graded_at = security.now() if body.grade is not None else None
        row.version += 1
        audit(db, actor, "graded", row, before)
        push_queue.graded(db, row)
        db.commit()
        return public(row)

    @app.get("/api/v1/learning/events/{key}/enrollment")
    def enrollment(key: str, db: DB, actor: Actor):
        event = publication(db, actor, key)
        if event.kind != "event":
            raise HTTPException(404, "Evento não encontrado")
        count = db.scalar(
            select(func.count())
            .select_from(Enrollment)
            .where(Enrollment.publication_id == key, Enrollment.archived.is_(False))
        )
        mine = db.scalar(
            select(Enrollment).where(
                Enrollment.publication_id == key,
                Enrollment.user_id == actor.id,
                Enrollment.archived.is_(False),
            )
        )
        return {"enrolled": bool(mine), "count": count, "capacity": event.capacity}

    @app.put("/api/v1/learning/events/{key}/enrollment")
    def enroll(key: str, body: schemas.ArchiveInput, db: DB, actor: Actor):
        event = publication(db, actor, key, lock=True)
        if (
            event.kind != "event"
            or state(event) != "published"
            or security.now() >= security.utc(event.starts_at)
        ):
            raise HTTPException(409, "Inscrição fora do período permitido")
        row = db.scalar(
            select(Enrollment).where(
                Enrollment.publication_id == key, Enrollment.user_id == actor.id
            )
        )
        if not body.archived and (not row or row.archived):
            count = db.scalar(
                select(func.count())
                .select_from(Enrollment)
                .where(Enrollment.publication_id == key, Enrollment.archived.is_(False))
            )
            if event.capacity and count >= event.capacity:
                raise HTTPException(409, "Vagas esgotadas")
        before = public(row) if row else None
        if not row:
            row = Enrollment(publication_id=key, user_id=actor.id)
            db.add(row)
        row.archived = body.archived
        audit(db, actor, "event_cancel" if body.archived else "event_enroll", row, before)
        db.commit()
        return {"enrolled": not row.archived}

    @app.get("/api/v1/learning/events/{key}/enrollments")
    def enrollments(
        key: str,
        db: DB,
        actor: Actor,
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
    ):
        event = publication(db, actor, key, write=True)
        if event.kind != "event":
            raise HTTPException(404, "Evento não encontrado")
        rows = db.execute(
            select(Enrollment.created_at, User.id, User.name, User.email, User.role)
            .join(User, User.id == Enrollment.user_id)
            .where(Enrollment.publication_id == key, Enrollment.archived.is_(False))
            .order_by(Enrollment.created_at, Enrollment.id)
            .offset(offset)
            .limit(limit)
        )
        return [
            {"user_id": user, "name": name, "email": email, "role": role, "created_at": created}
            for created, user, name, email, role in rows
        ]

    @app.get("/api/v1/learning/reach")
    def reach(
        db: DB,
        actor: Actor,
        audience: Literal["group", "institution"],
        group_id: str | None = Query(None, max_length=36),
    ):
        """Show how many people a publication reaches before it is confirmed."""
        if actor.role == "student":
            raise HTTPException(403, "Escrita restrita à equipe acadêmica")
        if audience == "institution":
            if actor.role != "coordinator":
                raise HTTPException(403, "Publicação institucional exige coordenação")
            counts = dict(
                db.execute(
                    select(User.role, func.count())
                    .where(User.archived.is_(False))
                    .group_by(User.role)
                ).all()
            )
        else:
            if not group_id:
                raise HTTPException(422, "Selecione a turma")
            group_allowed(db, actor, group_id)
            today = local_today()
            counts = dict(
                db.execute(
                    select(User.role, func.count(func.distinct(User.id)))
                    .join(Membership, Membership.user_id == User.id)
                    .where(
                        Membership.group_id == group_id,
                        Membership.archived.is_(False),
                        Membership.starts_on <= today,
                        Membership.ends_on >= today,
                        User.archived.is_(False),
                    )
                    .group_by(User.role)
                ).all()
            )
        return {
            "students": counts.get("student", 0),
            "teachers": counts.get("teacher", 0),
            "coordinators": counts.get("coordinator", 0),
            "total": sum(counts.values()),
        }

    @app.get("/api/v1/learning/schedule")
    def schedule(
        db: DB,
        actor: Actor,
        archived: bool = False,
        group_id: str | None = Query(None, max_length=36),
        offset: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
    ):
        if archived and actor.role != "coordinator":
            raise HTTPException(403, "Histórico restrito à coordenação")
        query = select(Schedule).where(
            Schedule.group_id.in_(visible_groups(actor).with_only_columns(ClassGroup.id)),
            Schedule.archived == archived,
        )
        if group_id:
            query = query.where(Schedule.group_id == group_id)
        return [
            public(row)
            for row in db.scalars(
                query.order_by(Schedule.weekday, Schedule.starts_minute, Schedule.id)
                .offset(offset)
                .limit(limit)
            )
        ]

    def schedule_write(db, actor, body, row=None, restore=False):
        lock_schedule(db)
        if row:
            db.refresh(row)
            if row.archived and not restore:
                raise HTTPException(409, "Horário arquivado durante a edição")
        group_allowed(db, actor, str(body.group_id))
        validate_schedule(db, body, row.id if row else None)
        before = public(row) if row else None
        if not row:
            row = Schedule(**payload(body))
            db.add(row)
        else:
            for field, value in payload(body).items():
                setattr(row, field, value)
        if restore:
            row.archived = False
        audit(db, actor, "restore" if restore else "schedule_saved", row, before)
        db.commit()
        return public(row)

    @app.post("/api/v1/learning/schedule", status_code=201)
    def add_schedule(body: ScheduleInput, db: DB, actor: Coordinator):
        return schedule_write(db, actor, body)

    @app.put("/api/v1/learning/schedule/{key}")
    def edit_schedule(key: str, body: ScheduleInput, db: DB, actor: Coordinator):
        row = db.get(Schedule, key)
        if not row or row.archived:
            raise HTTPException(404, "Horário não encontrado")
        return schedule_write(db, actor, body, row)

    @app.patch("/api/v1/learning/schedule/{key}/archive")
    def archive_schedule(key: str, body: schemas.ArchiveInput, db: DB, actor: Coordinator):
        lock_schedule(db)
        row = db.get(Schedule, key)
        if not row:
            raise HTTPException(404, "Horário não encontrado")
        before = public(row)
        if not body.archived:
            # Re-run conflict validation before restoration.
            values = public(row)
            for field in ["id", "archived"]:
                values.pop(field)
            return schedule_write(db, actor, ScheduleInput(**values), row, restore=True)
        row.archived = True
        audit(db, actor, "archive", row, before)
        db.commit()
        return public(row)

    def attachment_scope(db, actor, kind, key, write=False):
        if kind == "publication":
            return publication(db, actor, key, write=write, lock=write)
        row = db.get(Submission, key)
        if not row or row.archived:
            raise HTTPException(404, "Entrega não encontrada")
        activity = publication(db, actor, row.publication_id, lock=write)
        if write:
            db.refresh(row)
        if actor.role == "student":
            if row.student_id != actor.id:
                raise HTTPException(404, "Entrega não encontrada")
            if write and (
                security.now() > security.utc(activity.due_at)
                or row.grade is not None
                or not row.draft
            ):
                raise HTTPException(409, "Anexe no rascunho antes do prazo e da avaliação")
        else:
            if write or row.draft:
                raise HTTPException(403, "Anexo de entrega é exclusivo do próprio aluno")
        return row

    @app.get("/api/v1/learning/{kind}/{key}/attachments")
    def attachments(kind: Literal["publication", "submission"], key: str, db: DB, actor: Actor):
        attachment_scope(db, actor, kind, key)
        field = Attachment.publication_id if kind == "publication" else Attachment.submission_id
        return [
            {
                "id": row.id,
                "name": row.name,
                "media_type": row.media_type,
                "size": row.size,
                "created_at": row.created_at,
            }
            for row in db.scalars(
                select(Attachment).where(field == key, Attachment.archived.is_(False)).limit(10)
            )
        ]

    @app.get("/api/v1/learning/attachment-types")
    def attachment_types(actor: Actor):
        return {
            "extensions": files.accepted_extensions(),
            "max_bytes": upload_limit,
            "text_max_bytes": min(files.TEXT_LIMIT, upload_limit),
        }

    @app.post("/api/v1/learning/{kind}/{key}/attachments", status_code=201)
    async def upload(
        kind: Literal["publication", "submission"], key: str, request: Request, db: DB, actor: Actor
    ):
        await run_in_threadpool(attachment_scope, db, actor, kind, key)
        declared = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if declared not in files.DECLARED:
            raise HTTPException(415, "Tipo de arquivo não aceito")
        name = files.clean_name(request.headers.get("x-file-name", ""))
        if not name:
            raise HTTPException(422, "Use um nome de arquivo simples, com extensão")
        file_kind = files.kind_for(name)
        if not file_kind:
            raise HTTPException(
                415, "Formatos aceitos: " + ", ".join(files.accepted_extensions()).upper()
            )
        maximum = files.limit_for(file_kind, upload_limit)
        content = bytearray()
        async for chunk in request.stream():
            if len(content) + len(chunk) > maximum:
                raise HTTPException(413, f"Limite de {maximum // 1024} KiB para este formato")
            content.extend(chunk)
        problem = files.verify(file_kind, name, bytes(content))
        if problem:
            raise HTTPException(415, problem)
        return await run_in_threadpool(
            save_attachment, db, actor, kind, key, name, bytes(content), file_kind.media_type
        )

    def save_attachment(db, actor, kind, key, name, content, media_type):
        attachment_scope(db, actor, kind, key, write=True)
        field = Attachment.publication_id if kind == "publication" else Attachment.submission_id
        if db.scalar(select(func.count()).select_from(Attachment).where(field == key)) >= 10:
            raise HTTPException(409, "Limite de dez arquivos por registro")
        row = Attachment(
            **{field.key: key},
            owner_id=actor.id,
            name=name,
            content=bytes(content),
            media_type=media_type,
            size=len(content),
        )
        db.add(row)
        db.flush()
        # Never copy file contents into the audit trail.
        db.add(
            Audit(
                actor_id=actor.id,
                action="attachment_added",
                entity="attachments",
                entity_id=row.id,
                changes=json.dumps(
                    {"name": name, "bytes": len(content), "type": media_type, "target": key}
                ),
            )
        )
        db.commit()
        return {"id": row.id, "name": row.name, "media_type": media_type, "size": len(content)}

    @app.get("/api/v1/learning/attachments/{key}")
    def download(key: str, db: DB, actor: Actor):
        row = db.get(Attachment, key)
        if not row or row.archived:
            raise HTTPException(404, "Arquivo não encontrado")
        kind, target = (
            ("publication", row.publication_id)
            if row.publication_id
            else ("submission", row.submission_id)
        )
        attachment_scope(db, actor, kind, target)
        return Response(
            row.content,
            media_type=row.media_type,
            headers={
                "Content-Disposition": files.disposition(row.name),
                "Content-Security-Policy": "sandbox; default-src 'none'",
            },
        )

    @app.patch("/api/v1/learning/attachments/{key}/archive")
    def archive_attachment(key: str, body: schemas.ArchiveInput, db: DB, actor: Actor):
        row = db.get(Attachment, key)
        if not row:
            raise HTTPException(404, "Arquivo não encontrado")
        kind, target = (
            ("publication", row.publication_id)
            if row.publication_id
            else ("submission", row.submission_id)
        )
        attachment_scope(db, actor, kind, target, write=True)
        row.archived = body.archived
        db.add(
            Audit(
                actor_id=actor.id,
                action="attachment_archive",
                entity="attachments",
                entity_id=row.id,
                changes=json.dumps({"archived": row.archived}),
            )
        )
        db.commit()
        return {"id": row.id, "archived": row.archived}

    def feed(db, actor, since=None, limit=30):
        """In-app reminders: visible publications by others and grades received."""
        stamp = now()
        groups = visible_groups(actor).with_only_columns(ClassGroup.id)
        query = select(Publication).where(
            or_(Publication.audience == "institution", Publication.group_id.in_(groups)),
            Publication.archived.is_(False),
            Publication.creator_id != actor.id,
            live(stamp),
        )
        grades = (
            select(Submission, Publication)
            .join(Publication, Publication.id == Submission.publication_id)
            .where(
                Submission.student_id == actor.id,
                Submission.archived.is_(False),
                Submission.graded_at.is_not(None),
                Publication.archived.is_(False),
                Publication.group_id.in_(groups),
            )
        )
        if since:
            query = query.where(visible_since > since)
            grades = grades.where(Submission.graded_at > since)
        items = [
            {
                "type": "publication",
                "id": row.id,
                "kind": row.kind,
                "title": row.title,
                "group_id": row.group_id,
                "at": security.utc(row.publish_at or row.created_at),
                "publication": present(row),
            }
            for row in db.scalars(query.order_by(visible_since.desc(), Publication.id).limit(limit))
        ]
        items += [
            {
                "type": "grade",
                "id": submission.id,
                "kind": "activity",
                "title": activity.title,
                "group_id": activity.group_id,
                "at": security.utc(submission.graded_at),
                "grade": submission.grade,
                "publication": present(activity),
            }
            for submission, activity in db.execute(
                grades.order_by(Submission.graded_at.desc()).limit(limit)
            )
        ]
        return sorted(items, key=lambda item: item["at"], reverse=True)[:limit]

    @app.get("/api/v1/learning/notifications")
    def notifications(db: DB, actor: Actor, limit: int = Query(30, ge=1, le=50)):
        marker = db.get(NotificationState, actor.id)
        read_at = security.utc(marker.read_at) if marker else None
        items = feed(db, actor, limit=limit)
        for item in items:
            item["unread"] = read_at is None or item["at"] > read_at
        return {
            "read_at": read_at,
            "unread": len(feed(db, actor, since=read_at, limit=50)),
            "items": items,
        }

    @app.post("/api/v1/learning/notifications/read", status_code=204)
    def mark_read(db: DB, actor: Actor):
        marker = db.get(NotificationState, actor.id)
        if marker:
            marker.read_at = now()
        else:
            db.add(NotificationState(user_id=actor.id, read_at=now()))
        db.commit()
        return Response(status_code=204)
