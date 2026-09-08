import hashlib
import secrets
from datetime import timedelta, timezone

from fastapi import HTTPException
from pwdlib import PasswordHash
from sqlalchemy import delete, select, text

from .models import LoginAttempt, Session, User, now

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(32))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def login(db, email, password, ip):
    # Serialize shared account/peer buckets across PostgreSQL instances.
    # Lock ordering prevents deadlocks; locks live only for this transaction.
    if db.bind.dialect.name == "postgresql":
        keys = {int(digest(value)[:15], 16) for value in ("email:" + email, "peer:" + ip)}
        for key in sorted(keys):
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    stamp = now()
    buckets = []
    for key, maximum in [(digest("email:" + email), 5), (digest("peer:" + ip), 30)]:
        bucket = db.get(LoginAttempt, key)
        if bucket and stamp - utc(bucket.window_start) < timedelta(minutes=15):
            if bucket.attempts >= maximum:
                raise HTTPException(
                    429,
                    "Muitas tentativas. Tente novamente em 15 minutos.",
                    headers={"Retry-After": "900"},
                )
        elif bucket:
            bucket.attempts, bucket.window_start = 0, stamp
        else:
            bucket = LoginAttempt(key=key, attempts=0, window_start=stamp)
            db.add(bucket)
        buckets.append(bucket)
    user = db.scalar(select(User).where(User.email == email))
    valid = passwords.verify(password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid or user.archived:
        for bucket in buckets:
            bucket.attempts += 1
        db.commit()
        raise HTTPException(401, "E-mail ou senha inválidos")
    buckets[0].attempts = 0
    db.execute(delete(Session).where(Session.expires_at <= stamp))
    token = secrets.token_urlsafe(48)
    db.add(
        Session(token_hash=digest(token), user_id=user.id, expires_at=stamp + timedelta(minutes=30))
    )
    db.commit()
    return {"access_token": token, "token_type": "bearer", "expires_in": 1800}


def authenticate(db, token):
    session = db.get(Session, digest(token))
    if not session or utc(session.expires_at) <= now():
        raise HTTPException(
            401, "Sessão inválida ou expirada", headers={"WWW-Authenticate": "Bearer"}
        )
    user = db.get(User, session.user_id)
    if not user or user.archived:
        raise HTTPException(401, "Sessão inválida ou expirada")
    return user
