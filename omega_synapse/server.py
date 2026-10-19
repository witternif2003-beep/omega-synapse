"""OMEGA-SYNAPSE read-only web surface.

Serves the provenance dashboard and the last run's results over HTTP.
GET-only. No POST. No order path. Re-running the screener is a CLI action,
deliberately not an HTTP trigger, so nothing can be poked into trading.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PORT = int(os.environ.get("PORT", "8080"))


def _resolve(filename: str) -> str | None:
    """Artifacts may live beside the package (repo root) or inside it
    (CLI-generated). Look in both before declaring them missing."""
    for base in (HERE, ROOT):
        cand = os.path.join(base, filename)
        if os.path.exists(cand):
            return cand
    return None

ROUTES = {
    "/": ("dashboard.html", "text/html; charset=utf-8"),
    "/api/results": ("results.json", "application/json"),
    "/api/validation": ("validation.json", "application/json"),
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        # preview proxies embed this in an iframe; do not forbid framing
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head: bool = False):
        path = self.path.split("?")[0]

        if path == "/api/health":
            from omega_synapse import __version__
            payload = {"status": "HEALTHY", "mode": "read-only",
                       "live_gate": "NO", "position_cap": 0,
                       "execution_path": "ABSENT", "version": __version__}
            body = json.dumps(payload).encode()
            return self._send(200, body, "application/json")

        if path == "/api/telemetry":
            from omega_synapse import __version__, telemetry
            from omega_synapse.telemetry_sink import probe_sink
            reg = telemetry.assert_registry()
            sink = probe_sink()
            body = json.dumps({
                "version": __version__,
                "registry_total": reg.get("total"),
                "series_exported": sink.get("series_exported"),
                "export_claimed": False,
                "sink": sink,
                "position_cap": 0,
                "live_gate": "NO",
                "execution_path": "ABSENT",
            }).encode()
            return self._send(200, body, "application/json")

        if path == "/api/p1":
            from omega_synapse.p1_ranker import observed_queue
            from omega_synapse.solana_geyser import GeyserListener
            body = json.dumps(observed_queue(
                geyser_status=GeyserListener.from_env().start())).encode()
            return self._send(200, body, "application/json")

        target = ROUTES.get(path)
        if target is None:
            return self._send(404, b'{"error":"not found","routes":["/","/api/results","/api/validation","/api/health","/api/telemetry","/api/p1"]}',
                              "application/json")

        fn, ctype = target
        full = _resolve(fn)
        if full is None:
            return self._send(503, json.dumps(
                {"error": "not generated yet", "file": fn,
                 "fix": "python3 -m omega_synapse.run_screener"}).encode(),
                "application/json")
        with open(full, "rb") as f:
            body = f.read()
        if not head:
            self._send(200, body, ctype)
        else:
            self._send(200, b"", ctype)

    def do_POST(self):
        self._send(405, b'{"error":"read-only surface: POST not accepted"}',
                   "application/json")

    def log_message(self, fmt, *args):
        print("[http]", self.address_string(), fmt % args, flush=True)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[omega-synapse] listening on 0.0.0.0:{PORT} (read-only)", flush=True)
    srv.serve_forever()
