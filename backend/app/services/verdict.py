"""
Centralized verdict rules. The frontend only renders what these functions return.

VERIFIED      every precondition holds AND every required test passed.
FAILED        a required security or regression assertion failed after the patch.
INCONCLUSIVE  anything is missing, errored, timed out, or cannot be tied to the approved patch.
PENDING       no final verdict yet (used for findings, never returned by a completed run).
"""
from __future__ import annotations

from dataclasses import dataclass

VERIFIED = "Verified"
FAILED = "Failed"
INCONCLUSIVE = "Inconclusive"
PENDING = "Pending"

REPRODUCED = "Reproduced"
NOT_REPRODUCED = "Not reproduced"

REPRODUCTION_REQUIRED = ("SEC-01", "SEC-02")
VERIFICATION_REQUIRED = ("SEC-01", "SEC-02", "SEC-03", "REG-01", "REG-02", "REG-03", "REG-04", "REG-05")


@dataclass
class VerificationInputs:
    execution_status: str                 # completed | error | timeout
    results: list[dict]                   # harness results: test_id, status (passed/failed/error)
    reproduction_confirmed: bool          # vulnerability reproduced in this cycle...
    reproduction_sha: str | None          # ...against this target hash
    patch_status: str | None              # status of the patch under test
    patch_original_sha: str | None
    patch_patched_sha: str | None
    target_sha: str | None                # hash of the file the harness actually executed
    required: tuple[str, ...] = VERIFICATION_REQUIRED


def compute_verification_verdict(v: VerificationInputs) -> tuple[str, list[str]]:
    by_id = {r["test_id"]: r for r in v.results}
    reasons: list[str] = []

    failed = [t for t in v.required if by_id.get(t, {}).get("status") == "failed"]
    if failed:
        for t in failed:
            r = by_id[t]
            kind = "Security" if r.get("phase") == "security" else "Regression"
            reasons.append(f"{kind} test {t} failed: {r.get('name')}")
        return FAILED, reasons

    if v.execution_status != "completed":
        return INCONCLUSIVE, [f"Test execution did not complete ({v.execution_status}); evidence is incomplete."]

    missing = [t for t in v.required if t not in by_id]
    errored = [t for t in v.required if by_id.get(t, {}).get("status") == "error"]
    not_passed = [t for t in v.required if t in by_id and by_id[t].get("status") not in ("passed", "failed", "error")]
    if missing:
        reasons.append(f"Required test(s) did not run: {', '.join(missing)}")
    if errored:
        reasons.append(f"Required test(s) raised an error: {', '.join(errored)}")
    if not_passed:
        reasons.append(f"Required test(s) have no pass/fail result: {', '.join(not_passed)}")

    if not v.reproduction_confirmed:
        reasons.append("The vulnerability was not reproduced before the fix in this demo cycle, so the patch "
                       "cannot be shown to have changed the vulnerable behaviour.")
    elif v.patch_original_sha and v.reproduction_sha != v.patch_original_sha:
        reasons.append("The reproduction ran against different code than the patch was written for.")

    if v.patch_status != "applied":
        reasons.append("The approved patch is not applied to the demo target.")
    elif not v.target_sha or v.target_sha != v.patch_patched_sha:
        reasons.append("The code that was tested does not match the approved patch (hash mismatch).")

    if reasons:
        return INCONCLUSIVE, reasons

    return VERIFIED, [
        "Vulnerability was reproduced before the fix against the original code.",
        "The approved patch is applied and the tested code matches it byte-for-byte (SHA-256).",
        "The same cross-user request is now denied, including with a forged client identity.",
        "Legitimate owner access and all regression tests pass.",
    ]


def compute_reproduction_outcome(execution_status: str, results: list[dict]) -> tuple[str, list[str]]:
    """Reproduced only if the unauthorized read succeeded AND the owner-access control test passed."""
    if execution_status != "completed":
        return INCONCLUSIVE, [f"Reproduction did not complete ({execution_status})."]
    by_id = {r["test_id"]: r for r in results}
    missing = [t for t in REPRODUCTION_REQUIRED if t not in by_id or by_id[t]["status"] == "error"]
    if missing:
        return INCONCLUSIVE, [f"Reproduction test(s) missing or errored: {', '.join(missing)}"]
    control = by_id["SEC-02"]
    if control["status"] != "passed":
        return INCONCLUSIVE, ["Control test SEC-02 (owner reads own document) did not pass, so the target is not "
                              "behaving normally and the result cannot be interpreted."]
    attack = by_id["SEC-01"]
    if attack["status"] == "failed":
        leaked = attack.get("response_status") == 200
        return REPRODUCED, [
            "Bob's request for Alice's document returned HTTP "
            f"{attack.get('response_status')}{' with her document content' if leaked else ''}.",
            "Control: Alice can read her own document (SEC-02 passed).",
        ]
    return NOT_REPRODUCED, ["Bob's request for Alice's document was denied; the flaw is not present in the current code."]
