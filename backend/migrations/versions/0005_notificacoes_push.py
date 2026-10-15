"""notificações push: dispositivos, preferências e fila de envio

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-16

Existing publications are marked as already fanned out so that enabling push
never notifies old content.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("publications", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fanout_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE publications SET fanout_at = created_at")

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("endpoint_hash", sa.String(length=64), nullable=False),
        sa.Column("p256dh", sa.String(length=200), nullable=True),
        sa.Column("auth", sa.String(length=100), nullable=True),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.CheckConstraint("channel IN ('web','expo')"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint_hash"),
    )
    with op.batch_alter_table("push_subscriptions", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_push_subscriptions_user_id"), ["user_id"], unique=False
        )

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("notices", sa.Boolean(), nullable=False),
        sa.Column("activities", sa.Boolean(), nullable=False),
        sa.Column("materials", sa.Boolean(), nullable=False),
        sa.Column("events", sa.Boolean(), nullable=False),
        sa.Column("grades", sa.Boolean(), nullable=False),
        sa.Column("deadlines", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "notification_outbox",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("publication_id", sa.String(length=36), nullable=True),
        sa.Column("submission_id", sa.String(length=36), nullable=True),
        sa.Column("dedup_key", sa.String(length=160), nullable=False),
        sa.Column("deliver_after", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.String(length=300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('pending','sent','failed','skipped')"),
        sa.ForeignKeyConstraint(["publication_id"], ["publications.id"]),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedup_key"),
    )
    with op.batch_alter_table("notification_outbox", schema=None) as batch_op:
        batch_op.create_index(
            "ix_notification_outbox_due", ["status", "deliver_after"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_notification_outbox_user_id"), ["user_id"], unique=False
        )


def downgrade() -> None:
    raise RuntimeError("Migração de notificações não reversível: restaure um backup verificado.")
