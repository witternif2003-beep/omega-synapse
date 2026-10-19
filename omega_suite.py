"""OMEGA statistical validation suite — self-contained institutional standard.

Version: 1.1.1 (v1.1.0 + N<30 haircut guard; all prior default paths unchanged).
Suite: PSR / DSR / PBO-CSCV / MinTRL / Harvey-Liu haircut + SHA-256 audit chain.
Zero third-party dependencies (stdlib only). Deterministic: no RNG anywhere.

Semantics: Bailey & Lopez de Prado PSR/DSR; Lopez de Prado PBO via CSCV;
Harvey-Liu-Zhu multiple-testing haircut. Directional policies per Omega spec:
  N<30 -> NULL/REJECT | K=1 -> DSR_DEGENERATE | SR<=benchmark -> MinTRL=+inf,
  haircut UNDEFINED | PBO needs T>=30, N>=30 (strategies), T>=2S else PBO_422 |
  PSR capped at 0.95.
Input contract: a returns SERIES is a list of T periodic returns (time-ordered).
A TRIAL MATRIX is a list of K series. A PBO MATRIX is T rows x N cols
(rows = time, cols = strategies). Test fixtures are deterministic LCG vectors
used to validate math only — never presented as market data.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import math
import os
from datetime import datetime, timezone
from statistics import NormalDist, mean, stdev

VERSION = "1.1.1"
EULER_GAMMA = 0.5772156649015329  # Euler-Mascheroni, DSR null-quantile weight
MIN_N = 30
PSR_CAP = 0.95
MAX_SPLITS = 20000  # CSCV combinatorial guardrail
AUDIT_DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "omega_audit.log")

_STD = NormalDist()


def _phi(x: float) -> float:
    return _STD.cdf(x)


def _phi_inv(p: float) -> float:
    return _STD.inv_cdf(min(max(p, 1e-15), 1.0 - 1e-15))


def _jsafe(v):
    """Make floats JSON-strict (no NaN/Infinity tokens)."""
    if isinstance(v, float):
        if math.isnan(v):
            return "NaN"
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        return v
    if isinstance(v, dict):
        return {k: _jsafe(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsafe(x) for x in v]
    return v


def _moments(xs):
    """Sample mean/sd (ddof=1), skewness, Pearson kurtosis. Constant-safe."""
    xs = list(xs)
    n = len(xs)
    m = mean(xs) if n else 0.0
    if n < 2:
        return m, 0.0, 0.0, 3.0
    sd = stdev(xs)
    if sd == 0:
        return m, 0.0, 0.0, 3.0
    g3 = sum((x - m) ** 3 for x in xs) / n / sd ** 3
    g4 = sum((x - m) ** 4 for x in xs) / n / sd ** 4
    return m, sd, g3, g4


def sharpe(xs) -> float:
    m, sd, _, _ = _moments(xs)
    return m / sd if sd > 0 else 0.0


def compute_psr(xs, benchmark: float = 0.0) -> dict:
    """Probabilistic Sharpe Ratio P(SR > benchmark). Capped at 0.95 per spec."""
    xs = list(xs)
    n = len(xs)
    if n < MIN_N:
        return {"value": None, "status": "PSR_INSUFFICIENT_OBS", "n": n}
    sr = sharpe(xs)
    _, _, g3, g4 = _moments(xs)
    inner = 1 - g3 * sr + ((g4 - 1) / 4) * sr ** 2
    if not math.isfinite(inner) or inner <= 0:
        return {"value": None, "status": "PSR_DEGENERATE", "n": n, "sr": sr}
    z = (sr - benchmark) * math.sqrt(n - 1) / math.sqrt(inner)
    return {"value": min(_phi(z), PSR_CAP), "status": "COMPUTED",
            "n": n, "sr": sr, "skew": g3, "kurtosis": g4, "benchmark": benchmark}


def expected_max_sharpe(var_sr: float, k: int) -> float:
    """SR* under the null across K trials (Bailey & Lopez de Prado 2014)."""
    if k < 2 or var_sr <= 0:
        return 0.0
    g = EULER_GAMMA
    return math.sqrt(var_sr) * ((1 - g) * _phi_inv(1 - 1.0 / k)
                                + g * _phi_inv(1 - 1.0 / (k * math.e)))


def compute_dsr(trials, selected: int | None = None, var_sr: float | None = None) -> dict:
    """Deflated Sharpe Ratio = PSR(SR*). trials = K return series.
    var_sr override accepts an externally estimated cross-trial variance
    (purgedcv-style contract); default computes it from the trials."""
    trials = [list(t) for t in trials]
    k = len(trials)
    if k < 2:
        return {"value": None, "status": "DSR_DEGENERATE", "trials": k,
                "detail": "K<2 collapses SR* to 0; use PSR"}
    srs = [sharpe(t) for t in trials]
    if selected is None:
        selected = max(range(k), key=lambda i: srs[i])
    if var_sr is None:
        v = sum((s - mean(srs)) ** 2 for s in srs) / (k - 1) if k > 1 else 0.0
        src = "computed"
    else:
        v, src = float(var_sr), "provided"
    sr_star = expected_max_sharpe(v, k)
    psr = compute_psr(trials[selected], benchmark=sr_star)
    return {"value": psr["value"], "status": psr["status"], "trials": k,
            "selected": selected, "sr_star": sr_star, "var_sr": v,
            "var_sr_src": src, "selected_sr": srs[selected]}


def _col_sharpe(matrix, cols_rows, j: int) -> float:
    col = [matrix[i][j] for i in cols_rows]
    m = mean(col)
    if len(col) < 2:
        return float("-inf")
    sd = stdev(col)
    return m / sd if sd > 0 else float("-inf")


def compute_pbo(matrix, s_partitions: int = 16) -> dict:
    """PBO via full CSCV (all C(S,S/2) splits). matrix = T rows x N cols.
    Returns fraction of splits where the in-sample-optimal strategy ranks
    below the OOS median. Single-split heuristics are NOT CSCV and are refused
    by contract (use s_partitions>=2 real combinatorics or nothing)."""
    t = len(matrix)
    n = len(matrix[0]) if t else 0
    if n < MIN_N or t < MIN_N:
        return {"value": None, "status": "PBO_422", "t": t, "n": n,
                "detail": "need T>=30 and N>=30"}
    s = s_partitions if s_partitions % 2 == 0 else s_partitions - 1
    if s < 2 or t < 2 * s:
        return {"value": None, "status": "PBO_422", "t": t, "n": n,
                "detail": f"T={t} < 2S={2 * s}"}
    n_splits = math.comb(s, s // 2)
    if n_splits > MAX_SPLITS:
        return {"value": None, "status": "PBO_TOO_MANY_SPLITS",
                "splits": n_splits, "cap": MAX_SPLITS}
    blocks = [list(range(i * t // s, (i + 1) * t // s)) for i in range(s)]
    below = 0
    for is_blocks in itertools.combinations(range(s), s // 2):
        is_set = set(is_blocks)
        is_rows = [r for b in is_set for r in blocks[b]]
        oos_rows = [r for b in range(s) if b not in is_set for r in blocks[b]]
        is_srs = [_col_sharpe(matrix, is_rows, j) for j in range(n)]
        best = max(range(n), key=lambda j: is_srs[j])
        oos = [_col_sharpe(matrix, oos_rows, j) for j in range(n)]
        ob = oos[best]
        rank = (sum(1 for x in oos if x < ob)
                + 0.5 * sum(1 for x in oos if x == ob)) / n
        if rank < 0.5:
            below += 1
    return {"value": below / n_splits, "status": "COMPUTED",
            "t": t, "n": n, "s": s, "splits": n_splits}


def compute_mintrl(xs, benchmark: float = 0.0, alpha: float = 0.05) -> dict:
    """Min track record length for SR to differ from `benchmark` at 1-alpha.
    Pre-condition SR > benchmark enforced (else +inf). benchmark=0 default
    reproduces the classic form bit-identically."""
    xs = list(xs)
    n = len(xs)
    if n < MIN_N:
        return {"value": float("inf"), "status": "MINTRL_INSUFFICIENT_OBS",
                "n": n, "benchmark": benchmark}
    sr = sharpe(xs)
    if not sr > benchmark:
        return {"value": float("inf"), "status": "MINTRL_NON_POSITIVE_SR",
                "n": n, "sr": sr, "benchmark": benchmark}
    _, _, g3, g4 = _moments(xs)
    z = _phi_inv(1 - alpha)
    mtrl = 1 + (1 - g3 * sr + ((g4 - 1) / 4) * sr ** 2) * (z / (sr - benchmark)) ** 2
    return {"value": mtrl, "status": "COMPUTED", "n": n, "sr": sr,
            "benchmark": benchmark, "reject_too_short": bool(n < mtrl)}


def _t_to_p(t: float) -> float:
    return min(max(2 * (1 - _phi(abs(t))), 1e-15), 1.0)


def compute_haircut(xs, n_tests: int, method: str = "bonferroni") -> dict:
    """Percentage haircut (SR - SR_adj)/SR after multiple-testing adjustment."""
    xs = list(xs)
    t_len = len(xs)
    if t_len < MIN_N:
        return {"value": None, "status": "HAIRCUT_INSUFFICIENT_OBS",
                "n": t_len, "n_tests": n_tests}
    sr = sharpe(xs)
    if n_tests < 1 or sr <= 0:
        return {"value": None, "status": "HAIRCUT_UNDEFINED",
                "sr": sr, "n_tests": n_tests}
    p = _t_to_p(sr * math.sqrt(t_len))
    p_adj = min(p * n_tests, 1.0)  # Bonferroni; single-selected Holm == this bound
    t_adj = _phi_inv(1 - p_adj / 2)
    sr_adj = t_adj / math.sqrt(t_len)
    return {"value": (sr - sr_adj) / sr, "status": "COMPUTED", "sr": sr,
            "sr_adj": sr_adj, "p": p, "p_adj": p_adj, "n_tests": n_tests,
            "method": method}


def holm_adjust(p_values) -> list:
    """Holm step-down adjusted p-values (full vector)."""
    k = len(p_values)
    order = sorted(range(k), key=lambda i: p_values[i])
    adj = [0.0] * k
    running = 0.0
    for rank, idx in enumerate(order):
        running = max(running, min(p_values[idx] * (k - rank), 1.0))
        adj[idx] = running
    return adj


def _audit_tip(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        if lines:
            return json.loads(lines[-1]).get("hash", "GENESIS")
    except (OSError, ValueError):
        pass
    return "GENESIS"


def audit_append(inputs: dict, outputs: dict, path: str = AUDIT_DEFAULT) -> dict:
    record = {
        "version": VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "inputs_hash": hashlib.sha256(
            json.dumps(_jsafe(inputs), sort_keys=True).encode()).hexdigest(),
        "outputs": _jsafe(outputs),
        "prev_hash": _audit_tip(path),
    }
    record["hash"] = hashlib.sha256(
        json.dumps(record, sort_keys=True).encode()).hexdigest()
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
    return record


def audit_verify(path: str = AUDIT_DEFAULT) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            recs = [json.loads(ln) for ln in f if ln.strip()]
    except OSError:
        return {"ok": False, "records": 0, "detail": "log missing"}
    prev = "GENESIS"
    for r in recs:
        if r.get("prev_hash") != prev:
            return {"ok": False, "records": len(recs), "detail": "chain break"}
        body = {k: v for k, v in r.items() if k != "hash"}
        if hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest() != r.get("hash"):
            return {"ok": False, "records": len(recs), "detail": "hash mismatch"}
        prev = r["hash"]
    return {"ok": True, "records": len(recs), "tip": prev[:16]}


def check_resources(mem_floor_pct: float = 20.0, cpu_cap_pct: float = 80.0) -> dict:
    """Container-aware resource read. Thresholds documented; no side effects.
    NOTE: in containers /proc may reflect the host — treat as advisory."""
    mem_avail_pct, cpu_pct = None, None
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            mem = f.read()
        total = int([l for l in mem.split("\n") if "MemTotal" in l][0].split()[1])
        avail = int([l for l in mem.split("\n") if "MemAvailable" in l][0].split()[1])
        mem_avail_pct = round(avail / total * 100, 2)
    except (OSError, ValueError, IndexError, ZeroDivisionError):
        pass
    try:
        with open("/proc/loadavg", "r", encoding="utf-8") as f:
            load = float(f.read().split()[0])
        cpu_pct = round(load / (os.cpu_count() or 1) * 100, 2)
    except (OSError, ValueError, IndexError):
        pass
    if mem_avail_pct is None and cpu_pct is None:
        return {"status": "unknown", "detail": "/proc unreadable"}
    blocked = ((mem_avail_pct is not None and mem_avail_pct < mem_floor_pct)
               or (cpu_pct is not None and cpu_pct > cpu_cap_pct))
    return {"status": "block" if blocked else "allow",
            "mem_avail_pct": mem_avail_pct, "cpu_pct": cpu_pct,
            "mem_floor_pct": mem_floor_pct, "cpu_cap_pct": cpu_cap_pct}


def run_gate(returns, benchmark: float = 0.0, trials=None, matrix=None,
             alpha: float = 0.05, audit_path: str = AUDIT_DEFAULT) -> dict:
    """Full gate: PSR + MinTRL always; DSR iff trials; PBO iff matrix;
    haircut with K = #trials else 1. PASS requires EVERY computed component."""
    returns = list(returns)
    out: dict = {"version": VERSION, "n": len(returns)}
    reasons: list[str] = []
    if len(returns) < MIN_N:
        out.update({"overall": "REJECT",
                    "reason": "N < 30 (statistically_indistinguishable_from_noise)"})
        audit_append({"returns_n": len(returns)}, out, audit_path)
        return out
    out["psr"] = compute_psr(returns, benchmark)
    out["mintrl"] = compute_mintrl(returns, benchmark, alpha)
    k = 1
    if trials is not None:
        k = len(trials)
        out["dsr"] = compute_dsr(trials)
    if matrix is not None:
        out["pbo"] = compute_pbo(matrix)
    out["haircut"] = compute_haircut(returns, k)
    ok = True
    if out["psr"]["status"] != "COMPUTED" or out["psr"]["value"] < PSR_CAP:
        ok = False
        reasons.append(f"psr {out['psr']['status']}={out['psr']['value']}")
    if "dsr" in out and (out["dsr"]["status"] != "COMPUTED" or out["dsr"]["value"] < PSR_CAP):
        ok = False
        reasons.append(f"dsr {out['dsr']['status']}={out['dsr']['value']}")
    if "pbo" in out and (out["pbo"]["status"] != "COMPUTED" or out["pbo"]["value"] >= 0.5):
        ok = False
        reasons.append(f"pbo {out['pbo']['status']}={out['pbo']['value']}")
    if out["mintrl"]["status"] != "COMPUTED" or out["mintrl"].get("reject_too_short"):
        ok = False
        reasons.append(f"mintrl {out['mintrl']['status']}={out['mintrl']['value']}")
    if out["haircut"]["status"] != "COMPUTED" or out["haircut"]["value"] >= 1.0:
        ok = False
        reasons.append(f"haircut {out['haircut']['status']}={out['haircut']['value']}")
    out["overall"] = "PASS" if ok else "REJECT"
    if reasons:
        out["reasons"] = reasons
    audit_append({"returns_n": len(returns), "trials": k,
                  "matrix": bool(matrix is not None)}, out, audit_path)
    return out


if __name__ == "__main__":
    import sys as _sys
    req = json.loads(_sys.stdin.read() or "{}")
    if req.get("series"):
        print(json.dumps(_jsafe(run_gate(req["series"],
                                         trials=req.get("trials"),
                                         matrix=req.get("matrix")))))
    else:
        print(json.dumps({"omega_suite": VERSION, "status": "loaded",
                          "components": ["psr", "dsr", "pbo_cscv", "mintrl",
                                         "haircut", "audit_chain",
                                         "check_resources"]}))
