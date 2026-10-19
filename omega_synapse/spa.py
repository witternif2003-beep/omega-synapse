"""Hansen (2005) Superior Predictive Ability test — stationary bootstrap.

Implemented from the paper's definitions, not a wrapper. Studentization uses a
Bartlett-kernel HAC long-run variance; the bootstrap is Politis-Romano
stationary (geometric block lengths). Both the "consistent" and "lower"
recenterings are provided; "consistent" is the default because it is the only
one that is asymptotically valid under the null with poor-and-good models
mixed, which is exactly our screening case.

Contract: returns a LOSS-DIFFERENTIAL interpretation internally. Callers pass
PERFORMANCE (higher = better); we convert d_{t,k} = perf_{k,t} - perf_{0,t} and
test H0: max_k E[d_k] <= 0 (no strategy beats the benchmark).
"""

from __future__ import annotations

import math

import numpy as np


def _hac_var(x: np.ndarray, lag: int | None = None, time_axis: int = 0) -> float:
    """Bartlett-kernel HAC long-run variance, summed over the TIME axis.
    `time_axis` says where time lives in the input; time is moved last
    internally so the same code serves (T,K) and (c,T,K) inputs."""
    x = np.moveaxis(np.asarray(x, dtype=float), time_axis, -1)
    n = x.shape[-1]
    if n < 2:
        return 0.0
    if lag is None:
        lag = int(math.floor(4.0 * (n / 100.0) ** (2.0 / 9.0)))
    xc = x - x.mean(axis=-1, keepdims=True)
    g0 = np.sum(xc * xc, axis=-1) / n
    total = g0.copy()
    for l in range(1, max(lag, 0) + 1):
        w = 1.0 - l / (lag + 1.0)
        g = np.sum(xc[..., l:] * xc[..., :-l], axis=-1) / n
        total = total + 2.0 * w * g
    return np.maximum(total, 1e-18)


def _stationary_bootstrap_indices(rng, n: int, reps: int, q: float) -> np.ndarray:
    """Politis-Romano stationary bootstrap index matrix (reps x n)."""
    p = 1.0 / q if q > 1 else 1.0
    idx = np.empty((reps, n), dtype=np.int64)
    for b in range(reps):
        i = rng.integers(0, n)
        for t in range(n):
            if t > 0 and rng.random() >= p:
                i = (i + 1) % n
            else:
                i = rng.integers(0, n)
            idx[b, t] = i
    return idx


def hansen_spa(perf: np.ndarray, bench: np.ndarray, reps: int = 1000,
               q: float | None = None, seed: int = 20261019,
               recenter: str = "consistent") -> dict:
    """perf: (T, K) candidate performance; bench: (T,) benchmark performance.
    Returns p-values (consistent/lower/upper), test statistic, per-model
    studentized values and the set of models deemed 'good'."""
    perf = np.asarray(perf, dtype=float)
    bench = np.asarray(bench, dtype=float).reshape(-1)
    if perf.ndim == 1:
        perf = perf.reshape(-1, 1)
    t_len, k = perf.shape
    if t_len != bench.shape[0]:
        raise ValueError("perf/bench length mismatch")
    if t_len < 30:
        return {"p_value": None, "status": "SPA_INSUFFICIENT_OBS", "t": t_len, "k": k}
    if k < 1:
        return {"p_value": None, "status": "SPA_NO_CANDIDATES", "t": t_len, "k": k}

    d = perf - bench.reshape(-1, 1)
    d_bar = d.mean(axis=0)
    omega = np.sqrt(_hac_var(d, time_axis=0))
    t_stat = math.sqrt(t_len) * d_bar / omega
    observed = max(0.0, float(t_stat.max()))

    q = q if q is not None else max(2.0, round(t_len ** (1.0 / 3.0)))
    rng = np.random.default_rng(seed)
    idx = _stationary_bootstrap_indices(rng, t_len, reps, q)

    # recentering thresholds (Hansen 2005, eq. 12-14)
    thresh = -omega * math.sqrt(2.0 * math.log(math.log(max(t_len, 3))) / t_len)
    good = d_bar >= thresh
    if recenter == "lower":
        g = np.zeros(k)
    elif recenter == "upper":
        g = d_bar.copy()
    else:  # consistent
        g = np.where(good, d_bar, 0.0)

    boot_max = np.empty(reps)
    chunk = max(1, min(100, reps))
    for start in range(0, reps, chunk):
        stop = min(start + chunk, reps)
        ds = d[idx[start:stop]]                     # (c, T, K)
        dbar_s = ds.mean(axis=1)                    # (c, K)
        om_s = np.sqrt(_hac_var(ds, lag=int(math.floor(4.0 * (t_len / 100.0) ** (2.0 / 9.0))),
                                 time_axis=1))
        z = math.sqrt(t_len) * (dbar_s - g) / om_s
        boot_max[start:stop] = np.maximum(0.0, z.max(axis=1))
    p = float(np.mean(boot_max >= observed))

    return {"p_value": p, "status": "COMPUTED", "t": t_len, "k": k,
            "stat": observed, "reps": reps, "block_q": round(float(q), 4),
            "n_good_models": int(good.sum()), "recenter": recenter,
            "best_model": int(np.argmax(t_stat)),
            "t_stat": [round(float(x), 6) for x in t_stat],
            "seed": seed}


def reality_check(perf: np.ndarray, bench: np.ndarray, reps: int = 1000,
                  seed: int = 20261019) -> dict:
    """White's Reality Check = SPA with zero recentering for all models."""
    return hansen_spa(perf, bench, reps=reps, seed=seed, recenter="lower")
