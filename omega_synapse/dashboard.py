"""Read-only provenance dashboard.

Rule: every number rendered here comes from a computed object passed in. There
are no literal fallbacks, no `|| 98.4`, no placeholder telemetry. If a value is
absent the cell says INSUFFICIENT_DATA.
"""

from __future__ import annotations

import html
import json
import os

FOOTER = ("No live trading. No guaranteed return. Every statistic is computed from "
          "observed daily candles and can be reproduced with the same seed and data "
          "snapshot. A passing verdict means one hypothesis survived a multiple-testing "
          "correction on one historical window — it is not a forecast, a yield, or "
          "investment advice.")

SIGN_OFF = ("No token is predicted to surge. No live trade has executed. Position Cap = 0. "
            "All candidates with N < 30 are statistically indistinguishable from noise. "
            "High past percentage moves are liquidity artifacts until proven otherwise. "
            "The architecture is verified; the deployment is not recommended for live capital. "
            "The $7,000 daily profit goal is a theoretical parameter requiring "
            "institutional-grade co-location and hardware, not a guaranteed yield for "
            "retail infrastructure.")

PALETTE = {"LIVE": "#22c55e", "CACHE": "#eab308", "STALE": "#f97316",
           "INSUFFICIENT_DATA": "#ef4444", "BLOCKED_ON_CREDENTIALS": "#a855f7"}


def _badge(label: str) -> str:
    color = PALETTE.get(label, "#64748b")
    return (f'<span style="display:inline-block;padding:2px 8px;border-radius:10px;'
            f'border:1px solid {color}66;background:{color}1a;color:{color};'
            f'font-size:10px;letter-spacing:.08em">{html.escape(label)}</span>')


def _cell(v) -> str:
    if v is None:
        return '<span style="color:#ef4444">INSUFFICIENT_DATA</span>'
    return html.escape(str(v))


