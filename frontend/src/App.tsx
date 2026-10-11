import { Link, Route, Routes } from "react-router-dom";
import { Compass } from "lucide-react";
import Shell from "./components/Shell";
import Overview from "./pages/Overview";
import Demo from "./pages/Demo";
import Projects from "./pages/Projects";
import Findings from "./pages/Findings";
import FindingDetail from "./pages/FindingDetail";
import Runs from "./pages/Runs";
import RunDetail from "./pages/RunDetail";
import { Reports, ReportView } from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";
import { Empty, IconBadge } from "./components/ui";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/findings" element={<Findings />} />
        <Route path="/findings/:id" element={<FindingDetail />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/runs/:id" element={<RunDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportView />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={
          <Empty title="Page not found" icon={<IconBadge icon={Compass} />}>
            <Link to="/" className="link">Back to the overview →</Link>
          </Empty>} />
      </Routes>
    </Shell>
  );
}
