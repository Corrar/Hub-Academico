from datetime import timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import jwt
import pytest
from conftest import PASSWORD
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models import AdminGrant, Audit, MicrosoftIdentity, OIDCFlow, Session, User, now
from app.security import digest

TENANT = "11111111-1111-4111-8111-111111111111"
CLIENT = "22222222-2222-4222-8222-222222222222"
OID = "33333333-3333-4333-8333-333333333333"
ORIGIN = "https://stage.example"


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def cloud(system, monkeypatch, signing_key):
    _, old, url = system
    for key, value in {
        "MICROSOFT_TENANT_ID": TENANT,
        "MICROSOFT_CLIENT_ID": CLIENT,
        "MICROSOFT_CLIENT_SECRET": "synthetic-client-secret",
        "MICROSOFT_REDIRECT_URI": ORIGIN + "/api/v1/microsoft/callback",
        "MICROSOFT_AUTH_CONTEXT": "c1",
        "WEB_ORIGINS": ORIGIN,
        "WEB_SECURE_COOKIE": "true",
    }.items():
        monkeypatch.setenv(key, value)
    with old.state.sessions() as db:
        user = db.scalar(select(User).where(User.email == "admin@fatec.sp.gov.br"))
        actor_id = user.id
        db.add(AdminGrant(user_id=actor_id))
        db.add(MicrosoftIdentity(user_id=actor_id, tenant_id=TENANT, object_id=OID))
        db.commit()
    app = create_app(url)
    monkeypatch.setattr(
        app.state.microsoft.keys,
        "get_signing_key_from_jwt",
        lambda token: SimpleNamespace(key=signing_key.public_key()),
    )
    with TestClient(app, base_url=ORIGIN) as client:
        client.headers["Origin"] = ORIGIN
        yield client, app, actor_id, signing_key
    app.state.engine.dispose()


def begin(cloud, overrides=None, wrong_signature=False):
    client, app, _, key = cloud
    response = client.post("/api/v1/microsoft/start")
    assert response.status_code == 200
    assert "SameSite=lax" in response.headers["set-cookie"]
    query = parse_qs(urlsplit(response.json()["url"]).query)
    stamp = int(now().timestamp())
    claims = {
        "iss": f"https://login.microsoftonline.com/{TENANT}/v2.0",
        "aud": CLIENT,
        "tid": TENANT,
        "oid": OID,
        "sub": "subject",
        "exp": stamp + 600,
        "iat": stamp,
        "nbf": stamp,
        "auth_time": stamp,
        "nonce": query["nonce"][0],
        "acrs": ["c1"],
    }
    claims.update(overrides or {})
    if wrong_signature:
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    signed = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})
    app.state.microsoft.exchange = lambda code, verifier: signed
    return query


def finish(cloud, query):
    client = cloud[0]
    return client.get(
        "/api/v1/microsoft/callback",
        params={"state": query["state"][0], "code": "test-code"},
        follow_redirects=False,
    )


def admin_login(cloud):
    response = finish(cloud, begin(cloud))
    assert response.headers["location"] == "/panel/"
    session = cloud[0].get("/api/v1/web/session").json()
    cloud[0].headers["X-CSRF-Token"] = session["csrf_token"]
    assert session["user"]["administrator"] is True


def test_microsoft_admin_login_and_replay(cloud):
    client, app, actor, _ = cloud
    query = begin(cloud)
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid profile email"]
    assert finish(cloud, query).headers["location"] == "/panel/"
    token = client.cookies.get("hub_session")
    assert token
    assert client.get("/api/v1/admin/status").json()["microsoft_configured"] is True
    # Even restoring the state cookie cannot reuse the consumed flow.
    client.cookies.set("hub_oidc", query["state"][0])
    assert "auth_error" in finish(cloud, query).headers["location"]
    with app.state.sessions() as db:
        row = db.get(Session, digest(token))
        assert row.method == "microsoft" and row.strong_auth
        logs = db.scalars(select(Audit).where(Audit.action == "microsoft_login")).all()
        assert len(logs) == 1
        assert token not in logs[0].changes and "nonce" not in logs[0].changes


@pytest.mark.parametrize(
    "override",
    [
        {"tid": str(uuid4())},
        {"aud": "wrong-client"},
        {"iss": "https://attacker.example"},
        {"nonce": "wrong"},
        {"exp": 1},
        {"auth_time": 1},
        {"acrs": []},
        {"oid": str(uuid4())},
    ],
)
def test_microsoft_rejects_invalid_identity_and_missing_mfa(cloud, override):
    assert "auth_error" in finish(cloud, begin(cloud, override)).headers["location"]
    assert cloud[0].cookies.get("hub_session") is None


def test_microsoft_rejects_signature_and_state_mismatch(cloud):
    query = begin(cloud, wrong_signature=True)
    assert "auth_error" in finish(cloud, query).headers["location"]
    query = begin(cloud)
    cloud[0].cookies.clear()
    assert "auth_error" in finish(cloud, query).headers["location"]
    with cloud[1].state.sessions() as db:
        assert db.get(OIDCFlow, digest(query["state"][0])) is not None
    assert (
        cloud[0]
        .post("/api/v1/microsoft/start", headers={"Origin": "https://attacker.example"})
        .status_code
        == 403
    )


