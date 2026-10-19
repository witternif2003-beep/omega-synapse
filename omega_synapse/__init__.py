"""OMEGA-SYNAPSE 1.0 — read-only, paper-only screener.

Hard architectural boundary, enforced by what does not exist in this package:
no order construction, no signing, no bundle submission, no wallet reference,
no balance sweep. `position_cap == 0` is asserted in code, not promised in prose.
"""

__version__ = "1.0.1"
