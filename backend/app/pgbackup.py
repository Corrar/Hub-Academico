"""PostgreSQL backup and verified restore with the official client tools.

Credentials travel through libpq environment variables, never the command line.
A restore only targets an EMPTY database different from the one in use, so it
can be rehearsed safely; it never replaces the running database.
"""

import os
import re
import shutil
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from .db import SCHEMA_REVISION

KEY_TABLES = [
    "users",
    "courses",
    "class_groups",
    "memberships",
    "publications",
    "submissions",
    "attendance_records",
    "audit_logs",
]


def libpq(url):
    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql":
        raise ValueError("Use uma URL PostgreSQL (postgresql+psycopg://...).")
    env = dict(os.environ)
    for key, value in {
        "PGHOST": parsed.host,
        "PGPORT": str(parsed.port) if parsed.port else None,
        "PGUSER": parsed.username,
        "PGPASSWORD": parsed.password,
        "PGDATABASE": parsed.database,
        "PGSSLMODE": parsed.query.get("sslmode"),
    }.items():
        if value:
            env[key] = value
    return env, parsed


def tool(name):
    path = shutil.which(name)
    if not path:
        raise ValueError(f"{name} não encontrado. Instale o cliente PostgreSQL.")
    return path


def major(output):
    found = re.search(r"(\d+)(?:\.\d+)?", output)
    return int(found.group(1)) if found else 0


def server_major(url):
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            return int(connection.execute(text("SHOW server_version_num")).scalar()) // 10000
    finally:
        engine.dispose()


def check_versions(url, name):
    client = major(subprocess.run([tool(name), "--version"], capture_output=True, text=True).stdout)
    server = server_major(url)
    if client < server:
        raise ValueError(
            f"{name} {client} é mais antigo que o servidor PostgreSQL {server}; "
            "use um cliente da mesma versão ou mais novo."
        )


def run(command, env):
    result = subprocess.run(command, env=env, capture_output=True, text=True)
    if result.returncode:
        raise ValueError((result.stderr or result.stdout).strip()[-500:] or "Falha no comando")
    return result.stdout


def backup(url, destination):
    env, _ = libpq(url)
    check_versions(url, "pg_dump")
    target = Path(destination).resolve()
    descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        run(
            [
                tool("pg_dump"),
                "--format=custom",
                "--no-owner",
                "--no-privileges",
                "--file",
                str(target),
            ],
            env,
        )
        listing = run([tool("pg_restore"), "--list", str(target)], env)
        if "alembic_version" not in listing or "audit_logs" not in listing:
            raise ValueError("Backup incompleto: tabelas essenciais ausentes")
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return target


def same_database(first, second):
    a, b = make_url(first), make_url(second)
    return (a.host, a.port or 5432, a.database) == (b.host, b.port or 5432, b.database)


def restore_check(source, target_url, active_url=None):
    """Restore into an empty scratch database and verify revision and contents."""
    if active_url and same_database(active_url, target_url):
        raise ValueError("O destino precisa ser diferente do banco em uso.")
    env, _ = libpq(target_url)
    check_versions(target_url, "pg_restore")
    engine = create_engine(target_url)
    try:
        if inspect(engine).get_table_names():
            raise ValueError("O banco de destino precisa estar vazio.")
        run(
            [
                tool("pg_restore"),
                "--no-owner",
                "--no-privileges",
                "--exit-on-error",
                "--single-transaction",
                "--dbname",
                env.get("PGDATABASE", ""),
                str(Path(source).resolve()),
            ],
            env,
        )
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            if revision != SCHEMA_REVISION:
                raise ValueError(f"Revisão {revision} difere da esperada {SCHEMA_REVISION}")
            counts = {
                table: connection.execute(text(f'SELECT count(*) FROM "{table}"')).scalar()
                for table in KEY_TABLES
            }
            triggers = connection.execute(
                text(
                    "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
                    "WHERE c.relname = 'audit_logs' AND NOT t.tgisinternal"
                )
            ).scalar()
            if not triggers:
                raise ValueError("Proteção da auditoria ausente após a restauração")
        return {"revision": revision, "counts": counts}
    finally:
        engine.dispose()
