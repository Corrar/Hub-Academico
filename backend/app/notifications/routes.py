"""Device registration, preferences and the protected dispatch trigger."""

import logging
import secrets
import threading
from datetime import timedelta
from typing import Literal

from fastapi import HTTPException, Request, Response
from pydantic import Field, model_validator
from sqlalchemy import delete, select

from .. import schemas, security
from ..models import NotificationOutbox, NotificationPreference, PushSubscription, now
from . import queue, webpush
from .channels import EXPO_TOKEN, Sender

log = logging.getLogger("hub.notifications")
CATEGORIES = ["notices", "activities", "materials", "events", "grades", "deadlines"]


class Keys(schemas.Input):
    p256dh: str = Field(min_length=80, max_length=120)
    auth: str = Field(min_length=16, max_length=40)


class SubscriptionInput(schemas.Input):
    channel: Literal["web", "expo"]
    endpoint: str = Field(min_length=10, max_length=2000)
    keys: Keys | None = None
    label: str = Field("", max_length=120)

    @model_validator(mode="after")
    def consistent(self):
        if self.channel == "web":
            if not self.keys or not webpush.endpoint_allowed(self.endpoint):
                raise ValueError("Inscrição Web Push inválida")
            try:
                webpush.encrypt(b"{}", self.keys.p256dh, self.keys.auth)
            except ValueError as error:
                raise ValueError("Chaves da inscrição inválidas") from error
        elif self.keys or not EXPO_TOKEN.fullmatch(self.endpoint):
            raise ValueError("Token Expo inválido")
        return self


class EndpointInput(schemas.Input):
    endpoint: str = Field(min_length=10, max_length=2000)


class PreferenceInput(schemas.Input):
    notices: bool
    activities: bool
    materials: bool
    events: bool
    grades: bool
    deadlines: bool


def start_loop(sessions, settings, sender):
    """Background dispatcher for single-service deployments (Render free plan)."""
    from ..privacy import purge

    stop = threading.Event()

    def loop():
        last_purge = None
        while not stop.wait(settings.interval):
            try:
                with sessions() as db:
                    queue.dispatch(db, sender)
                    # Retention runs hourly alongside delivery.
                    if not last_purge or now() - last_purge >= timedelta(hours=1):
                        purge(db)
                        last_purge = now()
            except Exception:  # keep the loop alive; the next cycle retries
                log.exception("Falha ao despachar notificações")

    thread = threading.Thread(target=loop, name="hub-push", daemon=True)
    thread.start()
    return stop


def install_notifications(app, DB, Actor, settings):
    sender = Sender(settings)
    app.state.push_sender = sender

    def preference(db, actor):
        return db.get(NotificationPreference, actor.id) or NotificationPreference(
            user_id=actor.id, **{key: True for key in CATEGORIES}
        )

    @app.get("/api/v1/notifications/config")
    def config(actor: Actor):
        return {"web_push": settings.web, "public_key": settings.public_key, "expo": True}

    @app.get("/api/v1/notifications/preferences")
    def preferences(db: DB, actor: Actor):
        row = preference(db, actor)
        return {key: getattr(row, key) for key in CATEGORIES}

    @app.put("/api/v1/notifications/preferences")
    def save_preferences(body: PreferenceInput, db: DB, actor: Actor):
        row = db.get(NotificationPreference, actor.id)
        if not row:
            row = NotificationPreference(user_id=actor.id)
            db.add(row)
        for key, value in body.model_dump().items():
            setattr(row, key, value)
        db.commit()
        return body.model_dump()

    @app.get("/api/v1/notifications/subscriptions")
    def devices(db: DB, actor: Actor):
        return [
            {
                "id": row.id,
                "channel": row.channel,
                "label": row.label,
                "created_at": row.created_at,
                "last_success_at": row.last_success_at,
            }
            for row in db.scalars(
                select(PushSubscription)
                .where(PushSubscription.user_id == actor.id)
                .order_by(PushSubscription.created_at)
            )
        ]

    @app.post("/api/v1/notifications/subscriptions", status_code=201)
    def subscribe(body: SubscriptionInput, db: DB, actor: Actor):
        if body.channel == "web" and not settings.web:
            raise HTTPException(503, "Notificações push ainda não foram configuradas")
        key = security.digest(body.endpoint)
        row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint_hash == key))
        if row is None:
            if (
                len(
                    db.scalars(
                        select(PushSubscription.id).where(PushSubscription.user_id == actor.id)
                    ).all()
                )
                >= 10
            ):
                raise HTTPException(409, "Limite de dez dispositivos por conta")
            row = PushSubscription(endpoint_hash=key, endpoint=body.endpoint)
            db.add(row)
        # A shared device follows whoever signed in last.
        row.user_id, row.channel, row.label = actor.id, body.channel, body.label.strip()
        row.p256dh = body.keys.p256dh if body.keys else None
        row.auth = body.keys.auth if body.keys else None
        row.failures = 0
        db.commit()
        return {"id": row.id}

    @app.post("/api/v1/notifications/unsubscribe", status_code=204)
    def unsubscribe(body: EndpointInput, db: DB, actor: Actor):
        db.execute(
            delete(PushSubscription).where(
                PushSubscription.endpoint_hash == security.digest(body.endpoint),
                PushSubscription.user_id == actor.id,
            )
        )
        db.commit()
        return Response(status_code=204)

    @app.post("/api/v1/notifications/subscriptions/{key}/revoke", status_code=204)
    def revoke(key: str, db: DB, actor: Actor):
        db.execute(
            delete(PushSubscription).where(
                PushSubscription.id == key, PushSubscription.user_id == actor.id
            )
        )
        db.commit()
        return Response(status_code=204)

    @app.post("/api/v1/notifications/test")
    def test(db: DB, actor: Actor):
        stamp = now()
        minute = stamp.strftime("%Y%m%d%H%M")
        key = f"test:{actor.id}:{minute}"
        if not queue.add(db, actor.id, "test", key, stamp):
            raise HTTPException(429, "Aguarde um minuto para enviar outro teste")
        db.commit()
        queue.dispatch(db, sender)
        item = db.scalar(select(NotificationOutbox).where(NotificationOutbox.dedup_key == key))
        return {"status": item.status if item else "pending"}

    @app.post("/api/v1/internal/notifications/dispatch")
    def dispatch(request: Request, db: DB):
        supplied = request.headers.get("x-dispatch-token", "")
        if not settings.dispatch_token or not secrets.compare_digest(
            supplied.encode(), settings.dispatch_token.encode()
        ):
            raise HTTPException(403, "Acesso negado")
        return queue.dispatch(db, sender)

    @app.get("/api/v1/internal/notifications/status")
    def status(request: Request, db: DB):
        supplied = request.headers.get("x-dispatch-token", "")
        if not settings.dispatch_token or not secrets.compare_digest(
            supplied.encode(), settings.dispatch_token.encode()
        ):
            raise HTTPException(403, "Acesso negado")
        rows = db.execute(
            select(NotificationOutbox.status, NotificationOutbox.id).where(
                NotificationOutbox.status.in_(["pending", "failed"])
            )
        ).all()
        return {
            "pending": sum(1 for state, _ in rows if state == "pending"),
            "failed": sum(1 for state, _ in rows if state == "failed"),
        }

    return sender
