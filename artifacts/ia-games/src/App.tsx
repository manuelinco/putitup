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
import Datasets from "@/pages/datasets";
import DatasetDetail from "@/pages/dataset-detail";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import Supervisor from "@/pages/supervisor";

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
      <Route path="/datasets" component={Datasets} />
      <Route path="/datasets/:id" component={DatasetDetail} />
      <Route path="/profile/:id" component={Profile} />
      <Route path="/admin" component={Admin} />
      <Route path="/supervisor" component={Supervisor} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  const { user, isLoading, needsNickname } = useAuth();

  useTelegramInit();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const currentPath = window.location.pathname.replace(basePath, "") || "/";
  const protectedPath = currentPath.startsWith("/tasks")
    || currentPath.startsWith("/profile")
    || currentPath.startsWith("/leaderboard")
    || currentPath.startsWith("/admin")
    || currentPath.startsWith("/supervisor");

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
    <TonConnectUIProvider manifestUrl={TON_MANIFEST_URL}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AppInner />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
