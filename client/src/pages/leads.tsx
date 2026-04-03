import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Users, Mail, Phone, ChevronRight, Search, ArrowUp, ArrowDown, ArrowUpDown, GitMerge, Building2, User, AlertTriangle, Download } from "lucide-react";
import { CityAutocomplete } from "@/components/ui/city-autocomplete";
import { Switch } from "@/components/ui/switch";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Lead, LeadWithSummary, ContactType, EntityType, ContactSource, LeadSource } from "@shared/schema";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const contactFormSchema = z.object({
  entityType: z.enum(["COMPANY", "PRIVATE"]).default("COMPANY"),
  name: z.string().optional().or(z.literal("")),
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  vatNumber: z.string().optional().or(z.literal("")),
  fiscalCode: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  zipCode: z.string().optional().or(z.literal("")),
  province: z.string().optional().or(z.literal("")),
  pecEmail: z.string().optional().or(z.literal("")),
  sdiCode: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  source: z.string().min(1, "La provenienza è obbligatoria"),
  assignedToUserId: z.string().min(1, "L'assegnazione è obbligatoria"),
  refFirstName: z.string().optional().or(z.literal("")),
  refLastName: z.string().optional().or(z.literal("")),
  refRole: z.string().optional().or(z.literal("")),
  refEmail: z.string().email("Email non valida").optional().or(z.literal("")),
  refPhone: z.string().optional().or(z.literal("")),
  type: z.enum(["lead", "cliente", "non_in_target"]).default("lead"),
  brochureSent: z.boolean().default(false),
  notifyAssignee: z.boolean().default(false),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
        <Users className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        Nessun contatto trovato
      </h3>
      <p className="text-muted-foreground max-w-sm">
        Inizia aggiungendo il tuo primo contatto. Clicca sul pulsante "Aggiungi Contatto" per iniziare.
      </p>
    </div>
  );
}

const typeLabels: Record<ContactType, string> = {
  lead: "Lead",
  cliente: "Cliente",
  non_in_target: "Non in target",
};

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
  );
}

