"""
Workflow orchestration: SCAN -> PROVE -> PATCH -> APPLY -> VERIFY (+ regression) -> REPORT.

All state transitions and their preconditions live here; the API layer is a thin wrapper.
A project's `cycle` increments on every demo reset so each demonstration is evaluated on its own
evidence while older runs remain in history.
"""
from __future__ import annotations

import json
import statistics
import threading
from contextlib import contextmanager

from .. import db
from ..config import ORIGINAL_TARGET, settings
from ..errors import ApiError
from . import patcher, runner, scanner, verdict

# Serializes state-changing operations so double clicks cannot interleave runs.
_lock = threading.Lock()

IDOR_FINDING = "PP-AUTHZ-001"
FINAL_FINDING_STATUS = {verdict.VERIFIED: "verified", verdict.FAILED: "verification_failed",
                        verdict.INCONCLUSIVE: "inconclusive"}


@contextmanager
def _busy():
    if not _lock.acquire(timeout=30):
        raise ApiError(409, "busy", "Another operation is still running. Try again in a moment.")
    try:
        yield
    finally:
        _lock.release()


# ------------------------------------------------------------------ lookups

def get_project(conn, project_id: str) -> dict:
    p = db.row(conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone())
    if not p:
        raise ApiError(404, "project_not_found", f"Project {project_id} not found.")
    return p


def get_finding(conn, finding_id: str) -> dict:
    f = db.row(conn.execute("SELECT * FROM findings WHERE id = ?", (finding_id,)).fetchone())
    if not f:
        raise ApiError(404, "finding_not_found", f"Finding {finding_id} not found. Run a scan first.")
    return f


def get_patch(conn, patch_id: str) -> dict:
    p = db.row(conn.execute("SELECT * FROM patches WHERE id = ?", (patch_id,)).fetchone())
    if not p:
        raise ApiError(404, "patch_not_found", f"Patch {patch_id} not found.")
    return p


def _require_verifiable(f: dict) -> None:
    if not f["verifiable"]:
        raise ApiError(422, "not_verifiable",
                       "Automated reproduction, patching and verification are implemented only for the "
                       "authorization (IDOR) finding in this prototype. This finding is for manual review.")


def target_state(sha: str | None) -> str:
    if sha is None:
        return "unknown"
    if sha == scanner.sha256_text(ORIGINAL_TARGET.read_text(encoding="utf-8")):
        return "original"
    with db.get_conn() as conn:
        p = conn.execute("SELECT id FROM patches WHERE patched_sha = ? ORDER BY created_at DESC LIMIT 1",
                         (sha,)).fetchone()
    return f"patched:{p['id']}" if p else "modified"


def read_target() -> str:
    path = db.workspace_target()
    if not path.is_file():
        db.restore_workspace()
    return path.read_text(encoding="utf-8")


def _active_patch(conn, finding_id: str, cycle: int) -> dict | None:
    return db.row(conn.execute(
        "SELECT * FROM patches WHERE finding_id = ? AND cycle = ? AND status IN ('proposed','approved','applied')"
        " ORDER BY version DESC LIMIT 1", (finding_id, cycle)).fetchone())


def _insert_tests(conn, run_id: str, results: list[dict]) -> None:
    for i, r in enumerate(results):
        conn.execute(
            "INSERT INTO test_results (run_id, seq, test_id, phase, name, description, required, expected, request,"
            " response_status, response_excerpt, assertions, status, error, duration_ms)"
            " VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)",
            (run_id, i, r["test_id"], r["phase"], r["name"], r["description"], r["expected"],
             json.dumps(r["request"]), r["response_status"], r["response_excerpt"], json.dumps(r["assertions"]),
             r["status"], r.get("error"), r["duration_ms"]))


# ------------------------------------------------------------------ A. scan

