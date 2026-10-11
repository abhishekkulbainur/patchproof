"""Evidence reports, assembled exclusively from persisted run data."""
from __future__ import annotations

from html import escape

from .. import db
from ..errors import ApiError
from . import workflow

LIMITATIONS = [
    "This report covers one seeded finding in a synthetic demo application. Passing these tests does not certify "
    "that the application, or any other application, is secure.",
    "Findings were produced by PatchProof's deterministic demo analysis (a small AST rule set), not a "
    "general-purpose scanner.",
    "Tests ran in a local Python subprocess with a timeout and minimal environment. This is not a container or "
    "VM sandbox.",
    "Test coverage is limited to the listed security and regression cases.",
]


def build_report(run_id: str) -> dict:
    run = workflow.get_run(run_id)
    if run["kind"] != "verification":
        raise ApiError(404, "no_report", "Evidence reports are generated for verification runs. "
                                         "This is a reproduction run.")
    with db.get_conn() as conn:
        finding = workflow.get_finding(conn, run["finding_id"])
        project = workflow.get_project(conn, run["project_id"])
        patch = workflow.get_patch(conn, run["patch_id"])
    repro = workflow.get_run(run["reproduction_run_id"]) if run["reproduction_run_id"] else None

    def tests(r, phase=None):
        return [{k: t[k] for k in ("test_id", "phase", "name", "expected", "request", "response_status",
                                   "response_excerpt", "assertions", "status", "error", "duration_ms")}
                for t in r["tests"] if phase is None or t["phase"] == phase]

    return {
        "report_id": f"RPT-{run['id'].split('-', 1)[1]}",
        "generated_at": db.now(),
        "generated_from": f"Saved verification run {run['id']}",
        "verdict": run["verdict"],
        "verdict_reasons": run["verdict_reasons"],
        "project": {"id": project["id"], "name": project["name"], "demo": bool(project["is_demo"])},
        "finding": {k: finding[k] for k in ("id", "title", "severity", "category", "cwe", "file", "function",
                                            "line_start", "line_end", "endpoint", "description", "expected",
                                            "severity_rationale", "status")},
        "reproduction": None if not repro else {
            "run_id": repro["id"], "outcome": repro["verdict"], "started_at": repro["started_at"],
            "duration_ms": repro["duration_ms"], "target_sha256": repro["target_sha"],
            "target_state": repro["target_state"], "reasons": repro["verdict_reasons"], "tests": tests(repro)},
        "patch": {k: patch[k] for k in ("id", "version", "source", "variant", "model", "title", "root_cause",
                                        "explanation", "minimality", "diff", "lines_added", "lines_removed",
                                        "original_sha", "patched_sha", "status", "created_at", "approved_at",
                                        "applied_at")},
        "verification": {
            "run_id": run["id"], "started_at": run["started_at"], "finished_at": run["finished_at"],
            "duration_ms": run["duration_ms"], "execution_status": run["execution_status"], "runner": run["runner"],
            "target_sha256": run["target_sha"], "target_state": run["target_state"], "summary": run["summary"],
            "security_tests": tests(run, "security"), "regression_tests": tests(run, "regression")},
        "logs": {"reproduction": repro["logs"] if repro else None, "verification": run["logs"]},
        "limitations": LIMITATIONS,
    }


VERDICT_COLOR = {"Verified": "#1f7a4d", "Failed": "#b42318", "Inconclusive": "#a15c07"}


