import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { api, DEMO_PROJECT } from "../api";
import { useAction } from "../lib/store";
import { ConfirmDialog } from "./ui";

export default function ResetDemoButton({ className = "btn btn-secondary" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { busy, run } = useAction();
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} disabled={!!busy}>
        <RotateCcw className="h-4 w-4" aria-hidden /> Reset demo
      </button>
      <ConfirmDialog open={open} busy={!!busy} title="Reset the demo project?" confirmLabel="Reset to vulnerable state"
        body={<>The working copy of <span className="font-mono text-slate-800">document_portal.py</span> goes back to the original
          vulnerable code, any applied patch is marked reverted, and findings return to Open. Saved runs and reports are kept.</>}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          await run("reset", () => api.reset(DEMO_PROJECT), () => ["Demo reset", "Vulnerable baseline restored. Start again from Scan."]);
          setOpen(false);
        }} />
    </>
  );
}