def scan(project_id: str) -> dict:
    with _busy():
        with db.get_conn() as conn:
            project = get_project(conn, project_id)
            started = db.now()
            source = read_target()
            sha = scanner.sha256_text(source)
            scan_id = db.new_id("SCN")
            db.log_event(conn, "scan_started", f"Scan {scan_id} started on {project['name']}",
                         project_id=project_id, scan_id=scan_id)
            try:
                detections, steps = scanner.analyze(source)
            except SyntaxError as exc:
                conn.execute(
                    "INSERT INTO scan_runs (id, project_id, cycle, analyzer, target_sha, started_at, finished_at,"
                    " duration_ms, status, findings_detected, steps) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (scan_id, project_id, project["cycle"], scanner.ANALYZER, sha, started, db.now(), 0, "error", 0,
                     json.dumps([{"step": "Load project", "detail": f"Parse error: {exc}", "duration_ms": 0}])))
                db.log_event(conn, "scan_failed", f"Scan {scan_id} failed: target does not parse", "error",
                             project_id=project_id, scan_id=scan_id)
                raise ApiError(422, "scan_failed", f"Target could not be parsed: {exc}")

            steps.append({"step": "Check test cases",
                          "detail": f"Harness suites available: reproduction ({len(verdict.REPRODUCTION_REQUIRED)} "
                                    f"tests), verification ({len(verdict.VERIFICATION_REQUIRED)} tests)",
                          "duration_ms": 0.0})
            ts = db.now()
            new_ids = []
            for d in detections:
                existing = conn.execute("SELECT id FROM findings WHERE id = ?", (d.finding_id,)).fetchone()
                params = (d.title, d.severity, d.category, d.cwe, d.function, d.line_start, d.line_end, d.endpoint,
                          d.description, d.expected, d.severity_rationale, json.dumps(d.evidence), int(d.verifiable),
                          ts, scan_id)
                if existing:
                    conn.execute(
                        "UPDATE findings SET title=?, severity=?, category=?, cwe=?, function=?, line_start=?,"
                        " line_end=?, endpoint=?, description=?, expected=?, severity_rationale=?, evidence=?,"
                        " verifiable=?, last_checked_at=?, last_scan_id=?, detected_in_last_scan=1 WHERE id=?",
                        params + (d.finding_id,))
                else:
                    conn.execute(
                        "INSERT INTO findings (title, severity, category, cwe, function, line_start, line_end,"
                        " endpoint, description, expected, severity_rationale, evidence, verifiable,"
                        " last_checked_at, last_scan_id, id, project_id, rule_id, status, file, observed,"
                        " first_detected_at, detected_in_last_scan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                        params + (d.finding_id, project_id, d.rule_id, "open", project["target_file"], d.observed, ts))
                    new_ids.append(d.finding_id)
                    db.log_event(conn, "finding_detected", f"{d.finding_id} detected: {d.title}",
                                 "warning" if d.severity in ("High", "Critical") else "info",
                                 project_id=project_id, finding_id=d.finding_id, scan_id=scan_id)
            detected = {d.finding_id for d in detections}
            for f in conn.execute("SELECT id FROM findings WHERE project_id = ?", (project_id,)).fetchall():
                if f["id"] not in detected:
                    conn.execute("UPDATE findings SET detected_in_last_scan=0, last_checked_at=?, last_scan_id=?"
                                 " WHERE id=?", (ts, scan_id, f["id"]))
            steps.append({"step": "Record findings",
                          "detail": f"{len(detections)} finding(s) in current code; {len(new_ids)} new",
                          "duration_ms": 0.0})
            duration = round(sum(s["duration_ms"] for s in steps), 2)
            conn.execute(
                "INSERT INTO scan_runs (id, project_id, cycle, analyzer, target_sha, started_at, finished_at,"
                " duration_ms, status, findings_detected, steps) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (scan_id, project_id, project["cycle"], scanner.ANALYZER, sha, started, db.now(), duration,
                 "completed", len(detections), json.dumps(steps)))
            db.log_event(conn, "scan_completed", f"Scan {scan_id} completed — {len(detections)} finding(s)",
                         project_id=project_id, scan_id=scan_id)
            return {"scan": db.row(conn.execute("SELECT * FROM scan_runs WHERE id=?", (scan_id,)).fetchone()),
                    "new_findings": new_ids}


# ------------------------------------------------------------------ B. reproduce

