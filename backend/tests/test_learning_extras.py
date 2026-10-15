"""Scheduled publications, delivery tracking, typed attachments and reminders."""

import io
import zipfile
from datetime import timedelta

from conftest import create_user, login_user
from test_academic import ROOT, publication, setup
from test_api import dates

from app.models import Publication, Submission, now


def iso(delta):
    return (now() + delta).isoformat()


def test_scheduled_and_expiring_publications_follow_server_clock(system):
    client, app, _ = system
    groups, people = setup(client)
    student, teacher = people[0][1], people[2][1]
    later = publication(client, groups[0], publish_at=iso(timedelta(days=1)))
    assert later["state"] == "scheduled"
    assert client.get(ROOT + "/publications?kind=activity", headers=student).json() == []
    assert (
        client.put(
            ROOT + "/activities/" + later["id"] + "/submission",
            headers=student,
            json={"body": "Cedo demais"},
        ).status_code
        == 403
    )
    staff = client.get(ROOT + "/publications?kind=activity", headers=teacher).json()
    assert staff[0]["state"] == "scheduled"

    notice = dict(
        kind="notice",
        title="Aviso temporário",
        body="Sai do ar logo",
        audience="institution",
        draft=False,
        expires_at=iso(timedelta(hours=1)),
    )
    created = client.post(ROOT + "/publications", json=notice)
    assert created.status_code == 201 and created.json()["state"] == "published"
    assert len(client.get(ROOT + "/publications?kind=notice", headers=student).json()) == 1
    bad = {**notice, "kind": "material", "audience": "group", "group_id": groups[0]["id"]}
    assert client.post(ROOT + "/publications", json=bad).status_code == 422
    inverted = {**notice, "publish_at": iso(timedelta(hours=2))}
    assert client.post(ROOT + "/publications", json=inverted).status_code == 422

    with app.state.sessions() as db:
        db.get(Publication, later["id"]).publish_at = now() - timedelta(minutes=1)
        db.get(Publication, created.json()["id"]).expires_at = now() - timedelta(minutes=1)
        db.commit()
    visible = client.get(ROOT + "/publications?kind=activity", headers=student).json()
    assert [row["id"] for row in visible] == [later["id"]]
    assert client.get(ROOT + "/publications?kind=notice", headers=student).json() == []
    assert (
        client.get(
            ROOT + "/publication/" + created.json()["id"] + "/attachments", headers=student
        ).status_code
        == 403
    )
    # A visible publication cannot silently return to the schedule.
    body = {
        key: later[key]
        for key in ["kind", "title", "body", "audience", "group_id", "draft", "due_at"]
    }
    body.update(version=later["version"], publish_at=iso(timedelta(days=1)))
    assert (
        client.put(ROOT + "/publications/" + later["id"], json=body, headers=teacher).status_code
        == 409
    )


def test_reach_is_shown_before_publishing(system):
    client, _, _ = system
    groups, people = setup(client)
    teacher = people[2][1]
    group = client.get(
        ROOT + "/reach?audience=group&group_id=" + groups[0]["id"], headers=teacher
    ).json()
    assert group == {"students": 2, "teachers": 1, "coordinators": 0, "total": 3}
    assert client.get(ROOT + "/reach?audience=institution", headers=teacher).status_code == 403
    assert client.get(ROOT + "/reach?audience=institution").json()["total"] == 4
    assert client.get(ROOT + "/reach?audience=group", headers=people[0][1]).status_code == 403
    assert (
        client.get(
            ROOT + "/reach?audience=group&group_id=" + groups[1]["id"], headers=teacher
        ).status_code
        == 404
    )


