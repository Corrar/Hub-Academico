from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from .. import schemas


class PublicationInput(schemas.Input):
    kind: Literal["activity", "material", "notice", "event"]
    title: schemas.Name
    body: str = Field(min_length=1, max_length=20000)
    audience: Literal["group", "institution"]
    group_id: UUID | None = None
    draft: bool = True
    due_at: AwareDatetime | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    capacity: int | None = Field(None, ge=1, le=100000)
    version: int = Field(0, ge=0)

    @model_validator(mode="after")
    def consistent(self):
        if (self.audience == "group") != bool(self.group_id):
            raise ValueError("Selecione o público e a turma correspondente")
        if self.kind in {"activity", "material"} and self.audience != "group":
            raise ValueError("Atividades e materiais exigem turma")
        if self.kind == "activity" and not self.due_at:
            raise ValueError("Atividade exige prazo")
        if self.kind != "activity" and self.due_at:
            raise ValueError("Prazo exclusivo de atividade")
        if self.kind == "event":
            if not self.starts_at or not self.ends_at or self.ends_at <= self.starts_at:
                raise ValueError("Evento exige início e término válidos")
        elif self.starts_at or self.ends_at or self.capacity:
            raise ValueError("Datas e vagas são exclusivas de eventos")
        return self


class SubmissionInput(schemas.Input):
    body: str = Field(min_length=1, max_length=20000)
    draft: bool = True
    version: int = Field(0, ge=0)


class GradeInput(schemas.Input):
    grade: float | None = Field(None, ge=0, le=10, allow_inf_nan=False)
    feedback: str = Field(min_length=1, max_length=10000)
    version: int = Field(ge=1)


class ScheduleInput(schemas.Input):
    group_id: UUID
    weekday: int = Field(ge=0, le=6)
    starts_minute: int = Field(ge=0, le=1439)
    ends_minute: int = Field(ge=1, le=1440)
    starts_on: date
    ends_on: date
    room: schemas.Name

    @model_validator(mode="after")
    def consistent(self):
        if self.ends_minute <= self.starts_minute or self.ends_on < self.starts_on:
            raise ValueError("Horários ou vigência inválidos")
        return self
