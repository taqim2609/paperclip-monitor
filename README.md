# Paperclip Monitor (Hermes plugin)

Monitor **baca-saja** untuk instance [Paperclip](https://paperclip.ing) yang
berjalan di host yang sama dengan Hermes.

Menampilkan: status service systemd, health HTTP (`/api/health`), versi, mode
deployment, dan connection string database (dengan password disunting).

## Kenapa plugin, bukan service sendiri

Paperclip sudah berjalan sebagai background service systemd, dan health-nya
tersedia lewat `GET /api/health`. Plugin ini **hanya membaca** — tidak ada
endpoint `POST`/`PUT`/`DELETE` — jadi tidak bisa mengubah state instance.
Karena berjalan di dalam proses `hermes dashboard` yang sudah hidup, tidak ada
port tambahan dan tidak ada RSS tambahan.

## Isi paket

```
plugin.yaml           # sisi agent
__init__.py           # wajib agar `hermes plugins enable/disable` resolve
dashboard/            # web: manifest.json + dist/index.js + plugin_api.py
desktop/plugin.js     # desktop: satu file ESM
plugin.js             # entri kanonis untuk Install from Git (salinan identik)
```

`plugin.js` di root **dan** `desktop/plugin.js` sengaja keduanya ada: installer
Git menerima salah satu, tetapi untuk bentuk nested ia menurunkan nama folder
dari direktori induk berkas entri (biasanya literal `desktop`), yang bisa
men-stage paket di folder salah. Root adalah entri kanonis; `desktop/plugin.js`
digenerate darinya dan keduanya dijaga byte-identik.

## Surfaces

| Host | Surface |
|---|---|
| `hermes dashboard` | tab `/paperclip`, route `/api/plugins/paperclip-monitor/snapshot` |
| Hermes Desktop | halaman `/paperclip` + baris sidebar nav |

Backend `plugin_api.py` dipakai bersama oleh kedua host — tidak ada logika
backend yang diduplikasi.

## Prinsip yang dijaga

- **Fail-open:** kalau Paperclip mati, endpoint tetap `200` dengan `ok: false`
  agar tab tidak memunculkan error overlay.
- **Password disunting** sebelum payload meninggalkan proses.
- **Timeout keras** 3 detik, dipotong di kode (`min()`), bukan sekadar disarankan.
- **Tidak pernah raise** keluar dari handler — kegagalan dilipat ke payload.
- Tidak mendaftar tool/hook/command: plugin ini hanya menyumbang UI, jadi tidak
  menambah permukaan yang bisa dipanggil model.

## Konfigurasi

Variabel lingkungan yang dibaca (opsional, semua punya default):

| Variabel | Default |
|---|---|
| `PAPERCLIP_API_URL` | `http://127.0.0.1:3100` |
| `PAPERCLIP_MONITOR_URL` | fallback setelah `PAPERCLIP_API_URL` |
| `PAPERCLIP_MONITOR_TIMEOUT` | `3.0` (dipotong ke 3.0) |
| `DATABASE_URL` | ditampilkan, password disunting |

## Catatan

- Plugin ini butuh Paperclip berjalan terpisah — tidak menyertakan Paperclip.
- `defaultEnabled: true` dipilih sengaja: plugin ini tidak punya switch
  sendiri, jadi `false` membuat panelnya mustahil dijangkau.
