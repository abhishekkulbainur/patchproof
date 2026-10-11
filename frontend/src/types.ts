// Shapes returned by the PatchProof API (backend/app/main.py).

export type Severity = "Critical" | "High" | "Medium" | "Low";
export type FindingStatus =
  | "open" | "reproduced" | "patch_proposed" | "patch_approved" | "patch_applied"
  | "verified" | "verification_failed" | "inconclusive";
export type Verdict = "Verified" | "Failed" | "Inconclusive" | "Reproduced" | "Not reproduced";
export type TestStatus = "passed" | "failed" | "error";

export interface Project {
  id: string; name: string; description: string; language: string; target_file: string;
  is_demo: number; cycle: number; created_at: string;
}

export interface ScanStep { step: string; detail: string; duration_ms: number }
export interface ScanRun {
  id: string; project_id: string; cycle: number; analyzer: string; target_sha: string;
  started_at: string; finished_at: string | null; duration_ms: number | null; status: string;
  findings_detected: number; steps: ScanStep[];
}

export interface Finding {
  id: string; project_id: string; rule_id: string; title: string; severity: Severity; category: string;
  cwe: string; status: FindingStatus; file: string; function: string | null; line_start: number | null;
  line_end: number | null; endpoint: string | null; description: string; expected: string; observed: string;
  severity_rationale: string; evidence: Record<string, unknown>; verifiable: number; detected_in_last_scan: number;
  first_detected_at: string; last_checked_at: string; last_scan_id: string | null;
}

export interface Patch {
  id: string; finding_id: string; cycle: number; version: number; source: "template" | "ai"; variant: string;
  model: string | null; title: string; explanation: string; root_cause: string; minimality: string; diff: string;
  lines_added: number; lines_removed: number; original_sha: string; patched_sha: string;
  status: "proposed" | "approved" | "applied" | "superseded" | "reverted";
  created_at: string; approved_at: string | null; applied_at: string | null; reverted_at: string | null;
}

export interface Assertion { label: string; passed: boolean; detail: string }
export interface TestResult {
  id: number; run_id: string; seq: number; test_id: string; phase: "security" | "regression"; name: string;
  description: string; required: number; expected: string;
  request: { method: string; path: string; as_user: string | null; session: string | null; headers: Record<string, string> } | null;
  response_status: number | null; response_excerpt: string | null; assertions: Assertion[];
  status: TestStatus; error: string | null; duration_ms: number | null;
}

export interface RunSummary { total: number; passed: number; failed: number; error: number }
export interface Run {
  id: string; project_id: string; finding_id: string; cycle: number; kind: "reproduction" | "verification";
  patch_id: string | null; reproduction_run_id: string | null; target_sha: string | null; target_state: string;
  started_at: string; finished_at: string | null; duration_ms: number | null; execution_status: string;
  verdict: Verdict; verdict_reasons: string[]; runner: string; logs?: string; summary: RunSummary;
  tests?: TestResult[];
  finding?: { id: string; title: string; severity: Severity; status: FindingStatus } | null;
  patch?: Pick<Patch, "id" | "version" | "source" | "variant" | "title" | "status" | "lines_added" | "lines_removed" | "patched_sha" | "original_sha"> | null;
  reproduction?: { id: string; verdict: Verdict; started_at: string; target_sha: string } | null;
}

export interface FindingDetail extends Finding {
  project: { id: string; name: string; cycle: number };
  patches: Patch[];
  active_patch: Patch | null;
  latest_reproduction: Run | null;
  latest_verification: Run | null;
  code: { file: string; start: number; highlight: [number, number]; lines: string[] };
}

export interface WorkflowStep { index: number; title: string; status: "done" | "current" | "locked" }
export interface WorkflowState {
  project_id: string; cycle: number; steps: WorkflowStep[]; scan_id: string | null; finding_id: string | null;
  finding_status: FindingStatus | null; reproduction: { id: string; verdict: Verdict } | null;
  patch: { id: string; status: Patch["status"] } | null; verification: { id: string; verdict: Verdict } | null;
}

export interface Overview {
  project: Project; open_findings: number; open_by_severity: Record<"High" | "Medium" | "Low", number>;
  total_findings: number; verification_runs: number;
  runs_by_verdict: Record<"Verified" | "Failed" | "Inconclusive", number>;
  median_verification_ms: number | null; last_scan_at: string | null; scan_count: number;
}

export interface ActivityEvent {
  id: number; ts: string; type: string; level: "info" | "warning" | "error" | "success"; message: string;
  project_id: string | null; finding_id: string | null; run_id: string | null; patch_id: string | null; scan_id: string | null;
}

export interface AppSettings {
  demo_mode: boolean; ai: { configured: boolean; provider: string | null; model: string | null };
  analyzer: string; runner: string; python: string; scope: string;
}

export interface TargetSource { file: string; sha256: string; state: string; source: string }
