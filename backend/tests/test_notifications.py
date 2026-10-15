"""Push notifications: encryption, VAPID, queue semantics and abuse resistance."""

import json
from datetime import timedelta

import httpx
import jwt
import pytest
from conftest import PASSWORD, catalog, create_user, login_user
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_api import dates

from app.main import create_app
from app.models import NotificationOutbox, Publication, PushSubscription, now
from app.notifications import webpush
from app.notifications.channels import PushSettings

ROOT = "/api/v1"
TOKEN = "dispatch-token-for-tests-only-0123456789"
ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-"


def decrypt(body, receiver_key, auth):
    """Receiver side of RFC 8291, written independently of the sender."""
    salt, size, length = body[:16], int.from_bytes(body[16:20], "big"), body[20]
    sender_raw, ciphertext = body[21 : 21 + length], body[21 + length :]
    assert size == 4096
    sender = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender_raw)
    receiver_raw = webpush.public_bytes(receiver_key.public_key())
    ikm = HKDF(
        hashes.SHA256(), 32, salt=auth, info=b"WebPush: info\x00" + receiver_raw + sender_raw
    ).derive(receiver_key.exchange(ec.ECDH(), sender))
    cek = HKDF(hashes.SHA256(), 16, salt=salt, info=b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(hashes.SHA256(), 12, salt=salt, info=b"Content-Encoding: nonce\x00").derive(ikm)
    plain = AESGCM(cek).decrypt(nonce, ciphertext, None)
    assert plain.endswith(b"\x02")
    return plain[:-1]


def device(name):
    key = ec.generate_private_key(ec.SECP256R1())
    auth = name.encode().ljust(16, b"0")[:16]
    return key, {
        "channel": "web",
        "endpoint": ENDPOINT + name,
        "keys": {
            "p256dh": webpush.b64encode(webpush.public_bytes(key.public_key())),
            "auth": webpush.b64encode(auth),
        },
        "label": "Navegador de teste",
    }


@pytest.fixture
def push(system, monkeypatch):
    _, _, url = system
    private, public = webpush.generate_vapid_keys()
    for key, value in {
        "VAPID_PUBLIC_KEY": public,
        "VAPID_PRIVATE_KEY": private,
        "VAPID_SUBJECT": "mailto:suporte@fatec.sp.gov.br",
        "NOTIFICATION_DISPATCH_TOKEN": TOKEN,
    }.items():
        monkeypatch.setenv(key, value)
    app = create_app(url)
    sent, replies = [], []

    def handler(request):
        sent.append(request)
        status = replies.pop(0) if replies else 201
        if request.url.host == "exp.host":
            body = (
                {"data": {"status": "ok"}}
                if status < 300
                else {"data": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}
            )
            return httpx.Response(200, json=body)
        return httpx.Response(status)

    app.state.push_sender.client = httpx.Client(transport=httpx.MockTransport(handler))
    with TestClient(app) as client:
        login = client.post(
            ROOT + "/auth/login", json={"email": "admin@fatec.sp.gov.br", "password": PASSWORD}
        )
        client.headers["Authorization"] = "Bearer " + login.json()["access_token"]
        yield client, app, sent, replies, public
    app.state.engine.dispose()


def people(client):
    _, _, groups = catalog(client)
    result = {}
    for key, role in [("ana", "student"), ("bia", "student"), ("prof", "teacher")]:
        user = create_user(client, role=role, name=key.title(), email=f"{key}@fatec.sp.gov.br")
        client.put(
            ROOT + "/memberships",
            json={"user_id": user["id"], "group_id": groups[0]["id"], **dates()},
        )
        result[key] = (user, login_user(client, user["email"]))
    return groups, result


def dispatch(client, token=TOKEN):
    return client.post(
        ROOT + "/internal/notifications/dispatch", headers={"X-Dispatch-Token": token}
    )


def notice(client, **changes):
    body = dict(kind="notice", title="Prova", body="Sexta", audience="institution", draft=False)
    body.update(changes)
    response = client.post(ROOT + "/learning/publications", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_encryption_round_trip_and_vapid_claims():
    key, subscription = device("unit")
    body = webpush.encrypt(b'{"title":"Oi"}', **subscription["keys"])
    assert decrypt(body, key, webpush.b64decode(subscription["keys"]["auth"])) == b'{"title":"Oi"}'
    private, public = webpush.generate_vapid_keys()
    header = webpush.vapid_headers(ENDPOINT + "x", private, public, "mailto:a@b.c")
    token = header["Authorization"].split("t=")[1].split(",")[0]
    verifier = ec.EllipticCurvePublicKey.from_encoded_point(
        ec.SECP256R1(), webpush.b64decode(public)
    )
    claims = jwt.decode(
        token, verifier, algorithms=["ES256"], audience="https://fcm.googleapis.com"
    )
    assert claims["sub"] == "mailto:a@b.c" and claims["exp"] > now().timestamp()
    assert header["Authorization"].endswith("k=" + public)


@pytest.mark.parametrize(
    "endpoint,allowed",
    [
        ("https://fcm.googleapis.com/fcm/send/x", True),
        ("https://updates.push.services.mozilla.com/wpush/v2/x", True),
        ("https://web.push.apple.com/x", True),
        ("http://fcm.googleapis.com/fcm/send/x", False),
        ("https://fcm.googleapis.com:8443/x", False),
        ("https://evil.example/fcm.googleapis.com", False),
        ("https://fcm.googleapis.com.evil.example/x", False),
        ("https://user:pw@fcm.googleapis.com/x", False),
        ("https://169.254.169.254/latest", False),
    ],
)
def test_push_endpoints_are_restricted_to_browser_services(endpoint, allowed):
    assert webpush.endpoint_allowed(endpoint) is allowed


def test_settings_reject_mismatched_keys(monkeypatch):
    private, _ = webpush.generate_vapid_keys()
    _, other = webpush.generate_vapid_keys()
    monkeypatch.setenv("VAPID_PRIVATE_KEY", private)
    monkeypatch.setenv("VAPID_PUBLIC_KEY", other)
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:a@b.c")
    with pytest.raises(RuntimeError):
        PushSettings.from_env()
    monkeypatch.setenv("VAPID_SUBJECT", "a@b.c")
    with pytest.raises(RuntimeError):
        PushSettings.from_env()


def test_notice_is_encrypted_delivered_and_respects_preferences(push):
    client, app, sent, replies, public = push
    groups, users = people(client)
    ana_key, ana_device = device("ana")
    ana = users["ana"][1]
    config = client.get(ROOT + "/notifications/config", headers=ana).json()
    assert config["web_push"] and config["public_key"] == public
    assert (
        client.post(ROOT + "/notifications/subscriptions", headers=ana, json=ana_device).status_code
        == 201
    )

    published = notice(client, title="Rematrícula aberta")
    result = dispatch(client).json()
    assert result["sent"] == 1 and len(sent) == 1
    request = sent[0]
    assert str(request.url) == ana_device["endpoint"]
    assert request.headers["content-encoding"] == "aes128gcm"
    assert request.headers["authorization"].startswith("vapid t=")
    message = json.loads(
        decrypt(request.content, ana_key, webpush.b64decode(ana_device["keys"]["auth"]))
    )
    assert message["title"] == "Novo aviso" and message["body"] == "Rematrícula aberta"
    assert message["page"] == "notice" and message["tag"].startswith("pub:" + published["id"])
    # Each publication reaches each person once, even across dispatch cycles.
    assert dispatch(client).json()["sent"] == 0 and len(sent) == 1

    preferences = client.get(ROOT + "/notifications/preferences", headers=ana).json()
    assert all(preferences.values())
    client.put(
        ROOT + "/notifications/preferences", headers=ana, json={**preferences, "notices": False}
    )
    notice(client, title="Outro aviso")
    assert dispatch(client).json()["sent"] == 0 and len(sent) == 1

    assert dispatch(client, "wrong").status_code == 403
    assert client.post(ROOT + "/internal/notifications/dispatch").status_code == 403


def test_group_scope_scheduling_archiving_and_grades(push):
    client, app, sent, replies, _ = push
    groups, users = people(client)
    for name in ["ana", "bia"]:
        client.post(
            ROOT + "/notifications/subscriptions", headers=users[name][1], json=device(name)[1]
        )
    teacher = users["prof"][1]
    outsider = create_user(client, name="Fora", email="fora@fatec.sp.gov.br")
    client.put(
        ROOT + "/memberships",
        json={"user_id": outsider["id"], "group_id": groups[1]["id"], **dates()},
    )
    fora = login_user(client, outsider["email"])
    client.post(ROOT + "/notifications/subscriptions", headers=fora, json=device("fora")[1])

    later = client.post(
        ROOT + "/learning/publications",
        headers=teacher,
        json=dict(
            kind="material",
            title="Slides",
            body="Aula 3",
            audience="group",
            group_id=groups[0]["id"],
            draft=False,
            publish_at=(now() + timedelta(hours=2)).isoformat(),
        ),
    ).json()
    assert dispatch(client).json()["sent"] == 0
    with app.state.sessions() as db:
        db.get(Publication, later["id"]).publish_at = now() - timedelta(minutes=1)
        db.commit()
    assert dispatch(client).json()["sent"] == 2
    assert {str(item.url) for item in sent} == {ENDPOINT + "ana", ENDPOINT + "bia"}

    # Archived before delivery: nothing is sent.
    gone = notice(client, audience="group", group_id=groups[0]["id"], title="Cancelado")
    client.patch(
        ROOT + "/learning/publications/" + gone["id"] + "/archive", json={"archived": True}
    )
    before = len(sent)
    assert dispatch(client).json()["sent"] == 0 and len(sent) == before

    activity = client.post(
        ROOT + "/learning/publications",
        headers=teacher,
        json=dict(
            kind="activity",
            title="Lista 4",
            body="Exercícios",
            audience="group",
            group_id=groups[0]["id"],
            draft=False,
            due_at=(now() + timedelta(hours=10)).isoformat(),
        ),
    ).json()
    submission = client.put(
        ROOT + "/learning/activities/" + activity["id"] + "/submission",
        headers=users["ana"][1],
        json={"body": "Resposta", "draft": False},
    ).json()
    result = dispatch(client).json()
    # New activity for both, deadline reminder only for the student without submission.
    with app.state.sessions() as db:
        keys = set(db.scalars(select(NotificationOutbox.dedup_key)))
    assert f"due:{activity['id']}:{users['bia'][0]['id']}" in keys
    assert f"due:{activity['id']}:{users['ana'][0]['id']}" not in keys
    assert result["sent"] == 3
    client.put(
        ROOT + "/learning/submissions/" + submission["id"] + "/grade",
        headers=teacher,
        json={"grade": 7.5, "feedback": "Bom", "version": submission["version"]},
    )
    before = len(sent)
    assert dispatch(client).json()["sent"] == 1
    assert str(sent[before].url) == ENDPOINT + "ana"
    assert all("fora" not in str(item.url) for item in sent)


def test_retries_backoff_and_removed_devices(push):
    client, app, sent, replies, _ = push
    _, users = people(client)
    ana = users["ana"][1]
    client.post(ROOT + "/notifications/subscriptions", headers=ana, json=device("ana")[1])
    notice(client)
    replies.append(503)
    assert dispatch(client).json()["retry"] == 1
    mine = select(NotificationOutbox).where(NotificationOutbox.user_id == users["ana"][0]["id"])
    with app.state.sessions() as db:
        item = db.scalar(mine)
        assert item.status == "pending" and item.attempts == 1
        assert item.deliver_after.replace(tzinfo=None) > now().replace(tzinfo=None)
        item.deliver_after = now() - timedelta(seconds=1)
        db.commit()
    replies.append(410)
    dispatch(client)
    with app.state.sessions() as db:
        assert db.scalar(mine).status == "skipped"
    assert client.get(ROOT + "/notifications/subscriptions", headers=ana).json() == []


def test_expo_channel_and_subscription_validation(push):
    client, app, sent, replies, _ = push
    _, users = people(client)
    ana = users["ana"][1]
    path = ROOT + "/notifications/subscriptions"
    expo = {"channel": "expo", "endpoint": "ExponentPushToken[abcdefghijklmnop]"}
    assert client.post(path, headers=ana, json=expo).status_code == 201
    notice(client)
    assert dispatch(client).json()["sent"] == 1
    payload = json.loads(sent[-1].content)
    assert payload["to"] == expo["endpoint"] and payload["data"] == {"page": "notice"}
    replies.append(500)
    notice(client, title="Segundo")
    assert dispatch(client).json()["sent"] == 0
    assert client.get(path, headers=ana).json() == []

    for invalid in [
        {"channel": "expo", "endpoint": "token-qualquer"},
        {**device("x")[1], "endpoint": "http://fcm.googleapis.com/fcm/send/x"},
        {**device("x")[1], "endpoint": "https://intranet.local/push"},
        {**device("x")[1], "keys": {"p256dh": "A" * 87, "auth": "B" * 22}},
    ]:
        assert client.post(path, headers=ana, json=invalid).status_code == 422


def test_shared_device_follows_last_user_and_test_endpoint(push):
    client, app, sent, replies, _ = push
    _, users = people(client)
    _, shared = device("shared")
    path = ROOT + "/notifications/subscriptions"
    client.post(path, headers=users["ana"][1], json=shared)
    client.post(path, headers=users["bia"][1], json=shared)
    assert client.get(path, headers=users["ana"][1]).json() == []
    assert len(client.get(path, headers=users["bia"][1]).json()) == 1
    first = client.post(ROOT + "/notifications/test", headers=users["bia"][1])
    assert first.json() == {"status": "sent"}
    assert client.post(ROOT + "/notifications/test", headers=users["bia"][1]).status_code == 429
    client.post(
        ROOT + "/notifications/unsubscribe",
        headers=users["bia"][1],
        json={"endpoint": shared["endpoint"]},
    )
    with app.state.sessions() as db:
        assert db.scalar(select(PushSubscription)) is None


def test_background_loop_delivers_and_stops(push):
    import time
    from types import SimpleNamespace

    from app.notifications.routes import start_loop

    client, app, sent, replies, _ = push
    _, users = people(client)
    client.post(
        ROOT + "/notifications/subscriptions", headers=users["bia"][1], json=device("bia")[1]
    )
    notice(client, title="Pelo laço")
    stop = start_loop(app.state.sessions, SimpleNamespace(interval=0.05), app.state.push_sender)
    try:
        for _ in range(100):
            if sent:
                break
            time.sleep(0.05)
    finally:
        stop.set()
    assert [str(item.url) for item in sent] == [ENDPOINT + "bia"]


def test_cli_generates_matching_vapid_keys(monkeypatch, capsys):
    import sys

    from app import cli

    monkeypatch.setattr(sys, "argv", ["cli", "vapid-keys"])
    cli.main()
    lines = dict(line.split("=", 1) for line in capsys.readouterr().out.splitlines() if "=" in line)
    monkeypatch.setenv("VAPID_PUBLIC_KEY", lines["VAPID_PUBLIC_KEY"])
    monkeypatch.setenv("VAPID_PRIVATE_KEY", lines["VAPID_PRIVATE_KEY"])
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:suporte@fatec.sp.gov.br")
    assert PushSettings.from_env().web