def reproduce(finding_id: str) -> dict:
    with _busy():
        with db.get_conn() as conn:
            f = get_finding(conn, finding_id)
            _require_verifiable(f)
            project = get_project(conn, f["project_id"])
        started = db.now()
        out = runner.run_suite("reproduction", db.workspace_target())
        outcome, reasons = verdict.compute_reproduction_outcome(out.execution_status, out.results)
        state = target_state(out.target_sha)
        run_id = db.new_id("RUN")
        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO verification_runs (id, project_id, finding_id, cycle, kind, target_sha, target_state,"
                " started_at, finished_at, duration_ms, execution_status, verdict, verdict_reasons, runner, logs)"
                " VALUES (?,?,?,?,'reproduction',?,?,?,?,?,?,?,?,?,?)",
                (run_id, f["project_id"], finding_id, project["cycle"], out.target_sha, state, started, db.now(),
                 out.duration_ms, out.execution_status, outcome, json.dumps(reasons),
                 runner.RUNNER_DESCRIPTION.format(timeout=settings.runner_timeout_s), "\n".join(out.logs)))
            _insert_tests(conn, run_id, out.results)
            if outcome == verdict.REPRODUCED:
                attack = next(r for r in out.results if r["test_id"] == "SEC-01")
                conn.execute("UPDATE findings SET observed=? WHERE id=?", (
                    f"Reproduced in {run_id}: Bob's session requested Alice's document doc-1041 and received HTTP "
                    f"{attack['response_status']} with its contents.", finding_id))
                if f["status"] in ("open", "reproduced"):
                    conn.execute("UPDATE findings SET status='reproduced' WHERE id=?", (finding_id,))
                db.log_event(conn, "finding_reproduced", f"{finding_id} reproduced: unauthorized read succeeded",
                             "warning", project_id=f["project_id"], finding_id=finding_id, run_id=run_id)
            else:
                db.log_event(conn, "reproduction_" + outcome.lower().replace(" ", "_"),
                             f"{finding_id} reproduction: {outcome}", "info" if outcome == verdict.NOT_REPRODUCED
                             else "warning", project_id=f["project_id"], finding_id=finding_id, run_id=run_id)
        return get_run(run_id)


# ------------------------------------------------------------------ C. propose

def propose_patch(finding_id: str, source: str, variant: str) -> dict:
    with _busy():
        with db.get_conn() as conn:
            f = get_finding(conn, finding_id)
            _require_verifiable(f)
            if source == "ai" and not settings.ai_enabled:
                raise ApiError(422, "ai_not_configured", "No AI provider is configured on the server. Use the demo "
                                                         "patch template, or set OPENAI_API_KEY and OPENAI_MODEL.")
            project = get_project(conn, f["project_id"])
            active = _active_patch(conn, finding_id, project["cycle"])
            if active and active["status"] == "applied":
                raise ApiError(409, "patch_already_applied",
                               f"Patch {active['id']} is already applied. Reset the demo to propose a different patch.")
        original = read_target()
        try:
            proposal = (patcher.ai_proposal(original, f) if source == "ai"
                        else patcher.template_proposal(original, variant))
        except patcher.PatchError as exc:
            raise ApiError(502 if source == "ai" else 422, "patch_generation_failed", str(exc))

        with db.get_conn() as conn:
            conn.execute("UPDATE patches SET status='superseded' WHERE finding_id=? AND cycle=?"
                         " AND status IN ('proposed','approved')", (finding_id, project["cycle"]))
            version = (conn.execute("SELECT COALESCE(MAX(version),0) FROM patches WHERE finding_id=?",
                                    (finding_id,)).fetchone()[0]) + 1
            patch_id = db.new_id("PAT")
            p = proposal
            conn.execute(
                "INSERT INTO patches (id, finding_id, cycle, version, source, variant, model, title, explanation,"
                " root_cause, minimality, diff, lines_added, lines_removed, original_sha, patched_sha,"
                " patched_source, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'proposed',?)",
                (patch_id, finding_id, project["cycle"], version, p.source, p.variant, p.model, p.title,
                 p.explanation, p.root_cause, p.minimality, p.diff, p.lines_added, p.lines_removed,
                 p.original_sha, p.patched_sha, p.patched_source, db.now()))
            conn.execute("UPDATE findings SET status='patch_proposed' WHERE id=?", (finding_id,))
            label = "AI proposal" if p.source == "ai" else "demo patch template"
            db.log_event(conn, "patch_proposed", f"Patch {patch_id} v{version} proposed for {finding_id} ({label})",
                         project_id=f["project_id"], finding_id=finding_id, patch_id=patch_id)
            return get_patch(conn, patch_id)


