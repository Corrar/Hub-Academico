import base64

import pytest
from conftest import PASSWORD
from fastapi.testclient import TestClient

from app import main
from app.staging import validate_staging

URL = "postgresql+psycopg://test:test@db.example/hub_test?sslmode=require"
SECRET = "synthetic-test-gate-" + "x" * 32


def settings(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("STAGING_SYNTHETIC_DATA_ONLY", "true")
    monkeypatch.setenv("WEB_SECURE_COOKIE", "true")
    monkeypatch.setenv("WEB_ORIGINS", "https://stage.example")
    monkeypatch.setenv("STAGING_ACCESS_PASSWORD", SECRET)


@pytest.mark.parametrize(
    "key,value",
    [
        ("STAGING_SYNTHETIC_DATA_ONLY", "false"),
        ("WEB_SECURE_COOKIE", "false"),
        ("STAGING_ACCESS_PASSWORD", "short"),
        ("WEB_ORIGINS", ""),
        ("WEB_ORIGINS", "http://stage.example"),
        ("WEB_ORIGINS", "https://*.example"),
        ("WEB_ORIGINS", "https://stage.example/path"),
    ],
)
def test_staging_rejects_unsafe_settings(monkeypatch, key, value):
    settings(monkeypatch)
    monkeypatch.setenv(key, value)
    with pytest.raises(RuntimeError):
        validate_staging(URL)


def test_staging_requires_external_tls_database(monkeypatch):
    settings(monkeypatch)
    for url in ["sqlite:///test.db", "postgresql+psycopg://test:test@db.example/hub"]:
        with pytest.raises(RuntimeError):
            validate_staging(url)
    assert validate_staging(URL)[1] == ["stage.example"]


def test_staging_gate_cookie_and_host(system, monkeypatch):
    _, existing, _ = system
    settings(monkeypatch)
    # Reuse the isolated fixture database; configuration still validates cloud constraints.
    monkeypatch.setattr(main, "make_engine", lambda _: existing.state.engine)
    app = main.create_app(URL)
    with TestClient(app, base_url="https://stage.example") as client:
        assert client.get("/health/live").status_code == 200
        for path in ["/panel/", "/panel/assets/panel.js", "/api/v1/users", "/health/ready"]:
            response = client.get(path)
            assert response.status_code == 401
            assert response.headers["cache-control"] == "no-store"
            assert response.headers["x-robots-tag"] == "noindex, nofollow, noarchive"
        assert client.get("/panel/", headers={"Authorization": "Basic !!!"}).status_code == 401
        client.headers["Authorization"] = (
            "Basic " + base64.b64encode(("tester:" + SECRET).encode()).decode()
        )
        assert client.get("/panel/").status_code == 200
        assert client.get("/panel/assets/panel.js").status_code == 200
        assert client.get("/panel/assets/staging.py").status_code == 404
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
        assert client.get("/panel/", headers={"Host": "attacker.example"}).status_code == 400
        assert (
            client.get("/api/v1/users").status_code == 401
        )  # Gate does not grant application access.
        login = client.post(
            "/api/v1/web/login",
            headers={"Origin": "https://stage.example"},
            json={"email": "admin@fatec.sp.gov.br", "password": PASSWORD},
        )
        assert login.status_code == 200
        assert "Secure" in login.headers["set-cookie"]
        assert (
            client.post("/api/v1/courses", json={"name": "Test", "code": "TEST"}).status_code == 403
        )
        client.headers.update(
            {"Origin": "https://stage.example", "X-CSRF-Token": login.json()["csrf_token"]}
        )
        assert (
            client.post("/api/v1/courses", json={"name": "Test", "code": "TEST"}).status_code == 201
        )
        assert client.post("/api/v1/auth/logout").status_code == 204
        assert client.get("/api/v1/users").status_code == 401


def test_postgres_login_throttle_concurrency(system):
    from concurrent.futures import ThreadPoolExecutor

    from fastapi import HTTPException

    from app.security import login

    _, app, _ = system
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL advisory transaction locks")

    def attempt(_):
        with app.state.sessions() as db:
            try:
                login(db, "missing@fatec.sp.gov.br", "wrong", "parallel-test")
            except HTTPException as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(attempt, range(8)))
    assert results.count(401) == 5
    assert results.count(429) == 3