export default function LeadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDuplicateWarningOpen, setIsDuplicateWarningOpen] = useState(false);
  const [similarContacts, setSimilarContacts] = useState<Array<{ lead: Lead; reason: string }>>([]);
  const pendingFormDataRef = useRef<ContactFormValues | null>(null);
  const { setDirty: setFormDirty, handleOpenChange: handleConfirmClose, ConfirmCloseDialog } = useConfirmClose();
  const savedFilters = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("leads-filters");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      const toArray = (v: unknown): string[] => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string" && v !== "all") return [v];
        return [];
      };
      return {
        typeFilter: toArray(parsed.typeFilter),
        assignedFilter: toArray(parsed.assignedFilter),
        reliabilityFilter: toArray(parsed.reliabilityFilter),
        sourceFilter: toArray(parsed.sourceFilter),
        entityTypeFilter: toArray(parsed.entityTypeFilter),
        provinceFilter: toArray(parsed.provinceFilter),
        brochureFilter: toArray(parsed.brochureFilter),
        opportunityFilter: toArray(parsed.opportunityFilter),
        searchQuery: parsed.searchQuery || "",
      };
    } catch { return null; }
  }, []);

  const [typeFilter, setTypeFilter] = useState<string[]>(savedFilters?.typeFilter || []);
  const [assignedFilter, setAssignedFilter] = useState<string[]>(savedFilters?.assignedFilter || []);
  const [reliabilityFilter, setReliabilityFilter] = useState<string[]>(savedFilters?.reliabilityFilter || []);
  const [sourceFilter, setSourceFilter] = useState<string[]>(savedFilters?.sourceFilter || []);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string[]>(savedFilters?.entityTypeFilter || []);
  const [provinceFilter, setProvinceFilter] = useState<string[]>(savedFilters?.provinceFilter || []);
  const [brochureFilter, setBrochureFilter] = useState<string[]>(savedFilters?.brochureFilter || []);
  const [opportunityFilter, setOpportunityFilter] = useState<string[]>(savedFilters?.opportunityFilter || []);
  const [searchQuery, setSearchQuery] = useState(savedFilters?.searchQuery || "");

  useEffect(() => {
    const filters = { typeFilter, assignedFilter, reliabilityFilter, sourceFilter, entityTypeFilter, provinceFilter, brochureFilter, opportunityFilter, searchQuery };
    sessionStorage.setItem("leads-filters", JSON.stringify(filters));
  }, [typeFilter, assignedFilter, reliabilityFilter, sourceFilter, entityTypeFilter, provinceFilter, brochureFilter, opportunityFilter, searchQuery]);

  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "COMPANY_ADMIN";
  const [entityType, setEntityType] = useState<EntityType>("COMPANY");
  
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      entityType: "COMPANY",
      name: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      vatNumber: "",
      fiscalCode: "",
      address: "",
      city: "",
      zipCode: "",
      province: "",
      pecEmail: "",
      sdiCode: "",
      notes: "",
      source: "",
      assignedToUserId: "",
      refFirstName: "",
      refLastName: "",
      refRole: "",
      refEmail: "",
      refPhone: "",
      type: "lead",
      brochureSent: false,
      notifyAssignee: false,
    },
  });

  useEffect(() => {
    setFormDirty(form.formState.isDirty);
  }, [form.formState.isDirty, setFormDirty]);

  const { data: leads = [], isLoading } = useQuery<LeadWithSummary[]>({
    queryKey: ["/api/leads"],
  });

  const { data: assignableUsers = [] } = useQuery<{ id: string; firstName: string; lastName: string }[]>({
    queryKey: ["/api/users/assignable"],
  });

  const { data: leadSourcesList = [] } = useQuery<LeadSource[]>({
    queryKey: ["/api/lead-sources"],
  });

  const usersMap = new Map(assignableUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const uniqueProvinces = useMemo(() => {
    const provs = leads.map(l => l.province).filter((p): p is string => !!p && p.trim() !== "");
    return [...new Set(provs)].sort();
  }, [leads]);

  const hasActiveFilters = typeFilter.length > 0 || assignedFilter.length > 0 || reliabilityFilter.length > 0 || sourceFilter.length > 0 || entityTypeFilter.length > 0 || provinceFilter.length > 0 || brochureFilter.length > 0 || opportunityFilter.length > 0 || searchQuery.trim() !== "";

  const filteredLeads = leads.filter((lead) => {
    if (typeFilter.length > 0 && !typeFilter.includes(lead.type)) return false;
    if (assignedFilter.length > 0) {
      const isUnassigned = !lead.assignedToUserId;
      const matchesUser = lead.assignedToUserId && assignedFilter.includes(lead.assignedToUserId);
      const matchesUnassigned = assignedFilter.includes("unassigned") && isUnassigned;
      if (!matchesUser && !matchesUnassigned) return false;
    }
    if (reliabilityFilter.length > 0 && !reliabilityFilter.includes((lead as any).reliability || "AFFIDABILE")) return false;
    if (sourceFilter.length > 0 && (!lead.source || !sourceFilter.includes(lead.source))) return false;
    if (entityTypeFilter.length > 0 && !entityTypeFilter.includes((lead as any).entityType)) return false;
    if (provinceFilter.length > 0 && (!lead.province || !provinceFilter.includes(lead.province))) return false;
    if (brochureFilter.length > 0) {
      const isSent = lead.brochureSent === true;
      const matchesSent = brochureFilter.includes("sent") && isSent;
      const matchesNotSent = brochureFilter.includes("not_sent") && !isSent;
      if (!matchesSent && !matchesNotSent) return false;
    }
    if (opportunityFilter.length > 0) {
      const summary = lead.opportunitySummary;
      const matchesAny = opportunityFilter.some((opt) => {
        if (opt === "none") return summary.total === 0;
        if (opt === "only_lost") return summary.total > 0 && summary.lostCount === summary.total;
        if (opt === "has_active") return summary.activeCount > 0;
        if (opt === "has_won") return summary.wonCount > 0;
        if (opt === "more_than_one") return summary.total >= 2;
        return false;
      });
      if (!matchesAny) return false;
    }
    
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    const searchFields = [
      lead.name,
      lead.firstName,
      lead.lastName,
      lead.email,
      lead.phone,
      lead.vatNumber,
      lead.fiscalCode,
    ].filter(Boolean);
    
    return searchFields.some(field => 
      field?.toLowerCase().includes(query)
    );
  });

  type SortField = 'name' | 'type' | 'province' | 'createdAt';
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'createdAt' ? 'desc' : 'asc');
    }
  };

  const sortedLeads = useMemo(() => {
    const sorted = [...filteredLeads].sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      switch (sortField) {
        case 'name':
          valA = ((a as any).entityType === 'COMPANY' ? (a as any).name : `${a.lastName || ''} ${a.firstName || ''}`.trim()) || '';
          valB = ((b as any).entityType === 'COMPANY' ? (b as any).name : `${b.lastName || ''} ${b.firstName || ''}`.trim()) || '';
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
          break;
        case 'type':
          valA = a.type || '';
          valB = b.type || '';
          break;
        case 'province':
          valA = (a.province || '').toLowerCase();
          valB = (b.province || '').toLowerCase();
          break;
        case 'createdAt':
          valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredLeads, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" /> 
      : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
  };

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      const response = await apiRequest("POST", "/api/leads", {
        entityType: data.entityType,
        name: data.entityType === "COMPANY" ? data.name || null : null,
        firstName: data.entityType === "PRIVATE" ? data.firstName || null : null,
        lastName: data.entityType === "PRIVATE" ? data.lastName || null : null,
        email: data.email || null,
        phone: data.phone || null,
        vatNumber: data.vatNumber || null,
        fiscalCode: data.fiscalCode || null,
        address: data.address || null,
        city: data.city || null,
        zipCode: data.zipCode || null,
        province: data.province || null,
        pecEmail: data.pecEmail || null,
        sdiCode: data.sdiCode || null,
        notes: data.notes || null,
        type: data.type || "lead",
        source: data.source || null,
        assignedToUserId: data.assignedToUserId || null,
        brochureSent: data.brochureSent ?? false,
        notifyAssignee: data.notifyAssignee ?? false,
      });
      const lead = await response.json();

      const hasReferentData = data.refFirstName || data.refLastName || data.refRole || data.refEmail || data.refPhone;
      if (data.entityType === "COMPANY" && hasReferentData) {
        await apiRequest("POST", `/api/leads/${lead.id}/referents`, {
          firstName: data.refFirstName,
          lastName: data.refLastName,
          role: data.refRole || null,
          email: data.refEmail || null,
          phone: data.refPhone || null,
        });
      }

      return lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setFormDirty(false);
      setIsDialogOpen(false);
      form.reset();
      setEntityType("COMPANY");
      toast({
        title: "Contatto creato",
        description: "Il contatto è stato aggiunto con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile creare il contatto. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (data: ContactFormValues) => {
    const name = data.entityType === "COMPANY"
      ? data.name || ""
      : `${data.firstName || ""} ${data.lastName || ""}`.trim();
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (data.email) params.set("email", data.email);
    if (data.phone) params.set("phone", data.phone);
    if (data.vatNumber) params.set("vatNumber", data.vatNumber);

    const hasInput = name || data.email || data.phone || data.vatNumber;
    if (hasInput) {
      try {
        const response = await fetch(`/api/leads/check-similar?${params.toString()}`, {
          credentials: "include",
        });
        if (response.ok) {
          const similar = await response.json();
          if (similar && similar.length > 0) {
            setSimilarContacts(similar);
            pendingFormDataRef.current = data;
            setIsDuplicateWarningOpen(true);
            return;
          }
        }
      } catch {
      }
    }

    createContactMutation.mutate(data);
  };

  const handleCreateAnyway = () => {
    setIsDuplicateWarningOpen(false);
    if (pendingFormDataRef.current) {
      createContactMutation.mutate(pendingFormDataRef.current);
      pendingFormDataRef.current = null;
    }
  };

  const handleRowClick = (lead: Lead) => {
    navigate(`/leads/${lead.id}`);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportCsv = async () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    for (const v of typeFilter) params.append("type", v);
    for (const v of entityTypeFilter) params.append("entityType", v);
    for (const v of assignedFilter) params.append("assignedToUserId", v);
    for (const v of reliabilityFilter) params.append("reliability", v);
    for (const v of provinceFilter) params.append("province", v);
    for (const v of sourceFilter) params.append("source", v);
    for (const v of brochureFilter) params.append("brochureSent", v);
    for (const v of opportunityFilter) params.append("opportunityFilter", v);

    const url = `/api/leads/export-csv${params.toString() ? `?${params.toString()}` : ""}`;

    setIsExporting(true);
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `contatti_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const httpCode = err instanceof Error && err.message.startsWith("HTTP ") ? err.message : null;
      toast({
        title: "Errore",
        description: httpCode ? `${httpCode} - Impossibile esportare i contatti. Riprova.` : "Impossibile esportare i contatti. Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      handleConfirmClose(false, () => {
        setIsDialogOpen(false);
        form.reset();
        setEntityType("COMPANY");
        setFormDirty(false);
      });
      return;
    }
    setIsDialogOpen(open);
  };

  return (
    <DashboardLayout user={user!} fullWidth>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Contatti</h1>
            <p className="text-muted-foreground mt-1">
              Gestisci l'anagrafica dei tuoi clienti e contatti
              {!isLoading && (
                <span className="ml-2 text-sm font-medium text-foreground/70" data-testid="text-leads-count">
                  ({filteredLeads.length}{hasActiveFilters ? ` di ${leads.length}` : ""})
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca contatti..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px]"
                data-testid="input-search-contacts"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={isExporting}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Esportazione..." : "Esporta CSV"}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/leads/duplicates")}
              data-testid="button-go-to-duplicates"
            >
              <GitMerge className="w-4 h-4 mr-2" />
              Duplicati
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-contact">
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi Contatto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)}>
                    <DialogHeader>
                      <DialogTitle>Nuovo Contatto</DialogTitle>
                      <DialogDescription>
                        Inserisci i dati del nuovo contatto. La provenienza e l'assegnazione sono obbligatorie.
                      </DialogDescription>
                    </DialogHeader>

                    <FormField
                      control={form.control}
                      name="entityType"
                      render={({ field }) => (
                        <FormItem className="mt-4">
                          <FormLabel>Tipo Contatto</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={(value) => {
                                field.onChange(value);
                                setEntityType(value as EntityType);
                                if (value === "PRIVATE") {
                                  const currentName = form.getValues("name") || "";
                                  const currentFirst = form.getValues("firstName") || "";
                                  const currentLast = form.getValues("lastName") || "";
                                  if (!currentFirst && !currentLast && currentName) {
                                    const parts = currentName.trim().split(/\s+/);
                                    form.setValue("firstName", parts[0] || "");
                                    form.setValue("lastName", parts.slice(1).join(" ") || "");
                                  }
                                } else if (value === "COMPANY") {
                                  const currentName = form.getValues("name") || "";
                                  const currentFirst = form.getValues("firstName") || "";
                                  const currentLast = form.getValues("lastName") || "";
                                  if (!currentName && (currentFirst || currentLast)) {
                                    form.setValue("name", `${currentFirst} ${currentLast}`.trim());
                                  }
                                }
                              }}
                              defaultValue={field.value}
                              className="flex gap-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="COMPANY" id="company" />
                                <Label htmlFor="company" className="flex items-center gap-2 cursor-pointer">
                                  <Building2 className="w-4 h-4" />
                                  Azienda
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="PRIVATE" id="private" />
                                <Label htmlFor="private" className="flex items-center gap-2 cursor-pointer">
                                  <User className="w-4 h-4" />
                                  Privato
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">
                          {entityType === "COMPANY" ? "Dati Azienda" : "Dati Privato"}
                        </h3>

                        {entityType === "COMPANY" ? (
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Ragione Sociale</FormLabel>
                                <FormControl>
                                  <Input placeholder="Impresa Costruzioni Srl" {...field} data-testid="input-company-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Nome</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Mario" {...field} data-testid="input-first-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="lastName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cognome</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Rossi" {...field} data-testid="input-last-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name="vatNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>P.IVA</FormLabel>
                                <FormControl>
                                  <Input placeholder="IT01234567890" {...field} data-testid="input-vat-number" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="fiscalCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Codice Fiscale</FormLabel>
                                <FormControl>
                                  <Input placeholder="RSSMRA80A01H501U" {...field} data-testid="input-fiscal-code" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="address"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Indirizzo</FormLabel>
                              <FormControl>
                                <Input placeholder="Via Roma, 1" {...field} data-testid="input-address" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-3 gap-3">
                          <FormField
                            control={form.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Città</FormLabel>
                                <FormControl>
                                  <CityAutocomplete
                                    value={field.value || ""}
                                    onChange={field.onChange}
                                    onCitySelect={(city) => {
                                      form.setValue("zipCode", city.cap);
                                      form.setValue("province", city.province);
                                    }}
                                    placeholder="Roma"
                                    data-testid="input-city"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="zipCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>CAP</FormLabel>
                                <FormControl>
                                  <Input placeholder="00100" {...field} data-testid="input-zip-code" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="province"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Provincia</FormLabel>
                                <FormControl>
                                  <Input placeholder="RM" {...field} data-testid="input-province" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="info@azienda.it" {...field} data-testid="input-email" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Telefono</FormLabel>
                                <FormControl>
                                  <PhoneInput
                                    value={field.value}
                                    onChange={field.onChange}
                                    data-testid="input-phone"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name="pecEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>PEC</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="azienda@pec.it" {...field} data-testid="input-pec-email" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="sdiCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Codice SDI</FormLabel>
                                <FormControl>
                                  <Input placeholder="ABCDEFG" {...field} data-testid="input-sdi-code" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {entityType === "COMPANY" && (
                          <>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">
                              Referente
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                              <FormField
                                control={form.control}
                                name="refFirstName"
                                render={({ field }) => (
                                  <FormItem>
                                    <Label className="text-sm font-medium">Nome</Label>
                                    <FormControl>
                                      <Input placeholder="Mario" {...field} data-testid="input-ref-first-name" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="refLastName"
                                render={({ field }) => (
                                  <FormItem>
                                    <Label className="text-sm font-medium">Cognome</Label>
                                    <FormControl>
                                      <Input placeholder="Rossi" {...field} data-testid="input-ref-last-name" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <FormField
                              control={form.control}
                              name="refRole"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ruolo</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Responsabile Acquisti" {...field} data-testid="input-ref-role" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <FormField
                                control={form.control}
                                name="refEmail"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                      <Input type="email" placeholder="mario@azienda.it" {...field} data-testid="input-ref-email" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="refPhone"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Telefono</FormLabel>
                                    <FormControl>
                                      <PhoneInput
                                        value={field.value}
                                        onChange={field.onChange}
                                        data-testid="input-ref-phone"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </>
                        )}

                        <h3 className={`text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2 ${entityType === "COMPANY" ? "mt-4" : ""}`}>
                          Assegnazione
                        </h3>
                        <FormField
                          control={form.control}
                          name="assignedToUserId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Assegnato a</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-assigned-to">
                                    <SelectValue placeholder="Seleziona commerciale" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {assignableUsers.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                      {u.firstName} {u.lastName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {form.watch("assignedToUserId") && (
                          <FormField
                            control={form.control}
                            name="notifyAssignee"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center gap-3">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-notify-assignee"
                                  />
                                </FormControl>
                                <FormLabel className="!mt-0 cursor-pointer font-normal">
                                  Notifica al commerciale (da chiamare)
                                </FormLabel>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                        <FormField
                          control={form.control}
                          name="type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Classificazione</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || "lead"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-contact-type">
                                    <SelectValue placeholder="Seleziona classificazione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="lead">Lead</SelectItem>
                                  <SelectItem value="cliente">Cliente</SelectItem>
                                  <SelectItem value="non_in_target">Non in target</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="source"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Provenienza *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-source">
                                    <SelectValue placeholder="Seleziona provenienza" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {leadSourcesList.map((source) => (
                                    <SelectItem key={source.id} value={source.name}>
                                      {source.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="brochureSent"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-3">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="toggle-brochure-sent"
                                />
                              </FormControl>
                              <FormLabel className="!mt-0 cursor-pointer">Brochure inviata</FormLabel>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Note</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Aggiungi note sul contatto..."
                                  rows={3}
                                  {...field}
                                  data-testid="input-notes"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                  <DialogFooter className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Annulla
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createContactMutation.isPending}
                      data-testid="button-save-contact"
                    >
                      {createContactMutation.isPending ? "Salvataggio..." : "Salva"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isDuplicateWarningOpen} onOpenChange={(open) => {
            if (!open) pendingFormDataRef.current = null;
            setIsDuplicateWarningOpen(open);
          }}>
            <DialogContent className="sm:max-w-lg" data-testid="dialog-duplicate-warning">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Contatti simili trovati
                </DialogTitle>
                <DialogDescription>
                  Esistono già {similarContacts.length === 1 ? "un contatto simile" : `${similarContacts.length} contatti simili`} nel sistema. Vuoi procedere comunque con la creazione?
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 my-2">
                {similarContacts.map(({ lead, reason }) => {
                  const displayName = lead.entityType === "COMPANY"
                    ? lead.name
                    : `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.name;
                  const reasonLabel =
                    reason === "same_vat" ? "Stessa P.IVA" :
                    reason === "same_email" ? "Stessa email" :
                    reason === "same_phone" ? "Stesso telefono" :
                    reason === "same_name" ? "Stesso nome" : reason;
                  return (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between p-3 rounded-md border bg-muted/40 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => {
                        setIsDuplicateWarningOpen(false);
                        navigate(`/leads/${lead.id}`);
                      }}
                      data-testid={`duplicate-contact-${lead.id}`}
                    >
                      <div>
                        <p className="font-medium text-sm">{displayName}</p>
                        <p className="text-xs text-muted-foreground">{reasonLabel}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDuplicateWarningOpen(false);
                    pendingFormDataRef.current = null;
                  }}
                  data-testid="button-duplicate-cancel"
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleCreateAnyway}
                  disabled={createContactMutation.isPending}
                  data-testid="button-create-anyway"
                >
                  {createContactMutation.isPending ? "Creazione..." : "Crea comunque"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectFilter
            label="Tipo"
            options={[
              { value: "lead", label: "Lead" },
              { value: "cliente", label: "Cliente" },
              { value: "non_in_target", label: "Non in target" },
            ]}
            selected={typeFilter}
            onChange={setTypeFilter}
            data-testid="select-type-filter"
          />

          <MultiSelectFilter
            label="Entità"
            options={[
              { value: "COMPANY", label: "Azienda" },
              { value: "PRIVATE", label: "Privato" },
            ]}
            selected={entityTypeFilter}
            onChange={setEntityTypeFilter}
            data-testid="select-entity-type-filter"
          />

          {isAdmin && (
            <MultiSelectFilter
              label="Assegnato"
              options={[
                { value: "unassigned", label: "Non assegnato" },
                ...assignableUsers.map((u) => ({
                  value: u.id,
                  label: `${u.firstName} ${u.lastName}`,
                })),
              ]}
              selected={assignedFilter}
              onChange={setAssignedFilter}
              data-testid="select-assigned-filter"
            />
          )}

          <MultiSelectFilter
            label="Affidabilità"
            options={[
              { value: "AFFIDABILE", label: "Affidabile" },
              { value: "POCO_AFFIDABILE", label: "Poco Affidabile" },
              { value: "NON_AFFIDABILE", label: "Non Affidabile" },
            ]}
            selected={reliabilityFilter}
            onChange={setReliabilityFilter}
            data-testid="select-reliability-filter"
          />

          <MultiSelectFilter
            label="Prov."
            options={uniqueProvinces.map((p) => ({ value: p, label: p }))}
            selected={provinceFilter}
            onChange={setProvinceFilter}
            data-testid="select-province-filter"
          />

          <MultiSelectFilter
            label="Provenienza"
            options={leadSourcesList.map((s) => ({ value: s.name, label: s.name }))}
            selected={sourceFilter}
            onChange={setSourceFilter}
            data-testid="select-source-filter"
          />

          <MultiSelectFilter
            label="Brochure"
            options={[
              { value: "sent", label: "Inviata" },
              { value: "not_sent", label: "Non inviata" },
            ]}
            selected={brochureFilter}
            onChange={setBrochureFilter}
            data-testid="select-brochure-filter"
          />

          <MultiSelectFilter
            label="Opportunità"
            options={[
              { value: "none", label: "Nessuna opportunità" },
              { value: "only_lost", label: "Solo perse" },
              { value: "has_active", label: "Almeno una attiva" },
              { value: "has_won", label: "Ha opportunità vinte" },
              { value: "more_than_one", label: "Più di una" },
            ]}
            selected={opportunityFilter}
            onChange={setOpportunityFilter}
            data-testid="select-opportunity-filter"
          />

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-sm text-muted-foreground"
              onClick={() => {
                setTypeFilter([]);
                setAssignedFilter([]);
                setReliabilityFilter([]);
                setSourceFilter([]);
                setEntityTypeFilter([]);
                setProvinceFilter([]);
                setBrochureFilter([]);
                setOpportunityFilter([]);
                setSearchQuery("");
                sessionStorage.removeItem("leads-filters");
              }}
              data-testid="button-clear-filters"
            >
              Cancella filtri
            </Button>
          )}
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : sortedLeads.length === 0 ? (
          <EmptyState />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')} data-testid="sort-name">
                      <span className="flex items-center">Nome <SortIcon field="name" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')} data-testid="sort-type">
                      <span className="flex items-center">Tipo <SortIcon field="type" /></span>
                    </TableHead>
                    <TableHead>Contatti</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('province')} data-testid="sort-province">
                      <span className="flex items-center">Prov. <SortIcon field="province" /></span>
                    </TableHead>
                    {isAdmin && <TableHead>Assegnato a</TableHead>}
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('createdAt')} data-testid="sort-created">
                      <span className="flex items-center">Data Creazione <SortIcon field="createdAt" /></span>
                    </TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLeads.map((lead) => {
                    const rel = (lead as any).reliability || "AFFIDABILE";
                    const relRowClass = rel === "NON_AFFIDABILE"
                      ? "bg-red-50 dark:bg-red-950/30"
                      : rel === "POCO_AFFIDABILE"
                        ? "bg-orange-50 dark:bg-orange-950/30"
                        : "";
                    return (
                    <TableRow 
                      key={lead.id} 
                      data-testid={`row-contact-${lead.id}`}
                      className={`cursor-pointer hover-elevate ${relRowClass}`}
                      onClick={() => handleRowClick(lead)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {(lead as Lead & { entityType?: EntityType }).entityType === "COMPANY" && (lead as Lead & { name?: string }).name 
                              ? (lead as Lead & { name?: string }).name 
                              : `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Senza nome"}
                            {(lead as Lead & { entityType?: EntityType }).entityType === "COMPANY" ? (
                              <Building2 className="w-3 h-3 text-muted-foreground" />
                            ) : (lead as Lead & { entityType?: EntityType }).entityType === "PRIVATE" ? (
                              <User className="w-3 h-3 text-muted-foreground" />
                            ) : null}
                            {rel === "NON_AFFIDABILE" && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            )}
                            {rel === "POCO_AFFIDABILE" && (
                              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                            )}
                          </div>
                          {(lead as Lead & { entityType?: EntityType }).entityType === "COMPANY" && (lead as Lead & { name?: string }).name && (lead as any).firstReferentName && (
                            <div className="text-sm text-muted-foreground">
                              Ref: {(lead as any).firstReferentName}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={lead.type === "cliente" ? "default" : lead.type === "non_in_target" ? "destructive" : "secondary"}>
                          {typeLabels[lead.type as ContactType] || "Lead"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {lead.email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              {lead.email}
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {lead.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`text-province-${lead.id}`}>
                        {lead.province || "—"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-sm text-muted-foreground" data-testid={`text-assigned-to-${lead.id}`}>
                          {lead.assignedToUserId ? usersMap.get(lead.assignedToUserId) || "—" : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.createdAt && format(new Date(lead.createdAt), "d MMM yyyy", { locale: it })}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
      {ConfirmCloseDialog}
    </DashboardLayout>
  );
}