# ------------------------------------------------------------------ D. approve / apply

def approve_patch(patch_id: str) -> dict:
    with _busy():
        with db.get_conn() as conn:
            p = get_patch(conn, patch_id)
            if p["status"] != "proposed":
                raise ApiError(409, "invalid_transition", f"Patch {patch_id} is {p['status']}; only a proposed patch "
                                                          "can be approved.")
            conn.execute("UPDATE patches SET status='approved', approved_at=? WHERE id=?", (db.now(), patch_id))
            conn.execute("UPDATE findings SET status='patch_approved' WHERE id=?", (p["finding_id"],))
            f = get_finding(conn, p["finding_id"])
            db.log_event(conn, "patch_approved", f"Patch {patch_id} approved after review",
                         project_id=f["project_id"], finding_id=f["id"], patch_id=patch_id)
            return get_patch(conn, patch_id)


def apply_patch(patch_id: str) -> dict:
    with _busy():
        with db.get_conn() as conn:
            p = get_patch(conn, patch_id)
            if p["status"] == "proposed":
                raise ApiError(409, "not_approved", "Review and approve the patch before applying it.")
            if p["status"] != "approved":
                raise ApiError(409, "invalid_transition", f"Patch {patch_id} is {p['status']} and cannot be applied.")
            current_sha = scanner.sha256_text(read_target())
            if current_sha != p["original_sha"]:
                raise ApiError(409, "target_changed", "The demo target no longer matches the code this patch was "
                                                      "written for. Reset the demo and generate a new patch.")
            path = db.workspace_target()
            path.write_text(p["patched_source"], encoding="utf-8", newline="")
            if scanner.sha256_text(path.read_text(encoding="utf-8")) != p["patched_sha"]:
                raise ApiError(500, "apply_failed", "Patched file did not match the approved patch after writing.")
            conn.execute("UPDATE patches SET status='applied', applied_at=? WHERE id=?", (db.now(), patch_id))
            conn.execute("UPDATE findings SET status='patch_applied' WHERE id=?", (p["finding_id"],))
            f = get_finding(conn, p["finding_id"])
            db.log_event(conn, "patch_applied", f"Patch {patch_id} applied to demo target "
                                                f"(+{p['lines_added']} −{p['lines_removed']} lines)",
                         project_id=f["project_id"], finding_id=f["id"], patch_id=patch_id)
            return get_patch(conn, patch_id)


# ------------------------------------------------------------------ E/F. verify + regression

