import { Badge, Button, ROUTES_AREA, SIDEBAR_NAV_AREA, useQuery } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

// Disk plugins load UNCOMPILED: no JSX syntax, no bundler. Only
// '@hermes/plugin-sdk', 'react' and 'react/jsx-runtime' resolve.
const ID = 'paperclip-monitor'
const REFRESH_MS = 15000
const UI_URL = 'http://127.0.0.1:3100'

const CSS = `
.pc-wrap{display:flex;flex-direction:column;gap:10px;padding:12px;overflow:auto;height:100%}
.pc-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pc-title{font-size:0.95rem;font-weight:600}
.pc-muted{color:var(--ui-text-tertiary);font-size:0.72rem}
.pc-mono{font-family:var(--font-mono,monospace);font-size:0.72rem;word-break:break-all}
.pc-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.pc-card{border:1px solid var(--ui-stroke-secondary);border-radius:6px;padding:8px 10px}
.pc-card-label{color:var(--ui-text-tertiary);font-size:0.7rem;text-transform:uppercase;letter-spacing:.04em}
.pc-card-value{font-size:1.05rem;font-weight:600;margin-top:2px}
.pc-card-note{margin-top:2px;color:var(--ui-text-tertiary);font-size:0.68rem}
.pc-kv{display:grid;grid-template-columns:9.5rem 1fr;gap:4px 10px;margin:0}
.pc-kv dt{color:var(--ui-text-tertiary);font-size:0.72rem}
.pc-kv dd{margin:0;font-size:0.74rem}
.pc-warn{color:var(--ui-text-secondary);font-size:0.72rem;margin:0;padding-left:1.1rem}
.pc-section-title{font-size:0.78rem;font-weight:600;margin-top:2px}
`

function toneOf(ok) {
  if (ok === true) return 'success'
  if (ok === false) return 'destructive'
  return 'muted'
}

function Card({ label, value, note, ok }) {
  return jsxs('div', { className: 'pc-card', children: [
    jsxs('div', { className: 'pc-card-label', children: [
      label,
      ok === null ? null : jsx(Badge, { variant: toneOf(ok), size: 'xs', children: ok ? 'OK' : 'Gagal' })
    ]}),
    jsx('div', { className: 'pc-card-value', children: value }),
    note ? jsx('div', { className: 'pc-card-note pc-mono', children: note }) : null
  ]})
}

function Meta({ rows }) {
  return jsx('dl', { className: 'pc-kv', children: rows
    .filter(row => row[1] !== null && row[1] !== undefined && row[1] !== '')
    .map(row => jsxs('div', { style: { display: 'contents' }, children: [
      jsx('dt', { children: row[0] }),
      jsx('dd', { className: row[2] ? 'pc-mono' : undefined, children: String(row[1]) })
    ]}, row[0]))
  })
}

function timeAgo(ts) {
  if (!ts) return '—'
  const seconds = Math.max(0, Math.round((Date.now() / 1000) - Number(ts)))
  if (seconds < 60) return `${seconds} dtk lalu`
  if (seconds < 3600) return `${Math.round(seconds / 60)} mnt lalu`
  return `${Math.round(seconds / 3600)} jam lalu`
}

function PaperclipPanel({ ctx }) {
  const query = useQuery({
    queryKey: [ID, 'snapshot'],
    queryFn: () => ctx.rest('/snapshot'),
    refetchInterval: REFRESH_MS,
    retry: 1
  })

  if (query.isLoading && !query.data) {
    return jsx('div', { className: 'pc-wrap', children: jsx('div', { className: 'pc-muted', children: 'Memuat status Paperclip…' }) })
  }
  if (query.isError && !query.data) {
    return jsxs('div', { className: 'pc-wrap', children: [
      jsx('div', { className: 'pc-muted', children: `Gagal memuat snapshot: ${query.error?.message ?? 'error'}` }),
      jsx(Button, { variant: 'outline', size: 'sm', onClick: () => query.refetch(), children: 'Coba lagi' })
    ]})
  }

  const data = query.data ?? {}
  const health = data.health ?? {}
  const detail = health.data ?? {}
  const service = data.service ?? {}
  const healthOk = Boolean(health.ok)
  const serviceOk = service.installed ? service.activeState === 'active' : null
  const warnings = (detail.warnings ?? []).map(item => item.message || item.code).filter(Boolean)

  return jsxs('div', { className: 'pc-wrap', children: [
    jsxs('div', { className: 'pc-head', children: [
      jsx('span', { className: 'pc-title', children: 'Paperclip' }),
      jsx(Badge, { variant: toneOf(healthOk), size: 'xs', children: healthOk ? 'listening' : 'offline' }),
      jsx('span', { className: 'pc-muted', children: `diperbarui ${timeAgo(data.generated_at)}` }),
      jsx(Button, {
        variant: 'ghost', size: 'sm',
        onClick: () => query.refetch(),
        children: query.isFetching ? 'Memuat…' : 'Muat ulang'
      })
    ]}),

    jsxs('div', { className: 'pc-cards', children: [
      jsx(Card, {
        label: 'Server', ok: healthOk,
        value: healthOk ? 'Online' : 'Offline',
        note: healthOk ? `${health.latencyMs} ms` : (health.error ?? 'tidak merespons')
      }),
      jsx(Card, {
        label: 'Service', ok: serviceOk,
        value: service.installed ? (service.activeState ?? '—') : 'Belum terpasang',
        note: service.installed ? `PID ${service.mainPid ?? '—'} · ${service.unitFileState ?? '—'}` : (service.reason ?? 'systemd tidak terdeteksi')
      }),
      jsx(Card, {
        label: 'Database', ok: null,
        value: data.database?.configured ? 'Eksternal' : 'Embedded',
        note: data.database?.url ?? 'tidak dikonfigurasi'
      }),
      jsx(Card, {
        label: 'Versi', ok: null,
        value: detail.serverVersion ?? '—',
        note: detail.deploymentMode ?? ''
      })
    ]}),

    jsx('div', { className: 'pc-section-title', children: 'Detail' }),
    jsx(Meta, { rows: [
      ['API base', data.apiUrl, true],
      ['Mode', detail.deploymentMode],
      ['Auth', detail.authReady ? 'ready' : 'belum siap'],
      ['Bootstrap', detail.bootstrapStatus],
      ['UI', UI_URL, true],
      ['CLI', data.cli?.path, true],
      ['Home', data.cli?.home, true]
    ]}),

    warnings.length
      ? jsxs('div', { children: [
          jsx('div', { className: 'pc-section-title', children: 'Peringatan' }),
          jsx('ul', { children: warnings.map((text, index) => jsx('li', { className: 'pc-warn', children: text }, index)) })
        ]})
      : null
  ]})
}

export default {
  id: ID,
  name: 'Paperclip',
  description: 'Monitor baca-saja instance Paperclip: status service, health, dan database.',
  // Enabled by default so the panel is reachable — this plugin ships no
  // switch of its own, so defaultEnabled:false would make it unreachable.
  defaultEnabled: true,
  register(ctx) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    ctx.onDispose(() => style.remove())

    ctx.registerMany([
      {
        id: 'route',
        area: ROUTES_AREA,
        data: { path: '/paperclip' },
        render: () => jsx(PaperclipPanel, { ctx })
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        data: { path: '/paperclip', label: 'Paperclip', codicon: 'link' }
      }
    ])
  }
}
