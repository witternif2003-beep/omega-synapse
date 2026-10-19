"""Solana Geyser/gRPC ingestion — decoder implemented, transport credential-gated.

Honest boundary: the pump.fun instruction decoder below is real and testable
offline (anchor-style discriminators, little-endian field parsing). The
Yellowstone transport needs a provider endpoint + token, which this workspace
does not have. Without them the module returns BLOCKED_ON_CREDENTIALS and the
screener runs on whatever else is labelled LIVE. It never silently substitutes
a public RPC and calls it equivalent — the latency profile is not comparable.
"""

from __future__ import annotations

import hashlib
import os
import struct
from dataclasses import dataclass, field

PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
PUMP_SWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"

DANGEROUS_ID_PATTERNS = ("mint_address", "signature", "txid", "wallet")


def discriminator(name: str) -> bytes:
    """Anchor: first 8 bytes of sha256('global:<name>')."""
    return hashlib.sha256(f"global:{name}".encode()).digest()[:8]


DISCRIMINATORS = {discriminator(n): n for n in
                  ("create", "buy", "sell", "migrate", "set_params", "withdraw")}


@dataclass
class PumpEvent:
    kind: str
    slot: int
    signature: str = ""
    mint: str | None = None
    sol_amount: float | None = None
    token_amount: float | None = None
    creator: str | None = None
    raw_len: int = 0

    def trace_attributes(self) -> dict:
        """High-cardinality identifiers live HERE (trace attributes), never in
        Prometheus labels."""
        return {"event.kind": self.kind, "solana.slot": self.slot,
                "solana.signature": self.signature, "token.mint": self.mint,
                "trader.address": self.creator, "payload.bytes": self.raw_len}


def _u64(b: bytes, off: int) -> float:
    return float(struct.unpack_from("<Q", b, off)[0])


def decode_instruction(data: bytes, *, slot: int = 0, signature: str = "",
                       accounts: list | None = None) -> PumpEvent | None:
    """Decode a pump.fun instruction from raw bytes. Returns None for
    instructions belonging to other programs / unknown discriminators."""
    if len(data) < 8:
        return None
    kind = DISCRIMINATORS.get(bytes(data[:8]))
    if kind is None:
        return None
    ev = PumpEvent(kind=kind, slot=slot, signature=signature, raw_len=len(data))
    accts = accounts or []
    if kind == "create":
        # layout: disc(8) name(string) symbol(string) uri(string) mint(32) ...
        off = 8
        for attr in ("name", "symbol", "uri"):
            if off + 4 > len(data):
                break
            ln = struct.unpack_from("<I", data, off)[0]
            off += 4
            if off + ln > len(data):
                return ev
            setattr(ev, attr, data[off:off + ln].decode("utf-8", "replace"))
            off += ln
        if off + 32 <= len(data):
            ev.mint = _b58(data[off:off + 32])
        if accts:
            ev.creator = accts[0] if isinstance(accts[0], str) else None
    elif kind in ("buy", "sell"):
        if len(data) >= 24:
            ev.token_amount = _u64(data, 8) / 1e6
            ev.sol_amount = _u64(data, 16) / 1e9
        if accts:
            ev.creator = accts[0] if isinstance(accts[0], str) else None
    return ev


_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    return out.rjust(32, "1")[:44]


@dataclass
class GeyserListener:
    endpoint: str | None = None
    token: str | None = None
    events: list = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "GeyserListener":
        return cls(endpoint=os.environ.get("GEYSER_ENDPOINT"),
                   token=os.environ.get("GEYSER_TOKEN"))

    def status(self) -> dict:
        missing = [n for n, v in (("GEYSER_ENDPOINT", self.endpoint),
                                  ("GEYSER_TOKEN", self.token)) if not v]
        if missing:
            return {"status": "BLOCKED_ON_CREDENTIALS", "missing": missing,
                    "note": "public RPC is NOT a substitute: latency profile differs "
                            "by orders of magnitude and miss rate on new mints is high"}
        return {"status": "CREDENTIALS_PRESENT",
                "note": "transport not opened by this module; wiring is "
                        "environment-specific and unverified here"}

    def start(self) -> dict:
        """Deliberately does not fabricate a stream. Returns honest status."""
        st = self.status()
        if st["status"] != "CREDENTIALS_PRESENT":
            return st
        return {"status": "NOT_STARTED", "detail":
                "yellowstone-grpc transport is not vendored in this workspace; "
                "no events will be produced and none will be invented"}