def verify(finding_id: str) -> dict:
    with _busy():
        with db.get_conn() as conn:
            f = get_finding(conn, finding_id)
            _require_verifiable(f)
            project = get_project(conn, f["project_id"])
            patch = _active_patch(conn, finding_id, project["cycle"])
            if not patch or patch["status"] != "applied":
                raise ApiError(409, "no_applied_patch", "No approved patch is applied to the demo target yet. "
                                                        "Verification needs an applied patch to test.")
            repro = db.row(conn.execute(
                "SELECT * FROM verification_runs WHERE finding_id=? AND cycle=? AND kind='reproduction'"
                " AND verdict=? AND target_sha=? ORDER BY started_at DESC LIMIT 1",
                (finding_id, project["cycle"], verdict.REPRODUCED, patch["original_sha"])).fetchone())

        started = db.now()
        out = runner.run_suite("verification", db.workspace_target())
        result, reasons = verdict.compute_verification_verdict(verdict.VerificationInputs(
            execution_status=out.execution_status, results=out.results,
            reproduction_confirmed=repro is not None, reproduction_sha=repro["target_sha"] if repro else None,
            patch_status=patch["status"], patch_original_sha=patch["original_sha"],
            patch_patched_sha=patch["patched_sha"], target_sha=out.target_sha))

        run_id = db.new_id("RUN")
        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO verification_runs (id, project_id, finding_id, cycle, kind, patch_id,"
                " reproduction_run_id, target_sha, target_state, started_at, finished_at, duration_ms,"
                " execution_status, verdict, verdict_reasons, runner, logs)"
                " VALUES (?,?,?,?,'verification',?,?,?,?,?,?,?,?,?,?,?,?)",
                (run_id, f["project_id"], finding_id, project["cycle"], patch["id"], repro["id"] if repro else None,
                 out.target_sha, target_state(out.target_sha), started, db.now(), out.duration_ms,
                 out.execution_status, result, json.dumps(reasons),
                 runner.RUNNER_DESCRIPTION.format(timeout=settings.runner_timeout_s), "\n".join(out.logs)))
            _insert_tests(conn, run_id, out.results)
            conn.execute("UPDATE findings SET status=?, last_checked_at=? WHERE id=?",
                         (FINAL_FINDING_STATUS[result], db.now(), finding_id))
            refs = dict(project_id=f["project_id"], finding_id=finding_id, run_id=run_id, patch_id=patch["id"])
            reg_failed = [r["test_id"] for r in out.results if r["phase"] == "regression" and r["status"] != "passed"]
            if reg_failed:
                db.log_event(conn, "regression_failed", f"Regression test(s) failed in {run_id}: {', '.join(reg_failed)}",
                             "error", **refs)
            level = {verdict.VERIFIED: "success", verdict.FAILED: "error"}.get(result, "warning")
            db.log_event(conn, f"verification_{result.lower()}", f"{run_id}: {finding_id} {result} "
                         f"({sum(r['status'] == 'passed' for r in out.results)}/{len(out.results)} tests passed)",
                         level, **refs)
        return get_run(run_id)


# ------------------------------------------------------------------ reset

def reset(project_id: str) -> dict:
    with _busy():
        with db.get_conn() as conn:
            project = get_project(conn, project_id)
            ts = db.now()
            conn.execute("UPDATE patches SET status='reverted', reverted_at=? WHERE cycle=? AND status='applied'"
                         " AND finding_id IN (SELECT id FROM findings WHERE project_id=?)", (ts, project["cycle"], project_id))
            conn.execute("UPDATE patches SET status='superseded' WHERE cycle=? AND status IN ('proposed','approved')"
                         " AND finding_id IN (SELECT id FROM findings WHERE project_id=?)", (project["cycle"], project_id))
            conn.execute("UPDATE projects SET cycle = cycle + 1 WHERE id=?", (project_id,))
            conn.execute("UPDATE findings SET status='open' WHERE project_id=?", (project_id,))
            conn.execute("UPDATE findings SET observed=? WHERE id=?", (
                "Static analysis: no ownership comparison against the session user on the path that returns the "
                "document. Use “Reproduce vulnerability” to confirm the behaviour with a live request.",
                IDOR_FINDING))
            db.restore_workspace()
            db.log_event(conn, "demo_reset", "Demo target restored to the original vulnerable code; run history kept",
                         project_id=project_id)
            return get_project(conn, project_id)


# ------------------------------------------------------------------ read models

def _test_summary(conn, run_id: str) -> dict:
    counts = {r["status"]: r["n"] for r in conn.execute(
        "SELECT status, COUNT(*) AS n FROM test_results WHERE run_id=? GROUP BY status", (run_id,))}
    return {"total": sum(counts.values()), "passed": counts.get("passed", 0),
            "failed": counts.get("failed", 0), "error": counts.get("error", 0)}


