import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/_core/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";

// Authenticated feature pages are code-split so the initial load stays small.
const Home = lazy(() => import("./pages/Home"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Documentos = lazy(() => import("./pages/Documentos"));
const Patrimonio = lazy(() => import("./pages/Patrimonio"));
const Juridico = lazy(() => import("./pages/Juridico"));
const Familia = lazy(() => import("./pages/Familia"));
const Integracoes = lazy(() => import("./pages/Integracoes"));

function PageFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

function AuthenticatedApp() {
  return (
    <DashboardLayout>
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/financeiro" component={Financeiro} />
          <Route path="/documentos" component={Documentos} />
          <Route path="/patrimonio" component={Patrimonio} />
          <Route path="/juridico" component={Juridico} />
          <Route path="/familia" component={Familia} />
          <Route path="/integracoes" component={Integracoes} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <Login />;
  return <AuthenticatedApp />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Gate />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
