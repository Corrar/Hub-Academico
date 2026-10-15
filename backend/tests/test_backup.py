import os
import sqlite3

import pytest
from conftest import catalog

from app.cli import backup, restore_check


def test_restore_backup_preserves_records_and_audit(system, tmp_path, monkeypatch):
    client, _, url = system
    if not url.startswith("sqlite"):
        pytest.skip("Backup local é exclusivo do SQLite")
    course, _, _ = catalog(client)
    monkeypatch.setenv("DATABASE_URL", url)
    target, restored = tmp_path / "backup.db", tmp_path / "restored.db"
    backup(target)
    assert os.stat(target).st_mode & 0o777 == 0o600
    assert restore_check(target, restored) == 1
    with sqlite3.connect(restored) as db:
        assert db.execute("SELECT name FROM courses WHERE id=?", (course["id"],)).fetchone() == (
            "Ciência de Dados",
        )
        assert db.execute("SELECT count(*) FROM audit_logs").fetchone()[0] == 4
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("DELETE FROM audit_logs")
    with pytest.raises(FileExistsError):
        backup(target)
