"""Unit tests for the centralized verdict rules."""
from app.services.verdict import (FAILED, INCONCLUSIVE, NOT_REPRODUCED, REPRODUCED, VERIFICATION_REQUIRED,
                                  VERIFIED, VerificationInputs, compute_reproduction_outcome,
                                  compute_verification_verdict)


def results(overrides=None, drop=()):
    overrides = overrides or {}
    out = []
    for t in VERIFICATION_REQUIRED:
        if t in drop:
            continue
        out.append({"test_id": t, "phase": "security" if t.startswith("SEC") else "regression",
                    "name": t, "status": overrides.get(t, "passed")})
    return out


def inputs(**kw):
    base = dict(execution_status="completed", results=results(), reproduction_confirmed=True,
                reproduction_sha="orig", patch_status="applied", patch_original_sha="orig",
                patch_patched_sha="patched", target_sha="patched")
    base.update(kw)
    return VerificationInputs(**base)


def test_all_preconditions_and_tests_pass_is_verified():
    v, reasons = compute_verification_verdict(inputs())
    assert v == VERIFIED and reasons


def test_security_failure_is_failed():
    v, reasons = compute_verification_verdict(inputs(results=results({"SEC-01": "failed"})))
    assert v == FAILED and "SEC-01" in reasons[0]


def test_regression_failure_is_failed():
    v, reasons = compute_verification_verdict(inputs(results=results({"REG-04": "failed"})))
    assert v == FAILED and "Regression" in reasons[0]


def test_missing_required_test_is_inconclusive():
    v, _ = compute_verification_verdict(inputs(results=results(drop=("REG-03",))))
    assert v == INCONCLUSIVE


def test_errored_test_is_inconclusive():
    v, _ = compute_verification_verdict(inputs(results=results({"SEC-02": "error"})))
    assert v == INCONCLUSIVE


def test_timeout_is_inconclusive():
    v, _ = compute_verification_verdict(inputs(execution_status="timeout", results=[]))
    assert v == INCONCLUSIVE


def test_no_reproduction_is_inconclusive_even_if_tests_pass():
    v, reasons = compute_verification_verdict(inputs(reproduction_confirmed=False, reproduction_sha=None))
    assert v == INCONCLUSIVE and any("not reproduced" in r for r in reasons)


def test_patch_not_applied_is_never_verified():
    v, _ = compute_verification_verdict(inputs(patch_status="approved"))
    assert v == INCONCLUSIVE


def test_tested_code_must_match_patch():
    v, reasons = compute_verification_verdict(inputs(target_sha="something-else"))
    assert v == INCONCLUSIVE and any("hash mismatch" in r for r in reasons)


def test_unknown_status_cannot_count_as_pass():
    v, _ = compute_verification_verdict(inputs(results=results({"REG-01": "skipped"})))
    assert v == INCONCLUSIVE


def test_reproduction_outcomes():
    leak = [{"test_id": "SEC-01", "status": "failed", "response_status": 200},
            {"test_id": "SEC-02", "status": "passed"}]
    assert compute_reproduction_outcome("completed", leak)[0] == REPRODUCED
    blocked = [{"test_id": "SEC-01", "status": "passed"}, {"test_id": "SEC-02", "status": "passed"}]
    assert compute_reproduction_outcome("completed", blocked)[0] == NOT_REPRODUCED
    broken_control = [{"test_id": "SEC-01", "status": "failed"}, {"test_id": "SEC-02", "status": "failed"}]
    assert compute_reproduction_outcome("completed", broken_control)[0] == INCONCLUSIVE
    assert compute_reproduction_outcome("timeout", [])[0] == INCONCLUSIVE
