from datetime import date
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Z0-9_-]{1,30}$")]
Role = Literal["student", "teacher", "coordinator"]
Password = Annotated[str, StringConstraints(min_length=12, max_length=128)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower()


class UserCreate(Input):
    name: Name
    email: str = Field(min_length=3, max_length=254)
    role: Role
    password: Password

    @field_validator("email")
    @classmethod
    def institutional_email(cls, value):
        value = value.strip().lower()
        if (
            value.count("@") != 1
            or not value.endswith("@fatec.sp.gov.br")
            or any(c.isspace() for c in value)
            or value.startswith("@")
        ):
            raise ValueError("Use um e-mail institucional @fatec.sp.gov.br")
        return value


class CourseInput(Input):
    code: Code
    name: Name


class SubjectInput(CourseInput):
    course_id: str = Field(min_length=36, max_length=36)
    term: int = Field(ge=1, le=20)


class GroupInput(Input):
    subject_id: str = Field(min_length=36, max_length=36)
    semester: str = Field(pattern=r"^20\d{2}/[12]$")
    name: Name


class MembershipInput(Input):
    user_id: str = Field(min_length=36, max_length=36)
    group_id: str = Field(min_length=36, max_length=36)
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def valid_dates(self):
        if self.ends_on < self.starts_on:
            raise ValueError("A data final deve ser igual ou posterior à inicial")
        return self


class ArchiveInput(Input):
    archived: bool
