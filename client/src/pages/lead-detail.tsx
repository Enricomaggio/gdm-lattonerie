import { useState, useEffect, useRef } from "react";
import { APP_CONFIG } from "@/lib/config";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRoute, useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, Mail, Phone, Plus, Trash2, Building2, FileText, Clock, Save, 
  User, Edit, MoveRight, UserPlus, CreditCard, Users, MapPin, Receipt, Briefcase,
  BarChart3, Search, RefreshCw, Shield, Settings, BellRing, AlertTriangle, Copy, StickyNote, Info
} from "lucide-react";
import type { 
  Lead, Opportunity, PipelineStage, ActivityLog, ContactType, 
  EntityType, ContactSource, ContactReferent, CreditsafeReport, PaymentMethod, LeadSource, WorkType, LostReason, Worker 
} from "@shared/schema";
import { entityTypeEnum, workTypeEnum, lostReasonEnum } from "@shared/schema";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CityAutocomplete } from "@/components/ui/city-autocomplete";
import CreditSafeAnalysis from "@/components/creditsafe-analysis";
import { ReminderModal } from "@/components/reminder-modal";
import { formatCurrency } from "@/lib/formatCurrency";

const contactFormSchema = z.object({
  entityType: z.enum(entityTypeEnum).default("COMPANY"),
  name: z.string().optional().or(z.literal("")),
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  zipCode: z.string().optional().or(z.literal("")),
  province: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  vatNumber: z.string().optional().or(z.literal("")),
  fiscalCode: z.string().optional().or(z.literal("")),
  companyNature: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  sdiCode: z.string().optional().or(z.literal("")),
  ipaCode: z.string().optional().or(z.literal("")),
  pecEmail: z.string().email("PEC non valida").optional().or(z.literal("")),
  source: z.string().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
  notes: z.string().optional().or(z.literal("")),
  type: z.enum(["lead", "cliente", "non_in_target"]).default("lead"),
  paymentMethodId: z.string().optional().nullable(),
  reliability: z.enum(["AFFIDABILE", "POCO_AFFIDABILE", "NON_AFFIDABILE"]).default("AFFIDABILE"),
  brochureSent: z.boolean().default(false),
});

const referentFormSchema = z.object({
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  role: z.string().optional().or(z.literal("")),
});

const typeLabels: Record<ContactType, string> = {
  lead: "Lead",
  cliente: "Cliente",
  non_in_target: "Non in target",
};

const entityTypeLabels: Record<EntityType, string> = {
  COMPANY: "Azienda",
  PRIVATE: "Privato",
};

const opportunityFormSchema = z.object({
  title: z.string().min(1, "Il titolo è obbligatorio"),
  description: z.string().optional().or(z.literal("")),
  value: z.string().optional().or(z.literal("")),
  referentId: z.string().optional().or(z.literal("")),
  stageId: z.string().min(1, "La fase è obbligatoria"),
  workType: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  siteAddress: z.string().optional().or(z.literal("")),
  siteCity: z.string().optional().or(z.literal("")),
  siteZip: z.string().optional().or(z.literal("")),
  siteProvince: z.string().optional().or(z.literal("")),
  mapsLink: z.string().optional().or(z.literal("")),
  siteDistanceKm: z.string().optional().or(z.literal("")),
  siteSquadraInZonaKm: z.string().optional().or(z.literal("")),
  lostReason: z.string().optional().or(z.literal("")),
  veniceZone: z.string().optional().or(z.literal("")),
  estimatedStartDate: z.string().optional().or(z.literal("")),
  estimatedEndDate: z.string().optional().or(z.literal("")),
});

const VENICE_ZONES = [
  "Santa Croce",
  "Dorsoduro",
  "San Polo",
  "Cannaregio",
  "San Marco",
  "Castello",
  "Giudecca",
  "Murano",
  "Lido",
  "Burano",
  "Torcello",
  "Pellestrina",
] as const;

const lostReasonLabels: Record<LostReason, string> = {
  PRICE_HIGH: "Prezzo troppo alto",
  TIMING: "Tempi troppo lunghi",
  LOST_TO_COMPETITOR: "Perso per concorrenza/cliente",
  NOT_IN_TARGET: "Non in target",
  NO_RESPONSE: "Nessuna risposta da cliente",
  OTHER: "Altra soluzione",
};

type ContactFormValues = z.infer<typeof contactFormSchema>;
type ReferentFormValues = z.infer<typeof referentFormSchema>;
type OpportunityFormValues = z.infer<typeof opportunityFormSchema>;

