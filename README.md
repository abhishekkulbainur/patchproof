# PatchProof — The Verified Fix

> **Security remediation, backed by evidence.**
> From detected vulnerabilities to independently verified fixes.

PatchProof shows a full remediation loop on a deliberately vulnerable demo app:

**SCAN → PROVE → PATCH → VERIFY → REGRESSION TEST → EVIDENCE REPORT**

The core rule is that a suggested patch is not a verified fix. PatchProof only reports **Verified** when
independent, deterministic tests show that the original exploit is now blocked and legitimate behaviour still works.

> ⚠️ **Controlled prototype.** It scans and tests one bundled, synthetic demo target only. A Verified result
> applies to that single seeded scenario. It does not certify any application as secure.

---

## What the prototype actually implements

| Area | Implemented |
|---|---|
| Demo target | `backend/demo_target/original/document_portal.py`: a framework-free “Document Portal” with synthetic users Alice and Bob and one seeded IDOR flaw in `get_document()`. |
| Scan | Deterministic **demo analysis**: three AST rules (`backend/app/services/scanner.py`). It finds the IDOR (High, CWE-639), a stack trace returned in error responses (Medium, CWE-209) and a hard-coded `DEBUG = True` (Low, CWE-489). Each scan re-reads the working copy, so after a correct patch the IDOR is no longer flagged. |
| Prove | A real request/response test (`SEC-01`): Bob's session asks for Alice's `doc-1041`. Before the fix it returns HTTP 200 with her document. A control test (`SEC-02`) confirms the app otherwise works. |
| Patch | Two **demo patch templates** (no AI): a correct server-side ownership check, plus a deliberately flawed one that trusts a client header (used to demo a **Failed** verdict). An optional **AI proposal** is available when an API key is configured. Its output is validated, limited to changing `get_document()` only, shown as a diff, and must pass the same tests. |
| Apply | Needs explicit review and approval first. The patch is written to a working copy under `backend/var/workspace/`. The pristine original is never modified. The patch's SHA-256 values are recorded. |
| Verify + regression | 3 security tests (ID swap, forged identity header, owner access) and 5 regression tests (second-owner access, reverse cross-user read, missing ID, list endpoint, unauthenticated request). They run in a separate `python -I` subprocess with a timeout. |
| Verdict | Computed only on the server, in `backend/app/services/verdict.py`. The frontend just renders it. |
| Evidence report | Built from saved run data. Viewable in the UI and downloadable as **JSON** and as a **printable HTML** page (use “Print / save as PDF” in the browser). |
| Persistence | SQLite tables: `projects`, `scan_runs`, `findings`, `patches`, `verification_runs`, `test_results`, `activity_events`. The demo project is seeded once. History survives restarts and resets. |

### Verdict rules (`verdict.py`)

- **Verified**: all of the following hold:
  - the vulnerability was reproduced in this demo cycle against the exact code the patch was written for;
  - the approved patch is applied;
  - the tested file's SHA-256 matches the patch;
  - all 8 required tests pass.
- **Failed**: any required security or regression assertion fails.
- **Inconclusive**: a test is missing, errored or timed out; there was no prior reproduction; or the tested code doesn't match the approved patch.
- **Pending**: the workflow has no final verdict yet.

---

## Architecture

```
patchproof/
├── backend/                     Python 3.11+ · FastAPI · SQLite
│   ├── app/
│   │   ├── main.py              HTTP routes (thin)
│   │   ├── config.py            env/.env settings (API key stays server-side)
│   │   ├── db.py                schema, seeding, helpers
│   │   └── services/
│   │       ├── scanner.py       deterministic AST demo analysis
│   │       ├── runner.py        subprocess test execution (timeout, minimal env)
│   │       ├── patcher.py       demo templates + optional validated AI proposal
│   │       ├── verdict.py       ALL verdict logic
│   │       ├── workflow.py      state transitions & preconditions
│   │       └── report.py        JSON + printable HTML report from saved data
│   ├── demo_target/
│   │   ├── original/document_portal.py   pristine vulnerable baseline
│   │   └── harness.py           security + regression tests (runs in child process)
│   ├── tests/                   pytest: verdict unit tests + end-to-end IDOR flow
│   └── var/                     (git-ignored) patchproof.db + workspace copy
└── frontend/                    React 18 · TypeScript · Vite · Tailwind CSS · lucide-react
    └── src/
        ├── api.ts, types.ts     typed API client
        ├── lib/                 data hooks, toasts, formatting
        ├── components/          Shell, RemediationWorkspace, DiffView, TestResults,
        │                        FindingsTable, AuthorizationTraceBackground, …
        └── pages/               Overview, Demo, Projects, Findings, FindingDetail,
                                 Runs, RunDetail, Reports, Settings
```

The Vite dev server proxies `/api` to `127.0.0.1:8000`, so the browser only talks to one origin.

---

## Prerequisites

- Python **3.11+** (developed on 3.12)
- Node.js **18+** (developed on 24) and npm

## Install & run

**Windows (PowerShell), from the repo root:**

