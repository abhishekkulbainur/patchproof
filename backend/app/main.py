"""PatchProof API. Thin HTTP layer; workflow rules live in services/workflow.py and services/verdict.py."""
from __future__ import annotations

import json
import platform
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from . import db
from .config import settings
from .errors import ApiError
from .services import report, runner, scanner, workflow


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="PatchProof API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.exception_handler(ApiError)
async def api_error_handler(_req: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(RequestValidationError)
async def validation_handler(_req: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    msg = f"Invalid request: {'.'.join(str(x) for x in first.get('loc', []))} {first.get('msg', '')}".strip()
    return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": msg}})


# ------------------------------------------------------------------ models

class PatchProposalIn(BaseModel):
    source: Literal["template", "ai"] = "template"
    variant: Literal["ownership-check", "client-header-check"] = "ownership-check"


class ResetIn(BaseModel):
    confirm: bool = Field(..., description="Must be true")


# ------------------------------------------------------------------ meta

@app.get("/api/health")
def health():
    with db.get_conn() as conn:
        conn.execute("SELECT 1").fetchone()
    return {"status": "ok", "database": "ok", "demo_target": db.workspace_target().is_file()}


@app.get("/api/settings")
def get_settings():
    return {
        "demo_mode": True,
        "ai": {"configured": settings.ai_enabled, "provider": "OpenAI-compatible API" if settings.ai_enabled else None,
               "model": settings.openai_model if settings.ai_enabled else None},
        "analyzer": scanner.ANALYZER,
        "runner": runner.RUNNER_DESCRIPTION.format(timeout=settings.runner_timeout_s),
        "python": platform.python_version(),
        "scope": "Only the bundled Document Portal demo target can be scanned or tested. No external URLs, "
                 "uploads, or arbitrary code execution are supported.",
    }


# ------------------------------------------------------------------ projects

@app.get("/api/projects")
def projects():
    with db.get_conn() as conn:
        return db.rows(conn.execute("SELECT * FROM projects ORDER BY created_at"))


@app.get("/api/projects/{project_id}")
def project(project_id: str):
    with db.get_conn() as conn:
        return workflow.get_project(conn, project_id)


@app.get("/api/projects/{project_id}/overview")
def project_overview(project_id: str):
    return workflow.overview(project_id)


@app.get("/api/projects/{project_id}/workflow")
def project_workflow(project_id: str):
    return workflow.workflow_state(project_id)


@app.get("/api/projects/{project_id}/findings")
def project_findings(project_id: str, severity: str | None = None, status: str | None = None,
                     q: str | None = Query(None, max_length=100)):
    return workflow.list_findings(project_id, severity, status, q)


@app.get("/api/projects/{project_id}/scans")
def project_scans(project_id: str):
    return workflow.list_scans(project_id)


@app.post("/api/projects/{project_id}/scan")
def project_scan(project_id: str):
    return workflow.scan(project_id)


@app.get("/api/projects/{project_id}/source")
def project_source(project_id: str):
    return workflow.target_source(project_id)


@app.post("/api/projects/{project_id}/reset")
def project_reset(project_id: str, body: ResetIn):
    if not body.confirm:
        raise ApiError(400, "confirmation_required", "Reset requires confirm: true.")
    return workflow.reset(project_id)


# ------------------------------------------------------------------ findings / patches / runs

@app.get("/api/findings/{finding_id}")
def finding(finding_id: str):
    return workflow.finding_detail(finding_id)


@app.post("/api/findings/{finding_id}/reproduce")
def finding_reproduce(finding_id: str):
    return workflow.reproduce(finding_id)


@app.post("/api/findings/{finding_id}/patch-proposals")
def finding_propose(finding_id: str, body: PatchProposalIn):
    return workflow.propose_patch(finding_id, body.source, body.variant)


@app.get("/api/patches/{patch_id}")
def patch(patch_id: str):
    with db.get_conn() as conn:
        return workflow.get_patch(conn, patch_id)


@app.post("/api/patches/{patch_id}/approve")
def patch_approve(patch_id: str):
    return workflow.approve_patch(patch_id)


@app.post("/api/patches/{patch_id}/apply")
def patch_apply(patch_id: str):
    return workflow.apply_patch(patch_id)


@app.post("/api/findings/{finding_id}/verify")
def finding_verify(finding_id: str):
    return workflow.verify(finding_id)


@app.get("/api/verification-runs")
def runs(project_id: str | None = None, kind: Literal["reproduction", "verification"] | None = None):
    return workflow.list_runs(project_id, kind)


@app.get("/api/verification-runs/{run_id}")
def run(run_id: str):
    return workflow.get_run(run_id)


@app.get("/api/verification-runs/{run_id}/report")
def run_report(run_id: str, format: Literal["json", "html"] = "json", download: bool = False):
    rep = report.build_report(run_id)
    name = f"patchproof-{rep['report_id']}.{format}"
    headers = {"Content-Disposition": f'attachment; filename="{name}"'} if download else {}
    if format == "html":
        return HTMLResponse(report.render_html(rep), headers=headers)
    if download:
        return Response(json.dumps(rep, indent=2), media_type="application/json", headers=headers)
    return rep


@app.get("/api/activity")
def activity(limit: int = Query(30, ge=1, le=200), project_id: str | None = None):
    return workflow.list_activity(limit, project_id)
