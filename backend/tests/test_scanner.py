"""Antivirus integration through a local fake clamd speaking INSTREAM."""

import socket
import socketserver
import threading

import pytest
from test_academic import ROOT, publication, setup

from app.academic.scanner import Scanner, ScannerUnavailable

EICAR = rb"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


class Clamd(socketserver.BaseRequestHandler):
    def handle(self):
        assert self.request.recv(10) == b"zINSTREAM\0"
        content = b""
        while True:
            size = int.from_bytes(self._exact(4), "big")
            if not size:
                break
            content += self._exact(size)
        self.server.seen.append(content)
        answer = b"stream: Eicar-Test-Signature FOUND\0" if EICAR in content else b"stream: OK\0"
        self.request.sendall(answer)

    def _exact(self, size):
        data = b""
        while len(data) < size:
            data += self.request.recv(size - len(data))
        return data


@pytest.fixture
def clamd():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Clamd)
    server.seen = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


def test_scanner_protocol(clamd):
    scanner = Scanner("127.0.0.1", clamd.server_address[1], None)
    assert scanner.scan(b"conteudo limpo").clean
    big = b"a" * (200 * 1024)
    assert scanner.scan(big).clean and clamd.seen[-1] == big
    verdict = scanner.scan(b"inicio " + EICAR)
    assert not verdict.clean and verdict.signature == "Eicar-Test-Signature"
    free = socket.socket()
    free.bind(("127.0.0.1", 0))
    port = free.getsockname()[1]
    free.close()
    with pytest.raises(ScannerUnavailable):
        Scanner("127.0.0.1", port, None, timeout=1).scan(b"x")
    assert Scanner(None, 3310, None).scan(b"x") is None


def test_required_scanner_needs_configuration(monkeypatch):
    monkeypatch.setenv("CLAMAV_REQUIRED", "true")
    with pytest.raises(RuntimeError):
        Scanner.from_env()


def test_uploads_are_scanned_blocked_and_fail_closed(system, clamd):
    client, app, _ = system
    groups, people = setup(client)
    teacher = people[2][1]
    material = publication(client, groups[0], kind="material", due_at=None)
    path = ROOT + "/publication/" + material["id"] + "/attachments"
    headers = {**teacher, "Content-Type": "text/plain", "X-File-Name": "notas.txt"}
    app.state.scanner = Scanner("127.0.0.1", clamd.server_address[1], None)
    assert client.post(path, headers=headers, content=b"limpo").status_code == 201
    blocked = client.post(path, headers=headers, content=EICAR)
    assert blocked.status_code == 422
    audit = client.get("/api/v1/audit").json()
    assert audit[0]["action"] == "attachment_blocked" and "Eicar" in audit[0]["changes"]
    assert len(client.get(path, headers=teacher).json()) == 1
    app.state.scanner = Scanner("127.0.0.1", 1, None, timeout=1)
    assert client.post(path, headers=headers, content=b"limpo").status_code == 503
