from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_upgrade_preserves_records_and_invalidates_old_sessions(tmp_path):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    url = "sqlite:///" + str(tmp_path / "migration.db")
    config.attributes["database_url"] = url
    command.upgrade(config, "0001")
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO users (id,name,email,role,password_hash,archived) VALUES ('u','Teste','teste@fatec.sp.gov.br','coordinator','unused',0)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO courses (id,code,name,archived) VALUES ('c','T','Curso preservado',0)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ('old','u','2099-01-01')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO audit_logs (id,actor_id,action,entity,entity_id,occurred_at,changes) VALUES ('a','u','create','courses','c','2026-01-01','{}')"
                )
            )
        command.upgrade(config, "head")
        command.check(config)
        with engine.connect() as conn:
            assert conn.execute(text("SELECT name FROM courses")).scalar() == "Curso preservado"
            assert conn.execute(text("SELECT count(*) FROM users")).scalar() == 1
            assert conn.execute(text("SELECT count(*) FROM audit_logs")).scalar() == 1
            assert conn.execute(text("SELECT count(*) FROM sessions")).scalar() == 0
            assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0003"
    finally:
        engine.dispose()
