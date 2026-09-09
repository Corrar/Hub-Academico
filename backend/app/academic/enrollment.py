"""Preview and atomic application of a bounded membership batch."""

from datetime import date
from uuid import UUID

from fastapi import HTTPException
from pydantic import Field, field_validator, model_validator
from sqlalchemy import select

from .. import schemas
from ..models import Membership, User
from .scheduling import lock_schedule, validate_group_schedules


class BatchRow(schemas.Input):
    email: str = Field(min_length=3, max_length=254)
    group_id: UUID
    starts_on: date
    ends_on: date

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        return schemas.UserCreate.institutional_email(value)

    @model_validator(mode="after")
    def dates_valid(self):
        if self.ends_on < self.starts_on:
            raise ValueError("Vigência inválida")
        return self


class Batch(schemas.Input):
    rows: list[BatchRow] = Field(min_length=1, max_length=100)
    confirm: bool = False


def install_enrollment(app, DB, Coordinator, active_group, active, public, audit):
    @app.post("/api/v1/memberships/batch")
    def batch(body: Batch, db: DB, actor: Coordinator):
        lock_schedule(db)
        checked, errors, seen, resolved = [], [], set(), []
        for index, item in enumerate(body.rows, start=1):
            key = (item.email, str(item.group_id))
            try:
                user = db.scalar(
                    select(User).where(User.email == item.email, User.archived.is_(False))
                )
                if not user:
                    raise HTTPException(404, "Conta não encontrada ou arquivada")
                item = schemas.MembershipInput(
                    user_id=user.id,
                    group_id=str(item.group_id),
                    starts_on=item.starts_on,
                    ends_on=item.ends_on,
                )
                resolved.append(item)
                active_group(db, item.group_id)
                if user.role == "coordinator":
                    raise HTTPException(422, "Vínculo não se aplica à coordenação")
                if key in seen:
                    raise HTTPException(422, "Pessoa/turma repetida no lote")
                seen.add(key)
                row = db.scalar(
                    select(Membership).where(
                        Membership.user_id == item.user_id, Membership.group_id == item.group_id
                    )
                )
                checked.append(
                    {"line": index, "name": user.name, "action": "update" if row else "create"}
                )
            except HTTPException as error:
                errors.append({"line": index, "message": error.detail})
        if errors:
            return {"applied": False, "rows": checked, "errors": errors}
        # Apply to the transaction for full schedule validation even in preview mode.
        for item in resolved:
            row = db.scalar(
                select(Membership).where(
                    Membership.user_id == item.user_id, Membership.group_id == item.group_id
                )
            )
            before = public(row) if row else None
            if not row:
                row = Membership(**item.model_dump())
                db.add(row)
            else:
                row.starts_on, row.ends_on, row.archived = item.starts_on, item.ends_on, False
            audit(db, actor, "batch_membership", row, before)
        for key in {item.group_id for item in resolved}:
            validate_group_schedules(db, key)
        if body.confirm:
            db.commit()
        else:
            db.rollback()
        return {"applied": body.confirm, "rows": checked, "errors": []}
