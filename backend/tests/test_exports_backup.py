"""CSV exports for the class diary and PostgreSQL backup with verified restore."""

import csv
import io
import shutil

import pytest
from conftest import PASSWORD, create_user, login_user
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url

from app import pgbackup
from app.academic.exports import cell
from app.demo import seed
from app.models import ClassGroup, Membership, Subject, User

ROOT = "/api/v1/learning"


def rows(response):
    content = response.content.decode("utf-8")
    assert content.startswith("﻿")
    return list(csv.reader(io.StringIO(content[1:]), delimiter=";"))


def test_formula_cells_are_neutralized():
    assert cell("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert cell("+55") == "'+55" and cell("@x") == "'@x" and cell("Ana") == "Ana"


def test_attendance_and_grade_exports(system):
    client, app, _ = system
    accounts = seed(app.state.sessions, PASSWORD)
    with app.state.sessions() as db:
        group_id = db.scalar(select(ClassGroup.id).join(Subject).where(Subject.code == "MKD"))
        other_group = db.scalar(select(ClassGroup.id).join(Subject).where(Subject.code == "BD"))
    sneaky = create_user(client, name="=1+1", email="sneaky@fatec.sp.gov.br")
    with app.state.sessions() as db:
        start, end = db.execute(
            select(Membership.starts_on, Membership.ends_on).where(Membership.group_id == group_id)
        ).first()
    client.put(
        "/api/v1/memberships",
        json={
            "user_id": sneaky["id"],
            "group_id": group_id,
            "starts_on": str(start),
            "ends_on": str(end),
        },
    )
    teacher = login_user(client, accounts["renata"])
    response = client.get(ROOT + f"/groups/{group_id}/export/attendance", headers=teacher)
    assert response.status_code == 200
    assert response.headers["content-disposition"].endswith('frequencia-mkd-noturno-a.csv"')
    table = rows(response)
    assert "diário oficial" in table[1][0]
    header = table[2]
    assert header[:2] == ["Aluno", "E-mail"] and header[-2:] == ["Faltas", "Presença (%)"]
    lucas = next(row for row in table if row[0] == "Lucas Silveira")
    assert lucas.count("F") == 3 and lucas[-2] == "3" and lucas[-1] == "40,0"
    assert any(row[0] == "'=1+1" for row in table)

    grades = rows(client.get(ROOT + f"/groups/{group_id}/export/grades", headers=teacher))
    assert grades[2][-1] == "Média do hub"
    julia = next(row for row in grades if row[0] == "Julia Vasques")
    assert julia[2] == "aguardando"
    assert next(row for row in grades if row[0] == "Mariana Farias")[2] == "sem entrega"

    audit = client.get("/api/v1/audit").json()
    assert [row["action"] for row in audit[:2]] == ["grades_export", "attendance_export"]
    # Scope: another teacher's class and students are refused.
    assert (
        client.get(ROOT + f"/groups/{other_group}/export/grades", headers=teacher).status_code
        == 404
    )
    student = login_user(client, accounts["lucas"])
    assert (
        client.get(ROOT + f"/groups/{group_id}/export/attendance", headers=student).status_code
        == 403
    )


def test_pg_backup_and_verified_restore(system, tmp_path):
    client, app, url = system
    if app.state.engine.dialect.name != "postgresql" or not shutil.which("pg_dump"):
        pytest.skip("Requer PostgreSQL e cliente pg_dump")
    seed(app.state.sessions, PASSWORD)
    target = make_url(url).set(database=make_url(url).database + "_restore_check")
    admin = create_engine(url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{target.database}"'))
        connection.execute(text(f'CREATE DATABASE "{target.database}"'))
    admin.dispose()
    target_url = target.render_as_string(hide_password=False)
    try:
        dump = pgbackup.backup(url, tmp_path / "hub.dump")
    except ValueError as error:
        if "mais antigo" in str(error):
            pytest.skip(str(error))
        raise
    assert oct(dump.stat().st_mode)[-3:] == "600"
    with pytest.raises(FileExistsError):
        pgbackup.backup(url, dump)
    with pytest.raises(ValueError):
        pgbackup.restore_check(dump, url, url)
    result = pgbackup.restore_check(dump, target_url, url)
    with app.state.sessions() as db:
        assert result["counts"]["users"] == db.scalar(select(text("count(*)")).select_from(User))
    assert result["counts"]["attendance_records"] > 0
    with pytest.raises(ValueError):
        pgbackup.restore_check(dump, target_url, url)  # target no longer empty
