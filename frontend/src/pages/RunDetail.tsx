import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileCheck2, Terminal } from "lucide-react";
import { api } from "../api";
import { useResource } from "../lib/store";
import { fmtMs, fmtTime, targetStateLabel } from "../lib/format";
import { LogView } from "../components/code";
import { TestList } from "../components/TestResults";
import { ErrorState, IconBadge, KV, Loading, Section, VerdictBadge } from "../components/ui";

export default function RunDetail() {
  const { id = "" } = useParams();
  const r = useResource(() => api.run(id), [id]);
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Loading rows={5} />;
  const run = r.data;
  const tests = run.tests ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/runs" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 transition-colors hover:text-indigo-600">
            <ChevronLeft className="h-4 w-4" /> All runs
          </Link>
          <div className="font-mono text-[12.5px] text-indigo-600">{run.id}</div>
          <h1 className="mt-1 text-[26px] font-bold">{run.kind === "reproduction" ? "Reproduction run" : "Verification run"}</h1>
        </div>
        {run.kind === "verification" && <Link to={`/reports/${run.id}`} className="btn btn-primary"><FileCheck2 className="h-4 w-4" /> Evidence report</Link>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="card p-5">
          <div className="label mb-3">Result · calculated by the server</div>
          <VerdictBadge verdict={run.verdict} size="lg" />
          <ul className="mb-4 mt-4 space-y-1 text-[13.5px] text-slate-700">{run.verdict_reasons.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{x}</li>)}</ul>
          <dl>
            <KV k="Finding">{run.finding ? <Link to={`/findings/${run.finding.id}`} className="link font-medium">{run.finding.id} · {run.finding.title}</Link> : run.finding_id}</KV>
            {run.patch && <KV k="Patch"><span className="font-mono text-[12.5px]">{run.patch.id} v{run.patch.version}</span> · {run.patch.title}</KV>}
            {run.reproduction && <KV k="Baseline"><Link to={`/runs/${run.reproduction.id}`} className="link font-mono text-[12.5px]">{run.reproduction.id}</Link> · {run.reproduction.verdict}</KV>}
            <KV k="Started">{fmtTime(run.started_at)} · {fmtMs(run.duration_ms)}</KV>
            <KV k="Execution">{run.execution_status}</KV>
            <KV k="Target">{targetStateLabel(run.target_state)}<div className="break-all font-mono text-[11px] text-slate-400">{run.target_sha}</div></KV>
            <KV k="Runner"><span className="text-[12.5px]">{run.runner}</span></KV>
          </dl>
        </section>
        <div className="space-y-4">
          <TestList tests={tests.filter((t) => t.phase === "security")} title="Security tests" />
          <TestList tests={tests.filter((t) => t.phase === "regression")} title="Regression tests" />
        </div>
      </div>

      {run.logs && <Section title="Raw log" kicker="Harness output" icon={<IconBadge icon={Terminal} tone="sky" />}><LogView logs={run.logs} /></Section>}
    </div>
  );
}
