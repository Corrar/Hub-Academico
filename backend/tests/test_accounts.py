"""Local account maintenance, sliding sessions and request size limits."""

from datetime import timedelta

from conftest import PASSWORD, catalog, create_user, login_user
from sqlalchemy import select

from app import security
from app.models import Session, now


def test_password_change_requires_current_secret_and_ends_other_sessions(system):
    client, app, _ = system
    user = create_user(client)
    first = login_user(client, user["email"])
    second = login_user(client, user["email"])
    path = "/api/v1/me/password"
    wrong = {"current_password": "incorreta-123456", "new_password": "Nova-senha-local-456"}
    assert client.post(path, headers=first, json=wrong).status_code == 403
    short = {"current_password": PASSWORD, "new_password": "curta"}
    assert client.post(path, headers=first, json=short).status_code == 422
    same = {"current_password": PASSWORD, "new_password": PASSWORD}
    assert client.post(path, headers=first, json=same).status_code == 422
    body = {"current_password": PASSWORD, "new_password": "Nova-senha-local-456"}
    assert client.post(path, headers=first, json=body).status_code == 204
    assert client.get("/api/v1/me", headers=first).status_code == 200
    assert client.get("/api/v1/me", headers=second).status_code == 401
    old = client.post("/api/v1/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert old.status_code == 401
    new = client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": "Nova-senha-local-456"},
    )
    assert new.status_code == 200
    audit = client.get("/api/v1/audit").json()
    assert audit[0]["action"] == "password_changed"
    assert "Nova-senha" not in client.get("/api/v1/audit").text


def test_password_change_is_throttled(system):
    client, _, _ = system
    user = create_user(client)
    headers = login_user(client, user["email"])
    wrong = {"current_password": "incorreta-123456", "new_password": "Nova-senha-local-456"}
    codes = [
        client.post("/api/v1/me/password", headers=headers, json=wrong).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [403] * 5 and codes[5] == 429


def test_coordinator_edits_and_resets_local_accounts(system):
    client, _, _ = system
    _, _, groups = catalog(client)
    student = create_user(client)
    student_headers = login_user(client, student["email"])
    path = "/api/v1/users/" + student["id"]
    updated = client.put(path, json={"name": "Aluna Renomeada", "role": "student"})
    assert updated.status_code == 200 and updated.json()["name"] == "Aluna Renomeada"
    # Name-only edits keep the session; role changes end it.
    assert client.get("/api/v1/me", headers=student_headers).status_code == 200
    assert client.put(path, json={"name": "Aluna", "role": "teacher"}).status_code == 200
    assert client.get("/api/v1/me", headers=student_headers).status_code == 401
    assert client.put(path, json={"name": "X", "role": "coordinator"}).status_code == 422
    me = client.get("/api/v1/me").json()
    assert (
        client.put("/api/v1/users/" + me["id"], json={"name": "X", "role": "student"}).status_code
        == 409
    )

    headers = login_user(client, student["email"])
    reset = client.post(path + "/password", json={"new_password": "Senha-redefinida-789"})
    assert reset.status_code == 204
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": student["email"], "password": "Senha-redefinida-789"},
        ).status_code
        == 200
    )
    assert client.post(
        path + "/password", headers=headers, json={"new_password": "x" * 12}
    ).status_code in {401, 403}
    assert groups


def test_user_and_catalog_search(system):
    client, _, _ = system
    catalog(client)
    create_user(client, name="Maria Teste", email="maria@fatec.sp.gov.br")
    create_user(client, role="teacher", name="João Docente", email="joao@fatec.sp.gov.br")
    names = lambda rows: [row["name"] for row in rows]  # noqa: E731
    assert names(client.get("/api/v1/users?q=maria").json()) == ["Maria Teste"]
    assert names(client.get("/api/v1/users?q=JOAO@").json()) == ["João Docente"]
    assert names(client.get("/api/v1/users?role=teacher").json()) == ["João Docente"]
    assert names(client.get("/api/v1/courses?q=dados").json()) == ["Ciência de Dados"]
    assert names(client.get("/api/v1/subjects?q=BD").json()) == ["Banco de Dados"]
    assert len(client.get("/api/v1/groups?q=2026/2").json()) == 2
    assert client.get("/api/v1/users?q=%25").json() == []


def test_idle_timeout_slides_until_absolute_limit(system):
    client, app, _ = system
    user = create_user(client)
    headers = login_user(client, user["email"])
    with app.state.sessions() as db:
        session = db.scalar(select(Session).where(Session.user_id == user["id"]))
        session.expires_at = now() + timedelta(minutes=2)
        db.commit()
    assert client.get("/api/v1/me", headers=headers).status_code == 200
    with app.state.sessions() as db:
        session = db.scalar(select(Session).where(Session.user_id == user["id"]))
        assert security.utc(session.expires_at) > now() + timedelta(minutes=29)
        # Near the absolute limit the session is not extended past it.
        session.authenticated_at = now() - security.ABSOLUTE_TIMEOUT + timedelta(minutes=1)
        session.expires_at = now() + timedelta(minutes=1)
        db.commit()
    assert client.get("/api/v1/me", headers=headers).status_code == 200
    with app.state.sessions() as db:
        session = db.scalar(select(Session).where(Session.user_id == user["id"]))
        assert security.utc(session.expires_at) <= now() + timedelta(minutes=1, seconds=5)


def test_web_cookie_lasts_until_absolute_limit(system):
    client, _, _ = system
    user = create_user(client)
    client.headers.pop("Authorization")
    response = client.post(
        "/api/v1/web/login",
        headers={"Origin": "http://localhost:8000"},
        json={"email": user["email"], "password": PASSWORD},
    )
    assert response.status_code == 200
    assert "Max-Age=28800" in response.headers["set-cookie"]


def test_request_body_limit(system):
    client, _, _ = system
    huge = b"{" + b" " * (1024 * 1024 + 10) + b"}"
    response = client.post(
        "/api/v1/courses", content=huge, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413

    def chunks():
        for _ in range(20):
            yield b" " * (64 * 1024)

    streamed = client.post(
        "/api/v1/courses", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert streamed.status_code == 413