def test_delivery_status_summary_and_grading_queue(system):
    client, app, _ = system
    groups, people = setup(client)
    (first, first_h), (second, second_h), (_, teacher) = people
    activity = publication(client, groups[0])
    path = ROOT + "/activities/" + activity["id"]
    mine = client.get(ROOT + "/publications?kind=activity", headers=first_h).json()[0]
    assert mine["my_submission"] is None
    draft = client.put(path + "/submission", headers=first_h, json={"body": "Rascunho"})
    assert (
        client.get(ROOT + "/publications?kind=activity", headers=first_h).json()[0][
            "my_submission"
        ]["state"]
        == "draft"
    )
    client.put(
        path + "/submission", headers=first_h, json={"body": "Final", "draft": False, "version": 1}
    )
    listed = client.get(ROOT + "/publications?kind=activity", headers=teacher).json()[0]
    assert (listed["students_count"], listed["submitted_count"], listed["graded_count"]) == (
        2,
        1,
        0,
    )

    summary = client.get(path + "/summary", headers=teacher).json()
    assert summary["missing"] == [{"id": second["id"], "name": second["name"]}]
    assert summary["pending_count"] == 1 and summary["closed"] is False
    assert client.get(path + "/summary", headers=first_h).status_code == 403

    queue = client.get(path + "/submissions?pending=true", headers=teacher).json()
    assert [row["student_name"] for row in queue] == [first["name"]] and not queue[0]["late"]
    graded = client.put(
        ROOT + "/submissions/" + draft.json()["id"] + "/grade",
        headers=teacher,
        json={"grade": 9.5, "feedback": "Muito bom", "version": queue[0]["version"]},
    )
    assert graded.status_code == 200 and graded.json()["graded_at"]
    assert client.get(path + "/submissions?pending=true", headers=teacher).json() == []
    state = client.get(ROOT + "/publications?kind=activity", headers=first_h).json()[0]
    assert state["my_submission"]["state"] == "graded" and state["my_submission"]["grade"] == 9.5
    # Reopening clears the grading timestamp.
    with app.state.sessions() as db:
        version = db.get(Submission, draft.json()["id"]).version
    reopened = client.put(
        ROOT + "/submissions/" + draft.json()["id"] + "/grade",
        headers=teacher,
        json={"grade": None, "feedback": "Refaça a questão 2", "version": version},
    )
    assert reopened.json()["graded_at"] is None


def test_event_enrollment_list_for_organizers(system):
    client, _, _ = system
    groups, people = setup(client)
    event = publication(
        client,
        groups[0],
        kind="event",
        due_at=None,
        starts_at=iso(timedelta(days=3)),
        ends_at=iso(timedelta(days=4)),
    )
    path = ROOT + "/events/" + event["id"]
    client.put(path + "/enrollment", headers=people[0][1], json={"archived": False})
    listed = client.get(path + "/enrollments", headers=people[2][1]).json()
    assert [row["name"] for row in listed] == [people[0][0]["name"]]
    assert client.get(path + "/enrollments", headers=people[1][1]).status_code == 403


def docx_bytes(macro=False):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document/>")
        if macro:
            archive.writestr("word/vbaProject.bin", b"\x00")
    return buffer.getvalue()


def test_typed_attachments_are_verified_and_downloaded_safely(system):
    client, _, _ = system
    groups, people = setup(client)
    teacher = people[2][1]
    material = publication(client, groups[0], kind="material", due_at=None)
    path = ROOT + "/publication/" + material["id"] + "/attachments"

    def upload(name, content, kind="application/octet-stream"):
        return client.post(
            path,
            headers={**teacher, "Content-Type": kind, "X-File-Name": name},
            content=content,
        )

    pdf = upload("Rubrica%20de%20avalia%C3%A7%C3%A3o.pdf", b"%PDF-1.7\n...", "application/pdf")
    assert pdf.status_code == 201, pdf.text
    assert pdf.json()["name"] == "Rubrica de avaliação.pdf"
    assert pdf.json()["media_type"] == "application/pdf"
    assert upload("foto.png", b"\x89PNG\r\n\x1a\n" + b"0" * 10).status_code == 201
    assert upload("slides.docx", docx_bytes()).status_code == 201
    assert upload("macro.docx", docx_bytes(macro=True)).status_code == 415
    assert upload("falso.pdf", b"<html>").status_code == 415
    assert upload("script.exe", b"MZ").status_code == 415
    assert upload("pagina.txt", b"<b>oi</b>", "text/html").status_code == 415
    assert upload("dados.ipynb", b"{not json").status_code == 415
    big = b"%PDF-" + b"0" * (4 * 1024 * 1024)
    assert upload("grande.pdf", big).status_code == 413

    rows = client.get(path, headers=people[0][1]).json()
    assert {row["media_type"] for row in rows} >= {"application/pdf", "image/png"}
    download = client.get(ROOT + "/attachments/" + pdf.json()["id"], headers=people[0][1])
    assert download.headers["content-type"] == "application/pdf"
    disposition = download.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="Rubrica de avaliacao.pdf"')
    assert "filename*=UTF-8''Rubrica%20de%20avalia%C3%A7%C3%A3o.pdf" in disposition
    assert download.headers["content-security-policy"].startswith("sandbox")
    limits = client.get(ROOT + "/attachment-types", headers=people[0][1]).json()
    assert "pdf" in limits["extensions"] and limits["max_bytes"] == 4 * 1024 * 1024


