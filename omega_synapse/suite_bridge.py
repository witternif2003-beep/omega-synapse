"""Bridge to the verified OMEGA statistical suite (omega_suite.py v1.1.1).

The suite is imported, never copied — one source of truth for PSR/DSR/PBO/
MinTRL/haircut. If the suite file is missing or fails to load we raise loudly
rather than silently degrading to a reimplementation.
"""

from __future__ import annotations

import importlib.util
import os

_SUITE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "omega_suite.py")


def _load():
    if not os.path.exists(_SUITE_PATH):
        raise RuntimeError(f"omega_suite.py not found at {_SUITE_PATH}")
    spec = importlib.util.spec_from_file_location("omega_suite", _SUITE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


suite = _load()

PSR = suite.compute_psr
DSR = suite.compute_dsr
PBO = suite.compute_pbo
MINTRL = suite.compute_mintrl
HAIRCUT = suite.compute_haircut
AUDIT_APPEND = suite.audit_append
AUDIT_VERIFY = suite.audit_verify
RUN_GATE = suite.run_gate
SUITE_VERSION = suite.VERSION
