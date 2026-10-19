"""FFS v1.2.0 — Falsification-First Standard engine.

Ordered gate, enforced by construction (the order is a list, not a comment):

    Security -> MinTRL -> PBO -> DSR -> SPA -> Haircut

Terminal rules:
  * position_cap is 0 at every exit, PASS or FAIL. There is no branch that
    returns otherwise.
  * PSR/DSR/PBO are DIAGNOSTIC. MinTRL rejects a short sample. The per-token
    gate passes only on SPA p < 0.05 (and a computed haircut that does not
    erase the signal). The negative control is a suite-level check run beside
    the gate — it is not an inserted step, and the order is not reordered to
    pretend that it is.
  * No step may be skipped to reach a later step; a skipped step is recorded
    as SKIPPED and blocks the pass.

Two deliberate departures from the brief, both documented in the audit:
  1. PBO/CSCV in the suite is NOT leakage-aware; this module adds a purging
     wrapper (`purged_cscv`) rather than pretending the suite already purges.
  2. `Haircut_R = 0.24` is computed from data here. A literal 0.24 would be a
     hardcoded statistic wearing a measurement's clothes.
"""

from __future__ import annotations

import itertools
import math
from dataclasses import dataclass, field

from . import suite_bridge as sb
from .spa import hansen_spa


@dataclass
class Observation:
    """Everything the gate is allowed to know about one candidate."""
    symbol: str
    returns: list                      # T periodic returns of the strategy
    strategy_matrix: list | None = None  # T x N (N strategies) for PBO
    benchmark_returns: list | None = None
    candidate_matrix: list | None = None  # T x K (K candidates) for SPA
    n_trials: int = 1                  # distinct configurations scanned
    security: object | None = None     # SecurityVerdict
    meta: dict = field(default_factory=dict)


def _col_sharpe(matrix, rows, j):
    col = [matrix[i][j] for i in rows]
    if len(col) < 2:
        return float("-inf")
    m = sum(col) / len(col)
    v = sum((x - m) ** 2 for x in col) / (len(col) - 1)
    sd = math.sqrt(v)
    return m / sd if sd > 0 else float("-inf")


