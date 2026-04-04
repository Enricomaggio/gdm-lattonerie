import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, usePermission } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { CompanyProvider } from "@/lib/company-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-xl font-semibold text-foreground">Si è verificato un errore</h2>
            <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
            <Button
              variant="outline"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/leads";
              }}
              data-testid="button-error-recovery"
            >
              Torna alla lista contatti
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import LoginPage from "@/pages/login";

import JoinPage from "@/pages/join";
import DashboardPage from "@/pages/dashboard";
import LeadsPage from "@/pages/leads";
import LeadDetailPage from "@/pages/lead-detail";
import LeadDuplicatesPage from "@/pages/lead-duplicates";
import OpportunitaPage from "@/pages/opportunita";
import SettingsPage from "@/pages/settings";
import TeamPage from "@/pages/team";
import AdminPage from "@/pages/admin";
import CatalogPage from "@/pages/catalog";
import QuoteNewPage from "@/pages/quotes/QuoteSelector";
import QuoteViewPage from "@/pages/quote-view";
import ProgettiPage from "@/pages/progetti";
import GanttPage from "@/pages/gantt";
import ProxitPage from "@/pages/proxit";
import MappaPage from "@/pages/mappa";
import SalPage from "@/pages/sal";
import ResetPasswordPage from "@/pages/reset-password";
import NotFound from "@/pages/not-found";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 text-center">
        <Skeleton className="h-12 w-12 rounded-lg mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function SuperAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (user?.role !== "SUPER_ADMIN") {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { isAdmin } = usePermission();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function RoleProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles: UserRole[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (user?.role && !allowedRoles.includes(user.role as UserRole)) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    // SUPER_ADMIN va all'area admin, gli altri alla dashboard normale
    if (user?.role === "SUPER_ADMIN") {
      return <Redirect to="/admin" />;
    }
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/login">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/register">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/join" component={JoinPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/leads">
        <ProtectedRoute component={LeadsPage} />
      </Route>
      <Route path="/leads/duplicates">
        <ProtectedRoute component={LeadDuplicatesPage} />
      </Route>
      <Route path="/leads/:id">
        <ProtectedRoute component={LeadDetailPage} />
      </Route>
      <Route path="/opportunita">
        <ProtectedRoute component={OpportunitaPage} />
      </Route>
      <Route path="/impostazioni">
        <ProtectedRoute component={SettingsPage} />
      </Route>
      <Route path="/team">
        <AdminRoute component={TeamPage} />
      </Route>
      <Route path="/catalog">
        <ProtectedRoute component={CatalogPage} />
      </Route>
      <Route path="/progetti">
        <RoleProtectedRoute component={ProgettiPage} allowedRoles={["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN"]} />
      </Route>
      <Route path="/progetti/:projectId/gantt">
        <RoleProtectedRoute component={GanttPage} allowedRoles={["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN"]} />
      </Route>
      <Route path="/proxit">
        <RoleProtectedRoute component={ProxitPage} allowedRoles={["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN"]} />
      </Route>
      <Route path="/sal">
        <RoleProtectedRoute component={SalPage} allowedRoles={["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN"]} />
      </Route>
      <Route path="/mappa">
        <RoleProtectedRoute component={MappaPage} allowedRoles={["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN", "SALES_AGENT"]} />
      </Route>
      <Route path="/opportunities/:id/quotes/new">
        <ProtectedRoute component={QuoteNewPage} />
      </Route>
      <Route path="/quotes/:id">
        <ProtectedRoute component={QuoteViewPage} />
      </Route>
      <Route path="/admin">
        <SuperAdminRoute component={AdminPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CompanyProvider>
          <TooltipProvider>
            <Toaster />
            <ErrorBoundary>
              <AppRouter />
            </ErrorBoundary>
          </TooltipProvider>
        </CompanyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
