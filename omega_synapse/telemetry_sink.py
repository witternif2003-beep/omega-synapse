"""OTLP sink probe. Measures the designated endpoint. Never invents acceptance.

The production runtime is Python WSGI. A Next.js `instrumentation.ts` is not
loaded here, and a rejected sink is not relabelled as wired.

Unmeasured metric series are not exported as zeros. A connectivity probe is
not a claim that 7,000 series were delivered.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

DESIGNATED_BASE = "https://dist-kdwedath.devinapps.com"
TRACES_PATH = "/v1/traces"
SERVICE_NAME = "omega-synapse"
_CACHE: dict = {"ts": 0.0, "result": None}
_TTL = 300.0
_LEDGER: list = []


def traces_url(endpoint: str | None = None) -> str:
    raw = (endpoint or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or DESIGNATED_BASE).strip()
    raw = raw.rstrip("/")
    if raw.endswith(TRACES_PATH):
        return raw
    return raw + TRACES_PATH


def _classify(status: int | None, content_type: str, body: bytes) -> dict:
    ctype = (content_type or "").split(";")[0].strip().lower()
    head = body[:180].lstrip()
    html = ctype.startswith("text/html") or head.startswith(b"<!doctype") or head.startswith(b"<html")
    xml_denied = b"MethodNotAllowed" in body or b"not allowed" in body.lower()
    accepted = status in (200, 202) and not html and not xml_denied and ctype not in ("text/html", "application/xml", "text/xml")
    if accepted:
        label = "SINK_ACCEPTED"
    elif status == 405 or xml_denied:
        label = "SINK_REJECTED"
    elif status == 404:
        label = "SINK_NOT_FOUND"
    elif html and status is not None:
        label = "SINK_REJECTED"
    elif status is None:
        label = "SINK_UNREACHABLE"
    else:
        label = "SINK_REJECTED"
    return {
        "status": label,
        "accepted": accepted,
        "html_body": html,
        "method_not_allowed": bool(xml_denied or status == 405),
    }


def probe_sink(endpoint: str | None = None, *, timeout: float = 8.0, force: bool = False) -> dict:
    """POST one connectivity span. Cache the measurement. Do not send secrets."""
    now = time.time()
    if not force and _CACHE["result"] is not None and (now - _CACHE["ts"]) < _TTL:
        cached = dict(_CACHE["result"])
        cached["cache"] = "CACHE"
        return cached

    url = traces_url(endpoint)
    payload = {
        "resourceSpans": [{
            "resource": {"attributes": [
                {"key": "service.name", "value": {"stringValue": SERVICE_NAME}},
                {"key": "position_cap", "value": {"intValue": "0"}},
                {"key": "probe.kind", "value": {"stringValue": "connectivity_only"}},
            ]},
            "scopeSpans": [{"spans": [{
                "traceId": "00112233445566778899aabbccddeeff",
                "spanId": "0011223344556677",
                "name": "sink_probe",
                "startTimeUnixNano": str(int(now * 1e9)),
                "endTimeUnixNano": str(int(now * 1e9)),
                "attributes": [
                    {"key": "series_exported", "value": {"intValue": "0"}},
                ],
            }]}],
        }]
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "omega-synapse-sink-probe/1.0",
        },
    )
    http_status = None
    content_type = ""
    body = b""
    error = None
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            http_status = resp.status
            content_type = resp.headers.get("content-type", "")
            body = resp.read(400)
    except urllib.error.HTTPError as e:
        http_status = e.code
        content_type = e.headers.get("content-type", "") if e.headers else ""
        try:
            body = e.read(400)
        except Exception:  # noqa: BLE001
            body = b""
    except Exception as e:  # noqa: BLE001
        error = f"{type(e).__name__}: {e}"

    klass = _classify(http_status, content_type, body)
    result = {
        "measured": True,
        "cache": "LIVE",
        "designated_base": DESIGNATED_BASE,
        "url": url,
        "method": "POST",
        "http_status": http_status,
        "content_type": content_type.split(";")[0] if content_type else None,
        "body_prefix": body[:160].decode("utf-8", "replace"),
        "error": error,
        "status": klass["status"],
        "accepted": klass["accepted"],
        "html_body": klass["html_body"],
        "method_not_allowed": klass["method_not_allowed"],
        "series_exported": 0,
        "export_claimed": False,
        "zero_fill": False,
        "sdk": "ABSENT",
        "instrumentation_ts": "NOT_LOADED",
        "runtime": "python-wsgi",
        "position_cap": 0,
        "fallback": {
            "type": "INPROCESS_LEDGER",
            "durable": False,
            "deployed_collector": False,
            "reason": (
                "Designated URL is not an OTLP receiver. A public POST collector "
                "is not added to this GET-only surface. Serverless cannot host a "
                "long-lived collector. No ephemeral sandbox URL is advertised."
            ),
        },
        "probed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
    }
    try:
        import importlib.util
        if importlib.util.find_spec("opentelemetry") is not None:
            result["sdk"] = "PRESENT_NOT_EXPORTING"
    except Exception:  # noqa: BLE001
        pass
    _LEDGER.append({
        "probed_at": result["probed_at"],
        "url": url,
        "http_status": http_status,
        "status": result["status"],
        "series_exported": 0,
    })
    del _LEDGER[:-20]
    result["ledger_len"] = len(_LEDGER)
    _CACHE["ts"] = now
    _CACHE["result"] = result
    return dict(result)


def ledger() -> list:
    return list(_LEDGER)