def test_reminders_feed_unread_count_and_grades(system):
    client, _, _ = system
    groups, people = setup(client)
    (_, student), (_, other), (_, teacher) = people
    activity = publication(client, groups[0], title="Lista 3")
    client.post(
        ROOT + "/publications",
        json=dict(kind="notice", title="Prova", body="Sexta", audience="institution", draft=False),
    )
    publication(client, groups[0], draft=True, title="Rascunho invisível")
    feed = client.get(ROOT + "/notifications", headers=student).json()
    assert [item["title"] for item in feed["items"]] == ["Prova", "Lista 3"]
    assert feed["unread"] == 2 and all(item["unread"] for item in feed["items"])
    assert client.post(ROOT + "/notifications/read", headers=student).status_code == 204
    feed = client.get(ROOT + "/notifications", headers=student).json()
    assert feed["unread"] == 0 and not any(item["unread"] for item in feed["items"])
    # The author (coordination, in this setup) is not notified about its own publications.
    assert client.get(ROOT + "/notifications").json()["items"] == []
    assert len(client.get(ROOT + "/notifications", headers=teacher).json()["items"]) == 2

    submission = client.put(
        ROOT + "/activities/" + activity["id"] + "/submission",
        headers=student,
        json={"body": "Resposta", "draft": False},
    ).json()
    client.put(
        ROOT + "/submissions/" + submission["id"] + "/grade",
        headers=teacher,
        json={"grade": 8, "feedback": "Bom", "version": submission["version"]},
    )
    feed = client.get(ROOT + "/notifications", headers=student).json()
    assert feed["unread"] == 1 and feed["items"][0]["type"] == "grade"
    assert feed["items"][0]["grade"] == 8
    assert all(
        item["type"] != "grade"
        for item in client.get(ROOT + "/notifications", headers=other).json()["items"]
    )
    # A student outside the class never sees its reminders.
    outsider = create_user(client, name="Fora", email="fora@fatec.sp.gov.br")
    client.put(
        "/api/v1/memberships",
        json={"user_id": outsider["id"], "group_id": groups[1]["id"], **dates()},
    )
    items = client.get(
        ROOT + "/notifications", headers=login_user(client, outsider["email"])
    ).json()
    assert [item["title"] for item in items["items"]] == ["Prova"]


def test_offsets_are_normalized_to_utc(system):
    client, _, _ = system
    groups, people = setup(client)
    created = publication(client, groups[0], due_at="2026-12-10T23:59:00-03:00")
    assert created["due_at"].startswith("2026-12-11T02:59:00")
    listed = client.get(ROOT + "/publications?kind=activity", headers=people[0][1]).json()
    assert listed[0]["due_at"].startswith("2026-12-11T02:59:00")


def test_activity_filters_and_event_counts_for_listing(system):
    client, _, _ = system
    groups, people = setup(client)
    student = people[0][1]
    first = publication(client, groups[0], title="Aberta")
    publication(client, groups[0], title="Outra aberta")
    client.put(
        ROOT + "/activities/" + first["id"] + "/submission",
        headers=student,
        json={"body": "Feito", "draft": False},
    )
    titles = lambda status: [  # noqa: E731
        row["title"]
        for row in client.get(
            ROOT + "/publications?kind=activity&status=" + status, headers=student
        ).json()
    ]
    assert titles("todo") == ["Outra aberta"] and titles("done") == ["Aberta"]
    event = publication(
        client,
        groups[0],
        kind="event",
        due_at=None,
        starts_at=iso(timedelta(days=3)),
        ends_at=iso(timedelta(days=4)),
        capacity=5,
    )
    client.put(
        ROOT + "/events/" + event["id"] + "/enrollment", headers=student, json={"archived": False}
    )
    mine = client.get(ROOT + "/publications?kind=event", headers=student).json()[0]
    other = client.get(ROOT + "/publications?kind=event", headers=people[1][1]).json()[0]
    assert (mine["enrolled_count"], mine["enrolled"], other["enrolled"]) == (1, True, False)


def test_memberships_listing_is_readable_and_searchable(system):
    client, _, _ = system
    groups, people = setup(client)
    rows = client.get("/api/v1/memberships").json()
    assert {row["user_role"] for row in rows} == {"student", "teacher"}
    assert rows[0]["user_role"] == "teacher"  # teacher listed first in each class
    assert rows[0]["group_label"].startswith("Banco de Dados · A")
    found = client.get("/api/v1/memberships?q=pessoa 1").json()
    assert [row["user_name"] for row in found] == ["Pessoa 1"]
