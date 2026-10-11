import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle, type LucideIcon } from "lucide-react";
import type { ApiError } from "../api";
import { STATUS_LABEL } from "../lib/format";

/* Colour rules: emerald = passed/verified only; amber = pending/inconclusive; rose = vulnerabilities & failures. */

const SEV: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 ring-rose-300",
  High: "bg-rose-50 text-rose-700 ring-rose-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  Low: "bg-slate-100 text-slate-600 ring-slate-200",
};
export const SeverityChip = ({ severity }: { severity: string }) => (
  <span className={`chip ${SEV[severity] ?? SEV.Low}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${severity === "Low" ? "bg-slate-400" : severity === "Medium" ? "bg-amber-500" : "bg-rose-500"}`} aria-hidden />
    {severity}
  </span>
);

const STATUS_TONE: Record<string, string> = {
  open: "bg-rose-50 text-rose-700 ring-rose-200",
  reproduced: "bg-rose-50 text-rose-700 ring-rose-200",
  patch_proposed: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  patch_approved: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  patch_applied: "bg-amber-50 text-amber-700 ring-amber-200",
  verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  verification_failed: "bg-rose-100 text-rose-800 ring-rose-300",
  inconclusive: "bg-amber-50 text-amber-700 ring-amber-200",
};
export const StatusChip = ({ status }: { status: string }) => (
  <span className={`chip ${STATUS_TONE[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}>{STATUS_LABEL[status] ?? status}</span>
);

export const Tag = ({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "amber" | "sky" }) => {
  const t = { slate: "bg-slate-100 text-slate-600 ring-slate-200", indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200", sky: "bg-sky-50 text-sky-700 ring-sky-200" }[tone];
  return <span className={`chip ${t}`}>{children}</span>;
};

function verdictStyle(verdict: string): { tone: string; Icon: LucideIcon } {
  if (verdict === "Verified") return { tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 };
  if (verdict === "Failed" || verdict === "Reproduced") return { tone: "bg-rose-50 text-rose-700 ring-rose-200", Icon: XCircle };
  if (verdict === "Not reproduced") return { tone: "bg-slate-100 text-slate-600 ring-slate-200", Icon: CircleDashed };
  return { tone: "bg-amber-50 text-amber-700 ring-amber-200", Icon: AlertTriangle };
}

export function VerdictBadge({ verdict, size = "sm" }: { verdict: string; size?: "sm" | "lg" }) {
  const { tone, Icon } = verdictStyle(verdict);
  return size === "lg" ? (
    <span className={`inline-flex animate-pop-in items-center gap-2 rounded-2xl px-4 py-2 text-lg font-bold ring-1 ring-inset ${tone}`}>
      <Icon className="h-6 w-6" aria-hidden /> {verdict}
    </span>
  ) : (
    <span className={`chip ${tone}`}><Icon className="h-3.5 w-3.5" aria-hidden />{verdict}</span>
  );
}

export function TestStatusIcon({ status }: { status: string }) {
  if (status === "passed") return <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-500" aria-label="passed" />;
  if (status === "failed") return <XCircle className="h-[18px] w-[18px] shrink-0 text-rose-500" aria-label="failed" />;
  return <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-amber-500" aria-label={status} />;
}

export function IconBadge({ icon: Icon, tone = "indigo" }: { icon: LucideIcon; tone?: "indigo" | "rose" | "emerald" | "amber" | "sky" | "violet" }) {
  const t = { indigo: "bg-indigo-50 text-indigo-600", rose: "bg-rose-50 text-rose-600", emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600", sky: "bg-sky-50 text-sky-600", violet: "bg-violet-50 text-violet-600" }[tone];
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t}`}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>;
}

export function Section({ title, kicker, icon, actions, children, className = "", bodyClassName = "p-5" }:
  { title: ReactNode; kicker?: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            {kicker && <div className="label mb-0.5">{kicker}</div>}
            <h2 className="text-[15.5px] font-bold">{title}</h2>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PageHeader({ kicker, title, subtitle, children }: { kicker?: string; title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && <div className="mb-1.5 text-[12.5px] font-semibold text-indigo-600">{kicker}</div>}
        <h1 className="text-[26px] font-bold leading-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[14.5px] text-slate-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Loader2 className={`animate-spin ${className}`} aria-hidden />
);

export function Loading({ rows = 3, label = "Loading saved data" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3 py-2" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex animate-fade-in gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden />
      <div>
        <div className="font-semibold text-rose-800">Couldn't load this data</div>
        <div className="mt-0.5 text-rose-700">{error.message}</div>
        {onRetry && <button className="btn btn-secondary mt-3 h-8 px-3 text-xs" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex animate-fade-in flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      {icon && <div className="mb-3">{icon}</div>}
      <div className="font-semibold text-slate-800">{title}</div>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function ProgressBar({ active }: { active: boolean }) {
  return (
    <div className={`relative h-1 w-full overflow-hidden rounded-full bg-slate-100 transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`} aria-hidden>
      {active && <div className="absolute inset-y-0 w-2/5 animate-progress rounded-full bg-gradient-to-r from-indigo-500 to-sky-400" />}
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, busy }:
  { open: boolean; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }}
      className="w-[min(460px,calc(100vw-2rem))] animate-pop-in rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-lift backdrop:bg-slate-900/30 backdrop:backdrop-blur-sm">
      <div className="p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-slate-600">{body}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={busy} autoFocus>
          {busy && <Spinner />} {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(96px,150px)_minmax(0,1fr)] gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
      <dt className="text-[12.5px] font-medium text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-[13.5px] text-slate-800">{children}</dd>
    </div>
  );
}
