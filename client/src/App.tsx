import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import { ThemeProvider } from "./contexts/ThemeContext";
import Documentos from "./pages/Documentos";
import Financeiro from "./pages/Financeiro";
import Home from "./pages/Home";
import Juridico from "./pages/Juridico";
import Login from "./pages/Login";
import Patrimonio from "./pages/Patrimonio";

function AuthenticatedApp() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/financeiro" component={Financeiro} />
        <Route path="/documentos" component={Documentos} />
        <Route path="/patrimonio" component={Patrimonio} />
        <Route path="/juridico" component={Juridico} />
        <Route component={NotFound} />
      </Switch>
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
