"""
Executes the demo test harness in a separate, short-lived Python subprocess.

Isolation boundary (described honestly): a child `python -I` process with a
timeout, a minimal environment, and the workspace directory as its cwd. It is
NOT a container or VM sandbox; it only ever runs the bundled harness against
the bundled demo target.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field

from ..config import HARNESS, settings

RUNNER_DESCRIPTION = "Local subprocess (python -I, minimal env, {timeout:.0f}s timeout) — not a container"


@dataclass
class RunOutput:
    execution_status: str  # completed | error | timeout
    results: list[dict] = field(default_factory=list)
    target_sha: str | None = None
    duration_ms: float = 0.0
    logs: list[str] = field(default_factory=list)


def run_suite(suite: str, target_path) -> RunOutput:
    cmd = [sys.executable, "-I", str(HARNESS), "--target", str(target_path), "--suite", suite]
    env = {k: os.environ[k] for k in ("SYSTEMROOT", "PATH", "TEMP", "TMP") if k in os.environ}
    logs = [f"$ python -I harness.py --target {target_path.name} --suite {suite}"]
    started = time.perf_counter()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=settings.runner_timeout_s,
                              cwd=str(target_path.parent), env=env)
    except subprocess.TimeoutExpired:
        logs.append(f"!! harness exceeded {settings.runner_timeout_s:.0f}s timeout and was terminated")
        return RunOutput("timeout", duration_ms=_ms(started), logs=logs)
    duration = _ms(started)
    if proc.stderr.strip():
        logs.extend("stderr: " + line for line in proc.stderr.strip().splitlines()[-20:])
    if proc.returncode != 0:
        logs.append(f"!! harness exited with code {proc.returncode}")
        return RunOutput("error", duration_ms=duration, logs=logs)
    try:
        payload = json.loads(proc.stdout)
        results = payload["results"]
    except (ValueError, KeyError) as exc:
        logs.append(f"!! could not parse harness output: {exc}")
        return RunOutput("error", duration_ms=duration, logs=logs)

    logs.append(f"python {payload.get('python')} | target sha256 {payload['target_sha256'][:12]}…")
    for r in results:
        logs.append(f"[{r['status'].upper():7}] {r['test_id']} {r['name']} "
                    f"→ HTTP {r['response_status']} ({r['duration_ms']} ms)")
        for a in r["assertions"]:
            logs.append(f"           {'ok ' if a['passed'] else 'FAIL'} {a['label']}: {a['detail']}")
        if r.get("error"):
            logs.append(f"           error: {r['error']}")
    logs.append(f"harness finished in {duration} ms")
    return RunOutput("completed", results=results, target_sha=payload["target_sha256"],
                     duration_ms=duration, logs=logs)


def _ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 1)
