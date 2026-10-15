"""The demonstration seed exercises every flow with fictional, non-colliding data."""

import pytest
from conftest import PASSWORD, login_user

from app.demo import seed

ROOT = "/api/v1/learning"


def test_seed_demo_populates_empty_base_once(system):
    client, app, _ = system
    accounts = seed(app.state.sessions, PASSWORD)
    assert all(address.endswith(".demo@fatec.sp.gov.br") for address in accounts.values())
    with pytest.raises(ValueError):
        seed(app.state.sessions, PASSWORD)

    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard["courses"] == 2 and dashboard["groups"] == 5 and dashboard["users"] == 10
    assert dashboard["alerts"]["groups_without_teacher"]["items"][0]["label"].startswith(
        "Estatística Aplicada"
    )

    student = login_user(client, accounts["lucas"])
    overview = client.get(ROOT + "/overview", headers=student).json()
    assert len(overview["lessons_today"]) == 1 and overview["pending_count"] >= 1
    summary = client.get(ROOT + "/attendance/summary", headers=student).json()
    marketing = next(g for g in summary["groups"] if g["group_label"].startswith("Marketing"))
    assert marketing["absences"] == 3 and marketing["recorded_lessons"] == 5
    # The scheduled fair stays hidden; the draft visit is never shown to students.
    titles = [
        row["title"]
        for row in client.get(ROOT + "/publications?kind=event", headers=student).json()
    ]
    assert titles == ["Semana de Tecnologia"]

    teacher = login_user(client, accounts["marcelo"])
    home = client.get(ROOT + "/overview", headers=teacher).json()
    assert home["pending_count"] == 1 and home["recorded_today"] == []
    activities = client.get(ROOT + "/publications?kind=activity", headers=teacher).json()
    assert {row["title"] for row in activities} == {
        "Lista 2 — Regressão linear",
        "Modelagem do estudo de caso",
    }
    assert client.get("/api/v1/audit").json()[0]["action"] == "demo_seed"
