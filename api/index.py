"""Vercel serverless entry point (WSGI, stdlib only).

Why this file exists: `server.py` runs a long-lived ThreadingHTTPServer, which
is correct for a sandbox but *not* deployable to a serverless platform. This
module exposes the same four routes as a plain WSGI callable so Vercel's Python
runtime can serve them without a persistent process.

Serverless constraints handled here:
  * Filesystem is read-only except /tmp  -> cache + audit paths redirect there.
  * Cold start recomputes from Kraken (~2-3 s); warm invocations hit memo cache.
  * No POST handler at all -> cannot be poked into doing work.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

SERVERLESS = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
CACHE_DIR = tempfile.gettempdir() if SERVERLESS else ROOT

_MEMO: dict = {"ts": 0.0, "payload": None}
MEMO_TTL = 300  # seconds; Kraken itself caches 6 h downstream


def _build_payload() -> dict:
    """Run the real screener pipeline. Every value is computed."""
    import numpy as np

    from omega_synapse import __version__
    from omega_synapse import suite_bridge as sb
    from omega_synapse.dashboard import render_html
    from omega_synapse.ffs_engine import Observation, evaluate_token, negative_control_null
    from omega_synapse.kraken_ohlc_fetcher import fetch_all
    from omega_synapse.p1_ranker import observed_queue
    from omega_synapse.security_gate import SecurityVerdict
    from omega_synapse.solana_geyser import GeyserListener
    from omega_synapse.spa import hansen_spa
    from omega_synapse import telemetry
    from omega_synapse.telemetry_sink import probe_sink

    series = fetch_all(cache_path=os.path.join(CACHE_DIR, "kraken_cache.sqlite"))
    provenance = [s.provenance() for s in series.values()]

    rets = {k: v.returns() for k, v in series.items() if v.returns()}
    bench_key = "XBTUSD"
    if bench_key not in rets or len(rets) < 2:
        return {"error": "insufficient aligned series", "provenance": provenance}

    n = min(len(r) for r in rets.values())
    keys = sorted(rets)
    mat = np.column_stack([rets[k][-n:] for k in keys])
    bi = keys.index(bench_key)
    bench = mat[:, bi]
    cand = np.delete(mat, bi, axis=1)
    cand_keys = [k for i, k in enumerate(keys) if i != bi]

    spa = hansen_spa(cand, bench, reps=1000)

    verdicts = []
    for j, k in enumerate(cand_keys):
        verdicts.append(evaluate_token(Observation(
            symbol=k,
            returns=list(cand[:, j]),
            strategy_matrix=None,
            benchmark_returns=list(bench),
            candidate_matrix=cand,
            n_trials=len(cand_keys) * 2,
            security=SecurityVerdict.not_applicable(
                k, "CEX price series: no mint authority or holder set exists to inspect"),
        )))

    nc = negative_control_null()
    tel = telemetry.assert_registry()
    otel = telemetry.init_otel()
    geo = GeyserListener.from_env().start()
    sink = otel.get("probe") or probe_sink()
    p1 = observed_queue(geyser_status=geo)
    tel_status = dict(tel)
    tel_status["otel"] = otel["status"]
    tel_status["sdk"] = otel.get("sdk")
    tel_status["sink"] = sink
    tel_status["p1"] = p1
    tel_status["suite_version"] = sb.SUITE_VERSION
    tel_status["version"] = __version__
    tel_status["synthetic_data_used"] = 0

    html = render_html(provenance, verdicts, tel_status, spa, sink=sink, p1=p1)

    return {
        "html": html,
        "results": {
            "suite_version": sb.SUITE_VERSION,
            "bars_aligned": n,
            "benchmark": bench_key,
            "spa": spa,
            "negative_control": nc,
            "provenance": provenance,
            "verdicts": verdicts,
            "telemetry": tel,
            "geyser": geo,
            "sink": sink,
            "p1": p1,
            "version": __version__,
            "position_cap": 0,
            "live_gate": "NO",
            "execution_path": "ABSENT",
            "synthetic_data_used": 0,
            "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "serverless": SERVERLESS,
        },
    }


def _payload() -> dict:
    now = time.time()
    if _MEMO["payload"] is None or (now - _MEMO["ts"]) > MEMO_TTL:
        _MEMO["payload"] = _build_payload()
        _MEMO["ts"] = now
    return _MEMO["payload"]


def _json(status: str, obj) -> tuple:
    body = json.dumps(obj).encode()
    return status, [("Content-Type", "application/json; charset=utf-8"),
                    ("Cache-Control", "no-store")], body


def app(environ, start_response):
    path = environ.get("PATH_INFO", "/") or "/"
    method = environ.get("REQUEST_METHOD", "GET").upper()

    if method not in ("GET", "HEAD"):
        status, headers, body = _json("405 Method Not Allowed",
                                      {"error": "read-only surface: POST not accepted"})
        start_response(status, headers)
        return [b"" if method == "HEAD" else body]

    try:
        if path == "/api/health":
            from omega_synapse import __version__
            status, headers, body = _json("200 OK", {
                "status": "HEALTHY", "mode": "read-only", "live_gate": "NO",
                "position_cap": 0, "execution_path": "ABSENT",
                "version": __version__,
                "runtime": "vercel-serverless" if SERVERLESS else "local",
            })
        elif path == "/api/telemetry":
            from omega_synapse import __version__, telemetry
            from omega_synapse.telemetry_sink import probe_sink
            reg = telemetry.assert_registry()
            sink = probe_sink()
            status, headers, body = _json("200 OK", {
                "version": __version__,
                "registry_total": reg.get("total"),
                "registry_ok": reg.get("ok"),
                "series_exported": sink.get("series_exported"),
                "export_claimed": sink.get("export_claimed"),
                "sink": sink,
                "position_cap": 0,
                "live_gate": "NO",
                "execution_path": "ABSENT",
            })
        elif path == "/api/p1":
            from omega_synapse.p1_ranker import observed_queue
            from omega_synapse.solana_geyser import GeyserListener
            status, headers, body = _json("200 OK", observed_queue(
                geyser_status=GeyserListener.from_env().start()))
        elif path in ("/", "/index.html", "/dashboard"):
            payload = _payload()
            if "error" in payload:
                status, headers, body = _json("503 Service Unavailable", payload)
            else:
                body = payload["html"].encode()
                status = "200 OK"
                headers = [("Content-Type", "text/html; charset=utf-8"),
                           ("Cache-Control", "no-store")]
        elif path == "/api/results":
            payload = _payload()
            status, headers, body = _json("200 OK",
                                          payload.get("results", payload))
        elif path == "/api/validation":
            cands = [os.path.join(ROOT, "validation.json"),
                     os.path.join(ROOT, "omega_synapse", "validation.json")]
            existing = [p for p in cands if os.path.exists(p)]
            if existing:
                vp = max(existing, key=os.path.getmtime)
                with open(vp, "rb") as f:
                    body = f.read()
                status, headers = "200 OK", [("Content-Type", "application/json")]
            else:
                status, headers, body = _json("404 Not Found", {"error": "validation.json absent"})
        else:
            status, headers, body = _json("404 Not Found", {
                "error": "not found",
                "routes": ["/", "/api/results", "/api/validation", "/api/health",
                           "/api/telemetry", "/api/p1"]})
    except Exception as e:                                   # noqa: BLE001
        status, headers, body = _json("500 Internal Server Error", {
            "error": f"{type(e).__name__}: {e}",
            "trace": traceback.format_exc(limit=4)})

    start_response(status, headers + [("Content-Length", str(len(body)))])
    return [b"" if method == "HEAD" else body]


# Vercel's Python runtime accepts `app` (WSGI) directly.
handler = app
