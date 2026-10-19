"""OMEGA-SYNAPSE 1.0 — end-to-end paper run.

Produces: results.json, dashboard.html, and an audit-chain record.
Nothing here can place an order, sign anything, or touch a wallet.
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from omega_synapse import dashboard, suite_bridge as sb, telemetry
from omega_synapse import __version__
from omega_synapse.ffs_engine import Observation, evaluate_token, negative_control_null
from omega_synapse.kraken_ohlc_fetcher import fetch_all
from omega_synapse.p1_ranker import observed_queue
from omega_synapse.security_gate import SecurityVerdict
from omega_synapse.solana_geyser import GeyserListener
from omega_synapse.spa import hansen_spa
from omega_synapse.telemetry_sink import probe_sink

BENCH = "XBTUSD"
HERE = os.path.dirname(os.path.abspath(__file__))


def align(series: dict, bench: str):
    """Trim all return series to a common length. No padding, no interpolation."""
    rets = {k: v.returns() for k, v in series.items() if v.returns()}
    if bench not in rets or len(rets) < 2:
        return None, None, None
    n = min(len(r) for r in rets.values())
    keys = sorted(rets)
    mat = np.column_stack([rets[k][-n:] for k in keys])
    bi = keys.index(bench)
    return keys, mat, bi, n


def main() -> int:
    print("[OMEGA-SYNAPSE] paper run — order path: absent by construction")

    series = fetch_all()
    provenance = [s.provenance() for s in series.values()]

    geo = GeyserListener.from_env()
    geo_status = geo.start()
    print(f"[geyser] {geo_status['status']}")

    keys, mat, bi, n = align(series, BENCH)
    if mat is None:
        print("[abort] insufficient aligned series; refusing to proceed")
        return 2

    bench = mat[:, bi]
    cand = np.delete(mat, bi, axis=1)
    cand_keys = [k for i, k in enumerate(keys) if i != bi]

    spa = hansen_spa(cand, bench, reps=1000)

    verdicts = []
    for j, k in enumerate(cand_keys):
        obs = Observation(
            symbol=k,
            returns=list(cand[:, j]),
            strategy_matrix=None,        # 1 strategy -> CSCV is not applicable
            benchmark_returns=list(bench),
            candidate_matrix=cand,
            n_trials=len(cand_keys) * 2,  # pairs x direction variants scanned
            security=SecurityVerdict.not_applicable(
                k, "CEX price series: no mint authority or holder set exists to inspect"),
        )
        verdicts.append(evaluate_token(obs))

    nc = negative_control_null()

    tel = telemetry.assert_registry()
    tel_ok = telemetry.init_otel()
    sink = tel_ok.get("probe") or probe_sink()
    p1 = observed_queue(geyser_status=geo_status)
    tel_status = dict(tel)
    tel_status["otel"] = tel_ok["status"]
    tel_status["sdk"] = tel_ok.get("sdk")
    tel_status["sink"] = sink
    tel_status["p1"] = p1
    tel_status["suite_version"] = sb.SUITE_VERSION
    tel_status["version"] = __version__
    tel_status["synthetic_data_used"] = 0

    out = {
        "suite_version": sb.SUITE_VERSION,
        "bars_aligned": n,
        "benchmark": BENCH,
        "spa": spa,
        "negative_control": nc,
        "provenance": provenance,
        "verdicts": verdicts,
        "telemetry": tel,
        "geyser": geo_status,
        "sink": sink,
        "p1": p1,
        "version": __version__,
        "position_cap": 0,
        "live_gate": "NO",
        "execution_path": "ABSENT",
        "synthetic_data_used": 0,
    }
    res_path = os.path.join(HERE, "results.json")
    with open(res_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, default=str)

    dash = dashboard.render(provenance, verdicts, tel_status, spa,
                            path=os.path.join(HERE, "dashboard.html"),
                            sink=sink, p1=p1)

    try:
        rec = sb.AUDIT_APPEND(
            inputs={"run": "omega_synapse_paper", "bars": n, "bench": BENCH,
                    "pairs": keys},
            outputs={"spa_p": spa.get("p_value"), "verdicts": len(verdicts),
                     "passed": sum(1 for v in verdicts if v["passed"]),
                     "position_cap": 0, "synthetic_data_used": 0})
    except Exception as e:                      # noqa: BLE001
        rec = {"error": f"{type(e).__name__}: {e}"}

    # ---- terminal report ----------------------------------------------------
    print(f"[data] {len(provenance)} series, {n} aligned bars, benchmark {BENCH}")
    for p in provenance:
        print(f"   {p['symbol']:<8} {p['bars']:>4} bars  {p['source']}")
    print(f"[spa] p={spa.get('p_value')} stat={spa.get('stat')} reps={spa.get('reps')} "
          f"k={spa.get('k')} -> {'REJECT H0' if (spa.get('p_value') or 1) < 0.05 else 'DO NOT REJECT H0'}")
    print(f"[negctl] pure-noise spa_p={nc['spa_p']} correctly_rejected={nc['correctly_rejected']}")
    for v in verdicts:
        print(f"[gate] {v['symbol']:<8} {v['reason']:<22} position_cap={v['position_cap']}")
    print(f"[telemetry] {tel['total']} metrics ok={tel['ok']} otel={tel_ok['status']} "
          f"http={sink.get('http_status')} exported={sink.get('series_exported')}")
    print(f"[p1] status={p1['status']} observed={p1['observed_candidates']} "
          f"position_cap={p1['position_cap']} template={p1['template_adjudication']}")
    print(f"[audit] {'error: ' + rec['error'] if 'error' in rec else 'appended'}")
    print(f"[out] {res_path}")
    print(f"[out] {dash}")
    print("[final] position_cap=0 | live_gate=NO | no order path exists in this package")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
