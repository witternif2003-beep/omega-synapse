"""Layer 0 security gate — mint/freeze authority, Token-2022 extensions,
top-10 holder concentration.

Design rule: absence of evidence is NOT a pass. If the RPC cannot answer, the
verdict is UNKNOWN and position_cap stays 0. Never `security_gate_failed` on a
network timeout dressed up as a clean token, and never PASS on unverified data.
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass, field

SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

# Token-2022 extensions that hand control to a third party. Presence => fail.
DANGEROUS_EXTENSIONS = {
    "transferHook": "transfer hook can gate/redirect transfers",
    "permanentDelegate": "permanent delegate can burn/seize holdings",
}

TOP10_CONCENTRATION_MAX = 0.40


@dataclass
class SecurityVerdict:
    mint: str
    checks: dict = field(default_factory=dict)
    failed: list = field(default_factory=list)
    unknown: list = field(default_factory=list)

    applicable: bool = True
    reason: str | None = None

    @classmethod
    def not_applicable(cls, mint: str, reason: str) -> "SecurityVerdict":
        """Used only for instruments with no mint to inspect (e.g. CEX pairs).
        This is a NARROW exception and it is recorded in the verdict trail; it
        is never a way to launder a real on-chain token past Layer 0."""
        return cls(mint=mint, applicable=False, reason=reason)

    @property
    def status(self) -> str:
        if not self.applicable:
            return "SECURITY_GATE_NOT_APPLICABLE"
        if self.unknown and not self.failed:
            return "SECURITY_GATE_UNKNOWN"
        if self.failed:
            return "security_gate_failed"
        return "SECURITY_GATE_PASSED"

    @property
    def position_cap(self) -> int:
        return 0  # permanent, structural, non-negotiable

    def as_dict(self) -> dict:
        return {"mint": self.mint, "status": self.status,
                "position_cap": self.position_cap, "failed": self.failed,
                "unknown": self.unknown, "checks": self.checks}


class RpcError(RuntimeError):
    pass


class SolanaRpc:
    """Minimal JSON-RPC client. No keys baked in; caller supplies the endpoint."""

    def __init__(self, endpoint: str, timeout: float = 20.0):
        self.endpoint = endpoint
        self.timeout = timeout

    def call(self, method: str, params: list) -> dict:
        req = urllib.request.Request(
            self.endpoint, method="POST",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                             "params": params}).encode(),
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                body = json.loads(r.read().decode())
        except Exception as e:                      # noqa: BLE001 - surfaced as UNKNOWN
            raise RpcError(f"{type(e).__name__}: {e}") from e
        if "error" in body:
            raise RpcError(str(body["error"]))
        return body.get("result") or {}


def evaluate(mint: str, rpc: SolanaRpc | None = None,
             largest_accounts: list | None = None,
             supply: float | None = None) -> SecurityVerdict:
    """Run the four checks. `largest_accounts`/`supply` may be injected for
    deterministic tests; otherwise they are read from `rpc`."""
    v = SecurityVerdict(mint=mint)
    if rpc is None and (largest_accounts is None or supply is None):
        v.unknown.append("no RPC endpoint supplied")
        return v

    # --- 1/2/3: account + extension inspection -------------------------------
    if rpc is not None:
        try:
            info = rpc.call("getAccountInfo", [mint, {"encoding": "jsonParsed",
                                                      "commitment": "confirmed"}])
            data = (info.get("value") or {}).get("data") or {}
            parsed = (data.get("parsed") or {}).get("info") or {}
            owner = (info.get("value") or {}).get("owner")
            mint_auth = parsed.get("mintAuthority")
            freeze_auth = parsed.get("freezeAuthority")
            v.checks["program"] = owner
            v.checks["mint_authority_revoked"] = mint_auth is None
            v.checks["freeze_authority_revoked"] = freeze_auth is None
            if mint_auth is not None:
                v.failed.append("mint_authority_not_revoked")
            if freeze_auth is not None:
                v.failed.append("freeze_authority_not_revoked")

            if owner == TOKEN_2022_PROGRAM:
                exts = (parsed.get("extensions") or [])
                names = {e.get("extension") for e in exts if isinstance(e, dict)}
                v.checks["token2022_extensions"] = sorted(x for x in names if x)
                for ext, why in DANGEROUS_EXTENSIONS.items():
                    if ext in names:
                        v.failed.append(f"token2022_{ext}: {why}")
            elif owner == SPL_TOKEN_PROGRAM:
                v.checks["token2022_extensions"] = []
            elif owner is None:
                v.unknown.append("owner_unresolved")
        except RpcError as e:
            v.unknown.append(f"getAccountInfo: {e}")

        # --- 4: concentration ------------------------------------------------
        try:
            la = rpc.call("getTokenLargestAccounts", [mint, {"commitment": "confirmed"}])
            largest_accounts = la.get("value") or []
        except RpcError as e:
            v.unknown.append(f"getTokenLargestAccounts: {e}")

    if largest_accounts is not None and supply is not None:
        top10 = sum(float(a.get("uiAmount") or 0) for a in largest_accounts[:10])
        conc = top10 / supply if supply > 0 else None
        v.checks["top10_concentration"] = round(conc, 4) if conc is not None else None
        if conc is None:
            v.unknown.append("supply_unknown")
        elif conc > TOP10_CONCENTRATION_MAX:
            v.failed.append(f"top10_concentration {conc:.2%} > {TOP10_CONCENTRATION_MAX:.0%}")
    elif largest_accounts is not None and supply is None:
        v.unknown.append("supply_not_supplied")

    return v
