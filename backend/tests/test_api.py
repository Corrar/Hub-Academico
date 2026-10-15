import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from conftest import PASSWORD, catalog, create_user, login_user
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.main import create_app
from app.models import Audit, Session, now
from app.security import digest


def dates(start=-1, end=30):
    today = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    return {
        "starts_on": str(today + timedelta(days=start)),
        "ends_on": str(today + timedelta(days=end)),
    }


def test_health_openapi_and_auth(system):
    client, app, _ = system
    assert client.get("/health/ready").status_code == 200
    client.headers.clear()
    assert client.get("/api/v1/users").status_code == 401
    assert client.get("/api/v1/me").status_code == 401
    paths = app.openapi()["paths"]
    assert (
        "$ref"
        in paths["/api/v1/courses"]["post"]["requestBody"]["content"]["application/json"]["schema"]
    )
    assert client.get("/health/live").headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("role", ["student", "teacher"])
def test_role_and_object_isolation(system, role):
    client, _, _ = system
    user = create_user(client, role=role)
    _, _, groups = catalog(client)
    member = client.put(
        "/api/v1/memberships",
        json={
            "user_id": user["id"],
            "group_id": groups[0]["id"],
            **dates(),
        },
    )
    assert member.status_code == 200
    headers = login_user(client, user["email"])
    assert client.get("/api/v1/me/groups", headers=headers).json() == [groups[0]]
    assert client.get("/api/v1/groups/" + groups[1]["id"], headers=headers).status_code == 404
    assert client.get("/api/v1/groups/" + groups[0]["id"], headers=headers).status_code == 200
    for path in ["users", "courses", "subjects", "groups", "memberships", "audit"]:
        assert client.get("/api/v1/" + path, headers=headers).status_code == 403
    assert (
        client.post(
            "/api/v1/courses", headers=headers, json={"code": "EVIL", "name": "Unauthorized"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "name": "X",
                "email": "x@fatec.sp.gov.br",
                "role": "coordinator",
                "password": PASSWORD,
            },
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/v1/memberships",
            headers=headers,
            json={
                "user_id": user["id"],
                "group_id": groups[1]["id"],
                **dates(),
            },
        ).status_code
        == 403
    )


@pytest.mark.parametrize("start,end", [(-30, -1), (1, 30)])
def test_membership_outside_validity(system, start, end):
    client, _, _ = system
    user = create_user(client)
    _, _, groups = catalog(client)
    client.put(
        "/api/v1/memberships",
        json={
            "user_id": user["id"],
            "group_id": groups[0]["id"],
            **dates(start, end),
        },
    )
    headers = login_user(client, user["email"])
    assert client.get("/api/v1/me/groups", headers=headers).json() == []
    assert client.get("/api/v1/groups/" + groups[0]["id"], headers=headers).status_code == 404


def test_archive_parent_revokes_visibility_and_restore_recovers(system):
    client, _, _ = system
    user = create_user(client)
    course, _, groups = catalog(client)
    client.put(
        "/api/v1/memberships",
        json={
            "user_id": user["id"],
            "group_id": groups[0]["id"],
            **dates(0, 0),
        },
    )
    headers = login_user(client, user["email"])
    assert len(client.get("/api/v1/me/groups", headers=headers).json()) == 1
    path = "/api/v1/courses/" + course["id"] + "/archive"
    assert client.patch(path, json={"archived": True}).status_code == 200
    assert client.get("/api/v1/me/groups", headers=headers).json() == []
    assert client.get("/api/v1/groups/" + groups[0]["id"], headers=headers).status_code == 404
    assert (
        client.put(
            "/api/v1/memberships",
            json={
                "user_id": user["id"],
                "group_id": groups[1]["id"],
                **dates(),
            },
        ).status_code
        == 404
    )
    assert client.patch(path, json={"archived": False}).status_code == 200
    assert len(client.get("/api/v1/me/groups", headers=headers).json()) == 1


def test_membership_upsert_and_archive(system):
    client, _, _ = system
    user = create_user(client)
    _, _, groups = catalog(client)
    payload = {"user_id": user["id"], "group_id": groups[0]["id"], **dates()}
    first = client.put("/api/v1/memberships", json=payload).json()
    second = client.put("/api/v1/memberships", json=payload).json()
    assert first["id"] == second["id"]
    headers = login_user(client, user["email"])
    client.patch("/api/v1/memberships/" + first["id"] + "/archive", json={"archived": True})
    assert client.get("/api/v1/me/groups", headers=headers).json() == []
    client.put("/api/v1/memberships", json=payload)
    assert len(client.get("/api/v1/me/groups", headers=headers).json()) == 1


