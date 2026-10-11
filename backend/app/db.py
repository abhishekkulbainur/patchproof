"""SQLite persistence: schema, connection helper, seeding, and small utilities."""
from __future__ import annotations

import json
import secrets
import shutil
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DEMO_PROJECT_ID, ORIGINAL_TARGET, TARGET_RELPATH, settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    language TEXT NOT NULL,
    target_file TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 1,
    cycle INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    cycle INTEGER NOT NULL,
    analyzer TEXT NOT NULL,
    target_sha TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms REAL,
    status TEXT NOT NULL,
    findings_detected INTEGER NOT NULL DEFAULT 0,
    steps TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    rule_id TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    cwe TEXT NOT NULL,
    status TEXT NOT NULL,
    file TEXT NOT NULL,
    function TEXT,
    line_start INTEGER,
    line_end INTEGER,
    endpoint TEXT,
    description TEXT NOT NULL,
    expected TEXT NOT NULL,
    observed TEXT NOT NULL,
    severity_rationale TEXT NOT NULL,
    evidence TEXT NOT NULL,
    verifiable INTEGER NOT NULL DEFAULT 0,
    detected_in_last_scan INTEGER NOT NULL DEFAULT 1,
    first_detected_at TEXT NOT NULL,
    last_checked_at TEXT NOT NULL,
    last_scan_id TEXT,
    UNIQUE(project_id, rule_id)
);

CREATE TABLE IF NOT EXISTS patches (
    id TEXT PRIMARY KEY,
    finding_id TEXT NOT NULL REFERENCES findings(id),
    cycle INTEGER NOT NULL,
    version INTEGER NOT NULL,
    source TEXT NOT NULL,
    variant TEXT NOT NULL,
    model TEXT,
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    root_cause TEXT NOT NULL,
    minimality TEXT NOT NULL,
    diff TEXT NOT NULL,
    lines_added INTEGER NOT NULL,
    lines_removed INTEGER NOT NULL,
    original_sha TEXT NOT NULL,
    patched_sha TEXT NOT NULL,
    patched_source TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    approved_at TEXT,
    applied_at TEXT,
    reverted_at TEXT
);

CREATE TABLE IF NOT EXISTS verification_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    finding_id TEXT NOT NULL REFERENCES findings(id),
    cycle INTEGER NOT NULL,
    kind TEXT NOT NULL,
    patch_id TEXT REFERENCES patches(id),
    reproduction_run_id TEXT,
    target_sha TEXT,
    target_state TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms REAL,
    execution_status TEXT NOT NULL,
    verdict TEXT NOT NULL,
    verdict_reasons TEXT NOT NULL DEFAULT '[]',
    runner TEXT NOT NULL,
    logs TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES verification_runs(id),
    seq INTEGER NOT NULL,
    test_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    expected TEXT NOT NULL,
    request TEXT,
    response_status INTEGER,
    response_excerpt TEXT,
    assertions TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL,
    error TEXT,
    duration_ms REAL
);

CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    project_id TEXT,
    finding_id TEXT,
    run_id TEXT,
    patch_id TEXT,
    scan_id TEXT
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(3).upper()}"


def connect() -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


JSON_FIELDS = {"steps", "evidence", "verdict_reasons", "request", "assertions"}


def row(r: sqlite3.Row | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    for k in JSON_FIELDS & d.keys():
        if isinstance(d[k], str):
            d[k] = json.loads(d[k])
    return d


def rows(rs) -> list[dict]:
    return [row(r) for r in rs]


def log_event(conn, type_: str, message: str, level: str = "info", **refs) -> None:
    conn.execute(
        "INSERT INTO activity_events (ts, type, level, message, project_id, finding_id, run_id, patch_id, scan_id)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (now(), type_, level, message, refs.get("project_id"), refs.get("finding_id"),
         refs.get("run_id"), refs.get("patch_id"), refs.get("scan_id")),
    )


def workspace_target():
    return settings.workspace_dir / TARGET_RELPATH


def restore_workspace() -> None:
    settings.workspace_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ORIGINAL_TARGET, workspace_target())


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        exists = conn.execute("SELECT 1 FROM projects WHERE id = ?", (DEMO_PROJECT_ID,)).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO projects (id, name, description, language, target_file, is_demo, cycle, created_at)"
                " VALUES (?,?,?,?,?,1,1,?)",
                (DEMO_PROJECT_ID, "Document Portal — Demo",
                 "Synthetic document-sharing service with seeded users (Alice, Bob) and one deliberately seeded "
                 "authorization flaw. Runs only inside PatchProof's local test harness.",
                 "Python", TARGET_RELPATH, now()),
            )
            log_event(conn, "project_seeded", "Demo project “Document Portal — Demo” seeded",
                      project_id=DEMO_PROJECT_ID)
    if not workspace_target().is_file():
        restore_workspace()
