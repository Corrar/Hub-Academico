"""Delivery channels. Each send returns ``ok``, ``gone`` (drop device) or ``retry``."""

import json
import os
import re
from dataclasses import dataclass

import httpx

from . import webpush

EXPO_URL = "https://exp.host/--/api/v2/push/send"
EXPO_TOKEN = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,200}\]$")


@dataclass(frozen=True)
class PushSettings:
    public_key: str | None
    private_key: str | None
    subject: str | None
    expo_access_token: str | None
    interval: int
    dispatch_token: str | None

    @property
    def web(self):
        return bool(self.public_key)

    @classmethod
    def from_env(cls):
        public, private, subject = (
            os.getenv("VAPID_PUBLIC_KEY", "").strip(),
            os.getenv("VAPID_PRIVATE_KEY", "").strip(),
            os.getenv("VAPID_SUBJECT", "").strip(),
        )
        if any([public, private, subject]):
            if not all([public, private, subject]):
                raise RuntimeError("Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.")
            if not subject.startswith(("mailto:", "https://")):
                raise RuntimeError("VAPID_SUBJECT deve começar com mailto: ou https://")
            key = webpush.load_private_key(private)
            if webpush.b64encode(webpush.public_bytes(key.public_key())) != public:
                raise RuntimeError("VAPID_PUBLIC_KEY não corresponde à chave privada.")
        try:
            interval = int(os.getenv("PUSH_DISPATCH_INTERVAL_SECONDS", "0"))
        except ValueError:
            interval = -1
        if interval and not 15 <= interval <= 3600:
            raise RuntimeError("PUSH_DISPATCH_INTERVAL_SECONDS deve ser 0 ou de 15 a 3600.")
        token = os.getenv("NOTIFICATION_DISPATCH_TOKEN", "").strip() or None
        if token and len(token) < 32:
            raise RuntimeError("NOTIFICATION_DISPATCH_TOKEN precisa de ao menos 32 caracteres.")
        return cls(
            public or None,
            private or None,
            subject or None,
            os.getenv("EXPO_ACCESS_TOKEN", "").strip() or None,
            interval,
            token,
        )


class Sender:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client or httpx.Client(timeout=10)

    def send(self, subscription, message):
        if subscription.channel == "expo":
            return self.expo(subscription, message)
        return self.web(subscription, message)

    def web(self, subscription, message):
        cfg = self.settings
        if not cfg.web or not webpush.endpoint_allowed(subscription.endpoint):
            return "gone" if cfg.web else "retry"
        body = webpush.encrypt(
            json.dumps(message, ensure_ascii=False).encode("utf-8"),
            subscription.p256dh,
            subscription.auth,
        )
        headers = {
            **webpush.vapid_headers(
                subscription.endpoint, cfg.private_key, cfg.public_key, cfg.subject
            ),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": "86400",
            "Urgency": "normal",
        }
        try:
            response = self.client.post(subscription.endpoint, content=body, headers=headers)
        except httpx.HTTPError:
            return "retry"
        if response.status_code in (404, 410):
            return "gone"
        return "ok" if response.status_code < 300 else "retry"

    def expo(self, subscription, message):
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.settings.expo_access_token:
            headers["Authorization"] = "Bearer " + self.settings.expo_access_token
        payload = {
            "to": subscription.endpoint,
            "title": message["title"],
            "body": message["body"],
            "data": {"page": message["page"]},
            "sound": "default",
        }
        try:
            response = self.client.post(EXPO_URL, json=payload, headers=headers)
            ticket = response.json().get("data", {})
        except (httpx.HTTPError, ValueError, AttributeError):
            return "retry"
        if isinstance(ticket, list):
            ticket = ticket[0] if ticket else {}
        if ticket.get("status") == "ok":
            return "ok"
        if (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
            return "gone"
        return "retry"
