import type {
  ActivityEvent, AppSettings, Finding, FindingDetail, Overview, Patch, Project, Run, ScanRun, TargetSource, WorkflowState,
} from "./types";

export const DEMO_PROJECT = "prj-docportal";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the PatchProof API. Is the backend running on port 8000?");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `Request failed (HTTP ${res.status}).`);
  }
  return data as T;
}

const post = <T,>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request<{ status: string }>("/health"),
  settings: () => request<AppSettings>("/settings"),
  projects: () => request<Project[]>("/projects"),
  overview: (pid: string) => request<Overview>(`/projects/${pid}/overview`),
  workflow: (pid: string) => request<WorkflowState>(`/projects/${pid}/workflow`),
  findings: (pid: string) => request<Finding[]>(`/projects/${pid}/findings`),
  scans: (pid: string) => request<ScanRun[]>(`/projects/${pid}/scans`),
  source: (pid: string) => request<TargetSource>(`/projects/${pid}/source`),
  scan: (pid: string) => post<{ scan: ScanRun; new_findings: string[] }>(`/projects/${pid}/scan`),
  reset: (pid: string) => post<Project>(`/projects/${pid}/reset`, { confirm: true }),
  finding: (fid: string) => request<FindingDetail>(`/findings/${fid}`),
  reproduce: (fid: string) => post<Run>(`/findings/${fid}/reproduce`),
  proposePatch: (fid: string, source: "template" | "ai", variant: string) =>
    post<Patch>(`/findings/${fid}/patch-proposals`, { source, variant }),
  approvePatch: (id: string) => post<Patch>(`/patches/${id}/approve`),
  applyPatch: (id: string) => post<Patch>(`/patches/${id}/apply`),
  verify: (fid: string) => post<Run>(`/findings/${fid}/verify`),
  runs: (kind?: "reproduction" | "verification") =>
    request<Run[]>(`/verification-runs?project_id=${DEMO_PROJECT}${kind ? `&kind=${kind}` : ""}`),
  run: (id: string) => request<Run>(`/verification-runs/${id}`),
  report: (id: string) => request<Record<string, unknown>>(`/verification-runs/${id}/report`),
  activity: (limit = 30) => request<ActivityEvent[]>(`/activity?limit=${limit}`),
};

export const reportUrl = (id: string, format: "json" | "html", download = false) =>
  `/api/verification-runs/${id}/report?format=${format}${download ? "&download=true" : ""}`;
