"""Roll call recorded by the teacher; the only origin of attendance shown in the hub.

The hub does not replace the official class diary. Every correction is versioned
and audited with the full list of absences before and after the change.
"""

import json
import math
import os
from datetime import date
from uuid import UUID

from fastapi import HTTPException, Query
from pydantic import Field
from sqlalchemy import func, select

from .. import schemas, security
from ..models import (
    AttendanceLesson,
    AttendanceRecord,
    Audit,
    ClassGroup,
    Membership,
    Publication,
    Schedule,
    Subject,
    Submission,
    User,
)
from .clock import local_today, occurrences


class AttendanceInput(schemas.Input):
    schedule_id: UUID
    lesson_date: date
    topic: str = Field("", max_length=200)
    absent_ids: list[UUID] = Field(default_factory=list, max_length=500)
    version: int = Field(0, ge=0)


def absence_limit():
    value = os.getenv("ATTENDANCE_ABSENCE_LIMIT_PERCENT", "25")
    try:
        limit = int(value)
    except ValueError:
        limit = 0
    if not 1 <= limit <= 100:
        raise RuntimeError("ATTENDANCE_ABSENCE_LIMIT_PERCENT deve ser um inteiro de 1 a 100.")
    return limit


def install_attendance(app, DB, Actor, visible_groups, public):
    limit_percent = absence_limit()

    def group_allowed(db, actor, key):
        if not db.scalar(visible_groups(actor).where(ClassGroup.id == key)):
            raise HTTPException(404, "Turma não encontrada")

    def staff(actor):
        if actor.role == "student":
            raise HTTPException(403, "Chamada restrita a professores e coordenação")

    def group_label(db, group_id):
        group = db.get(ClassGroup, group_id)
        subject = db.get(Subject, group.subject_id)
        return f"{subject.name} · {group.name} · {group.semester}"

    def lesson_schedule(db, actor, schedule_id, lesson_date):
        staff(actor)
        schedule = db.get(Schedule, str(schedule_id))
        if not schedule or schedule.archived:
            raise HTTPException(404, "Horário não encontrado")
        group_allowed(db, actor, schedule.group_id)
        if (
            lesson_date.weekday() != schedule.weekday
            or not schedule.starts_on <= lesson_date <= schedule.ends_on
        ):
            raise HTTPException(422, "A data não corresponde a uma aula desta grade")
        if lesson_date > local_today():
            raise HTTPException(422, "A chamada só pode ser registrada no dia da aula ou depois")
        return schedule

    def roster(db, group_id, on):
        """Students with a membership valid on the lesson date."""
        return list(
            db.execute(
                select(User.id, User.name)
                .join(Membership, Membership.user_id == User.id)
                .where(
                    Membership.group_id == group_id,
                    Membership.archived.is_(False),
                    Membership.starts_on <= on,
                    Membership.ends_on >= on,
                    User.role == "student",
                    User.archived.is_(False),
                )
                .order_by(User.name, User.id)
            )
        )

    def find_lesson(db, schedule_id, lesson_date, lock=False):
        query = select(AttendanceLesson).where(
            AttendanceLesson.schedule_id == schedule_id,
            AttendanceLesson.lesson_date == lesson_date,
        )
        return db.scalar(query.with_for_update() if lock else query)

    def records(db, lesson_id):
        return {
            row.student_id: row
            for row in db.scalars(
                select(AttendanceRecord).where(AttendanceRecord.lesson_id == lesson_id)
            )
        }

    def lesson_view(db, lesson):
        rows = records(db, lesson.id)
        absent = sorted(key for key, row in rows.items() if not row.present)
        return {
            **public(lesson),
            "present_count": len(rows) - len(absent),
            "absent_count": len(absent),
            "group_label": group_label(db, lesson.group_id),
        }

    @app.get("/api/v1/learning/attendance/sheet")
    def sheet(schedule_id: UUID, lesson_date: date, db: DB, actor: Actor):
        schedule = lesson_schedule(db, actor, schedule_id, lesson_date)
        lesson = find_lesson(db, schedule.id, lesson_date)
        existing = records(db, lesson.id) if lesson else {}
        people = {key: name for key, name in roster(db, schedule.group_id, lesson_date)}
        for key in existing.keys() - people.keys():
            people[key] = db.get(User, key).name
        students = [
            {
                "id": key,
                "name": name,
                "present": existing[key].present if key in existing else None,
            }
            for key, name in sorted(people.items(), key=lambda item: (item[1], item[0]))
        ]
        return {
            "schedule": public(schedule),
            "group_label": group_label(db, schedule.group_id),
            "lesson_date": lesson_date.isoformat(),
            "lesson": lesson_view(db, lesson) if lesson else None,
            "students": students,
        }

    @app.put("/api/v1/learning/attendance/sheet")
    def record(body: AttendanceInput, db: DB, actor: Actor):
        schedule = lesson_schedule(db, actor, body.schedule_id, body.lesson_date)
        lesson = find_lesson(db, schedule.id, body.lesson_date, lock=True)
        if lesson and lesson.archived:
            raise HTTPException(409, "Chamada arquivada; restaure antes de corrigir")
        if (lesson.version if lesson else 0) != body.version:
            raise HTTPException(409, "A chamada mudou. Atualize antes de salvar")
        existing = records(db, lesson.id) if lesson else {}
        people = {key for key, _ in roster(db, schedule.group_id, body.lesson_date)}
        people |= existing.keys()
        absent = {str(key) for key in body.absent_ids}
        if not absent <= people:
            raise HTTPException(422, "Há alunos sem vínculo com a turma nesta data")
        if not people:
            raise HTTPException(409, "Não há alunos vinculados à turma nesta data")
        before = None
        if lesson:
            before = {
                **public(lesson),
                "absent_ids": sorted(k for k, row in existing.items() if not row.present),
            }
            lesson.version += 1
        else:
            lesson = AttendanceLesson(
                group_id=schedule.group_id,
                schedule_id=schedule.id,
                lesson_date=body.lesson_date,
                recorded_by=actor.id,
            )
            db.add(lesson)
        lesson.topic = body.topic.strip()
        lesson.recorded_by, lesson.recorded_at = actor.id, security.now()
        db.flush()
        for key in people:
            if key in existing:
                existing[key].present = key not in absent
            else:
                db.add(
                    AttendanceRecord(lesson_id=lesson.id, student_id=key, present=key not in absent)
                )
        db.flush()
        db.add(
            Audit(
                actor_id=actor.id,
                action="attendance_corrected" if before else "attendance_recorded",
                entity="attendance_lessons",
                entity_id=lesson.id,
                changes=json.dumps(
                    {"before": before, "after": {**public(lesson), "absent_ids": sorted(absent)}},
                    default=str,
                ),
            )
        )
        db.commit()
        return lesson_view(db, lesson)

    @app.get("/api/v1/learning/attendance/lessons")
    def lessons(
        db: DB,
        actor: Actor,
        group_id: str | None = Query(None, max_length=36),
        archived: bool = False,
        offset: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
    ):
        staff(actor)
        query = select(AttendanceLesson).where(
            AttendanceLesson.group_id.in_(visible_groups(actor).with_only_columns(ClassGroup.id)),
            AttendanceLesson.archived == archived,
        )
        if group_id:
            query = query.where(AttendanceLesson.group_id == group_id)
        rows = db.scalars(
            query.order_by(AttendanceLesson.lesson_date.desc(), AttendanceLesson.id)
            .offset(offset)
            .limit(limit)
        )
        return [lesson_view(db, row) for row in rows]

    @app.patch("/api/v1/learning/attendance/lessons/{key}/archive")
    def archive_lesson(key: str, body: schemas.ArchiveInput, db: DB, actor: Actor):
        staff(actor)
        lesson = db.scalar(
            select(AttendanceLesson).where(AttendanceLesson.id == key).with_for_update()
        )
        if not lesson:
            raise HTTPException(404, "Chamada não encontrada")
        group_allowed(db, actor, lesson.group_id)
        if lesson.archived != body.archived:
            before = public(lesson)
            lesson.archived = body.archived
            lesson.version += 1
            db.flush()
            db.add(
                Audit(
                    actor_id=actor.id,
                    action="archive" if body.archived else "restore",
                    entity="attendance_lessons",
                    entity_id=lesson.id,
                    changes=json.dumps({"before": before, "after": public(lesson)}, default=str),
                )
            )
            db.commit()
        return lesson_view(db, lesson)

    def group_frequency(db, student_id, group_id):
        today = local_today()
        membership = db.scalar(
            select(Membership).where(
                Membership.user_id == student_id,
                Membership.group_id == group_id,
                Membership.archived.is_(False),
            )
        )
        planned = 0
        if membership:
            for row in db.scalars(
                select(Schedule).where(Schedule.group_id == group_id, Schedule.archived.is_(False))
            ):
                planned += occurrences(
                    max(row.starts_on, membership.starts_on),
                    min(row.ends_on, membership.ends_on),
                    row.weekday,
                )
        marks = list(
            db.execute(
                select(AttendanceRecord.present, AttendanceLesson)
                .join(AttendanceLesson, AttendanceLesson.id == AttendanceRecord.lesson_id)
                .where(
                    AttendanceRecord.student_id == student_id,
                    AttendanceLesson.group_id == group_id,
                    AttendanceLesson.archived.is_(False),
                )
                .order_by(AttendanceLesson.lesson_date.desc())
            )
        )
        recorded = len(marks)
        missed = [lesson for present, lesson in marks if not present]
        allowed = math.floor(planned * limit_percent / 100)
        remaining = allowed - len(missed)
        if not recorded:
            state = "no_data"
        elif remaining < 0:
            state = "exceeded"
        elif remaining == 0:
            state = "critical"
        elif remaining <= 2:
            state = "warning"
        else:
            state = "ok"
        upcoming = sum(
            occurrences(max(row.starts_on, today), row.ends_on, row.weekday)
            for row in db.scalars(
                select(Schedule).where(Schedule.group_id == group_id, Schedule.archived.is_(False))
            )
        )
        return {
            "group_id": group_id,
            "group_label": group_label(db, group_id),
            "planned_lessons": planned,
            "recorded_lessons": recorded,
            "absences": len(missed),
            "attendance_percent": (
                round((recorded - len(missed)) * 100 / recorded, 1) if recorded else None
            ),
            "allowed_absences": allowed,
            "remaining_absences": remaining,
            "remaining_lessons": upcoming,
            "state": state,
            "missed": [
                {"lesson_date": lesson.lesson_date.isoformat(), "topic": lesson.topic}
                for lesson in missed[:50]
            ],
        }

    @app.get("/api/v1/learning/attendance/summary")
    def summary(db: DB, actor: Actor, student_id: str | None = Query(None, max_length=36)):
        student = actor
        if student_id and student_id != actor.id:
            staff(actor)
            student = db.get(User, student_id)
            if not student or student.archived or student.role != "student":
                raise HTTPException(404, "Aluno não encontrado")
        elif actor.role != "student":
            raise HTTPException(422, "Informe o aluno")
        groups = visible_groups(student).with_only_columns(ClassGroup.id)
        shared = visible_groups(actor).where(ClassGroup.id.in_(groups))
        items = [
            group_frequency(db, student.id, row.id)
            for row in db.scalars(shared.order_by(ClassGroup.id).limit(100))
        ]
        recorded = sum(item["recorded_lessons"] for item in items)
        absences = sum(item["absences"] for item in items)
        return {
            "student": {"id": student.id, "name": student.name},
            "limit_percent": limit_percent,
            "recorded_lessons": recorded,
            "absences": absences,
            "attendance_percent": (
                round((recorded - absences) * 100 / recorded, 1) if recorded else None
            ),
            "groups": sorted(items, key=lambda item: item["remaining_absences"]),
            "notice": "Frequência registrada pelo professor no hub. Não substitui o diário oficial.",
        }

    @app.get("/api/v1/learning/groups/{key}/students")
    def students(
        key: str,
        db: DB,
        actor: Actor,
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
    ):
        staff(actor)
        group_allowed(db, actor, key)
        today = local_today()
        people = db.scalars(
            select(User)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.group_id == key,
                Membership.archived.is_(False),
                Membership.starts_on <= today,
                Membership.ends_on >= today,
                User.role == "student",
                User.archived.is_(False),
            )
            .order_by(User.name, User.id)
            .offset(offset)
            .limit(limit)
        )
        activities = select(Publication.id).where(
            Publication.group_id == key,
            Publication.kind == "activity",
            Publication.archived.is_(False),
            Publication.draft.is_(False),
        )
        result = []
        for person in people:
            submitted, graded, average = db.execute(
                select(
                    func.count(Submission.id),
                    func.count(Submission.grade),
                    func.avg(Submission.grade),
                ).where(
                    Submission.student_id == person.id,
                    Submission.publication_id.in_(activities),
                    Submission.draft.is_(False),
                    Submission.archived.is_(False),
                )
            ).one()
            frequency = group_frequency(db, person.id, key)
            result.append(
                {
                    "id": person.id,
                    "name": person.name,
                    "email": person.email,
                    "submitted": submitted,
                    "graded": graded,
                    "average": average,
                    "absences": frequency["absences"],
                    "recorded_lessons": frequency["recorded_lessons"],
                    "attendance_percent": frequency["attendance_percent"],
                    "attendance_state": frequency["state"],
                }
            )
        return {
            "activities": db.scalar(select(func.count()).select_from(activities.subquery())),
            "students": result,
        }
