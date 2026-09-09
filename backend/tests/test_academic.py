"""Regression tests for academic workflows and authorization (no remote pentest)."""

from datetime import timedelta

from conftest import catalog, create_user, login_user
from test_api import dates

from app.models import Publication, now

ROOT = "/api/v1/learning"


def setup(client):
    _, _, groups = catalog(client)
    identities = []
    for index, role in enumerate(["student", "student", "teacher"]):
        user = create_user(
            client, role=role, name=f"Pessoa {index}", email=f"p{index}@fatec.sp.gov.br"
        )
        client.put(
            "/api/v1/memberships",
            json={"user_id": user["id"], "group_id": groups[0]["id"], **dates()},
        )
        identities.append((user, login_user(client, user["email"])))
    return groups, identities


def publication(client, group, **changes):
    data = dict(
        kind="activity",
        title="Atividade",
        body="Enunciado",
        audience="group",
        group_id=group["id"],
        draft=False,
        due_at=(now() + timedelta(days=2)).isoformat(),
    )
    data.update(changes)
    response = client.post(ROOT + "/publications", json=data)
    assert response.status_code == 201, response.text
    return response.json()


def test_drafts_target_roles_and_archived_hierarchy(system):
    client, _, _ = system
    groups, people = setup(client)
    student, teacher = people[0][1], people[2][1]
    draft = publication(client, groups[0], draft=True)
    other = publication(client, groups[1])
    assert client.get(ROOT + "/publications?kind=activity", headers=student).json() == []
    assert (
        client.get(ROOT + f"/publication/{draft['id']}/attachments", headers=student).status_code
        == 403
    )
    assert (
        client.get(ROOT + f"/activities/{other['id']}/submissions", headers=teacher).status_code
        == 404
    )
    body = dict(kind="notice", title="Aviso", body="Texto", audience="institution", draft=False)
    assert client.post(ROOT + "/publications", json=body, headers=teacher).status_code == 403
    assert client.post(ROOT + "/publications", json=body, headers=student).status_code == 403
    assert client.post(ROOT + "/publications", json=body).status_code == 201
    assert len(client.get(ROOT + "/publications?kind=notice", headers=student).json()) == 1
    body.update(audience="group", group_id=groups[1]["id"])
    assert client.post(ROOT + "/publications", json=body, headers=teacher).status_code == 404
    client.patch("/api/v1/groups/" + groups[0]["id"] + "/archive", json={"archived": True})
    assert client.get(ROOT + "/publications?kind=activity", headers=teacher).json() == []


def test_submission_privacy_grading_versions_and_deadline(system):
    client, app, _ = system
    groups, people = setup(client)
    student, other, teacher = [person[1] for person in people]
    activity = publication(client, groups[0])
    path = ROOT + "/activities/" + activity["id"]
    result = client.put(
        path + "/submission", headers=student, json={"body": "Minha resposta", "draft": True}
    )
    assert result.status_code == 200, result.text
    submission = result.json()
    assert client.get(path + "/submissions", headers=other).json() == []
    assert client.get(path + "/submissions", headers=teacher).json() == []
    assert (
        client.put(
            path + "/submission", headers=student, json={"body": "Conflito", "version": 0}
        ).status_code
        == 409
    )
    submitted = client.put(
        path + "/submission", headers=student, json={"body": "Final", "draft": False, "version": 1}
    ).json()
    grading = ROOT + "/submissions/" + submission["id"] + "/grade"
    payload = {"grade": 8, "feedback": "Bom trabalho", "version": submitted["version"]}
    assert client.put(grading, headers=student, json=payload).status_code == 403
    assert client.put(grading, headers=teacher, json=payload).status_code == 200
    assert client.put(grading, headers=teacher, json=payload).status_code == 409
    average = client.get(ROOT + "/averages", headers=student).json()[0]
    assert average["count"] == 1 and average["average"] == 8
    assert client.get(ROOT + "/averages", headers=other).json() == []
    assert (
        client.put(
            path + "/submission", headers=student, json={"body": "Alteração", "version": 3}
        ).status_code
        == 409
    )
    assert (
        client.put(
            grading, headers=teacher, json={"grade": None, "feedback": "Reaberta", "version": 3}
        ).status_code
        == 200
    )
    with app.state.sessions() as db:
        db.get(Publication, activity["id"]).due_at = now() - timedelta(seconds=1)
        db.commit()
    assert (
        client.put(
            path + "/submission", headers=student, json={"body": "Atrasada", "version": 4}
        ).status_code
        == 409
    )


