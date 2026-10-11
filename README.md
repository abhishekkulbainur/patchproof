# PatchProof
### From detected vulnerabilities to independently verified fixes.

**Security remediation, backed by evidence.**

PatchProof is a security-remediation prototype that demonstrates how a vulnerability can be detected, reproduced, patched, and independently verified through security and regression testing.

A suggested patch is not automatically a verified fix. PatchProof requires evidence that the original exploit is blocked and legitimate application behaviour continues to work.

---

## The Remediation Workflow

**SCAN → PROVE → PATCH → VERIFY → REGRESSION TEST → EVIDENCE REPORT**

Each stage builds on the evidence collected in the previous stage, ending with a server-generated verdict.

## Key Features

- **Deterministic Vulnerability Analysis** — Identifies three seeded security findings using Python AST-based rules.
- **Exploit Reproduction** — Demonstrates an Insecure Direct Object Reference (IDOR) vulnerability through a real request/response test.
- **Patch Generation** — Offers predefined remediation templates and an optional AI-generated patch proposal when an API key is configured.
- **Human-Approved Changes** — Requires explicit review and approval before applying a patch to the working copy.
- **Independent Verification** — Executes security and regression tests in a separate Python subprocess.
- **Evidence-Based Verdicts** — Determines the final result on the server using test outcomes, reproduction history, patch approval and file integrity.
- **Downloadable Evidence** — Provides JSON and printable HTML reports.
- **Persistent History** — Stores projects, findings, patches, verification results and activity records in SQLite.

## How It Works

| Stage | What Happens |
|---|---|
| 01 — Scan | Analyse the bundled demo application and record security findings. |
| 02 — Prove | Reproduce the seeded vulnerability and capture the result. |
| 03 — Patch | Generate a proposed fix and review the code diff. |
| 04 — Approve | Explicitly approve the proposed change before applying it. |
| 05 — Verify | Execute security tests against the patched working copy. |
| 06 — Test | Run regression tests to ensure legitimate functionality remains intact. |
| 07 — Report | Generate an evidence report containing the recorded results. |

## Verification Verdicts

**Verified** — The vulnerability was reproduced, the approved patch was applied, the tested file matches the approved patch's SHA-256 hash, and all eight required tests pass.

**Failed** — At least one required security or regression assertion fails.

**Inconclusive** — Verification cannot establish a reliable result because of missing tests, errors, timeouts, absent reproduction evidence or an integrity mismatch.

**Pending** — The workflow has not reached a final verdict.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Python 3.11+, FastAPI |
| Database | SQLite |
| Security Analysis | Python AST-based rules |
| Verification | Pytest, isolated Python subprocess |
| Reporting | JSON, printable HTML |
| Optional AI | OpenAI-compatible chat-completions API |

## Getting Started

### Prerequisites

- Python 3.11 or later
- Node.js 18 or later
- npm

### Windows — Quick Setup

Run the following commands from the project root in PowerShell.

**1. Install dependencies**

```powershell
.\setup.ps1
```

**2. Start the backend**

Open a terminal:

```powershell
.\start-backend.ps1
```

**3. Start the frontend**

Open a second terminal:

```powershell
.\start-frontend.ps1
```

**4. Open PatchProof**

- Frontend: http://localhost:5173
- Backend health check: http://127.0.0.1:8000/api/health

## Run the Demonstration

1. Open the Overview page.
2. Select **Run demo workflow**.
3. Scan the bundled Document Portal.
4. Reproduce the seeded IDOR vulnerability.
5. Generate a patch and review its diff.
6. Approve and apply the patch.
7. Run security verification and regression tests.
8. Review the final verdict and download the evidence report.

To demonstrate a failed remediation, reset the demo and choose the deliberately flawed patch template that trusts a client-supplied identity header. The additional security test should expose the weakness.

## Optional AI Configuration

PatchProof works without an API key by using its predefined demonstration patches.

To enable AI-generated patch proposals, configure the following variables in `backend/.env`:

```env
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=your_model_name
OPENAI_BASE_URL=https://api.openai.com/v1
```

The API key remains server-side. AI-generated proposals are restricted to the intended function, displayed for review, and subjected to the same verification workflow.

Do not commit real API keys or other secrets.

## Running Tests

Run backend tests from the `backend` directory:

```powershell
.venv\Scripts\python -m pytest -q
```

Build and type-check the frontend:

```powershell
cd frontend
npm run build
```

## Project Structure

```text
patchproof/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   └── services/
│   │       ├── scanner.py
│   │       ├── runner.py
│   │       ├── patcher.py
│   │       ├── verdict.py
│   │       ├── workflow.py
│   │       └── report.py
│   ├── demo_target/
│   │   ├── original/
│   │   └── harness.py
│   ├── tests/
│   └── var/
└── frontend/
    └── src/
        ├── components/
        └── pages/
```

## Scope and Security Limitations

PatchProof is a controlled prototype, not a production security scanner.

- Scanning and verification are limited to one bundled synthetic demo application.
- The automated remediation scenario covers one seeded IDOR vulnerability.
- Two additional findings are identified for demonstration and manual review.
- Test execution uses a separate Python subprocess with a restricted environment and timeout, but **does not use container or virtual-machine isolation**.
- The optional AI patch-generation path has not been fully validated with a configured API key.
- A Verified result applies only to the specific demonstration scenario and does not certify an entire application as secure.

## Roadmap

- Repository ingestion and broader source-code analysis
- Additional vulnerability classes and corresponding security tests
- Container-isolated verification runners
- Continuous integration integration
- Expanded evidence collection and reporting

---

**PatchProof — From detected vulnerabilities to independently verified fixes.**
