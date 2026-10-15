"""fluxos academicos

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-09 07:23:31.561932

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "publications",
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("group_id", sa.String(length=36), nullable=True),
        sa.Column("audience", sa.String(length=20), nullable=False),
        sa.Column("creator_id", sa.String(length=36), nullable=False),
        sa.Column("draft", sa.Boolean(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "(audience = 'group' AND group_id IS NOT NULL) OR (audience = 'institution' AND group_id IS NULL)"
        ),
        sa.CheckConstraint("audience IN ('group','institution')"),
        sa.CheckConstraint("kind IN ('activity','material','notice','event')"),
        sa.CheckConstraint("capacity IS NULL OR capacity > 0"),
        sa.ForeignKeyConstraint(
            ["creator_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["class_groups.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("publications", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_publications_group_id"), ["group_id"], unique=False)

    op.create_table(
        "schedules",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("starts_minute", sa.Integer(), nullable=False),
        sa.Column("ends_minute", sa.Integer(), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("room", sa.String(length=120), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.CheckConstraint("ends_on >= starts_on"),
        sa.CheckConstraint(
            "starts_minute >= 0 AND ends_minute <= 1440 AND ends_minute > starts_minute"
        ),
        sa.CheckConstraint("weekday >= 0 AND weekday <= 6"),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["class_groups.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("schedules", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_schedules_group_id"), ["group_id"], unique=False)

    op.create_table(
        "event_enrollments",
        sa.Column("publication_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["publication_id"],
            ["publications.id"],
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("publication_id", "user_id"),
    )
    with op.batch_alter_table("event_enrollments", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_event_enrollments_publication_id"), ["publication_id"], unique=False
        )

    op.create_table(
        "submissions",
        sa.Column("publication_id", sa.String(length=36), nullable=False),
        sa.Column("student_id", sa.String(length=36), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("draft", sa.Boolean(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("grade", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.CheckConstraint("grade IS NULL OR (grade >= 0 AND grade <= 10)"),
        sa.ForeignKeyConstraint(
            ["publication_id"],
            ["publications.id"],
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("publication_id", "student_id"),
    )
    with op.batch_alter_table("submissions", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_submissions_publication_id"), ["publication_id"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_submissions_student_id"), ["student_id"], unique=False)

    op.create_table(
        "attachments",
        sa.Column("publication_id", sa.String(length=36), nullable=True),
        sa.Column("submission_id", sa.String(length=36), nullable=True),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.CheckConstraint("(publication_id IS NULL) != (submission_id IS NULL)"),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["publication_id"],
            ["publications.id"],
        ),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            ["submissions.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("attachments", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_attachments_publication_id"), ["publication_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_attachments_submission_id"), ["submission_id"], unique=False
        )


def downgrade() -> None:
    raise RuntimeError("Migração acadêmica não reversível: restaure um backup verificado.")