def test_archive_user_revokes_sessions_even_after_restore(system):
    client, _, _ = system
    user = create_user(client)
    headers = login_user(client, user["email"])
    path = "/api/v1/users/" + user["id"] + "/archive"
    assert client.patch(path, json={"archived": True}).status_code == 200
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    assert client.patch(path, json={"archived": False}).status_code == 200
    assert client.get("/api/v1/me", headers=headers).status_code == 401


def test_logout_expiry_and_opaque_tokens(system):
    client, app, _ = system
    user = create_user(client)
    headers = login_user(client, user["email"])
    token = headers["Authorization"].split()[1]
    with app.state.sessions() as db:
        assert db.get(Session, token) is None
        session = db.get(Session, digest(token))
        assert session is not None
        session.expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    headers = login_user(client, user["email"])
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/me", headers=headers).status_code == 401


def test_validation_duplicates_rollback_and_no_secrets(system):
    client, app, _ = system
    course, subject, groups = catalog(client)
    assert (
        client.post("/api/v1/courses", json={"code": "CD", "name": "Duplicado"}).status_code == 409
    )
    assert client.post("/api/v1/courses", json={"code": " ", "name": " "}).status_code == 422
    assert (
        client.post(
            "/api/v1/users",
            json={
                "name": "X",
                "email": "x@gmail.com",
                "role": "student",
                "password": PASSWORD,
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/courses", json={"code": "X", "name": "X", "role": "coordinator"}
        ).status_code
        == 422
    )
    user = create_user(client)
    assert (
        client.put(
            "/api/v1/memberships",
            json={
                "user_id": user["id"],
                "group_id": groups[0]["id"],
                **dates(2, 1),
            },
        ).status_code
        == 422
    )
    other = client.post("/api/v1/courses", json={"code": "GC", "name": "Gestão"}).json()
    assert (
        client.put(
            "/api/v1/subjects/" + subject["id"],
            json={
                "code": "BD",
                "name": "BD",
                "term": 3,
                "course_id": other["id"],
            },
        ).status_code
        == 409
    )
    logs = client.get("/api/v1/audit").text
    assert "password" not in logs and PASSWORD not in logs and "$argon2" not in logs
    assert "password" not in client.get("/api/v1/users").text
    with app.state.sessions() as db:
        assert len(list(db.scalars(select(Audit).where(Audit.entity == "courses")))) == 2


def test_updates_audited_and_persist_across_app_restart(system):
    client, app, url = system
    course, _, _ = catalog(client)
    response = client.put(
        "/api/v1/courses/" + course["id"], json={"code": "CD", "name": "Novo nome"}
    )
    assert response.status_code == 200
    logs = client.get("/api/v1/audit").json()
    update = next(log for log in logs if log["action"] == "update")
    changes = json.loads(update["changes"])
    assert changes["before"]["name"] == "Ciência de Dados"
    assert changes["after"]["name"] == "Novo nome"
    from fastapi.testclient import TestClient

    second = create_app(url)
    with TestClient(second) as other:
        assert other.get("/api/v1/courses", headers=client.headers).json()[0]["name"] == "Novo nome"
    second.state.engine.dispose()


@pytest.mark.parametrize(
    "sql", ["UPDATE audit_logs SET action='tampered'", "DELETE FROM audit_logs"]
)
def test_audit_database_rejects_mutation(system, sql):
    client, app, _ = system
    catalog(client)
    with app.state.engine.begin() as connection:
        with pytest.raises(DBAPIError):
            connection.execute(text(sql))


def test_login_throttling_and_generic_errors(system):
    client, _, _ = system
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "unknown@fatec.sp.gov.br",
                "password": "wrong",
            },
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "E-mail ou senha inválidos"
    assert (
        client.post(
            "/api/v1/auth/login",
            json={
                "email": "unknown@fatec.sp.gov.br",
                "password": "wrong",
            },
        ).status_code
        == 429
    )


def test_cannot_archive_coordinator(system):
    client, _, _ = system
    user = client.get("/api/v1/me").json()
    assert (
        client.patch(
            "/api/v1/users/" + user["id"] + "/archive", json={"archived": True}
        ).status_code
        == 409
    )


def test_production_is_not_silently_enabled(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError, match="aceite institucional"):
        create_app()


def test_unmigrated_database_is_not_ready(tmp_path):
    from fastapi.testclient import TestClient

    app = create_app("sqlite:///" + str(tmp_path / "empty.db"))
    with TestClient(app) as client:
        assert client.get("/health/ready").status_code == 503
    app.state.engine.dispose()