def test_local_password_cannot_bypass_microsoft(cloud):
    client = cloud[0]
    for endpoint in ["/api/v1/web/login", "/api/v1/auth/login"]:
        assert (
            client.post(
                endpoint, json={"email": "admin@fatec.sp.gov.br", "password": PASSWORD}
            ).status_code
            == 403
        )


def test_admin_provision_permissions_and_revocation(cloud):
    client, app, actor, _ = cloud
    admin_login(cloud)
    response = client.post(
        "/api/v1/admin/users",
        json={
            "name": "Professor teste",
            "email": "prof.teste@fatec.sp.gov.br",
            "role": "teacher",
            "object_id": str(uuid4()),
        },
    )
    assert response.status_code == 201, response.text
    target = response.json()
    assert "password_hash" not in target
    reason = "Ajuste autorizado para teste"
    promote = {"role": "coordinator", "administrator": True, "archived": False, "reason": reason}
    assert client.put("/api/v1/admin/users/" + target["id"], json=promote).status_code == 200
    assert client.put("/api/v1/admin/users/" + actor, json=promote).status_code == 409
    # Admin sessions never expose tokens or their hashes.
    listing = client.get("/api/v1/admin/users/" + actor + "/sessions").json()
    assert any(row["method"] == "microsoft" for row in listing)
    assert "token_hash" not in listing[0]
    with app.state.sessions() as db:
        session = db.get(Session, digest(client.cookies.get("hub_session")))
        session.authenticated_at = now() - timedelta(minutes=6)
        db.commit()
    assert (
        client.post(
            "/api/v1/admin/users/" + target["id"] + "/revoke", json={"reason": reason}
        ).status_code
        == 403
    )
    assert client.get("/api/v1/admin/users").status_code == 200
    admin_login(cloud)
    assert (
        client.post("/api/v1/admin/users/" + actor + "/revoke", json={"reason": reason}).status_code
        == 204
    )
    assert client.get("/api/v1/admin/status").status_code == 401


def test_coordinator_cannot_access_admin(system):
    client, _, _ = system
    assert client.get("/api/v1/admin/users").status_code == 403
    assert (
        client.post(
            "/api/v1/admin/users",
            json={
                "name": "X",
                "email": "x@fatec.sp.gov.br",
                "role": "coordinator",
                "object_id": str(uuid4()),
            },
        ).status_code
        == 403
    )


def test_microsoft_student_gets_only_own_groups(cloud):
    client, app, actor, _ = cloud
    with app.state.sessions() as db:
        db.delete(db.get(AdminGrant, actor))
        db.get(User, actor).role = "student"
        db.commit()
    assert finish(cloud, begin(cloud, {"acrs": []})).headers["location"] == "/panel/"
    assert client.get("/api/v1/web/session").json()["user"]["role"] == "student"
    assert client.get("/api/v1/me/groups").json() == []
    assert client.get("/api/v1/admin/status").status_code == 403
    assert client.get("/api/v1/users").status_code == 403


def test_bootstrap_admin_is_explicit_and_single_use(cloud, monkeypatch):
    from app.bootstrap_admin import bootstrap

    _, app, _, _ = cloud
    monkeypatch.setenv("DATABASE_URL", app.state.engine.url.render_as_string(hide_password=False))
    with pytest.raises(ValueError, match="Já existe administrador"):
        bootstrap("bruno.teste@fatec.sp.gov.br", "Admin teste", str(uuid4()))


def test_linked_account_rejects_existing_local_session(cloud):
    client, app, actor, _ = cloud
    with app.state.sessions() as db:
        stale = db.scalar(
            select(Session).where(Session.user_id == actor, Session.method == "local")
        )
        # Raw token is intentionally unavailable; insert a known token only in this isolated test.
        assert stale is not None
        db.add(
            Session(
                token_hash=digest("stale-local-test"),
                user_id=actor,
                expires_at=now() + timedelta(minutes=30),
            )
        )
        db.commit()
    assert (
        client.get("/api/v1/me", headers={"Authorization": "Bearer stale-local-test"}).status_code
        == 401
    )


def test_context_change_invalidates_admin_session(cloud):
    client, app, _, _ = cloud
    admin_login(cloud)
    with app.state.sessions() as db:
        row = db.get(Session, digest(client.cookies.get("hub_session")))
        row.auth_context = "c2"
        db.commit()
    assert client.get("/api/v1/admin/status").status_code == 403


def test_microsoft_flow_expiration(cloud):
    query = begin(cloud)
    with cloud[1].state.sessions() as db:
        db.get(OIDCFlow, digest(query["state"][0])).expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert "auth_error" in finish(cloud, query).headers["location"]
    assert cloud[0].cookies.get("hub_session") is None
