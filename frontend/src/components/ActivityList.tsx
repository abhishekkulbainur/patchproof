import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import type { ActivityEvent } from "../types";
import { fmtRelative, fmtTime } from "../lib/format";
import { Empty, IconBadge } from "./ui";

const DOT: Record<string, string> = {
  success: "bg-emerald-500 ring-emerald-100", error: "bg-rose-500 ring-rose-100",
  warning: "bg-amber-500 ring-amber-100", info: "bg-indigo-400 ring-indigo-100",
};

function linkFor(e: ActivityEvent): string | null {
  if (e.run_id) return `/runs/${e.run_id}`;
  if (e.finding_id) return `/findings/${e.finding_id}`;
  if (e.scan_id) return "/projects";
  return null;
}

export default function ActivityList({ events }: { events: ActivityEvent[] }) {
  if (!events.length) return <Empty title="No activity yet" icon={<IconBadge icon={Activity} />}>Actions you take in the demo appear here.</Empty>;
  return (
    <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-slate-200">
      {events.map((e) => {
        const to = linkFor(e);
        const body = (
          <div className="relative flex gap-3 rounded-xl px-1 py-2">
            <span className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${DOT[e.level] ?? DOT.info}`} style={{ marginLeft: 6 }} aria-hidden />
            <div className="min-w-0">
              <div className="break-words text-[13px] leading-snug text-slate-800">{e.message}</div>
              <time className="text-[11.5px] text-slate-400" dateTime={e.ts} title={fmtTime(e.ts)}>
                {fmtRelative(e.ts)} · {e.type.replace(/_/g, " ")}
              </time>
            </div>
          </div>
        );
        return (
          <li key={e.id}>
            {to ? <Link to={to} className="block rounded-xl transition-colors hover:bg-slate-50">{body}</Link> : body}
          </li>
        );
      })}
    </ol>
  );
}
