"""Roll call, corrections and the attendance summary shown to students."""

import json
from datetime import timedelta

from conftest import catalog, create_user, login_user
from test_api import dates

from app.academic.clock import local_today, occurrences

ROOT = "/api/v1/learning"


def setup(client, start=-28):
    _, _, groups = catalog(client)
    people = {}
    for key, role in [
        ("ana", "student"),
        ("bia", "student"),
        ("caio", "student"),
        ("prof", "teacher"),
    ]:
        user = create_user(client, role=role, name=key.title(), email=f"{key}@fatec.sp.gov.br")
        response = client.put(
            "/api/v1/memberships",
            json={"user_id": user["id"], "group_id": groups[0]["id"], **dates(start, 60)},
        )
        assert response.status_code == 200, response.text
        people[key] = (user, login_user(client, user["email"]))
    today = local_today()
    schedule = client.post(
        ROOT + "/schedule",
        json={
            "group_id": groups[0]["id"],
            "weekday": today.weekday(),
            "starts_minute": 19 * 60,
            "ends_minute": 20 * 60 + 40,
            "starts_on": str(today + timedelta(days=start)),
            "ends_on": str(today + timedelta(days=60)),
            "room": "Lab 03",
        },
    )
    assert schedule.status_code == 201, schedule.text
    return groups, people, schedule.json()


def test_occurrences_counts_inclusive_weekdays():
    today = local_today()
    assert occurrences(today, today, today.weekday()) == 1
    assert occurrences(today, today + timedelta(days=6), today.weekday()) == 1
    assert occurrences(today, today + timedelta(days=7), today.weekday()) == 2
    assert occurrences(today + timedelta(days=1), today, today.weekday()) == 0


