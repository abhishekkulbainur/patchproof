"""
Deterministic "demo analysis" for the seeded Document Portal target.

This is a small rule set implemented with Python's `ast` module. It is NOT a
general-purpose scanner: the rules are written for the demo target's shape and
are labelled as demo analysis everywhere in the UI.
"""
from __future__ import annotations

import ast
import hashlib
import time
from dataclasses import dataclass, field

ANALYZER = "PatchProof demo analysis (AST rules v1, deterministic)"


@dataclass
class Detection:
    rule_id: str
    finding_id: str
    title: str
    severity: str
    category: str
    cwe: str
    function: str | None
    line_start: int
    line_end: int
    endpoint: str | None
    description: str
    expected: str
    observed: str
    severity_rationale: str
    verifiable: bool
    evidence: dict = field(default_factory=dict)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _is_server_identity(node: ast.AST) -> bool:
    """True if node is `user[...]` / `user.<attr>` -- the identity resolved from the server-side session."""
    return isinstance(node, (ast.Subscript, ast.Attribute)) and isinstance(node.value, ast.Name) and node.value.id == "user"


def _ownership_checks(fn: ast.FunctionDef) -> list[ast.Compare]:
    checks = []
    for node in ast.walk(fn):
        if isinstance(node, ast.Compare) and "owner_id" in ast.unparse(node):
            if any(_is_server_identity(n) for n in ast.walk(node)):
                checks.append(node)
    return checks


def _id_lookups(fn: ast.FunctionDef) -> list[ast.AST]:
    id_args = {a.arg for a in fn.args.args if a.arg.endswith("_id")}
    found = []
    for node in ast.walk(fn):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "get"
                and isinstance(node.func.value, ast.Name) and node.func.value.id == "DOCUMENTS"
                and node.args and isinstance(node.args[0], ast.Name) and node.args[0].id in id_args):
            found.append(node)
        if (isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name) and node.value.id == "DOCUMENTS"
                and isinstance(node.slice, ast.Name) and node.slice.id in id_args):
            found.append(node)
    return found


def rule_idor(tree: ast.Module) -> list[Detection]:
    out = []
    for fn in [n for n in tree.body if isinstance(n, ast.FunctionDef)]:
        lookups = _id_lookups(fn)
        if not lookups or _ownership_checks(fn):
            continue
        out.append(Detection(
            rule_id="authz.object-level",
            finding_id="PP-AUTHZ-001",
            title="Broken object-level authorization (IDOR) in document retrieval",
            severity="High",
            category="Broken access control",
            cwe="CWE-639",
            function=fn.name,
            line_start=fn.lineno,
            line_end=fn.end_lineno,
            endpoint="GET /api/documents/{doc_id}",
            description=(
                f"`{fn.name}()` loads a document using the identifier taken from the URL and returns it to any "
                "signed-in user. It never compares the document's owner with the user resolved from the "
                "server-side session, so changing the ID in the request exposes other users' documents."
            ),
            expected="A signed-in user can only read documents they own; requests for anyone else's document are denied.",
            observed="Static analysis: no ownership comparison against the session user on the path that returns the document. "
                     "Use “Reproduce vulnerability” to confirm the behaviour with a live request.",
            severity_rationale=(
                "High: any authenticated account can read every other account's documents by enumerating IDs. "
                "No special privileges or user interaction are required. Confidentiality impact is high; "
                "integrity is not affected because the route is read-only."
            ),
            verifiable=True,
            evidence={
                "lookup_lines": [n.lineno for n in lookups],
                "rule": "Function takes an *_id argument, fetches DOCUMENTS by that ID, and has no comparison of "
                        "owner_id with the session user (user[...]).",
            },
        ))
    return out


def rule_info_disclosure(tree: ast.Module) -> list[Detection]:
    for handler in [n for n in ast.walk(tree) if isinstance(n, ast.ExceptHandler)]:
        for node in ast.walk(handler):
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "format_exc"
                    and isinstance(node.func.value, ast.Name) and node.func.value.id == "traceback"):
                fn = next((f for f in tree.body if isinstance(f, ast.FunctionDef)
                           and f.lineno <= handler.lineno <= f.end_lineno), None)
                return [Detection(
                    rule_id="info.stack-trace-in-response",
                    finding_id="PP-INFO-002",
                    title="Stack trace returned in error responses",
                    severity="Medium",
                    category="Information disclosure",
                    cwe="CWE-209",
                    function=fn.name if fn else None,
                    line_start=handler.lineno,
                    line_end=handler.end_lineno,
                    endpoint="All /api routes (error path)",
                    description="The global error handler copies the exception message and full traceback into the "
                                "HTTP response body when DEBUG is enabled, revealing file paths and internal logic.",
                    expected="Clients receive a generic error with a correlation ID; details stay in server logs.",
                    observed=f"`traceback.format_exc()` is placed in the response body (line {node.lineno}).",
                    severity_rationale="Medium: aids attackers in mapping internals; requires an error to be triggered "
                                       "and depends on DEBUG being enabled (it is, see PP-CONF-003).",
                    verifiable=False,
                    evidence={"call_line": node.lineno},
                )]
    return []


def rule_debug_flag(tree: ast.Module) -> list[Detection]:
    for node in tree.body:
        if (isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "DEBUG" for t in node.targets)
                and isinstance(node.value, ast.Constant) and node.value.value is True):
            return [Detection(
                rule_id="config.debug-enabled",
                finding_id="PP-CONF-003",
                title="Debug mode hard-coded to enabled",
                severity="Low",
                category="Security misconfiguration",
                cwe="CWE-489",
                function=None,
                line_start=node.lineno,
                line_end=node.end_lineno,
                endpoint=None,
                description="`DEBUG = True` is hard-coded at module level instead of being read from deployment "
                            "configuration, so debug behaviour ships to every environment.",
                expected="Debug behaviour is off by default and enabled only through environment configuration.",
                observed=f"Module-level constant DEBUG = True (line {node.lineno}).",
                severity_rationale="Low on its own; it raises the impact of PP-INFO-002.",
                verifiable=False,
                evidence={},
            )]
    return []


RULES = [rule_idor, rule_info_disclosure, rule_debug_flag]


def analyze(source: str) -> tuple[list[Detection], list[dict]]:
    """Run all rules. Returns detections and measured step timings (no artificial delays)."""
    steps = []

    t = time.perf_counter()
    tree = ast.parse(source)
    functions = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
    steps.append({"step": "Load project", "detail": f"Parsed document_portal.py ({len(source.splitlines())} lines, "
                  f"{len(functions)} functions)", "duration_ms": round((time.perf_counter() - t) * 1000, 2)})

    t = time.perf_counter()
    authz = rule_idor(tree)
    inspected = [fn for fn in tree.body if isinstance(fn, ast.FunctionDef) and _id_lookups(fn)]
    steps.append({"step": "Analyze authorization logic",
                  "detail": f"{len(inspected)} object lookup(s) by ID inspected for server-side ownership checks; "
                            f"{len(authz)} missing",
                  "duration_ms": round((time.perf_counter() - t) * 1000, 2)})

    t = time.perf_counter()
    other = rule_info_disclosure(tree) + rule_debug_flag(tree)
    steps.append({"step": "Check error handling and configuration",
                  "detail": f"{len(other)} issue(s) found", "duration_ms": round((time.perf_counter() - t) * 1000, 2)})

    return authz + other, steps