def get_run(run_id: str) -> dict:
    with db.get_conn() as conn:
        run = db.row(conn.execute("SELECT * FROM verification_runs WHERE id=?", (run_id,)).fetchone())
        if not run:
            raise ApiError(404, "run_not_found", f"Run {run_id} not found.")
        run["tests"] = db.rows(conn.execute("SELECT * FROM test_results WHERE run_id=? ORDER BY seq", (run_id,)))
        run["summary"] = _test_summary(conn, run_id)
        run["finding"] = db.row(conn.execute("SELECT id, title, severity, status FROM findings WHERE id=?",
                                             (run["finding_id"],)).fetchone())
        run["patch"] = db.row(conn.execute(
            "SELECT id, version, source, variant, title, status, lines_added, lines_removed, patched_sha, original_sha"
            " FROM patches WHERE id=?", (run["patch_id"],)).fetchone()) if run["patch_id"] else None
        run["reproduction"] = db.row(conn.execute(
            "SELECT id, verdict, started_at, target_sha FROM verification_runs WHERE id=?",
            (run["reproduction_run_id"],)).fetchone()) if run["reproduction_run_id"] else None
        return run


def list_runs(project_id: str | None = None, kind: str | None = None, limit: int = 100) -> list[dict]:
    q, args = "SELECT * FROM verification_runs WHERE 1=1", []
    if project_id:
        q += " AND project_id=?"; args.append(project_id)
    if kind:
        q += " AND kind=?"; args.append(kind)
    q += " ORDER BY started_at DESC LIMIT ?"; args.append(limit)
    with db.get_conn() as conn:
        runs = db.rows(conn.execute(q, args))
        for r in runs:
            r.pop("logs", None)
            r["summary"] = _test_summary(conn, r["id"])
        return runs


def list_findings(project_id: str, severity: str | None, status: str | None, q: str | None) -> list[dict]:
    sql, args = "SELECT * FROM findings WHERE project_id=?", [project_id]
    if severity:
        sql += " AND severity=?"; args.append(severity)
    if status:
        sql += " AND status=?"; args.append(status)
    if q:
        sql += " AND (id LIKE ? OR title LIKE ? OR category LIKE ? OR file LIKE ? OR cwe LIKE ?)"
        args += [f"%{q}%"] * 5
    sql += " ORDER BY CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, id"
    with db.get_conn() as conn:
        get_project(conn, project_id)
        return db.rows(conn.execute(sql, args))


def finding_detail(finding_id: str) -> dict:
    with db.get_conn() as conn:
        f = get_finding(conn, finding_id)
        project = get_project(conn, f["project_id"])
        f["project"] = {"id": project["id"], "name": project["name"], "cycle": project["cycle"]}
        f["patches"] = db.rows(conn.execute(
            "SELECT * FROM patches WHERE finding_id=? ORDER BY version DESC", (finding_id,)))
        f["active_patch"] = _active_patch(conn, finding_id, project["cycle"])
        latest = lambda kind: conn.execute(  # noqa: E731
            "SELECT id FROM verification_runs WHERE finding_id=? AND cycle=? AND kind=?"
            " ORDER BY started_at DESC LIMIT 1", (finding_id, project["cycle"], kind)).fetchone()
        r, v = latest("reproduction"), latest("verification")
    f["latest_reproduction"] = get_run(r["id"]) if r else None
    f["latest_verification"] = get_run(v["id"]) if v else None
    if f["latest_verification"] and f["active_patch"] and f["latest_verification"]["patch_id"] != f["active_patch"]["id"]:
        f["latest_verification"] = None  # result belongs to an older patch
    f["code"] = code_excerpt(f)
    return f


def code_excerpt(f: dict, context: int = 3) -> dict:
    """Affected lines from the ORIGINAL baseline (what the finding was raised on)."""
    lines = ORIGINAL_TARGET.read_text(encoding="utf-8").splitlines()
    start = max(1, (f["line_start"] or 1) - context)
    end = min(len(lines), (f["line_end"] or start) + context)
    return {"file": f["file"], "start": start, "highlight": [f["line_start"], f["line_end"]],
            "lines": lines[start - 1:end]}


