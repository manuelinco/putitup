import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { LoginScreen } from "@/components/login-screen";
import { NicknameModal } from "@/components/nickname-modal";
import { useTelegramInit } from "@/hooks/useTelegram";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Tasks from "@/pages/tasks";
import Leaderboard from "@/pages/leaderboard";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import AdminClaim from "@/pages/admin-claim";
import Controller from "@/pages/supervisor";
import UploadPage from "@/pages/upload";
import { Component, type ReactNode, type ErrorInfo } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100dvh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ textAlign: "center", color: "#fff", maxWidth: "320px" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚡</div>
            <h2 style={{ fontWeight: 900, fontSize: "20px", marginBottom: "8px" }}>PUTITUP</h2>
            <p style={{ color: "#888", fontSize: "13px", marginBottom: "16px" }}>Errore di avvio. Riapri la mini app.</p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: "#6d28d9", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}
            >
              Riprova
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/profile/:id" component={Profile} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin-claim" component={AdminClaim} />
      <Route path="/controller" component={Controller} />
      <Route path="/upload" component={UploadPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  const { user, isLoading, needsNickname } = useAuth();

  useTelegramInit();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const currentPath = window.location.pathname.replace(basePath, "") || "/";
  const protectedPath = (currentPath.startsWith("/tasks")
    || currentPath.startsWith("/profile")
    || currentPath.startsWith("/leaderboard")
    || currentPath.startsWith("/admin")
    || currentPath.startsWith("/controller")
    || currentPath.startsWith("/upload"))
    && !currentPath.startsWith("/admin-claim");

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user && !needsNickname && protectedPath) {
    return <LoginScreen />;
  }

  return (
    <>
      {needsNickname && <NicknameModal />}
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
    </>
  );
}

const TON_MANIFEST_URL = `${window.location.origin}${import.meta.env.BASE_URL}tonconnect-manifest.json`;

function App() {
  return (
    <ErrorBoundary>
      <TonConnectUIProvider manifestUrl={TON_MANIFEST_URL}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              <ErrorBoundary>
                <AppInner />
              </ErrorBoundary>
            </AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </TonConnectUIProvider>
    </ErrorBoundary>
  );
}

export default App;
