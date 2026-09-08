from conftest import PASSWORD, create_user
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models import Session
from app.security import digest

ORIGIN = "http://localhost:8000"


def browser_login(client):
    client.headers.pop("Authorization", None)
    response = client.post(
        "/api/v1/web/login",
        headers={"Origin": ORIGIN},
        json={
            "email": "admin@fatec.sp.gov.br",
            "password": PASSWORD,
        },
    )
    assert response.status_code == 200, response.text
    client.headers.update({"Origin": ORIGIN, "X-CSRF-Token": response.json()["csrf_token"]})
    return response


def test_web_cookie_csrf_rotation_logout(system):
    client, app, _ = system
    # HTTPS exercises the default Secure cookie without weakening the test configuration.
    client.base_url = "https://testserver"
    response = browser_login(client)
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=strict" in cookie
    assert "path=/api/v1" in cookie
    assert "access_token" not in response.json()
    token = client.cookies.get("hub_session")
    with app.state.sessions() as db:
        assert db.get(Session, digest(token)) is not None
        assert db.get(Session, token) is None
    assert client.get("/api/v1/web/session").json()["user"]["role"] == "coordinator"
    for headers in [
        {"Origin": ORIGIN, "X-CSRF-Token": ""},
        {"Origin": "https://attacker.example", "X-CSRF-Token": response.json()["csrf_token"]},
        {"Origin": "", "X-CSRF-Token": response.json()["csrf_token"]},
    ]:
        assert (
            client.post(
                "/api/v1/courses", headers=headers, json={"name": "Bloqueado", "code": "BLOCKED"}
            ).status_code
            == 403
        )
    # Adding a bearer header cannot bypass cookie CSRF checks.
    assert (
        client.post(
            "/api/v1/courses",
            headers={"Authorization": "Bearer invalid", "X-CSRF-Token": ""},
            json={"name": "X", "code": "X"},
        ).status_code
        == 403
    )
    assert client.get("/api/v1/courses").json() == []
    browser_login(client)
    with app.state.sessions() as db:
        assert db.get(Session, digest(token)) is None
    current = client.cookies.get("hub_session")
    assert current != token
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.cookies.get("hub_session") is None
    assert client.get("/api/v1/web/session").status_code == 401
    with app.state.sessions() as db:
        assert db.get(Session, digest(current)) is None


def test_web_login_origin_and_role(system):
    client, app, _ = system
    create_user(client)
    client.headers.pop("Authorization")
    credentials = {"email": "admin@fatec.sp.gov.br", "password": PASSWORD}
    for headers in [{}, {"Origin": "https://attacker.example"}, {"Origin": "null"}]:
        assert (
            client.post("/api/v1/web/login", headers=headers, json=credentials).status_code == 403
        )
    response = client.post(
        "/api/v1/web/login",
        headers={"Origin": ORIGIN},
        json={"email": "aluno@fatec.sp.gov.br", "password": PASSWORD},
    )
    assert response.status_code == 403
    assert "set-cookie" not in response.headers
    with app.state.sessions() as db:
        # Only the coordinator bearer session from the fixture remains.
        assert len(db.scalars(select(Session)).all()) == 1


def test_web_validation_does_not_echo_passwords(system):
    client, _, _ = system
    secret = "super-secret-password-" * 10
    for endpoint, body in [
        ("/api/v1/web/login", {"email": "x", "password": secret}),
        (
            "/api/v1/users",
            {"name": "Teste", "email": "bad", "role": "coordinator", "password": secret},
        ),
        ("/api/v1/memberships", {"password": secret}),
    ]:
        response = (
            client.post(endpoint, json=body)
            if "memberships" not in endpoint
            else client.put(endpoint, json=body)
        )
        assert response.status_code == 422
        assert secret not in response.text and "input" not in response.text


def test_panel_assets_headers_and_auth_boundaries(system):
    client, _, _ = system
    client.headers.pop("Authorization")
    response = client.get("/panel/")
    assert response.status_code == 200
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert "script-src 'self'" in response.headers["content-security-policy"]
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
    for filename in ["panel.css", "panel.js", "logo-fatec.png"]:
        assert client.get("/panel/assets/" + filename).status_code == 200
    for endpoint in ["/api/v1/dashboard", "/api/v1/lookup/users", "/api/v1/courses"]:
        assert client.get(endpoint).status_code == 401
    assert client.get("/panel/assets/../main.py").status_code == 404


def test_web_academic_flow_persistence_and_scope(system):
    client, _, url = system
    student = create_user(client)
    client.base_url = "https://testserver"
    browser_login(client)
    course = client.post(
        "/api/v1/courses", json={"code": "ADS", "name": "<script>alert(1)</script>"}
    ).json()
    subject = client.post(
        "/api/v1/subjects",
        json={"course_id": course["id"], "code": "BD", "name": "Banco de Dados", "term": 1},
    ).json()
    group = client.post(
        "/api/v1/groups",
        json={"subject_id": subject["id"], "name": "Noturno A", "semester": "2026/2"},
    ).json()
    membership = client.put(
        "/api/v1/memberships",
        json={
            "user_id": student["id"],
            "group_id": group["id"],
            "starts_on": "2020-01-01",
            "ends_on": "2099-12-31",
        },
    )
    assert membership.status_code == 200
    counts = client.get("/api/v1/dashboard").json()
    assert counts == {"courses": 1, "subjects": 1, "groups": 1, "users": 2, "memberships": 1}
    assert (
        client.get("/api/v1/lookup/groups?q=noturno").json()[0]["label"]
        == "Banco de Dados · Noturno A · 2026/2"
    )
    assert len(client.get("/api/v1/audit").json()) == 5
    # Recreate the app against the same database; browser session and writes survive.
    app = create_app(url)
    try:
        with TestClient(app, base_url="https://testserver") as restarted:
            restarted.cookies.update(client.cookies)
            assert restarted.get("/api/v1/dashboard").json() == counts
        client.post("/api/v1/auth/logout")
        token = client.post(
            "/api/v1/auth/login", json={"email": student["email"], "password": PASSWORD}
        ).json()["access_token"]
        client.headers["Authorization"] = "Bearer " + token
        assert client.get("/api/v1/me/groups").json()[0]["id"] == group["id"]
        assert client.get("/api/v1/dashboard").status_code == 403
        assert client.get("/api/v1/lookup/users").status_code == 403
    finally:
        app.state.engine.dispose()


def test_lookup_filters_and_pagination(system):
    client, _, _ = system
    for code, name in [("A", "Alpha"), ("B", "Beta"), ("C", "Gamma")]:
        assert client.post("/api/v1/courses", json={"code": code, "name": name}).status_code == 201
    first = client.get("/api/v1/lookup/courses?limit=1").json()[0]
    second = client.get("/api/v1/lookup/courses?limit=1&offset=1").json()[0]
    assert first["id"] != second["id"]
    assert client.get("/api/v1/lookup/courses?q=%25").json() == []
    assert (
        client.patch(
            "/api/v1/courses/" + first["id"] + "/archive", json={"archived": True}
        ).status_code
        == 200
    )
    assert len(client.get("/api/v1/lookup/courses").json()) == 2
    assert (
        client.get("/api/v1/lookup/courses", params={"ids": first["id"]})
        .json()[0]["label"]
        .endswith("(arquivado)")
    )
    assert client.get("/api/v1/lookup/invalid").status_code == 404