def render_html(rep: dict) -> str:
    e = lambda v: escape("" if v is None else str(v))  # noqa: E731

    def test_rows(ts):
        out = []
        for t in ts:
            req = t["request"] or {}
            color = "#1f7a4d" if t["status"] == "passed" else "#b42318" if t["status"] == "failed" else "#a15c07"
            asserts = "".join(f"<li>{'&#10003;' if a['passed'] else '&#10007;'} {e(a['label'])}"
                              f" <span class=m>{e(a['detail'])}</span></li>" for a in t["assertions"])
            out.append(
                f"<tr><td class=m>{e(t['test_id'])}</td><td><b>{e(t['name'])}</b><br>"
                f"<span class=m>{e(req.get('method'))} {e(req.get('path'))} as {e(req.get('as_user') or 'anonymous')}"
                f"</span><br><span class=s>Expected: {e(t['expected'])}</span><ul>{asserts}</ul></td>"
                f"<td class=m>HTTP {e(t['response_status'])}</td>"
                f"<td style='color:{color};font-weight:600'>{e(t['status'].upper())}</td></tr>")
        return "".join(out)

    def diff_html(diff):
        lines = []
        for l in diff.splitlines():
            cls = "add" if l.startswith("+") and not l.startswith("+++") else \
                  "del" if l.startswith("-") and not l.startswith("---") else "hunk" if l.startswith("@@") else ""
            lines.append(f"<div class='{cls}'>{e(l) or '&nbsp;'}</div>")
        return "".join(lines)

    f, p, v, r = rep["finding"], rep["patch"], rep["verification"], rep["reproduction"]
    color = VERDICT_COLOR.get(rep["verdict"], "#444")
    repro_block = "<p>No reproduction run was recorded before this verification.</p>" if not r else (
        f"<p><b>{e(r['outcome'])}</b> &middot; run <span class=m>{e(r['run_id'])}</span> &middot; "
        f"{e(r['started_at'])} &middot; target <span class=m>{e(r['target_state'])}</span> "
        f"sha256 <span class=m>{e((r['target_sha256'] or '')[:16])}&hellip;</span></p>"
        f"<ul>{''.join(f'<li>{e(x)}</li>' for x in r['reasons'])}</ul>"
        f"<table><tr><th>ID</th><th>Test</th><th>Response</th><th>Result</th></tr>{test_rows(r['tests'])}</table>")
    return f"""<!doctype html><html lang=en><head><meta charset=utf-8>
<title>{e(rep['report_id'])} &middot; PatchProof evidence report</title>
<style>
body{{font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#17171a;max-width:960px;margin:32px auto;padding:0 20px}}
h1{{font-size:22px;margin:0}} h2{{font-size:15px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:28px}}
.m{{font-family:ui-monospace,Consolas,monospace;font-size:12.5px}} .s{{color:#555}}
table{{width:100%;border-collapse:collapse;margin-top:8px}} td,th{{border-top:1px solid #e5e5e5;padding:8px 6px;vertical-align:top;text-align:left}}
th{{font-size:12px;color:#555}} ul{{margin:4px 0;padding-left:18px}}
.verdict{{display:inline-block;padding:6px 14px;border:2px solid {color};color:{color};font-weight:700;font-size:18px;letter-spacing:.04em}}
.diff{{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;border:1px solid #ddd;padding:8px;white-space:pre-wrap}}
.add{{background:#e8f5ee}} .del{{background:#fbeaea}} .hunk{{color:#666}}
pre.log{{background:#f6f6f6;padding:10px;font-size:12px;white-space:pre-wrap;border:1px solid #e5e5e5}}
.banner{{background:#f4f4f4;border-left:3px solid #b42318;padding:8px 12px;font-size:13px}}
@media print{{body{{margin:0}} .noprint{{display:none}}}}
</style></head><body>
<p class=banner>Controlled demo environment &middot; synthetic data only &middot; generated from saved run data</p>
<p class=s>PatchProof &mdash; Security remediation, backed by evidence</p>
<h1>Evidence report {e(rep['report_id'])}</h1>
<p class=s>Generated {e(rep['generated_at'])} from {e(rep['generated_from'])}</p>
<p class=noprint><button onclick="window.print()">Print / save as PDF</button></p>

<h2>Verdict</h2>
<p><span class=verdict>{e(rep['verdict']).upper()}</span></p>
<ul>{''.join(f'<li>{e(x)}</li>' for x in rep['verdict_reasons'])}</ul>

<h2>Finding</h2>
<table>
<tr><th>Project</th><td>{e(rep['project']['name'])} <span class=m>({e(rep['project']['id'])})</span></td></tr>
<tr><th>Finding</th><td><span class=m>{e(f['id'])}</span> &mdash; {e(f['title'])}</td></tr>
<tr><th>Severity</th><td>{e(f['severity'])} &middot; {e(f['category'])} &middot; {e(f['cwe'])}</td></tr>
<tr><th>Location</th><td class=m>{e(f['file'])}:{e(f['line_start'])}-{e(f['line_end'])} {e(f['function'])}() &middot; {e(f['endpoint'])}</td></tr>
<tr><th>Description</th><td>{e(f['description'])}</td></tr>
<tr><th>Expected</th><td>{e(f['expected'])}</td></tr>
<tr><th>Severity rationale</th><td>{e(f['severity_rationale'])}</td></tr>
</table>

<h2>Before the fix &mdash; reproduction</h2>
{repro_block}

<h2>Patch</h2>
<p><b>{e(p['title'])}</b><br><span class=m>{e(p['id'])} v{e(p['version'])} &middot; source: {e('demo patch template' if p['source']=='template' else 'AI proposal (' + str(p['model']) + ')')} &middot; +{e(p['lines_added'])} &minus;{e(p['lines_removed'])} lines &middot; approved {e(p['approved_at'])} &middot; applied {e(p['applied_at'])}</span></p>
<p><b>Root cause.</b> {e(p['root_cause'])}</p>
<p><b>Change.</b> {e(p['explanation'])}</p>
<p><b>Why minimal.</b> {e(p['minimality'])}</p>
<div class=diff>{diff_html(p['diff'])}</div>
<p class="m s">original sha256 {e(p['original_sha'])}<br>patched&nbsp; sha256 {e(p['patched_sha'])}<br>tested&nbsp;&nbsp; sha256 {e(v['target_sha256'])}</p>

<h2>After the fix &mdash; security verification</h2>
<p class=s>Run <span class=m>{e(v['run_id'])}</span> &middot; {e(v['started_at'])} &rarr; {e(v['finished_at'])} &middot; {e(v['duration_ms'])} ms &middot; {e(v['runner'])}</p>
<table><tr><th>ID</th><th>Test</th><th>Response</th><th>Result</th></tr>{test_rows(v['security_tests'])}</table>

<h2>Regression tests</h2>
<table><tr><th>ID</th><th>Test</th><th>Response</th><th>Result</th></tr>{test_rows(v['regression_tests'])}</table>

<h2>Logs</h2>
<pre class=log>{e(rep['logs']['reproduction'] or '(no reproduction log)')}</pre>
<pre class=log>{e(rep['logs']['verification'])}</pre>

<h2>Limitations</h2>
<ul>{''.join(f'<li>{e(x)}</li>' for x in rep['limitations'])}</ul>
</body></html>"""
