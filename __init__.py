"""Paperclip monitor — sisi agent (no-op yang disengaja).

Sisi dashboard ada di ``dashboard/`` (tab ``/paperclip``) dan sisi desktop di
``desktop/plugin.js``. Paket ini TETAP butuh ``__init__.py`` karena
``hermes plugins enable/disable paperclip-monitor`` membaca kunci plugin dari
discovery sisi agent (``plugins/<name>/plugin.yaml``), BUKAN dari
``dashboard/manifest.json``. Tanpa file ini perintah itu menjawab
"No plugin named 'paperclip-monitor'" walau tab-nya sudah ter-render.

Sengaja tidak mendaftar tool, hook, atau command: plugin ini hanya menyumbang
UI baca-saja, jadi tidak boleh menambah permukaan yang bisa dipanggil model.
"""


def register(ctx):
    """Sengaja kosong — tidak ada tool/hook/command yang didaftarkan."""
    return None
