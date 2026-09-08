import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.cli import bootstrap
from app.main import create_app


def test_bootstrap_once_and_password_preserves_spaces(tmp_path, monkeypatch):
    url = "sqlite:///" + str(tmp_path / "bootstrap.db")
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config("alembic.ini")
    config.attributes["database_url"] = url
    command.upgrade(config, "head")
    password = "  Local-development-123  "
    bootstrap("first@fatec.sp.gov.br", "Primeiro admin", password)
    with pytest.raises(ValueError, match="Já existe"):
        bootstrap("second@fatec.sp.gov.br", "Segundo admin", password)
    app = create_app(url)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "FIRST@fatec.sp.gov.br",
                "password": password,
            },
        )
        assert response.status_code == 200
        client.headers["Authorization"] = "Bearer " + response.json()["access_token"]
        assert client.get("/api/v1/audit").json()[0]["action"] == "bootstrap"
        assert (
            client.post(
                "/api/v1/auth/login",
                json={
                    "email": "first@fatec.sp.gov.br",
                    "password": password.strip(),
                },
            ).status_code
            == 401
        )
    app.state.engine.dispose()
