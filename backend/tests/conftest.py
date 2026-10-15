import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app
from app.models import User
from app.security import passwords

PASSWORD = "Local-test-only-123!"


@pytest.fixture(scope="session")
def password_hash():
    return passwords.hash(PASSWORD)


@pytest.fixture
def system(tmp_path, monkeypatch, password_hash):
    monkeypatch.setenv("APP_ENV", "test")
    url = os.getenv("TEST_DATABASE_URL", "sqlite:///" + str(tmp_path / "test.db"))
    app = create_app(url)
    # TEST_DATABASE_URL must identify a dedicated disposable CI database.
    if app.state.engine.dialect.name == "postgresql":
        with app.state.engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["database_url"] = url
    command.upgrade(config, "head")
    with app.state.sessions() as db:
        admin = User(
            name="Coordenação teste",
            email="admin@fatec.sp.gov.br",
            role="coordinator",
            password_hash=password_hash,
        )
        db.add(admin)
        db.commit()
    with TestClient(app) as client:
        login = client.post(
            "/api/v1/auth/login", json={"email": "admin@fatec.sp.gov.br", "password": PASSWORD}
        )
        assert login.status_code == 200
        client.headers["Authorization"] = "Bearer " + login.json()["access_token"]
        yield client, app, url
    app.state.engine.dispose()


def create_user(client, role="student", name="Aluno", email="aluno@fatec.sp.gov.br"):
    response = client.post(
        "/api/v1/users",
        json={
            "name": name,
            "email": email,
            "role": role,
            "password": PASSWORD,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def login_user(client, email):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": "Bearer " + response.json()["access_token"]}


def catalog(client):
    course = client.post("/api/v1/courses", json={"code": "CD", "name": "Ciência de Dados"})
    assert course.status_code == 201, course.text
    subject = client.post(
        "/api/v1/subjects",
        json={"course_id": course.json()["id"], "code": "BD", "name": "Banco de Dados", "term": 3},
    )
    assert subject.status_code == 201, subject.text
    groups = []
    for name in ["A", "B"]:
        response = client.post(
            "/api/v1/groups",
            json={"subject_id": subject.json()["id"], "semester": "2026/2", "name": name},
        )
        assert response.status_code == 201, response.text
        groups.append(response.json())
    return course.json(), subject.json(), groups
