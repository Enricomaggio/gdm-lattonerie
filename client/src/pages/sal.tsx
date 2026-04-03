import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Plus,
  Trash2,
  FileCheck,
  Send,
  MapPin,
  FileText,
  Building2,
} from "lucide-react";

type CantiereStatus =
  | "NON_AVVIATO"
  | "MONTAGGIO_PIANIFICATO"
  | "MONTAGGIO_IN_CORSO"
  | "IN_CORSO"
  | "SMONTAGGIO_IN_CORSO"
  | "COMPLETATO";

type SalStatus = "BOZZA" | "VERIFICATO" | "INVIATO";

interface ProxitOp {
  date: string;
  activityType: string;
  teamCount: number;
  notes: string | null;
}

interface SalListItem {
  projectId: string;
  clientName: string | null;
  siteAddress: string | null;
  quoteNumber: string | null;
  quoteId: string | null;
  cantiereStatus: string;
  salId: string | null;
  salStatus: SalStatus | null;
  salTotal: number | null;
  proxitCount: number;
  proxitOps: ProxitOp[];
}

interface SalVoce {
  id: string;
  salPeriodId: string;
  description: string;
  quantity: string;
  um: string;
  unitPrice: string;
  discountPercent: string;
  total: string;
  vatRate: string;
  phase: string;
  sourceQuoteItemId: string | null;
  sortOrder: number;
}

interface SalPeriodDetail {
  id: string;
  projectId: string;
  period: string;
  status: SalStatus;
  notes: string | null;
  isFinalInvoice: boolean;
  sentAt: string | null;
  voci: SalVoce[];
}

