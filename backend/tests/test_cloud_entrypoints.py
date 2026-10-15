"""Exercise the actual cloud entrypoint in both supported Vercel project roots."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("directory", [ROOT, ROOT / "backend"])
def test_cloud_entrypoint_is_protected_without_database_connection(directory):
    env = {
        **os.environ,
        "VERCEL": "1",
        "APP_ENV": "staging",
        "STAGING_SYNTHETIC_DATA_ONLY": "true",
        "WEB_SECURE_COOKIE": "true",
        "WEB_ORIGINS": "https://stage.example",
        "STAGING_ACCESS_PASSWORD": "synthetic-entrypoint-test-" + "x" * 32,
        "DATABASE_URL": "postgresql+psycopg://test:test@db.invalid/test?sslmode=require",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            """
from index import app
from fastapi.testclient import TestClient
with TestClient(app, base_url="https://stage.example") as client:
    assert client.get("/health/live").json()["environment"] == "staging"
    assert client.get("/panel/").status_code == 401
    assert client.get("/panel/assets/panel.js").status_code == 401
    client.auth = ("tester", __import__("os").environ["STAGING_ACCESS_PASSWORD"])
    assert client.get("/panel/").status_code == 200
    assert client.get("/panel/assets/panel.js").status_code == 200
    assert client.get("/api/v1/web/session").status_code == 401
""",
        ],
        cwd=directory,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("mode", ["development", "test", "production"])
def test_vercel_entrypoint_rejects_other_modes(mode):
    result = subprocess.run(
        [sys.executable, "-c", "import index"],
        cwd=ROOT,
        env={**os.environ, "VERCEL": "1", "APP_ENV": mode},
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode != 0
    assert "exclusivos de homologação" in result.stderr


def test_vercel_requirements_are_standalone_and_match_backend():
    from packaging.requirements import Requirement

    def dependencies(path):
        lines = [
            line.strip()
            for line in path.read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        assert all(not line.startswith("-") for line in lines)
        for line in lines:
            requirement = Requirement(line)
            assert requirement.url is None
            assert all(spec.operator == "==" for spec in requirement.specifier)
        return sorted(lines)

    assert dependencies(ROOT / "requirements.txt") == dependencies(
        ROOT / "backend/requirements.txt"
    )
