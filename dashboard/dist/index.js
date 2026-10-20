(function () {
  "use strict";
  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;
  const React = SDK.React;
  const { useEffect, useState } = SDK.hooks;
  const { Card, CardHeader, CardTitle, CardContent, Badge, Button } = SDK.components;
  const h = React.createElement;

  function ago(ts) { return ts ? SDK.utils.timeAgo(Number(ts)) : "—"; }

  function Chip({ ok, label }) {
    const cls = ok === true ? "pc-status pc-ok" : ok === false ? "pc-status pc-down" : "pc-status pc-unknown";
    return h("span", { className: cls }, label);
  }

  function KV({ rows }) {
    return h("dl", { className: "pc-kv" },
      rows.filter((r) => r[1] !== null && r[1] !== undefined && r[1] !== "")
        .map((r) => h(React.Fragment, { key: r[0] },
          h("dt", null, r[0]),
          h("dd", { className: r[2] ? "pc-mono" : null }, String(r[1]))
        ))
    );
  }

  function SummaryCards({ data }) {
    const healthOk = !!(data.health && data.health.ok);
    const svc = data.service || {};
    const svcOk = svc.installed === true && svc.activeState === "active";

    const cards = [
      { label: "Server", value: healthOk ? "Online" : "Offline",
        note: healthOk ? `${data.health.latencyMs} ms` : (data.health?.error || "tidak merespons"),
        ok: healthOk },
      { label: "Service", value: svc.installed ? (svc.activeState || "—") : "Belum terpasang",
        note: svc.installed ? `PID ${svc.mainPid || "—"}` : (svc.reason || "systemd tidak terdeteksi"),
        ok: svc.installed ? svcOk : null },
      { label: "Database", value: data.database?.configured ? "Eksternal" : "Embedded",
        note: data.database?.url || "tidak dikonfigurasi",
        ok: data.database?.configured ? null : null },
      { label: "Versi", value: (data.health?.data?.serverVersion) || "—",
        note: (data.health?.data?.deploymentMode) || "", ok: null },
    ];

    return h("div", { className: "pc-grid", style: { gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } },
      cards.map((c) => h(Card, { key: c.label },
        h(CardContent, { className: "py-3" },
          h("div", { className: "pc-row" },
            h("span", { className: "pc-muted" }, c.label),
            c.ok !== null ? h(Chip, { ok: c.ok, label: c.ok ? "OK" : "Gagal" }) : null
          ),
          h("div", { style: { fontSize: "1.15rem", fontWeight: 700, marginTop: "0.15rem" } }, c.value),
          c.note ? h("div", { className: "pc-muted pc-mono" }, c.note) : null
        )
      ))
    );
  }

  function PaperclipPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    function refresh() {
      setLoading(true);
      SDK.fetchJSON("/api/plugins/paperclip-monitor/snapshot")
        .then((d) => { setData(d); setError(""); })
        .catch((e) => setError(String(e && e.message ? e.message : e)))
        .finally(() => setLoading(false));
    }

    useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, []);

    if (error) {
      return h(Card, null, h(CardContent, { className: "py-4" },
        h("div", null, "Gagal memuat snapshot: ", error),
        h(Button, { onClick: refresh, style: { marginTop: "0.5rem" } }, "Coba lagi")
      ));
    }
    if (!data) {
      return h(Card, null, h(CardContent, { className: "py-4 pc-muted" }, "Memuat…"));
    }

    const hd = (data.health && data.health.data) || {};
    const warnings = (hd.warnings || []).map((w) => w.message || w.code).filter(Boolean);

    return h("div", { className: "pc-grid" },
      h("div", { className: "pc-row" },
        h("span", { style: { fontSize: "1.05rem", fontWeight: 700 } }, "Paperclip"),
        h(Badge, null, data.health?.ok ? "listening" : "offline"),
        h("span", { className: "pc-muted" }, "diperbarui " + ago(data.generated_at)),
        h(Button, { onClick: refresh, disabled: loading }, loading ? "Memuat…" : "Muat ulang")
      ),

      h(SummaryCards, { data }),

      h(Card, null,
        h(CardHeader, null, h(CardTitle, null, "Detail")),
        h(CardContent, null,
          h(KV, { rows: [
            ["API base", data.apiUrl, true],
            ["Mode", hd.deploymentMode],
            ["Auth", hd.authReady ? "ready" : "belum siap"],
            ["Bootstrap", hd.bootstrapStatus],
            ["UI", "http://127.0.0.1:3100", true],
            ["CLI", data.cli?.path, true],
            ["Home", data.cli?.home, true],
            ["Database", data.database?.url, true],
          ] })
        )
      ),

      warnings.length
        ? h(Card, null,
            h(CardHeader, null, h(CardTitle, null, "Peringatan")),
            h(CardContent, null,
              h("ul", { style: { margin: 0, paddingLeft: "1.1rem" } },
                warnings.map((w, i) => h("li", { key: i, className: "pc-muted" }, w))
              )
            )
          )
        : null
    );
  }

  SDK.registerPage("/paperclip", PaperclipPage);
})();