```powershell
.\setup.ps1            # creates backend/.venv, installs deps, copies .env.example -> .env, npm install
.\start-backend.ps1    # terminal 1 -> http://127.0.0.1:8000
.\start-frontend.ps1   # terminal 2 -> http://localhost:5173
```

**Manual / macOS / Linux:**

```bash
# backend
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # optional
uvicorn app.main:app --host 127.0.0.1 --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Health check: http://127.0.0.1:8000/api/health

## Environment variables (`backend/.env`)

Every variable is optional. See `backend/.env.example`.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enables the “AI proposal” patch source. Read only by the server and never sent to the browser. |
| `OPENAI_MODEL` | Model name to request. Both the key and the model must be set to enable AI. |
| `OPENAI_BASE_URL` | Any OpenAI-compatible chat-completions endpoint (default `https://api.openai.com/v1`). |
| `PATCHPROOF_DATA_DIR` | Where the SQLite DB and the workspace live (default `backend/var`). |

### Demo mode without an API key

Without a key everything still works. Patches come from the **pre-authored demo patch templates** and are labelled
that way in the UI, the database and the reports. The AI option is shown disabled with an explanation. No AI response is faked.

## Running the demo (judge script, ~2 minutes)

1. Click **Run demo workflow** on the Overview page.
2. **A. Scan project**: three findings are recorded. Steps B–D are for `PP-AUTHZ-001`.
3. **B. Reproduce vulnerability**: SEC-01 fails, and the response body shows Bob received Alice's contract.
4. **C. Generate patch** (server-side ownership check) → review the diff → tick *I have reviewed this diff* → **Approve** → **Apply patch to demo**.
5. **D. Run security verification**: 3/3 security and 5/5 regression tests pass → **Verified**.
6. **Open evidence report** → download the JSON/HTML or open the printable view.

**Show a Failed verdict:** click **Reset demo**, then scan and reproduce again. This time choose the *“trusts client header (deliberately flawed)”* template.
It blocks the naive ID swap (SEC-01 passes), but SEC-03 forges the header and still reads Alice's document → **Failed**.

**Reset** restores the original vulnerable code, marks the applied patch as reverted and starts a new demo cycle.
All earlier runs and reports are kept.

## Tests

```bash
cd backend
.venv\Scripts\python -m pytest -q      # Windows
# .venv/bin/python -m pytest -q        # macOS/Linux
```

- `tests/test_verdict.py`: unit tests for every verdict rule (Verified, Failed, missing test, errored test, timeout, no reproduction, patch not applied, hash mismatch, unknown status).
- `tests/test_idor_flow.py`: end-to-end API tests using the real subprocess harness. They cover:
  - the full flow to Verified;
  - the flawed patch → Failed;
  - verification with no applied patch → 409, and applying without approval → 409;
  - a patch with no prior reproduction → Inconclusive;
  - a tampered working copy → Inconclusive;
  - reset and history retention;
  - non-verifiable findings rejecting automation;
  - an AI request with no key configured → 422;
  - report contents matching the saved run.

Frontend type-check and build: `cd frontend && npm run build`.

## Design notes

- Visual style: a light, clean product UI. It uses white rounded cards on a soft multi-colour gradient wash.
  - Indigo is the brand colour for primary actions. Rose is used only for vulnerabilities and failures, emerald only for passed or verified results, and amber for pending or inconclusive.
  - Fonts are Plus Jakarta Sans (UI) and JetBrains Mono (code, with ligatures off), bundled via `@fontsource` so the app works offline.
- Motion: page fade-in transitions, a sliding mobile navigation drawer, smooth expand and collapse on test results, an animated progress stepper, toast slide-ins and loading skeletons. All motion is disabled under `prefers-reduced-motion`.
- Signature visual: `AuthorizationTraceBackground.tsx` is a **custom-built** SVG diagram of `User → API → Authorization check → Resource`.
  - Its state comes from backend results: it shows a red leak when the bug is reproduced, the trace stopping at the gate when Verified, and the trace passing through when Failed.
  - The concept of thin animated line paths was inspired by Aceternity UI's *Background Lines*. No third-party component code was copied, and no animation library is used.
  - Motion pauses off-screen and in hidden tabs.

## Safety boundaries

- Only the bundled demo target can be scanned or tested. There is no URL scanning, crawling, code upload or arbitrary code execution.
- Tests run in a **local Python subprocess** (`python -I`, minimal environment, 15 s timeout). This is **not** a container or VM sandbox.
- All users, sessions and documents are synthetic. No secrets are stored, and `.env` is git-ignored.

## Known limitations & future work

- There is one automated scenario (IDOR). The two other findings are for display and manual review only.
- The analyzer is a small rule set written for the demo target's shape, not a general SAST tool.
- There is no container isolation, no multi-user auth for PatchProof itself, and no PDF export (use the browser's print-to-PDF on the HTML report).
- The AI path is implemented, but it was not exercised during development because no key was available.
- Future work: real repository ingestion, more vulnerability classes with matching test generators, container-isolated runners, and CI integration.
#   p a t c h p r o o f  
 