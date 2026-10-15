from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now():
    return datetime.now(timezone.utc)


def uuid():
    return str(uuid4())


class Record:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class User(Record, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('student','teacher','coordinator')"),)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    role: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(Text)


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    id: Mapped[str | None] = mapped_column(String(36), default=uuid, unique=True, index=True)
    auth_context: Mapped[str | None] = mapped_column(String(10))
    method: Mapped[str] = mapped_column(String(20), default="local", server_default="local")
    strong_auth: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    authenticated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=now)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Course(Record, Base):
    __tablename__ = "courses"
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(120))


class Subject(Record, Base):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("course_id", "code"), CheckConstraint("term > 0"))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    term: Mapped[int]


class ClassGroup(Record, Base):
    __tablename__ = "class_groups"
    __table_args__ = (UniqueConstraint("subject_id", "semester", "name"),)
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.id"), index=True)
    semester: Mapped[str] = mapped_column(String(6))
    name: Mapped[str] = mapped_column(String(120))


class Membership(Record, Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "group_id"),
        CheckConstraint("ends_on >= starts_on"),
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("class_groups.id"), index=True)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)


class Audit(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(30))
    entity: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[str] = mapped_column(String(36))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    changes: Mapped[str] = mapped_column(Text)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int]
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MicrosoftIdentity(Base):
    __tablename__ = "microsoft_identities"
    __table_args__ = (UniqueConstraint("tenant_id", "object_id", name="uq_microsoft_identity"),)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36))
    object_id: Mapped[str] = mapped_column(String(36))


class AdminGrant(Base):
    __tablename__ = "admin_grants"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)


class OIDCFlow(Base):
    __tablename__ = "oidc_flows"
    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    nonce_hash: Mapped[str] = mapped_column(String(64))
    verifier: Mapped[str] = mapped_column(String(128))
    peer_hash: Mapped[str] = mapped_column(String(64))
    previous_session: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Publication(Record, Base):
    __tablename__ = "publications"
    __table_args__ = (
        CheckConstraint("kind IN ('activity','material','notice','event')"),
        CheckConstraint("audience IN ('group','institution')"),
        CheckConstraint(
            "(audience = 'group' AND group_id IS NOT NULL) OR (audience = 'institution' AND group_id IS NULL)"
        ),
        CheckConstraint("capacity IS NULL OR capacity > 0"),
    )
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    group_id: Mapped[str | None] = mapped_column(ForeignKey("class_groups.id"), index=True)
    audience: Mapped[str] = mapped_column(String(20))
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    draft: Mapped[bool] = mapped_column(Boolean, default=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    capacity: Mapped[int | None]
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Submission(Record, Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("publication_id", "student_id"),
        CheckConstraint("grade IS NULL OR (grade >= 0 AND grade <= 10)"),
    )
    publication_id: Mapped[str] = mapped_column(ForeignKey("publications.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    draft: Mapped[bool] = mapped_column(Boolean, default=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grade: Mapped[float | None]
    feedback: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(default=1)


class Enrollment(Record, Base):
    __tablename__ = "event_enrollments"
    __table_args__ = (UniqueConstraint("publication_id", "user_id"),)
    publication_id: Mapped[str] = mapped_column(ForeignKey("publications.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Schedule(Record, Base):
    __tablename__ = "schedules"
    __table_args__ = (
        CheckConstraint("weekday >= 0 AND weekday <= 6"),
        CheckConstraint(
            "starts_minute >= 0 AND ends_minute <= 1440 AND ends_minute > starts_minute"
        ),
        CheckConstraint("ends_on >= starts_on"),
    )
    group_id: Mapped[str] = mapped_column(ForeignKey("class_groups.id"), index=True)
    weekday: Mapped[int]
    starts_minute: Mapped[int]
    ends_minute: Mapped[int]
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    room: Mapped[str] = mapped_column(String(120))


class Attachment(Record, Base):
    __tablename__ = "attachments"
    __table_args__ = (CheckConstraint("(publication_id IS NULL) != (submission_id IS NULL)"),)
    publication_id: Mapped[str | None] = mapped_column(ForeignKey("publications.id"), index=True)
    submission_id: Mapped[str | None] = mapped_column(ForeignKey("submissions.id"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(100))
    content: Mapped[bytes] = mapped_column(LargeBinary)
