"""Optional ClamAV scan of uploads through the clamd INSTREAM protocol.

When ``CLAMAV_HOST`` (TCP) or ``CLAMAV_SOCKET`` (Unix socket) is set, every
attachment must be scanned and found clean before it is stored. If the scanner
is unreachable the upload is refused: it fails closed, never silently accepts.
"""

import os
import socket
from dataclasses import dataclass

CHUNK = 64 * 1024


class ScannerUnavailable(Exception):
    pass


@dataclass(frozen=True)
class Verdict:
    clean: bool
    signature: str = ""


@dataclass(frozen=True)
class Scanner:
    host: str | None
    port: int
    path: str | None
    timeout: float = 30

    @property
    def enabled(self):
        return bool(self.host or self.path)

    @classmethod
    def from_env(cls):
        host = os.getenv("CLAMAV_HOST", "").strip() or None
        path = os.getenv("CLAMAV_SOCKET", "").strip() or None
        try:
            port = int(os.getenv("CLAMAV_PORT", "3310"))
        except ValueError:
            port = 0
        if not 1 <= port <= 65535:
            raise RuntimeError("CLAMAV_PORT inválida.")
        if os.getenv("CLAMAV_REQUIRED", "false").lower() == "true" and not (host or path):
            raise RuntimeError("CLAMAV_REQUIRED=true exige CLAMAV_HOST ou CLAMAV_SOCKET.")
        return cls(host, port, path)

    def connect(self):
        if self.path:
            connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            connection.settimeout(self.timeout)
            connection.connect(self.path)
            return connection
        return socket.create_connection((self.host, self.port), timeout=self.timeout)

    def scan(self, content):
        if not self.enabled:
            return None
        try:
            with self.connect() as connection:
                connection.sendall(b"zINSTREAM\0")
                for start in range(0, len(content), CHUNK):
                    part = content[start : start + CHUNK]
                    connection.sendall(len(part).to_bytes(4, "big") + part)
                connection.sendall(b"\0\0\0\0")
                reply = b""
                while not reply.endswith(b"\0"):
                    data = connection.recv(4096)
                    if not data:
                        break
                    reply += data
        except OSError as error:
            raise ScannerUnavailable from error
        answer = reply.rstrip(b"\0").decode("utf-8", "replace").strip()
        if answer.endswith(" OK"):
            return Verdict(True)
        if answer.endswith(" FOUND"):
            signature = answer.removeprefix("stream:").removesuffix("FOUND").strip()
            return Verdict(False, signature[:120])
        raise ScannerUnavailable(answer[:200])
