"""Explicit privileged operations; all mutations require recent Microsoft MFA."""

import json
import secrets
from uuid import UUID

from fastapi import HTTPException, Query
from pydantic import Field, field_validator
from sqlalchemy import delete, select, text

from . import schemas, security
from .academic.scheduling import lock_schedule, validate_group_schedules
from .models import AdminGrant, Audit, Membership, MicrosoftIdentity, Session, User


class Provision(schemas.Input):
    name: schemas.Name
    email: str = Field(min_length=3, max_length=254)
    role: schemas.Role
    object_id: UUID

    @field_validator("email")
    @classmethod
    def check_email(cls, value):
        return schemas.UserCreate.institutional_email(value)


class Change(schemas.Input):
    role: schemas.Role
    administrator: bool = False
    archived: bool = False
    reason: str = Field(min_length=10, max_length=500)


class Reason(schemas.Input):
    reason: str = Field(min_length=10, max_length=500)


class Binding(Reason):
    object_id: UUID


def install_admin(app, DB, Administrator, microsoft, public):
    def record(db, actor, action, target, changes):
        db.add(
            Audit(
                actor_id=actor.id,
                action=action,
                entity="users",
                entity_id=target,
                changes=json.dumps(changes, default=str),
            )
        )

    def serialize(db, row):
        identity = db.get(MicrosoftIdentity, row.id)
        return {
            **public(row),
            "administrator": bool(db.get(AdminGrant, row.id)),
            "object_id": identity.object_id if identity else None,
        }

    def lock(db, actor):
        # One ordering for grants, status and identity changes prevents last-admin races.
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(819260908)"))
        active_actor = db.scalar(
            select(User.id).where(
                User.id == actor.id, User.archived.is_(False), User.role == "coordinator"
            )
        )
        if not active_actor or not db.scalar(
            select(AdminGrant).where(AdminGrant.user_id == actor.id)
        ):
            raise HTTPException(403, "Permissão administrativa revogada")

    @app.get("/api/v1/admin/users")
    def users(
        db: DB,
        actor: Administrator,
        offset: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
    ):
        return [
            serialize(db, row)
            for row in db.scalars(
                select(User).order_by(User.name, User.id).offset(offset).limit(limit)
            )
        ]

    @app.post("/api/v1/admin/users", status_code=201)
    def provision(body: Provision, db: DB, actor: Administrator):
        if not microsoft:
            raise HTTPException(503, "Configure a identidade institucional antes de provisionar")
        data = schemas.UserCreate(
            name=body.name, email=body.email, role=body.role, password=secrets.token_urlsafe(48)
        )
        lock(db, actor)
        row = User(
            **data.model_dump(exclude={"password"}),
            password_hash=security.passwords.hash(data.password),
        )
        db.add(row)
        db.flush()
        db.add(
            MicrosoftIdentity(
                user_id=row.id, tenant_id=microsoft.tenant, object_id=str(body.object_id)
            )
        )
        record(
            db,
            actor,
            "provision_identity",
            row.id,
            {"name": row.name, "role": row.role, "object_id": str(body.object_id)},
        )
        db.commit()
        return serialize(db, row)

    @app.put("/api/v1/admin/users/{key}")
    def change(key: str, body: Change, db: DB, actor: Administrator):
        lock(db, actor)
        row = db.get(User, key)
        if not row:
            raise HTTPException(404, "Usuário não encontrado")
        if key == actor.id:
            raise HTTPException(409, "Não altere suas próprias permissões ou bloqueie sua conta")
        if body.administrator and (
            body.role != "coordinator" or not db.get(MicrosoftIdentity, key)
        ):
            raise HTTPException(
                422, "Admin exige identidade Microsoft vinculada e perfil de gestão"
            )
        before = serialize(db, row)
        lock_schedule(db)
        row.role, row.archived = body.role, body.archived
        if body.role == "teacher" and not body.archived:
            for group_id in db.scalars(
                select(Membership.group_id).where(
                    Membership.user_id == key, Membership.archived.is_(False)
                )
            ):
                validate_group_schedules(db, group_id)
        grant = db.get(AdminGrant, key)
        if body.administrator and not grant:
            db.add(AdminGrant(user_id=key))
        elif not body.administrator and grant:
            db.delete(grant)
        db.execute(delete(Session).where(Session.user_id == key))
        db.flush()
        record(
            db,
            actor,
            "permissions_changed",
            key,
            {"before": before, "after": serialize(db, row), "reason": body.reason},
        )
        db.commit()
        return serialize(db, row)

    @app.put("/api/v1/admin/users/{key}/identity")
    def bind(key: str, body: Binding, db: DB, actor: Administrator):
        if not microsoft:
            raise HTTPException(503, "Microsoft não configurado")
        lock(db, actor)
        if key == actor.id:
            raise HTTPException(409, "Sua identidade exige alteração por outro administrador")
        row = db.get(User, key)
        if not row:
            raise HTTPException(404, "Usuário não encontrado")
        identity = db.get(MicrosoftIdentity, key)
        previous = identity.object_id if identity else None
        if identity:
            identity.tenant_id, identity.object_id = microsoft.tenant, str(body.object_id)
        else:
            db.add(
                MicrosoftIdentity(
                    user_id=key, tenant_id=microsoft.tenant, object_id=str(body.object_id)
                )
            )
        db.execute(delete(Session).where(Session.user_id == key))
        record(
            db,
            actor,
            "identity_changed",
            key,
            {"before": previous, "after": str(body.object_id), "reason": body.reason},
        )
        db.commit()
        return serialize(db, row)

    @app.get("/api/v1/admin/users/{key}/sessions")
    def sessions(key: str, db: DB, actor: Administrator):
        return [
            {
                "id": row.id,
                "method": row.method,
                "strong_auth": row.strong_auth,
                "authenticated_at": row.authenticated_at,
                "expires_at": row.expires_at,
            }
            for row in db.scalars(
                select(Session)
                .where(Session.user_id == key, Session.expires_at > security.now())
                .limit(100)
            )
        ]

    @app.post("/api/v1/admin/users/{key}/revoke", status_code=204)
    def revoke(key: str, body: Reason, db: DB, actor: Administrator):
        lock(db, actor)
        if not db.get(User, key):
            raise HTTPException(404, "Usuário não encontrado")
        db.execute(delete(Session).where(Session.user_id == key))
        record(db, actor, "sessions_revoked", key, {"reason": body.reason})
        db.commit()

    @app.get("/api/v1/admin/status")
    def status(db: DB, actor: Administrator):
        revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        return {
            "database": "ok",
            "revision": revision,
            "microsoft_configured": bool(microsoft),
            "admin_context": microsoft.context if microsoft else None,
            "production_enabled": False,
            "session_minutes": 30,
            "privileged_write_minutes": 5,
        }
