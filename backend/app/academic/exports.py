"""CSV exports for staff: attendance and grades per class, ready for spreadsheets.

Semicolon separator, decimal comma and UTF-8 BOM match Excel in pt-BR. Cells
that a spreadsheet could execute as a formula are neutralized. Every export is
audited because it moves personal data out of the hub.
"""

import csv
import io
import json

from fastapi import HTTPException, Response
from sqlalchemy import select

from ..models import (
    AttendanceLesson,
    AttendanceRecord,
    Audit,
    ClassGroup,
    Membership,
    Publication,
    Subject,
    Submission,
    User,
)


def cell(value):
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def number(value):
    return "" if value is None else f"{value:.1f}".replace(".", ",")


def csv_response(rows, filename):
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    for row in rows:
        writer.writerow([cell(value) for value in row])
    return Response(
        "﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def install_exports(app, DB, Actor, visible_groups):
    def scope(db, actor, key):
        if actor.role == "student":
            raise HTTPException(403, "Exportação restrita a professores e coordenação")
        if not db.scalar(visible_groups(actor).where(ClassGroup.id == key)):
            raise HTTPException(404, "Turma não encontrada")
        group = db.get(ClassGroup, key)
        subject = db.get(Subject, group.subject_id)
        slug = "".join(ch if ch.isalnum() else "-" for ch in f"{subject.code}-{group.name}")
        return group, subject, slug.lower()

    def students(db, key):
        return db.execute(
            select(User.id, User.name, User.email)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.group_id == key,
                Membership.archived.is_(False),
                User.role == "student",
            )
            .order_by(User.name, User.id)
        ).all()

    def record(db, actor, action, key, count):
        db.add(
            Audit(
                actor_id=actor.id,
                action=action,
                entity="class_groups",
                entity_id=key,
                changes=json.dumps({"students": count}),
            )
        )
        db.commit()

    @app.get("/api/v1/learning/groups/{key}/export/attendance")
    def attendance(key: str, db: DB, actor: Actor):
        group, subject, slug = scope(db, actor, key)
        lessons = db.scalars(
            select(AttendanceLesson)
            .where(AttendanceLesson.group_id == key, AttendanceLesson.archived.is_(False))
            .order_by(AttendanceLesson.lesson_date, AttendanceLesson.id)
        ).all()
        marks = {
            (row.lesson_id, row.student_id): row.present
            for row in db.scalars(
                select(AttendanceRecord).where(
                    AttendanceRecord.lesson_id.in_([lesson.id for lesson in lessons])
                )
            )
        }
        people = students(db, key)
        rows = [
            [f"Frequência registrada no hub — {subject.name} · {group.name} · {group.semester}"],
            ["Não substitui o diário oficial. P = presente, F = falta, vazio = sem vínculo."],
            ["Aluno", "E-mail"]
            + [lesson.lesson_date.strftime("%d/%m/%Y") for lesson in lessons]
            + ["Faltas", "Presença (%)"],
        ]
        for user_id, name, email in people:
            values = [marks.get((lesson.id, user_id)) for lesson in lessons]
            recorded = [value for value in values if value is not None]
            absences = recorded.count(False)
            rows.append(
                [name, email]
                + ["" if value is None else "P" if value else "F" for value in values]
                + [
                    absences,
                    number((len(recorded) - absences) * 100 / len(recorded)) if recorded else "",
                ]
            )
        record(db, actor, "attendance_export", key, len(people))
        return csv_response(rows, f"frequencia-{slug}.csv")

    @app.get("/api/v1/learning/groups/{key}/export/grades")
    def grades(key: str, db: DB, actor: Actor):
        group, subject, slug = scope(db, actor, key)
        activities = db.scalars(
            select(Publication)
            .where(
                Publication.group_id == key,
                Publication.kind == "activity",
                Publication.draft.is_(False),
                Publication.archived.is_(False),
            )
            .order_by(Publication.due_at, Publication.id)
        ).all()
        submitted = {
            (row.publication_id, row.student_id): row
            for row in db.scalars(
                select(Submission).where(
                    Submission.publication_id.in_([item.id for item in activities]),
                    Submission.draft.is_(False),
                    Submission.archived.is_(False),
                )
            )
        }
        people = students(db, key)
        rows = [
            [f"Avaliações do hub — {subject.name} · {group.name} · {group.semester}"],
            ["A média considera apenas atividades avaliadas no hub; não é a nota oficial."],
            ["Aluno", "E-mail"] + [item.title for item in activities] + ["Média do hub"],
        ]
        for user_id, name, email in people:
            values = []
            for item in activities:
                entry = submitted.get((item.id, user_id))
                values.append(
                    "sem entrega"
                    if entry is None
                    else "aguardando"
                    if entry.grade is None
                    else number(entry.grade)
                )
            graded = [
                submitted[(item.id, user_id)].grade
                for item in activities
                if (item.id, user_id) in submitted
                and submitted[(item.id, user_id)].grade is not None
            ]
            rows.append(
                [name, email] + values + [number(sum(graded) / len(graded)) if graded else ""]
            )
        record(db, actor, "grades_export", key, len(people))
        return csv_response(rows, f"notas-{slug}.csv")
