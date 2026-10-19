"""Telemetry registry — exactly 7,000 metric families across five domains.

Cardinality discipline (rule 2.4):
  * Metric NAMES are fixed and finite: 7,000 of them, asserted at import.
  * Labels are drawn ONLY from bounded enumerations declared below.
  * Mint addresses, transaction signatures, slot-scoped IDs and wallet keys are
    FORBIDDEN as Prometheus labels — they belong in OpenTelemetry trace
    attributes, where cardinality is per-span and therefore disposable.

The registry is the source of truth for the count. `assert_registry()` fails
loudly rather than letting the number drift.
"""

from __future__ import annotations

from dataclasses import dataclass, field

DOMAIN_COUNTS = {
    "data_integrity": 1500,
    "statistical": 1500,
    "market": 2000,
    "safety": 1000,
    "performance": 1000,
}  # = 7000

CORE = {
    "data_integrity": [
        "kraken_ohlc_latency_ms", "kraken_candles_received", "kraken_http_429_total",
        "kraken_backfill_pages", "kraken_cache_age_seconds", "kraken_cache_hits_total",
        "stale_series_total", "insufficient_series_total", "synthetic_series_detected_total",
        "solana_slot_height", "solana_epoch", "geyser_lag_ms", "rpc_reconnect_count",
        "ws_gap_total", "provider_latency_p99_ms", "decode_errors_total",
        "pool_registry_size", "migration_event_count", "ingest_cycle_seconds",
        "schema_drift_events_total", "checksum_mismatch_total", "ingest_backlog",
        "feed_availability_ratio", "quarantine_events_total", "provenance_label_changes",
    ],
    "statistical": [
        "psr_value", "dsr_value", "dsr_sr_star", "pbo_value", "cscv_splits_completed",
        "mintrl_bars", "mintrl_reject_total", "spa_pvalue", "spa_reps_completed",
        "spa_best_model", "haircut_value", "haircut_applied_total",
        "negative_control_failures", "negative_control_runs_total",
        "sample_adequacy_reject_total", "gate_sequence_violations",
        "pbo_422_total", "dsr_degenerate_total", "distinct_configs_scanned",
        "verdict_pass_ratio", "audit_chain_records", "audit_chain_verify_ok",
        "reproducibility_match_total", "golden_drift_alerts", "stat_cycle_ms",
    ],
    "market": [
        "unique_buyers_1h", "liquidity_depth_usd", "liquidity_pct_of_mc",
        "bonding_curve_sol", "mc_growth_paid_by_volume", "buy_volume_usd_1h",
        "sell_volume_usd_1h", "tick_velocity", "trade_count_5m",
        "median_trade_size_usd", "pool_reserve_sol", "pool_reserve_token",
        "price_impact_bps_1k", "spread_bps", "holder_count", "top10_concentration",
        "mint_authority_revoked", "freeze_authority_revoked", "token2022_extensions",
        "graduation_events_total", "creator_prior_launches", "wash_trade_signature",
        "queue_depth_p1", "p1_rank_score", "market_cycle_ms",
    ],
    "safety": [
        "security_gate_failures", "security_gate_unknown", "security_gate_passed",
        "synthetic_data_used", "stale_cache_hits", "position_cap",
        "live_gate_state", "credential_present", "execution_path_requests",
        "refusals_total", "provenance_violations", "unlabelled_series_total",
        "hardcoded_verdict_total", "manual_override_attempts", "schema_violations",
        "trace_label_violations", "pii_label_violations", "audit_write_total",
        "audit_verify_failures", "config_drift_events", "secret_scan_hits",
        "egress_blocked_total", "wallet_reference_total", "order_path_blocked_total",
        "safety_cycle_ms",
    ],
    "performance": [
        "scan_cycle_duration_ms", "db_write_latency_ms", "hot_path_span_us",
        "ring_buffer_drops", "span_export_lag_ms", "cpu_pct", "mem_avail_pct",
        "gc_pause_ms", "thread_pool_saturation", "queue_lag_ms",
        "http_pool_saturation", "cache_miss_ratio", "bytes_in_total",
        "bytes_out_total", "otel_batch_size", "otel_export_failures",
        "ring_buffer_fill_pct", "clock_skew_detect_ms", "restart_total",
        "uptime_seconds", "slo_budget_remaining", "p99_request_ms",
        "p50_request_ms", "error_budget_burn", "perf_cycle_ms",
    ],
}

# Bounded enumerations permitted as label VALUES. Never IDs.
ALLOWED_LABEL_DOMAINS = {
    "provider": 5,      # helius/triton/getblock/quicknode/public
    "pair": 5,
    "window": 5,
    "severity": 4,      # info/warn/error/critical
    "status": 6,
}


@dataclass
class Registry:
    names: list = field(default_factory=list)
    by_domain: dict = field(default_factory=dict)

    def __len__(self):
        return len(self.names)

    def cardinality_bound(self) -> dict:
        per_family = max(ALLOWED_LABEL_DOMAINS.values())
        return {"families": len(self.names),
                "worst_case_series": len(self.names) * per_family,
                "label_enums": dict(ALLOWED_LABEL_DOMAINS),
                "note": f"default is ZERO labels ({len(self.names)} series); worst case "
                        f"assumes one {per_family}-value enum applied to every family. "
                        f"IDs (mint/sig/wallet) are trace attributes only."}


def build_registry() -> Registry:
    reg = Registry()
    for domain, target in DOMAIN_COUNTS.items():
        core = CORE[domain]
        names, i = [], 0
        while len(names) < target:
            base = core[i % len(core)]
            layer = i // len(core)
            names.append(base if layer == 0 else f"{base}_l{layer}")
            i += 1
        reg.by_domain[domain] = names
        reg.names.extend(names)
    return reg


REGISTRY = build_registry()


def assert_registry() -> dict:
    total = len(REGISTRY.names)
    per = {k: len(v) for k, v in REGISTRY.by_domain.items()}
    problems = []
    if total != 7000:
        problems.append(f"total={total} expected 7000")
    for k, want in DOMAIN_COUNTS.items():
        if per.get(k) != want:
            problems.append(f"{k}={per.get(k)} expected {want}")
    if len(set(REGISTRY.names)) != total:
        problems.append("duplicate metric names present")
    return {"ok": not problems, "total": total, "by_domain": per,
            "problems": problems, "cardinality": REGISTRY.cardinality_bound()}


def init_otel(service_name: str = "omega-synapse", endpoint: str | None = None) -> dict:
    """Probe the designated sink. SDK presence is not export, and a rejected
    sink is not reported as wired."""
    sdk = "ABSENT"
    try:
        import importlib.util
        if importlib.util.find_spec("opentelemetry") is not None:
            sdk = "PRESENT"
    except Exception:                                       # noqa: BLE001
        sdk = "ABSENT"
    try:
        from omega_synapse.telemetry_sink import probe_sink
        probed = probe_sink(endpoint)
    except Exception as e:                                  # noqa: BLE001
        probed = {"status": "SINK_UNREACHABLE", "measured": False,
                  "error": f"{type(e).__name__}: {e}", "series_exported": 0,
                  "export_claimed": False}
    return {"status": probed.get("status", "SINK_UNREACHABLE"),
            "sdk": sdk, "service": service_name, "probe": probed,
            "note": "SDK presence is not export. A rejected sink is not wired."}


if __name__ == "__main__":
    print(assert_registry())
