"""End-to-end API tests for the IDOR before/after scenario (real subprocess harness, real assertions)."""
from app import db
from app.config import DEMO_PROJECT_ID

P = DEMO_PROJECT_ID
F = "PP-AUTHZ-001"


def scan(client):
    r = client.post(f"/api/projects/{P}/scan")
    assert r.status_code == 200, r.text
    return r.json()


def propose_approve_apply(client, variant="ownership-check"):
    r = client.post(f"/api/findings/{F}/patch-proposals", json={"source": "template", "variant": variant})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    assert client.post(f"/api/patches/{pid}/approve").status_code == 200
    r = client.post(f"/api/patches/{pid}/apply")
    assert r.status_code == 200, r.text
    return pid


def test_health_and_seed_once(client):
    assert client.get("/api/health").json()["status"] == "ok"
    db.init_db()  # simulate restart
    assert len(client.get("/api/projects").json()) == 1


def test_scan_detects_seeded_findings(client):
    res = scan(client)
    assert set(res["new_findings"]) == {"PP-AUTHZ-001", "PP-INFO-002", "PP-CONF-003"}
    findings = client.get(f"/api/projects/{P}/findings", params={"severity": "High"}).json()
    assert [f["id"] for f in findings] == [F]
    assert client.get(f"/api/projects/{P}/findings", params={"q": "debug"}).json()[0]["id"] == "PP-CONF-003"


def test_full_flow_reaches_verified(client):
    scan(client)
    repro = client.post(f"/api/findings/{F}/reproduce").json()
    assert repro["verdict"] == "Reproduced"
    sec01 = next(t for t in repro["tests"] if t["test_id"] == "SEC-01")
    assert sec01["status"] == "failed" and sec01["response_status"] == 200
    assert "Q3 vendor contract" in sec01["response_excerpt"]  # Bob actually received Alice's document

    pid = propose_approve_apply(client)
    run = client.post(f"/api/findings/{F}/verify").json()
    assert run["verdict"] == "Verified", run["verdict_reasons"]
    by_id = {t["test_id"]: t for t in run["tests"]}
    assert by_id["SEC-01"]["status"] == "passed" and by_id["SEC-01"]["response_status"] == 404
    assert by_id["SEC-02"]["status"] == "passed"
    assert all(by_id[t]["status"] == "passed" for t in ("REG-01", "REG-02", "REG-03", "REG-04", "REG-05"))
    assert run["patch_id"] == pid and run["reproduction_run_id"] == repro["id"]

    rep = client.get(f"/api/verification-runs/{run['id']}/report").json()
    assert rep["verdict"] == "Verified"
    assert rep["verification"]["summary"] == run["summary"]
    assert rep["reproduction"]["run_id"] == repro["id"]
    html = client.get(f"/api/verification-runs/{run['id']}/report", params={"format": "html", "download": True})
    assert html.status_code == 200 and "attachment" in html.headers["content-disposition"]
    assert "VERIFIED" in html.text

    # The scanner no longer flags the IDOR in the patched code
    assert "PP-AUTHZ-001" not in [d for d in scan(client)["new_findings"]]
    assert client.get(f"/api/findings/{F}").json()["detected_in_last_scan"] == 0


def test_flawed_patch_is_failed_not_verified(client):
    scan(client)
    client.post(f"/api/findings/{F}/reproduce")
    propose_approve_apply(client, "client-header-check")
    run = client.post(f"/api/findings/{F}/verify").json()
    assert run["verdict"] == "Failed"
    by_id = {t["test_id"]: t for t in run["tests"]}
    assert by_id["SEC-01"]["status"] == "passed"   # naive ID swap is blocked...
    assert by_id["SEC-03"]["status"] == "failed"   # ...but a forged client header still leaks the document
    assert client.get(f"/api/findings/{F}").json()["status"] == "verification_failed"


def test_verify_requires_applied_patch(client):
    scan(client)
    client.post(f"/api/findings/{F}/reproduce")
    r = client.post(f"/api/findings/{F}/verify")
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_applied_patch"
    pid = client.post(f"/api/findings/{F}/patch-proposals", json={}).json()["id"]
    r = client.post(f"/api/patches/{pid}/apply")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_approved"


def test_without_reproduction_result_is_inconclusive(client):
    scan(client)
    propose_approve_apply(client)
    run = client.post(f"/api/findings/{F}/verify").json()
    assert run["verdict"] == "Inconclusive"


def test_tampered_target_is_inconclusive(client):
    scan(client)
    client.post(f"/api/findings/{F}/reproduce")
    propose_approve_apply(client)
    path = db.workspace_target()
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered\n", encoding="utf-8")
    run = client.post(f"/api/findings/{F}/verify").json()
    assert run["verdict"] == "Inconclusive"


def test_reset_restores_vulnerable_state_and_keeps_history(client):
    scan(client)
    client.post(f"/api/findings/{F}/reproduce")
    propose_approve_apply(client)
    first = client.post(f"/api/findings/{F}/verify").json()
    assert client.post(f"/api/projects/{P}/reset", json={"confirm": False}).status_code == 400
    assert client.post(f"/api/projects/{P}/reset", json={"confirm": True}).status_code == 200
    assert client.get(f"/api/projects/{P}/source").json()["state"] == "original"
    assert client.get(f"/api/findings/{F}").json()["status"] == "open"
    assert client.post(f"/api/findings/{F}/reproduce").json()["verdict"] == "Reproduced"
    assert client.get(f"/api/verification-runs/{first['id']}").status_code == 200
    wf = client.get(f"/api/projects/{P}/workflow").json()
    assert [s["status"] for s in wf["steps"]][:3] == ["current", "done", "locked"]


def test_non_verifiable_finding_rejects_automation(client):
    scan(client)
    r = client.post("/api/findings/PP-INFO-002/reproduce")
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_verifiable"


def test_ai_source_without_key_is_rejected(client):
    scan(client)
    r = client.post(f"/api/findings/{F}/patch-proposals", json={"source": "ai"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "ai_not_configured"
