import { lazy, Suspense, type ComponentType } from "react";
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

/**
 * After a new deploy, code-split chunk filenames change; a tab still running
 * the old build fails to fetch them ("Failed to fetch dynamically imported
 * module"). Reload once (time-guarded against loops) to fetch the fresh build.
 */
function reloadOnceForStaleChunk(): boolean {
  const KEY = "fo:lastChunkReload";
  const last = Number(sessionStorage.getItem(KEY) || "0");
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
    return true;
  }
  return false;
}

function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // Block render until the reload navigates away; otherwise surface the error.
      if (reloadOnceForStaleChunk()) return await new Promise<{ default: T }>(() => {});
      throw err;
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => { reloadOnceForStaleChunk(); });
}

// Authenticated feature pages are code-split so the initial load stays small.
const Home = lazyWithReload(() => import("./pages/Home"));
const Financeiro = lazyWithReload(() => import("./pages/Financeiro"));
const Documentos = lazyWithReload(() => import("./pages/Documentos"));
const Contador = lazyWithReload(() => import("./pages/Contador"));
const Patrimonio = lazyWithReload(() => import("./pages/Patrimonio"));
const Empresas = lazyWithReload(() => import("./pages/Empresas"));
const Juridico = lazyWithReload(() => import("./pages/Juridico"));
const Familia = lazyWithReload(() => import("./pages/Familia"));
const Assistente = lazyWithReload(() => import("./pages/Assistente"));
const Integracoes = lazyWithReload(() => import("./pages/Integracoes"));

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
          <Route path="/contador" component={Contador} />
          <Route path="/patrimonio" component={Patrimonio} />
          <Route path="/empresas" component={Empresas} />
          <Route path="/juridico" component={Juridico} />
          <Route path="/familia" component={Familia} />
          <Route path="/assistente" component={Assistente} />
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
