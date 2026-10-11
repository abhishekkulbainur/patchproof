import { useEffect, useRef, useState } from "react";

/**
 * Authorization Trace — PatchProof's signature visual.
 *
 * Custom-built SVG/CSS (no animation library). The idea of thin animated line paths is inspired by
 * Aceternity UI's "Background Lines"; no code was copied. It draws the request path
 * User → API → Authorization check → Resource and reflects the BACKEND-reported state:
 *
 *   idle        neutral lines, no motion (no evidence yet)
 *   vulnerable  red trace passes straight through an open gate to the resource (reproduced)
 *   pending     patch applied, not yet verified: gate drawn, trace dimmed
 *   verified    trace stops at the closed gate; green marker
 *   failed      trace still reaches the resource despite the gate
 *
 * Motion pauses when off-screen or the tab is hidden, and is disabled by prefers-reduced-motion (CSS).
 */
export type TraceState = "idle" | "vulnerable" | "pending" | "verified" | "failed";

const NODES = [
  { x: 70, label: "User", sub: "u-bob" },
  { x: 290, label: "API", sub: "GET /api/documents/:id" },
  { x: 510, label: "Authorization", sub: "owner == session user" },
  { x: 730, label: "Resource", sub: "doc-1041 · Alice" },
];
const Y = 86;
const C = {
  red: "#f43f5e", green: "#10b981", indigo: "#6366f1", line: "#e2e8f0", lineSoft: "#eef2f7",
  node: "#94a3b8", text: "#0f172a", sub: "#64748b", dim: "#cbd5e1", greenBg: "#ecfdf5", redBg: "#fff1f2",
};
const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
const MONO = '"JetBrains Mono", monospace';

export default function AuthorizationTraceBackground({ state, className = "" }: { state: TraceState; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = true;
    const update = () => setPaused(!visible || document.hidden);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  const gateClosed = state === "verified" || state === "pending" || state === "failed";
  const reachesResource = state === "vulnerable" || state === "failed";
  const animate = state === "vulnerable" || state === "failed";
  const traceEnd = reachesResource ? NODES[3].x - 20 : NODES[2].x - 20;
  const traceColor = state === "verified" ? C.green : state === "pending" ? C.indigo : C.red;

  return (
    <svg ref={ref} viewBox="0 0 800 160" role="img" preserveAspectRatio="xMidYMid meet"
      aria-label={`Authorization trace: ${DESCRIPTIONS[state]}`}
      className={`${paused ? "trace-paused" : ""} ${className}`}>
      {/* faint context routes through the API */}
      <g stroke={C.lineSoft} strokeWidth="1.5" fill="none">
        <path d={`M ${NODES[1].x} ${Y} C 360 ${Y} 380 26 470 26 L 800 26`} />
        <path d={`M ${NODES[1].x} ${Y} C 360 ${Y} 380 146 470 146 L 800 146`} />
        <path d={`M 0 26 L 150 26 C 210 26 230 ${Y} ${NODES[1].x} ${Y}`} />
        <path d={`M 0 146 L 150 146 C 210 146 230 ${Y} ${NODES[1].x} ${Y}`} />
      </g>
      <line x1={NODES[0].x} y1={Y} x2={NODES[3].x} y2={Y} stroke={C.line} strokeWidth="2" strokeLinecap="round" />

      {state !== "idle" && (
        <g className="animate-fade-in">
          <line x1={NODES[0].x} y1={Y} x2={traceEnd} y2={Y} stroke={traceColor} strokeWidth="6" strokeLinecap="round" opacity="0.12" />
          <line x1={NODES[0].x} y1={Y} x2={traceEnd} y2={Y} stroke={traceColor} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={animate ? "6 10" : undefined} className={animate ? "animate-trace-flow" : ""} />
        </g>
      )}

      {NODES.map((n, i) => {
        const isGate = i === 2;
        const stroke = isGate
          ? (state === "verified" ? C.green : state === "failed" ? C.red : gateClosed ? C.indigo : state === "vulnerable" ? C.red : C.dim)
          : (i === 3 && reachesResource ? C.red : C.node);
        const fill = isGate && state === "verified" ? C.greenBg : (isGate && state === "failed") || (i === 3 && reachesResource) ? C.redBg : "#fff";
        return (
          <g key={n.label}>
            {isGate ? (
              <g>
                <rect x={n.x - 10} y={Y - 26} width="20" height="52" rx="7" fill={fill} stroke={stroke} strokeWidth="2"
                  strokeDasharray={gateClosed ? undefined : "4 4"} />
                {state === "verified" && <path d={`M ${n.x - 5} ${Y} l 3.5 3.5 l 7 -8`} stroke={C.green} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                {state === "failed" && <path d={`M ${n.x - 4} ${Y - 4} l 8 8 M ${n.x + 4} ${Y - 4} l -8 8`} stroke={C.red} strokeWidth="2" strokeLinecap="round" />}
              </g>
            ) : (
              <circle cx={n.x} cy={Y} r="9" fill={fill} stroke={stroke} strokeWidth="2" />
            )}
            <text x={n.x} y={Y + 46} textAnchor="middle" fill={C.text} fontSize="13" fontWeight="600" fontFamily={FONT}>{n.label}</text>
            <text x={n.x} y={Y + 63} textAnchor="middle" fill={C.sub} fontSize="10.5" fontFamily={MONO}>{n.sub}</text>
          </g>
        );
      })}

      {state === "verified" && (
        <g className="animate-pop-in">
          <rect x={NODES[2].x + 22} y={Y - 50} width="112" height="24" rx="12" fill={C.greenBg} stroke={C.green} strokeWidth="1.2" />
          <text x={NODES[2].x + 78} y={Y - 34} textAnchor="middle" fill="#047857" fontSize="11" fontWeight="700" fontFamily={FONT}>Blocked · verified</text>
        </g>
      )}
      {state === "vulnerable" && (
        <g className="animate-pop-in">
          <rect x={NODES[3].x - 62} y={Y - 50} width="124" height="24" rx="12" fill={C.redBg} stroke={C.red} strokeWidth="1.2" />
          <text x={NODES[3].x} y={Y - 34} textAnchor="middle" fill="#be123c" fontSize="11" fontWeight="700" fontFamily={FONT}>HTTP 200 · data leaked</text>
        </g>
      )}
    </svg>
  );
}

const DESCRIPTIONS: Record<TraceState, string> = {
  idle: "no evidence recorded yet",
  vulnerable: "Bob's request reaches Alice's document; there is no effective authorization check",
  pending: "a patch adds an authorization check; not yet verified",
  verified: "Bob's request is stopped at the authorization check; verified by tests",
  failed: "a patch was applied but the request still reaches Alice's document",
};
