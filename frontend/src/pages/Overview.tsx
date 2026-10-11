import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight, Bug, CheckCircle2, FileSearch, PlayCircle, Timer, type LucideIcon } from "lucide-react";
import { api, DEMO_PROJECT } from "../api";
import { useResource } from "../lib/store";
import { fmtMs, fmtRelative } from "../lib/format";
import { traceFromWorkflow } from "../lib/trace";
import AuthorizationTraceBackground from "../components/AuthorizationTraceBackground";
import FindingsTable from "../components/FindingsTable";
import ActivityList from "../components/ActivityList";
import { ErrorState, IconBadge, Loading, Section } from "../components/ui";

function Metric({ label, value, note, icon, tone }:
  { label: string; value: string | number; note: string; icon: LucideIcon; tone: "rose" | "emerald" | "amber" | "indigo" }) {
  const valueTone = { rose: "text-rose-600", emerald: "text-emerald-600", amber: "text-amber-600", indigo: "text-indigo-600" }[tone];
  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-semibold text-slate-500">{label}</div>
        <IconBadge icon={icon} tone={tone} />
      </div>
      <div className={`mt-1 text-[30px] font-bold leading-none tracking-tight ${valueTone}`}>{value}</div>
      <div className="mt-2 text-[12.5px] text-slate-500">{note}</div>
    </div>
  );
}

const STEPS = ["Scan", "Prove", "Patch", "Verify", "Report"];

export default function Overview() {
  const ov = useResource(() => api.overview(DEMO_PROJECT), []);
  const wf = useResource(() => api.workflow(DEMO_PROJECT), []);
  const findings = useResource(() => api.findings(DEMO_PROJECT), []);
  const activity = useResource(() => api.activity(10), []);
  const o = ov.data;
  const lastVerdict = wf.data?.verification?.verdict;

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 p-6 text-white shadow-lift sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-fuchsia-300/20 blur-3xl" aria-hidden />
        <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold ring-1 ring-inset ring-white/25 backdrop-blur">
              Security remediation, backed by evidence
            </span>
            <h1 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[40px]">
              A fix isn't secure until it's verified.
            </h1>
            <p className="mt-3 max-w-md text-[15.5px] text-indigo-50/90">Detect the flaw. Prove it. Patch it. Test it again.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/demo" className="btn h-11 bg-white px-5 text-indigo-700 shadow-lg shadow-indigo-900/20 hover:bg-indigo-50">
                <PlayCircle className="h-[18px] w-[18px]" /> Run demo workflow
              </Link>
              <Link to="/findings" className="btn h-11 bg-white/10 px-5 text-white ring-1 ring-inset ring-white/30 hover:bg-white/20">
                Explore findings <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <ol className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12.5px] font-medium text-indigo-50/90" aria-label="Workflow">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 ring-1 ring-inset ring-white/20">{s}</span>
                  {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 opacity-60" aria-hidden />}
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl bg-white/95 p-4 text-slate-800 shadow-xl shadow-indigo-900/20 ring-1 ring-white/50 sm:p-5">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[13px] font-bold text-slate-900">Live authorization trace</span>
              <span className="font-mono text-[11px] text-slate-400">PP-AUTHZ-001</span>
            </div>
            <AuthorizationTraceBackground state={traceFromWorkflow(wf.data)} className="mt-2 h-auto w-full" />
            <p className="px-1 text-center text-[12.5px] text-slate-500">
              {lastVerdict ? <>Last verification: <span className={`font-semibold ${lastVerdict === "Verified" ? "text-emerald-600" : lastVerdict === "Failed" ? "text-rose-600" : "text-amber-600"}`}>{lastVerdict}</span></> :
                wf.data?.reproduction ? `Reproduction: ${wf.data.reproduction.verdict}` : "No evidence recorded yet — run the demo to see it change."}
            </p>
          </div>
        </div>
      </section>

      {/* metrics */}
      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Security overview</h2>
            <p className="text-[13.5px] text-slate-500">Everything below is calculated from saved scans and test runs.</p>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
            Project
            <select className="input" disabled title="Only the seeded demo project exists in this prototype" value={DEMO_PROJECT} onChange={() => {}}>
              <option value={DEMO_PROJECT}>Document Portal — Demo</option>
            </select>
          </label>
        </div>
        {ov.error ? <ErrorState error={ov.error} onRetry={ov.reload} /> : !o ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[132px] rounded-2xl" />)}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Open findings" value={o.open_findings} icon={Bug} tone="rose"
              note={o.total_findings ? `${o.open_by_severity.High} high · ${o.open_by_severity.Medium} medium · ${o.open_by_severity.Low} low` : "No scan yet"} />
            <Metric label="Verified runs" value={o.runs_by_verdict.Verified} icon={CheckCircle2} tone="emerald"
              note={`of ${o.verification_runs} verification run${o.verification_runs === 1 ? "" : "s"}`} />
            <Metric label="Failed / inconclusive" value={`${o.runs_by_verdict.Failed} / ${o.runs_by_verdict.Inconclusive}`} icon={AlertTriangle} tone="amber"
              note="Runs that did not verify" />
            <Metric label="Median verification" value={fmtMs(o.median_verification_ms)} icon={Timer} tone="indigo"
              note={`Last scan ${fmtRelative(o.last_scan_at)}`} />
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Findings" kicker="Document Portal — Demo" icon={<IconBadge icon={FileSearch} />}
          actions={<Link to="/findings" className="link inline-flex items-center gap-1 text-[13px]">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}>
          {findings.error ? <ErrorState error={findings.error} onRetry={findings.reload} /> :
            !findings.data ? <Loading /> : <FindingsTable findings={findings.data} compact />}
        </Section>
        <Section title="Recent activity" kicker="Saved events" icon={<IconBadge icon={Activity} tone="violet" />}>
          {activity.error ? <ErrorState error={activity.error} /> : !activity.data ? <Loading rows={4} /> : <ActivityList events={activity.data} />}
        </Section>
      </div>
    </div>
  );
}
