import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bug, Check, FileCheck2, GitPullRequestArrow, Info, Lock, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { api } from "../api";
import type { AppSettings, FindingDetail, Run } from "../types";
import { useAction } from "../lib/store";
import { fmtMs, fmtTime, shortSha, targetStateLabel } from "../lib/format";
import { DiffView, LogView } from "./code";
import { TestList } from "./TestResults";
import { ProgressBar, Spinner, Tag, VerdictBadge } from "./ui";

type StepState = "done" | "active" | "locked";

export function StepCard({ n, icon: Icon, title, subtitle, state, children, aside }:
  { n: string; icon: typeof Bug; title: string; subtitle?: string; state: StepState; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`card overflow-hidden transition-all duration-300 ${state === "active" ? "ring-2 ring-indigo-200" : ""}`} aria-labelledby={`step-${n}`}>
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-5 py-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors duration-300 ${
          state === "done" ? "bg-emerald-500 text-white" : state === "active" ? "animate-soft-pulse bg-gradient-to-br from-indigo-500 to-sky-500 text-white" : "bg-slate-100 text-slate-400"}`}>
          {state === "done" ? <Check className="h-5 w-5" /> : state === "locked" ? <Lock className="h-4 w-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-slate-400" aria-hidden />
            <h3 id={`step-${n}`} className="text-[16px] font-bold">{title}</h3>
          </div>
          {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
        </div>
        {aside}
      </header>
      <div className={`space-y-5 p-5 ${state === "locked" ? "opacity-60" : ""}`}>{children}</div>
    </section>
  );
}

function Hint({ children, tone = "slate", id }: { children: ReactNode; tone?: "slate" | "amber"; id?: string }) {
  return (
    <p id={id} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] ${tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden /> <span>{children}</span>
    </p>
  );
}

function RunMeta({ run }: { run: Run }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-500">
      <Link to={`/runs/${run.id}`} className="font-mono font-medium text-indigo-600 hover:underline">{run.id}</Link>
      <span>{fmtTime(run.started_at)}</span>
      <span>{fmtMs(run.duration_ms)}</span>
      <span>target: {targetStateLabel(run.target_state)}</span>
      <span className="font-mono">sha256 {shortSha(run.target_sha)}…</span>
    </div>
  );
}

function Option({ checked, disabled, onChange, title, tag, children }:
  { checked: boolean; disabled?: boolean; onChange: () => void; title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <label className={`flex gap-3 rounded-xl border p-4 transition-all duration-200 ${
      disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
        : checked ? "cursor-pointer border-indigo-300 bg-indigo-50/60 shadow-[0_0_0_3px_rgb(224_231_255)]"
        : "cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
      <input type="radio" name="variant" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-slate-900">{title} {tag}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-slate-500">{children}</span>
      </span>
    </label>
  );
}

