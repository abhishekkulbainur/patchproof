import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TestResult } from "../types";
import { fmtMs } from "../lib/format";
import { TestStatusIcon } from "./ui";

export function TestRow({ t, defaultOpen = false }: { t: TestResult; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `test-${t.run_id}-${t.test_id}`;
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
        aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <TestStatusIcon status={t.status} />
        <span className="w-14 shrink-0 font-mono text-[11.5px] font-medium text-slate-500">{t.test_id}</span>
        <span className="min-w-0 flex-1 text-[13.5px] font-medium text-slate-800">{t.name}</span>
        <span className="hidden font-mono text-[11.5px] text-slate-400 sm:inline">
          {t.response_status != null ? `HTTP ${t.response_status}` : "—"}
        </span>
        <span className={`chip ${t.status === "passed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : t.status === "failed" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
          {t.status === "passed" ? "Passed" : t.status === "failed" ? "Failed" : "Error"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div id={id} className="collapse-grid" data-open={open}>
        <div>
          <div className="space-y-4 px-4 pb-5 pt-1 text-sm sm:pl-[3.25rem]">
            <p className="text-slate-600">{t.description}</p>
            {t.request && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-[12px]">
                <div className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-400">Request (sanitized)</div>
                <div className="text-slate-800"><span className="font-semibold text-indigo-600">{t.request.method}</span> {t.request.path}</div>
                <div className="mt-1 text-slate-500">as {t.request.as_user ?? "anonymous"}{t.request.session ? ` · session ${t.request.session}` : " · no session"}</div>
                {Object.entries(t.request.headers).map(([k, v]) => <div key={k} className="text-slate-500">{k}: {v}</div>)}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label mb-1">Expected</div>
                <div className="text-slate-800">{t.expected}</div>
              </div>
              <div>
                <div className="label mb-1">Observed</div>
                <div className="text-slate-800">HTTP {t.response_status ?? "—"} · {fmtMs(t.duration_ms)}</div>
                {t.response_excerpt && (
                  <pre className="code mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-600">{t.response_excerpt}</pre>
                )}
              </div>
            </div>
            <div>
              <div className="label mb-1.5">Assertions</div>
              <ul className="space-y-1.5">
                {t.assertions.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                    <TestStatusIcon status={a.passed ? "passed" : "failed"} />
                    <span className="text-slate-800">{a.label}</span>
                    <span className="font-mono text-[12px] text-slate-400">{a.detail}</span>
                  </li>
                ))}
              </ul>
              {t.error && <div className="mt-2 font-mono text-xs text-amber-700">error: {t.error}</div>}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function TestList({ tests, title, openFailed = true }: { tests: TestResult[]; title?: string; openFailed?: boolean }) {
  if (!tests.length) return null;
  const passed = tests.filter((t) => t.status === "passed").length;
  const all = passed === tests.length;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
          <span className="text-[13px] font-semibold text-slate-700">{title}</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <span className={`block h-full rounded-full transition-all duration-700 ${all ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${(passed / tests.length) * 100}%` }} />
            </span>
            <span className={`text-[12px] font-semibold ${all ? "text-emerald-700" : "text-rose-700"}`}>{passed}/{tests.length} passed</span>
          </span>
        </div>
      )}
      <ul>{tests.map((t) => <TestRow key={t.id} t={t} defaultOpen={openFailed && t.status !== "passed"} />)}</ul>
    </div>
  );
}
