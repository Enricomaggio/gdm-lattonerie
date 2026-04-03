import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, TrendingUp, TrendingDown, CheckCircle2, Bell, BellRing, Check, ExternalLink, Clock, AlertTriangle, FileText, Trophy, User, Briefcase, Calendar, Minus, ChevronDown, ChevronUp, Euro, Send, XCircle, FolderKanban, Camera, Video, Pencil, Target, Timer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Lead, Reminder, Opportunity, PipelineStage, AppNotification } from "@shared/schema";

interface DashboardStats {
  totale: number;
  nuovi: number;
  opportunita: number;
  chiusi: number;
}

interface QuoteStats {
  preventivoInviato: number;
  preventivoInviatoValue: number;

  emessiThisMonth: number;
  emessiThisMonthValue: number;
  emessiLastQuarter: number;
  emessiLastQuarterValue: number;
  emessiYearToDate: number;
  emessiYearToDateValue: number;
  emessiChangeThisMonth: number | null;
  emessiChangeLastQuarter: number | null;
  emessiChangeYearToDate: number | null;

  vintiThisMonth: number;
  vintiThisMonthValue: number;
  vintiLastQuarter: number;
  vintiLastQuarterValue: number;
  vintiYearToDate: number;
  vintiYearToDateValue: number;
  vintiChangeThisMonth: number | null;
  vintiChangeLastQuarter: number | null;
  vintiChangeYearToDate: number | null;

  persiThisMonth: number;
  persiThisMonthValue: number;
  persiLastQuarter: number;
  persiLastQuarterValue: number;
  persiYearToDate: number;
  persiYearToDateValue: number;
  persiChangeThisMonth: number | null;
  persiChangeLastQuarter: number | null;
  persiChangeYearToDate: number | null;

  emessiCustom?: number;
  emessiCustomValue?: number;
  vintiCustom?: number;
  vintiCustomValue?: number;
  persiCustom?: number;
  persiCustomValue?: number;
  preventivoInviatoCustom?: number;
  preventivoInviatoCustomValue?: number;
}

type TimePeriod = "thisMonth" | "lastQuarter" | "yearToDate";

interface SalesTargetSeller {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  displayName: string | null;
  quoteTarget: number;
  wonTarget: number;
  quotesTotal: number;
  wonTotal: number;
}

interface SalesTargetsData {
  month: number;
  year: number;
  daysElapsed: number;
  daysTotal: number;
  periodDays: number;
  monthDays: number;
  sellers: SalesTargetSeller[];
}

interface MySalesTargetData {
  month: number;
  year: number;
  daysElapsed: number;
  daysTotal: number;
  quoteTarget: number;
  wonTarget: number;
  quotesTotal: number;
  wonTotal: number;
}

function getTargetColor(actual: number, target: number, daysElapsed: number, daysTotal: number, isPastMonth: boolean): "green" | "yellow" | "red" | "neutral" {
  if (target === 0) return "neutral";
  if (isPastMonth) {
    const pct = actual / target;
    if (pct >= 1) return "green";
    if (pct >= 0.7) return "yellow";
    return "red";
  }
  if (daysTotal === 0) return "neutral";
  const expectedRatio = daysElapsed / daysTotal;
  const expected = target * expectedRatio;
  if (expected === 0) return actual > 0 ? "green" : "neutral";
  const ratio = actual / expected;
  if (ratio >= 1) return "green";
  if (ratio >= 0.7) return "yellow";
  return "red";
}

function TargetProgressBar({ actual, target, daysElapsed, daysTotal, isPastMonth }: {
  actual: number;
  target: number;
  daysElapsed: number;
  daysTotal: number;
  isPastMonth: boolean;
}) {
  const color = getTargetColor(actual, target, daysElapsed, daysTotal, isPastMonth);
  const pctOfTarget = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  const expectedPct = !isPastMonth && daysTotal > 0 ? Math.min((daysElapsed / daysTotal) * 100, 100) : 100;

  const colorMap = {
    green: "bg-emerald-500",
    yellow: "bg-amber-400",
    red: "bg-red-500",
    neutral: "bg-muted-foreground/30",
  };

  const textColorMap = {
    green: "text-emerald-700 dark:text-emerald-400",
    yellow: "text-amber-700 dark:text-amber-400",
    red: "text-red-700 dark:text-red-400",
    neutral: "text-muted-foreground",
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden relative min-w-[60px]">
        {!isPastMonth && expectedPct > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-muted-foreground/15 rounded-full"
            style={{ width: `${expectedPct}%` }}
          />
        )}
        <div
          className={`h-full rounded-full transition-all duration-500 relative z-10 ${colorMap[color]}`}
          style={{ width: `${pctOfTarget}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums shrink-0 ${textColorMap[color]}`}>
        {target > 0 ? `${Math.round((actual / target) * 100)}%` : "—"}
      </span>
    </div>
  );
}

