"""
PatchProof test harness for the Document Portal demo target.

Runs in a separate Python process (`python -I harness.py --target <file> --suite <name>`),
imports the target module from the given file path, executes deterministic
request/response assertions against it, and prints one JSON document to stdout.

This file deliberately has no dependency on the PatchProof application so the
code under test cannot reach the app's database or configuration.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import platform
import sys
import time

ALICE = {"id": "u-alice", "session": "sess-alice-7f3a91"}
BOB = {"id": "u-bob", "session": "sess-bob-2c8e40"}
ALICE_DOC = "doc-1041"
ALICE_DOC_2 = "doc-1042"
BOB_DOC = "doc-2077"

# Synthetic fixture content used to detect leaked data in responses.
ALICE_MARKERS = ["Q3 vendor contract", "net 45", "Expense summary"]
BOB_MARKERS = ["Support rota", "on-call schedule"]


def load_target(path):
    spec = importlib.util.spec_from_file_location("document_portal_under_test", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # required for @dataclass to resolve its module
    spec.loader.exec_module(module)
    return module


def redact(session):
    if not session:
        return None
    return session.rsplit("-", 1)[0] + "-••••"


class Case:
    def __init__(self, test_id, phase, name, description, expected):
        self.test_id = test_id
        self.phase = phase
        self.name = name
        self.description = description
        self.expected = expected
        self.assertions = []
        self.request = None
        self.response = None

    def send(self, mod, method, path, actor, headers=None):
        session = actor["session"] if actor else None
        headers = dict(headers or {})
        self.request = {
            "method": method,
            "path": path,
            "as_user": actor["id"] if actor else None,
            "session": redact(session),
            "headers": headers,
        }
        resp = mod.handle(mod.Request(method=method, path=path, session=session, headers=headers))
        self.response = resp
        return resp

    def check(self, label, ok, detail=""):
        self.assertions.append({"label": label, "passed": bool(ok), "detail": detail})


def body_text(resp):
    try:
        return json.dumps(resp.body, sort_keys=True)
    except Exception:
        return repr(resp.body)


def leaked(resp, markers):
    text = body_text(resp)
    return [m for m in markers if m in text]


# ---------------------------------------------------------------- tests

def sec_01(mod):
    c = Case("SEC-01", "security", "Cross-user document read (ID swap)",
             "Bob, signed in with his own session, requests Alice's document by changing the document ID in the URL.",
             "Request denied (403 or 404) and none of Alice's document content is returned.")
    r = c.send(mod, "GET", f"/api/documents/{ALICE_DOC}", BOB, {"X-Account-Id": BOB["id"]})
    c.check("Response status is 403 or 404", r.status in (403, 404), f"observed {r.status}")
    lk = leaked(r, ALICE_MARKERS)
    c.check("No content from Alice's document in response", not lk, f"leaked: {lk}" if lk else "no markers found")
    return c


def sec_02(mod):
    c = Case("SEC-02", "security", "Owner can read own document",
             "Alice requests her own document. The fix must not break legitimate access.",
             "200 OK with document doc-1041.")
    r = c.send(mod, "GET", f"/api/documents/{ALICE_DOC}", ALICE, {"X-Account-Id": ALICE["id"]})
    c.check("Response status is 200", r.status == 200, f"observed {r.status}")
    doc = (r.body or {}).get("document") or {}
    c.check("Returned document is doc-1041", doc.get("id") == ALICE_DOC, f"observed id {doc.get('id')!r}")
    return c


def sec_03(mod):
    c = Case("SEC-03", "security", "Cross-user read with forged client identity",
             "Bob requests Alice's document and also forges the client-side X-Account-Id header to claim he is Alice. "
             "Authorization must rely on the server-side session, not client-supplied identifiers.",
             "Request denied (403 or 404) and none of Alice's document content is returned.")
    r = c.send(mod, "GET", f"/api/documents/{ALICE_DOC}", BOB, {"X-Account-Id": ALICE["id"]})
    c.check("Response status is 403 or 404", r.status in (403, 404), f"observed {r.status}")
    lk = leaked(r, ALICE_MARKERS)
    c.check("No content from Alice's document in response", not lk, f"leaked: {lk}" if lk else "no markers found")
    return c


def reg_01(mod):
    c = Case("REG-01", "regression", "Owner access for a second account",
             "Bob requests his own document.", "200 OK with document doc-2077.")
    r = c.send(mod, "GET", f"/api/documents/{BOB_DOC}", BOB, {"X-Account-Id": BOB["id"]})
    c.check("Response status is 200", r.status == 200, f"observed {r.status}")
    doc = (r.body or {}).get("document") or {}
    c.check("Returned document is doc-2077", doc.get("id") == BOB_DOC, f"observed id {doc.get('id')!r}")
    return c


def reg_02(mod):
    c = Case("REG-02", "regression", "Reverse cross-user read is denied",
             "Alice requests Bob's document.", "Request denied (403 or 404) with no content from Bob's document.")
    r = c.send(mod, "GET", f"/api/documents/{BOB_DOC}", ALICE, {"X-Account-Id": ALICE["id"]})
    c.check("Response status is 403 or 404", r.status in (403, 404), f"observed {r.status}")
    lk = leaked(r, BOB_MARKERS)
    c.check("No content from Bob's document in response", not lk, f"leaked: {lk}" if lk else "no markers found")
    return c


def reg_03(mod):
    c = Case("REG-03", "regression", "Non-existent document returns no data",
             "Bob requests an ID that does not exist.", "404 with no document payload and no other user's data.")
    r = c.send(mod, "GET", "/api/documents/doc-9999", BOB, {"X-Account-Id": BOB["id"]})
    c.check("Response status is 404", r.status == 404, f"observed {r.status}")
    c.check("No document payload", "document" not in (r.body or {}), "")
    lk = leaked(r, ALICE_MARKERS + BOB_MARKERS)
    c.check("No synthetic document content in response", not lk, f"leaked: {lk}" if lk else "no markers found")
    return c


def reg_04(mod):
    c = Case("REG-04", "regression", "Document list returns only own documents",
             "Alice lists her documents.", "200 OK listing exactly doc-1041 and doc-1042.")
    r = c.send(mod, "GET", "/api/documents", ALICE, {"X-Account-Id": ALICE["id"]})
    c.check("Response status is 200", r.status == 200, f"observed {r.status}")
    ids = sorted(d.get("id") for d in (r.body or {}).get("documents", []))
    c.check("Listed IDs are exactly Alice's documents", ids == sorted([ALICE_DOC, ALICE_DOC_2]), f"observed {ids}")
    return c


def reg_05(mod):
    c = Case("REG-05", "regression", "Unauthenticated request is rejected",
             "A request without a session asks for Alice's document.", "401 with no document content.")
    r = c.send(mod, "GET", f"/api/documents/{ALICE_DOC}", None)
    c.check("Response status is 401", r.status == 401, f"observed {r.status}")
    lk = leaked(r, ALICE_MARKERS)
    c.check("No document content in response", not lk, f"leaked: {lk}" if lk else "no markers found")
    return c


SUITES = {
    "reproduction": [sec_01, sec_02],
    "verification": [sec_01, sec_02, sec_03, reg_01, reg_02, reg_03, reg_04, reg_05],
}


def run_case(fn, mod):
    started = time.perf_counter()
    try:
        c = fn(mod)
        status = "passed" if c.assertions and all(a["passed"] for a in c.assertions) else "failed"
        error = None
    except Exception as exc:  # the test itself crashed: evidence is incomplete
        c = Case(fn.__name__.upper().replace("_", "-"), "unknown", fn.__name__, "", "")
        status, error = "error", f"{type(exc).__name__}: {exc}"
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    resp = c.response
    return {
        "test_id": c.test_id,
        "phase": c.phase,
        "name": c.name,
        "description": c.description,
        "expected": c.expected,
        "request": c.request,
        "response_status": resp.status if resp else None,
        "response_excerpt": body_text(resp)[:600] if resp else None,
        "assertions": c.assertions,
        "status": status,
        "error": error,
        "duration_ms": duration_ms,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--suite", required=True, choices=sorted(SUITES))
    args = parser.parse_args()

    with open(args.target, "rb") as fh:
        target_sha = hashlib.sha256(fh.read()).hexdigest()
    mod = load_target(args.target)
    results = [run_case(fn, mod) for fn in SUITES[args.suite]]
    print(json.dumps({
        "suite": args.suite,
        "target_sha256": target_sha,
        "python": platform.python_version(),
        "results": results,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
