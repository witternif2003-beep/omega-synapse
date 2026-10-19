# OMEGA-SYNAPSE 1.0

**Read-only, paper-only statistical screener.** No live trading, no wallet, no
order construction, no signing, no bundle submission, no execution path.

`position_cap` is `0` on every return path, including a passing verdict — asserted
in code, not promised in prose.

**Live:** https://omega-synapse-repo.vercel.app · **Source:** https://github.com/witternif2003-beep/omega-synapse

Version 1.0.1. The designated Solana Pulse URL is not an OTLP receiver. `/api/telemetry` reports the measured probe. It does not claim the sink is wired.

---

## What it does

Ingests public Kraken OHLC data, applies a falsification-first statistical gate,
and renders a provenance dashboard. Every number on the page is computed from
observed data at request time. There are no literal placeholders, no hardcoded
PnL, and no synthetic fallback: when data is unavailable the UI says
`INSUFFICIENT_DATA`.

## Gate order (enforced by construction, not by comment)

```
Security -> MinTRL -> PBO/CSCV -> DSR -> SPA -> Haircut
```

* **SPA is the gate.** Hansen (2005) stationary bootstrap, studentized with a
  Bartlett-kernel HAC variance, p < 0.05 required.
* **PSR / DSR / PBO / MinTRL are diagnostics.** They inform, they do not certify.
* **Negative controls gate too.** A pure-noise universe must be refused; a
  planted-foresight universe must be detected. Both are tested.
* **CSCV is purged and embargoed.** The upstream suite's CSCV is not
  leakage-aware, so `ffs_engine.purged_cscv` wraps it rather than inheriting a
  claim it doesn't earn.

## Data provenance (no exceptions)

| Label | Meaning |
|---|---|
| `LIVE` | fetched from `api.kraken.com` this run |
| `CACHE` | served from SQLite, age <= 6 h |
| `STALE` | served from SQLite, network failed, age > 6 h |
| `INSUFFICIENT_DATA` | nothing usable — caller must treat as no data |
| `BLOCKED_ON_CREDENTIALS` | Geyser transport needs endpoint + token |

Synthetic series are never generated. `synthetic_data_used == 0` is structural:
no generator exists in the ingest or render path.

## Layout

```
api/index.py                 Vercel serverless entry (WSGI, stdlib only)
omega_suite.py               statistical suite v1.1.1 (PSR/DSR/PBO/MinTRL/haircut)
omega_synapse/
  spa.py                     Hansen SPA + White Reality Check
  ffs_engine.py              ordered gate, purged CSCV, negative controls
  kraken_ohlc_fetcher.py     paginated, throttled, cached, provenance-labelled
  security_gate.py           mint/freeze authority, Token-2022, top-10 concentration
  p1_ranker.py               4 hardcoded criteria, no override, no imputation
  telemetry.py               7,000 metric families, cardinality-bounded
  dashboard.py               renders HTML; zero literal fallbacks
  run_screener.py            CLI batch run -> results.json + dashboard.html
  validate_omega_synapse.py  13-item validation checklist
vercel.json                  serverless routing
requirements.txt             numpy only
```

## Run locally

```bash
pip install -r requirements.txt
python3 -m omega_synapse.validate_omega_synapse   # 10 PASS / 1 CORRECTED / 1 UNAVAILABLE / 1 BLOCKED
python3 -m omega_synapse.run_screener             # -> results.json, dashboard.html
python3 -m omega_synapse.server                   # http://localhost:8080
```

## Routes

| Route | Returns |
|---|---|
| `/` | provenance dashboard (HTML) |
| `/api/results` | full JSON: SPA, verdicts, provenance, telemetry |
| `/api/validation` | last validation checklist |
| `/api/health` | `{"live_gate":"NO","position_cap":0,"execution_path":"ABSENT","version":"1.0.1"}` |
| `/api/telemetry` | measured OTLP sink probe; not a claim that traces were accepted |
| `/api/p1` | observed queue only; unmeasured template is not rendered |
| `POST *` | `405` — read-only surface |

## Validation status

```
PASS 12 · CORRECTED 2 · UNAVAILABLE 2 · BLOCKED 1 · FAIL 0
```

Measured by `python3 -m omega_synapse.validate_omega_synapse` on 2026-10-19.

* **CORRECTED** — the spec's "null simulation → DSR ≈ 0" is mis-specified. DSR is
  a probability in [0,1]; its noise expectation is <= 0.5 with the gate refusing.
* **CORRECTED** — the 20-row P1 sheet (`$X`, `0.00`, `422`, `0.24`, `PENDING_GEYSER`)
  is not data. `/api/p1` returns 0 observed rows.
* **UNAVAILABLE** — "fetch 1,440 daily candles" is impossible on SOLUSD. Kraken
  caps OHLC at 721 bars and this pair's history starts 2024-10-29. Reported, not padded.
* **UNAVAILABLE** — `instrumentation.ts` is not loaded by the Python WSGI runtime.
* **BLOCKED** — Geyser p99 < 5 ms is unmeasurable without a Yellowstone
  endpoint + token. The decoder is unit-tested; the transport is not claimed.
* **SINK** — `POST https://dist-kdwedath.devinapps.com/v1/traces` measured
  `405 MethodNotAllowed`. Status is `SINK_REJECTED`, not wired.

## Boundary

There is no code in this repository that can place an order, sign a message,
submit a bundle, or reference a wallet balance. This is verifiable:

```bash
grep -rniE "send_transaction|signTransaction|sendBundle|keypair|secret_key" . --include=*.py
# no matches
```

## License

MIT. Provided as-is, with no warranty and no investment advice.