def test_private_files_validation_and_audit(system):
    client, _, _ = system
    groups, people = setup(client)
    student, other, teacher = [person[1] for person in people]
    activity = publication(client, groups[0])
    submission = client.put(
        ROOT + "/activities/" + activity["id"] + "/submission",
        headers=student,
        json={"body": "Rascunho"},
    ).json()
    path = ROOT + "/submission/" + submission["id"] + "/attachments"
    headers = {**student, "Content-Type": "text/plain", "X-File-Name": "resposta.txt"}
    secret = "CONTEUDO-PRIVADO-DO-ARQUIVO"
    upload = client.post(path, headers=headers, content=secret)
    assert upload.status_code == 201, upload.text
    key = upload.json()["id"]
    assert client.get(ROOT + "/attachments/" + key, headers=other).status_code == 404
    assert client.get(ROOT + "/attachments/" + key, headers=teacher).status_code == 403
    response = client.get(ROOT + "/attachments/" + key, headers=student)
    assert response.text == secret and response.headers["content-disposition"].startswith(
        "attachment;"
    )
    assert response.headers["x-content-type-options"] == "nosniff"
    assert secret not in client.get("/api/v1/audit").text
    assert (
        client.post(path, headers={**headers, "X-File-Name": "../x.txt"}, content="x").status_code
        == 422
    )
    assert client.post(path, headers=headers, content=b"\xff").status_code == 415
    assert (
        client.post(
            path, headers={**headers, "Content-Type": "text/html"}, content="<script>"
        ).status_code
        == 415
    )
    assert client.post(path, headers=headers, content=b"x" * (512 * 1024 + 1)).status_code == 413
    client.put(
        ROOT + "/activities/" + activity["id"] + "/submission",
        headers=student,
        json={"body": "Final", "draft": False, "version": 1},
    )
    assert client.post(path, headers=headers, content="x").status_code == 409
    assert client.get(ROOT + "/attachments/" + key, headers=teacher).status_code == 200
    client.patch(ROOT + "/publications/" + activity["id"] + "/archive", json={"archived": True})
    assert client.get(ROOT + "/attachments/" + key, headers=student).status_code == 404


def test_event_capacity_cancel_and_publish_version(system):
    client, _, _ = system
    groups, people = setup(client)
    event = publication(
        client,
        groups[0],
        kind="event",
        due_at=None,
        starts_at=(now() + timedelta(days=3)).isoformat(),
        ends_at=(now() + timedelta(days=4)).isoformat(),
        capacity=1,
    )
    path = ROOT + "/events/" + event["id"] + "/enrollment"
    assert client.put(path, headers=people[0][1], json={"archived": False}).status_code == 200
    assert client.put(path, headers=people[1][1], json={"archived": False}).status_code == 409
    assert client.put(path, headers=people[0][1], json={"archived": True}).status_code == 200
    assert client.put(path, headers=people[1][1], json={"archived": False}).status_code == 200
    assert client.get(path, headers=people[1][1]).json()["count"] == 1
    body = {
        key: event[key]
        for key in [
            "kind",
            "title",
            "body",
            "audience",
            "group_id",
            "draft",
            "due_at",
            "starts_at",
            "ends_at",
            "capacity",
            "version",
        ]
    }
    assert (
        client.put(ROOT + "/publications/" + event["id"], json={**body, "version": 0}).status_code
        == 409
    )
    assert (
        client.put(ROOT + "/publications/" + event["id"], json={**body, "draft": True}).status_code
        == 409
    )
    assert (
        client.put(
            ROOT + "/publications/" + event["id"], json={**body, "title": "Novo título"}
        ).status_code
        == 200
    )