def render(provenance: list, verdicts: list, telemetry_status: dict,
           spa: dict | None, path: str = "dashboard.html",
           sink: dict | None = None, p1: dict | None = None) -> str:
    """Write the dashboard to disk and return the absolute path."""
    body = render_html(provenance, verdicts, telemetry_status, spa, sink=sink, p1=p1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return os.path.abspath(path)


def _sink_block(sink: dict | None) -> str:
    if not sink:
        return '<span style="color:#ef4444">INSUFFICIENT_DATA</span>'
    return (f'{html.escape(str(sink.get("status")))} '
            f'&nbsp; http={_cell(sink.get("http_status"))} '
            f'&nbsp; accepted={_cell(sink.get("accepted"))} '
            f'&nbsp; series_exported={_cell(sink.get("series_exported"))} '
            f'&nbsp; export_claimed={_cell(sink.get("export_claimed"))} '
            f'&nbsp; instrumentation_ts={_cell(sink.get("instrumentation_ts"))}')


def _p1_block(p1: dict | None) -> str:
    if not p1:
        return '<span style="color:#ef4444">INSUFFICIENT_DATA</span>'
    rows = []
    for row in p1.get("rows") or []:
        rows.append(
            "<tr>" + "".join(
                f'<td style="padding:9px 14px;border-bottom:1px solid #1e293b">{c}</td>'
                for c in (
                    f'<b style="color:#e2e8f0">{_cell(row.get("mint"))}</b>',
                    _cell(row.get("tier")),
                    _cell(row.get("position_cap")),
                    _cell(", ".join(row.get("missing") or []) or None),
                )) + "</tr>")
    table = ""
    if rows:
        table = ("<table style=\"width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px\">"
                 "<thead><tr style=\"color:#64748b;font-size:10px;letter-spacing:.14em\">"
                 "<th style=\"text-align:left;padding:9px 14px\">MINT</th>"
                 "<th style=\"text-align:left;padding:9px 14px\">TIER</th>"
                 "<th style=\"text-align:left;padding:9px 14px\">POSITION CAP</th>"
                 "<th style=\"text-align:left;padding:9px 14px\">MISSING</th>"
                 f"</tr></thead><tbody>{''.join(rows)}</tbody></table>")
    return (f'observed={_cell(p1.get("observed_candidates"))} '
            f'&nbsp; status={html.escape(str(p1.get("status")))} '
            f'&nbsp; position_cap={_cell(p1.get("position_cap"))} '
            f'&nbsp; template={html.escape(str(p1.get("template_adjudication")))} '
            f'(unmeasured 20-row sheet not rendered)'
            f'{table}')


def render_html(provenance: list, verdicts: list, telemetry_status: dict,
                spa: dict | None, sink: dict | None = None, p1: dict | None = None) -> str:
    rows = []
    for p in provenance:
        rows.append(
            "<tr>" + "".join(
                f'<td style="padding:9px 14px;border-bottom:1px solid #1e293b">{c}</td>'
                for c in (
                    f'<b style="color:#e2e8f0">{_cell(p.get("symbol"))}</b>',
                    _cell(p.get("bars")),
                    _cell(p.get("last_bar")),
                    _badge(p.get("source", "INSUFFICIENT_DATA")),
                    f'<span style="color:#64748b;font-size:11px">{_cell(p.get("error"))}</span>'
                )) + "</tr>")

    vrows = []
    for v in verdicts:
        vrows.append(
            "<tr>" + "".join(
                f'<td style="padding:9px 14px;border-bottom:1px solid #1e293b">{c}</td>'
                for c in (
                    f'<b style="color:#e2e8f0">{_cell(v.get("symbol"))}</b>',
                    f'<span style="color:{"#22c55e" if v.get("passed") else "#f87171"}">'
                    f'{html.escape(str(v.get("reason")))}</span>',
                    _cell(v.get("position_cap")),
                    f'<span style="color:#64748b;font-size:11px">{html.escape(str(len(v.get("steps", []))))} steps run</span>'
                )) + "</tr>")

    spa_block = "not run"
    if spa:
        p = spa.get("p_value")
        spa_block = (f'p = {p:.4f} &nbsp; stat = {spa.get("stat"):.3f} &nbsp; '
                     f'reps = {spa.get("reps")} &nbsp; k = {spa.get("k")} &nbsp; '
                     f'<span style="color:{"#22c55e" if (p is not None and p < 0.05) else "#f87171"}">'
                     f'{"REJECT H0" if (p is not None and p < 0.05) else "DO NOT REJECT H0"}</span>'
                     if isinstance(p, (int, float)) else "INSUFFICIENT_DATA")

    body = f"""<!doctype html><html><head><meta charset="utf-8">
<title>OMEGA-SYNAPSE — paper screener</title></head>
<body style="margin:0;background:#05070d;color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
<div style="max-width:1100px;margin:0 auto;padding:32px 24px">
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:14px">
    <div>
      <div style="font-size:19px;letter-spacing:.22em;color:#f8fafc">OMEGA-SYNAPSE <span style="color:#22d3ee">{html.escape(str(telemetry_status.get("version", "1.0.1")))}</span></div>
      <div style="font-size:11px;color:#64748b;letter-spacing:.14em;margin-top:4px">READ-ONLY · PAPER · POSITION CAP 0</div>
    </div>
    <div>{_badge("LIVE GATE: NO")}</div>
  </div>

  <h2 style="font-size:11px;letter-spacing:.18em;color:#94a3b8;margin:28px 0 10px">DATA PROVENANCE</h2>
  <div style="border:1px solid #1e293b;border-radius:10px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead><tr style="background:#0b1220;color:#64748b;font-size:10px;letter-spacing:.14em">
        <th style="text-align:left;padding:9px 14px">SYMBOL</th>
        <th style="text-align:left;padding:9px 14px">BARS</th>
        <th style="text-align:left;padding:9px 14px">LAST BAR</th>
        <th style="text-align:left;padding:9px 14px">SOURCE</th>
        <th style="text-align:left;padding:9px 14px">NOTE</th>
      </tr></thead><tbody>{''.join(rows)}</tbody>
    </table>
  </div>

  <h2 style="font-size:11px;letter-spacing:.18em;color:#94a3b8;margin:28px 0 10px">FFS VERDICTS</h2>
  <div style="border:1px solid #1e293b;border-radius:10px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead><tr style="background:#0b1220;color:#64748b;font-size:10px;letter-spacing:.14em">
        <th style="text-align:left;padding:9px 14px">SYMBOL</th>
        <th style="text-align:left;padding:9px 14px">REASON</th>
        <th style="text-align:left;padding:9px 14px">POSITION CAP</th>
        <th style="text-align:left;padding:9px 14px">STEPS</th>
      </tr></thead><tbody>{''.join(vrows) or '<tr><td colspan="4" style="padding:14px;color:#64748b">no candidates</td></tr>'}</tbody>
    </table>
  </div>

  <h2 style="font-size:11px;letter-spacing:.18em;color:#94a3b8;margin:28px 0 10px">HANSEN SPA</h2>
  <div style="border:1px solid #1e293b;border-radius:10px;padding:14px;font-size:12px;color:#cbd5e1">{spa_block}</div>

  <h2 style="font-size:11px;letter-spacing:.18em;color:#94a3b8;margin:28px 0 10px">TELEMETRY</h2>
  <div style="border:1px solid #1e293b;border-radius:10px;padding:14px;font-size:12px">
    registry: {html.escape(json.dumps(telemetry_status.get("by_domain", {})))} &nbsp;·&nbsp;
    total: <b>{_cell(telemetry_status.get("total"))}</b> &nbsp;·&nbsp;
    otel: {html.escape(str(telemetry_status.get("otel", "INSUFFICIENT_DATA")))} &nbsp;·&nbsp;
    synthetic_data_used: <b>{_cell(telemetry_status.get("synthetic_data_used"))}</b>
  </div>

  <h2 style="font-size:11px;letter-spacing:.18em;color:#94a3b8;margin:28px 0 10px">OTLP SINK</h2>
  <div style="border:1px solid #1e293b;border-radius:10px;padding:14px;font-size:12px">{_sink_block(sink if sink is not None else telemetry_status.get("sink"))}</div>

  <h2 style="font-size:11px;letter-spacing:.18em;color:#94a3b8;margin:28px 0 10px">P1 QUEUE</h2>
  <div style="border:1px solid #1e293b;border-radius:10px;padding:14px;font-size:12px">{_p1_block(p1 if p1 is not None else telemetry_status.get("p1"))}</div>

  <div style="margin-top:34px;border-top:1px solid #1e293b;padding-top:18px;font-size:13px;line-height:1.65;color:#94a3b8">
    <b style="color:#e2e8f0">No live trading. No guaranteed return.</b>
    {html.escape(FOOTER.split('No guaranteed return.', 1)[1])}
  </div>
  <div style="margin-top:14px;font-size:12px;line-height:1.6;color:#94a3b8">{html.escape(SIGN_OFF)}</div>
  <div style="margin-top:14px;font-size:10px;color:#475569;letter-spacing:.1em">
    OMEGA-SYNAPSE 1.0 · paper broker · suite v{html.escape(str(telemetry_status.get("suite_version", "?")))} · Hansen SPA / DSR / PBO / CSCV · data: Kraken public OHLC
  </div>
</div></body></html>"""
    return body
