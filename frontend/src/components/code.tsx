import { FileCode2 } from "lucide-react";

/** Read-only code and diff views. Plain text rendering — no HTML injection from source. */

function FileBar({ name, right }: { name: string; right?: React.ReactNode }) {
  return (
    <figcaption className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[12px]">
      <span className="flex min-w-0 items-center gap-2 font-mono text-slate-600"><FileCode2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span className="truncate">{name}</span></span>
      {right}
    </figcaption>
  );
}

export function CodeView({ lines, start, highlight, file }:
  { lines: string[]; start: number; highlight?: [number, number]; file?: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {file && <FileBar name={file} right={highlight && <span className="chip bg-rose-50 text-rose-700 ring-rose-200">Lines {highlight[0]}–{highlight[1]}</span>} />}
      <div className="max-h-[420px] overflow-auto" tabIndex={0} aria-label={`Source code${file ? ` of ${file}` : ""}`}>
        <pre className="code min-w-max py-2">
          {lines.map((l, i) => {
            const n = start + i;
            const hot = highlight && n >= highlight[0] && n <= highlight[1];
            return (
              <div key={n} className={`flex ${hot ? "bg-rose-50" : ""}`}>
                <span className={`w-12 shrink-0 select-none border-l-[3px] pr-3 text-right ${hot ? "border-rose-400 text-rose-500" : "border-transparent text-slate-400"}`}>{n}</span>
                <span className="whitespace-pre pr-6 text-slate-800">{l || " "}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </figure>
  );
}

interface DiffLine { kind: "add" | "del" | "ctx" | "hunk" | "meta"; text: string; oldNo?: number; newNo?: number }

export function parseUnifiedDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  let o = 0, n = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("---") || raw.startsWith("+++")) { out.push({ kind: "meta", text: raw }); continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) { o = +h[1]; n = +h[2]; out.push({ kind: "hunk", text: raw }); continue; }
    if (raw.startsWith("+")) out.push({ kind: "add", text: raw.slice(1), newNo: n++ });
    else if (raw.startsWith("-")) out.push({ kind: "del", text: raw.slice(1), oldNo: o++ });
    else out.push({ kind: "ctx", text: raw.slice(1), oldNo: o++, newNo: n++ });
  }
  return out;
}

export function DiffView({ diff, title }: { diff: string; title?: string }) {
  const lines = parseUnifiedDiff(diff).filter((l) => l.kind !== "meta");
  const adds = lines.filter((l) => l.kind === "add").length;
  const dels = lines.filter((l) => l.kind === "del").length;
  return (
    <figure className="animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white">
      <FileBar name={title ?? "document_portal.py"} right={
        <span className="flex gap-1.5">
          <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200">+{adds}</span>
          <span className="chip bg-rose-50 text-rose-700 ring-rose-200">−{dels}</span>
        </span>} />
      <div className="overflow-x-auto" tabIndex={0} aria-label="Unified diff">
        <pre className="code min-w-max py-1">
          {lines.map((l, i) => {
            if (l.kind === "hunk") return <div key={i} className="bg-indigo-50/60 px-4 py-1 text-indigo-500">{l.text}</div>;
            const tone = l.kind === "add" ? "bg-emerald-50" : l.kind === "del" ? "bg-rose-50" : "";
            const sign = l.kind === "add" ? "+" : l.kind === "del" ? "−" : " ";
            const signTone = l.kind === "add" ? "text-emerald-600" : l.kind === "del" ? "text-rose-600" : "text-slate-300";
            return (
              <div key={i} className={`flex ${tone}`}>
                <span className="w-10 shrink-0 select-none pr-1 text-right text-slate-400">{l.oldNo ?? ""}</span>
                <span className="w-10 shrink-0 select-none pr-1 text-right text-slate-400">{l.newNo ?? ""}</span>
                <span className={`w-6 shrink-0 select-none text-center font-bold ${signTone}`} aria-hidden>{sign}</span>
                <span className="sr-only">{l.kind === "add" ? "added:" : l.kind === "del" ? "removed:" : ""}</span>
                <span className={`whitespace-pre pr-6 ${l.kind === "add" ? "text-emerald-900" : l.kind === "del" ? "text-rose-900" : "text-slate-700"}`}>{l.text || " "}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </figure>
  );
}

export function LogView({ logs }: { logs: string }) {
  return (
    <div className="max-h-72 animate-fade-in overflow-auto rounded-xl border border-slate-200 bg-slate-50" tabIndex={0} aria-label="Run log">
      <pre className="code whitespace-pre p-4 text-slate-600">
        {logs.split("\n").map((l, i) => (
          <div key={i} className={l.includes("FAIL") || l.startsWith("!!") || l.includes("[FAILED") ? "text-rose-600" :
            l.includes("[PASSED") ? "text-emerald-700" : l.startsWith("$") ? "font-medium text-indigo-600" : ""}>{l}</div>
        ))}
      </pre>
    </div>
  );
}
