import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { api } from "../api";
import { useResource } from "../lib/store";
import { fmtMs, fmtTime, targetStateLabel } from "../lib/format";
import { Empty, ErrorState, IconBadge, Loading, PageHeader, Section, Tag, VerdictBadge } from "../components/ui";
import type { Run } from "../types";

export function RunsTable({ runs, reportLinks = false }: { runs: Run[]; reportLinks?: boolean }) {
  const href = (r: Run) => (reportLinks ? `/reports/${r.id}` : `/runs/${r.id}`);
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-slate-50/80"><tr>{["Run", "Type", "Started", "Target", "Tests", "Duration", "Result", ""].map((h, i) => <th key={i} className="px-4 py-2.5 text-[12px] font-semibold text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {runs.map((r) => (
                <tr key={r.id} className="group transition-colors hover:bg-indigo-50/40">
                  <td className="px-4 py-3"><Link to={`/runs/${r.id}`} className="font-mono text-[12.5px] font-medium text-slate-800 hover:text-indigo-600">{r.id}</Link></td>
                  <td className="px-4 py-3"><Tag tone={r.kind === "verification" ? "indigo" : "slate"}>{r.kind}</Tag></td>
                  <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-500">{fmtTime(r.started_at)}</td>
                  <td className="px-4 py-3 text-[12.5px] text-slate-500">{targetStateLabel(r.target_state)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{r.summary.passed}/{r.summary.total}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{fmtMs(r.duration_ms)}</td>
                  <td className="px-4 py-3"><VerdictBadge verdict={r.verdict} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link to={href(r)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-indigo-600 transition hover:bg-indigo-50">
                      {reportLinks ? "Open report" : "Inspect"} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="space-y-2.5 md:hidden">
        {runs.map((r) => (
          <li key={r.id}>
            <Link to={href(r)} className="card card-hover block p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-[12.5px] font-medium text-slate-800">{r.id}</span><VerdictBadge verdict={r.verdict} /></div>
              <div className="mt-1.5 text-[12.5px] text-slate-500">{r.kind} · {fmtTime(r.started_at)} · {r.summary.passed}/{r.summary.total} passed</div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Runs() {
  const [kind, setKind] = useState<"" | "reproduction" | "verification">("");
  const runs = useResource(() => api.runs(kind || undefined), [kind]);
  const tabs: [typeof kind, string][] = [["", "All runs"], ["reproduction", "Reproduction"], ["verification", "Verification"]];
  return (
    <div>
      <PageHeader kicker="Evidence" title="Verification runs" subtitle="Every saved test execution, before and after the fix." />
      <Section title="Run history" kicker="Saved test executions" icon={<IconBadge icon={Activity} tone="violet" />}
        actions={
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Run type">
            {tabs.map(([k, label]) => (
              <button key={label} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200 ${kind === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {label}
              </button>
            ))}
          </div>
        }>
        {runs.error ? <ErrorState error={runs.error} onRetry={runs.reload} /> : !runs.data ? <Loading /> :
          runs.data.length === 0 ? <Empty title="No runs yet" icon={<IconBadge icon={Activity} />}>Reproduce the vulnerability or verify a patch from the <Link to="/demo" className="link">demo workflow</Link>.</Empty> :
          <RunsTable runs={runs.data} />}
      </Section>
    </div>
  );
}