interface AssignableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export default function LeadDetailPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/leads/:id");
  const leadId = params?.id;

  const [isOpportunityDialogOpen, setIsOpportunityDialogOpen] = useState(false);
  const [isReferentDialogOpen, setIsReferentDialogOpen] = useState(false);
  const { setDirty: setOpportunityDirty, handleOpenChange: handleOpportunityConfirmClose, ConfirmCloseDialog: OpportunityConfirmCloseDialog } = useConfirmClose();
  const { setDirty: setReferentDirty, handleOpenChange: handleReferentConfirmClose, ConfirmCloseDialog: ReferentConfirmCloseDialog } = useConfirmClose();
  const [editingReferent, setEditingReferent] = useState<ContactReferent | null>(null);
  const [isPaymentMethodsDialogOpen, setIsPaymentMethodsDialogOpen] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<PaymentMethod | null>(null);
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");
  const [isLeadSourcesDialogOpen, setIsLeadSourcesDialogOpen] = useState(false);
  const [editingLeadSource, setEditingLeadSource] = useState<LeadSource | null>(null);
  const [newLeadSourceName, setNewLeadSourceName] = useState("");
  const { setDirty: setPaymentDirty, handleOpenChange: handlePaymentConfirmClose, ConfirmCloseDialog: PaymentConfirmCloseDialog } = useConfirmClose();
  const { setDirty: setSourceDirty, handleOpenChange: handleSourceConfirmClose, ConfirmCloseDialog: SourceConfirmCloseDialog } = useConfirmClose();
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const contactForm = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    shouldUnregister: false,
    defaultValues: {
      entityType: "COMPANY",
      name: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      zipCode: "",
      province: "",
      country: "Italia",
      vatNumber: "",
      fiscalCode: "",
      companyNature: "PRIVATE" as const,
      sdiCode: "",
      ipaCode: "",
      pecEmail: "",
      source: null,
      assignedToUserId: null,
      notes: "",
      type: "lead",
      paymentMethodId: null,
      reliability: "AFFIDABILE" as const,
      brochureSent: false,
    },
  });

  const referentForm = useForm<ReferentFormValues>({
    resolver: zodResolver(referentFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      role: "",
    },
  });

  const opportunityForm = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunityFormSchema),
    defaultValues: {
      title: "",
      description: "",
      value: "",
      referentId: "",
      workType: "PRIVATE",
      siteAddress: "",
      siteCity: "",
      siteZip: "",
      siteProvince: "",
      mapsLink: "",
      siteDistanceKm: "",
      siteSquadraInZonaKm: "",
      lostReason: "",
      veniceZone: "",
      estimatedStartDate: "",
      estimatedEndDate: "",
      stageId: "",
    },
  });

  useEffect(() => {
    setOpportunityDirty(opportunityForm.formState.isDirty);
  }, [opportunityForm.formState.isDirty, setOpportunityDirty]);

  useEffect(() => {
    setReferentDirty(referentForm.formState.isDirty);
  }, [referentForm.formState.isDirty, setReferentDirty]);

  const paymentOriginalNameRef = useRef<string>("");
  const sourceOriginalNameRef = useRef<string>("");

  useEffect(() => {
    if (editingPaymentMethod) {
      paymentOriginalNameRef.current = editingPaymentMethod.name;
    }
  }, [editingPaymentMethod?.id]);

  useEffect(() => {
    if (editingLeadSource) {
      sourceOriginalNameRef.current = editingLeadSource.name;
    }
  }, [editingLeadSource?.id]);

  useEffect(() => {
    const hasNewInput = newPaymentMethodName.trim() !== "";
    const hasEditChange = editingPaymentMethod !== null && editingPaymentMethod.name !== paymentOriginalNameRef.current;
    setPaymentDirty(hasNewInput || hasEditChange);
  }, [newPaymentMethodName, editingPaymentMethod, setPaymentDirty]);

  useEffect(() => {
    const hasNewInput = newLeadSourceName.trim() !== "";
    const hasEditChange = editingLeadSource !== null && editingLeadSource.name !== sourceOriginalNameRef.current;
    setSourceDirty(hasNewInput || hasEditChange);
  }, [newLeadSourceName, editingLeadSource, setSourceDirty]);

  const watchOpportunitySiteCity = opportunityForm.watch("siteCity");


  const watchEntityType = contactForm.watch("entityType");
  const watchCompanyNature = contactForm.watch("companyNature");

  const { data: lead, isLoading: isLoadingLead } = useQuery<Lead>({
    queryKey: ["/api/leads", leadId],
    enabled: !!leadId,
  });

  const { data: opportunities = [], isLoading: isLoadingOpportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/leads", leadId, "opportunities"],
    enabled: !!leadId,
  });

  const { data: stages = [] } = useQuery<PipelineStage[]>({
    queryKey: ["/api/stages"],
  });

  const { data: activities = [], isLoading: isLoadingActivities } = useQuery<(ActivityLog & { userName: string | null })[]>({
    queryKey: ["/api/leads", leadId, "activities"],
    enabled: !!leadId,
  });

  const { data: referents = [], isLoading: isLoadingReferents } = useQuery<ContactReferent[]>({
    queryKey: ["/api/leads", leadId, "referents"],
    enabled: !!leadId && watchEntityType === "COMPANY",
  });

  const { data: assignableUsers = [] } = useQuery<AssignableUser[]>({
    queryKey: ["/api/users/assignable"],
  });

  const { data: paymentMethods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"],
  });

  const { data: leadSourcesList = [] } = useQuery<LeadSource[]>({
    queryKey: ["/api/lead-sources"],
  });

  const { data: relatedNotes = [] } = useQuery<Array<{ type: "opportunity" | "project"; entityId: string; title: string; notes: string }>>({
    queryKey: ["/api/leads", leadId, "related-notes"],
    enabled: !!leadId,
  });

  const { data: externalWorkers = [] } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
    select: (data) => data.filter((w) => w.isInternal === false && w.isActive),
  });

  const [showSquadreInfoDialog, setShowSquadreInfoDialog] = useState(false);

  const { data: creditsafeData, isLoading: isLoadingCreditsafe, refetch: refetchCreditsafe } = useQuery<{ report: CreditsafeReport | null }>({
    queryKey: ["/api/creditsafe/report", leadId],
    enabled: !!leadId && (watchEntityType === "COMPANY" || lead?.entityType === "COMPANY"),
  });
  const creditsafeReport = creditsafeData?.report;

  const creditsafeFetchMutation = useMutation({
    mutationFn: async ({ leadId, vatNumber }: { leadId: string; vatNumber: string }) => {
      const response = await apiRequest("POST", "/api/creditsafe/fetch", { leadId, vatNumber });
      return response.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creditsafe/report", leadId] });
      if (!isMounted.current) return;
      refetchCreditsafe();
      try {
        await queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
        const res = await queryClient.fetchQuery({ queryKey: ["/api/leads", leadId] });
        if (!isMounted.current) return;
        const updatedLead = res as any;
        if (updatedLead) {
          contactForm.reset({
            entityType: (updatedLead.entityType as EntityType) || "COMPANY",
            name: updatedLead.name || "",
            firstName: updatedLead.firstName || "",
            lastName: updatedLead.lastName || "",
            email: updatedLead.email || "",
            phone: updatedLead.phone || "",
            address: updatedLead.address || "",
            city: updatedLead.city || "",
            zipCode: updatedLead.zipCode || "",
            province: updatedLead.province || "",
            country: updatedLead.country || "Italia",
            vatNumber: updatedLead.vatNumber || "",
            fiscalCode: updatedLead.fiscalCode || "",
            companyNature: (updatedLead.companyNature as "PRIVATE" | "PUBLIC") || "PRIVATE",
            sdiCode: updatedLead.sdiCode || "",
            ipaCode: updatedLead.ipaCode || "",
            pecEmail: updatedLead.pecEmail || "",
            source: (updatedLead.source as ContactSource) || null,
            assignedToUserId: updatedLead.assignedToUserId || null,
            notes: updatedLead.notes || "",
            type: (updatedLead.type as ContactType) || "lead",
            paymentMethodId: updatedLead.paymentMethodId || null,
            reliability: (updatedLead.reliability as "AFFIDABILE" | "POCO_AFFIDABILE" | "NON_AFFIDABILE") || "AFFIDABILE",
            brochureSent: updatedLead.brochureSent ?? false,
          });
        }
      } catch {}
      if (!isMounted.current) return;
      toast({
        title: "Report CreditSafe aggiornato",
        description: "I dati finanziari e anagrafici sono stati recuperati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore CreditSafe",
        description: error.message || "Impossibile recuperare i dati. Riprova.",
        variant: "destructive",
      });
    },
  });

  const createPaymentMethodMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/payment-methods", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setNewPaymentMethodName("");
      toast({ title: "Modalità aggiunta", description: "La modalità di pagamento è stata creata." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updatePaymentMethodMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/payment-methods/${id}`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setEditingPaymentMethod(null);
      toast({ title: "Modalità aggiornata", description: "La modalità di pagamento è stata modificata." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deletePaymentMethodMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/payment-methods/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Modalità eliminata", description: "La modalità di pagamento è stata rimossa." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const createLeadSourceMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/lead-sources", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-sources"] });
      setNewLeadSourceName("");
      toast({ title: "Provenienza aggiunta", description: "La provenienza è stata creata." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateLeadSourceMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/lead-sources/${id}`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-sources"] });
      setEditingLeadSource(null);
      toast({ title: "Provenienza aggiornata", description: "La provenienza è stata modificata." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteLeadSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/lead-sources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-sources"] });
      toast({ title: "Provenienza eliminata", description: "La provenienza è stata rimossa." });
    },
    onError: (error: Error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (lead && !hasInitialized.current) {
      const assignedUserExists = !lead.assignedToUserId || assignableUsers.some(u => u.id === lead.assignedToUserId);
      const paymentMethodExists = !lead.paymentMethodId || paymentMethods.some(p => p.id === lead.paymentMethodId);
      if (!assignedUserExists || !paymentMethodExists) return;
      hasInitialized.current = true;
      let initialFirstName = lead.firstName || "";
      let initialLastName = lead.lastName || "";
      if (lead.entityType === "PRIVATE" && !initialFirstName && !initialLastName && lead.name) {
        const parts = lead.name.trim().split(/\s+/);
        initialFirstName = parts[0] || "";
        initialLastName = parts.slice(1).join(" ") || "";
      }
      const resetValues = {
        entityType: (lead.entityType as EntityType) || "COMPANY",
        name: lead.name || "",
        firstName: initialFirstName,
        lastName: initialLastName,
        email: lead.email || "",
        phone: lead.phone || "",
        address: lead.address || "",
        city: lead.city || "",
        zipCode: lead.zipCode || "",
        province: lead.province || "",
        country: lead.country || "Italia",
        vatNumber: lead.vatNumber || "",
        fiscalCode: lead.fiscalCode || "",
        companyNature: (lead.companyNature as "PRIVATE" | "PUBLIC") || "PRIVATE",
        sdiCode: lead.sdiCode || "",
        ipaCode: lead.ipaCode || "",
        pecEmail: lead.pecEmail || "",
        source: (lead.source as ContactSource) || null,
        assignedToUserId: lead.assignedToUserId || null,
        notes: lead.notes || "",
        type: (lead.type as ContactType) || "lead",
        paymentMethodId: lead.paymentMethodId || null,
        reliability: (lead.reliability as "AFFIDABILE" | "POCO_AFFIDABILE" | "NON_AFFIDABILE") || "AFFIDABILE",
        brochureSent: lead.brochureSent ?? false,
      };
      contactForm.reset(resetValues);
    }
  }, [lead, contactForm, assignableUsers, paymentMethods]);

  const updateContactMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      const response = await apiRequest("PATCH", `/api/leads/${leadId}`, {
        entityType: data.entityType,
        name: data.entityType === "COMPANY" ? data.name || null : null,
        firstName: data.entityType === "PRIVATE" ? data.firstName || null : null,
        lastName: data.entityType === "PRIVATE" ? data.lastName || null : null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        zipCode: data.zipCode || null,
        province: data.province || null,
        country: data.country || null,
        vatNumber: data.entityType === "COMPANY" ? data.vatNumber || null : null,
        fiscalCode: data.fiscalCode || null,
        companyNature: data.entityType === "COMPANY" ? data.companyNature || "PRIVATE" : null,
        sdiCode: data.entityType === "COMPANY" && data.companyNature === "PRIVATE" ? data.sdiCode || null : null,
        ipaCode: data.entityType === "COMPANY" && data.companyNature === "PUBLIC" ? data.ipaCode || null : null,
        pecEmail: data.entityType === "COMPANY" ? data.pecEmail || null : null,
        source: data.source || null,
        assignedToUserId: data.assignedToUserId || null,
        notes: data.notes || null,
        type: data.type,
        paymentMethodId: data.paymentMethodId || null,
        reliability: data.reliability || "AFFIDABILE",
        brochureSent: data.brochureSent ?? false,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (!isMounted.current) return;
      toast({
        title: "Contatto aggiornato",
        description: "I dati sono stati salvati con successo.",
      });
    },
    onError: () => {
      if (!isMounted.current) return;
      toast({
        title: "Errore",
        description: "Impossibile salvare le modifiche. Riprova.",
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/leads/${leadId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (!isMounted.current) return;
      toast({
        title: "Contatto eliminato",
        description: "Il contatto è stato eliminato con successo.",
      });
      navigate("/leads");
    },
    onError: () => {
      if (!isMounted.current) return;
      toast({
        title: "Errore",
        description: "Impossibile eliminare il contatto. Riprova.",
        variant: "destructive",
      });
    },
  });

  const createReferentMutation = useMutation({
    mutationFn: async (data: ReferentFormValues) => {
      const response = await apiRequest("POST", `/api/leads/${leadId}/referents`, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        role: data.role || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "referents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (!isMounted.current) return;
      setReferentDirty(false);
      setIsReferentDialogOpen(false);
      referentForm.reset();
      toast({
        title: "Referente aggiunto",
        description: "Il referente è stato aggiunto con successo.",
      });
    },
    onError: () => {
      if (!isMounted.current) return;
      toast({
        title: "Errore",
        description: "Impossibile aggiungere il referente. Riprova.",
        variant: "destructive",
      });
    },
  });

  const updateReferentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReferentFormValues }) => {
      const response = await apiRequest("PATCH", `/api/referents/${id}`, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        role: data.role || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "referents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (!isMounted.current) return;
      setReferentDirty(false);
      setIsReferentDialogOpen(false);
      setEditingReferent(null);
      referentForm.reset();
      toast({
        title: "Referente aggiornato",
        description: "Il referente è stato aggiornato con successo.",
      });
    },
    onError: () => {
      if (!isMounted.current) return;
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il referente. Riprova.",
        variant: "destructive",
      });
    },
  });

  const deleteReferentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/referents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "referents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (!isMounted.current) return;
      toast({
        title: "Referente eliminato",
        description: "Il referente è stato eliminato con successo.",
      });
    },
    onError: () => {
      if (!isMounted.current) return;
      toast({
        title: "Errore",
        description: "Impossibile eliminare il referente. Riprova.",
        variant: "destructive",
      });
    },
  });

  const createOpportunityMutation = useMutation({
    mutationFn: async (data: OpportunityFormValues) => {
      const response = await apiRequest("POST", "/api/opportunities", {
        title: data.title,
        description: data.description || null,
        value: data.value ? data.value : null,
        stageId: data.stageId,
        leadId: leadId,
        referentId: data.referentId || null,
        workType: data.workType || "PRIVATE",
        siteAddress: data.siteAddress || null,
        siteCity: data.siteCity || null,
        siteZip: data.siteZip || null,
        siteProvince: data.siteProvince || null,
        mapsLink: data.mapsLink || null,
        siteDistanceKm: data.siteDistanceKm ? parseInt(data.siteDistanceKm) : null,
        siteSquadraInZonaKm: data.siteSquadraInZonaKm ? parseInt(data.siteSquadraInZonaKm) : null,
        veniceZone: data.veniceZone || null,
        lostReason: data.lostReason || null,
        estimatedStartDate: data.estimatedStartDate || null,
        estimatedEndDate: data.estimatedEndDate || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      if (!isMounted.current) return;
      setOpportunityDirty(false);
      setIsOpportunityDialogOpen(false);
      opportunityForm.reset();
      toast({
        title: "Opportunità creata",
        description: "L'opportunità è stata aggiunta con successo.",
      });
    },
    onError: () => {
      if (!isMounted.current) return;
      toast({
        title: "Errore",
        description: "Impossibile creare l'opportunità. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleContactSubmit = (data: ContactFormValues) => {
    updateContactMutation.mutate(data);
  };

  const handleDeleteContact = () => {
    if (lead && confirm(`Sei sicuro di voler eliminare ${lead.firstName} ${lead.lastName}? Questa azione eliminerà anche tutte le opportunità associate.`)) {
      deleteContactMutation.mutate();
    }
  };

  const handleReferentSubmit = (data: ReferentFormValues) => {
    if (editingReferent) {
      updateReferentMutation.mutate({ id: editingReferent.id, data });
    } else {
      createReferentMutation.mutate(data);
    }
  };

  const handleDeleteReferent = (id: string, name: string) => {
    if (confirm(`Sei sicuro di voler eliminare il referente ${name}?`)) {
      deleteReferentMutation.mutate(id);
    }
  };

  const handleEditReferent = (referent: ContactReferent) => {
    setEditingReferent(referent);
    referentForm.reset({
      firstName: referent.firstName,
      lastName: referent.lastName,
      email: referent.email || "",
      phone: referent.phone || "",
      role: referent.role || "",
    });
    setIsReferentDialogOpen(true);
  };

  const handleReferentDialogOpen = (open: boolean) => {
    if (!open) {
      handleReferentConfirmClose(false, () => {
        setIsReferentDialogOpen(false);
        setEditingReferent(null);
        referentForm.reset();
        setReferentDirty(false);
      });
      return;
    }
    setIsReferentDialogOpen(open);
  };

  const handleOpportunitySubmit = (data: OpportunityFormValues) => {
    const submitData = { ...data, veniceZone: data.veniceZone === "NO" ? "" : data.veniceZone };
    createOpportunityMutation.mutate(submitData);
  };

  const watchStageId = opportunityForm.watch("stageId");

  const isLostStage = (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.name?.toLowerCase().includes("pers");
  };

  useEffect(() => {
    if (watchStageId && !isLostStage(watchStageId)) {
      opportunityForm.setValue("lostReason", "");
    }
  }, [watchStageId, stages]);

  const copyAddressFromContact = () => {
    if (lead) {
      opportunityForm.setValue("siteAddress", lead.address || "");
      opportunityForm.setValue("siteCity", lead.city || "");
      opportunityForm.setValue("siteZip", lead.zipCode || "");
      opportunityForm.setValue("siteProvince", lead.province || "");
    }
  };

  const handleOpportunityDialogOpen = (open: boolean) => {
    if (!open) {
      handleOpportunityConfirmClose(false, () => {
        setIsOpportunityDialogOpen(false);
        opportunityForm.reset();
        setOpportunityDirty(false);
      });
      return;
    }
    setIsOpportunityDialogOpen(open);
    if (stages.length > 0) {
      opportunityForm.setValue("stageId", stages[0].id);
    }
  };

  const getStageById = (stageId: string | null) => {
    if (!stageId) return null;
    return stages.find(s => s.id === stageId);
  };

  const getDisplayName = () => {
    if (!lead) return "";
    if (lead.entityType === "COMPANY" && lead.name) {
      return lead.name;
    }
    return `${lead.firstName} ${lead.lastName}`;
  };

  if (!leadId) {
    return (
      <DashboardLayout user={user!} fullWidth>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Contatto non trovato</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoadingLead) {
    return (
      <DashboardLayout user={user!} fullWidth>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!lead) {
    return (
      <DashboardLayout user={user!} fullWidth>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Contatto non trovato</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/leads")}>
            Torna alla lista
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const reliabilityValue = (lead?.reliability as string) || "AFFIDABILE";
  const reliabilityBgClass = reliabilityValue === "NON_AFFIDABILE"
    ? "bg-red-50 dark:bg-red-950/30"
    : reliabilityValue === "POCO_AFFIDABILE"
      ? "bg-orange-50 dark:bg-orange-950/30"
      : "";

  return (
    <DashboardLayout user={user!} fullWidth>
      <div className={`space-y-6 min-h-full rounded-md ${reliabilityBgClass} ${reliabilityBgClass ? "p-4 -m-4" : ""}`} data-testid="lead-detail-container">
        {reliabilityValue === "NON_AFFIDABILE" && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 text-sm font-medium" data-testid="reliability-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Cliente Non Affidabile
          </div>
        )}
        {reliabilityValue === "POCO_AFFIDABILE" && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 text-sm font-medium" data-testid="reliability-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Cliente Poco Affidabile
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/leads")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  {getDisplayName()}
                </h1>
                <Badge variant="outline" className="text-xs">
                  {entityTypeLabels[lead.entityType as EntityType] || "Azienda"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                {lead.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {lead.email}
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {lead.phone}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReminderModalOpen(true)}
              data-testid="button-open-reminders"
            >
              <BellRing className="w-4 h-4 mr-2" />
              Promemoria
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteContact}
              disabled={deleteContactMutation.isPending}
              data-testid="button-delete-contact"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Elimina
            </Button>
          </div>
        </div>

        <Tabs defaultValue="anagrafica">
          <TabsList>
            <TabsTrigger value="anagrafica" data-testid="tab-anagrafica">
              <Building2 className="w-4 h-4 mr-2" />
              Anagrafica
            </TabsTrigger>
            <TabsTrigger value="opportunita" data-testid="tab-opportunita">
              <FileText className="w-4 h-4 mr-2" />
              Opportunità ({opportunities.length})
            </TabsTrigger>
            {APP_CONFIG.moduleAmministrazione && (
              <TabsTrigger value="amministrazione" data-testid="tab-amministrazione">
                <CreditCard className="w-4 h-4 mr-2" />
                Amministrazione
              </TabsTrigger>
            )}
            {false && (watchEntityType === "COMPANY" || lead?.entityType === "COMPANY") && (
              <TabsTrigger value="finanziaria" data-testid="tab-finanziaria">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analisi Finanziaria
              </TabsTrigger>
            )}
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              <Clock className="w-4 h-4 mr-2" />
              Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="anagrafica" className="mt-6">
            <Form {...contactForm}>
              <form onSubmit={contactForm.handleSubmit(handleContactSubmit)} className="space-y-6">
                <Card>
                  <CardContent className="p-6 space-y-6">
                    {/* Section 1: Dati Azienda / Dati Personali */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          {watchEntityType === "COMPANY" ? (
                            <>
                              <Building2 className="w-4 h-4" />
                              Dati Azienda
                            </>
                          ) : (
                            <>
                              <User className="w-4 h-4" />
                              Dati Personali
                            </>
                          )}
                        </Label>
                        <FormField
                          control={contactForm.control}
                          name="entityType"
                          render={({ field }) => (
                            <FormItem className="mb-0">
                              <FormControl>
                                <RadioGroup
                                  onValueChange={(value) => {
                                    field.onChange(value);
                                    if (value === "PRIVATE") {
                                      const currentName = contactForm.getValues("name") || "";
                                      const currentFirst = contactForm.getValues("firstName") || "";
                                      const currentLast = contactForm.getValues("lastName") || "";
                                      if (!currentFirst && !currentLast && currentName) {
                                        const parts = currentName.trim().split(/\s+/);
                                        contactForm.setValue("firstName", parts[0] || "");
                                        contactForm.setValue("lastName", parts.slice(1).join(" ") || "");
                                      }
                                    } else if (value === "COMPANY") {
                                      const currentName = contactForm.getValues("name") || "";
                                      const currentFirst = contactForm.getValues("firstName") || "";
                                      const currentLast = contactForm.getValues("lastName") || "";
                                      if (!currentName && (currentFirst || currentLast)) {
                                        contactForm.setValue("name", `${currentFirst} ${currentLast}`.trim());
                                      }
                                    }
                                  }}
                                  value={field.value}
                                  className="flex gap-4"
                                  data-testid="radio-entity-type"
                                >
                                  <div className="flex items-center space-x-1.5">
                                    <RadioGroupItem value="COMPANY" id="company" data-testid="radio-company" />
                                    <Label htmlFor="company" className="text-sm cursor-pointer">Azienda</Label>
                                  </div>
                                  <div className="flex items-center space-x-1.5">
                                    <RadioGroupItem value="PRIVATE" id="private" data-testid="radio-private" />
                                    <Label htmlFor="private" className="text-sm cursor-pointer">Privato</Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className={`${watchEntityType !== "COMPANY" ? "hidden" : ""} space-y-4`}>
                          {/* Riga 1: Ragione Sociale + P.IVA + Salva */}
                          <div className="grid grid-cols-12 gap-3 items-end">
                            <div className="col-span-5">
                              <FormField
                                control={contactForm.control}
                                name="name"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Ragione Sociale *</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-company-name" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-3">
                              <FormField
                                control={contactForm.control}
                                name="vatNumber"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>P.IVA</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-vat-number" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-4">
                              <Button
                                type="submit"
                                disabled={updateContactMutation.isPending}
                                className="w-full"
                                data-testid="button-save-contact-top"
                              >
                                <Save className="w-4 h-4 mr-2" />
                                {updateContactMutation.isPending ? "Salvataggio..." : "Salva"}
                              </Button>
                            </div>
                          </div>

                          {/* Riga 2: Email + Telefono + CF */}
                          <div className="grid grid-cols-3 gap-3">
                            <FormField
                              control={contactForm.control}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email</FormLabel>
                                  <FormControl>
                                    <Input type="email" {...field} data-testid="input-email" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={contactForm.control}
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
                            <FormField
                              control={contactForm.control}
                              name="fiscalCode"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>CF</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-fiscal-code" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Riga 3: Via + Città + CAP + Prov */}
                          <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-5">
                              <FormField
                                control={contactForm.control}
                                name="address"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Via</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-address" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-3">
                              <FormField
                                control={contactForm.control}
                                name="city"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Città</FormLabel>
                                    <FormControl>
                                      <CityAutocomplete
                                        value={field.value || ""}
                                        onChange={field.onChange}
                                        onCitySelect={(city) => {
                                          field.onChange(city.name);
                                          contactForm.setValue("zipCode", city.cap);
                                          contactForm.setValue("province", city.province);
                                        }}
                                        placeholder="Roma"
                                        data-testid="input-city"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-2">
                              <FormField
                                control={contactForm.control}
                                name="zipCode"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>CAP</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-zip-code" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-2">
                              <FormField
                                control={contactForm.control}
                                name="province"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Prov.</FormLabel>
                                    <FormControl>
                                      <Input {...field} maxLength={2} data-testid="input-province" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>

                          {/* Riga 4: Nazione + Tipo Azienda + SDI/IPA + PEC */}
                          <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-3">
                              <FormField
                                control={contactForm.control}
                                name="country"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Nazione</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-country" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            {watchEntityType === "COMPANY" && (
                              <div className="col-span-2">
                                <FormField
                                  control={contactForm.control}
                                  name="companyNature"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Tipo</FormLabel>
                                      <FormControl>
                                        <RadioGroup
                                          onValueChange={field.onChange}
                                          value={field.value}
                                          className="flex items-center gap-3 pt-1"
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <RadioGroupItem value="PRIVATE" id="nature-private" data-testid="radio-nature-private" />
                                            <label htmlFor="nature-private" className="text-sm cursor-pointer">Privata</label>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <RadioGroupItem value="PUBLIC" id="nature-public" data-testid="radio-nature-public" />
                                            <label htmlFor="nature-public" className="text-sm cursor-pointer">Pubblica</label>
                                          </div>
                                        </RadioGroup>
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            )}
                            <div className={watchEntityType === "COMPANY" ? "col-span-2" : "col-span-3"}>
                              {watchCompanyNature === "PUBLIC" && watchEntityType === "COMPANY" ? (
                                <FormField
                                  control={contactForm.control}
                                  name="ipaCode"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>IPA</FormLabel>
                                      <FormControl>
                                        <Input {...field} placeholder="Cod. IPA" data-testid="input-ipa-code" />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              ) : (
                                <FormField
                                  control={contactForm.control}
                                  name="sdiCode"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>SDI</FormLabel>
                                      <FormControl>
                                        <Input {...field} data-testid="input-sdi-code" />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                            </div>
                            <div className={watchEntityType === "COMPANY" ? "col-span-5" : "col-span-6"}>
                              <FormField
                                control={contactForm.control}
                                name="pecEmail"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>PEC</FormLabel>
                                    <FormControl>
                                      <Input type="email" {...field} data-testid="input-pec-email" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                      </div>
                      <div className={`${watchEntityType !== "PRIVATE" ? "hidden" : ""} space-y-4`}>
                          {/* PRIVATE: Riga 1: Nome + Cognome + Salva */}
                          <div className="grid grid-cols-12 gap-3 items-end">
                            <div className="col-span-4">
                              <FormField
                                control={contactForm.control}
                                name="firstName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Nome *</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-first-name" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-4">
                              <FormField
                                control={contactForm.control}
                                name="lastName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Cognome *</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-last-name" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-4">
                              <Button
                                type="submit"
                                disabled={updateContactMutation.isPending}
                                className="w-full"
                                data-testid="button-save-contact-top"
                              >
                                <Save className="w-4 h-4 mr-2" />
                                {updateContactMutation.isPending ? "Salvataggio..." : "Salva"}
                              </Button>
                            </div>
                          </div>

                          {/* PRIVATE: Riga 2: Email + Telefono + CF */}
                          <div className="grid grid-cols-3 gap-3">
                            <FormField
                              control={contactForm.control}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email</FormLabel>
                                  <FormControl>
                                    <Input type="email" {...field} data-testid="input-email" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={contactForm.control}
                              name="phone"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Telefono</FormLabel>
                                  <FormControl>
                                    <PhoneInput
                                      value={field.value}
                                      onChange={field.onChange}
                                      data-testid="input-phone-private"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={contactForm.control}
                              name="fiscalCode"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Codice Fiscale</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-fiscal-code" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* PRIVATE: Riga 3: Via + Città + CAP + Prov */}
                          <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-5">
                              <FormField
                                control={contactForm.control}
                                name="address"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Via</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-address" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-3">
                              <FormField
                                control={contactForm.control}
                                name="city"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Città</FormLabel>
                                    <FormControl>
                                      <CityAutocomplete
                                        value={field.value || ""}
                                        onChange={field.onChange}
                                        onCitySelect={(city) => {
                                          field.onChange(city.name);
                                          contactForm.setValue("zipCode", city.cap);
                                          contactForm.setValue("province", city.province);
                                        }}
                                        placeholder="Roma"
                                        data-testid="input-city"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-2">
                              <FormField
                                control={contactForm.control}
                                name="zipCode"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>CAP</FormLabel>
                                    <FormControl>
                                      <Input {...field} data-testid="input-zip-code" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-2">
                              <FormField
                                control={contactForm.control}
                                name="province"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Prov.</FormLabel>
                                    <FormControl>
                                      <Input {...field} maxLength={2} data-testid="input-province" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>

                          {/* PRIVATE: Riga 4: Nazione */}
                          <div className="grid grid-cols-4 gap-3">
                            <FormField
                              control={contactForm.control}
                              name="country"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Nazione</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-country" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                      </div>
                    </div>

                    {/* Section 2: Referenti (only for COMPANY) */}
                    {watchEntityType === "COMPANY" && (
                      <>
                        <Separator />
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Referenti
                            </Label>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleReferentDialogOpen(true)}
                              data-testid="button-add-referent"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Aggiungi
                            </Button>
                          </div>
                          {isLoadingReferents ? (
                            <div className="space-y-2">
                              {[1, 2].map((i) => (
                                <Skeleton key={i} className="h-14 w-full" />
                              ))}
                            </div>
                          ) : referents.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">
                              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">Nessun referente aggiunto</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {referents.map((ref) => (
                                <div
                                  key={ref.id}
                                  className="flex items-center justify-between p-3 border rounded-md"
                                  data-testid={`referent-${ref.id}`}
                                >
                                  <div>
                                    <div className="font-medium text-sm">{ref.firstName} {ref.lastName}</div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                                      {ref.role && (
                                        <span className="flex items-center gap-1">
                                          <Briefcase className="w-3 h-3" />
                                          {ref.role}
                                        </span>
                                      )}
                                      {ref.email && (
                                        <span className="flex items-center gap-1">
                                          <Mail className="w-3 h-3" />
                                          {ref.email}
                                        </span>
                                      )}
                                      {ref.phone && (
                                        <span className="flex items-center gap-1">
                                          <Phone className="w-3 h-3" />
                                          {ref.phone}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditReferent(ref)}
                                      data-testid={`button-edit-referent-${ref.id}`}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteReferent(ref.id, `${ref.firstName} ${ref.lastName}`)}
                                      data-testid={`button-delete-referent-${ref.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Section 3: Informazioni Commerciali */}
                    <Separator />
                    <div className="space-y-4">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Briefcase className="w-4 h-4" />
                        Informazioni Commerciali
                      </Label>

                      <div className="grid grid-cols-5 gap-4">
                        <FormField
                          control={contactForm.control}
                          name="source"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Provenienza
                                <Settings
                                  className="w-3.5 h-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors inline-block align-middle ml-1"
                                  onClick={() => setIsLeadSourcesDialogOpen(true)}
                                  data-testid="button-manage-lead-sources"
                                />
                              </FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                value={field.value || undefined}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-source">
                                    <SelectValue placeholder="Seleziona" />
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
                          control={contactForm.control}
                          name="assignedToUserId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Assegnato a</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                value={field.value || undefined}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-assigned-to">
                                    <SelectValue placeholder="Seleziona" />
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
                        <FormField
                          control={contactForm.control}
                          name="type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Classificazione *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-contact-type">
                                    <SelectValue placeholder="Seleziona" />
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
                          control={contactForm.control}
                          name="paymentMethodId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Modalità Pagamento
                                <Settings
                                  className="w-3.5 h-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors inline-block align-middle ml-1"
                                  onClick={() => setIsPaymentMethodsDialogOpen(true)}
                                  data-testid="button-manage-payment-methods"
                                />
                              </FormLabel>
                              <Select 
                                onValueChange={(val) => field.onChange(val === "__none__" ? null : val)} 
                                value={field.value || "__none__"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-payment-method">
                                    <SelectValue placeholder="Seleziona" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="__none__">Nessuna</SelectItem>
                                  {paymentMethods.map((pm) => (
                                    <SelectItem key={pm.id} value={pm.id}>
                                      {pm.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contactForm.control}
                          name="reliability"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Affidabilità</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || "AFFIDABILE"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-reliability">
                                    <SelectValue placeholder="Seleziona" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="AFFIDABILE">Affidabile</SelectItem>
                                  <SelectItem value="POCO_AFFIDABILE">Poco Affidabile</SelectItem>
                                  <SelectItem value="NON_AFFIDABILE">Non Affidabile</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {false && (
                      <FormField
                        control={contactForm.control}
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
                      )}

                      <FormField
                        control={contactForm.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Note</FormLabel>
                            <FormControl>
                              <Textarea rows={3} {...field} data-testid="input-notes" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {relatedNotes.length > 0 && (
                  <Card className="mt-4">
                    <CardHeader className="flex flex-row items-center gap-2 pb-3">
                      <StickyNote className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-semibold">Note Correlate</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3" data-testid="related-notes-panel">
                      {relatedNotes.map((note) => (
                        <div
                          key={`${note.type}-${note.entityId}`}
                          className="rounded-md bg-muted p-3"
                          data-testid={`related-note-${note.type}-${note.entityId}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {note.type === "opportunity" ? (
                              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                            <span className="text-xs font-medium text-muted-foreground">
                              {note.type === "opportunity" ? "Opportunità" : "Progetto"}: {note.title}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{note.notes}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

              </form>
            </Form>
          </TabsContent>

          <TabsContent value="opportunita" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Opportunità / Cantieri</CardTitle>
                <Button
                  size="sm"
                  onClick={() => handleOpportunityDialogOpen(true)}
                  data-testid="button-add-opportunity"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi Opportunità
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingOpportunities ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : opportunities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Nessuna opportunità per questo contatto</p>
                    <p className="text-sm mt-1">Clicca "Aggiungi Opportunità" per creare la prima</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {opportunities.map((opp) => {
                      const stage = getStageById(opp.stageId);
                      return (
                        <div
                          key={opp.id}
                          className="flex items-center justify-between p-4 border rounded-md hover-elevate cursor-pointer"
                          onClick={() => user?.role === "SALES_AGENT" ? navigate(`/opportunita?open=${opp.id}`) : navigate(`/opportunita?scheda=${opp.id}`)}
                          data-testid={`opportunity-${opp.id}`}
                        >
                          <div>
                            <div className="font-medium">{opp.title}</div>
                            {opp.description && (
                              <div className="text-sm text-muted-foreground mt-1">{opp.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {opp.value && (
                              <span className="font-semibold text-primary">
                                € {formatCurrency(parseFloat(opp.value))}
                              </span>
                            )}
                            {stage && (
                              <Badge variant="outline" className="gap-1">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: stage.color }}
                                />
                                {stage.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Timeline Attività</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingActivities ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-4">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Nessuna attività registrata</p>
                    <p className="text-sm mt-1">Le attività appariranno quando modifichi il contatto o le opportunità</p>
                  </div>
                ) : (
                  <div className="relative space-y-0">
                    <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
                    {activities.map((activity, index) => {
                      const getActivityIcon = () => {
                        switch (activity.action) {
                          case "created":
                            return <UserPlus className="w-4 h-4" />;
                          case "updated":
                            return <Edit className="w-4 h-4" />;
                          case "deleted":
                            return <Trash2 className="w-4 h-4" />;
                          case "moved":
                            return <MoveRight className="w-4 h-4" />;
                          default:
                            return <FileText className="w-4 h-4" />;
                        }
                      };
                      
                      const getActivityColor = () => {
                        switch (activity.action) {
                          case "created":
                            return "bg-green-500";
                          case "updated":
                            return "bg-blue-500";
                          case "deleted":
                            return "bg-red-500";
                          case "moved":
                            return "bg-purple-500";
                          default:
                            return "bg-gray-500";
                        }
                      };
                      
                      const getActivityLabel = () => {
                        const entityLabel = activity.entityType === "lead" ? "Contatto" : "Opportunità";
                        switch (activity.action) {
                          case "created":
                            return `${entityLabel} creato`;
                          case "updated":
                            return `${entityLabel} aggiornato`;
                          case "deleted":
                            return `${entityLabel} eliminato`;
                          case "moved":
                            return `${entityLabel} spostato`;
                          default:
                            return `Attività su ${entityLabel}`;
                        }
                      };
                      
                      const fieldLabels: Record<string, string> = {
                        name: "Ragione Sociale",
                        firstName: "Nome",
                        lastName: "Cognome",
                        email: "Email",
                        phone: "Telefono",
                        address: "Indirizzo",
                        city: "Città",
                        zipCode: "CAP",
                        province: "Provincia",
                        country: "Paese",
                        vatNumber: "P.IVA",
                        fiscalCode: "Codice Fiscale",
                        sdiCode: "Codice SDI",
                        pecEmail: "PEC",
                        source: "Provenienza",
                        type: "Classificazione",
                        reliability: "Affidabilità",
                        notes: "Note",
                        assignedToUserId: "Assegnato a",
                        entityType: "Tipo Contatto",
                        companyNature: "Natura Azienda",
                        title: "Titolo",
                        description: "Descrizione",
                        value: "Valore",
                        stageId: "Fase",
                        workType: "Tipo Appalto",
                        siteAddress: "Indirizzo Cantiere",
                        siteCity: "Città Cantiere",
                        siteZip: "CAP Cantiere",
                        probability: "Probabilità",
                        paymentMethodId: "Modalità Pagamento",
                        referentId: "Referente",
                        leadId: "Contatto",
                        mapsLink: "Link Maps",
                        ipaCode: "Codice IPA",
                      };

                      const getActivityDetails = () => {
                        const details = activity.details as Record<string, unknown> | null;
                        if (!details) return null;
                        
                        if (activity.action === "moved") {
                          return (
                            <div className="text-sm text-muted-foreground mt-1">
                              Da <span className="font-medium text-foreground">{String(details.fromStage || "N/A")}</span> a{" "}
                              <span className="font-medium text-foreground">{String(details.toStage || "N/A")}</span>
                            </div>
                          );
                        }
                        
                        if (activity.action === "updated" && details.changes) {
                          const changes = details.changes as Record<string, { old: unknown; new: unknown }>;
                          const hiddenFields = ["updatedAt", "createdAt", "companyId", "id"];
                          const resolveValue = (key: string, val: unknown): string => {
                            if (val == null || val === "") return "—";
                            const strVal = String(val);
                            if (key === "assignedToUserId") {
                              const user = assignableUsers.find(u => u.id === strVal);
                              return user ? `${user.firstName} ${user.lastName}` : "—";
                            }
                            if (key === "referentId") {
                              const ref = referents.find(r => r.id === strVal);
                              return ref ? `${ref.firstName} ${ref.lastName}` : "—";
                            }
                            if (key === "stageId") {
                              const stage = stages.find(s => s.id === strVal);
                              return stage ? stage.name : "—";
                            }
                            if (key === "paymentMethodId") {
                              const pm = paymentMethods.find(p => p.id === strVal);
                              return pm ? pm.name : "—";
                            }
                            if (key === "leadId") {
                              return "—";
                            }
                            return strVal;
                          };
                          const changeEntries = Object.entries(changes)
                            .filter(([key]) => !hiddenFields.includes(key))
                            .filter(([key, val]) => {
                              const oldResolved = resolveValue(key, val.old);
                              const newResolved = resolveValue(key, val.new);
                              return oldResolved !== newResolved;
                            });
                          if (changeEntries.length === 0) return null;
                          return (
                            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                              {changeEntries.slice(0, 5).map(([key, val]) => {
                                const label = fieldLabels[key] || key;
                                const oldVal = resolveValue(key, val.old);
                                const newVal = resolveValue(key, val.new);
                                return (
                                  <div key={key}>
                                    <span className="font-medium text-foreground">{label}:</span>{" "}
                                    <span className="line-through opacity-60">{oldVal}</span>{" → "}
                                    <span className="font-medium">{newVal}</span>
                                  </div>
                                );
                              })}
                              {changeEntries.length > 5 && (
                                <div className="text-xs opacity-60">...e altri {changeEntries.length - 5} campi</div>
                              )}
                            </div>
                          );
                        }

                        if (activity.action === "created" && (details.title || (details.firstName && details.lastName))) {
                          const createdName = details.title ? String(details.title) : `${String(details.firstName)} ${String(details.lastName)}`;
                          return (
                            <div className="text-sm text-muted-foreground mt-1">
                              <span className="font-medium text-foreground">{createdName}</span>
                            </div>
                          );
                        }
                        
                        return null;
                      };
                      
                      return (
                        <div key={activity.id} className="relative flex gap-4 pb-6" data-testid={`activity-${activity.id}`}>
                          <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-white ${getActivityColor()}`}>
                            {getActivityIcon()}
                          </div>
                          <div className="flex-1 pt-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{getActivityLabel()}</span>
                              {activity.userName && (
                                <span className="text-sm text-muted-foreground">da {activity.userName}</span>
                              )}
                            </div>
                            {getActivityDetails()}
                            <div className="text-xs text-muted-foreground mt-1">
                              {activity.createdAt && format(new Date(activity.createdAt), "d MMMM yyyy 'alle' HH:mm", { locale: it })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {APP_CONFIG.moduleAmministrazione && (
            <TabsContent value="amministrazione" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Fatturazione
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Numero Fattura</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Importo</TableHead>
                        <TableHead>Stato Pagamento</TableHead>
                        <TableHead>Scadenza</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="font-medium">In attesa di integrazione con Arca Evolution</p>
                          <p className="text-sm mt-1">I dati di fatturazione saranno disponibili dopo l'integrazione</p>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {(watchEntityType === "COMPANY" || lead?.entityType === "COMPANY") && (
            <TabsContent value="finanziaria" className="mt-6" data-testid="content-finanziaria">
              {isLoadingCreditsafe ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : !creditsafeReport ? (
                <Card>
                  <CardContent className="text-center py-16">
                    <Shield className="w-16 h-16 mx-auto mb-4 opacity-30 text-muted-foreground" />
                    <p className="font-medium text-lg text-foreground">Nessun report CreditSafe disponibile</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Vai nella tab <span className="font-medium">Anagrafica</span> e clicca{" "}
                      <span className="font-medium">"Verifica CreditSafe"</span> accanto al campo P.IVA per generare il report finanziario.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <CreditSafeAnalysis
                  report={creditsafeReport}
                  onRefresh={() => {
                    const vatNumber = contactForm.getValues("vatNumber");
                    if (vatNumber && lead) {
                      creditsafeFetchMutation.mutate({ leadId: lead.id, vatNumber });
                    }
                  }}
                  isRefreshing={creditsafeFetchMutation.isPending}
                  canRefresh={!!contactForm.watch("vatNumber")}
                />
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={isOpportunityDialogOpen} onOpenChange={handleOpportunityDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <Form {...opportunityForm}>
            <form onSubmit={opportunityForm.handleSubmit(handleOpportunitySubmit)}>
              <DialogHeader>
                <DialogTitle>Nuova Opportunità</DialogTitle>
                <DialogDescription>
                  Crea una nuova opportunità/cantiere. I campi con * sono obbligatori.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FormField
                    control={opportunityForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Titolo Cantiere *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="es. Cantiere Via Roma"
                            {...field}
                            data-testid="input-opportunity-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={opportunityForm.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valore Preventivo (€)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="es. 15000"
                            {...field}
                            data-testid="input-opportunity-value"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FormField
                    control={opportunityForm.control}
                    name="referentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Referente</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={referents.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-opportunity-referent">
                              <SelectValue placeholder={
                                referents.length === 0
                                  ? "Nessun referente"
                                  : "Seleziona referente"
                              } />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {referents.map((ref) => (
                              <SelectItem key={ref.id} value={ref.id}>
                                {ref.firstName} {ref.lastName} {ref.role && `(${ref.role})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={opportunityForm.control}
                    name="stageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fase *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-opportunity-stage">
                              <SelectValue placeholder="Seleziona una fase" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {stages.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: stage.color }}
                                  />
                                  {stage.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FormField
                    control={opportunityForm.control}
                    name="workType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo Appalto</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex gap-4 h-9 items-center"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="PRIVATE" id="opp-work-private" />
                              <Label htmlFor="opp-work-private" className="cursor-pointer">
                                Privato
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="PUBLIC" id="opp-work-public" />
                              <Label htmlFor="opp-work-public" className="cursor-pointer">
                                Pubblico
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {isLostStage(watchStageId) && (
                  <FormField
                    control={opportunityForm.control}
                    name="lostReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Motivazione Persa</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "_none" ? null : val)}
                          value={field.value || "_none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-opportunity-lost-reason" className="md:w-1/2">
                              <SelectValue placeholder="Seleziona motivazione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">Nessuna</SelectItem>
                            {lostReasonEnum.map((reason) => (
                              <SelectItem key={reason} value={reason}>
                                {lostReasonLabels[reason]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={opportunityForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrizione</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Descrizione del lavoro..."
                          rows={2}
                          {...field}
                          data-testid="input-opportunity-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Indirizzo Cantiere
                    </Label>
                    {lead?.address && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={copyAddressFromContact}
                        className="text-xs h-7"
                        data-testid="button-copy-address"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copia dal Contatto
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: "5fr 4fr 1.5fr 1.5fr" }}>
                    <FormField
                      control={opportunityForm.control}
                      name="siteAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Via/Indirizzo"
                              {...field}
                              data-testid="input-opportunity-site-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={opportunityForm.control}
                      name="siteCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <CityAutocomplete
                              value={field.value || ""}
                              onChange={(val) => {
                                field.onChange(val);
                                if (!val.toLowerCase().includes("venezia")) {
                                  opportunityForm.setValue("veniceZone", "");
                                }
                              }}
                              onCitySelect={(city) => {
                                field.onChange(city.name);
                                opportunityForm.setValue("siteZip", city.cap);
                                opportunityForm.setValue("siteProvince", city.province);
                                if (!city.name.toLowerCase().includes("venezia")) {
                                  opportunityForm.setValue("veniceZone", "");
                                }
                              }}
                              placeholder="Città"
                              data-testid="input-opportunity-site-city"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={opportunityForm.control}
                      name="siteZip"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="CAP"
                              {...field}
                              data-testid="input-opportunity-site-zip"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={opportunityForm.control}
                      name="siteProvince"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Prov."
                              maxLength={2}
                              {...field}
                              data-testid="input-opportunity-site-province"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {watchOpportunitySiteCity && watchOpportunitySiteCity.toLowerCase().includes("venezia") && (
                    <FormField
                      control={opportunityForm.control}
                      name="veniceZone"
                      render={({ field }) => (
                        <FormItem className="mt-3">
                          <FormLabel className="text-xs font-medium text-blue-700">Zona Venezia (Trasporto Lagunare)</FormLabel>
                          <Select
                            value={field.value || ""}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-opportunity-venice-zone">
                                <SelectValue placeholder="Seleziona zona..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="NO">No (trasporto non lagunare)</SelectItem>
                              {VENICE_ZONES.map((zone) => (
                                <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={opportunityForm.control}
                    name="mapsLink"
                    render={({ field }) => (
                      <FormItem className="mt-3">
                        <FormControl>
                          <Input
                            placeholder="Link Google Maps"
                            {...field}
                            data-testid="input-opportunity-maps-link"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <FormField
                        control={opportunityForm.control}
                        name="siteDistanceKm"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="text-xs">Distanza cantiere (km)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  {...field}
                                  data-testid="input-opportunity-site-distance"
                                />
                              </FormControl>
                              {field.value && parseInt(field.value) > 0 && (
                                <Badge variant="outline" className="text-xs shrink-0">A/R: {parseInt(field.value) * 2} km</Badge>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={opportunityForm.control}
                        name="siteSquadraInZonaKm"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="text-xs flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={!!field.value && field.value !== "0"}
                                onChange={(e) => field.onChange(e.target.checked ? "50" : "")}
                                className="rounded border-gray-300"
                                data-testid="checkbox-opportunity-squadra-in-zona"
                              />
                              Squadra in zona
                              {externalWorkers.length > 0 && (
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                  onClick={(e) => { e.preventDefault(); setShowSquadreInfoDialog(true); }}
                                  title="Vedi città squadre esterne"
                                  data-testid="button-opportunity-info-squadre-esterne"
                                >
                                  <Info className="w-3 h-3" />
                                </button>
                              )}
                            </FormLabel>
                            {field.value && field.value !== "0" && (
                              <div className="flex items-center gap-2">
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="Km effettivi"
                                    {...field}
                                    data-testid="input-opportunity-squadra-in-zona-km"
                                  />
                                </FormControl>
                                <span className="text-xs text-muted-foreground shrink-0">km</span>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <FormField
                      control={opportunityForm.control}
                      name="estimatedStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data inizio indicativa</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-opportunity-estimated-start" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpportunityDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={createOpportunityMutation.isPending} data-testid="button-submit-opportunity">
                  {createOpportunityMutation.isPending ? "Creazione..." : "Crea Opportunità"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isReferentDialogOpen} onOpenChange={handleReferentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReferent ? "Modifica Referente" : "Nuovo Referente"}</DialogTitle>
            <DialogDescription>
              {editingReferent ? "Modifica i dati del referente." : "Aggiungi un nuovo referente per questa azienda."}
            </DialogDescription>
          </DialogHeader>
          <Form {...referentForm}>
            <form onSubmit={referentForm.handleSubmit(handleReferentSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={referentForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-referent-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={referentForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cognome</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-referent-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={referentForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ruolo</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Es: Responsabile Acquisti, Geometra" data-testid="input-referent-role" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={referentForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-referent-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={referentForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-referent-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleReferentDialogOpen(false)}>
                  Annulla
                </Button>
                <Button 
                  type="submit" 
                  disabled={createReferentMutation.isPending || updateReferentMutation.isPending} 
                  data-testid="button-submit-referent"
                >
                  {createReferentMutation.isPending || updateReferentMutation.isPending 
                    ? "Salvataggio..." 
                    : editingReferent ? "Salva Modifiche" : "Aggiungi Referente"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentMethodsDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handlePaymentConfirmClose(false, () => {
            setIsPaymentMethodsDialogOpen(false);
            setNewPaymentMethodName("");
            setEditingPaymentMethod(null);
            setPaymentDirty(false);
          });
          return;
        }
        setIsPaymentMethodsDialogOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestione Modalità di Pagamento</DialogTitle>
            <DialogDescription>Aggiungi, modifica o elimina le modalità di pagamento disponibili.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nuova modalità (es. Bonifico 30gg)"
                value={newPaymentMethodName}
                onChange={(e) => setNewPaymentMethodName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPaymentMethodName.trim()) {
                    createPaymentMethodMutation.mutate({ name: newPaymentMethodName.trim() });
                  }
                }}
                data-testid="input-new-payment-method"
              />
              <Button
                onClick={() => {
                  if (newPaymentMethodName.trim()) {
                    createPaymentMethodMutation.mutate({ name: newPaymentMethodName.trim() });
                  }
                }}
                disabled={!newPaymentMethodName.trim() || createPaymentMethodMutation.isPending}
                data-testid="button-add-payment-method"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {paymentMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nessuna modalità configurata</p>
              ) : (
                paymentMethods.map((pm) => (
                  <div key={pm.id} className="flex items-center gap-2 group" data-testid={`payment-method-row-${pm.id}`}>
                    {editingPaymentMethod?.id === pm.id ? (
                      <>
                        <Input
                          value={editingPaymentMethod.name}
                          onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingPaymentMethod.name.trim()) {
                              updatePaymentMethodMutation.mutate({ id: pm.id, name: editingPaymentMethod.name.trim() });
                            }
                            if (e.key === "Escape") setEditingPaymentMethod(null);
                          }}
                          autoFocus
                          data-testid="input-edit-payment-method"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => updatePaymentMethodMutation.mutate({ id: pm.id, name: editingPaymentMethod.name.trim() })}
                          disabled={!editingPaymentMethod.name.trim()}
                          data-testid="button-save-payment-method"
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{pm.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingPaymentMethod(pm)}
                          data-testid={`button-edit-payment-method-${pm.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                          data-testid={`button-delete-payment-method-${pm.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLeadSourcesDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleSourceConfirmClose(false, () => {
            setIsLeadSourcesDialogOpen(false);
            setNewLeadSourceName("");
            setEditingLeadSource(null);
            setSourceDirty(false);
          });
          return;
        }
        setIsLeadSourcesDialogOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestione Provenienze</DialogTitle>
            <DialogDescription>Aggiungi, modifica o elimina le provenienze disponibili.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nuova provenienza (es. Fiera)"
                value={newLeadSourceName}
                onChange={(e) => setNewLeadSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newLeadSourceName.trim()) {
                    createLeadSourceMutation.mutate({ name: newLeadSourceName.trim() });
                  }
                }}
                data-testid="input-new-lead-source"
              />
              <Button
                onClick={() => {
                  if (newLeadSourceName.trim()) {
                    createLeadSourceMutation.mutate({ name: newLeadSourceName.trim() });
                  }
                }}
                disabled={!newLeadSourceName.trim() || createLeadSourceMutation.isPending}
                data-testid="button-add-lead-source"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {leadSourcesList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nessuna provenienza configurata</p>
              ) : (
                leadSourcesList.map((src) => (
                  <div key={src.id} className="flex items-center gap-2 group" data-testid={`lead-source-row-${src.id}`}>
                    {editingLeadSource?.id === src.id ? (
                      <>
                        <Input
                          value={editingLeadSource.name}
                          onChange={(e) => setEditingLeadSource({ ...editingLeadSource, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingLeadSource.name.trim()) {
                              updateLeadSourceMutation.mutate({ id: src.id, name: editingLeadSource.name.trim() });
                            }
                            if (e.key === "Escape") setEditingLeadSource(null);
                          }}
                          autoFocus
                          data-testid="input-edit-lead-source"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => updateLeadSourceMutation.mutate({ id: src.id, name: editingLeadSource.name.trim() })}
                          disabled={!editingLeadSource.name.trim()}
                          data-testid="button-save-lead-source"
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{src.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingLeadSource(src)}
                          data-testid={`button-edit-lead-source-${src.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteLeadSourceMutation.mutate(src.id)}
                          data-testid={`button-delete-lead-source-${src.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ReminderModal
        open={isReminderModalOpen}
        onOpenChange={setIsReminderModalOpen}
        leadId={leadId}
        contextName={lead ? (lead.entityType === "COMPANY" ? lead.name || "" : `${lead.firstName} ${lead.lastName}`) : ""}
      />
      {OpportunityConfirmCloseDialog}
      {ReferentConfirmCloseDialog}
      {PaymentConfirmCloseDialog}
      {SourceConfirmCloseDialog}

      <Dialog open={showSquadreInfoDialog} onOpenChange={setShowSquadreInfoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Squadre esterne — Città
            </DialogTitle>
            <DialogDescription>
              Elenco dei capisquadra esterni e la loro città di residenza.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {externalWorkers.filter(w => w.isCaposquadra).length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-no-external-squads">Nessun caposquadra esterno configurato.</p>
            )}
            {externalWorkers.filter(w => w.isCaposquadra).map((w) => (
              <div key={w.id} className="flex items-center gap-2 px-2 py-1.5 rounded border text-sm" data-testid={`row-external-squad-${w.id}`}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                <span className="font-medium flex-1 truncate">{w.name}</span>
                <span className="text-muted-foreground text-xs shrink-0">{w.city || "—"}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
