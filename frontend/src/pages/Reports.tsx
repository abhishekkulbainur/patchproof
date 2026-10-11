import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, Download, ExternalLink, FileText, GitPullRequestArrow, Printer, ShieldCheck, Bug, ListChecks } from "lucide-react";
import { api, reportUrl } from "../api";
import { useResource } from "../lib/store";
import { fmtMs, fmtTime, shortSha } from "../lib/format";
import { DiffView } from "../components/code";
import { Empty, ErrorState, IconBadge, KV, Loading, PageHeader, Section, TestStatusIcon, VerdictBadge } from "../components/ui";
import { RunsTable } from "./Runs";

export function Reports() {
  const runs = useResource(() => api.runs("verification"), []);
  return (
    <div>
      <PageHeader kicker="Evidence" title="Reports" subtitle="One evidence report per verification run, generated from saved data. Download as JSON or a printable HTML page." />
      <Section title="Evidence reports" kicker="Verification runs" icon={<IconBadge icon={FileText} />}>
        {runs.error ? <ErrorState error={runs.error} /> : !runs.data ? <Loading /> :
          runs.data.length === 0 ? <Empty title="No reports yet" icon={<IconBadge icon={FileText} />}>Run a security verification in the <Link to="/demo" className="link">demo workflow</Link> to produce an evidence report.</Empty> :
          <RunsTable runs={runs.data} reportLinks />}
      </Section>
    </div>
  );
}

interface ReportTest {
  test_id: string; name: string; expected: string; status: string; response_status: number | null;
  request: { method: string; path: string; as_user: string | null } | null;
}
interface Report {
  report_id: string; generated_at: string; generated_from: string; verdict: string; verdict_reasons: string[];
  project: { id: string; name: string };
  finding: { id: string; title: string; severity: string; category: string; cwe: string; file: string; function: string; line_start: number; line_end: number; endpoint: string; description: string };
  reproduction: null | { run_id: string; outcome: string; started_at: string; duration_ms: number; target_sha256: string; reasons: string[]; tests: ReportTest[] };
  patch: { id: string; version: number; source: string; model: string | null; title: string; root_cause: string; explanation: string; diff: string; approved_at: string; applied_at: string; original_sha: string; patched_sha: string };
  verification: { run_id: string; started_at: string; finished_at: string; duration_ms: number; runner: string; target_sha256: string; summary: { total: number; passed: number };
    security_tests: ReportTest[]; regression_tests: ReportTest[] };
  limitations: string[];
}

