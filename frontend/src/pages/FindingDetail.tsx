import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Code2, FileSearch, History, Info } from "lucide-react";
import { api } from "../api";
import { useResource } from "../lib/store";
import { fmtTime } from "../lib/format";
import { CodeView } from "../components/code";
import RemediationWorkspace from "../components/RemediationWorkspace";
import { ErrorState, IconBadge, KV, Loading, Section, SeverityChip, StatusChip, Tag } from "../components/ui";

export default function FindingDetail() {
  const { id = "" } = useParams();
  const f = useResource(() => api.finding(id), [id]);
  const settings = useResource(() => api.settings(), []);

  if (f.error) return <ErrorState error={f.error} onRetry={f.reload} />;
  if (!f.data) return <Loading rows={5} />;
  const d = f.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/findings" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 transition-colors hover:text-indigo-600">
          <ChevronLeft className="h-4 w-4" /> All findings
        </Link>
        <div className="font-mono text-[12.5px] text-indigo-600">{d.id}</div>
        <h1 className="mt-1 text-[26px] font-bold leading-tight sm:text-[28px]">{d.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SeverityChip severity={d.severity} /><StatusChip status={d.status} />
          <Tag>{d.cwe}</Tag><Tag>{d.category}</Tag>
          {!d.detected_in_last_scan && <Tag tone="sky">Not detected in latest scan</Tag>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Evidence" kicker="Finding" icon={<IconBadge icon={FileSearch} tone="rose" />}>
          <dl>
            <KV k="Description">{d.description}</KV>
            <KV k="Expected">{d.expected}</KV>
            <KV k="Observed">{d.observed}</KV>
            {d.endpoint && <KV k="Endpoint"><span className="font-mono text-[12.5px]">{d.endpoint}</span></KV>}
            <KV k="Location"><span className="font-mono text-[12.5px]">{d.file}:{d.line_start}–{d.line_end}{d.function ? ` · ${d.function}()` : ""}</span></KV>
            <KV k="Severity">{d.severity_rationale}</KV>
            <KV k="Detected">{fmtTime(d.first_detected_at)} · last checked {fmtTime(d.last_checked_at)}</KV>
          </dl>
        </Section>
        <Section title="Affected code" kicker="Original baseline" icon={<IconBadge icon={Code2} tone="sky" />}>
          <CodeView lines={d.code.lines} start={d.code.start} highlight={d.code.highlight} file={d.code.file} />
        </Section>
      </div>

      {d.verifiable ? (
        <div>
          <h2 className="mb-1 text-xl font-bold">Remediation workspace</h2>
          <p className="mb-4 text-[13.5px] text-slate-500">Prove it, patch it, then verify it independently.</p>
          <RemediationWorkspace finding={d} settings={settings.data} />
        </div>
      ) : (
        <div className="card flex gap-3 p-5 text-[13.5px] text-slate-600">
          <IconBadge icon={Info} tone="sky" />
          <p>Automated reproduction, patching and verification are implemented only for the authorization (IDOR) finding in this prototype.
            This finding is recorded for manual review. <Link to="/findings/PP-AUTHZ-001" className="link">Open PP-AUTHZ-001 →</Link></p>
        </div>
      )}

      {d.patches.length > 0 && (
        <Section title="Patch history" kicker="All demo cycles" icon={<IconBadge icon={History} tone="violet" />}>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead className="bg-slate-50/80"><tr>{["Patch", "Source", "Status", "Diff", "Created"].map((h) => <th key={h} className="px-4 py-2.5 text-[12px] font-semibold text-slate-500">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.patches.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-slate-700">{p.id} v{p.version}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.source === "ai" ? `AI · ${p.model}` : `Template · ${p.variant}`}</td>
                    <td className="px-4 py-2.5"><Tag tone={p.status === "applied" ? "indigo" : "slate"}>{p.status}</Tag></td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px]"><span className="text-emerald-600">+{p.lines_added}</span> <span className="text-rose-600">−{p.lines_removed}</span></td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500">{fmtTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
