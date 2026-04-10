import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  LayoutDashboard, 
  Users,
  Target, 
  Settings, 
  Menu, 
  X,
  LogOut,
  Building2,
  UsersRound,
  Package,
  FolderKanban,
  CalendarDays,
  Map,
  ChevronLeft,
  ChevronRight,
  ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth, usePermission, type UserRole } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { useCompanyContext } from "@/lib/company-context";
import { queryClient } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

interface DashboardLayoutProps {
  children: React.ReactNode;
  user?: {
    id?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string | null;
    role?: UserRole;
  };
  fullWidth?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresLeadAccess?: boolean;
  requiresAdmin?: boolean;
  requiresSuperAdmin?: boolean;
  allowedRoles?: UserRole[];
}

const allNavigationItems: NavItem[] = [
  { href: "/admin", label: "Gestione Aziende", icon: Building2, requiresSuperAdmin: true },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Contatti", icon: Users, requiresLeadAccess: true },
  { href: "/opportunita", label: "Opportunità", icon: Target, requiresLeadAccess: true },
  ...(APP_CONFIG.moduleProgetti ? [{ href: "/progetti", label: "Progetti", icon: FolderKanban, allowedRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN"] as UserRole[] }] : []),
  ...(APP_CONFIG.moduleProxit ? [{ href: "/proxit", label: "Proxit", icon: CalendarDays, allowedRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN"] as UserRole[] }] : []),
  ...(APP_CONFIG.moduleSAL ? [{ href: "/sal", label: "SAL", icon: ClipboardList, allowedRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "TECHNICIAN"] as UserRole[] }] : []),
  { href: "/mappa", label: "Mappa Cantieri", icon: Map },
  { href: "/catalog", label: "Catalogo", icon: Package, requiresLeadAccess: true },
  { href: "/team", label: "Gestione Team", icon: UsersRound, requiresAdmin: true },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  COMPANY_ADMIN: "Amministratore",
  SALES_AGENT: "Commerciale",
  TECHNICIAN: "Tecnico",
};

function ReminderBadge() {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const { data: reminders } = useQuery<any[]>({
    queryKey: [`/api/reminders?completed=false&dueBefore=${todayEnd.toISOString()}`],
    refetchInterval: 30000,
  });
  const count = reminders?.length || 0;
  if (!count) return null;
  return (
    <span
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white px-1"
      data-testid="badge-reminders-count"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

const LG_BREAKPOINT = 1024;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.innerWidth >= LG_BREAKPOINT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export function DashboardLayout({ children, user, fullWidth = false }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const isDesktop = useIsDesktop();
  const isDesktopCollapsed = isDesktop && collapsed;

  const { logout } = useAuth();
  const { canAccessLeads, isAdmin, isSuperAdmin, role } = usePermission();
  const { selectedCompanyId, setSelectedCompanyId } = useCompanyContext();

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/admin/companies"],
    enabled: isSuperAdmin,
  });

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "Utente";

  const navigationItems = useMemo(() => {
    return allNavigationItems.filter((item) => {
      if (item.requiresSuperAdmin && !isSuperAdmin) return false;
      if (item.requiresAdmin && !isAdmin) return false;
      if (item.requiresLeadAccess && !canAccessLeads) return false;
      if (item.allowedRoles && role && !item.allowedRoles.includes(role)) return false;
      return true;
    });
  }, [canAccessLeads, isAdmin, isSuperAdmin, role]);

  const handleLogout = useCallback(() => {
    logout();
    window.location.href = "/login";
  }, [logout]);

  useIdleTimeout(handleLogout);

  function handleCompanyChange(companyId: string) {
    const newId = companyId === "__default__" ? null : companyId;
    setSelectedCompanyId(newId);
    queryClient.clear();
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background">
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            data-testid="sidebar-overlay"
          />
        )}

        <aside
          className={cn(
            "fixed top-0 left-0 z-50 h-full w-64 bg-sidebar border-r border-sidebar-border transition-all duration-300 lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            collapsed ? "lg:w-16" : "lg:w-64"
          )}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className={cn(
              "flex items-center border-b border-sidebar-border",
              isDesktopCollapsed ? "justify-center p-3" : "justify-between p-4"
            )}>
              <img
                src="/gdm-logo.png"
                alt="GDM Lattonerie"
                className={cn(
                  isDesktopCollapsed ? "h-10 w-10 object-contain" : "h-12 w-auto object-contain"
                )}
              />
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-sidebar-foreground"
                onClick={() => setSidebarOpen(false)}
                data-testid="button-close-sidebar"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Franchisee selector — hidden when desktop-collapsed */}
            {isSuperAdmin && companies.length > 0 && !isDesktopCollapsed && (
              <div className="px-4 pt-3 pb-1">
                <label className="text-xs font-medium text-sidebar-foreground/60 mb-1 block">Franchisee</label>
                <Select
                  value={selectedCompanyId || "__default__"}
                  onValueChange={handleCompanyChange}
                >
                  <SelectTrigger
                    className="w-full bg-sidebar-accent/30 border-sidebar-border text-sidebar-foreground text-sm"
                    data-testid="select-company-switcher"
                  >
                    <Building2 className="w-4 h-4 mr-1 shrink-0 text-sidebar-foreground/60" />
                    <SelectValue placeholder="Seleziona azienda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">La mia azienda</SelectItem>
                    {companies.map((c: Company) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Navigation */}
            <nav className={cn("flex-1 space-y-1", isDesktopCollapsed ? "p-2" : "p-4")}>
              {navigationItems.map((item) => {
                const isActive = location === item.href || 
                  (item.href !== "/dashboard" && location.startsWith(item.href));

                const navContent = (
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                      isDesktopCollapsed && "justify-center px-2",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!isDesktopCollapsed && <span className="tracking-wide">{item.label}</span>}
                    {!isDesktopCollapsed && item.href === "/dashboard" && <ReminderBadge />}
                  </div>
                );

                if (isDesktopCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link href={item.href}>{navContent}</Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <Link key={item.href} href={item.href}>
                    {navContent}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className={cn("border-t border-sidebar-border", isDesktopCollapsed ? "p-2" : "p-4")}>
              {isDesktopCollapsed ? (
                <div className="flex flex-col items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex items-center justify-center w-full p-2 rounded-md cursor-default"
                        data-testid="avatar-user-collapsed"
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                          <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">
                            {userInitials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">{userName}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="flex items-center justify-center w-full p-2 rounded-md hover:bg-sidebar-accent/50 transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground"
                        onClick={handleLogout}
                        data-testid="button-logout-collapsed"
                      >
                        <LogOut className="w-5 h-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Esci</TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-sidebar-accent/50 transition-colors"
                      data-testid="button-user-menu"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                        <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col items-start text-left flex-1 min-w-0">
                        <span className="text-sm font-medium text-sidebar-foreground truncate w-full">
                          {userName}
                        </span>
                        {role && (
                          <span className="text-xs text-sidebar-foreground/60 truncate w-full">
                            {roleLabels[role]}
                          </span>
                        )}
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {isAdmin && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/impostazioni">
                            <Settings className="w-4 h-4 mr-2" />
                            Impostazioni
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem 
                      onClick={handleLogout}
                      className="text-destructive cursor-pointer" 
                      data-testid="button-logout"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Esci
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Desktop collapse toggle button */}
          <button
            className="hidden lg:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10 items-center justify-center w-6 h-6 rounded-full bg-sidebar border border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground shadow-sm transition-colors"
            onClick={toggleCollapsed}
            data-testid="button-toggle-sidebar"
            aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </aside>

        {/* Main content */}
        <div className={cn(
          "transition-all duration-300",
          collapsed ? "lg:pl-16" : "lg:pl-64"
        )}>
          <header className="sticky top-0 z-30 flex items-center h-12 px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-open-sidebar"
            >
              <Menu className="w-5 h-5" />
            </Button>
            
            <div className="flex-1" />
            
            <Avatar className="w-8 h-8">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
              <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
            </Avatar>
          </header>

          <main className="p-4 sm:p-6 lg:p-8">
            <div className={cn("mx-auto", fullWidth ? "w-full" : "max-w-7xl")}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
