import { useCallback, useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { shortAddress, useAuction } from "./auction";
import { readReminders, writeReminders } from "./components/trust";
import { Background, Footer, Navbar, Toast } from "./components/ui";
import { BidPage } from "./screens/BidPage";
import { BidSealed } from "./screens/BidSealed";
import { CreateAuction } from "./screens/CreateAuction";
import { Docs } from "./screens/Docs";
import { Home } from "./screens/Home";
import { HowItWorks } from "./screens/HowItWorks";
import { MyBids } from "./screens/MyBids";
import { Result } from "./screens/Result";
import { TeamDashboard } from "./screens/TeamDashboard";

const quietStatuses = new Set(["Auctions loaded.", "Reading auctions from Monad testnet.", ""]);

export function App() {
  const { account, mon, error, status, connect, now } = useAuction();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (!quietStatuses.has(status)) setToast({ message: status, tone: "ok" });
  }, [status]);

  useEffect(() => {
    const due = readReminders().filter((item) => item.at <= now);
    if (due.length === 0) return;
    writeReminders(readReminders().filter((item) => item.at > now));
    for (const item of due) {
      if ("Notification" in window && Notification.permission === "granted") {
        const note = new Notification("Blindlaunch", { body: item.title });
        note.onclick = () => { window.focus(); navigate(item.url); };
      }
      setToast({ message: item.title, tone: "ok" });
    }
  }, [now, navigate]);

  useEffect(() => {
    if (error) setToast({ message: error.length > 220 ? `${error.slice(0, 220)}…` : error, tone: "error" });
  }, [error]);

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-hidden">
      <Background />
      <Navbar account={account ? shortAddress(account) : null} mon={mon} onConnect={() => { void connect(); }} />
      <main className="relative z-10 flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/how" element={<HowItWorks />} />
          <Route path="/create" element={<CreateAuction />} />
          <Route path="/bids" element={<MyBids />} />
          <Route path="/team" element={<TeamDashboard />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/auction/:id" element={<BidPage />} />
          <Route path="/auction/:id/sealed" element={<BidSealed />} />
          <Route path="/auction/:id/result" element={<Result />} />
        </Routes>
      </main>
      <Footer />
      {toast ? <Toast message={toast.message} tone={toast.tone} onClose={closeToast} /> : null}
    </div>
  );
}
