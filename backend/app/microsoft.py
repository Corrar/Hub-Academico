"""Single-tenant Microsoft OIDC. No email-based account linking or automatic signup."""

import base64
import hashlib
import json
import os
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit
from uuid import UUID

import httpx
import jwt
from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select, text

from . import security
from .models import AdminGrant, Audit, MicrosoftIdentity, OIDCFlow, Session, User, now


@dataclass(frozen=True)
class MicrosoftSettings:
    tenant: str
    client: str
    secret: str
    redirect: str
    context: str

    @property
    def authority(self):
        return f"https://login.microsoftonline.com/{self.tenant}"

    @classmethod
    def from_env(cls):
        keys = [
            "MICROSOFT_TENANT_ID",
            "MICROSOFT_CLIENT_ID",
            "MICROSOFT_CLIENT_SECRET",
            "MICROSOFT_REDIRECT_URI",
            "MICROSOFT_AUTH_CONTEXT",
        ]
        values = [os.getenv(key, "") for key in keys]
        if not any(values):
            return None
        if not all(values):
            raise RuntimeError("Configuração Microsoft incompleta; preencha as cinco variáveis.")
        tenant, client = str(UUID(values[0])), str(UUID(values[1]))
        uri = urlsplit(values[3])
        origins = {x.strip() for x in os.getenv("WEB_ORIGINS", "").split(",")}
        if (
            uri.scheme != "https"
            or uri.username
            or uri.password
            or uri.query
            or uri.fragment
            or uri.path != "/api/v1/microsoft/callback"
            or f"{uri.scheme}://{uri.netloc}" not in origins
        ):
            raise RuntimeError("Callback Microsoft exige origem HTTPS permitida e caminho exato.")
        if not re.fullmatch(r"c(?:[1-9]|[1-9][0-9])", values[4]):
            raise RuntimeError("Configure um contexto de autenticação Entra c1 a c99 com MFA.")
        if os.getenv("WEB_SECURE_COOKIE", "true").lower() != "true":
            raise RuntimeError("Microsoft exige cookies Secure.")
        return cls(tenant, client, values[2], values[3], values[4])


class MicrosoftClient:
    def __init__(self, settings):
        self.settings = settings
        self.keys = jwt.PyJWKClient(settings.authority + "/discovery/v2.0/keys", timeout=10)

    def exchange(self, code, verifier):
        cfg = self.settings
        try:
            response = httpx.post(
                cfg.authority + "/oauth2/v2.0/token",
                data={
                    "client_id": cfg.client,
                    "client_secret": cfg.secret,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": cfg.redirect,
                    "code_verifier": verifier,
                },
                timeout=10,
                follow_redirects=False,
            )
            response.raise_for_status()
            return response.json()["id_token"]
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(502, "Não foi possível concluir o login Microsoft") from None

    def verify(self, token, nonce_hash):
        cfg = self.settings
        try:
            key = self.keys.get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=cfg.client,
                issuer=cfg.authority + "/v2.0",
                leeway=30,
                options={
                    "require": [
                        "exp",
                        "iat",
                        "nbf",
                        "iss",
                        "aud",
                        "sub",
                        "nonce",
                        "tid",
                        "oid",
                        "auth_time",
                    ]
                },
            )
            if claims["tid"] != cfg.tenant or str(UUID(claims["oid"])) != claims["oid"]:
                raise ValueError("identity")
            if not secrets.compare_digest(security.digest(claims["nonce"]), nonce_hash):
                raise ValueError("nonce")
            if (
                not isinstance(claims["auth_time"], int)
                or not 0 <= now().timestamp() - claims["auth_time"] <= 300
            ):
                raise ValueError("fresh authentication required")
            return claims
        except (jwt.PyJWTError, ValueError, TypeError, KeyError, AttributeError):
            raise HTTPException(401, "Identidade Microsoft inválida ou expirada") from None


