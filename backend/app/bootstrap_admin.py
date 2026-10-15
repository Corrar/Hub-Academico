"""Provision the first admin against an explicitly verified Entra object ID."""

import argparse
import json
import secrets
from uuid import UUID

from sqlalchemy import select, text

from .db import database_url, make_engine, make_sessions
from .microsoft import MicrosoftSettings
from .models import AdminGrant, Audit, MicrosoftIdentity, User
from .schemas import UserCreate
from .security import passwords


def bootstrap(email, name, object_id):
    settings = MicrosoftSettings.from_env()
    if not settings:
        raise ValueError("Configure o Microsoft Entra antes de provisionar o administrador.")
    oid = str(UUID(object_id))
    data = UserCreate(
        email=email, name=name, role="coordinator", password=secrets.token_urlsafe(48)
    )
    engine = make_engine(database_url())
    try:
        with make_sessions(engine)() as db:
            if engine.dialect.name == "postgresql":
                db.execute(text("SELECT pg_advisory_xact_lock(819260908)"))
            if db.scalar(select(AdminGrant.user_id).limit(1)):
                raise ValueError(
                    "Já existe administrador; use o console ou recuperação supervisionada."
                )
            if db.scalar(select(User.id).where(User.email == data.email)):
                raise ValueError("O e-mail já existe. Não será vinculado automaticamente.")
            actor = User(
                **data.model_dump(exclude={"password"}), password_hash=passwords.hash(data.password)
            )
            db.add(actor)
            db.flush()
            db.add(MicrosoftIdentity(user_id=actor.id, tenant_id=settings.tenant, object_id=oid))
            db.add(AdminGrant(user_id=actor.id))
            db.add(
                Audit(
                    actor_id=actor.id,
                    action="bootstrap_admin",
                    entity="users",
                    entity_id=actor.id,
                    changes=json.dumps({"tenant_id": settings.tenant, "object_id": oid}),
                )
            )
            db.commit()
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--object-id", required=True)
    args = parser.parse_args()
    bootstrap(args.email, args.name, args.object_id)
    print("Administrador provisionado. Entre pela Microsoft com o contexto MFA exigido.")


if __name__ == "__main__":
    main()