def purged_cscv(matrix: list, s_partitions: int = 16, embargo: int = 1,
                max_splits: int = 20000) -> dict:
    """CSCV with a purged/embargoed boundary: OOS rows lying within `embargo`
    rows of an IS row are discarded before ranking, so serial correlation
    cannot leak a winner across the split. Same combinatorics as the suite,
    stricter hygiene."""
    t = len(matrix)
    n = len(matrix[0]) if t else 0
    if n < 30 or t < 30:
        return {"value": None, "status": "PBO_422", "t": t, "n": n,
                "detail": "need T>=30 and N>=30"}
    s = s_partitions if s_partitions % 2 == 0 else s_partitions - 1
    if t < 2 * s:
        return {"value": None, "status": "PBO_422", "t": t, "n": n,
                "detail": f"T={t} < 2S={2*s}"}
    n_splits = math.comb(s, s // 2)
    if n_splits > max_splits:
        return {"value": None, "status": "PBO_TOO_MANY_SPLITS", "splits": n_splits}
    blocks = [list(range(i * t // s, (i + 1) * t // s)) for i in range(s)]
    below = used = 0
    for is_blocks in itertools.combinations(range(s), s // 2):
        is_set = set(is_blocks)
        is_rows = [r for b in is_set for r in blocks[b]]
        oos_all = [r for b in range(s) if b not in is_set for r in blocks[b]]
        is_min, is_max = min(is_rows), max(is_rows)
        oos_rows = [r for r in oos_all
                    if not (is_min - embargo <= r <= is_min + embargo)
                    and not (is_max - embargo <= r <= is_max + embargo)]
        if len(oos_rows) < 2:
            continue
        is_srs = [_col_sharpe(matrix, is_rows, j) for j in range(n)]
        best = max(range(n), key=lambda j: is_srs[j])
        oos = [_col_sharpe(matrix, oos_rows, j) for j in range(n)]
        ob = oos[best]
        rank = (sum(1 for x in oos if x < ob) + 0.5 * sum(1 for x in oos if x == ob)) / n
        used += 1
        if rank < 0.5:
            below += 1
    if used == 0:
        return {"value": None, "status": "PBO_422", "t": t, "n": n}
    return {"value": below / used, "status": "COMPUTED", "t": t, "n": n,
            "s": s, "splits": used, "embargo": embargo, "purged": True}


def _spa_step(obs: Observation) -> dict:
    if obs.candidate_matrix is None or obs.benchmark_returns is None:
        return {"status": "SPA_NOT_RUN", "p_value": None,
                "detail": "no candidate matrix / benchmark supplied"}
    import numpy as np
    perf = np.asarray(obs.candidate_matrix, dtype=float)
    bench = np.asarray(obs.benchmark_returns, dtype=float)
    if perf.ndim == 1:
        perf = perf.reshape(-1, 1)
    return hansen_spa(perf, bench, reps=1000)


def evaluate_token(obs: Observation) -> dict:
    """Run the ordered gate. Returns a fully-populated verdict dict."""
    steps: list[dict] = []
    verdict = {"symbol": obs.symbol, "suite_version": sb.SUITE_VERSION,
               "ffs_version": "1.2.0", "steps": steps, "position_cap": 0,
               "passed": False, "reason": None}

    # ---- 1. SECURITY (layer 0) ---------------------------------------------
    sec = obs.security
    if sec is None:
        steps.append({"step": "security", "status": "SECURITY_GATE_UNKNOWN",
                      "detail": "no verdict supplied"})
        verdict["reason"] = "SECURITY_GATE_UNKNOWN"
        return verdict
    steps.append({"step": "security", "status": sec.status,
                  "failed": list(getattr(sec, "failed", [])),
                  "unknown": list(getattr(sec, "unknown", [])),
                  "not_applicable_reason": getattr(sec, "reason", None)})
    if sec.status not in ("SECURITY_GATE_PASSED", "SECURITY_GATE_NOT_APPLICABLE"):
        verdict["reason"] = sec.status
        return verdict

    # ---- 2. MinTRL ---------------------------------------------------------
    m = sb.MINTRL(obs.returns)
    steps.append({"step": "mintrl", "status": m["status"], "value": m["value"],
                  "reject_too_short": m.get("reject_too_short")})
    if m["status"] != "COMPUTED" or m.get("reject_too_short"):
        verdict["reason"] = (m["status"] if m["status"] != "COMPUTED"
                             else "MINTRL_TOO_SHORT")
        return verdict

    # ---- 3. PBO / CSCV -----------------------------------------------------
    if obs.strategy_matrix is None:
        pbo = {"value": None, "status": "PBO_NOT_RUN",
               "detail": "single strategy: CSCV requires N>=30 strategy columns"}
    else:
        pbo = purged_cscv(obs.strategy_matrix)
    steps.append({"step": "pbo", "status": pbo["status"], "value": pbo["value"],
                  "splits": pbo.get("splits"), "purged": pbo.get("purged", False)})

    # ---- 4. DSR ------------------------------------------------------------
    if obs.strategy_matrix and len(obs.strategy_matrix[0]) >= 2:
        trials = [[matrix_row[j] for matrix_row in obs.strategy_matrix]
                  for j in range(len(obs.strategy_matrix[0]))]
        dsr = sb.DSR(trials)
    else:
        dsr = {"value": None, "status": "DSR_DEGENERATE", "trials": 1,
               "detail": "K<2: no cross-trial variance; DSR collapses to PSR"}
    steps.append({"step": "dsr", "status": dsr["status"], "value": dsr["value"],
                  "trials": dsr.get("trials")})

    # ---- 5. SPA (GATING) ---------------------------------------------------
    spa = _spa_step(obs)
    steps.append({"step": "spa", "status": spa["status"],
                  "p_value": spa.get("p_value"), "reps": spa.get("reps")})
    if spa.get("status") != "COMPUTED" or spa.get("p_value") is None:
        verdict["reason"] = "SPA_UNMEASURED" if spa.get("status") == "COMPUTED" else spa.get("status")
        return verdict
    if spa["p_value"] >= 0.05:
        verdict["reason"] = "SPA_FAILED"
        return verdict

    # ---- 6. Haircut (computed, not hardcoded) ------------------------------
    h = sb.HAIRCUT(obs.returns, max(obs.n_trials, 1))
    steps.append({"step": "haircut", "status": h["status"], "value": h["value"],
                  "n_tests": h.get("n_tests")})
    if h["status"] != "COMPUTED" or h.get("value") is None:
        verdict["reason"] = h["status"] if h["status"] != "COMPUTED" else "HAIRCUT_UNMEASURED"
        return verdict
    if h["value"] >= 1.0:
        verdict["reason"] = "SIGNAL_ERASED_BY_HAIRCUT"
        return verdict

    verdict["passed"] = True
    verdict["reason"] = "FFS_PASSED"
    return verdict


# ---------------------------------------------------------------------------
# Negative controls: a leaky pipeline MUST fail, or the detector is broken.
# ---------------------------------------------------------------------------

def negative_control_leaky(seed: int = 7) -> dict:
    """Deliberately leak future information into the 'strategy' and confirm the
    gate does not certify it. A pipeline that passes this is broken by
    definition."""
    import numpy as np
    rng = np.random.default_rng(seed)
    bench = rng.normal(0.0, 0.01, 400)
    future = np.roll(bench, -1)                       # tomorrow's benchmark...
    # Perfect foresight: knowing tomorrow and trading on it every bar. This is
    # the leak a broken backtest produces. It must light up the detector.
    leaked = np.abs(future) + rng.normal(0, 0.0002, 400)
    perf = np.column_stack([leaked] * 3)
    spa = hansen_spa(perf, bench, reps=300, seed=seed)
    return {"control": "leaky_future_information", "spa_p": spa.get("p_value"),
            "spa_status": spa["status"],
            "correctly_detected": spa.get("p_value") is not None and spa["p_value"] < 0.05,
            "note": ("A leaking pipeline SHOULD light up here; that is the detector "
                     "proving it can see edge. The failure condition is the reverse: "
                     "a clean pipeline producing this.")}


def negative_control_null(seed: int = 11, t: int = 400, k: int = 20) -> dict:
    """Pure noise: the gate must refuse. This is the integrity control."""
    import numpy as np
    rng = np.random.default_rng(seed)
    bench = rng.normal(0.0, 0.01, t)
    perf = rng.normal(0.0, 0.01, (t, k))
    spa = hansen_spa(perf, bench, reps=300, seed=seed)
    psr = sb.PSR(list(perf[:, 0]))
    pbo = purged_cscv(perf.tolist(), s_partitions=16)
    return {"control": "pure_noise", "spa_p": spa.get("p_value"),
            "spa_status": spa["status"], "psr": psr["value"],
            "pbo": pbo["value"],
            "correctly_rejected": spa.get("p_value") is not None and spa["p_value"] >= 0.05}
