"""Run from backend/: python -m app.cli <comando>; use --help para a lista."""

import argparse
import getpass
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.engine import make_url

from .db import SCHEMA_REVISION, database_url, make_engine, make_sessions
from .main import audit
from .models import User
from .schemas import UserCreate
from .security import passwords


def bootstrap(email, name, password):
    data = UserCreate(email=email, name=name, password=password, role="coordinator")
    engine = make_engine(database_url())
    try:
        with make_sessions(engine)() as db:
            if db.scalar(select(User.id).where(User.role == "coordinator")):
                raise ValueError(
                    "Já existe coordenação. Use uma conta existente para criar usuários."
                )
            user = User(
                **data.model_dump(exclude={"password"}), password_hash=passwords.hash(data.password)
            )
            db.add(user)
            db.flush()
            audit(db, user, "bootstrap", user)
            db.commit()
    finally:
        engine.dispose()


def seed_demo(password):
    from .demo import seed
    from .microsoft import MicrosoftSettings

    if MicrosoftSettings.from_env():
        raise ValueError("Dados de demonstração usam contas locais; o login Microsoft está ativo.")
    if len(password) < 12:
        raise ValueError("A senha de demonstração precisa ter ao menos 12 caracteres.")
    engine = make_engine(database_url())
    try:
        return seed(make_sessions(engine), password)
    finally:
        engine.dispose()


def dispatch_notifications(loop_seconds=0):
    import time

    from .notifications.channels import PushSettings, Sender
    from .notifications.queue import dispatch

    sender = Sender(PushSettings.from_env())
    engine = make_engine(database_url())
    try:
        while True:
            with make_sessions(engine)() as db:
                print(dispatch(db, sender), flush=True)
            if not loop_seconds:
                return
            time.sleep(loop_seconds)
    finally:
        engine.dispose()


def backup(destination):
    url = make_url(database_url())
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise ValueError("Este comando é exclusivo do SQLite local; PostgreSQL usa pg_dump.")
    source = Path(url.database).resolve()
    if not source.is_file():
        raise ValueError("Banco de origem não encontrado")
    target = Path(destination).resolve()
    # Exclusive create; never overwrite a database or an existing backup.
    descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(target)) as dst:
                src.backup(dst)
                if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("Falha na integridade do backup")
    except Exception:
        target.unlink(missing_ok=True)
        raise


def restore_check(source, destination):
    """Restore to a NEW file, validate integrity/schema; never replace a running database."""
    source = Path(source).resolve()
    if not source.is_file():
        raise ValueError("Backup não encontrado")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = "sqlite:///" + str(source)
    try:
        backup(destination)
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
    with closing(
        sqlite3.connect(Path(destination).resolve().as_uri() + "?mode=ro", uri=True)
    ) as db:
        if db.execute("SELECT version_num FROM alembic_version").fetchone() != (SCHEMA_REVISION,):
            raise ValueError("Versão do banco incompatível")
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Existem vínculos inválidos")
        return db.execute("SELECT count(*) FROM users").fetchone()[0]


def main():
    parser = argparse.ArgumentParser(description="Administração local do Hub Acadêmico")
    commands = parser.add_subparsers(dest="command", required=True)
    first = commands.add_parser("bootstrap")
    first.add_argument("--email", required=True)
    first.add_argument("--name", required=True)
    demo = commands.add_parser("seed-demo", help="Popula base vazia com dados fictícios")
    demo.add_argument(
        "--password-env",
        metavar="VARIAVEL",
        help="Lê a senha comum das contas fictícias desta variável de ambiente",
    )
    commands.add_parser("vapid-keys", help="Gera o par de chaves VAPID para Web Push")
    push = commands.add_parser("dispatch-notifications", help="Envia notificações pendentes")
    push.add_argument(
        "--loop", type=int, default=0, metavar="SEGUNDOS", help="Repete a cada N segundos"
    )
    commands.add_parser("purge-expired", help="Remove dados operacionais vencidos")
    dump = commands.add_parser("pg-backup", help="Backup verificado do PostgreSQL (pg_dump)")
    dump.add_argument("destination")
    check = commands.add_parser(
        "pg-restore-check", help="Restaura um backup em banco vazio e verifica"
    )
    check.add_argument("source")
    check.add_argument(
        "--target-env",
        required=True,
        metavar="VARIAVEL",
        help="Variável de ambiente com a URL do banco vazio de destino",
    )
    b = commands.add_parser("backup")
    b.add_argument("destination")
    r = commands.add_parser("restore-check")
    r.add_argument("source")
    r.add_argument("destination")
    args = parser.parse_args()
    if args.command == "bootstrap":
        password = getpass.getpass("Senha local (mínimo 12 caracteres): ")
        if password != getpass.getpass("Repita a senha: "):
            parser.error("As senhas não coincidem")
        bootstrap(args.email, args.name, password)
        print("Coordenação criada. Faça login pela API local.")
    elif args.command == "seed-demo":
        if args.password_env:
            password = os.environ.get(args.password_env, "")
        else:
            password = getpass.getpass("Senha comum das contas fictícias (mínimo 12): ")
            if password != getpass.getpass("Repita a senha: "):
                parser.error("As senhas não coincidem")
        accounts = seed_demo(password)
        print("Dados fictícios criados. Contas locais (mesma senha informada):")
        for address in accounts.values():
            print("  " + address)
    elif args.command == "vapid-keys":
        from .notifications.webpush import generate_vapid_keys

        private, public = generate_vapid_keys()
        print("Guarde a chave privada como segredo da hospedagem; nunca a publique.")
        print("VAPID_PUBLIC_KEY=" + public)
        print("VAPID_PRIVATE_KEY=" + private)
    elif args.command == "dispatch-notifications":
        dispatch_notifications(args.loop)
    elif args.command == "purge-expired":
        from .privacy import purge

        engine = make_engine(database_url())
        try:
            with make_sessions(engine)() as db:
                print(purge(db))
        finally:
            engine.dispose()
    elif args.command == "pg-backup":
        from .pgbackup import backup as pg_backup

        target = pg_backup(database_url(), args.destination)
        print(f"Backup criado e listado com sucesso: {target}")
    elif args.command == "pg-restore-check":
        from .pgbackup import restore_check as pg_restore_check

        target_url = os.environ.get(args.target_env, "")
        if not target_url:
            parser.error("Defina a URL do banco vazio na variável informada")
        result = pg_restore_check(args.source, target_url, database_url())
        print(f"Restauração verificada (revisão {result['revision']}): {result['counts']}")
    elif args.command == "backup":
        backup(args.destination)
        print("Backup criado e integridade verificada.")
    else:
        count = restore_check(args.source, args.destination)
        print(f"Cópia restaurada e verificada: {count} usuários. Banco original preservado.")


if __name__ == "__main__":
    main()