def workflow_state(project_id: str) -> dict:
    with db.get_conn() as conn:
        project = get_project(conn, project_id)
        cycle = project["cycle"]
        scan_ = db.row(conn.execute("SELECT * FROM scan_runs WHERE project_id=? AND cycle=? ORDER BY started_at DESC"
                                    " LIMIT 1", (project_id, cycle)).fetchone())
        finding = db.row(conn.execute("SELECT id, status FROM findings WHERE id=?", (IDOR_FINDING,)).fetchone())
        patch = _active_patch(conn, IDOR_FINDING, cycle) if finding else None
        repro = db.row(conn.execute(
            "SELECT id, verdict FROM verification_runs WHERE finding_id=? AND cycle=? AND kind='reproduction'"
            " ORDER BY started_at DESC LIMIT 1", (IDOR_FINDING, cycle)).fetchone()) if finding else None
        ver = db.row(conn.execute(
            "SELECT id, verdict FROM verification_runs WHERE finding_id=? AND cycle=? AND kind='verification'"
            " AND patch_id=? ORDER BY started_at DESC LIMIT 1",
            (IDOR_FINDING, cycle, patch["id"] if patch else "")).fetchone()) if finding else None
    reproduced = bool(repro and repro["verdict"] == verdict.REPRODUCED)
    applied = bool(patch and patch["status"] == "applied")
    done = [bool(scan_), reproduced, bool(patch), applied, bool(ver), bool(ver), bool(ver)]
    current = next((i for i, d in enumerate(done) if not d), None)
    names = ["Scan the demo project", "Reproduce the IDOR issue", "Review the minimal patch",
             "Approve and apply the patch", "Re-run the original security test", "Run regression tests",
             "Open the evidence report"]
    steps = [{"index": i + 1, "title": n, "status": "done" if done[i] else ("current" if i == current else "locked")}
             for i, n in enumerate(names)]
    return {"project_id": project_id, "cycle": cycle, "steps": steps, "scan_id": scan_["id"] if scan_ else None,
            "finding_id": finding["id"] if finding else None, "finding_status": finding["status"] if finding else None,
            "reproduction": repro, "patch": {"id": patch["id"], "status": patch["status"]} if patch else None,
            "verification": ver}


def overview(project_id: str) -> dict:
    with db.get_conn() as conn:
        project = get_project(conn, project_id)
        findings = db.rows(conn.execute("SELECT severity, status FROM findings WHERE project_id=?", (project_id,)))
        runs = db.rows(conn.execute("SELECT verdict, duration_ms FROM verification_runs WHERE project_id=?"
                                    " AND kind='verification'", (project_id,)))
        last_scan = conn.execute("SELECT started_at FROM scan_runs WHERE project_id=? ORDER BY started_at DESC"
                                 " LIMIT 1", (project_id,)).fetchone()
        scans = conn.execute("SELECT COUNT(*) FROM scan_runs WHERE project_id=?", (project_id,)).fetchone()[0]
    open_ = [f for f in findings if f["status"] != "verified"]
    durations = [r["duration_ms"] for r in runs if r["duration_ms"] is not None]
    by_verdict = {k: sum(r["verdict"] == k for r in runs) for k in (verdict.VERIFIED, verdict.FAILED, verdict.INCONCLUSIVE)}
    return {
        "project": project,
        "open_findings": len(open_),
        "open_by_severity": {s: sum(f["severity"] == s for f in open_) for s in ("High", "Medium", "Low")},
        "total_findings": len(findings),
        "verification_runs": len(runs),
        "runs_by_verdict": by_verdict,
        "median_verification_ms": round(statistics.median(durations), 1) if durations else None,
        "last_scan_at": last_scan["started_at"] if last_scan else None,
        "scan_count": scans,
    }


def list_activity(limit: int = 30, project_id: str | None = None) -> list[dict]:
    with db.get_conn() as conn:
        if project_id:
            return db.rows(conn.execute("SELECT * FROM activity_events WHERE project_id=? ORDER BY id DESC LIMIT ?",
                                        (project_id, limit)))
        return db.rows(conn.execute("SELECT * FROM activity_events ORDER BY id DESC LIMIT ?", (limit,)))


def list_scans(project_id: str) -> list[dict]:
    with db.get_conn() as conn:
        get_project(conn, project_id)
        return db.rows(conn.execute("SELECT * FROM scan_runs WHERE project_id=? ORDER BY started_at DESC", (project_id,)))


def target_source(project_id: str) -> dict:
    with db.get_conn() as conn:
        get_project(conn, project_id)
    src = read_target()
    sha = scanner.sha256_text(src)
    return {"file": "document_portal.py", "sha256": sha, "state": target_state(sha), "source": src}
