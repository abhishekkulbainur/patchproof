import { Link } from "react-router-dom";
import { Check, Fingerprint, Radar, ShieldCheck, Users } from "lucide-react";
import { api, DEMO_PROJECT } from "../api";
import { useAction, useResource } from "../lib/store";
import { fmtMs, fmtTime, shortSha } from "../lib/format";
import { traceFromWorkflow } from "../lib/trace";
import AuthorizationTraceBackground from "../components/AuthorizationTraceBackground";
import RemediationWorkspace, { StepCard } from "../components/RemediationWorkspace";
import ResetDemoButton from "../components/ResetDemoButton";
import { ErrorState, IconBadge, Loading, PageHeader, ProgressBar, Spinner, Tag } from "../components/ui";
import type { WorkflowState } from "../types";

function Stepper({ wf }: { wf: WorkflowState }) {
  const done = wf.steps.filter((s) => s.status === "done").length;
  const pct = (done / wf.steps.length) * 100;
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[14px] font-bold text-slate-900">Your progress</span>
        <span className="text-[12.5px] font-semibold text-indigo-600">{done} of {wf.steps.length} steps complete</span>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={wf.steps.length}>
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7" aria-label="Demo steps">
        {wf.steps.map((s) => (
          <li key={s.index} aria-current={s.status === "current" ? "step" : undefined}
            className={`flex items-start gap-2.5 rounded-xl p-2.5 transition-colors duration-300 ${s.status === "current" ? "bg-indigo-50 ring-1 ring-indigo-200" : ""}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300 ${
              s.status === "done" ? "bg-emerald-500 text-white" : s.status === "current" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}>
              {s.status === "done" ? <Check className="h-3.5 w-3.5" /> : s.index}
            </span>
            <span className={`text-[12.5px] font-medium leading-snug ${s.status === "locked" ? "text-slate-400" : "text-slate-700"}`}>{s.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const PROVES = [
  { icon: ShieldCheck, tone: "emerald" as const, title: "Security improvement", body: "The exact request that leaked Alice's document before the fix is denied after it — even with a forged client identity." },
  { icon: Users, tone: "indigo" as const, title: "Nothing else breaks", body: "Owners still read and list their documents; missing IDs and unauthenticated requests behave correctly." },
  { icon: Fingerprint, tone: "violet" as const, title: "Evidence integrity", body: "The tested file's SHA-256 must match the approved patch, and the verdict is calculated by the server." },
];

export default function Demo() {
  const wf = useResource(() => api.workflow(DEMO_PROJECT), []);
  const scans = useResource(() => api.scans(DEMO_PROJECT), []);
  const settings = useResource(() => api.settings(), []);
  const findingId = wf.data?.finding_id;
  const finding = useResource(() => (findingId ? api.finding(findingId) : Promise.resolve(null)), [findingId]);
  const { busy, run } = useAction();

  const lastScan = scans.data?.find((s) => s.cycle === wf.data?.cycle) ?? null;
  const doScan = () => run("scan", () => api.scan(DEMO_PROJECT),
    (r) => [`Scan ${r.scan.id} completed`, `${r.scan.findings_detected} finding(s) in current code`]);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Guided demo" title="Run the PatchProof demo"
        subtitle="Follow the steps in order. Every result below comes from a real test run against the local demo app.">
        <ResetDemoButton />
      </PageHeader>

      {wf.error ? <ErrorState error={wf.error} onRetry={wf.reload} /> : !wf.data ? <Loading rows={4} /> : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="card flex flex-col justify-center p-5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[13px] font-bold text-slate-900">Live authorization trace</span>
                <span className="font-mono text-[11px] text-slate-400">updates after each run</span>
              </div>
              <AuthorizationTraceBackground state={traceFromWorkflow(wf.data)} className="mt-2 h-auto w-full" />
            </div>
            <div className="card p-5">
              <div className="mb-3 text-[14px] font-bold text-slate-900">What this demo proves</div>
              <ul className="space-y-3.5">
                {PROVES.map(({ icon, tone, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <IconBadge icon={icon} tone={tone} />
                    <div><div className="text-[13.5px] font-semibold text-slate-900">{title}</div><p className="text-[12.5px] leading-relaxed text-slate-500">{body}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Stepper wf={wf.data} />

          {/* A — SCAN */}
          <StepCard n="1" icon={Radar} title="Scan the demo project" state={lastScan ? "done" : "active"}
            subtitle="Deterministic rules look for object lookups without a server-side ownership check."
            aside={<Tag tone="sky">Demo analysis</Tag>}>
            <p className="text-[14px] leading-relaxed text-slate-600">
              AST rules inspect <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12.5px] text-slate-800">document_portal.py</span> for
              authorization gaps plus error-handling and configuration issues. This is not an external AI model or a commercial scanner.
            </p>
            <button className="btn btn-primary" onClick={doScan} disabled={!!busy}>
              {busy === "scan" ? <Spinner /> : <Radar className="h-4 w-4" />} Scan project
            </button>
            <ProgressBar active={busy === "scan"} />
            {lastScan && (
              <div className="animate-fade-in">
                <ol className="overflow-hidden rounded-xl border border-slate-200">
                  {lastScan.steps.map((s, i) => (
                    <li key={s.step} className="flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-100 bg-white px-4 py-2.5 first:border-t-0"
                      style={{ animationDelay: `${i * 70}ms` }}>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50"><Check className="h-3 w-3 text-emerald-600" aria-hidden /></span>
                      <span className="text-[13.5px] font-semibold text-slate-800">{s.step}</span>
                      <span className="text-[12.5px] text-slate-500">{s.detail}</span>
                      <span className="ml-auto font-mono text-[11px] text-slate-400">{fmtMs(s.duration_ms)}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2.5 flex flex-wrap gap-x-3 text-[12px] text-slate-500">
                  <span className="font-mono">{lastScan.id}</span><span>{fmtTime(lastScan.started_at)}</span>
                  <span className="font-mono">sha256 {shortSha(lastScan.target_sha)}…</span>
                  <Link to="/findings" className="link">{lastScan.findings_detected} finding(s) →</Link>
                </p>
              </div>
            )}
          </StepCard>

          {!findingId ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-4 text-center text-[13.5px] text-slate-500">
              Steps 2–4 unlock once the scan records the authorization finding.
            </p>
          ) : finding.error ? <ErrorState error={finding.error} /> : !finding.data ? <Loading rows={4} /> : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-slate-500">
                Working on <Link to={`/findings/${finding.data.id}`} className="link font-mono">{finding.data.id}</Link>
                <span className="text-slate-700">— {finding.data.title}</span>
              </div>
              <RemediationWorkspace finding={finding.data} settings={settings.data} />
            </>
          )}
        </>
      )}
    </div>
  );
}
