"""Monitor Paperclip read-only untuk dashboard Hermes.

Mengapa plugin, bukan sekadar shortcut: Paperclip berjalan sebagai background
service systemd di host yang sama dengan Hermes, dan health-nya tersedia lewat
``GET /api/health``. Plugin ini hanya MEMBACA (tidak ada POST/PUT/DELETE), jadi
bisa menampilkan status tanpa risiko mengubah state instance.

Prinsip yang dijaga:
* Semua kegagalan **fail-open** — bila Paperclip mati, endpoint tetap 200 dengan
  ``ok: false`` agar tab tidak memunculkan error overlay.
* Tidak ada secret yang dikembalikan: password di ``DATABASE_URL`` DISUNTING
  sebelum dikirim ke browser.
* Timeout keras (``MAX_HTTP_TIMEOUT``) — tab dashboard tidak boleh menahan
  antrean request hanya karena Paperclip lambat.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any

import logging

from fastapi import APIRouter

log = logging.getLogger("paperclip-monitor")

router = APIRouter()

DEFAULT_API_URL = "http://127.0.0.1:3100"
MAX_HTTP_TIMEOUT = 3.0
SERVICE_NAME = "paperclipai.service"

# Database URL lazimnya berbentuk postgresql://user:password@host:port/db.
# Grup kedua (password) disunting sebelum payload meninggalkan proses ini.
_DB_PASSWORD_RE = re.compile(r"(postgresql(?:ql)?://[^:/@\s]+:)([^@]*)(@)")


def _api_url() -> str:
    return (
        os.environ.get("PAPERCLIP_API_URL")
        or os.environ.get("PAPERCLIP_MONITOR_URL")
        or DEFAULT_API_URL
    ).strip().rstrip("/")


def _timeout() -> float:
    """Timeout selalu dipotong ke MAX_HTTP_TIMEOUT (dibuat min() di kode)."""
    try:
        value = float(os.environ.get("PAPERCLIP_MONITOR_TIMEOUT") or MAX_HTTP_TIMEOUT)
    except Exception:
        value = MAX_HTTP_TIMEOUT
    return max(0.1, min(value, MAX_HTTP_TIMEOUT))


def _redact(value: Any) -> Any:
    """Sembunyikan password pada connection string apa pun yang ikut terikirim."""
    if not isinstance(value, str):
        return value
    return _DB_PASSWORD_RE.sub(r"\1***\3", value)


def _health() -> dict[str, Any]:
    """Ambil /api/health. Fail-open: selalu dict, tidak pernah raise."""
    url = f"{_api_url()}/api/health"
    started = time.time()
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=_timeout()) as resp:
            raw = resp.read().decode("utf-8", "replace")
            payload = json.loads(raw)
        return {
            "ok": True,
            "statusCode": 200,
            "latencyMs": int((time.time() - started) * 1000),
            "data": payload,
        }
    except urllib.error.HTTPError as exc:
        return {
            "ok": False,
            "statusCode": exc.code,
            "latencyMs": int((time.time() - started) * 1000),
            "error": f"HTTP {exc.code}",
        }
    except Exception as exc:  # koneksi ditolak, timeout, JSON rusak
        return {
            "ok": False,
            "statusCode": None,
            "latencyMs": int((time.time() - started) * 1000),
            "error": type(exc).__name__,
        }


def _show_value(prop: str, stdout: str, default: str = "") -> str:
    """Ambil nilai satu property dari output `systemctl show --value` per-baris.

    Bentuknya bisa `Name=value` maupun nilai polos bergantung versi systemd,
    jadi keduanya ditangani.
    """
    for line in (stdout or "").splitlines():
        text = line.strip()
        if not text:
            continue
        name, sep, value = text.partition("=")
        if sep and name.strip() == prop:
            return value.strip()
    return default


def _service() -> dict[str, Any]:
    """Status systemd --user. Bukan systemd → dilaporkan unsupported, bukan error."""
    env = dict(os.environ)
    env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")

    # --value pada systemd >= 254 mengembalikan nilai polos TANPA nama property,
    # berurutan sesuai --property. Itu rapuh terhadap versi lain, jadi minta
    # bentuk `Name=value` dan petakan dari namanya sendiri.
    try:
        proc = subprocess.run(
            [
                "systemctl",
                "--user",
                "show",
                SERVICE_NAME,
                "--property=ActiveState,SubState,MainPID,UnitFileState",
                "--no-pager",
            ],
            capture_output=True,
            text=True,
            timeout=_timeout(),
            env=env,
        )
    except FileNotFoundError:
        return {"supported": False, "reason": "systemctl tidak tersedia"}
    except subprocess.TimeoutExpired:
        return {"supported": True, "reason": "systemctl timeout"}

    if proc.returncode != 0:
        return {"supported": True, "installed": False, "detail": (proc.stderr or "").strip()[:300]}

    # --value mengembalikan satu baris per property. Urutannya mengikuti apa
    # yang systemd pilih, BUKAN urutan --property yang kita minta, jadi setiap
    # baris wajib dipetakan dari namanya sendiri — jangan pakai indeks posisi.
    return {
        "supported": True,
        "installed": True,
        "activeState": _show_value("ActiveState", proc.stdout, ""),
        "subState": _show_value("SubState", proc.stdout, ""),
        "mainPid": _show_value("MainPID", proc.stdout, ""),
        "unitFileState": _show_value("UnitFileState", proc.stdout, ""),
    }


@router.get("/snapshot")
async def snapshot() -> dict[str, Any]:
    """Ringkasan status Paperclip: service systemd + health HTTP.

    Fail-open: tab tetap ter-render walau Paperclip mati atau belum terinstall.
    """
    health = _health()
    return {
        "generated_at": time.time(),
        "apiUrl": _api_url(),
        "service": _service(),
        "health": health,
        "database": {
            "url": _redact(os.environ.get("DATABASE_URL") or ""),
            "configured": bool(os.environ.get("DATABASE_URL")),
        },
        "cli": {
            "path": os.environ.get("PAPERCLIP_CLI") or "~/.local/bin/paperclipai",
            "home": os.environ.get("PAPERCLIP_HOME") or "~/.paperclip",
        },
    }
