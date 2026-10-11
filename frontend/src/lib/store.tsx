import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { ApiError } from "../api";

/* ---------- data version: bump after any mutation so every view refetches saved state ---------- */

const VersionCtx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} });

export function useDataVersion() {
  return useContext(VersionCtx);
}

export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const { version } = useDataVersion();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    fetcher()
      .then((d) => { if (id === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (id === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, "unknown", String(e))); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(load, [load, version]);
  return { data, error, loading, reload: load };
}

/* ---------- toasts ---------- */

export type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; title: string; body?: string }
const ToastCtx = createContext<(kind: ToastKind, title: string, body?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function AppProviders({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 5000);
  }, []);

  return (
    <VersionCtx.Provider value={{ version, bump }}>
      <ToastCtx.Provider value={push}>
        {children}
        <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-[380px]" aria-live="polite">
          {toasts.map((t) => {
            const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? XCircle : Info;
            return (
              <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
                className="flex animate-slide-in-right gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lift">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${t.kind === "success" ? "text-emerald-500" : t.kind === "error" ? "text-rose-500" : "text-indigo-500"}`} aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                  {t.body && <div className="mt-0.5 text-[13px] text-slate-500">{t.body}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </ToastCtx.Provider>
    </VersionCtx.Provider>
  );
}

/* ---------- mutation helper: one in-flight action at a time, honest toasts, refetch after ---------- */

export function useAction() {
  const toast = useToast();
  const { bump } = useDataVersion();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, success?: (r: T) => [string, string?] | null) => {
    if (busy) return undefined;
    setBusy(key);
    try {
      const r = await fn();
      const msg = success?.(r);
      if (msg) toast("success", msg[0], msg[1]);
      return r;
    } catch (e) {
      toast("error", "Action failed", e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(null);
      bump();
    }
  }, [busy, toast, bump]);
  return { busy, run };
}
