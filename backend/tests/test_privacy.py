"""LGPD: data subject export and retention of operational data."""

import json
from datetime import timedelta

from conftest import PASSWORD
from sqlalchemy import func, select

from app.demo import seed
from app.models import LoginAttempt, NotificationOutbox, Session, User, now
from app.privacy import purge


def test_export_contains_only_own_data_and_is_audited(system):
    client, app, _ = system
    accounts = seed(app.state.sessions, PASSWORD)
    login = client.post(
        "/api/v1/auth/login", json={"email": accounts["lucas"], "password": PASSWORD}
    )
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    response = client.get("/api/v1/me/export", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith("attachment;")
    data = json.loads(response.content)
    assert data["profile"]["email"] == accounts["lucas"]
    assert "password_hash" not in data["profile"]
    assert {item["activity"] for item in data["submissions"]} == {
        "Fluxo de caixa projetado",
        "Plano de Marketing Digital",
    }
    assert sum(not item["present"] for item in data["attendance"]) == 3
    assert data["event_enrollments"][0]["event"] == "Semana de Tecnologia"
    text = response.text
    for other in ["Ana Ribeiro", "Julia Vasques", "padaria"]:
        assert other not in text
    audit = client.get("/api/v1/audit").json()
    assert audit[0]["action"] == "data_export"
    assert client.get("/api/v1/me/export").status_code == 200  # coordination too


def test_privacy_contact_is_public(system, monkeypatch):
    client, _, _ = system
    client.headers.pop("Authorization")
    info = client.get("/api/v1/privacy").json()
    assert info["contact"] is None and info["notification_retention_days"] == 90


def test_purge_removes_only_expired_operational_data(system):
    client, app, _ = system
    stamp = now()
    with app.state.sessions() as db:
        user = db.scalar(select(User))
        db.add(Session(token_hash="x" * 64, user_id=user.id, expires_at=stamp - timedelta(1)))
        db.add(LoginAttempt(key="k" * 64, attempts=3, window_start=stamp - timedelta(days=2)))
        for index, (status, age) in enumerate(
            [("sent", 120), ("skipped", 120), ("pending", 120), ("sent", 5)]
        ):
            db.add(
                NotificationOutbox(
                    user_id=user.id,
                    category="notice",
                    dedup_key=f"k{index}",
                    deliver_after=stamp,
                    status=status,
                    created_at=stamp - timedelta(days=age),
                )
            )
        db.commit()
        active = db.scalar(select(func.count()).select_from(Session))
        removed = purge(db)
        assert removed["sessions"] == 1 and removed["login_attempts"] == 1
        assert removed["notifications"] == 2
        assert db.scalar(select(func.count()).select_from(Session)) == active - 1
        left = set(db.scalars(select(NotificationOutbox.dedup_key)))
        assert left == {"k2", "k3"}
    # The current session survives.
    assert client.get("/api/v1/me").status_code == 200
