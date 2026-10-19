"""P1 tier-1 ranker — hardcoded criteria, no manual override, no imputation.

Every criterion is stated as a predicate over an OBSERVED fact. If a fact is
missing the result is INSUFFICIENT_DATA, never a default-filled guess.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Thresholds fixed by spec. Changing them requires a version bump.
BONDING_CURVE_SOL = 85.0
MIN_LIQUIDITY_USD = 1500.0
MIN_LIQUIDITY_PCT_OF_MC = 0.02
MIN_UNIQUE_BUYERS_1H = 30
# Buy-pressure validation: market-cap growth must be covered by buy volume.
MIN_VOLUME_TO_MC_DELTA = 0.5


@dataclass
class TokenObservation:
    mint: str
    symbol: str | None = None
    bonding_curve_sol: float | None = None
    liquidity_usd: float | None = None
    market_cap_usd: float | None = None
    unique_buyers_1h: int | None = None
    buy_volume_usd_1h: float | None = None
    mc_delta_usd_1h: float | None = None
    extra: dict = field(default_factory=dict)


@dataclass
class RankResult:
    mint: str
    tier: str
    failures: list
    missing: list

    @property
    def eligible(self) -> bool:
        return self.tier == "p1_tier1"


def _check(obs: TokenObservation) -> tuple[list, list]:
    failures, missing = [], []

    def fact(name, value):
        if value is None:
            missing.append(name)
            return None
        return value

    bc = fact("bonding_curve_sol", obs.bonding_curve_sol)
    if bc is not None and bc < BONDING_CURVE_SOL:
        failures.append(f"bonding_curve {bc:.1f} SOL < {BONDING_CURVE_SOL}")

    liq = fact("liquidity_usd", obs.liquidity_usd)
    mc = fact("market_cap_usd", obs.market_cap_usd)
    if liq is not None:
        if liq < MIN_LIQUIDITY_USD:
            failures.append(f"liquidity ${liq:,.0f} < ${MIN_LIQUIDITY_USD:,.0f}")
        elif mc is not None and mc > 0 and liq / mc < MIN_LIQUIDITY_PCT_OF_MC:
            failures.append(f"liquidity {liq/mc:.2%} of MC < {MIN_LIQUIDITY_PCT_OF_MC:.0%}")

    ub = fact("unique_buyers_1h", obs.unique_buyers_1h)
    if ub is not None and ub < MIN_UNIQUE_BUYERS_1H:
        failures.append(f"unique_buyers_1h {ub} < {MIN_UNIQUE_BUYERS_1H}")

    bv = fact("buy_volume_usd_1h", obs.buy_volume_usd_1h)
    dmc = fact("mc_delta_usd_1h", obs.mc_delta_usd_1h)
    if bv is not None and dmc is not None:
        if dmc > 0 and bv / dmc < MIN_VOLUME_TO_MC_DELTA:
            failures.append(f"MC growth not paid for by volume "
                            f"(buy_vol/mc_delta {bv/dmc:.2f} < {MIN_VOLUME_TO_MC_DELTA})")
        if dmc > 0 and bv <= 0:
            failures.append("MC rose on zero buy volume (liquidity artifact)")
    return failures, missing


def rank(obs: TokenObservation) -> RankResult:
    failures, missing = _check(obs)
    if missing:
        return RankResult(obs.mint, "insufficient_data", failures, missing)
    if failures:
        return RankResult(obs.mint, "not_p1_tier1", failures, [])
    return RankResult(obs.mint, "p1_tier1", [], [])