function TestTable({ tests }: { tests: ReportTest[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead className="bg-slate-50/80"><tr>{["", "Test", "Request", "Expected", "HTTP"].map((h, i) => <th key={i} className="px-3 py-2.5 text-[12px] font-semibold text-slate-500">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {tests.map((t) => (
            <tr key={t.test_id} className="align-top transition-colors hover:bg-slate-50">
              <td className="px-3 py-2.5"><TestStatusIcon status={t.status} /></td>
              <td className="px-3 py-2.5"><span className="font-mono text-[11.5px] text-slate-400">{t.test_id}</span><div className="font-medium text-slate-800">{t.name}</div></td>
              <td className="px-3 py-2.5 font-mono text-[11.5px] text-slate-500">{t.request ? `${t.request.method} ${t.request.path} as ${t.request.as_user ?? "anonymous"}` : "—"}</td>
              <td className="px-3 py-2.5 text-[12.5px] text-slate-500">{t.expected}</td>
              <td className="px-3 py-2.5 font-mono text-[12px] font-semibold text-slate-700">{t.response_status ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportView() {
  const { id = "" } = useParams();
  const r = useResource(() => api.report(id) as unknown as Promise<Report>, [id]);
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Loading rows={6} label="Assembling report from saved run data" />;
  const rep = r.data;
  const v = rep.verification;
  const banner = rep.verdict === "Verified" ? "border-emerald-200 from-emerald-50" : rep.verdict === "Failed" ? "border-rose-200 from-rose-50" : "border-amber-200 from-amber-50";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 transition-colors hover:text-indigo-600">
            <ChevronLeft className="h-4 w-4" /> All reports
          </Link>
          <div className="font-mono text-[12.5px] text-indigo-600">{rep.report_id}</div>
          <h1 className="mt-1 text-[26px] font-bold">Evidence report</h1>
          <p className="mt-1 text-[12.5px] text-slate-500">Generated {fmtTime(rep.generated_at)} from {rep.generated_from}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href={reportUrl(id, "json", true)} download><Download className="h-4 w-4" /> JSON</a>
          <a className="btn btn-secondary" href={reportUrl(id, "html", true)} download><Download className="h-4 w-4" /> HTML</a>
          <a className="btn btn-primary" href={reportUrl(id, "html")} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" /> Printable view <ExternalLink className="h-3.5 w-3.5 opacity-70" /></a>
        </div>
      </div>

      <section className={`flex flex-wrap items-center gap-6 rounded-2xl border bg-gradient-to-br to-white p-6 shadow-card ${banner}`}>
        <VerdictBadge verdict={rep.verdict} size="lg" />
        <ul className="min-w-0 flex-1 space-y-1 text-[13.5px] text-slate-700">{rep.verdict_reasons.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{x}</li>)}</ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={rep.finding.title} kicker={`${rep.project.name} · ${rep.finding.id}`} icon={<IconBadge icon={Bug} tone="rose" />}>
          <dl>
            <KV k="Severity">{rep.finding.severity} · {rep.finding.category} · {rep.finding.cwe}</KV>
            <KV k="Location"><span className="font-mono text-[12.5px]">{rep.finding.file}:{rep.finding.line_start}–{rep.finding.line_end} {rep.finding.function}()</span></KV>
            <KV k="Endpoint"><span className="font-mono text-[12.5px]">{rep.finding.endpoint}</span></KV>
            <KV k="Root cause">{rep.patch.root_cause}</KV>
          </dl>
        </Section>
        <Section title="Before the fix" kicker="Reproduction" icon={<IconBadge icon={AlertTriangle} tone="amber" />}>
          {!rep.reproduction ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800">No reproduction was recorded before this verification.</p> : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <VerdictBadge verdict={rep.reproduction.outcome} />
                <Link to={`/runs/${rep.reproduction.run_id}`} className="link font-mono text-[12px]">{rep.reproduction.run_id}</Link>
                <span className="text-[12px] text-slate-500">{fmtTime(rep.reproduction.started_at)} · <span className="font-mono">sha256 {shortSha(rep.reproduction.target_sha256)}…</span></span>
              </div>
              <ul className="mb-4 space-y-1 text-[13px] text-slate-600">{rep.reproduction.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              <TestTable tests={rep.reproduction.tests} />
            </>
          )}
        </Section>
      </div>

      <Section title={rep.patch.title} kicker={`Patch ${rep.patch.id} v${rep.patch.version} · ${rep.patch.source === "ai" ? `AI proposal (${rep.patch.model})` : "demo patch template"}`}
        icon={<IconBadge icon={GitPullRequestArrow} />}>
        <p className="mb-4 text-[13.5px] leading-relaxed text-slate-600">{rep.patch.explanation}</p>
        <DiffView diff={rep.patch.diff} />
        <p className="mt-3 break-all text-[12px] text-slate-500">
          Approved {fmtTime(rep.patch.approved_at)} · applied {fmtTime(rep.patch.applied_at)} · <span className="font-mono">patched sha256 {rep.patch.patched_sha} · tested sha256 {v.target_sha256}</span>
        </p>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="After the fix" kicker={`Security verification · ${v.run_id}`} icon={<IconBadge icon={ShieldCheck} tone="emerald" />}><TestTable tests={v.security_tests} /></Section>
        <Section title="Regression tests" kicker={`${v.summary.passed}/${v.summary.total} total passed · ${fmtMs(v.duration_ms)}`} icon={<IconBadge icon={ListChecks} tone="sky" />}><TestTable tests={v.regression_tests} /></Section>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
        <div className="flex items-center gap-2 text-[14px] font-bold text-amber-900"><AlertTriangle className="h-4 w-4" /> Limitations — read before quoting this result</div>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-amber-900/80">{rep.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="mt-2 text-[12px] text-amber-900/60">{v.runner}</p>
      </section>
    </div>
  );
}
