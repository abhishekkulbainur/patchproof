import type { TraceState } from "../components/AuthorizationTraceBackground";
import type { WorkflowState } from "../types";

/** Maps backend-reported workflow state onto the trace visual. Never derives success on its own. */
export function traceFromWorkflow(wf: WorkflowState | null): TraceState {
  if (!wf) return "idle";
  const v = wf.verification?.verdict;
  if (v === "Verified") return "verified";
  if (v === "Failed") return "failed";
  if (wf.patch?.status === "applied") return "pending";
  if (wf.reproduction?.verdict === "Reproduced") return "vulnerable";
  return "idle";
}
