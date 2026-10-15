"""Attachment allowlist: extension, declared type and file signature must agree.

Files are always served as downloads with ``nosniff`` and a sandbox CSP; the
server never renders them. Malware scanning is an operational control that
still needs an institutional service before real data is accepted.
"""

import io
import json
import os
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from urllib.parse import quote, unquote

TEXT_LIMIT = 512 * 1024


@dataclass(frozen=True)
class Kind:
    media_type: str
    label: str
    text: bool = False
    zip_folder: str | None = None


KINDS = {
    "txt": Kind("text/plain", "TXT", text=True),
    "csv": Kind("text/csv", "CSV", text=True),
    "ipynb": Kind("application/x-ipynb+json", "Notebook", text=True),
    "pdf": Kind("application/pdf", "PDF"),
    "png": Kind("image/png", "PNG"),
    "jpg": Kind("image/jpeg", "JPG"),
    "jpeg": Kind("image/jpeg", "JPG"),
    "docx": Kind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Word",
        zip_folder="word/",
    ),
    "xlsx": Kind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Excel",
        zip_folder="xl/",
    ),
    "pptx": Kind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "PowerPoint",
        zip_folder="ppt/",
    ),
}
# Declared request types that are acceptable for an upload body; HTML and
# script types are refused even when the content would be valid text.
DECLARED = {kind.media_type for kind in KINDS.values()} | {
    "application/octet-stream",
    "application/json",
    "application/zip",
    "application/vnd.ms-excel",
    "",
}


def max_bytes():
    value = os.getenv("ATTACHMENT_MAX_MB", "4")
    try:
        size = int(value)
    except ValueError:
        size = 0
    if not 1 <= size <= 25:
        raise RuntimeError("ATTACHMENT_MAX_MB deve ser um inteiro de 1 a 25.")
    return size * 1024 * 1024


def accepted_extensions():
    return sorted(KINDS)


def clean_name(raw):
    """Decode the percent-encoded header and keep a short, path-free display name."""
    try:
        name = unquote(raw or "", errors="strict")
    except UnicodeDecodeError:
        return None
    name = unicodedata.normalize("NFC", name).strip()
    if (
        not name
        or len(name) > 96
        or name.startswith(".")
        or not re.fullmatch(r"[\w .()\-]+\.[A-Za-z0-9]{2,5}", name)
        or ".." in name
    ):
        return None
    return name


def extension(name):
    return name.rsplit(".", 1)[-1].lower()


def kind_for(name):
    return KINDS.get(extension(name))


def limit_for(kind, maximum):
    return min(TEXT_LIMIT, maximum) if kind.text else maximum


def verify(kind, name, content):
    """Return an error message, or None when the bytes match the declared kind."""
    if not content:
        return "Arquivo vazio"
    if kind.text:
        if b"\x00" in content:
            return "Arquivo de texto inválido"
        try:
            decoded = content.decode("utf-8")
        except UnicodeError:
            return "Arquivo deve ser texto UTF-8"
        if extension(name) == "ipynb":
            try:
                json.loads(decoded)
            except ValueError:
                return "Notebook inválido"
        return None
    signatures = {
        "application/pdf": (b"%PDF-",),
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "image/jpeg": (b"\xff\xd8\xff",),
    }
    if kind.media_type in signatures:
        if not content.startswith(signatures[kind.media_type]):
            return "O conteúdo não corresponde à extensão do arquivo"
        return None
    if not content.startswith(b"PK\x03\x04"):
        return "O conteúdo não corresponde à extensão do arquivo"
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = archive.namelist()
    except (zipfile.BadZipFile, ValueError):
        return "Documento Office inválido"
    if "[Content_Types].xml" not in names or not any(
        item.startswith(kind.zip_folder) for item in names
    ):
        return "Documento Office inválido"
    if any(item.lower().endswith("vbaproject.bin") for item in names):
        return "Documentos com macros não são aceitos"
    return None


def disposition(name):
    """RFC 6266 attachment header with an ASCII fallback and the UTF-8 name."""
    fallback = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii") or "anexo"
    )
    fallback = re.sub(r"[^A-Za-z0-9 _.()-]", "_", fallback)
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name)}"
