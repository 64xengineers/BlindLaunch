import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useSession } from "./auth/session";
import { network } from "./chain/config";
import { shortAddress } from "./chain/format";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Background, Footer, Navbar, Toast } from "./components/ui";
import { useBalance, WalletPicker } from "./components/wallet";
import { useToast } from "./state/hooks";
import { AuctionPage } from "./screens/AuctionPage";
import { CreatePage } from "./screens/CreatePage";
import { Docs } from "./screens/Docs";
import { Home } from "./screens/Home";
import { HowItWorks } from "./screens/HowItWorks";
import { MyBids } from "./screens/MyBids";
import { NotFound } from "./screens/NotFound";
import { ResultPage } from "./screens/ResultPage";
import { SealedPage } from "./screens/SealedPage";
import { TeamPage } from "./screens/TeamPage";

const MeraSpike = import.meta.env.DEV ? lazy(() => import("./spikes/MeraSpike").then((m) => ({ default: m.MeraSpike }))) : null;

export function App() {
  const { signer, wrongChain } = useSession();
  const { toast, dismiss } = useToast();
  const balance = useBalance();
  const { pathname } = useLocation();
  const [picker, setPicker] = useState(false);
  const closePicker = useCallback(() => setPicker(false), []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-clip">
      <Background />
      <Navbar account={signer ? shortAddress(signer.address) : null} mon={balance} onConnect={() => setPicker(true)} />
      {wrongChain ? (
        <p className="relative z-20 mx-auto mb-4 max-w-6xl rounded-xl border border-amber/50 bg-amber/10 px-4 py-2 text-sm text-paper" role="alert">
          Your wallet is on another network. It will be asked to switch to {network.label} before your next transaction.
        </p>
      ) : null}
      <main className="relative z-10 flex-1">
        <ErrorBoundary key={pathname}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/how" element={<HowItWorks />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/bids" element={<MyBids />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/auction/:id" element={<AuctionPage />} />
            <Route path="/auction/:id/sealed" element={<SealedPage />} />
            <Route path="/auction/:id/result" element={<ResultPage />} />
            {MeraSpike ? <Route path="/spike/mera" element={<Suspense fallback={null}><MeraSpike /></Suspense>} /> : null}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
      {picker ? <WalletPicker onClose={closePicker} /> : null}
      {toast ? <Toast key={toast.id} message={toast.message} tone={toast.tone} onClose={dismiss} /> : null}
    </div>
  );
}