const cantiereStatusConfig: Record<string, { label: string; className: string }> = {
  NON_AVVIATO: { label: "Non avviato", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  MONTAGGIO_PIANIFICATO: { label: "Mont. pianificato", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  MONTAGGIO_IN_CORSO: { label: "Montaggio in corso", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  IN_CORSO: { label: "In corso", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  SMONTAGGIO_IN_CORSO: { label: "Smontaggio in corso", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  COMPLETATO: { label: "Completato", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

const salStatusConfig: Record<SalStatus, { label: string; className: string }> = {
  BOZZA: { label: "Bozza", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  VERIFICATO: { label: "Verificato", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  INVIATO: { label: "Inviato", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
};

const PHASE_LABELS: Record<string, string> = {
  DOCUMENTI: "Documenti e Servizi",
  TRASPORTO_ANDATA: "Trasporto Andata",
  MOVIMENTAZIONE_MAGAZZINO: "Costo Magazzino",
  MONTAGGIO: "Montaggio",
  NOLEGGIO: "Noleggio",
  SMONTAGGIO: "Smontaggio",
  TRASPORTO_RITORNO: "Trasporto Ritorno",
};

const PHASE_ORDER = [
  "DOCUMENTI",
  "TRASPORTO_ANDATA",
  "MOVIMENTAZIONE_MAGAZZINO",
  "MONTAGGIO",
  "NOLEGGIO",
  "SMONTAGGIO",
  "TRASPORTO_RITORNO",
];

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  MONTAGGIO: "Montaggio",
  SMONTAGGIO: "Smontaggio",
  NOLEGGIO: "Noleggio",
  SOPRALLUOGO: "Sopralluogo",
  MANUTENZIONE: "Manutenzione",
  TRASFERTA: "Trasferta",
  ALTRO: "Altro",
};

const NOLEGGIO_STATUSES = ["IN_CORSO", "MONTAGGIO_IN_CORSO", "SMONTAGGIO_IN_CORSO"];

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}`;
}

function formatCurrency(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "€ 0,00";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "€ 0,00";
  return `€ ${num.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function computeTotal(q: string, up: string, disc: string): number {
  const qty = parseFloat(q) || 0;
  const unitP = parseFloat(up) || 0;
  const d = parseFloat(disc) || 0;
  return qty * unitP * (1 - d / 100);
}

function InlineEditCell({
  value,
  onChange,
  onBlur,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  className?: string;
}) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={`h-7 text-xs px-1.5 ${className}`}
      data-testid="input-sal-voce-field"
    />
  );
}

function SalDetailModal({
  projectId,
  period,
  cantiereStatus,
  clientName,
  siteAddress,
  quoteNumber,
  open,
  onOpenChange,
}: {
  projectId: string;
  period: string;
  cantiereStatus: string;
  clientName: string | null;
  siteAddress: string | null;
  quoteNumber: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [localSal, setLocalSal] = useState<SalPeriodDetail | null>(null);
  const [pendingVociEdits, setPendingVociEdits] = useState<Record<string, Partial<SalVoce>>>({});

  const { isLoading: isInitializing } = useQuery<SalPeriodDetail>({
    queryKey: ["/api/sal/initialize", projectId, period],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/sal/initialize", { projectId, period });
      const data = await res.json();
      setLocalSal(data);
      return data;
    },
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const updateSalMutation = useMutation({
    mutationFn: async (data: Partial<SalPeriodDetail>) => {
      if (!localSal) return;
      const res = await apiRequest("PATCH", `/api/sal/${localSal.id}`, data);
      return res.json();
    },
    onSuccess: (updated) => {
      if (updated) setLocalSal((prev) => prev ? { ...prev, ...updated } : prev);
      queryClient.invalidateQueries({ queryKey: ["/api/sal", period] });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const updateVoceMutation = useMutation({
    mutationFn: async ({ voceId, data }: { voceId: string; data: Partial<SalVoce> }) => {
      if (!localSal) return;
      const res = await apiRequest("PATCH", `/api/sal/${localSal.id}/voci/${voceId}`, data);
      return res.json();
    },
    onSuccess: (updated) => {
      if (updated && localSal) {
        setLocalSal((prev) =>
          prev ? { ...prev, voci: prev.voci.map((v) => v.id === updated.id ? updated : v) } : prev
        );
        queryClient.invalidateQueries({ queryKey: ["/api/sal", period] });
      }
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const addVoceMutation = useMutation({
    mutationFn: async () => {
      if (!localSal) return;
      const res = await apiRequest("POST", `/api/sal/${localSal.id}/voci`, {
        description: "Nuova voce",
        quantity: "1",
        um: "cad",
        unitPrice: "0",
        discountPercent: "0",
        total: "0",
        vatRate: "22",
        phase: "NOLEGGIO",
        sortOrder: (localSal.voci?.length || 0),
      });
      return res.json();
    },
    onSuccess: (voce) => {
      if (voce && localSal) {
        setLocalSal((prev) => prev ? { ...prev, voci: [...prev.voci, voce] } : prev);
        queryClient.invalidateQueries({ queryKey: ["/api/sal", period] });
      }
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteVoceMutation = useMutation({
    mutationFn: async (voceId: string) => {
      if (!localSal) return;
      await apiRequest("DELETE", `/api/sal/${localSal.id}/voci/${voceId}`);
      return voceId;
    },
    onSuccess: (voceId) => {
      if (voceId && localSal) {
        setLocalSal((prev) => prev ? { ...prev, voci: prev.voci.filter((v) => v.id !== voceId) } : prev);
        queryClient.invalidateQueries({ queryKey: ["/api/sal", period] });
      }
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  function handleVoceFieldBlur(voce: SalVoce, field: keyof SalVoce) {
    const edits = pendingVociEdits[voce.id];
    if (!edits) return;

    const updatedVoce = { ...voce, ...edits };
    const total = computeTotal(updatedVoce.quantity, updatedVoce.unitPrice, updatedVoce.discountPercent);
    const payload = { ...edits, total: String(total.toFixed(2)) };

    updateVoceMutation.mutate({ voceId: voce.id, data: payload });
    setPendingVociEdits((prev) => {
      const next = { ...prev };
      delete next[voce.id];
      return next;
    });
  }

  function setVoceEdit(voceId: string, field: keyof SalVoce, value: string) {
    setLocalSal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        voci: prev.voci.map((v) => v.id === voceId ? { ...v, [field]: value } : v),
      };
    });
    setPendingVociEdits((prev) => ({
      ...prev,
      [voceId]: { ...prev[voceId], [field]: value },
    }));
  }

  const groupedVoci = useMemo(() => {
    if (!localSal?.voci) return [];
    const groups: Record<string, SalVoce[]> = {};
    localSal.voci.forEach((v) => {
      if (!groups[v.phase]) groups[v.phase] = [];
      groups[v.phase].push(v);
    });
    return PHASE_ORDER
      .filter((p) => groups[p]?.length > 0)
      .map((p) => ({ phase: p, label: PHASE_LABELS[p] || p, voci: groups[p] }));
  }, [localSal?.voci]);

  const salTotal = useMemo(() => {
    if (!localSal?.voci) return 0;
    return localSal.voci.reduce((sum, v) => sum + parseFloat(v.total || "0"), 0);
  }, [localSal?.voci]);

  const canVerify = localSal?.status === "BOZZA";
  const canSend = localSal?.status === "VERIFICATO";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            SAL — {formatPeriod(period)}
          </DialogTitle>
        </DialogHeader>

        {isInitializing || !localSal ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="p-3 bg-muted/50 rounded-lg border space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm" data-testid="sal-modal-client">{clientName}</p>
                <Badge
                  className={`text-xs ${salStatusConfig[localSal.status].className}`}
                  variant="outline"
                  data-testid="sal-modal-status"
                >
                  {salStatusConfig[localSal.status].label}
                </Badge>
              </div>
              {siteAddress && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{siteAddress}</span>
                </div>
              )}
              {quoteNumber && (
                <p className="text-xs text-muted-foreground">
                  Preventivo: <span className="font-medium text-foreground">{quoteNumber}</span>
                </p>
              )}
            </div>

            {/* Voci grouped by phase */}
            <div className="space-y-4">
              {groupedVoci.map(({ phase, label, voci }) => (
                <div key={phase}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 border-b pb-0.5">
                    {label}
                  </h3>
                  <div className="space-y-1">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_70px_60px_90px_60px_80px_32px] gap-1 text-[10px] text-muted-foreground px-1">
                      <span>Descrizione</span>
                      <span>Qtà</span>
                      <span>U.M.</span>
                      <span>Prezzo unit.</span>
                      <span>Sconto %</span>
                      <span className="text-right">Totale</span>
                      <span />
                    </div>
                    {voci.map((voce) => (
                      <div
                        key={voce.id}
                        className="grid grid-cols-[1fr_70px_60px_90px_60px_80px_32px] gap-1 items-center"
                        data-testid={`sal-voce-row-${voce.id}`}
                      >
                        <InlineEditCell
                          value={voce.description}
                          onChange={(v) => setVoceEdit(voce.id, "description", v)}
                          onBlur={() => handleVoceFieldBlur(voce, "description")}
                        />
                        <InlineEditCell
                          value={voce.quantity}
                          type="number"
                          onChange={(v) => setVoceEdit(voce.id, "quantity", v)}
                          onBlur={() => handleVoceFieldBlur(voce, "quantity")}
                        />
                        <InlineEditCell
                          value={voce.um}
                          onChange={(v) => setVoceEdit(voce.id, "um", v)}
                          onBlur={() => handleVoceFieldBlur(voce, "um")}
                        />
                        <InlineEditCell
                          value={voce.unitPrice}
                          type="number"
                          onChange={(v) => setVoceEdit(voce.id, "unitPrice", v)}
                          onBlur={() => handleVoceFieldBlur(voce, "unitPrice")}
                        />
                        <InlineEditCell
                          value={voce.discountPercent}
                          type="number"
                          onChange={(v) => setVoceEdit(voce.id, "discountPercent", v)}
                          onBlur={() => handleVoceFieldBlur(voce, "discountPercent")}
                        />
                        <p className="text-xs text-right font-medium tabular-nums" data-testid={`sal-voce-total-${voce.id}`}>
                          {formatCurrency(voce.total)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteVoceMutation.mutate(voce.id)}
                          disabled={deleteVoceMutation.isPending}
                          data-testid={`button-delete-voce-${voce.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {groupedVoci.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nessuna voce — aggiungi una voce per iniziare</p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => addVoceMutation.mutate()}
              disabled={addVoceMutation.isPending}
              data-testid="button-add-sal-voce"
            >
              <Plus className="w-3.5 h-3.5" />
              Aggiungi voce
            </Button>

            {/* Total */}
            <div className="flex justify-end pt-1">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Totale SAL</p>
                <p className="text-lg font-bold" data-testid="sal-modal-total">{formatCurrency(salTotal)}</p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Note</label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Note per l'amministrazione..."
                defaultValue={localSal.notes || ""}
                onBlur={(e) => updateSalMutation.mutate({ notes: e.target.value })}
                data-testid="input-sal-notes"
              />
            </div>

            {/* Final invoice checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="fattura-finale"
                checked={localSal.isFinalInvoice}
                onCheckedChange={(v) => {
                  updateSalMutation.mutate({ isFinalInvoice: !!v });
                  setLocalSal((prev) => prev ? { ...prev, isFinalInvoice: !!v } : prev);
                }}
                data-testid="checkbox-fattura-finale"
              />
              <label htmlFor="fattura-finale" className="text-sm cursor-pointer">
                Fattura finale — chiudi cantiere
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2 border-t">
              {canVerify && (
                <Button
                  onClick={() => {
                    updateSalMutation.mutate({ status: "VERIFICATO" });
                    setLocalSal((prev) => prev ? { ...prev, status: "VERIFICATO" } : prev);
                  }}
                  disabled={updateSalMutation.isPending}
                  className="gap-1.5"
                  data-testid="button-verifica-sal"
                >
                  <FileCheck className="w-4 h-4" />
                  Segna come Verificato
                </Button>
              )}
              {canSend && (
                <Button
                  variant="outline"
                  onClick={() => {
                    updateSalMutation.mutate({ status: "INVIATO" });
                    setLocalSal((prev) => prev ? { ...prev, status: "INVIATO" } : prev);
                    toast({ title: "SAL inviato all'amministrazione" });
                  }}
                  disabled={updateSalMutation.isPending}
                  className="gap-1.5"
                  data-testid="button-invia-sal"
                >
                  <Send className="w-4 h-4" />
                  Invia all'Amministrazione
                </Button>
              )}
              {localSal.status === "INVIATO" && (
                <p className="text-xs text-muted-foreground">
                  SAL inviato{localSal.sentAt ? ` il ${new Date(localSal.sentAt).toLocaleDateString("it-IT")}` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function SalPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [statusFilter, setStatusFilter] = useState<"TUTTI" | SalStatus>("TUTTI");
  const [selectedProject, setSelectedProject] = useState<SalListItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: salList = [], isLoading } = useQuery<SalListItem[]>({
    queryKey: ["/api/sal", period],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sal?period=${period}`);
      return res.json();
    },
  });

  const filteredList = useMemo(() => {
    if (statusFilter === "TUTTI") return salList;
    if (statusFilter === "BOZZA") return salList.filter((s) => s.salStatus === "BOZZA" || !s.salStatus);
    return salList.filter((s) => s.salStatus === statusFilter);
  }, [salList, statusFilter]);

  const summaryStats = useMemo(() => {
    const total = salList.length;
    const bozze = salList.filter((s) => s.salStatus === "BOZZA" || !s.salStatus).length;
    const verificati = salList.filter((s) => s.salStatus === "VERIFICATO").length;
    const inviati = salList.filter((s) => s.salStatus === "INVIATO").length;
    return { total, bozze, verificati, inviati };
  }, [salList]);

  const missingNoleggio = useMemo(() => {
    return salList.filter(
      (s) => NOLEGGIO_STATUSES.includes(s.cantiereStatus) && !s.salId
    );
  }, [salList]);

  function openModal(item: SalListItem) {
    setSelectedProject(item);
    setModalOpen(true);
  }

  return (
    <DashboardLayout user={user ?? undefined}>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="sal-page-title">SAL — Stato Avanzamento Lavori</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Riepilogo mensile cantieri da fatturare</p>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPeriod((p) => addMonths(p, -1))}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center capitalize" data-testid="sal-period-label">
              {formatPeriod(period)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPeriod((p) => addMonths(p, 1))}
              data-testid="button-next-month"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Totale cantieri", value: summaryStats.total, testId: "sal-stat-total" },
            { label: "Bozze", value: summaryStats.bozze, testId: "sal-stat-bozze" },
            { label: "Verificati", value: summaryStats.verificati, testId: "sal-stat-verificati" },
            { label: "Inviati", value: summaryStats.inviati, testId: "sal-stat-inviati" },
          ].map((stat) => (
            <Card key={stat.label} className="p-4 text-center">
              <p className="text-2xl font-bold" data-testid={stat.testId}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Alert banner for missing SAL on active cantieri */}
        {missingNoleggio.length > 0 && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 text-amber-800 dark:text-amber-300"
            data-testid="sal-alert-missing"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Cantieri IN CORSO senza SAL</p>
              <p className="text-xs mt-0.5">
                {missingNoleggio.map((p) => p.clientName || "Cantiere").join(", ")} — apri il cantiere per creare il SAL.
              </p>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          {(["TUTTI", "BOZZA", "VERIFICATO", "INVIATO"] as const).map((f) => (
            <Button
              key={f}
              variant={statusFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f)}
              className="text-xs"
              data-testid={`button-filter-${f.toLowerCase()}`}
            >
              {f === "TUTTI" ? "Tutti" : salStatusConfig[f as SalStatus]?.label || f}
            </Button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessun cantiere trovato per {formatPeriod(period)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredList.map((item) => (
              <Card
                key={item.projectId}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openModal(item)}
                data-testid={`sal-list-item-${item.projectId}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate" data-testid={`sal-client-${item.projectId}`}>
                        {item.clientName || "Cliente sconosciuto"}
                      </p>
                      {item.cantiereStatus && cantiereStatusConfig[item.cantiereStatus] && (
                        <span
                          className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-sm ${cantiereStatusConfig[item.cantiereStatus].className}`}
                          data-testid={`sal-cantiere-status-${item.projectId}`}
                        >
                          {cantiereStatusConfig[item.cantiereStatus].label}
                        </span>
                      )}
                    </div>
                    {item.siteAddress && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.siteAddress}</span>
                      </div>
                    )}
                    {item.quoteNumber && (
                      <p className="text-xs text-muted-foreground">
                        Preventivo: <span className="font-medium text-foreground">{item.quoteNumber}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {item.salStatus ? (
                      <Badge
                        variant="outline"
                        className={`text-xs ${salStatusConfig[item.salStatus].className}`}
                        data-testid={`sal-status-badge-${item.projectId}`}
                      >
                        {salStatusConfig[item.salStatus].label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-gray-500" data-testid={`sal-status-badge-${item.projectId}`}>
                        Nessun SAL
                      </Badge>
                    )}
                    {item.salTotal !== null && (
                      <span className="text-xs font-semibold text-foreground" data-testid={`sal-total-${item.projectId}`}>
                        {formatCurrency(item.salTotal)}
                      </span>
                    )}
                  </div>
                </div>
                {item.proxitOps.length > 0 && (
                  <div className="mt-2 border-t pt-2 space-y-0.5" data-testid={`sal-proxit-ops-${item.projectId}`}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Proxit ({item.proxitOps.length})
                    </p>
                    {item.proxitOps.slice(0, 5).map((op, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`sal-proxit-op-${item.projectId}-${idx}`}>
                        <span className="font-medium text-foreground w-16 shrink-0">
                          {new Date(op.date + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                        </span>
                        <span className="truncate">{ACTIVITY_TYPE_LABELS[op.activityType] || op.activityType}</span>
                        {op.teamCount > 0 && (
                          <span className="shrink-0">{op.teamCount} squad.</span>
                        )}
                      </div>
                    ))}
                    {item.proxitOps.length > 5 && (
                      <p className="text-[10px] text-muted-foreground">
                        +{item.proxitOps.length - 5} altre operazioni
                      </p>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedProject && (
        <SalDetailModal
          projectId={selectedProject.projectId}
          period={period}
          cantiereStatus={selectedProject.cantiereStatus}
          clientName={selectedProject.clientName}
          siteAddress={selectedProject.siteAddress}
          quoteNumber={selectedProject.quoteNumber}
          open={modalOpen}
          onOpenChange={(v) => {
            setModalOpen(v);
            if (!v) {
              queryClient.invalidateQueries({ queryKey: ["/api/sal", period] });
            }
          }}
        />
      )}
    </DashboardLayout>
  );
}
