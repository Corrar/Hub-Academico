"""Fail-closed settings for an isolated, synthetic-data cloud test environment."""

import base64
import binascii
import os
import secrets
from urllib.parse import urlsplit

from fastapi.responses import JSONResponse
from sqlalchemy.engine import make_url

from .security import digest


def validate_staging(url):
    if os.getenv("STAGING_SYNTHETIC_DATA_ONLY") != "true":
        raise RuntimeError("Homologação exige STAGING_SYNTHETIC_DATA_ONLY=true e banco isolado.")
    parsed = make_url(url)
    if parsed.drivername != "postgresql+psycopg" or parsed.query.get("sslmode") not in {
        "require",
        "verify-ca",
        "verify-full",
    }:
        raise RuntimeError("Homologação exige PostgreSQL/psycopg externo com TLS.")
    if os.getenv("WEB_SECURE_COOKIE", "true").lower() != "true":
        raise RuntimeError("Homologação exige WEB_SECURE_COOKIE=true.")
    origins = os.getenv("WEB_ORIGINS", "").split(",")
    for origin in origins:
        parts = urlsplit(origin.strip())
        if (
            parts.scheme != "https"
            or not parts.hostname
            or parts.username
            or parts.password
            or parts.path
            or parts.query
            or parts.fragment
            or "*" in parts.netloc
        ):
            raise RuntimeError("WEB_ORIGINS exige origens HTTPS exatas, sem caminho ou curingas.")
    password = os.getenv("STAGING_ACCESS_PASSWORD", "")
    if len(password) < 32 or len(password) > 128:
        raise RuntimeError("Defina STAGING_ACCESS_PASSWORD aleatória com 32 a 128 caracteres.")
    return password, [urlsplit(origin.strip()).hostname for origin in origins]


def access_gate(password):
    expected = digest("tester:" + password)

    async def gate(request, call_next):
        if request.url.path != "/health/live":
            supplied = request.headers.get("authorization", "")
            valid = False
            if supplied.lower().startswith("basic ") and len(supplied) < 512:
                try:
                    decoded = base64.b64decode(supplied[6:], validate=True).decode("utf-8")
                    valid = secrets.compare_digest(digest(decoded), expected)
                except (ValueError, UnicodeError, binascii.Error):
                    pass
            if not valid:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Homologação restrita"},
                    headers={"WWW-Authenticate": 'Basic realm="Hub homologacao", charset="UTF-8"'},
                )
        return await call_next(request)

    return gate