def test_roll_call_correction_audit_and_student_summary(system):
    client, _, _ = system
    groups, people, schedule = setup(client)
    teacher = people["prof"][1]
    today = str(local_today())
    query = f"?schedule_id={schedule['id']}&lesson_date={today}"

    sheet = client.get(ROOT + "/attendance/sheet" + query, headers=teacher)
    assert sheet.status_code == 200, sheet.text
    data = sheet.json()
    assert data["lesson"] is None
    assert [item["name"] for item in data["students"]] == ["Ana", "Bia", "Caio"]
    assert all(item["present"] is None for item in data["students"])

    ana, bia = people["ana"][0]["id"], people["bia"][0]["id"]
    body = {
        "schedule_id": schedule["id"],
        "lesson_date": today,
        "topic": "Normalização",
        "absent_ids": [ana],
        "version": 0,
    }
    saved = client.put(ROOT + "/attendance/sheet", headers=teacher, json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["absent_count"] == 1 and saved.json()["present_count"] == 2
    # Stale version, duplicate create and absent outsiders are refused.
    assert client.put(ROOT + "/attendance/sheet", headers=teacher, json=body).status_code == 409
    outsider = create_user(client, name="Fora", email="fora@fatec.sp.gov.br")
    body.update(version=1, absent_ids=[outsider["id"]])
    assert client.put(ROOT + "/attendance/sheet", headers=teacher, json=body).status_code == 422

    body.update(absent_ids=[bia], topic="Correção: Normalização")
    corrected = client.put(ROOT + "/attendance/sheet", headers=teacher, json=body)
    assert corrected.status_code == 200 and corrected.json()["version"] == 2
    audit = [
        row for row in client.get("/api/v1/audit").json() if row["entity"] == "attendance_lessons"
    ]
    assert [row["action"] for row in audit] == ["attendance_corrected", "attendance_recorded"]
    changes = json.loads(audit[0]["changes"])
    assert changes["before"]["absent_ids"] == [ana] and changes["after"]["absent_ids"] == [bia]

    summary = client.get(ROOT + "/attendance/summary", headers=people["bia"][1]).json()
    item = summary["groups"][0]
    assert summary["limit_percent"] == 25 and "diário oficial" in summary["notice"]
    assert item["recorded_lessons"] == 1 and item["absences"] == 1
    assert item["attendance_percent"] == 0.0
    assert item["planned_lessons"] == occurrences(
        local_today() - timedelta(days=28),
        local_today() + timedelta(days=60),
        local_today().weekday(),
    )
    assert item["allowed_absences"] == item["planned_lessons"] * 25 // 100
    assert item["missed"] == [{"lesson_date": today, "topic": "Correção: Normalização"}]
    ana_summary = client.get(ROOT + "/attendance/summary", headers=people["ana"][1]).json()
    assert ana_summary["groups"][0]["absences"] == 0
    assert ana_summary["groups"][0]["attendance_percent"] == 100.0

    roster = client.get(ROOT + f"/groups/{groups[0]['id']}/students", headers=teacher).json()
    assert {row["name"]: row["absences"] for row in roster["students"]} == {
        "Ana": 0,
        "Bia": 1,
        "Caio": 0,
    }
    lessons = client.get(ROOT + "/attendance/lessons", headers=teacher).json()
    assert len(lessons) == 1 and lessons[0]["absent_count"] == 1

    # Archived roll calls stop counting and cannot be corrected until restored.
    path = ROOT + f"/attendance/lessons/{lessons[0]['id']}/archive"
    assert client.patch(path, headers=teacher, json={"archived": True}).status_code == 200
    summary = client.get(ROOT + "/attendance/summary", headers=people["bia"][1]).json()
    assert summary["groups"][0]["recorded_lessons"] == 0
    assert summary["groups"][0]["state"] == "no_data"
    body.update(version=3)
    assert client.put(ROOT + "/attendance/sheet", headers=teacher, json=body).status_code == 409


def test_roll_call_scope_and_calendar_rules(system):
    client, _, _ = system
    groups, people, schedule = setup(client)
    student, teacher = people["ana"][1], people["prof"][1]
    today = local_today()
    query = f"?schedule_id={schedule['id']}&lesson_date="
    assert (
        client.get(ROOT + "/attendance/sheet" + query + str(today), headers=student).status_code
        == 403
    )
    tomorrow = today + timedelta(days=7)
    assert (
        client.get(ROOT + "/attendance/sheet" + query + str(tomorrow), headers=teacher).status_code
        == 422
    )
    wrong_day = today - timedelta(days=1)
    assert (
        client.get(ROOT + "/attendance/sheet" + query + str(wrong_day), headers=teacher).status_code
        == 422
    )
    # A teacher from another class cannot read or record this roll call.
    other = create_user(client, role="teacher", name="Outro", email="outro@fatec.sp.gov.br")
    client.put(
        "/api/v1/memberships",
        json={"user_id": other["id"], "group_id": groups[1]["id"], **dates()},
    )
    other_headers = login_user(client, other["email"])
    assert (
        client.get(
            ROOT + "/attendance/sheet" + query + str(today), headers=other_headers
        ).status_code
        == 404
    )
    assert client.get(ROOT + "/attendance/lessons", headers=student).status_code == 403
    # Students only see their own summary; staff must name the student.
    ana = people["ana"][0]["id"]
    assert (
        client.get(
            ROOT + f"/attendance/summary?student_id={people['bia'][0]['id']}", headers=student
        ).status_code
        == 403
    )
    assert client.get(ROOT + "/attendance/summary", headers=teacher).status_code == 422
    by_teacher = client.get(ROOT + f"/attendance/summary?student_id={ana}", headers=teacher)
    assert by_teacher.status_code == 200 and by_teacher.json()["student"]["id"] == ana
    by_other = client.get(ROOT + f"/attendance/summary?student_id={ana}", headers=other_headers)
    assert by_other.status_code == 404
    assert (
        client.get(ROOT + f"/groups/{groups[0]['id']}/students", headers=other_headers).status_code
        == 404
    )
