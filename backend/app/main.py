import json
import os
import secrets
from datetime import datetime
from pathlib import Path
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from . import schemas, security
from .db import database_url, make_engine, make_sessions
from .models import Audit, ClassGroup, Course, Membership, Session, Subject, User


def public(row):
    return {
        column.key: getattr(row, column.key)
        for column in inspect(type(row)).columns
        if column.key != "password_hash"
    }


def audit(db, actor, action, row, before=None):
    db.flush()
    db.add(
        Audit(
            actor_id=actor.id,
            action=action,
            entity=row.__tablename__,
            entity_id=row.id,
            changes=json.dumps({"before": before, "after": public(row)}, default=str),
        )
    )


def active(db, model, key):
    row = db.get(model, key)
    if row is None or row.archived:
        raise HTTPException(404, "Registro não encontrado")
    return row


def active_group(db, key):
    group = active(db, ClassGroup, key)
    subject = active(db, Subject, group.subject_id)
    active(db, Course, subject.course_id)
    return group


def create_app(url=None):
    if os.getenv("APP_ENV", "development") not in {"development", "test"}:
        raise RuntimeError("Esta versão é de desenvolvimento. Login institucional ainda pendente.")
    engine = make_engine(url or database_url())
    sessions = make_sessions(engine)
    app = FastAPI(title="Hub Acadêmico — API de desenvolvimento", version="0.1.0")
    app.state.engine, app.state.sessions = engine, sessions
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:8081"],
        allow_methods=["GET", "POST", "PUT", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )

    cookie_name = "hub_session"
    trusted_origins = {
        origin.strip()
        for origin in os.getenv("WEB_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(
            ","
        )
        if origin.strip()
    }
    secure_cookie = os.getenv("WEB_SECURE_COOKIE", "true").lower() != "false"

    def check_origin(request):
        if request.headers.get("origin") not in trusted_origins:
            raise HTTPException(403, "Origem não autorizada")

    def csrf(token):
        return security.digest("hub-csrf:" + token)

    def request_token(request, credentials):
        # A browser cookie always takes precedence; a header cannot bypass CSRF.
        token = request.cookies.get(cookie_name)
        if token:
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                check_origin(request)
                supplied = request.headers.get("x-csrf-token", "")
                if not secrets.compare_digest(
                    supplied.encode("utf-8"), csrf(token).encode("ascii")
                ):
                    raise HTTPException(403, "Proteção de sessão inválida; entre novamente")
            return token
        if credentials:
            return credentials.credentials
        raise HTTPException(401, "Autenticação necessária")

    def database():
        with sessions() as db:
            yield db

    DB = Annotated[object, Depends(database)]
    bearer = HTTPBearer(auto_error=False)

    def current_user(
        request: Request,
        db: DB,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ):
        return security.authenticate(db, request_token(request, credentials))

    Actor = Annotated[User, Depends(current_user)]

    def coordinator(actor: Actor):
        if actor.role != "coordinator":
            raise HTTPException(403, "Acesso restrito à coordenação")
        return actor

    Coordinator = Annotated[User, Depends(coordinator)]

    @app.exception_handler(IntegrityError)
    async def conflict(_request, _exception):
        return JSONResponse(
            status_code=409, content={"detail": "Registro duplicado ou vínculo inválido"}
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request, exception):
        # Pydantic errors may contain the full input, including passwords.
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {"loc": error["loc"], "type": error["type"], "msg": "Valor inválido"}
                    for error in exception.errors()
                ]
            },
        )

    @app.middleware("http")
    async def response_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if request.url.path == "/" or request.url.path.startswith("/panel"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; script-src 'self'; style-src 'self'; "
                "img-src 'self'; font-src 'self'; connect-src 'self'; "
                "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
            )
        return response

    static = Path(__file__).parent / "static"
    app.mount("/panel/assets", StaticFiles(directory=static), name="panel-assets")

    @app.get("/", include_in_schema=False)
    def home():
        return RedirectResponse("/panel/")

    @app.get("/panel/", include_in_schema=False)
    def panel():
        return FileResponse(static / "index.html")

    @app.post("/api/v1/web/login")
    def web_login(body: schemas.Login, request: Request, response: Response, db: DB):
        check_origin(request)
        result = security.login(
            db, body.email, body.password, request.client.host if request.client else "unknown"
        )
        token = result["access_token"]
        actor = security.authenticate(db, token)
        if actor.role != "coordinator":
            db.execute(delete(Session).where(Session.token_hash == security.digest(token)))
            db.commit()
            raise HTTPException(403, "Este painel é exclusivo da coordenação")
        previous = request.cookies.get(cookie_name)
        if previous:
            db.execute(delete(Session).where(Session.token_hash == security.digest(previous)))
            db.commit()
        response.set_cookie(
            cookie_name,
            token,
            max_age=1800,
            httponly=True,
            secure=secure_cookie,
            samesite="strict",
            path="/api/v1",
        )
        return {"user": public(actor), "csrf_token": csrf(token)}

    @app.get("/api/v1/web/session")
    def web_session(request: Request, db: DB):
        token = request.cookies.get(cookie_name)
        if not token:
            raise HTTPException(401, "Autenticação necessária")
        actor = security.authenticate(db, token)
        if actor.role != "coordinator":
            raise HTTPException(403, "Este painel é exclusivo da coordenação")
        return {"user": public(actor), "csrf_token": csrf(token)}

    @app.get("/api/v1/dashboard")
    def dashboard(db: DB, actor: Coordinator):
        return {
            key: db.scalar(select(func.count()).select_from(model).where(model.archived.is_(False)))
            for key, model in {
                "courses": Course,
                "subjects": Subject,
                "groups": ClassGroup,
                "users": User,
                "memberships": Membership,
            }.items()
        }

    @app.get("/api/v1/lookup/{resource}")
    def lookup(
        resource: str,
        db: DB,
        actor: Coordinator,
        q: str = Query("", max_length=120),
        ids: list[str] = Query(default=[], max_length=100),
        offset: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
    ):
        model = {"users": User, "courses": Course, "subjects": Subject, "groups": ClassGroup}.get(
            resource
        )
        if model is None:
            raise HTTPException(404, "Cadastro não encontrado")
        stmt = select(model)
        if ids:
            stmt = stmt.where(model.id.in_(ids))
        else:
            stmt = stmt.where(model.archived.is_(False))
            if model is User:
                stmt = stmt.where(User.role != "coordinator")
            elif model is Subject:
                stmt = stmt.join(Course).where(Course.archived.is_(False))
            elif model is ClassGroup:
                stmt = (
                    stmt.join(Subject)
                    .join(Course)
                    .where(Subject.archived.is_(False), Course.archived.is_(False))
                )
            if q:
                stmt = stmt.where(model.name.icontains(q, autoescape=True))
        result = []
        for row in db.scalars(stmt.order_by(model.name, model.id).offset(offset).limit(limit)):
            label = row.name
            if model is User:
                label += " · " + row.email
            elif model is ClassGroup:
                subject = db.get(Subject, row.subject_id)
                label = subject.name + " · " + row.name + " · " + row.semester
            else:
                label = row.code + " · " + row.name
            result.append({"id": row.id, "label": label + (" (arquivado)" if row.archived else "")})
        return result

    @app.get("/health/live")
    def live():
        return {"status": "ok", "environment": "development"}

    @app.get("/health/ready")
    def ready(db: DB):
        try:
            revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
            if revision != "0001":
                return JSONResponse(status_code=503, content={"status": "migration_required"})
        except SQLAlchemyError:
            return JSONResponse(status_code=503, content={"status": "database_unavailable"})
        return {"status": "ok"}

    @app.post("/api/v1/auth/login")
    def sign_in(body: schemas.Login, request: Request, db: DB):
        return security.login(
            db, body.email, body.password, request.client.host if request.client else "unknown"
        )

    @app.post("/api/v1/auth/logout", status_code=204)
    def logout(
        request: Request,
        actor: Actor,
        db: DB,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ):
        token = request_token(request, credentials)
        db.execute(delete(Session).where(Session.token_hash == security.digest(token)))
        db.commit()
        response = Response(status_code=204)
        response.delete_cookie(
            cookie_name, path="/api/v1", secure=secure_cookie, httponly=True, samesite="strict"
        )
        return response

    @app.get("/api/v1/me")
    def me(actor: Actor):
        return public(actor)

    @app.post("/api/v1/users", status_code=201)
    def create_user(body: schemas.UserCreate, db: DB, actor: Coordinator):
        row = User(
            **body.model_dump(exclude={"password"}),
            password_hash=security.passwords.hash(body.password),
        )
        db.add(row)
        audit(db, actor, "create", row)
        db.commit()
        return public(row)

    @app.get("/api/v1/users")
    def users(
        db: DB,
        actor: Coordinator,
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
        archived: bool = False,
    ):
        return [
            public(row)
            for row in db.scalars(
                select(User)
                .where(User.archived == archived)
                .order_by(User.name, User.id)
                .offset(offset)
                .limit(limit)
            )
        ]

    def register_catalog(path, model, schema, parent_field=None, parent_model=None):
        def validate_parent(db, body):
            if parent_field:
                parent = active(db, parent_model, getattr(body, parent_field))
                if parent_model is Subject:
                    active(db, Course, parent.course_id)

        def create(body, db: DB, actor: Coordinator):
            validate_parent(db, body)
            row = model(**body.model_dump())
            db.add(row)
            audit(db, actor, "create", row)
            db.commit()
            return public(row)

        def update(key: str, body, db: DB, actor: Coordinator):
            row = active(db, model, key)
            validate_parent(db, body)
            if parent_field and getattr(row, parent_field) != getattr(body, parent_field):
                raise HTTPException(409, "Não é possível transferir um registro entre estruturas")
            before = public(row)
            for field, value in body.model_dump().items():
                setattr(row, field, value)
            audit(db, actor, "update", row, before)
            db.commit()
            return public(row)

        def listing(
            db: DB,
            actor: Coordinator,
            offset: int = Query(0, ge=0),
            limit: int = Query(50, ge=1, le=100),
            archived: bool = False,
        ):
            return [
                public(row)
                for row in db.scalars(
                    select(model)
                    .where(model.archived == archived)
                    .order_by(model.id)
                    .offset(offset)
                    .limit(limit)
                )
            ]

        create.__annotations__["body"] = schema
        update.__annotations__["body"] = schema
        app.add_api_route(
            path, create, methods=["POST"], status_code=201, name=f"create_{model.__tablename__}"
        )
        app.add_api_route(
            path + "/{key}", update, methods=["PUT"], name=f"update_{model.__tablename__}"
        )
        app.add_api_route(path, listing, methods=["GET"], name=f"list_{model.__tablename__}")

    register_catalog("/api/v1/courses", Course, schemas.CourseInput)
    register_catalog("/api/v1/subjects", Subject, schemas.SubjectInput, "course_id", Course)
    register_catalog("/api/v1/groups", ClassGroup, schemas.GroupInput, "subject_id", Subject)

    @app.put("/api/v1/memberships")
    def set_membership(body: schemas.MembershipInput, db: DB, actor: Coordinator):
        user = active(db, User, body.user_id)
        if user.role == "coordinator":
            raise HTTPException(422, "Vínculos são destinados a alunos e professores")
        active_group(db, body.group_id)
        row = db.scalar(
            select(Membership).where(
                Membership.user_id == body.user_id, Membership.group_id == body.group_id
            )
        )
        before = public(row) if row else None
        if row is None:
            row = Membership(**body.model_dump())
            db.add(row)
        else:
            row.starts_on, row.ends_on, row.archived = body.starts_on, body.ends_on, False
        audit(db, actor, "upsert", row, before)
        db.commit()
        return public(row)

    @app.get("/api/v1/memberships")
    def memberships(
        db: DB,
        actor: Coordinator,
        group_id: str | None = None,
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
        archived: bool = False,
    ):
        stmt = select(Membership).where(Membership.archived == archived)
        if group_id:
            stmt = stmt.where(Membership.group_id == group_id)
        return [
            public(row)
            for row in db.scalars(stmt.order_by(Membership.id).offset(offset).limit(limit))
        ]

    def visible_groups(actor):
        stmt = (
            select(ClassGroup)
            .join(Subject)
            .join(Course)
            .where(
                ClassGroup.archived.is_(False),
                Subject.archived.is_(False),
                Course.archived.is_(False),
            )
        )
        if actor.role != "coordinator":
            today = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
            stmt = stmt.join(Membership).where(
                Membership.user_id == actor.id,
                Membership.archived.is_(False),
                Membership.starts_on <= today,
                Membership.ends_on >= today,
            )
        return stmt

    @app.get("/api/v1/me/groups")
    def my_groups(
        db: DB, actor: Actor, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)
    ):
        return [
            public(row)
            for row in db.scalars(
                visible_groups(actor).order_by(ClassGroup.id).offset(offset).limit(limit)
            )
        ]

    @app.get("/api/v1/groups/{key}")
    def group(key: str, db: DB, actor: Actor):
        row = db.scalar(visible_groups(actor).where(ClassGroup.id == key))
        if row is None:
            raise HTTPException(404, "Turma não encontrada")
        return public(row)

    models = {
        "users": User,
        "courses": Course,
        "subjects": Subject,
        "groups": ClassGroup,
        "memberships": Membership,
    }

    @app.patch("/api/v1/{resource}/{key}/archive")
    def archive(resource: str, key: str, body: schemas.ArchiveInput, db: DB, actor: Coordinator):
        model = models.get(resource)
        if model is None or (row := db.get(model, key)) is None:
            raise HTTPException(404, "Registro não encontrado")
        if model is User and (row.id == actor.id or row.role == "coordinator"):
            raise HTTPException(409, "Arquivamento de contas de coordenação exige fluxo próprio")
        if not body.archived:
            if model is Subject:
                active(db, Course, row.course_id)
            elif model is ClassGroup:
                active(db, Course, active(db, Subject, row.subject_id).course_id)
            elif model is Membership:
                active(db, User, row.user_id)
                active_group(db, row.group_id)
        if row.archived == body.archived:
            return public(row)
        before = public(row)
        row.archived = body.archived
        if model is User and body.archived:
            db.execute(delete(Session).where(Session.user_id == row.id))
        audit(db, actor, "archive" if body.archived else "restore", row, before)
        db.commit()
        return public(row)

    @app.get("/api/v1/audit")
    def audit_log(
        db: DB,
        actor: Coordinator,
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
    ):
        return [
            public(row)
            for row in db.scalars(
                select(Audit)
                .order_by(Audit.occurred_at.desc(), Audit.id)
                .offset(offset)
                .limit(limit)
            )
        ]

    return app
