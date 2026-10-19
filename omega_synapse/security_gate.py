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
        result = body.get("result")
        return result if isinstance(result, dict) else {}


def _ui_amount(value: dict) -> float | None:
    """Prefer uiAmount, then uiAmountString. `amount`+decimals is the fallback
    when the node omits the float (large supplies)."""
    if not isinstance(value, dict):
        return None
    ui = value.get("uiAmount")
    if ui is None and value.get("uiAmountString") not in (None, ""):
        ui = value.get("uiAmountString")
    if ui is None and value.get("amount") is not None:
        decimals = int(value.get("decimals") or 0)
        ui = int(value["amount"]) / (10 ** decimals)
    if ui is None:
        return None
    return float(ui)


def _apply_authority(v: SecurityVerdict, *, mint_authority_revoked, freeze_authority_revoked,
                     owner, extensions) -> None:
    if mint_authority_revoked is None:
        v.unknown.append("mint_authority_not_observed")
    else:
        v.checks["mint_authority_revoked"] = bool(mint_authority_revoked)
        if not mint_authority_revoked:
            v.failed.append("mint_authority_not_revoked")
    if freeze_authority_revoked is None:
        v.unknown.append("freeze_authority_not_observed")
    else:
        v.checks["freeze_authority_revoked"] = bool(freeze_authority_revoked)
        if not freeze_authority_revoked:
            v.failed.append("freeze_authority_not_revoked")
    if owner is None:
        v.unknown.append("program_not_observed")
        return
    v.checks["program"] = owner
    if owner == TOKEN_2022_PROGRAM:
        if extensions is None:
            v.unknown.append("token2022_extensions_not_observed")
            return
        names = set(extensions)
        v.checks["token2022_extensions"] = sorted(names)
        for ext, why in DANGEROUS_EXTENSIONS.items():
            if ext in names:
                v.failed.append(f"token2022_{ext}: {why}")
    elif owner == SPL_TOKEN_PROGRAM:
        v.checks["token2022_extensions"] = []
    else:
        v.unknown.append("owner_unresolved")


def evaluate(mint: str, rpc: SolanaRpc | None = None,
             largest_accounts: list | None = None,
             supply: float | None = None,
             *,
             mint_authority_revoked: bool | None = None,
             freeze_authority_revoked: bool | None = None,
             owner: str | None = None,
             extensions: list | None = None) -> SecurityVerdict:
    """Run the four checks. Injected facts are for deterministic tests.
    A concentration figure alone is not a pass: missing authority evidence
    stays UNKNOWN."""
    v = SecurityVerdict(mint=mint)

    if rpc is not None:
        try:
            info = rpc.call("getAccountInfo", [mint, {"encoding": "jsonParsed",
                                                      "commitment": "confirmed"}])
            value = info.get("value") or {}
            if not value:
                v.unknown.append("account_missing")
            else:
                data = value.get("data") or {}
                parsed = (data.get("parsed") or {}).get("info") or {}
                owner = value.get("owner")
                if not parsed:
                    v.unknown.append("mint_account_unparsed")
                else:
                    # Missing key means revoked only when the mint account parsed.
                    mint_authority_revoked = parsed.get("mintAuthority") is None
                    freeze_authority_revoked = parsed.get("freezeAuthority") is None
                if owner == TOKEN_2022_PROGRAM:
                    exts = parsed.get("extensions") or []
                    extensions = [e.get("extension") for e in exts
                                  if isinstance(e, dict) and e.get("extension")]
                elif owner == SPL_TOKEN_PROGRAM:
                    extensions = []
        except RpcError as e:
            v.unknown.append(f"getAccountInfo: {e}")

        try:
            la = rpc.call("getTokenLargestAccounts", [mint, {"commitment": "confirmed"}])
            largest_accounts = la.get("value") or []
        except RpcError as e:
            v.unknown.append(f"getTokenLargestAccounts: {e}")

        if supply is None:
            try:
                sup = rpc.call("getTokenSupply", [mint, {"commitment": "confirmed"}])
                supply = _ui_amount(sup.get("value") or {})
                if supply is None:
                    v.unknown.append("supply_unparsed")
            except RpcError as e:
                v.unknown.append(f"getTokenSupply: {e}")
    else:
        if largest_accounts is None or supply is None:
            v.unknown.append("no RPC endpoint supplied")

    _apply_authority(v, mint_authority_revoked=mint_authority_revoked,
                     freeze_authority_revoked=freeze_authority_revoked,
                     owner=owner, extensions=extensions)

    if largest_accounts is not None and supply is not None:
        top10 = 0.0
        for a in largest_accounts[:10]:
            amt = _ui_amount(a) if isinstance(a, dict) else None
            if amt is None and isinstance(a, dict):
                v.unknown.append("holder_amount_unparsed")
                return v
            top10 += amt or 0.0
        conc = top10 / supply if supply > 0 else None
        v.checks["top10_concentration"] = round(conc, 4) if conc is not None else None
        if conc is None:
            v.unknown.append("supply_unknown")
        elif conc > TOP10_CONCENTRATION_MAX:
            v.failed.append(f"top10_concentration {conc:.2%} > {TOP10_CONCENTRATION_MAX:.0%}")
    elif largest_accounts is not None and supply is None:
        v.unknown.append("supply_not_supplied")

    return v