def test_schedule_conflicts_archive_restore_and_scope(system):
    client, _, _ = system
    groups, people = setup(client)
    body = dict(
        group_id=groups[0]["id"],
        weekday=0,
        starts_minute=1140,
        ends_minute=1200,
        room="Sala A",
        **dates(),
    )
    first = client.post(ROOT + "/schedule", json=body)
    assert first.status_code == 201, first.text
    assert client.post(ROOT + "/schedule", headers=people[2][1], json=body).status_code == 403
    assert (
        client.post(
            ROOT + "/schedule", json={**body, "group_id": groups[1]["id"], "room": "sala a"}
        ).status_code
        == 409
    )
    path = ROOT + "/schedule/" + first.json()["id"] + "/archive"
    assert client.patch(path, json={"archived": True}).status_code == 200
    assert client.get(ROOT + "/schedule", headers=people[0][1]).json() == []
    assert (
        client.post(ROOT + "/schedule", json={**body, "group_id": groups[1]["id"]}).status_code
        == 201
    )
    assert client.patch(path, json={"archived": False}).status_code == 409
    assert client.get(ROOT + "/schedule", headers=people[0][1]).json() == []


def test_teacher_schedule_respects_membership_dates(system):
    client, _, _ = system
    groups, people = setup(client)
    teacher = people[2][0]
    first = dict(
        group_id=groups[0]["id"],
        weekday=0,
        starts_minute=1140,
        ends_minute=1200,
        room="Sala A",
        **dates(),
    )
    assert client.post(ROOT + "/schedule", json=first).status_code == 201
    member = {"user_id": teacher["id"], "group_id": groups[1]["id"], **dates(-60, -30)}
    assert client.put("/api/v1/memberships", json=member).status_code == 200
    second = client.post(
        ROOT + "/schedule", json={**first, "group_id": groups[1]["id"], "room": "Sala B"}
    )
    assert second.status_code == 201, second.text
    assert (
        client.patch(
            ROOT + "/schedule/" + second.json()["id"] + "/archive", json={"archived": True}
        ).status_code
        == 200
    )
    assert client.put("/api/v1/memberships", json={**member, **dates()}).status_code == 200
    assert (
        client.patch(
            ROOT + "/schedule/" + second.json()["id"] + "/archive", json={"archived": False}
        ).status_code
        == 409
    )


def test_concurrent_event_last_seat_postgres(system):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    import pytest
    from fastapi.testclient import TestClient

    client, app, _ = system
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("Row-level concurrency is enforced on the staging PostgreSQL database")
    groups, people = setup(client)
    event = publication(
        client,
        groups[0],
        kind="event",
        due_at=None,
        capacity=1,
        starts_at=(now() + timedelta(days=2)).isoformat(),
        ends_at=(now() + timedelta(days=3)).isoformat(),
    )
    barrier = Barrier(2)

    def enroll(headers):
        with TestClient(app) as isolated:
            barrier.wait(timeout=10)
            return isolated.put(
                ROOT + "/events/" + event["id"] + "/enrollment",
                headers=headers,
                json={"archived": False},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(enroll, [people[0][1], people[1][1]]))
    assert sorted(results) == [200, 409]
    assert client.get(ROOT + "/events/" + event["id"] + "/enrollment").json()["count"] == 1


def test_membership_batch_preview_atomicity_and_permissions(system):
    client, _, _ = system
    groups, people = setup(client)
    rows = [
        {"email": person[0]["email"], "group_id": groups[1]["id"], **dates()}
        for person in people[:2]
    ]
    original = client.get("/api/v1/memberships").json()
    audit_before = client.get("/api/v1/audit").json()
    preview = client.post("/api/v1/memberships/batch", json={"rows": rows})
    assert preview.status_code == 200, preview.text
    assert not preview.json()["applied"] and not preview.json()["errors"]
    assert client.get("/api/v1/memberships").json() == original
    assert client.get("/api/v1/audit").json() == audit_before
    invalid = [{**rows[0], "email": "ausente@fatec.sp.gov.br"}, rows[1]]
    assert client.post("/api/v1/memberships/batch", json={"rows": invalid, "confirm": True}).json()[
        "errors"
    ]
    assert client.get("/api/v1/memberships").json() == original
    assert (
        client.post(
            "/api/v1/memberships/batch", headers=people[0][1], json={"rows": rows, "confirm": True}
        ).status_code
        == 403
    )
    applied = client.post("/api/v1/memberships/batch", json={"rows": rows, "confirm": True})
    assert applied.json()["applied"], applied.text
    assert len(client.get("/api/v1/memberships").json()) == len(original) + 2
    assert client.post("/api/v1/memberships/batch", json={"rows": rows, "confirm": True}).json()[
        "applied"
    ]
    assert len(client.get("/api/v1/memberships").json()) == len(original) + 2
