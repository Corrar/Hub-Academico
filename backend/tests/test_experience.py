"""Home and calendar use the same authorization scope as individual publications."""

from datetime import timedelta

from test_academic import ROOT, publication, setup

from app.models import Publication, now


def test_overview_pending_drafts_grades_and_archived_groups(system):
    client, app, _ = system
    groups, people = setup(client)
    student, other, teacher = [person[1] for person in people]
    activity = publication(client, groups[0])
    publication(client, groups[0], draft=True)
    publication(client, groups[1])
    publication(client, groups[0], kind="material", due_at=None)
    publication(client, groups[1], kind="material", due_at=None)
    publication(client, groups[0], kind="notice", due_at=None)
    data = client.get(ROOT + "/overview", headers=student).json()
    assert data["groups_count"] == 1
    assert data["pending_count"] == 1
    assert data["material_count"] == 1
    assert [row["id"] for row in data["upcoming"]] == [activity["id"]]
    assert len(data["recent"]) == 1
    path = ROOT + "/activities/" + activity["id"] + "/submission"
    draft = client.put(path, headers=student, json={"body": "Texto", "draft": True}).json()
    assert client.get(ROOT + "/overview", headers=student).json()["pending_count"] == 1
    assert client.get(ROOT + "/overview", headers=teacher).json()["pending_count"] == 0
    sent = client.put(
        path,
        headers=student,
        json={
            "body": "Texto",
            "draft": False,
            "version": draft["version"],
        },
    ).json()
    assert client.get(ROOT + "/overview", headers=student).json()["pending_count"] == 0
    assert client.get(ROOT + "/overview", headers=other).json()["pending_count"] == 1
    assert client.get(ROOT + "/overview", headers=teacher).json()["pending_count"] == 1
    response = client.put(
        ROOT + "/submissions/" + sent["id"] + "/grade",
        headers=teacher,
        json={"grade": 8, "feedback": "Avaliado", "version": sent["version"]},
    )
    assert response.status_code == 200
    assert client.get(ROOT + "/overview", headers=teacher).json()["pending_count"] == 0
    # Revoking the hierarchy also revokes home counters and published content.
    client.patch("/api/v1/groups/" + groups[0]["id"] + "/archive", json={"archived": True})
    data = client.get(ROOT + "/overview", headers=student).json()
    assert data["groups_count"] == data["pending_count"] == data["material_count"] == 0
    assert data["upcoming"] == data["recent"] == []


def test_calendar_scope_month_boundaries_and_filters(system):
    client, app, _ = system
    groups, people = setup(client)
    student, _, teacher = [person[1] for person in people]
    # 02:59 UTC on Oct 1 is still Sep 30 in Brasília; 03:00 belongs to October.
    september = publication(client, groups[0])
    october = publication(client, groups[0])
    hidden = publication(client, groups[1])
    draft = publication(client, groups[0], draft=True)
    archived = publication(client, groups[0])
    from datetime import datetime, timezone

    with app.state.sessions() as db:
        for item in [september, hidden, draft, archived]:
            db.get(Publication, item["id"]).due_at = datetime(
                2026, 10, 1, 2, 59, tzinfo=timezone.utc
            )
        db.get(Publication, october["id"]).due_at = datetime(2026, 10, 1, 3, tzinfo=timezone.utc)
        db.get(Publication, archived["id"]).archived = True
        db.commit()
    for actor in [student, teacher]:
        response = client.get(ROOT + "/calendar?month=2026-09", headers=actor)
        assert response.status_code == 200, response.text
        assert [row["id"] for row in response.json()["publications"]] == [september["id"]]
        assert response.json()["truncated"] is False
    assert [
        row["id"]
        for row in client.get(ROOT + "/calendar?month=2026-10", headers=student).json()[
            "publications"
        ]
    ] == [october["id"]]
    for path in ["/publications?kind=activity&", "/schedule?"]:
        assert client.get(ROOT + path + "group_id=" + groups[1]["id"], headers=student).json() == []
    assert (
        len(
            client.get(
                ROOT + "/publications?kind=activity&group_id=" + groups[0]["id"], headers=student
            ).json()
        )
        == 2
    )
    for month in ["2026-00", "2026-13", "oops", "2026-9"]:
        assert client.get(ROOT + "/calendar?month=" + month).status_code == 422
    for path in ["/overview", "/calendar?month=2026-09"]:
        assert client.get(ROOT + path, headers={"Authorization": ""}).status_code == 401


def test_calendar_includes_multiday_events(system):
    client, _, _ = system
    groups, people = setup(client)
    starts = now() + timedelta(days=3)
    event = publication(
        client,
        groups[0],
        kind="event",
        due_at=None,
        starts_at=starts.isoformat(),
        ends_at=(starts + timedelta(days=2)).isoformat(),
    )
    response = client.get(
        ROOT + "/calendar?month=" + starts.strftime("%Y-%m"), headers=people[0][1]
    )
    assert response.status_code == 200, response.text
    assert [row["id"] for row in response.json()["publications"]] == [event["id"]]