def install_microsoft(app, sessions, settings, check_origin, *, cookie_samesite="strict"):
    app.state.microsoft = MicrosoftClient(settings) if settings else None

    def app_url(path="/panel/", fallback=None):
        configured = os.getenv("WEB_APP_URL", "").strip()
        return configured.rstrip("/") + path if configured else (fallback or path)

    @app.get("/api/v1/auth/options")
    def options():
        return {"microsoft": settings is not None, "local": settings is None}

    @app.post("/api/v1/microsoft/start")
    def start(request: Request):
        check_origin(request)
        if not settings:
            raise HTTPException(503, "Login Microsoft aguarda configuração institucional")
        state, nonce, verifier = (secrets.token_urlsafe(48) for _ in range(3))
        peer = security.digest(request.client.host if request.client else "unknown")
        with sessions() as db:
            if db.bind.dialect.name == "postgresql":
                db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(peer[:15], 16)})
            db.execute(delete(OIDCFlow).where(OIDCFlow.expires_at <= now()))
            if (
                db.scalar(
                    select(func.count()).select_from(OIDCFlow).where(OIDCFlow.peer_hash == peer)
                )
                >= 20
            ):
                raise HTTPException(429, "Muitos logins em andamento; aguarde cinco minutos")
            previous = request.cookies.get("hub_session")
            db.add(
                OIDCFlow(
                    state_hash=security.digest(state),
                    nonce_hash=security.digest(nonce),
                    verifier=verifier,
                    peer_hash=peer,
                    previous_session=security.digest(previous) if previous else None,
                    expires_at=now() + timedelta(minutes=5),
                )
            )
            db.commit()
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .rstrip(b"=")
            .decode()
        )
        query = urlencode(
            {
                "client_id": settings.client,
                "response_type": "code",
                "response_mode": "query",
                "redirect_uri": settings.redirect,
                "scope": "openid profile email",
                "state": state,
                "nonce": nonce,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "max_age": "0",
                "prompt": "login",
                "claims": json.dumps(
                    {"id_token": {"acrs": {"essential": True, "values": [settings.context]}}}
                ),
            }
        )
        from fastapi.responses import JSONResponse

        response = JSONResponse({"url": settings.authority + "/oauth2/v2.0/authorize?" + query})
        response.set_cookie(
            "hub_oidc",
            state,
            max_age=300,
            secure=True,
            httponly=True,
            samesite="lax",
            path="/api/v1/microsoft",
        )
        return response

    @app.get("/api/v1/microsoft/callback")
    def callback(request: Request):
        response = RedirectResponse(
            app_url("/?auth_error=microsoft", "/panel/?auth_error=microsoft"),
            status_code=303,
        )
        response.delete_cookie(
            "hub_oidc", path="/api/v1/microsoft", secure=True, httponly=True, samesite="lax"
        )
        state, code = request.query_params.get("state", ""), request.query_params.get("code", "")
        binding = request.cookies.get("hub_oidc", "")
        if (
            not settings
            or not state
            or len(state) > 128
            or not binding
            or not secrets.compare_digest(state.encode(), binding.encode())
        ):
            return response
        with sessions() as db:
            # Atomic consume prevents concurrent callback replay; no untrusted account data is used.
            flow = db.scalar(
                delete(OIDCFlow)
                .where(OIDCFlow.state_hash == security.digest(state), OIDCFlow.expires_at > now())
                .returning(OIDCFlow)
            )
            db.commit()
            if not flow or not code or len(code) > 8192 or request.query_params.get("error"):
                return response
            try:
                client = app.state.microsoft
                claims = client.verify(client.exchange(code, flow.verifier), flow.nonce_hash)
                if db.bind.dialect.name == "postgresql":
                    db.execute(text("SELECT pg_advisory_xact_lock(819260908)"))
                identity = db.scalar(
                    select(MicrosoftIdentity).where(
                        MicrosoftIdentity.tenant_id == settings.tenant,
                        MicrosoftIdentity.object_id == claims["oid"],
                    )
                )
                actor = db.get(User, identity.user_id) if identity else None
                if not actor or actor.archived:
                    return response
                strong = isinstance(claims.get("acrs"), list) and settings.context in claims["acrs"]
                if db.get(AdminGrant, actor.id) and not strong:
                    return response
                if flow.previous_session:
                    db.execute(delete(Session).where(Session.token_hash == flow.previous_session))
                token = secrets.token_urlsafe(48)
                expires = min(
                    now() + timedelta(minutes=30),
                    datetime.fromtimestamp(claims["exp"], timezone.utc),
                )
                db.add(
                    Session(
                        token_hash=security.digest(token),
                        user_id=actor.id,
                        expires_at=expires,
                        method="microsoft",
                        strong_auth=strong,
                        auth_context=settings.context if strong else None,
                        authenticated_at=datetime.fromtimestamp(claims["auth_time"], timezone.utc),
                    )
                )
                db.add(
                    Audit(
                        actor_id=actor.id,
                        action="microsoft_login",
                        entity="users",
                        entity_id=actor.id,
                        changes=json.dumps({"method": "microsoft", "strong_auth": strong}),
                    )
                )
                db.commit()
                response.headers["location"] = app_url("/", "/panel/")
                response.set_cookie(
                    "hub_session",
                    token,
                    max_age=max(1, int((expires - now()).total_seconds())),
                    secure=True,
                    httponly=True,
                    samesite=cookie_samesite,
                    path="/api/v1",
                )
            except HTTPException:
                db.rollback()
        return response
