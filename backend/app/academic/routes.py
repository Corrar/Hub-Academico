"""Scoped academic workflows; drafts, deadlines and capacity enforced by the server."""

import json
import re
from datetime import date, datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from starlette.concurrency import run_in_threadpool

from .. import schemas, security
from ..models import (
    Attachment,
    Audit,
    ClassGroup,
    Enrollment,
    Publication,
    Schedule,
    Submission,
    User,
    now,
)
from .scheduling import lock_schedule, validate_schedule
from .schemas import GradeInput, PublicationInput, ScheduleInput, SubmissionInput


def install_learning(app, DB, Actor, Coordinator, visible_groups, public, audit):
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
        if write or row.draft or row.archived:
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
        published = select(Publication).where(
            scope, Publication.archived.is_(False), Publication.draft.is_(False)
        )
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
        today = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
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
        return {
            "date": today.isoformat(),
            "groups_count": db.scalar(select(func.count()).select_from(groups.subquery())),
            "pending_count": pending_count,
            "material_count": db.scalar(select(func.count()).select_from(materials.subquery())),
            "lessons_today": [public(row) for row in db.scalars(lessons)],
            "upcoming": [
                public(row)
                for row in db.scalars(
                    pending.where(Publication.due_at >= now())
                    .order_by(Publication.due_at, Publication.id)
                    .limit(5)
                )
            ],
            "recent": [
                public(row)
                for row in db.scalars(
                    published.where(Publication.kind.in_(["notice", "event"]))
                    .order_by(Publication.created_at.desc(), Publication.id)
                    .limit(8)
                )
            ],
        }

    @app.get("/api/v1/learning/calendar")
    def calendar(db: DB, actor: Actor, month: str = Query(pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")):
        year, number = map(int, month.split("-"))
        zone = ZoneInfo("America/Sao_Paulo")
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
                    Publication.draft.is_(False),
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
            "publications": [public(row) for row in publications[:500]],
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
            query = query.where(Publication.draft.is_(False))
        elif actor.role == "teacher":
            query = query.where(or_(Publication.draft.is_(False), Publication.audience == "group"))
            if archived:
                query = query.where(Publication.audience == "group")
        return [
            public(row)
            for row in db.scalars(
                query.order_by(Publication.created_at.desc(), Publication.id)
                .offset(offset)
                .limit(limit)
            )
        ]

    @app.post("/api/v1/learning/publications", status_code=201)
    def create(body: PublicationInput, db: DB, actor: Actor):
        manager(db, actor, body)
        row = Publication(**payload(body), creator_id=actor.id)
        db.add(row)
        audit(db, actor, "create", row)
        db.commit()
        return public(row)

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
        db.commit()
        return public(row)

    @app.patch("/api/v1/learning/publications/{key}/archive")
    def archive(key: str, body: schemas.ArchiveInput, db: DB, actor: Actor):
        row = publication(db, actor, key, write=True, include_archived=True, lock=True)
        before = public(row)
        row.archived = body.archived
        row.version += 1
        audit(db, actor, "archive" if body.archived else "restore", row, before)
        db.commit()
        return public(row)

    @app.put("/api/v1/learning/activities/{key}/submission")
    def submit(key: str, body: SubmissionInput, db: DB, actor: Actor):
        row = publication(db, actor, key, lock=True)
        if actor.role != "student" or row.kind != "activity" or row.draft:
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
        return [
            {**public(row), "student_name": db.get(User, row.student_id).name}
            for row in db.scalars(query.order_by(Submission.student_id).offset(offset).limit(limit))
        ]

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
        row.version += 1
        audit(db, actor, "graded", row, before)
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
        if event.kind != "event" or event.draft or security.now() >= security.utc(event.starts_at):
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
            {"id": row.id, "name": row.name}
            for row in db.scalars(
                select(Attachment).where(field == key, Attachment.archived.is_(False)).limit(10)
            )
        ]

    @app.post("/api/v1/learning/{kind}/{key}/attachments", status_code=201)
    async def upload(
        kind: Literal["publication", "submission"], key: str, request: Request, db: DB, actor: Actor
    ):
        await run_in_threadpool(attachment_scope, db, actor, kind, key)
        if request.headers.get("content-type", "").split(";")[0] != "text/plain":
            raise HTTPException(415, "Homologação aceita somente arquivos de texto UTF-8 (.txt)")
        content = bytearray()
        async for chunk in request.stream():
            if len(content) + len(chunk) > 512 * 1024:
                raise HTTPException(413, "Limite de 512 KiB por arquivo")
            content.extend(chunk)
        try:
            content.decode("utf-8")
        except UnicodeError:
            raise HTTPException(415, "Arquivo deve ser texto UTF-8") from None
        name = request.headers.get("x-file-name", "anexo.txt")
        if not re.fullmatch(r"[A-Za-z0-9 _.-]{1,96}\.txt", name):
            raise HTTPException(422, "Use nome simples terminado em .txt")
        return await run_in_threadpool(save_attachment, db, actor, kind, key, name, bytes(content))

    def save_attachment(db, actor, kind, key, name, content):
        attachment_scope(db, actor, kind, key, write=True)
        field = Attachment.publication_id if kind == "publication" else Attachment.submission_id
        if db.scalar(select(func.count()).select_from(Attachment).where(field == key)) >= 10:
            raise HTTPException(409, "Limite de dez arquivos por registro")
        row = Attachment(**{field.key: key}, owner_id=actor.id, name=name, content=bytes(content))
        db.add(row)
        db.flush()
        # Never copy file contents into the audit trail.
        db.add(
            Audit(
                actor_id=actor.id,
                action="attachment_added",
                entity="attachments",
                entity_id=row.id,
                changes=json.dumps({"name": name, "bytes": len(content), "target": key}),
            )
        )
        db.commit()
        return {"id": row.id, "name": row.name}

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
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{row.name}"',
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
