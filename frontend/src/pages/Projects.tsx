import { useState } from "react";
import { FileCode2, FolderGit2, History, Radar } from "lucide-react";
import { api, DEMO_PROJECT } from "../api";
import { useAction, useResource } from "../lib/store";
import { fmtMs, fmtTime, shortSha, targetStateLabel } from "../lib/format";
import { CodeView } from "../components/code";
import ResetDemoButton from "../components/ResetDemoButton";
import { Empty, ErrorState, IconBadge, KV, Loading, PageHeader, Section, Spinner, Tag } from "../components/ui";

export default function Projects() {
  const projects = useResource(() => api.projects(), []);
  const scans = useResource(() => api.scans(DEMO_PROJECT), []);
  const source = useResource(() => api.source(DEMO_PROJECT), []);
  const { busy, run } = useAction();
  const [showSource, setShowSource] = useState(false);
  const p = projects.data?.[0];

  return (
    <div className="space-y-6">
      <PageHeader kicker="Configure" title="Document Portal — Demo" subtitle="The seeded, deliberately vulnerable project that PatchProof scans and tests.">
        <button className="btn btn-primary" disabled={!!busy}
          onClick={() => run("scan", () => api.scan(DEMO_PROJECT), (r) => [`Scan ${r.scan.id} completed`, `${r.scan.findings_detected} finding(s)`])}>
          {busy === "scan" ? <Spinner /> : <Radar className="h-4 w-4" />} Scan project
        </button>
        <ResetDemoButton />
      </PageHeader>

      {projects.error ? <ErrorState error={projects.error} /> : !p ? <Loading /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Project" kicker="Seeded controlled demo" icon={<IconBadge icon={FolderGit2} />}>
            <dl>
              <KV k="ID"><span className="font-mono text-[12.5px]">{p.id}</span></KV>
              <KV k="Description">{p.description}</KV>
              <KV k="Language">{p.language}</KV>
              <KV k="Target file"><span className="font-mono text-[12.5px]">{p.target_file}</span></KV>
              <KV k="Demo cycle">{p.cycle} <span className="text-[12px] text-slate-400">(increments on each reset)</span></KV>
              <KV k="Synthetic users"><span className="text-[12.5px]">Alice owns doc-1041 and doc-1042 · Bob owns doc-2077</span></KV>
            </dl>
          </Section>
          <Section title="Working copy" kicker="What the tests execute" icon={<IconBadge icon={FileCode2} tone="sky" />}
            actions={<button className="btn btn-secondary h-9 px-3" aria-expanded={showSource} onClick={() => setShowSource((s) => !s)}>{showSource ? "Hide" : "View"} source</button>}>
            {source.error ? <ErrorState error={source.error} /> : !source.data ? <Loading rows={2} /> : (
              <>
                <dl>
                  <KV k="State"><Tag tone={source.data.state === "original" ? "amber" : "indigo"}>{targetStateLabel(source.data.state)}</Tag></KV>
                  <KV k="SHA-256"><span className="break-all font-mono text-[12px] text-slate-600">{source.data.sha256}</span></KV>
                </dl>
                <div className="collapse-grid" data-open={showSource}>
                  <div><div className="pt-4"><CodeView lines={source.data.source.split("\n")} start={1} file={source.data.file} /></div></div>
                </div>
              </>
            )}
          </Section>
        </div>
      )}

      <Section title="Scan history" kicker="Saved scan runs" icon={<IconBadge icon={History} tone="violet" />}>
        {scans.error ? <ErrorState error={scans.error} /> : !scans.data ? <Loading /> : scans.data.length === 0 ? (
          <Empty title="No scans yet" icon={<IconBadge icon={Radar} />}>Click “Scan project” to run the deterministic demo analysis.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead className="bg-slate-50/80"><tr>{["Scan", "Started", "Cycle", "Status", "Findings", "Duration", "Target"].map((h) => <th key={h} className="px-4 py-2.5 text-[12px] font-semibold text-slate-500">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {scans.data.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-slate-700">{s.id}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500">{fmtTime(s.started_at)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.cycle}</td>
                    <td className="px-4 py-2.5"><Tag tone={s.status === "completed" ? "indigo" : "amber"}>{s.status}</Tag></td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{s.findings_detected}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500">{fmtMs(s.duration_ms)}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-slate-400">{shortSha(s.target_sha)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12px] text-slate-400">Analyzer: deterministic demo analysis (AST rules). Only the bundled demo target can be scanned.</p>
      </Section>
    </div>
  );
}
