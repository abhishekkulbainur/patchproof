import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Activity, FileSearch, FileText, FolderGit2, LayoutDashboard, Menu, PlayCircle, Settings, ShieldCheck, X, type LucideIcon,
} from "lucide-react";
import { api } from "../api";
import { useResource } from "../lib/store";

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Workspace", items: [
    { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/demo", label: "Demo workflow", icon: PlayCircle },
  ] },
  { group: "Evidence", items: [
    { to: "/findings", label: "Findings", icon: FileSearch },
    { to: "/runs", label: "Verification runs", icon: Activity },
    { to: "/reports", label: "Reports", icon: FileText },
  ] },
  { group: "Configure", items: [
    { to: "/projects", label: "Projects", icon: FolderGit2 },
    { to: "/settings", label: "Settings", icon: Settings },
  ] },
];

const SECTION_TITLE: [RegExp, string][] = [
  [/^\/$/, "Overview"], [/^\/demo/, "Demo workflow"], [/^\/findings/, "Findings"], [/^\/runs/, "Verification runs"],
  [/^\/reports/, "Reports"], [/^\/projects/, "Projects"], [/^\/settings/, "Settings"],
];

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3 rounded-xl">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-brand">
        <ShieldCheck className="h-5 w-5 text-white" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[16px] font-bold tracking-tight text-slate-900">PatchProof</span>
        <span className="block text-[11.5px] font-medium text-slate-500">Verified security fixes</span>
      </span>
    </Link>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="space-y-6">
      {NAV.map(({ group, items }) => (
        <div key={group}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{group}</div>
          <ul className="space-y-1">
            {items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} onClick={onNavigate}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-200 ${
                      isActive ? "bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgb(199_210_254)]"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}>
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}`} aria-hidden />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ApiStatus() {
  const { error } = useResource(() => api.health(), []);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${
      error ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-rose-500" : "bg-emerald-500"}`} aria-hidden />
      {error ? "API offline" : "API connected"}
    </span>
  );
}

function DemoNotice() {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-sky-50 p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-indigo-900">
        <ShieldCheck className="h-4 w-4 text-indigo-500" aria-hidden /> Controlled demo
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-indigo-900/70">
        Synthetic data, tested only by the local harness. A suggested patch is not a verified fix.
      </p>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const section = SECTION_TITLE.find(([re]) => re.test(loc.pathname))?.[1] ?? "PatchProof";

  return (
    <div className="min-h-screen lg:flex">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-slate-200/70 bg-white/70 backdrop-blur-xl lg:flex">
        <div className="px-5 pb-6 pt-6"><Logo /></div>
        <div className="flex-1 overflow-y-auto px-3"><NavItems /></div>
        <div className="p-4"><DemoNotice /></div>
      </aside>

      {/* mobile drawer */}
      <div className={`fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setOpen(false)} aria-hidden />
      <aside id="mobile-nav" aria-label="Navigation" aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-white shadow-lift transition-transform duration-300 ease-out lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 pb-6 pt-5">
          <Logo />
          <button className="btn btn-ghost h-9 w-9 p-0" aria-label="Close navigation" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3">{open && <NavItems onNavigate={() => setOpen(false)} />}</div>
        <div className="p-4"><DemoNotice /></div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* top bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/60 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:px-6 lg:px-10">
            <button className="btn btn-ghost -ml-2 h-10 w-10 p-0 lg:hidden" aria-label="Open navigation" aria-expanded={open}
              aria-controls="mobile-nav" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-slate-900">{section}</div>
              <div className="hidden truncate text-[12px] text-slate-500 sm:block">Document Portal — Demo</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200"
              title="Controlled demo environment with synthetic data">
              <span>Demo</span><span className="hidden sm:inline">environment</span>
            </span>
            <ApiStatus />
          </div>
        </header>

        <main className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
          <div key={loc.pathname} className="animate-page-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
