export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtRelative(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtTime(iso);
}

export function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 12) : "—");

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  reproduced: "Reproduced",
  patch_proposed: "Patch proposed",
  patch_approved: "Patch approved",
  patch_applied: "Patch applied",
  verified: "Verified",
  verification_failed: "Verification failed",
  inconclusive: "Inconclusive",
};

export function targetStateLabel(state: string) {
  if (state === "original") return "original (vulnerable)";
  if (state.startsWith("patched:")) return `patched by ${state.slice(8)}`;
  return state;
}
