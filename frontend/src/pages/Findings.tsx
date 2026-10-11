import { FileSearch } from "lucide-react";
import { api, DEMO_PROJECT } from "../api";
import { useResource } from "../lib/store";
import FindingsTable from "../components/FindingsTable";
import { ErrorState, IconBadge, Loading, PageHeader, Section } from "../components/ui";

export default function Findings() {
  const findings = useResource(() => api.findings(DEMO_PROJECT), []);
  return (
    <div>
      <PageHeader kicker="Evidence" title="Findings" subtitle="Issues recorded by demo-analysis scans. Pick one to see its evidence and remediation steps." />
      <Section title="All findings" kicker="Document Portal — Demo" icon={<IconBadge icon={FileSearch} />}>
        {findings.error ? <ErrorState error={findings.error} onRetry={findings.reload} /> :
          !findings.data ? <Loading /> : <FindingsTable findings={findings.data} />}
      </Section>
    </div>
  );
}