function SalesTargetsSection({ reportTimeRange, currentRange }: { reportTimeRange: string; currentRange: { start: Date; end: Date } }) {
  const { toast } = useToast();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editQuoteTarget, setEditQuoteTarget] = useState("");
  const [editWonTarget, setEditWonTarget] = useState("");

  // Multi-month filters: quarter, year, custom
  const isQuarter = reportTimeRange === "quarter";
  const isYear = reportTimeRange === "year";
  const isCustom = reportTimeRange === "custom";
  const isMultiMonthFilter = isQuarter || isYear || isCustom;

  // When the global filter changes to "last-month", auto-set selectors to the previous month
  // so that targets and actuals are aligned to the same month.
  useEffect(() => {
    if (reportTimeRange === "last-month") {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setSelectedMonth(prevMonthDate.getMonth() + 1);
      setSelectedYear(prevMonthDate.getFullYear());
    } else if (reportTimeRange === "month") {
      setSelectedMonth(now.getMonth() + 1);
      setSelectedYear(now.getFullYear());
    }
  }, [reportTimeRange]);

  // For last-week, last-month and multi-month filters, pass startDate/endDate to the backend.
  // For multi-month/custom filters also send proportional=true so the backend sums targets
  // proportionally across months. last-week keeps the old behaviour (backend returns full
  // monthly target; frontend scales it via getDisplayTarget).
  const buildUrl = () => {
    let url = `/api/sales-targets?month=${selectedMonth}&year=${selectedYear}`;
    if (
      reportTimeRange === "last-week" ||
      reportTimeRange === "last-month" ||
      isMultiMonthFilter
    ) {
      url += `&startDate=${currentRange.start.toISOString()}&endDate=${currentRange.end.toISOString()}`;
    }
    if (isMultiMonthFilter) {
      url += `&proportional=true`;
    }
    return url;
  };

  const salesTargetsUrl = buildUrl();
  const { data, isLoading } = useQuery<SalesTargetsData>({
    queryKey: [salesTargetsUrl],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ userId, quoteTarget, wonTarget }: { userId: string; quoteTarget: number; wonTarget: number }) => {
      const res = await apiRequest("POST", "/api/sales-targets", {
        userId,
        month: selectedMonth,
        year: selectedYear,
        quoteTarget,
        wonTarget,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [salesTargetsUrl] });
      setEditingUserId(null);
      toast({ title: "Obiettivo salvato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const formatEuro = (value: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const isPastMonth = selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth < now.getMonth() + 1);

  const daysElapsed = data?.daysElapsed ?? 0;
  const daysTotal = data?.daysTotal ?? 30;

  const startEdit = (seller: SalesTargetSeller) => {
    setEditingUserId(seller.userId);
    setEditQuoteTarget(seller.quoteTarget > 0 ? String(seller.quoteTarget) : "");
    setEditWonTarget(seller.wonTarget > 0 ? String(seller.wonTarget) : "");
  };

  const cancelEdit = () => {
    setEditingUserId(null);
  };

  const saveEdit = () => {
    if (!editingUserId) return;
    saveMutation.mutate({
      userId: editingUserId,
      quoteTarget: parseFloat(editQuoteTarget) || 0,
      wonTarget: parseFloat(editWonTarget) || 0,
    });
  };

  // Proportioning logic for last-week
  const periodDays = data?.periodDays ?? data?.monthDays ?? 30;
  const monthDays = data?.monthDays ?? 30;
  const isLastWeek = reportTimeRange === "last-week";
  const isLastMonth = reportTimeRange === "last-month";
  const isGlobalFilter = isLastWeek || isLastMonth || isMultiMonthFilter;

  const getDisplayTarget = (monthlyTarget: number) => {
    if (isLastWeek && monthDays > 0) {
      return Math.round(monthlyTarget * periodDays / monthDays);
    }
    return monthlyTarget;
  };

  const formatDateShort = (d: Date) =>
    d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

  const getMultiMonthLabel = () => {
    if (isQuarter) return "Trimestre";
    if (isYear) {
      return `Anno ${currentRange.start.getFullYear()}`;
    }
    if (isCustom) {
      return `${formatDateShort(currentRange.start)} – ${formatDateShort(currentRange.end)}`;
    }
    return null;
  };

  const periodLabel = isLastWeek
    ? "Settimana scorsa"
    : isLastMonth
      ? "Mese scorso"
      : isMultiMonthFilter
        ? getMultiMonthLabel()
        : null;

  const totalQuotesTarget = data?.sellers.reduce((s, u) => s + getDisplayTarget(u.quoteTarget), 0) ?? 0;
  const totalWonTarget = data?.sellers.reduce((s, u) => s + getDisplayTarget(u.wonTarget), 0) ?? 0;
  const totalQuotesActual = data?.sellers.reduce((s, u) => s + u.quotesTotal, 0) ?? 0;
  const totalWonActual = data?.sellers.reduce((s, u) => s + u.wonTotal, 0) ?? 0;

  return (
    <Card data-testid="card-sales-targets">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Obiettivi del mese</CardTitle>
            {periodLabel && (
              <p className="text-xs text-muted-foreground mt-0.5">Effettivi: {periodLabel}</p>
            )}
          </div>
        </div>
        {!isMultiMonthFilter && (
          <div className="flex items-center gap-2">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="h-7 w-[120px] text-xs" data-testid="select-target-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="h-7 w-[80px] text-xs" data-testid="select-target-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : !data || data.sellers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nessun venditore configurato</p>
        ) : (
          <div className="overflow-x-auto">
            {!isPastMonth && !isGlobalFilter && (
              <p className="text-xs text-muted-foreground mb-3">
                Giorno {daysElapsed} di {daysTotal} — il colore indica l'andamento rispetto al ritmo atteso
              </p>
            )}
            <table className="w-full text-sm" data-testid="table-sales-targets">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Venditore</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Obiettivo Prev.</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Fatti</th>
                  <th className="py-2 px-2 font-medium w-[140px]">%</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Obiettivo Acq.</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Acquisiti</th>
                  <th className="py-2 px-2 font-medium w-[140px]">%</th>
                  <th className="py-2 pl-2 w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.sellers.map(seller => {
                  const sellerName = seller.displayName || `${seller.firstName || ""} ${seller.lastName || ""}`.trim() || seller.email;
                  const isEditing = editingUserId === seller.userId;
                  return (
                    <tr key={seller.userId} className="hover:bg-muted/30 transition-colors" data-testid={`row-seller-${seller.userId}`}>
                      <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {sellerName}
                        </div>
                      </td>
                      {isEditing ? (
                        <>
                          <td className="py-1.5 px-2" colSpan={7}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">Prev. €</span>
                                <Input
                                  type="number"
                                  className="h-7 w-[120px] text-xs"
                                  value={editQuoteTarget}
                                  onChange={(e) => setEditQuoteTarget(e.target.value)}
                                  placeholder="0"
                                  data-testid={`input-quote-target-${seller.userId}`}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">Acq. €</span>
                                <Input
                                  type="number"
                                  className="h-7 w-[120px] text-xs"
                                  value={editWonTarget}
                                  onChange={(e) => setEditWonTarget(e.target.value)}
                                  placeholder="0"
                                  data-testid={`input-won-target-${seller.userId}`}
                                />
                              </div>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={saveEdit}
                                disabled={saveMutation.isPending}
                                data-testid={`button-save-target-${seller.userId}`}
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Salva
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={cancelEdit}
                                data-testid={`button-cancel-target-${seller.userId}`}
                              >
                                Annulla
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                            {seller.quoteTarget > 0 ? formatEuro(getDisplayTarget(seller.quoteTarget)) : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums font-medium whitespace-nowrap">
                            {formatEuro(seller.quotesTotal)}
                          </td>
                          <td className="py-2.5 px-2">
                            <TargetProgressBar
                              actual={seller.quotesTotal}
                              target={getDisplayTarget(seller.quoteTarget)}
                              daysElapsed={isGlobalFilter ? periodDays : daysElapsed}
                              daysTotal={isGlobalFilter ? periodDays : daysTotal}
                              isPastMonth={isGlobalFilter ? true : isPastMonth}
                            />
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                            {seller.wonTarget > 0 ? formatEuro(getDisplayTarget(seller.wonTarget)) : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums font-medium whitespace-nowrap">
                            {formatEuro(seller.wonTotal)}
                          </td>
                          <td className="py-2.5 px-2">
                            <TargetProgressBar
                              actual={seller.wonTotal}
                              target={getDisplayTarget(seller.wonTarget)}
                              daysElapsed={isGlobalFilter ? periodDays : daysElapsed}
                              daysTotal={isGlobalFilter ? periodDays : daysTotal}
                              isPastMonth={isGlobalFilter ? true : isPastMonth}
                            />
                          </td>
                          <td className="py-2.5 pl-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => startEdit(seller)}
                              data-testid={`button-edit-target-${seller.userId}`}
                            >
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {data.sellers.length > 1 && (
                  <tr className="bg-muted/30 font-semibold" data-testid="row-totals">
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground uppercase tracking-wide">Totale</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                      {totalQuotesTarget > 0 ? formatEuro(totalQuotesTarget) : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-medium whitespace-nowrap">
                      {formatEuro(totalQuotesActual)}
                    </td>
                    <td className="py-2.5 px-2">
                      <TargetProgressBar
                        actual={totalQuotesActual}
                        target={totalQuotesTarget}
                        daysElapsed={isGlobalFilter ? periodDays : daysElapsed}
                        daysTotal={isGlobalFilter ? periodDays : daysTotal}
                        isPastMonth={isGlobalFilter ? true : isPastMonth}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                      {totalWonTarget > 0 ? formatEuro(totalWonTarget) : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-medium whitespace-nowrap">
                      {formatEuro(totalWonActual)}
                    </td>
                    <td className="py-2.5 px-2">
                      <TargetProgressBar
                        actual={totalWonActual}
                        target={totalWonTarget}
                        daysElapsed={isGlobalFilter ? periodDays : daysElapsed}
                        daysTotal={isGlobalFilter ? periodDays : daysTotal}
                        isPastMonth={isGlobalFilter ? true : isPastMonth}
                      />
                    </td>
                    <td className="py-2.5 pl-2" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SalesAgentTargetBanner({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const queryKey = `/api/sales-targets/my${params.toString() ? `?${params.toString()}` : ""}`;

  const { data, isLoading } = useQuery<MySalesTargetData>({
    queryKey: [queryKey],
  });

  const now = new Date();
  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data || (data.quoteTarget === 0 && data.wonTarget === 0)) return null;

  const daysElapsed = data.daysElapsed;
  const daysTotal = data.daysTotal;

  const formatEuro = (value: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

  return (
    <Card data-testid="card-my-target">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
        <Target className="w-5 h-5 text-primary" />
        <CardTitle className="text-base">Il tuo obiettivo — {months[data.month - 1]} {data.year}</CardTitle>
        <span className="text-xs text-muted-foreground ml-auto">Giorno {daysElapsed}/{daysTotal}</span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.quoteTarget > 0 && (
            <div className="space-y-1.5" data-testid="target-quotes">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Preventivi emessi</span>
                <span>su {formatEuro(data.quoteTarget)}</span>
              </div>
              <TargetProgressBar
                actual={data.quotesTotal}
                target={data.quoteTarget}
                daysElapsed={daysElapsed}
                daysTotal={daysTotal}
                isPastMonth={false}
              />
              <div className="text-sm font-semibold">{formatEuro(data.quotesTotal)}</div>
            </div>
          )}
          {data.wonTarget > 0 && (
            <div className="space-y-1.5" data-testid="target-won">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Acquisiti</span>
                <span>su {formatEuro(data.wonTarget)}</span>
              </div>
              <TargetProgressBar
                actual={data.wonTotal}
                target={data.wonTarget}
                daysElapsed={daysElapsed}
                daysTotal={daysTotal}
                isPastMonth={false}
              />
              <div className="text-sm font-semibold">{formatEuro(data.wonTotal)}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description,
  isLoading 
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType;
  description: string;
  isLoading: boolean;
}) {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function ReminderItem({ reminder, leads, opportunities }: { reminder: Reminder; leads: Lead[]; opportunities: Opportunity[] }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const lead = reminder.leadId ? leads.find(l => l.id === reminder.leadId) : null;
  const leadName = lead ? (lead.entityType === "COMPANY" ? lead.name : `${lead.firstName} ${lead.lastName}`) : null;

  const opportunity = reminder.opportunityId ? opportunities.find(o => o.id === reminder.opportunityId) : null;
  const opportunityLead = opportunity?.leadId ? leads.find(l => l.id === opportunity.leadId) : null;
  const opportunityClientName = opportunityLead
    ? (opportunityLead.entityType === "COMPANY" ? opportunityLead.name : `${opportunityLead.firstName} ${opportunityLead.lastName}`)
    : null;

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/reminders/${reminder.id}`, { completed: !reminder.completed });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/reminders");
      }});
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const now = new Date();
  const dueDate = new Date(reminder.dueDate);
  const isOverdue = dueDate < now && !reminder.completed;
  const isToday = dueDate.toDateString() === now.toDateString();

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: dueDate.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${
        reminder.completed ? "opacity-60 bg-muted/30" : isOverdue ? "bg-destructive/5 border-destructive/20" : "bg-background"
      }`}
      data-testid={`reminder-item-${reminder.id}`}
    >
      <Button
        size="icon"
        variant={reminder.completed ? "default" : "outline"}
        className="shrink-0 h-7 w-7"
        onClick={() => completeMutation.mutate()}
        disabled={completeMutation.isPending}
        data-testid={`button-complete-reminder-${reminder.id}`}
      >
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Badge variant={isOverdue ? "destructive" : isToday ? "default" : "secondary"} className="text-xs shrink-0">
        {isOverdue && <AlertTriangle className="w-3 h-3 mr-1" />}
        {isToday && <Clock className="w-3 h-3 mr-1" />}
        {formatDate(dueDate)}
      </Badge>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-medium whitespace-nowrap ${reminder.completed ? "line-through text-muted-foreground" : ""}`}>
          {reminder.title}
        </span>
        {reminder.description && (
          <span className="text-xs text-muted-foreground truncate">— {reminder.description}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {leadName && !reminder.opportunityId && (
          <Badge
            variant="outline"
            className="text-xs cursor-pointer"
            onClick={() => navigate(`/leads/${reminder.leadId}`)}
            data-testid={`link-reminder-lead-${reminder.id}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            {leadName}
          </Badge>
        )}
        {reminder.opportunityId && opportunity && (
          <Badge
            variant="outline"
            className="text-xs cursor-pointer"
            onClick={() => navigate(`/opportunita?open=${reminder.opportunityId}`)}
            data-testid={`link-reminder-opportunity-${reminder.id}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            {opportunityClientName ? `${opportunityClientName} - ${opportunity.title}` : opportunity.title}
          </Badge>
        )}
        {reminder.opportunityId && !opportunity && (
          <Badge
            variant="outline"
            className="text-xs cursor-pointer"
            onClick={() => navigate(`/opportunita`)}
            data-testid={`link-reminder-opportunity-${reminder.id}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Opportunità
          </Badge>
        )}
      </div>
    </div>
  );
}

function ReminderSection({ 
  title, 
  icon: Icon, 
  reminders, 
  leads, 
  opportunities,
  emptyMessage,
  variant = "muted"
}: { 
  title: string;
  icon: React.ElementType;
  reminders: Reminder[];
  leads: Lead[];
  opportunities: Opportunity[];
  emptyMessage: string;
  variant?: "muted" | "destructive";
}) {
  const now = new Date();
  const overdueReminders = reminders.filter(r => new Date(r.dueDate) < new Date(now.toDateString()));
  const todayReminders = reminders.filter(r => new Date(r.dueDate).toDateString() === now.toDateString());
  const futureReminders = reminders.filter(r => new Date(r.dueDate) > new Date(now.toDateString()));

  if (reminders.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p className="text-xs">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {overdueReminders.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-destructive mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            In ritardo ({overdueReminders.length})
          </h4>
          <div className="space-y-2">
            {overdueReminders.map(r => (
              <ReminderItem key={r.id} reminder={r} leads={leads} opportunities={opportunities} />
            ))}
          </div>
        </div>
      )}
      {todayReminders.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Oggi ({todayReminders.length})
          </h4>
          <div className="space-y-2">
            {todayReminders.map(r => (
              <ReminderItem key={r.id} reminder={r} leads={leads} opportunities={opportunities} />
            ))}
          </div>
        </div>
      )}
      {futureReminders.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Domani ({futureReminders.length})
          </h4>
          <div className="space-y-2">
            {futureReminders.map(r => (
              <ReminderItem key={r.id} reminder={r} leads={leads} opportunities={opportunities} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteStatsCard({ isLoading: _parentLoading, startDate, endDate }: { isLoading: boolean; startDate?: string; endDate?: string }) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("thisMonth");
  const isExternalFilter = !!(startDate && endDate);

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const queryUrl = `/api/dashboard/quote-stats${params.toString() ? `?${params.toString()}` : ""}`;

  const { data: quoteStats, isLoading } = useQuery<QuoteStats>({
    queryKey: [queryUrl],
  });

  const periodLabels: Record<TimePeriod, string> = {
    thisMonth: "Questo mese",
    lastQuarter: "Ultimo trimestre",
    yearToDate: "Da inizio anno",
  };

  const formatEuro = (value: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

  const getEmessi = () => {
    if (!quoteStats) return { count: 0, value: 0, change: null };
    if (isExternalFilter) return { count: quoteStats.emessiCustom ?? 0, value: quoteStats.emessiCustomValue ?? 0, change: null };
    switch (timePeriod) {
      case "thisMonth": return { count: quoteStats.emessiThisMonth, value: quoteStats.emessiThisMonthValue, change: quoteStats.emessiChangeThisMonth };
      case "lastQuarter": return { count: quoteStats.emessiLastQuarter, value: quoteStats.emessiLastQuarterValue, change: quoteStats.emessiChangeLastQuarter };
      case "yearToDate": return { count: quoteStats.emessiYearToDate, value: quoteStats.emessiYearToDateValue, change: quoteStats.emessiChangeYearToDate };
    }
  };

  const getVinti = () => {
    if (!quoteStats) return { count: 0, value: 0, change: null };
    if (isExternalFilter) return { count: quoteStats.vintiCustom ?? 0, value: quoteStats.vintiCustomValue ?? 0, change: null };
    switch (timePeriod) {
      case "thisMonth": return { count: quoteStats.vintiThisMonth, value: quoteStats.vintiThisMonthValue, change: quoteStats.vintiChangeThisMonth };
      case "lastQuarter": return { count: quoteStats.vintiLastQuarter, value: quoteStats.vintiLastQuarterValue, change: quoteStats.vintiChangeLastQuarter };
      case "yearToDate": return { count: quoteStats.vintiYearToDate, value: quoteStats.vintiYearToDateValue, change: quoteStats.vintiChangeYearToDate };
    }
  };

  const getPersi = () => {
    if (!quoteStats) return { count: 0, value: 0, change: null };
    if (isExternalFilter) return { count: quoteStats.persiCustom ?? 0, value: quoteStats.persiCustomValue ?? 0, change: null };
    switch (timePeriod) {
      case "thisMonth": return { count: quoteStats.persiThisMonth, value: quoteStats.persiThisMonthValue, change: quoteStats.persiChangeThisMonth };
      case "lastQuarter": return { count: quoteStats.persiLastQuarter, value: quoteStats.persiLastQuarterValue, change: quoteStats.persiChangeLastQuarter };
      case "yearToDate": return { count: quoteStats.persiYearToDate, value: quoteStats.persiYearToDateValue, change: quoteStats.persiChangeYearToDate };
    }
  };

  const emessi = getEmessi();
  const vinti = getVinti();
  const persi = getPersi();

  const ChangeBadge = ({ change }: { change: number | null }) => {
    if (change === null) return null;
    if (change === 0) return <Badge variant="outline" className="text-xs px-1.5 py-0">0%</Badge>;
    if (change > 0) return (
      <Badge className="text-xs px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
        <TrendingUp className="w-3 h-3 mr-0.5" />{change}%
      </Badge>
    );
    return (
      <Badge className="text-xs px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
        <TrendingDown className="w-3 h-3 mr-0.5" />{Math.abs(change)}%
      </Badge>
    );
  };

  return (
    <Card data-testid="card-quote-stats">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Panoramica Preventivi</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isExternalFilter && (
          <div className="flex items-center gap-1 flex-wrap">
            {(Object.entries(periodLabels) as [TimePeriod, string][]).map(([key, label]) => (
              <Button
                key={key}
                variant={timePeriod === key ? "default" : "outline"}
                size="sm"
                onClick={() => setTimePeriod(key)}
                data-testid={`button-filter-${key}`}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        <div className="rounded-md border bg-muted/30 overflow-hidden">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">
                  Emessi{" "}
                  {isLoading ? null : <span className="font-normal text-muted-foreground">({emessi.count})</span>}
                </span>
              </div>
              {isLoading ? <Skeleton className="h-5 w-16" /> : (
                <div className="flex items-center gap-2">
                  <ChangeBadge change={emessi.change} />
                  <span className="text-sm font-bold" data-testid="text-emessi-value">{formatEuro(emessi.value)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pl-6 divide-y">
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm text-muted-foreground">
                  In attesa{" "}
                  {isLoading ? null : (
                    <span className="font-medium text-foreground">
                      ({isExternalFilter ? (quoteStats?.preventivoInviatoCustom ?? 0) : (quoteStats?.preventivoInviato ?? 0)})
                    </span>
                  )}
                </span>
              </div>
              {isLoading ? <Skeleton className="h-4 w-14" /> : (
                <span className="text-sm font-medium" data-testid="text-preventivi-inviati">
                  {formatEuro(isExternalFilter ? (quoteStats?.preventivoInviatoCustomValue ?? 0) : (quoteStats?.preventivoInviatoValue ?? 0))}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-sm text-muted-foreground">
                  Accettati{" "}
                  {isLoading ? null : <span className="font-medium text-foreground">({vinti.count})</span>}
                </span>
              </div>
              {isLoading ? <Skeleton className="h-4 w-14" /> : (
                <div className="flex items-center gap-2">
                  <ChangeBadge change={vinti.change} />
                  <span className="text-sm font-medium" data-testid="text-preventivi-vinti">{formatEuro(vinti.value)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-sm text-muted-foreground">
                  Persi{" "}
                  {isLoading ? null : <span className="font-medium text-foreground">({persi.count})</span>}
                </span>
              </div>
              {isLoading ? <Skeleton className="h-4 w-14" /> : (
                <div className="flex items-center gap-2">
                  <ChangeBadge change={persi.change} />
                  <span className="text-sm font-medium" data-testid="text-preventivi-persi">{formatEuro(persi.value)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type TeamUser = { id: string; firstName: string | null; lastName: string | null; email: string; displayName: string | null; role: string };

function StaleOpportunityItem({ opportunity, leads, users }: { opportunity: Opportunity; leads: Lead[]; users?: TeamUser[] }) {
  const [, navigate] = useLocation();
  const lead = opportunity.leadId ? leads.find(l => l.id === opportunity.leadId) : null;
  const clientName = lead ? (lead.entityType === "COMPANY" ? lead.name : `${lead.firstName} ${lead.lastName}`) : null;
  const hoursAgo = Math.floor((Date.now() - new Date(opportunity.createdAt!).getTime()) / (1000 * 60 * 60));
  const assignedUser = users && opportunity.assignedToUserId ? users.find(u => u.id === opportunity.assignedToUserId) : null;
  const assignedName = assignedUser ? (assignedUser.displayName || `${assignedUser.firstName || ""} ${assignedUser.lastName || ""}`.trim() || assignedUser.email) : null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-md border bg-amber-50 border-amber-200 transition-colors"
      data-testid={`stale-opportunity-${opportunity.id}`}
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <Badge variant="secondary" className="text-xs shrink-0 bg-amber-100 text-amber-700">
        {hoursAgo}h
      </Badge>
      <span className="text-sm flex-1 min-w-0 truncate">
        {clientName ? `${clientName} — ` : ""}{opportunity.title}
      </span>
      {assignedName && (
        <Badge variant="secondary" className="text-xs shrink-0 bg-blue-50 text-blue-700 border-blue-200" data-testid={`badge-assigned-${opportunity.id}`}>
          <User className="w-3 h-3 mr-1" />
          {assignedName}
        </Badge>
      )}
      {!assignedName && users && (
        <Badge variant="secondary" className="text-xs shrink-0 bg-gray-100 text-gray-500">
          Non assegnato
        </Badge>
      )}
      <Badge
        variant="outline"
        className="text-xs cursor-pointer shrink-0"
        onClick={() => navigate(`/opportunita?open=${opportunity.id}`)}
        data-testid={`link-stale-opportunity-${opportunity.id}`}
      >
        <ExternalLink className="w-3 h-3 mr-1" />
        Apri
      </Badge>
    </div>
  );
}

function QuoteExpiringDialog({ notification, open, onClose }: { notification: AppNotification; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [snoozedays, setSnoozedays] = useState("14");

  const opportunityId = notification.link?.match(/open=([^&]+)/)?.[1] ?? null;

  const markLostMutation = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error("ID opportunità non trovato");
      const stages = await (await apiRequest("GET", "/api/stages")).json() as Array<{ id: string; name: string }>;
      const persoStage = stages.find(s => s.name === "Perso");
      if (!persoStage) throw new Error("Stage 'Perso' non trovato");
      await apiRequest("PUT", `/api/opportunities/${opportunityId}/move`, { stageId: persoStage.id });
      await apiRequest("PUT", `/api/notifications/${notification.id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === "string" && (key.startsWith("/api/notifications") || key.startsWith("/api/opportunities"));
      }});
      toast({ title: "Opportunità segnata come Persa" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error("ID opportunità non trovato");
      await apiRequest("POST", `/api/opportunities/${opportunityId}/snooze-reminder`, { days: parseInt(snoozedays) });
      await apiRequest("PUT", `/api/notifications/${notification.id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/notifications");
      }});
      toast({ title: `Promemoria posticipato di ${snoozedays} giorni` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const isPending = markLostMutation.isPending || snoozeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-quote-expiring">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-amber-500" />
            Preventivo in attesa
          </DialogTitle>
          <DialogDescription>
            {notification.message}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Cosa vuoi fare con questa opportunità?
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm shrink-0">Posticipa di:</span>
            <Select value={snoozedays} onValueChange={setSnoozedays}>
              <SelectTrigger className="w-[120px] h-8 text-sm" data-testid="select-snooze-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 giorni</SelectItem>
                <SelectItem value="14">14 giorni</SelectItem>
                <SelectItem value="30">30 giorni</SelectItem>
                <SelectItem value="60">60 giorni</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            onClick={() => markLostMutation.mutate()}
            disabled={isPending}
            data-testid="button-mark-lost"
          >
            Segna come Persa
          </Button>
          <Button
            onClick={() => snoozeMutation.mutate()}
            disabled={isPending}
            data-testid="button-snooze-reminder"
          >
            Posticipa di {snoozedays} giorni
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotificationItem({ notification }: { notification: AppNotification }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [quoteExpiringDialogOpen, setQuoteExpiringDialogOpen] = useState(false);

  const markRead = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/notifications/${notification.id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/notifications");
      }});
    },
  });

  const timeAgo = (() => {
    const diff = Date.now() - new Date(notification.createdAt!).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "ora";
    if (hours < 24) return `${hours}h fa`;
    const days = Math.floor(hours / 24);
    return `${days}g fa`;
  })();

  const styleMap: Record<string, { bg: string; border: string; iconColor: string; badgeBg: string; badgeText: string; Icon: typeof FolderKanban }> = {
    NEW_PROJECT: { bg: "bg-emerald-50", border: "border-emerald-200", iconColor: "text-emerald-600", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700", Icon: FolderKanban },
    SITE_PHOTO: { bg: "bg-blue-50", border: "border-blue-200", iconColor: "text-blue-600", badgeBg: "bg-blue-100", badgeText: "text-blue-700", Icon: Camera },
    SITE_PHOTO_VIDEO: { bg: "bg-purple-50", border: "border-purple-200", iconColor: "text-purple-600", badgeBg: "bg-purple-100", badgeText: "text-purple-700", Icon: Video },
    QUOTE_EXPIRING: { bg: "bg-amber-50", border: "border-amber-200", iconColor: "text-amber-600", badgeBg: "bg-amber-100", badgeText: "text-amber-700", Icon: Timer },
  };
  const s = styleMap[notification.type] || styleMap.NEW_PROJECT;

  const handleNotificationClick = () => {
    if (notification.type === "QUOTE_EXPIRING") {
      setQuoteExpiringDialogOpen(true);
    }
  };

  return (
    <>
      {notification.type === "QUOTE_EXPIRING" && (
        <QuoteExpiringDialog
          notification={notification}
          open={quoteExpiringDialogOpen}
          onClose={() => setQuoteExpiringDialogOpen(false)}
        />
      )}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-md border ${s.bg} ${s.border} transition-colors ${notification.type === "QUOTE_EXPIRING" ? "cursor-pointer" : ""}`}
        data-testid={`notification-${notification.id}`}
        onClick={notification.type === "QUOTE_EXPIRING" ? handleNotificationClick : undefined}
      >
        <s.Icon className={`w-4 h-4 ${s.iconColor} shrink-0`} />
        <Badge variant="secondary" className={`text-xs shrink-0 ${s.badgeBg} ${s.badgeText}`}>
          {timeAgo}
        </Badge>
        <span className="text-sm flex-1 min-w-0 truncate">
          {notification.message}
        </span>
        {notification.link && notification.type !== "QUOTE_EXPIRING" && (
          <Badge
            variant="outline"
            className="text-xs cursor-pointer shrink-0"
            onClick={() => navigate(notification.link!)}
            data-testid={`link-notification-${notification.id}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Vai
          </Badge>
        )}
        {notification.type === "QUOTE_EXPIRING" && (
          <Badge
            variant="outline"
            className="text-xs cursor-pointer shrink-0 text-amber-700 border-amber-300"
            onClick={(e) => { e.stopPropagation(); handleNotificationClick(); }}
            data-testid={`button-quote-expiring-action-${notification.id}`}
          >
            <Timer className="w-3 h-3 mr-1" />
            Gestisci
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={(e) => { e.stopPropagation(); markRead.mutate(); }}
          disabled={markRead.isPending}
          data-testid={`button-mark-read-${notification.id}`}
        >
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        </Button>
      </div>
    </>
  );
}

function TechnicianDashboard({
  user,
  notifications,
}: {
  user: any;
  notifications: AppNotification[];
}) {
  const userName = user?.firstName || user?.email?.split("@")[0] || "Utente";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-welcome">
          Benvenuto, {userName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Ecco le tue notifiche
        </p>
      </div>

      {notifications.length > 0 && (
        <Card data-testid="card-technician-notifications">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
            <BellRing className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">
              Notifiche
              <Badge variant="destructive" className="ml-2">
                {notifications.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {notifications.filter(n => n.type === "NEW_PROJECT").length > 0 && (
                <div data-testid="section-new-projects-technician">
                  <h3 className="text-xs font-semibold uppercase text-emerald-600 mb-2 flex items-center gap-1">
                    <FolderKanban className="w-3 h-3" />
                    Nuovi cantieri ({notifications.filter(n => n.type === "NEW_PROJECT").length})
                  </h3>
                  <div className="space-y-2">
                    {notifications.filter(n => n.type === "NEW_PROJECT").map(n => (
                      <NotificationItem key={n.id} notification={n} />
                    ))}
                  </div>
                </div>
              )}
              {notifications.filter(n => n.type === "SITE_PHOTO_VIDEO").length > 0 && (
                <div data-testid="section-site-photo-video-technician">
                  <h3 className="text-xs font-semibold uppercase text-purple-600 mb-2 flex items-center gap-1">
                    <Video className="w-3 h-3" />
                    Cantieri da foto + video ({notifications.filter(n => n.type === "SITE_PHOTO_VIDEO").length})
                  </h3>
                  <div className="space-y-2">
                    {notifications.filter(n => n.type === "SITE_PHOTO_VIDEO").map(n => (
                      <NotificationItem key={n.id} notification={n} />
                    ))}
                  </div>
                </div>
              )}
              {notifications.filter(n => n.type === "SITE_PHOTO").length > 0 && (
                <div data-testid="section-site-photo-technician">
                  <h3 className="text-xs font-semibold uppercase text-blue-600 mb-2 flex items-center gap-1">
                    <Camera className="w-3 h-3" />
                    Cantieri da foto ({notifications.filter(n => n.type === "SITE_PHOTO").length})
                  </h3>
                  <div className="space-y-2">
                    {notifications.filter(n => n.type === "SITE_PHOTO").map(n => (
                      <NotificationItem key={n.id} notification={n} />
                    ))}
                  </div>
                </div>
              )}
              {notifications.filter(n => n.type === "QUOTE_EXPIRING").length > 0 && (
                <div data-testid="section-quote-expiring-technician">
                  <h3 className="text-xs font-semibold uppercase text-amber-600 mb-2 flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    Preventivi in attesa ({notifications.filter(n => n.type === "QUOTE_EXPIRING").length})
                  </h3>
                  <div className="space-y-2">
                    {notifications.filter(n => n.type === "QUOTE_EXPIRING").map(n => (
                      <NotificationItem key={n.id} notification={n} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const agentTimeRangeOptions = [
  { label: "Sett. scorsa", value: "last-week" },
  { label: "Mese scorso", value: "last-month" },
  { label: "Mese", value: "month" },
  { label: "Trimestre", value: "quarter" },
  { label: "Anno", value: "year" },
  { label: "Personalizzato", value: "custom" },
];

function getAgentDateRange(reportTimeRange: string, customStartDate: string, customEndDate: string): { start: Date; end: Date } {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  if (reportTimeRange === "last-week") {
    const dayOfWeek = today.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysFromMonday);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSaturday = new Date(lastMonday);
    lastSaturday.setDate(lastMonday.getDate() + 5);
    return {
      start: lastMonday,
      end: new Date(lastSaturday.getFullYear(), lastSaturday.getMonth(), lastSaturday.getDate(), 23, 59, 59, 999),
    };
  } else if (reportTimeRange === "last-month") {
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfLastMonth = new Date(firstOfThisMonth.getTime() - 1);
    const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
    return {
      start: firstOfLastMonth,
      end: new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), lastOfLastMonth.getDate(), 23, 59, 59, 999),
    };
  } else if (reportTimeRange === "month") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
  } else if (reportTimeRange === "quarter") {
    const qMonth = Math.floor(today.getMonth() / 3) * 3;
    return { start: new Date(today.getFullYear(), qMonth, 1), end };
  } else if (reportTimeRange === "year") {
    return { start: new Date(today.getFullYear(), 0, 1), end };
  } else if (reportTimeRange === "custom" && customStartDate) {
    const s = new Date(customStartDate);
    const e = customEndDate ? new Date(customEndDate + "T23:59:59.999") : end;
    return { start: s, end: e };
  }
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
}

function SalesAgentDashboard({ 
  user, 
  leads, 
  opportunities, 
  activeReminders, 
  upcomingReminders, 
  staleOpportunities,
  isLoading, 
  isLoadingReminders,
  notifications 
}: {
  user: any;
  leads: Lead[];
  opportunities: Opportunity[];
  activeReminders: Reminder[];
  upcomingReminders: Reminder[];
  staleOpportunities: Opportunity[];
  isLoading: boolean;
  isLoadingReminders: boolean;
  notifications: AppNotification[];
}) {
  const userName = user?.firstName || user?.email?.split("@")[0] || "Utente";
  const [reportTimeRange, setReportTimeRange] = useState("month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const dateRange = getAgentDateRange(reportTimeRange, customStartDate, customEndDate);
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const startDateStr = formatLocalDate(dateRange.start);
  const endDateStr = formatLocalDate(dateRange.end);

  const allReminders = [...activeReminders, ...upcomingReminders];
  const contactReminders = allReminders.filter(r => r.leadId && !r.opportunityId);
  const opportunityReminders = allReminders.filter(r => r.opportunityId);

  const totalContactCount = contactReminders.length;
  const totalOpportunityCount = opportunityReminders.length;
  const hasContent = allReminders.length > 0 || staleOpportunities.length > 0 || notifications.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-welcome">
          Benvenuto, {userName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Ecco una panoramica della tua attività
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="time-range-filter-bar">
        {agentTimeRangeOptions.map(opt => (
          <Button
            key={opt.value}
            variant={reportTimeRange === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setReportTimeRange(opt.value)}
            data-testid={`button-agent-range-${opt.value}`}
          >
            {opt.label}
          </Button>
        ))}
        {reportTimeRange === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <Input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="h-8 w-36 text-sm"
              data-testid="input-custom-start-date"
            />
            <span className="text-muted-foreground text-sm">—</span>
            <Input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="h-8 w-36 text-sm"
              data-testid="input-custom-end-date"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {!isLoadingReminders && hasContent && (
          <Card data-testid="card-reminders-today">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">
                  Promemoria
                  {(allReminders.length + staleOpportunities.length) > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {allReminders.length + staleOpportunities.length}
                    </Badge>
                  )}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {notifications.filter(n => n.type === "QUOTE_EXPIRING").length > 0 && (
                  <div data-testid="section-quote-expiring">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                      <Timer className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-semibold text-amber-700">
                        Preventivi in attesa
                      </h3>
                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">{notifications.filter(n => n.type === "QUOTE_EXPIRING").length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {notifications.filter(n => n.type === "QUOTE_EXPIRING").map(n => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </div>
                  </div>
                )}
                {notifications.filter(n => n.type !== "QUOTE_EXPIRING").length > 0 && (
                  <div data-testid="section-new-projects">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                      <FolderKanban className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-emerald-700">
                        Nuovi cantieri
                      </h3>
                      <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">{notifications.filter(n => n.type !== "QUOTE_EXPIRING").length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {notifications.filter(n => n.type !== "QUOTE_EXPIRING").map(n => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </div>
                  </div>
                )}
                {staleOpportunities.length > 0 && (
                  <div data-testid="section-stale-opportunities">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-semibold text-amber-700">
                        Opportunità in attesa
                      </h3>
                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">{staleOpportunities.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {staleOpportunities.map(o => (
                        <StaleOpportunityItem key={o.id} opportunity={o} leads={leads} />
                      ))}
                    </div>
                  </div>
                )}
                {allReminders.length > 0 && (
                  <>
                    <div data-testid="section-reminders-contacts">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">
                          Contatti
                        </h3>
                        {totalContactCount > 0 && (
                          <Badge variant="secondary" className="text-xs">{totalContactCount}</Badge>
                        )}
                      </div>
                      <ReminderSection
                        title="Contatti"
                        icon={User}
                        reminders={contactReminders}
                        leads={leads}
                        opportunities={opportunities}
                        emptyMessage="Nessun promemoria per contatti"
                      />
                    </div>

                    <div data-testid="section-reminders-opportunities">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">
                          Opportunità
                        </h3>
                        {totalOpportunityCount > 0 && (
                          <Badge variant="secondary" className="text-xs">{totalOpportunityCount}</Badge>
                        )}
                      </div>
                      <ReminderSection
                        title="Opportunità"
                        icon={Briefcase}
                        reminders={opportunityReminders}
                        leads={leads}
                        opportunities={opportunities}
                        emptyMessage="Nessun promemoria per opportunità"
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          <SalesAgentTargetBanner startDate={startDateStr} endDate={endDateStr} />
          <QuoteStatsCard isLoading={isLoading} startDate={startDateStr} endDate={endDateStr} />
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ 
  user, 
  leads, 
  opportunities, 
  stages,
  activeReminders, 
  upcomingReminders, 
  staleOpportunities,
  isLoading, 
  isLoadingReminders,
  notifications 
}: {
  user: any;
  leads: Lead[];
  opportunities: Opportunity[];
  stages: PipelineStage[];
  activeReminders: Reminder[];
  upcomingReminders: Reminder[];
  staleOpportunities: Opportunity[];
  isLoading: boolean;
  isLoadingReminders: boolean;
  notifications: AppNotification[];
}) {
  const userName = user?.firstName || user?.email?.split("@")[0] || "Utente";
  const [, navigate] = useLocation();
  const [expandedAcqChannel, setExpandedAcqChannel] = useState<string | null>(null);

  const { data: teamUsers = [] } = useQuery<TeamUser[]>({
    queryKey: ["/api/users"],
  });

  const now = new Date();
  const overdueReminders = activeReminders.filter(r => new Date(r.dueDate) < new Date(now.toDateString()));
  const todayReminders = activeReminders.filter(r => new Date(r.dueDate).toDateString() === now.toDateString());
  const hasContent = activeReminders.length > 0 || upcomingReminders.length > 0 || staleOpportunities.length > 0 || notifications.length > 0;
  const [remindersCollapsed, setRemindersCollapsed] = useState(() => {
    try { return localStorage.getItem("dashboard_reminders_collapsed") === "true"; } catch { return false; }
  });
  const effectiveRemindersCollapsed = remindersCollapsed && notifications.length === 0;
  const toggleRemindersCollapsed = () => {
    setRemindersCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("dashboard_reminders_collapsed", String(next)); } catch {}
      return next;
    });
  };

  const timeRangeOptions = [
    { label: "Sett. scorsa", value: "last-week" },
    { label: "Mese scorso", value: "last-month" },
    { label: "Mese", value: "month" },
    { label: "Trimestre", value: "quarter" },
    { label: "Anno", value: "year" },
    { label: "Personalizzato", value: "custom" },
  ];
  const [reportTimeRange, setReportTimeRange] = useState("month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("all");
  const [channelTypeFilter, setChannelTypeFilter] = useState<"all" | "lead" | "cliente" | "non_in_target">("all");

  const currentYear = new Date().getFullYear();

  interface WonByMonthData {
    currentYear: number[];
    lastYear: number[];
    twoYearsAgo: number[];
    years: { currentYear: number; lastYear: number; twoYearsAgo: number };
  }

  const wonByMonthUrl = `/api/dashboard/won-by-month?year=${currentYear}${selectedSeller !== "all" ? `&sellerId=${selectedSeller}` : ""}`;

  const { data: wonByMonthData, isLoading: isLoadingWonByMonth } = useQuery<WonByMonthData>({
    queryKey: [wonByMonthUrl],
  });

  const salesAgents = teamUsers.filter(u => u.role === "SALES_AGENT");

  const applySellerFilter = <T extends { assignedToUserId?: string | null }>(items: T[]): T[] => {
    if (selectedSeller === "all") return items;
    return items.filter(item => item.assignedToUserId === selectedSeller);
  };

  const getDateRange = (): { start: Date; end: Date } => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    if (reportTimeRange === "last-week") {
      const dayOfWeek = today.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysFromMonday);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSaturday = new Date(lastMonday);
      lastSaturday.setDate(lastMonday.getDate() + 5);
      return {
        start: lastMonday,
        end: new Date(lastSaturday.getFullYear(), lastSaturday.getMonth(), lastSaturday.getDate(), 23, 59, 59, 999),
      };
    } else if (reportTimeRange === "last-month") {
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfLastMonth = new Date(firstOfThisMonth.getTime() - 1);
      const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
      return {
        start: firstOfLastMonth,
        end: new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), lastOfLastMonth.getDate(), 23, 59, 59, 999),
      };
    } else if (reportTimeRange === "month") {
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
    } else if (reportTimeRange === "quarter") {
      const qMonth = Math.floor(today.getMonth() / 3) * 3;
      return { start: new Date(today.getFullYear(), qMonth, 1), end };
    } else if (reportTimeRange === "year") {
      return { start: new Date(today.getFullYear(), 0, 1), end };
    } else if (reportTimeRange === "custom" && customStartDate) {
      const s = new Date(customStartDate);
      const e = customEndDate ? new Date(customEndDate + "T23:59:59.999") : end;
      return { start: s, end: e };
    }
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
  };

  const getPreviousRange = (current: { start: Date; end: Date }): { start: Date; end: Date } => {
    const durationMs = current.end.getTime() - current.start.getTime();
    const prevEnd = new Date(current.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    return { start: prevStart, end: prevEnd };
  };

  const currentRange = getDateRange();
  const previousRange = getPreviousRange(currentRange);

  const filterByRange = <T extends { createdAt: string | Date | null }>(items: T[], range: { start: Date; end: Date }): T[] => {
    return items.filter(item => {
      if (!item.createdAt) return false;
      const d = new Date(item.createdAt);
      return d >= range.start && d <= range.end;
    });
  };

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const sellerLeads = applySellerFilter(leads);
  const sellerOpportunities = applySellerFilter(opportunities);

  const filteredLeads = filterByRange(sellerLeads, currentRange);
  const filteredOpportunities = filterByRange(sellerOpportunities, currentRange);
  const prevLeads = filterByRange(sellerLeads, previousRange);
  const prevOpportunities = filterByRange(sellerOpportunities, previousRange);

  const prevInviatoStage = sortedStages.find(s => s.name.toLowerCase().includes("preventivo inviato"));
  const vintoStage = sortedStages.find(s => s.name.toLowerCase() === "vinto");
  const persoStage = sortedStages.find(s => s.name.toLowerCase() === "perso");

  const filterByCreatedAtRange = (items: Opportunity[], range: { start: Date; end: Date }): Opportunity[] => {
    return items.filter(item => {
      if (!item.createdAt) return false;
      const d = new Date(item.createdAt);
      return d >= range.start && d <= range.end;
    });
  };

  const quoteStageIds = [prevInviatoStage?.id, vintoStage?.id, persoStage?.id].filter(Boolean) as string[];

  const inAttesaOpps = prevInviatoStage
    ? sellerOpportunities.filter(o => o.stageId === prevInviatoStage.id)
    : [];
  const vintiOpps = sellerOpportunities.filter(o => {
    if (!vintoStage || o.stageId !== vintoStage.id || !o.wonAt) return false;
    const d = new Date(o.wonAt);
    return d >= currentRange.start && d <= currentRange.end;
  });
  const persiOpps = sellerOpportunities.filter(o => {
    if (!persoStage || o.stageId !== persoStage.id || !o.lostAt) return false;
    const d = new Date(o.lostAt);
    return d >= currentRange.start && d <= currentRange.end;
  });
  const emessiOpps = filterByCreatedAtRange(sellerOpportunities.filter(o => quoteStageIds.includes(o.stageId)), currentRange);

  const prevInAttesaOpps = prevInviatoStage
    ? sellerOpportunities.filter(o => o.stageId === prevInviatoStage.id)
    : [];
  const prevVintiOpps = sellerOpportunities.filter(o => {
    if (!vintoStage || o.stageId !== vintoStage.id || !o.wonAt) return false;
    const d = new Date(o.wonAt);
    return d >= previousRange.start && d <= previousRange.end;
  });
  const prevPersiOpps = sellerOpportunities.filter(o => {
    if (!persoStage || o.stageId !== persoStage.id || !o.lostAt) return false;
    const d = new Date(o.lostAt);
    return d >= previousRange.start && d <= previousRange.end;
  });
  const prevEmessiOpps = filterByCreatedAtRange(sellerOpportunities.filter(o => quoteStageIds.includes(o.stageId)), previousRange);

  const sumValue = (opps: Opportunity[]) => opps.reduce((sum, o) => sum + (o.value ? parseFloat(o.value) : 0), 0);

  const inAttesaTotal = sumValue(inAttesaOpps);
  const vintiTotal = sumValue(vintiOpps);
  const persiTotal = sumValue(persiOpps);
  const emessiTotal = sumValue(emessiOpps);
  const emessiCount = emessiOpps.length;

  const prevInAttesaTotal = sumValue(prevInAttesaOpps);
  const prevVintiTotal = sumValue(prevVintiOpps);
  const prevPersiTotal = sumValue(prevPersiOpps);
  const prevEmessiTotal = sumValue(prevEmessiOpps);
  const prevEmessiCount = prevEmessiOpps.length;

  const calcVariation = (current: number, previous: number): { percent: number; direction: "up" | "down" | "neutral" } => {
    if (previous === 0 && current === 0) return { percent: 0, direction: "neutral" };
    if (previous === 0) return { percent: 100, direction: "up" };
    const pct = Math.round(((current - previous) / previous) * 100);
    return { percent: Math.abs(pct), direction: pct > 0 ? "up" : pct < 0 ? "down" : "neutral" };
  };

  const emessiValueVar = calcVariation(emessiTotal, prevEmessiTotal);
  const inAttesaValueVar = calcVariation(inAttesaTotal, prevInAttesaTotal);
  const vintiValueVar = calcVariation(vintiTotal, prevVintiTotal);
  const persiValueVar = calcVariation(persiTotal, prevPersiTotal);

  const contactTypeValues = ["lead", "cliente", "non_in_target"] as const;
  const filteredLeadsTyped = filteredLeads.filter(l => contactTypeValues.includes(l.type as typeof contactTypeValues[number])).length;
  const prevLeadsTyped = prevLeads.filter(l => contactTypeValues.includes(l.type as typeof contactTypeValues[number])).length;
  const totalLeadsVariation = calcVariation(filteredLeadsTyped, prevLeadsTyped);
  const totalOppsVariation = calcVariation(filteredOpportunities.length, prevOpportunities.length);

  const contactTypes = [
    { name: "Lead", type: "lead" as const, color: "#4563FF" },
    { name: "Clienti", type: "cliente" as const, color: "#61CE85" },
    { name: "Non in target", type: "non_in_target" as const, color: "#94a3b8" },
  ];


  const pipelineData = sortedStages.map(stage => ({
    name: stage.name,
    value: filteredOpportunities.filter(o => o.stageId === stage.id).length,
    prevValue: prevOpportunities.filter(o => o.stageId === stage.id).length,
    color: stage.color || "#4563FF",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-welcome">
          Benvenuto, {userName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Ecco una panoramica della tua attività
        </p>
      </div>

      {!isLoadingReminders && hasContent && (
        <Card data-testid="card-reminders-today">
          <CardHeader
            className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 cursor-pointer select-none"
            onClick={toggleRemindersCollapsed}
            data-testid="button-toggle-reminders"
          >
            <div className="flex items-center gap-2">
              <BellRing className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">
                Promemoria
                {(activeReminders.length + upcomingReminders.length + staleOpportunities.length + notifications.length) > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {activeReminders.length + upcomingReminders.length + staleOpportunities.length + notifications.length}
                  </Badge>
                )}
              </CardTitle>
            </div>
            {effectiveRemindersCollapsed ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
            )}
          </CardHeader>
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: effectiveRemindersCollapsed ? "0px" : "2000px", opacity: effectiveRemindersCollapsed ? 0 : 1 }}
          >
            <CardContent>
              <div className="space-y-4">
                {notifications.filter(n => n.type === "NEW_PROJECT").length > 0 && (
                  <div data-testid="section-new-projects-admin">
                    <h3 className="text-xs font-semibold uppercase text-emerald-600 mb-2 flex items-center gap-1">
                      <FolderKanban className="w-3 h-3" />
                      Nuovi cantieri ({notifications.filter(n => n.type === "NEW_PROJECT").length})
                    </h3>
                    <div className="space-y-2">
                      {notifications.filter(n => n.type === "NEW_PROJECT").map(n => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </div>
                  </div>
                )}
                {notifications.filter(n => n.type === "SITE_PHOTO_VIDEO").length > 0 && (
                  <div data-testid="section-site-photo-video-admin">
                    <h3 className="text-xs font-semibold uppercase text-purple-600 mb-2 flex items-center gap-1">
                      <Video className="w-3 h-3" />
                      Cantieri da foto + video ({notifications.filter(n => n.type === "SITE_PHOTO_VIDEO").length})
                    </h3>
                    <div className="space-y-2">
                      {notifications.filter(n => n.type === "SITE_PHOTO_VIDEO").map(n => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </div>
                  </div>
                )}
                {notifications.filter(n => n.type === "SITE_PHOTO").length > 0 && (
                  <div data-testid="section-site-photo-admin">
                    <h3 className="text-xs font-semibold uppercase text-blue-600 mb-2 flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      Cantieri da foto ({notifications.filter(n => n.type === "SITE_PHOTO").length})
                    </h3>
                    <div className="space-y-2">
                      {notifications.filter(n => n.type === "SITE_PHOTO").map(n => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </div>
                  </div>
                )}
                {notifications.filter(n => n.type === "QUOTE_EXPIRING").length > 0 && (
                  <div data-testid="section-quote-expiring-admin">
                    <h3 className="text-xs font-semibold uppercase text-amber-600 mb-2 flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      Preventivi in attesa ({notifications.filter(n => n.type === "QUOTE_EXPIRING").length})
                    </h3>
                    <div className="space-y-2">
                      {notifications.filter(n => n.type === "QUOTE_EXPIRING").map(n => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </div>
                  </div>
                )}
                {staleOpportunities.length > 0 && (
                  <div data-testid="section-stale-opportunities">
                    <h3 className="text-xs font-semibold uppercase text-amber-600 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Opportunità in attesa ({staleOpportunities.length})
                    </h3>
                    <div className="space-y-2">
                      {staleOpportunities.map(o => (
                        <StaleOpportunityItem key={o.id} opportunity={o} leads={leads} users={teamUsers} />
                      ))}
                    </div>
                  </div>
                )}
                {overdueReminders.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-destructive mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      In ritardo ({overdueReminders.length})
                    </h3>
                    <div className="space-y-2">
                      {overdueReminders.map(r => (
                        <ReminderItem key={r.id} reminder={r} leads={leads} opportunities={opportunities} />
                      ))}
                    </div>
                  </div>
                )}
                {todayReminders.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Oggi ({todayReminders.length})
                    </h3>
                    <div className="space-y-2">
                      {todayReminders.map(r => (
                        <ReminderItem key={r.id} reminder={r} leads={leads} opportunities={opportunities} />
                      ))}
                    </div>
                  </div>
                )}
                {upcomingReminders.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Domani ({upcomingReminders.length})
                    </h3>
                    <div className="space-y-2">
                      {upcomingReminders.map(r => (
                        <ReminderItem key={r.id} reminder={r} leads={leads} opportunities={opportunities} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap" data-testid="filter-report-time-range">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-1">Periodo:</span>
        {timeRangeOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setReportTimeRange(opt.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              reportTimeRange === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            data-testid={`filter-time-${opt.value}`}
          >
            {opt.label}
          </button>
        ))}
        {reportTimeRange === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <Input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-7 w-[140px] text-xs"
              data-testid="input-custom-start-date"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <Input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-7 w-[140px] text-xs"
              data-testid="input-custom-end-date"
            />
          </div>
        )}
        {salesAgents.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <User className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedSeller} onValueChange={setSelectedSeller}>
              <SelectTrigger className="h-7 w-[180px] text-xs" data-testid="filter-seller">
                <SelectValue placeholder="Venditore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i venditori</SelectItem>
                {salesAgents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.displayName || `${agent.firstName || ""} ${agent.lastName || ""}`.trim() || agent.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card data-testid="card-report-quotes">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <Euro className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Preventivi</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between py-2.5 border-b" data-testid="stat-emessi">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-semibold">Emessi</span>
                    <span className="text-xs text-muted-foreground">({emessiCount})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tabular-nums">
                      €{emessiTotal.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {emessiValueVar.direction !== "neutral" && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-medium ${emessiValueVar.direction === "up" ? "text-emerald-600" : "text-red-500"}`}>
                        {emessiValueVar.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {emessiValueVar.percent}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 pl-4 border-b" data-testid="stat-in-attesa">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-sm text-muted-foreground">In attesa</span>
                    <span className="text-xs text-muted-foreground/70">({inAttesaOpps.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold tabular-nums text-amber-600">
                      €{inAttesaTotal.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {inAttesaValueVar.direction !== "neutral" && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-medium ${inAttesaValueVar.direction === "up" ? "text-amber-600" : "text-emerald-600"}`}>
                        {inAttesaValueVar.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {inAttesaValueVar.percent}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 pl-4 border-b" data-testid="stat-vinti">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-sm text-muted-foreground">Accettati</span>
                    <span className="text-xs text-muted-foreground/70">({vintiOpps.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold tabular-nums text-emerald-600">
                      €{vintiTotal.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {vintiValueVar.direction !== "neutral" && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-medium ${vintiValueVar.direction === "up" ? "text-emerald-600" : "text-red-500"}`}>
                        {vintiValueVar.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {vintiValueVar.percent}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 pl-4" data-testid="stat-persi">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-sm text-muted-foreground">Persi</span>
                    <span className="text-xs text-muted-foreground/70">({persiOpps.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold tabular-nums text-red-500">
                      €{persiTotal.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {persiValueVar.direction !== "neutral" && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-medium ${persiValueVar.direction === "up" ? "text-red-500" : "text-emerald-600"}`}>
                        {persiValueVar.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {persiValueVar.percent}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
        const cyLabel = String(wonByMonthData?.years?.currentYear ?? currentYear);
        const lyLabel = String(wonByMonthData?.years?.lastYear ?? currentYear - 1);
        const tyLabel = String(wonByMonthData?.years?.twoYearsAgo ?? currentYear - 2);
        const cyKey = `y${cyLabel}`;
        const lyKey = `y${lyLabel}`;
        const tyKey = `y${tyLabel}`;
        const wonChartData = months.map((month, i) => ({
          month,
          [cyKey]: Math.round((wonByMonthData?.currentYear?.[i] ?? 0) * 100) / 100,
          [lyKey]: Math.round((wonByMonthData?.lastYear?.[i] ?? 0) * 100) / 100,
          [tyKey]: Math.round((wonByMonthData?.twoYearsAgo?.[i] ?? 0) * 100) / 100,
        }));
        return (
          <Card data-testid="card-won-by-month">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Trophy className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Vinti per anno</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingWonByMonth ? (
                <Skeleton className="h-[220px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={wonChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`} width={45} />
                    <Tooltip
                      formatter={(value: number, name: string | number) => [`€${Number(value).toLocaleString("it-IT", { minimumFractionDigits: 0 })}`, String(name)]}
                      contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey={cyKey} name={cyLabel} fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={20} />
                    <Bar dataKey={lyKey} name={lyLabel} fill="#6366f1" radius={[2, 2, 0, 0]} maxBarSize={20} />
                    <Bar dataKey={tyKey} name={tyLabel} fill="#94a3b8" radius={[2, 2, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        );
      })()}

      </div>

      <SalesTargetsSection reportTimeRange={reportTimeRange} currentRange={currentRange} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-report-contacts">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Contatti</CardTitle>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-2xl font-bold" data-testid="text-total-contacts">{contactTypes.reduce((sum, ct) => sum + filteredLeads.filter(l => l.type === ct.type).length, 0)}</span>
              {totalLeadsVariation.direction !== "neutral" && (
                <span className={`flex items-center gap-0.5 text-xs font-medium ${totalLeadsVariation.direction === "up" ? "text-emerald-600" : "text-red-500"}`} data-testid="badge-contacts-variation">
                  {totalLeadsVariation.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {totalLeadsVariation.percent}%
                </span>
              )}
              {totalLeadsVariation.direction === "neutral" && prevLeadsTyped > 0 && (
                <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                  <Minus className="w-3 h-3" />
                  0%
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <>
                <div className="flex flex-col gap-2" data-testid="section-contact-breakdown">
                  {contactTypes.map(ct => {
                    const curr = filteredLeads.filter(l => l.type === ct.type).length;
                    const prev = prevLeads.filter(l => l.type === ct.type).length;
                    const v = calcVariation(curr, prev);
                    return (
                      <div key={ct.type} className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: ct.color }} />
                        <span className="text-sm text-muted-foreground flex-1">{ct.name}</span>
                        <span className="text-sm font-semibold tabular-nums" data-testid={`text-count-${ct.name.toLowerCase().replace(/\s+/g, "-")}`}>{curr}</span>
                        {v.direction !== "neutral" && (
                          <span className={`text-[10px] font-medium w-10 text-right ${v.direction === "up" ? "text-emerald-600" : "text-red-500"}`}>
                            {v.direction === "up" ? "+" : "-"}{v.percent}%
                          </span>
                        )}
                        {v.direction === "neutral" && prev > 0 && (
                          <span className="text-[10px] font-medium text-muted-foreground w-10 text-right">=</span>
                        )}
                        {v.direction === "neutral" && prev === 0 && (
                          <span className="w-10" />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t pt-3" data-testid="section-contact-sources">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    Provenienza nuovi contatti
                  </h3>
                  <div className="flex gap-1 mb-3" data-testid="tabs-channel-type-filter">
                    {([
                      { key: "all" as const, label: "Tutti" },
                      { key: "lead" as const, label: "Lead", color: "#4563FF" },
                      { key: "cliente" as const, label: "Clienti", color: "#61CE85" },
                      { key: "non_in_target" as const, label: "Non in target", color: "#94a3b8" },
                    ]).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setChannelTypeFilter(tab.key)}
                        className={`px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors ${
                          channelTypeFilter === tab.key
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                        data-testid={`button-channel-filter-${tab.key}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const sourceLeads = channelTypeFilter === "all"
                      ? filteredLeads.filter(l => contactTypeValues.includes(l.type as typeof contactTypeValues[number]))
                      : filteredLeads.filter(l => l.type === channelTypeFilter);
                    const sourceLeadIds = new Set(sourceLeads.map(l => l.id));
                    const oppsForSourceLeads = filteredOpportunities.filter(o => sourceLeadIds.has(o.leadId));
                    const sourceMap = new Map<string, { count: number; oppsValue: number; breakdown: Record<string, number> }>();
                    for (const lead of sourceLeads) {
                      const ch = lead.source || "Sconosciuto";
                      const existing = sourceMap.get(ch) || { count: 0, oppsValue: 0, breakdown: {} };
                      existing.count++;
                      existing.breakdown[lead.type || "unknown"] = (existing.breakdown[lead.type || "unknown"] || 0) + 1;
                      sourceMap.set(ch, existing);
                    }
                    for (const opp of oppsForSourceLeads) {
                      const lead = sourceLeads.find(l => l.id === opp.leadId);
                      const ch = lead?.source || "Sconosciuto";
                      const existing = sourceMap.get(ch);
                      if (existing) existing.oppsValue += opp.value ? parseFloat(opp.value) : 0;
                    }
                    const sortedChannels = Array.from(sourceMap.entries())
                      .map(([name, data]) => ({ name, ...data }))
                      .sort((a, b) => b.count - a.count);

                    if (sortedChannels.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-contact-sources">
                          Nessun contatto nel periodo
                        </p>
                      );
                    }

                    const maxCount = sortedChannels[0]?.count || 1;

                    return (
                      <div className="flex flex-col gap-1.5">
                        {sortedChannels.map((ch, idx) => (
                          <div key={ch.name} data-testid={`row-contact-source-${idx}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm flex-1 truncate">{ch.name}</span>
                              {ch.oppsValue > 0 && (
                                <span className="text-xs text-muted-foreground tabular-nums shrink-0" data-testid={`text-source-opps-value-${idx}`}>
                                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(ch.oppsValue)}
                                </span>
                              )}
                              <span className="text-sm font-semibold tabular-nums" data-testid={`text-source-count-${idx}`}>
                                {ch.count}
                              </span>
                            </div>
                            <div className="mt-0.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              {channelTypeFilter === "all" ? (
                                <div className="h-full flex" style={{ width: `${(ch.count / maxCount) * 100}%` }}>
                                  {contactTypes.map(ct => {
                                    const seg = ch.breakdown[ct.type] || 0;
                                    if (seg === 0) return null;
                                    return (
                                      <div
                                        key={ct.type}
                                        className="h-full"
                                        style={{
                                          width: `${(seg / ch.count) * 100}%`,
                                          backgroundColor: ct.color,
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              ) : (
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${(ch.count / maxCount) * 100}%`,
                                    backgroundColor: contactTypes.find(ct => ct.type === channelTypeFilter)?.color || "#4563FF",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

              </>
            )}
          </CardContent>
        </Card>

        {(() => {
          const wonOppsInRange = sellerOpportunities.filter(o => {
            if (!vintoStage || o.stageId !== vintoStage.id || !o.wonAt) return false;
            const d = new Date(o.wonAt);
            return d >= currentRange.start && d <= currentRange.end;
          });

          const channelMap = new Map<string, { value: number; count: number; deals: { oppId: string; leadId: string; title: string; leadName: string; value: number }[] }>();
          let totalWonValue = 0;
          for (const opp of wonOppsInRange) {
            const lead = leads.find(l => l.id === opp.leadId);
            const channel = lead?.source || "Sconosciuto";
            const oppValue = opp.value ? parseFloat(opp.value) : 0;
            totalWonValue += oppValue;
            const existing = channelMap.get(channel) || { value: 0, count: 0, deals: [] };
            existing.value += oppValue;
            existing.count++;
            existing.deals.push({
              oppId: opp.id,
              leadId: opp.leadId,
              title: opp.title,
              leadName: lead ? (lead.name || `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "—") : "—",
              value: oppValue,
            });
            channelMap.set(channel, existing);
          }
          const wonChannels = Array.from(channelMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.value - a.value);

          return (
            <Card data-testid="card-report-acquisition-channels">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                <Trophy className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Canali di acquisizione</CardTitle>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-2xl font-bold" data-testid="text-total-acquisition-value">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(totalWonValue)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <div data-testid="section-acquisition-channels">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Trophy className="w-3 h-3" />
                      Canali di acquisizione (opportunità vinte)
                    </h3>
                    {wonChannels.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-acquisition-channels">
                        Nessuna opportunità vinta nel periodo
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {wonChannels.map((ch, idx) => {
                          const isExpanded = expandedAcqChannel === ch.name;
                          return (
                            <div key={ch.name} data-testid={`row-acquisition-channel-${idx}`}>
                              <button
                                onClick={() => setExpandedAcqChannel(isExpanded ? null : ch.name)}
                                className="flex items-center gap-2 w-full py-1 rounded hover:bg-muted/50 transition-colors text-left"
                                data-testid={`button-expand-channel-${idx}`}
                              >
                                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}.</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
                                <span className="text-sm flex-1 truncate">{ch.name}</span>
                                <span className="text-sm font-semibold tabular-nums" data-testid={`text-channel-value-${idx}`}>
                                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(ch.value)}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0 w-14 text-right" data-testid={`text-channel-deals-${idx}`}>
                                  {ch.count} deal
                                </span>
                              </button>
                              {isExpanded && (
                                <div className="ml-10 mt-1 mb-2 flex flex-col gap-1 border-l-2 border-primary/20 pl-3" data-testid={`list-channel-deals-${idx}`}>
                                  {ch.deals.map(deal => (
                                    <button
                                      key={deal.oppId}
                                      onClick={() => navigate(`/leads/${deal.leadId}`)}
                                      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/60 transition-colors text-left group"
                                      data-testid={`link-deal-${deal.oppId}`}
                                    >
                                      <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0" />
                                      <span className="text-sm flex-1 truncate group-hover:text-primary">{deal.title}</span>
                                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{deal.leadName}</span>
                                      <span className="text-sm font-semibold tabular-nums shrink-0">
                                        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(deal.value)}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}

const EXPIRING_QUOTES_CHECK_COOLDOWN = 4 * 60 * 60 * 1000; // 4 ore in ms
const RDC_PENDING_CHECK_COOLDOWN = 4 * 60 * 60 * 1000; // 4 ore in ms

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: opportunities = [] } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const { data: stages = [] } = useQuery<PipelineStage[]>({
    queryKey: ["/api/stages"],
  });

  const staleOpportunities = (() => {
    if (!stages.length || !opportunities.length) return [];
    const sorted = [...stages].sort((a, b) => a.order - b.order);
    const firstStageId = sorted[0]?.id;
    if (!firstStageId) return [];
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    return opportunities.filter(o => 
      o.stageId === firstStageId && new Date(o.createdAt!) < fourHoursAgo
    );
  })();

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date();
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const { data: activeReminders = [], isLoading: isLoadingReminders } = useQuery<Reminder[]>({
    queryKey: [`/api/reminders?completed=false&dueBefore=${todayEnd.toISOString()}`],
  });

  const { data: upcomingReminders = [] } = useQuery<Reminder[]>({
    queryKey: [`/api/reminders?completed=false&dueAfter=${tomorrow.toISOString()}&dueBefore=${tomorrowEnd.toISOString()}`],
  });

  const { data: unreadNotifications = [] } = useQuery<AppNotification[]>({
    queryKey: ['/api/notifications'],
  });
  const activeNotifications = unreadNotifications.filter(n => !n.isRead);

  const { data: notifPrefs = [] } = useQuery<{ notificationType: string; enabled: boolean }[]>({
    queryKey: ['/api/notification-preferences'],
  });
  const isStaleEnabled = (() => {
    const pref = notifPrefs.find(p => p.notificationType === "STALE_OPPORTUNITY");
    return pref ? pref.enabled : true;
  })();

  const isSalesAgent = user?.role === "SALES_AGENT";
  const isTechnician = user?.role === "TECHNICIAN";

  // Auto-check preventivi in scadenza, una volta ogni 4 ore per sessione
  useEffect(() => {
    if (!user) return;
    const storageKey = `quote_expiring_check_ts_${user.id}`;
    const lastCheck = parseInt(sessionStorage.getItem(storageKey) || "0", 10);
    const now = Date.now();
    if (now - lastCheck < EXPIRING_QUOTES_CHECK_COOLDOWN) return;
    sessionStorage.setItem(storageKey, String(now));
    apiRequest("POST", "/api/notifications/check-expiring-quotes").then(() => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/notifications");
      }});
    }).catch(() => {});
  }, [user]);

  // Auto-check RDC in attesa da 3+ giorni, una volta ogni 4 ore per sessione (solo tecnici e admin)
  useEffect(() => {
    if (!user) return;
    if (!["TECHNICIAN", "COMPANY_ADMIN", "SUPER_ADMIN"].includes(user.role)) return;
    const storageKey = `rdc_pending_check_ts_${user.id}`;
    const lastCheck = parseInt(sessionStorage.getItem(storageKey) || "0", 10);
    const now = Date.now();
    if (now - lastCheck < RDC_PENDING_CHECK_COOLDOWN) return;
    sessionStorage.setItem(storageKey, String(now));
    apiRequest("POST", "/api/notifications/check-rdc-pending").then(() => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/notifications");
      }});
    }).catch(() => {});
  }, [user]);

  return (
    <DashboardLayout user={user!} fullWidth>
      {isSalesAgent ? (
        <SalesAgentDashboard
          user={user}
          leads={leads}
          opportunities={opportunities}
          activeReminders={activeReminders}
          upcomingReminders={upcomingReminders}
          staleOpportunities={isStaleEnabled ? staleOpportunities.filter(o => o.assignedToUserId === user?.id) : []}
          isLoading={isLoading}
          isLoadingReminders={isLoadingReminders}
          notifications={activeNotifications}
        />
      ) : isTechnician ? (
        <TechnicianDashboard
          user={user}
          notifications={activeNotifications}
        />
      ) : (
        <AdminDashboard
          user={user}
          leads={leads}
          opportunities={opportunities}
          stages={stages}
          activeReminders={activeReminders}
          upcomingReminders={upcomingReminders}
          staleOpportunities={isStaleEnabled ? staleOpportunities : []}
          isLoading={isLoading}
          isLoadingReminders={isLoadingReminders}
          notifications={activeNotifications}
        />
      )}
    </DashboardLayout>
  );
}
