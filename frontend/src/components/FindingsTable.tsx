import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Radar, Search } from "lucide-react";
import type { Finding } from "../types";
import { STATUS_LABEL, fmtRelative } from "../lib/format";
import { Empty, IconBadge, SeverityChip, StatusChip } from "./ui";

const SEVERITIES = ["High", "Medium", "Low"];

function nextStep(f: Finding) {
  if (!f.verifiable) return "Review";
  switch (f.status) {
    case "open": return "Reproduce";
    case "reproduced": return "Generate patch";
    case "patch_proposed": return "Review patch";
    case "patch_approved": return "Apply patch";
    case "patch_applied": return "Verify";
    default: return "View evidence";
  }
}

export default function FindingsTable({ findings, compact = false }: { findings: Finding[]; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("");
  const [status, setStatus] = useState("");

  const statuses = useMemo(() => Array.from(new Set(findings.map((f) => f.status))), [findings]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return findings.filter((f) =>
      (!sev || f.severity === sev) && (!status || f.status === status) &&
      (!needle || [f.id, f.title, f.category, f.file, f.cwe, f.function ?? ""].some((x) => x.toLowerCase().includes(needle))));
  }, [findings, q, sev, status]);

  if (!findings.length) {
    return (
      <Empty title="No findings yet" icon={<IconBadge icon={Radar} />}>
        Run a scan of the demo project to record findings. <Link to="/demo" className="link">Start the demo →</Link>
      </Empty>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="search">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search findings</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden />
          <input className="input w-full pl-9" placeholder="Search by ID, title, CWE or file…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Filter by severity</span>
          <select className="input pr-8" value={sev} onChange={(e) => setSev(e.target.value)}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select className="input pr-8" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select>
        </label>
        {(q || sev || status) && (
          <button className="btn btn-ghost animate-fade-in" onClick={() => { setQ(""); setSev(""); setStatus(""); }}>Clear filters</button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title="No findings match these filters">Adjust or clear the filters.</Empty>
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead className="bg-slate-50/80">
                  <tr>
                    {["Finding", "Severity", !compact && "Category", "Status", "Location", !compact && "Checked", ""]
                      .filter((h) => h !== false).map((h, i) => <th key={i} className="px-4 py-2.5 text-[12px] font-semibold text-slate-500">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((f) => (
                    <tr key={f.id} className="group transition-colors hover:bg-indigo-50/40">
                      <td className="px-4 py-3">
                        <Link to={`/findings/${f.id}`} className="block">
                          <span className="block font-semibold text-slate-900 group-hover:text-indigo-700">{f.title}</span>
                          <span className="font-mono text-[11.5px] text-slate-400">{f.id} · {f.cwe}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><SeverityChip severity={f.severity} /></td>
                      {!compact && <td className="px-4 py-3 text-slate-600">{f.category}</td>}
                      <td className="px-4 py-3"><StatusChip status={f.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">{f.file}:{f.line_start}</td>
                      {!compact && <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-500">{fmtRelative(f.last_checked_at)}</td>}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link to={`/findings/${f.id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-indigo-600 transition hover:bg-indigo-50">
                          {nextStep(f)} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* mobile cards */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((f) => (
              <li key={f.id}>
                <Link to={`/findings/${f.id}`} className="card card-hover block p-4">
                  <div className="flex flex-wrap items-center gap-2"><SeverityChip severity={f.severity} /><StatusChip status={f.status} /></div>
                  <div className="mt-2 font-semibold text-slate-900">{f.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-mono text-slate-400">{f.id}</span>
                    <span className="font-semibold text-indigo-600">{nextStep(f)} →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