export default function RemediationWorkspace({ finding, settings }: { finding: FindingDetail; settings: AppSettings | null }) {
  const { busy, run } = useAction();
  const [variant, setVariant] = useState<"ownership-check" | "client-header-check" | "ai">("ownership-check");
  const [reviewed, setReviewed] = useState(false);
  const [showLogs, setShowLogs] = useState<string | null>(null);

  const repro = finding.latest_reproduction;
  const patch = finding.active_patch;
  const ver = finding.latest_verification;
  const reproduced = repro?.verdict === "Reproduced";
  const applied = patch?.status === "applied";
  const aiReady = !!settings?.ai.configured;

  const doReproduce = () => run("reproduce", () => api.reproduce(finding.id),
    (r) => [`Reproduction: ${r.verdict}`, r.verdict_reasons[0]]);
  const doPropose = () => {
    setReviewed(false);
    return run("propose", () => api.proposePatch(finding.id, variant === "ai" ? "ai" : "template",
      variant === "ai" ? "ownership-check" : variant), (p) => [`Patch ${p.id} proposed`, "Review the diff before approving."]);
  };
  const doApprove = () => patch && run("approve", () => api.approvePatch(patch.id), (p) => [`Patch ${p.id} approved`]);
  const doApply = () => patch && run("apply", () => api.applyPatch(patch.id),
    (p) => [`Patch ${p.id} applied to the demo`, "Behaviour changed — now verify it."]);
  const doVerify = () => run("verify", () => api.verify(finding.id),
    (r) => [`Verification: ${r.verdict}`, `${r.summary.passed}/${r.summary.total} tests passed`]);

  return (
    <div className="space-y-5">
      {/* B — PROVE */}
      <StepCard n="2" icon={Bug} title="Prove it before repair" state={reproduced ? "done" : "active"}
        subtitle="Send a real request to the local demo app and capture the evidence."
        aside={repro && <VerdictBadge verdict={repro.verdict} />}>
        <p className="text-[14px] leading-relaxed text-slate-600">
          Bob is signed in as himself and asks for Alice's document <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12.5px] text-slate-800">doc-1041</span>.
          This is a controlled local demonstration — nothing leaves this machine.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={doReproduce} disabled={!!busy || applied} aria-describedby={applied ? "repro-why" : undefined}>
            {busy === "reproduce" ? <Spinner /> : <Bug className="h-4 w-4" />} Reproduce vulnerability
          </button>
          {applied && <Hint id="repro-why">A patch is applied. Reset the demo to reproduce against the original code.</Hint>}
        </div>
        <ProgressBar active={busy === "reproduce"} />
        {repro && (
          <div className="animate-fade-in space-y-4">
            <RunMeta run={repro} />
            <ul className="space-y-1 text-[13.5px] text-slate-700">{repro.verdict_reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{r}</li>)}</ul>
            {repro.tests && <TestList tests={repro.tests} title="Reproduction tests" openFailed />}
            <button className="link text-[13px]" aria-expanded={showLogs === repro.id}
              onClick={() => setShowLogs(showLogs === repro.id ? null : repro.id)}>{showLogs === repro.id ? "Hide" : "Show"} raw log</button>
            {showLogs === repro.id && repro.logs && <LogView logs={repro.logs} />}
          </div>
        )}
      </StepCard>

      {/* C/D — PATCH */}
      <StepCard n="3" icon={GitPullRequestArrow} title="Generate, review and apply a patch" state={applied ? "done" : reproduced ? "active" : "locked"}
        subtitle="A small, targeted change — reviewed by a person before it touches the demo."
        aside={patch && <Tag tone={applied ? "slate" : "indigo"}>{patch.status}</Tag>}>
        {!applied && (
          <fieldset className="space-y-2.5">
            <legend className="mb-2.5 text-[13px] font-semibold text-slate-700">Choose a patch source</legend>
            <div className="grid gap-2.5 lg:grid-cols-3">
              <Option checked={variant === "ownership-check"} onChange={() => setVariant("ownership-check")}
                title="Server-side ownership check" tag={<Tag tone="indigo">Recommended</Tag>}>
                Pre-authored demo template. Deterministic, no AI involved.
              </Option>
              <Option checked={variant === "client-header-check"} onChange={() => setVariant("client-header-check")}
                title="Trusts a client header" tag={<Tag tone="amber">Deliberately flawed</Tag>}>
                Looks plausible in review. Use it to show that PatchProof reports Failed when a fix doesn't hold up.
              </Option>
              <Option checked={variant === "ai"} disabled={!aiReady} onChange={() => setVariant("ai")}
                title="AI proposal" tag={aiReady ? <Tag tone="sky">{settings?.ai.model}</Tag> : <Tag>Not configured</Tag>}>
                {aiReady ? "Validated, shown for review, and must pass the same tests." :
                  "Set OPENAI_API_KEY and OPENAI_MODEL in backend/.env to enable."}
              </Option>
            </div>
          </fieldset>
        )}
        {!applied && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-secondary" onClick={doPropose} disabled={!!busy}>
              {busy === "propose" ? <Spinner /> : <Wand2 className="h-4 w-4 text-indigo-500" />} {patch ? "Generate a new patch" : "Generate patch"}
            </button>
            {!reproduced && <Hint tone="amber">Tip: reproduce first. Without a before-fix reproduction the verdict can only be Inconclusive.</Hint>}
          </div>
        )}
        <ProgressBar active={busy === "propose"} />

        {patch && (
          <div className="animate-fade-in space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] text-slate-500">{patch.id} · v{patch.version}</span>
                <Tag tone={patch.source === "ai" ? "sky" : "slate"}>
                  {patch.source === "ai" ? <><Sparkles className="h-3 w-3" /> AI proposal · {patch.model}</> : "Demo patch template"}
                </Tag>
              </div>
              <h4 className="mt-1.5 text-[17px] font-bold text-slate-900">{patch.title}</h4>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[["Root cause", patch.root_cause, "bg-rose-50/60 border-rose-100"], ["What changes", patch.explanation, "bg-indigo-50/60 border-indigo-100"],
                ["Why it's minimal", patch.minimality, "bg-emerald-50/60 border-emerald-100"]].map(([k, v, tone]) => (
                <div key={k} className={`rounded-xl border p-4 ${tone}`}>
                  <div className="text-[12.5px] font-bold text-slate-800">{k}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{v}</p>
                </div>
              ))}
            </div>
            <DiffView diff={patch.diff} />
            <Hint>A suggested patch is not a verified fix. Approving only allows it to be applied to the demo copy — the verdict comes from the tests.</Hint>

            {patch.status === "proposed" && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-slate-700">
                  <input type="checkbox" className="h-4 w-4 rounded accent-indigo-600" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                  I have reviewed this diff
                </label>
                <button className="btn btn-primary ml-auto" onClick={doApprove} disabled={!reviewed || !!busy}>
                  {busy === "approve" ? <Spinner /> : <Check className="h-4 w-4" />} Approve patch
                </button>
              </div>
            )}
            {patch.status === "approved" && (
              <button className="btn btn-primary animate-pop-in" onClick={doApply} disabled={!!busy}>
                {busy === "apply" ? <Spinner /> : <FileCheck2 className="h-4 w-4" />} Apply patch to demo
              </button>
            )}
            {applied && (
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
                <Check className="h-4 w-4 text-emerald-500" /> Applied {fmtTime(patch.applied_at)} ·
                <span className="font-mono">sha256 {shortSha(patch.original_sha)}… → {shortSha(patch.patched_sha)}…</span>
              </p>
            )}
          </div>
        )}
      </StepCard>

      {/* E/F — VERIFY */}
      <StepCard n="4" icon={ShieldCheck} title="Verify the fix independently" state={ver ? "done" : applied ? "active" : "locked"}
        subtitle="Re-run the same attack, a forged-identity variant, and the full regression suite."
        aside={ver && <VerdictBadge verdict={ver.verdict} />}>
        <p className="text-[14px] leading-relaxed text-slate-600">
          Runs the <em>same</em> unauthorized request (SEC-01), a forged-identity variant (SEC-03), the owner-access check (SEC-02)
          and five regression tests. Every required test must pass for <span className="font-semibold text-emerald-700">Verified</span>.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={doVerify} disabled={!applied || !!busy} aria-describedby={!applied ? "verify-why" : undefined}>
            {busy === "verify" ? <Spinner /> : <ShieldCheck className="h-4 w-4" />} Run security verification
          </button>
          {!applied && <Hint id="verify-why">Needs an approved patch applied to the demo target.</Hint>}
        </div>
        <ProgressBar active={busy === "verify"} />
        {ver && (
          <div className="animate-fade-in space-y-5">
            <div className={`flex flex-wrap items-center gap-5 rounded-2xl border p-5 ${
              ver.verdict === "Verified" ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
                : ver.verdict === "Failed" ? "border-rose-200 bg-gradient-to-br from-rose-50 to-white" : "border-amber-200 bg-gradient-to-br from-amber-50 to-white"}`}>
              <VerdictBadge verdict={ver.verdict} size="lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-[15px] font-semibold text-slate-900">{ver.summary.passed} of {ver.summary.total} required tests passed</div>
                <RunMeta run={ver} />
              </div>
            </div>
            <ul className="space-y-1 text-[13.5px] text-slate-700">{ver.verdict_reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{r}</li>)}</ul>
            {ver.tests && (
              <div className="grid gap-4 xl:grid-cols-2">
                <TestList tests={ver.tests.filter((t) => t.phase === "security")} title="Security verification" />
                <TestList tests={ver.tests.filter((t) => t.phase === "regression")} title="Regression suite" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Link to={`/reports/${ver.id}`} className="btn btn-primary"><FileCheck2 className="h-4 w-4" /> Open evidence report</Link>
              <button className="btn btn-ghost" aria-expanded={showLogs === ver.id}
                onClick={() => setShowLogs(showLogs === ver.id ? null : ver.id)}>{showLogs === ver.id ? "Hide" : "Show"} raw log</button>
            </div>
            {showLogs === ver.id && ver.logs && <LogView logs={ver.logs} />}
          </div>
        )}
      </StepCard>
    </div>
  );
}
