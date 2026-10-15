"""Microsoft identities, explicit administrator grants and authenticated sessions.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    # Existing sessions lack authentication provenance: require a fresh login.
    op.execute("DELETE FROM sessions")
    op.add_column("sessions", sa.Column("id", sa.String(36), nullable=True))
    op.create_index("ix_sessions_id", "sessions", ["id"], unique=True)
    op.add_column(
        "sessions", sa.Column("method", sa.String(20), nullable=False, server_default="local")
    )
    op.add_column(
        "sessions",
        sa.Column("strong_auth", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "sessions", sa.Column("authenticated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("sessions", sa.Column("auth_context", sa.String(10), nullable=True))
    op.create_table(
        "microsoft_identities",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("object_id", sa.String(36), nullable=False),
        sa.UniqueConstraint("tenant_id", "object_id", name="uq_microsoft_identity"),
    )
    op.create_table(
        "admin_grants",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
    )
    op.create_table(
        "oidc_flows",
        sa.Column("state_hash", sa.String(64), primary_key=True),
        sa.Column("nonce_hash", sa.String(64), nullable=False),
        sa.Column("verifier", sa.String(128), nullable=False),
        sa.Column("peer_hash", sa.String(64), nullable=False),
        sa.Column("previous_session", sa.String(64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    raise RuntimeError("Downgrade requires a reviewed backup restore; do not discard identities.")
