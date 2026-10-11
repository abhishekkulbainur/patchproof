import { Cpu, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useResource } from "../lib/store";
import ResetDemoButton from "../components/ResetDemoButton";
import { ErrorState, IconBadge, KV, Loading, PageHeader, Section, Tag } from "../components/ui";

export default function SettingsPage() {
  const s = useResource(() => api.settings(), []);
  return (
    <div className="space-y-6">
      <PageHeader kicker="Configure" title="Settings & about" subtitle="How this prototype is configured, and what it does and doesn't do." />
      {s.error ? <ErrorState error={s.error} onRetry={s.reload} /> : !s.data ? <Loading /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Environment" kicker="Read-only, reported by the server" icon={<IconBadge icon={Cpu} />}>
            <dl>
              <KV k="Demo mode"><Tag tone="amber">{s.data.demo_mode ? "On" : "Off"}</Tag></KV>
              <KV k="AI provider">
                {s.data.ai.configured ? <>Configured · <span className="font-mono text-[12.5px]">{s.data.ai.model}</span></> :
                  <>Not configured — patches come from deterministic demo templates. Set <code className="rounded bg-slate-100 px-1 font-mono text-[12px]">OPENAI_API_KEY</code> and <code className="rounded bg-slate-100 px-1 font-mono text-[12px]">OPENAI_MODEL</code> in <code className="rounded bg-slate-100 px-1 font-mono text-[12px]">backend/.env</code> to enable AI proposals.</>}
              </KV>
              <KV k="Analyzer">{s.data.analyzer}</KV>
              <KV k="Test runner">{s.data.runner}</KV>
              <KV k="Python">{s.data.python}</KV>
            </dl>
          </Section>
          <Section title="Safe-use notes" kicker="Scope" icon={<IconBadge icon={ShieldCheck} tone="emerald" />}>
            <ul className="space-y-2.5 text-[13.5px] text-slate-600">
              {[s.data.scope,
                "All users and documents are synthetic. No real credentials or personal data are stored.",
                "Tests run in a local subprocess with a timeout — this is not a container or VM sandbox.",
                "The verdict is calculated by the backend from test results. AI output, if enabled, is never trusted until those tests pass.",
                "A Verified result applies to this one seeded scenario only; it is not a security certification."].map((x) => (
                <li key={x} className="flex gap-2.5"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />{x}</li>
              ))}
            </ul>
            <div className="mt-5 border-t border-slate-100 pt-4"><ResetDemoButton /></div>
          </Section>
        </div>
      )}
    </div>
  );
}
