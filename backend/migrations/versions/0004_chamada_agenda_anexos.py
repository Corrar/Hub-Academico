"""chamada, agenda de publicações, anexos tipados e lembretes

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-15

Adds roll-call attendance, scheduled/expiring publications, typed attachments,
grading timestamps and the per-user reminders read marker. Existing rows are
preserved; attachment sizes are backfilled from their stored content.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_states",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "attendance_lessons",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("schedule_id", sa.String(length=36), nullable=False),
        sa.Column("lesson_date", sa.Date(), nullable=False),
        sa.Column("topic", sa.String(length=200), nullable=False),
        sa.Column("recorded_by", sa.String(length=36), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["class_groups.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("schedule_id", "lesson_date"),
    )
    with op.batch_alter_table("attendance_lessons", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_attendance_lessons_group_id"), ["group_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_attendance_lessons_schedule_id"), ["schedule_id"], unique=False
        )

    op.create_table(
        "attendance_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lesson_id", sa.String(length=36), nullable=False),
        sa.Column("student_id", sa.String(length=36), nullable=False),
        sa.Column("present", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["attendance_lessons.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_id", "student_id"),
    )
    with op.batch_alter_table("attendance_records", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_attendance_records_lesson_id"), ["lesson_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_attendance_records_student_id"), ["student_id"], unique=False
        )

    # ADD COLUMN keeps the existing CHECK constraints on SQLite (no table rebuild).
    with op.batch_alter_table("attachments", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "media_type", sa.String(length=100), server_default="text/plain", nullable=False
            )
        )
        batch_op.add_column(sa.Column("size", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE attachments SET size = length(content)")

    with op.batch_alter_table("publications", schema=None) as batch_op:
        batch_op.add_column(sa.Column("publish_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("submissions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    raise RuntimeError("Migração de chamada não reversível: restaure um backup verificado.")
