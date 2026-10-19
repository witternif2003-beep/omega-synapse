"""Kraken public OHLC ingestion — paginated, rate-limited, cached, labelled.

Provenance contract (no exceptions):
  LIVE              - fetched from api.kraken.com this run
  CACHE             - served from SQLite, age <= TTL (6h)
  STALE             - served from SQLite, age > TTL (network failed)
  INSUFFICIENT_DATA - nothing usable; caller must treat as no data
There is NO synthetic fallback. Ever.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone

OHLC_URL = "https://api.kraken.com/0/public/OHLC"
MAX_CANDLES_PER_CALL = 720
DEFAULT_TTL = 6 * 3600
MIN_INTERVAL_MS = 200  # documented guidance: 100-200 ms between calls


@dataclass
class Series:
    pair: str
    rows: list = field(default_factory=list)   # [[ts, o, h, l, c, vwap, vol, count], ...]
    source: str = "INSUFFICIENT_DATA"
    fetched_at: float = 0.0
    error: str | None = None

    @property
    def closes(self) -> list:
        return [float(r[4]) for r in self.rows]

    def returns(self) -> list:
        c = self.closes
        if len(c) < 2:
            return []
        return [(c[i] - c[i - 1]) / c[i - 1] for i in range(1, len(c))]

    def provenance(self) -> dict:
        return {"symbol": self.pair, "bars": len(self.rows),
                "last_bar": (datetime.fromtimestamp(int(self.rows[-1][0]), tz=timezone.utc)
                             .strftime("%Y-%m-%d") if self.rows else None),
                "source": self.source, "error": self.error}


class KrakenCache:
    def __init__(self, path: str = "kraken_cache.sqlite"):
        self.path = path
        with sqlite3.connect(self.path) as c:
            c.execute("""CREATE TABLE IF NOT EXISTS ohlc(
                         pair TEXT PRIMARY KEY, payload TEXT, fetched_at REAL)""")

    def get(self, pair: str) -> tuple[list, float, bool] | None:
        with sqlite3.connect(self.path) as c:
            row = c.execute("SELECT payload, fetched_at FROM ohlc WHERE pair=?",
                            (pair,)).fetchone()
        if not row:
            return None
        payload = json.loads(row[0])
        # Legacy rows stored a bare list and did not record feed exhaustion.
        if isinstance(payload, list):
            return payload, float(row[1]), False
        if isinstance(payload, dict):
            return payload.get("rows") or [], float(row[1]), bool(payload.get("exhausted"))
        return None

    def put(self, pair: str, rows: list, fetched_at: float, exhausted: bool = False) -> None:
        blob = json.dumps({"rows": rows, "exhausted": bool(exhausted)})
        with sqlite3.connect(self.path) as c:
            c.execute("INSERT OR REPLACE INTO ohlc VALUES (?,?,?)",
                      (pair, blob, fetched_at))


class KrakenOHLCFetcher:
    def __init__(self, cache_path: str = "kraken_cache.sqlite", ttl: int = DEFAULT_TTL,
                 min_interval_ms: int = MIN_INTERVAL_MS):
        self.cache = KrakenCache(cache_path)
        self.ttl = ttl
        self.min_interval = min_interval_ms / 1000.0
        self._last_call = 0.0

    def _throttle(self):
        wait = self.min_interval - (time.monotonic() - self._last_call)
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.monotonic()

    def _call(self, pair: str, interval: int, since: int | None) -> dict:
        self._throttle()
        url = f"{OHLC_URL}?pair={pair}&interval={interval}"
        if since is not None:
            url += f"&since={since}"
        with urllib.request.urlopen(url, timeout=30) as r:
            body = json.loads(r.read().decode())
        if body.get("error"):
            raise RuntimeError(f"kraken error: {body['error']}")
        for k, v in body["result"].items():
            if k != "last":
                return {"key": k, "rows": v, "last": body["result"]["last"]}
        raise RuntimeError("kraken: empty result")

    def backfill(self, pair: str, interval: int = 1440, want: int = 1440) -> Series:
        """Paginate forward until `want` candles are collected or the feed stops.

        Kraken's `last` field is the cursor for *new* bars. Using it as the next
        `since` stalls or skips. Advance `since` to max(returned timestamp) +
        one interval instead. Never pad a short feed up to `want`.

        A fresh SQLite row (age <= TTL) is served as CACHE. The cache is not
        only a failure fallback — that was the previous bug.
        """
        cached = self.cache.get(pair)
        if cached:
            rows, ts, exhausted = cached
            age = time.time() - ts
            if rows and age <= self.ttl and (len(rows) >= want or exhausted):
                served = rows[-want:] if len(rows) > want else list(rows)
                return Series(pair=pair, rows=served, source="CACHE", fetched_at=ts)

        collected: dict[int, list] = {}
        step = interval * 60
        since = int(time.time()) - want * step
        guard = 0
        try:
            while len(collected) < want and guard < 40:
                guard += 1
                res = self._call(pair, interval, since)
                new = 0
                for row in res["rows"]:
                    ts = int(row[0])
                    if ts not in collected:
                        collected[ts] = row
                        new += 1
                if new == 0:            # feed exhausted / not advancing
                    break
                # Do not jump to result["last"] — that cursor is for new bars.
                nxt = max(int(r[0]) for r in res["rows"]) + step
                if nxt <= since:
                    break
                since = nxt
            rows = [collected[k] for k in sorted(collected)][-want:]
            if not rows:
                raise RuntimeError("kraken: zero candles")
            exhausted = len(collected) < want
            now = time.time()
            self.cache.put(pair, rows, now, exhausted=exhausted)
            return Series(pair=pair, rows=rows, source="LIVE", fetched_at=now)
        except (urllib.error.URLError, RuntimeError, TimeoutError, OSError) as e:
            cached = self.cache.get(pair)
            if cached:
                rows, ts, _exhausted = cached
                age = time.time() - ts
                return Series(pair=pair, rows=rows,
                              source="CACHE" if age <= self.ttl else "STALE",
                              fetched_at=ts,
                              error=f"network: {type(e).__name__}: {e} (age {int(age)}s)")
            return Series(pair=pair, source="INSUFFICIENT_DATA",
                          error=f"{type(e).__name__}: {e}")


def default_universe(base: str = "SOLUSD") -> list[str]:
    return [base, "XBTUSD", "ETHUSD", "XDGUSD"]


def fetch_all(pairs: list[str] | None = None, cache_path: str = "kraken_cache.sqlite",
              want: int = 1440) -> dict[str, Series]:
    f = KrakenOHLCFetcher(cache_path=cache_path)
    return {p: f.backfill(p, want=want) for p in (pairs or default_universe())}


if __name__ == "__main__":
    for p, s in fetch_all().items():
        print(p, s.provenance())
