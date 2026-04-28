import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { WinCelebration } from "@/components/ui/win-celebration";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CityAutocomplete } from "@/components/ui/city-autocomplete";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Target, GripVertical, User, Trash2, MapPin, Copy, Building2, Briefcase, ExternalLink, Calculator, FileText, Eye, BellRing, Bell, Pencil, Settings, ArrowUp, ArrowDown, X, Camera, Video, Loader2, ClipboardCheck, AlertTriangle, Calendar, HardHat, Truck, Euro, Phone, Mail, Search, StickyNote, ChevronLeft, ChevronRight, Info, MoreHorizontal, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReminderModal } from "@/components/reminder-modal";
import { formatCurrency } from "@/lib/formatCurrency";
import type { Opportunity, Lead, PipelineStage, ContactReferent, LostReason, SiteQuality, QuoteStatus, Worker } from "@shared/schema";
import { lostReasonEnum, siteQualityEnum } from "@shared/schema";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const opportunityFormSchema = z.object({
  title: z.string().min(1, "Il titolo è obbligatorio"),
  description: z.string().optional().or(z.literal("")),
  value: z.string().optional().or(z.literal("")),
  leadId: z.string().min(1, "Il contatto è obbligatorio"),
  referentId: z.string().optional().or(z.literal("")),
  stageId: z.string().min(1, "La fase è obbligatoria"),
  siteAddress: z.string().optional().or(z.literal("")),
  siteCity: z.string().optional().or(z.literal("")),
  siteZip: z.string().optional().or(z.literal("")),
  siteProvince: z.string().optional().or(z.literal("")),
  mapsLink: z.string().optional().or(z.literal("")),
  siteDistanceKm: z.string().optional().or(z.literal("")),
  siteSquadraInZonaKm: z.string().optional().or(z.literal("")),
  lostReason: z.string().optional().or(z.literal("")),
  siteQuality: z.string().optional().or(z.literal("")),
  veniceZone: z.string().optional().or(z.literal("")),
  estimatedStartDate: z.string().optional().or(z.literal("")),
  estimatedEndDate: z.string().optional().or(z.literal("")),
});

type OpportunityFormValues = z.infer<typeof opportunityFormSchema>;

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

const siteQualityLabels: Record<SiteQuality, string> = {
  PHOTO_VIDEO: "Bello da foto + videointervista",
  PHOTO_ONLY: "Bello da foto",
  NOTHING: "Niente da segnalare",
};

interface Quote {
  id: string;
  number: string;
  status: QuoteStatus;
  totalAmount: string;
  createdAt: string;
}

const quoteStatusConfig: Record<QuoteStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Bozza", variant: "secondary" },
  SENT: { label: "Inviato", variant: "outline" },
  ACCEPTED: { label: "Accettato", variant: "default" },
  REJECTED: { label: "Rifiutato", variant: "destructive" },
};

const PRESET_COLORS = [
  "#61CE85", "#4563FF", "#F59E0B", "#EC4899", "#8B5CF6",
  "#059669", "#EF4444", "#06B6D4", "#F97316", "#84CC16",
  "#6366F1", "#14B8A6", "#E11D48", "#A855F7", "#0EA5E9",
];

const ponteggioPerLabels: Record<string, string> = {
  FACCIATA: "Facciata", TETTO: "Tetto", DEMOLIZIONE: "Demolizione", RISTRUTTURAZIONE: "Ristrutt. interna",
  MANUTENZIONE: "Manutenzione", COPERTURA: "Copertura", IMPERMEABILIZZAZIONE: "Impermeabilizzazione",
  CAPPOTTO: "Cappotto termico", PITTURA: "Pittura", NUOVA_COSTR: "Nuova costruzione", TERRAZZE: "Terrazze",
  CANNE_FUMARIE: "Canne fumarie", GRONDAIE: "Grondaie", PIANO_CARICO: "Piano di carico",
  CASTELLO_RISALITA: "Castello di risalita", FINESTRE_SCURI: "Finestre/scuri", ALTRO: "Altro",
};
const siNoLabels: Record<string, string> = { NO: "No", SI_NOSTRO: "Sì (nostro)", SI_CLIENTE: "Sì (del cliente)" };
const gruLabels = siNoLabels;
const transpalletLabels = siNoLabels;
const luciSegnalazioneLabels = siNoLabels;
const cartelliStradaliLabels = siNoLabels;
const permessiViabilitaLabels = siNoLabels;
const permessoSostaLabels = siNoLabels;
const posizCamionLabels: Record<string, string> = { FUORI: "Fuori dal cantiere", DENTRO: "Dentro al cantiere" };
const puoScaricarLabels: Record<string, string> = { DURANTE_LAVORI: "Durante i lavori", SENZA_SQUADRA: "Senza squadra", ORARI_PRECISI: "Orari precisi", NESSUN_LIMITE: "Nessun limite" };
const luogoScaricoLabels: Record<string, string> = { AREA_CANTIERE: "Area cantiere", IN_STRADA: "In strada", MARCIAPIEDE: "Marciapiede", CORTILE: "Cortile", PARCHEGGIO: "Parcheggio" };
const anchoringLabels: Record<string, string> = {
  OCCHIOLI_CORTI: "Occhioli corti", OCCHIOLI_CAPPOTTO_X: "Occhioli cappotto da ?",
  OCCHIOLI_CAPPOTTO_5: "Occhioli cappotto da 5", OCCHIOLI_CAPPOTTO_8: "Occhioli cappotto da 8",
  OCCHIOLI_CAPPOTTO_10: "Occhioli cappotto da 10", OCCHIOLI_CAPPOTTO_12: "Occhioli cappotto da 12",
  OCCHIOLI_CAPPOTTO_15: "Occhioli cappotto da 15", OCCHIOLI_CAPPOTTO_18: "Occhioli cappotto da 18",
  OCCHIOLI_CAPPOTTO_20: "Occhioli cappotto da 20", OCCHIOLI_CAPPOTTO_22: "Occhioli cappotto da 22",
  OCCHIOLI_CAPPOTTO_25: "Occhioli cappotto da 25", SPINTE: "Spinte", A_CRAVATTA: "A cravatta",
  ZAVORRE: "Zavorre", PUNTONI: "Puntoni", NO_ANCORAGGI: "No ancoraggi", VARIABILE: "Variabile", ALTRO: "Altro",
};
const maestranzeLabels: Record<string, string> = {
  SOLO_DIPENDENTI: "Solo dipendenti", DIPENDENTI_PERM: "Dipendenti con perm.",
  DIPENDENTI_ARTIGIANI: "Dipendenti e artigiani", DIP_ART_PERM: "Dip. e Art. con perm.",
  PARTNERS: "Partners", DA_VERIFICARE: "Da verificare",
};
const orariLabels: Record<string, string> = {
  STANDARD: "Standard", ORARI_PRESTABILITI: "Orari prestabiliti", SOLO_FESTIVI: "Solo festivi",
  NO_MERCATO: "No quando c'è mercato", NO_SABATO: "No sabato", DA_VERIFICARE: "Da verificare",
};
const aCaricoLabels: Record<string, string> = {
  RIMOZ_PENSILINE: "Rimoz. pensiline", RIMOZ_TENDE: "Rimoz. tende", PUNTELLAMENTI: "Puntellamenti",
  ISOLAMENTO_CAVI: "Isolamento cavi", PERM_OCCUPAZIONE: "Perm. di occupazione", LEGNAME: "Legname",
  ASSITO: "Assito", PARAPETTI_TETTO: "Parapetti tetto", APERTURA_RETI: "Apertura reti giardini", ALTRO: "Altro",
};

function SchedaInfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <div className="min-w-0">
        <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
        <p className="text-xs font-medium leading-tight">{value}</p>
      </div>
    </div>
  );
}

function SchedaSectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-1.5 pb-0.5 mb-1 border-b">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
    </div>
  );
}

function OpportunitySchedaCantiereModal({
  opportunityId,
  open,
  onOpenChange,
}: {
  opportunityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/opportunities', opportunityId, 'site-details'],
    enabled: open,
  });

  const opp = data?.opportunity;
  const lead = data?.lead;
  const referent = data?.referent;
  const quote = data?.quote;
  const quoteItems = data?.quoteItems || [];
  const globalParams = quote?.globalParams as any;
  const montacarichi = opp?.montacarichi as any;
  const transportInfo = data?.transportInfo || [];
  const pdfData = quote?.pdfData as any;

  const detectQuoteMode = (): 'rental' | 'labor_only' | 'phases' | 'a_corpo' => {
    if (pdfData?.quote?.quoteMode) return pdfData.quote.quoteMode;
    const hasNoleggio = quoteItems.some((i: any) => i.phase === "NOLEGGIO");
    const phases = quoteItems.map((i: any) => i.phase);
    const hasFaseIndex = phases.some((p: string) => /^\d+:/.test(p));
    if (hasFaseIndex) return 'phases';
    if (!hasNoleggio) return 'labor_only';
    return 'rental';
  };
  const quoteMode = detectQuoteMode();
  const quoteModeLabels: Record<string, string> = {
    rental: "Noleggio + Manodopera",
    labor_only: "Solo Manodopera",
    phases: "A Fasi",
    a_corpo: "A corpo",
  };

  const phaseOrder = quoteMode === 'labor_only'
    ? ["MONTAGGIO", "SMONTAGGIO", "DOCUMENTI"]
    : ["MONTAGGIO", "SMONTAGGIO", "NOLEGGIO", "DOCUMENTI"];
  const phaseLabels: Record<string, string> = {
    MONTAGGIO: "Montaggio",
    SMONTAGGIO: "Smontaggio",
    NOLEGGIO: "Noleggio / Fornitura",
    DOCUMENTI: "Documenti e Servizi",
  };
  const groupedItems = phaseOrder
    .map(phase => ({
      phase,
      label: phaseLabels[phase] || phase,
      items: quoteItems.filter((i: any) => i.phase === phase),
    }))
    .filter(g => g.items.length > 0);

  const getUnit = (item: any) => {
    const logic = item.pricingLogic;
    if (logic === "RENTAL") return "mq";
    if (logic === "SALE") return "mq";
    if (logic === "DOCUMENT" || logic === "SERVICE") return "cad";
    if (logic === "TRANSPORT") return "viaggio";
    return "pz";
  };

  const clientName = lead
    ? (lead.entityType === "COMPANY" ? lead.name : `${lead.firstName} ${lead.lastName}`)
    : "";

  const fmtCurrency = (val: any) => {
    if (!val) return null;
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return null;
    return `€ ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            Scheda Cantiere
          </DialogTitle>
          <DialogDescription className="text-xs">
            Riepilogo completo delle informazioni dal preventivo
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-8">Dati non disponibili</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm" data-testid="scheda-client-name">{clientName}</p>
                  </div>
                  {opp?.siteAddress && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>{[opp.siteAddress, opp.siteCity, opp.siteZip, opp.siteProvince].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                  {opp?.veniceZone && (
                    <SchedaInfoRow label="Zona lagunare" value={opp.veniceZone} />
                  )}
                  {opp?.mapsLink && (
                    <a href={opp.mapsLink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1">
                      <ExternalLink className="w-2.5 h-2.5" /> Google Maps
                    </a>
                  )}
                </div>

                <div
                  data-testid="badge-sopralluogo"
                  className={`p-2 rounded-lg border-2 flex items-center gap-2 ${
                    opp?.sopralluogoFatto
                      ? "bg-green-50 border-green-400 text-green-700"
                      : "bg-red-50 border-red-400 text-red-700"
                  }`}
                >
                  {opp?.sopralluogoFatto ? (
                    <ClipboardCheck className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {opp?.sopralluogoFatto ? "Sopralluogo fatto" : "Sopralluogo da fare"}
                  </span>
                </div>

                {referent && (
                  <div>
                    <SchedaSectionHeader title="Referente" icon={User} />
                    <SchedaInfoRow label="Nome" value={`${referent.firstName || ""} ${referent.lastName || ""}`.trim()} />
                    {referent.role && <SchedaInfoRow label="Ruolo" value={referent.role} />}
                    <SchedaInfoRow label="Telefono" value={referent.phone} />
                    <SchedaInfoRow label="Cellulare" value={referent.mobile} />
                    <SchedaInfoRow label="Email" value={referent.email} />
                  </div>
                )}

                <div>
                  <SchedaSectionHeader title="Date e Durata" icon={Calendar} />
                  <SchedaInfoRow label="Inizio previsto" value={opp?.estimatedStartDate ? format(new Date(opp.estimatedStartDate), "dd MMM yyyy", { locale: it }) : null} />
                  {globalParams?.durationMonths && <SchedaInfoRow label="Durata noleggio" value={`${globalParams.durationMonths} mesi`} />}
                  {globalParams?.distanceKm && <SchedaInfoRow label="Distanza cantiere" value={`${globalParams.distanceKm} km`} />}
                </div>

                {opp?.description && (
                  <div>
                    <SchedaSectionHeader title="Note" icon={FileText} />
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{opp.description}</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <SchedaSectionHeader title="Ponteggio" icon={HardHat} />
                  {opp?.ponteggioPerArray && opp.ponteggioPerArray.length > 0 && (
                    <SchedaInfoRow label="Ponteggio per" value={opp.ponteggioPerArray.map((p: string) => ponteggioPerLabels[p] || p).join(", ")} />
                  )}
                  <SchedaInfoRow label="Gru cantiere" value={opp?.gruCantiere ? gruLabels[opp.gruCantiere] || opp.gruCantiere : null} />
                  <SchedaInfoRow label="Luci segnalazione" value={opp?.luciSegnalazione ? luciSegnalazioneLabels[opp.luciSegnalazione] || opp.luciSegnalazione : null} />
                  <SchedaInfoRow label="Ancoraggi" value={opp?.ancoraggi ? anchoringLabels[opp.ancoraggi] || opp.ancoraggi : null} />
                  <SchedaInfoRow label="Maestranze" value={opp?.maestranze ? maestranzeLabels[opp.maestranze] || opp.maestranze : null} />
                  <SchedaInfoRow label="Orari lavoro" value={opp?.orariLavoro ? orariLabels[opp.orariLavoro] || opp.orariLavoro : null} />
                  {opp?.aCaricoClienteArray && opp.aCaricoClienteArray.length > 0 && (
                    <SchedaInfoRow label="A carico cliente" value={opp.aCaricoClienteArray.map((a: string) => aCaricoLabels[a] || a).join(", ")} />
                  )}
                  {montacarichi && (montacarichi.tipologia || montacarichi.altezzaMt) && (
                    <div className="mt-1 p-1.5 rounded bg-muted/30 border">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Montacarichi</p>
                      <SchedaInfoRow label="Tipologia" value={montacarichi.tipologia} />
                      <SchedaInfoRow label="Altezza" value={montacarichi.altezzaMt ? `${montacarichi.altezzaMt} m` : null} />
                      <SchedaInfoRow label="N. sbarchi" value={montacarichi.numeroSbarchi?.toString()} />
                      <SchedaInfoRow label="Tipo sbarchi" value={montacarichi.tipoSbarchi} />
                    </div>
                  )}
                </div>

                <div>
                  <SchedaSectionHeader title="Trasporti" icon={Truck} />
                  <SchedaInfoRow label="Transpallet" value={opp?.transpallet ? transpalletLabels[opp.transpallet] || opp.transpallet : null} />
                  <SchedaInfoRow label="Posiz. camion" value={opp?.posizCamion ? posizCamionLabels[opp.posizCamion] || opp.posizCamion : null} />
                  <SchedaInfoRow label="Può scaricare" value={opp?.puoScaricare ? puoScaricarLabels[opp.puoScaricare] || opp.puoScaricare : null} />
                  {opp?.luogoScarico && opp.luogoScarico.length > 0 && (
                    <SchedaInfoRow label="Luogo scarico" value={opp.luogoScarico.map((l: string) => luogoScaricoLabels[l] || l).join(", ")} />
                  )}
                  <SchedaInfoRow label="Ritiro esubero" value={opp?.ritiroEsubero != null ? (opp.ritiroEsubero ? "Sì" : "No") : null} />
                  <SchedaInfoRow label="Cartelli stradali" value={opp?.cartelliStradali ? cartelliStradaliLabels[opp.cartelliStradali] || opp.cartelliStradali : null} />
                  <SchedaInfoRow label="Permessi viabilità" value={opp?.permessiViabilita ? permessiViabilitaLabels[opp.permessiViabilita] || opp.permessiViabilita : null} />
                  <SchedaInfoRow label="Permesso sosta" value={opp?.permessoSosta ? permessoSostaLabels[opp.permessoSosta] || opp.permessoSosta : null} />
                </div>
              </div>

              <div>
                {quote && (
                  <div>
                    <SchedaSectionHeader title="Preventivo" icon={Euro} />
                    <div className="p-2 rounded-md bg-muted/30 border mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{quote.number || "Preventivo"}</span>
                        <a
                          href={`/quotes/${quote.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 transition-colors"
                          title="Visualizza preventivo"
                          data-testid="link-scheda-view-quote"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      {quote.totalAmount && (
                        <span className="text-sm font-bold text-primary" data-testid="scheda-quote-total">
                          {fmtCurrency(quote.totalAmount)}
                        </span>
                      )}
                    </div>
                    <div className="mb-2">
                      <SchedaInfoRow label="Tipo preventivo" value={quoteModeLabels[quoteMode]} />
                    </div>

                    {transportInfo.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">Mezzi previsti</p>
                        <div className="space-y-1">
                          {transportInfo.map((t: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-1.5 rounded bg-blue-50/50 dark:bg-blue-950/20 border text-[11px]">
                              <div>
                                <span className="font-medium">{t.vehicleName}</span>
                                {t.vehicleDescription && <span className="text-muted-foreground ml-1">— {t.vehicleDescription}</span>}
                              </div>
                              <span className="font-semibold shrink-0 ml-2">{t.trips} {t.trips === 1 ? "viaggio" : "viaggi"} A/R</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {groupedItems.length > 0 && (
                      <div className="border rounded-md overflow-hidden overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-muted/80">
                            <tr>
                              <th className="text-left p-1.5 font-medium">Articolo</th>
                              <th className="text-right p-1.5 font-medium w-14">Qtà</th>
                              <th className="text-right p-1.5 font-medium w-12">U.M.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupedItems.map((group) => (
                              <>
                                <tr key={`h-${group.phase}`} className="bg-muted/40">
                                  <td colSpan={3} className="p-1 px-1.5 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {group.label}
                                  </td>
                                </tr>
                                {group.items.map((item: any) => (
                                  <tr key={item.id} className="border-t">
                                    <td className="p-1.5 max-w-[180px] truncate">{item.articleName || item.articleId}</td>
                                    <td className="p-1.5 text-right">{Math.round(parseFloat(item.quantity))}</td>
                                    <td className="p-1.5 text-right text-muted-foreground">{getUnit(item)}</td>
                                  </tr>
                                ))}
                              </>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PipelineManageDialog({ stages, opportunities }: { stages: PipelineStage[]; opportunities: Opportunity[] }) {
  const [open, setOpen] = useState(false);
  const [localStages, setLocalStages] = useState<Array<{ id: string; name: string; color: string; isNew?: boolean }>>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const { toast } = useToast();
  const { setDirty: setPipelineDirty, handleOpenChange: handlePipelineConfirmClose, ConfirmCloseDialog: PipelineConfirmCloseDialog } = useConfirmClose();
  const originalStagesRef = useRef<string>("");

  useEffect(() => {
    if (open) {
      const initial = stages.map(s => ({ id: s.id, name: s.name, color: s.color }));
      setLocalStages(initial);
      setDeletedIds([]);
      originalStagesRef.current = JSON.stringify(initial);
      setPipelineDirty(false);
    }
  }, [open, stages, setPipelineDirty]);

  useEffect(() => {
    if (open && originalStagesRef.current) {
      const currentState = JSON.stringify({ localStages, deletedIds });
      const originalState = JSON.stringify({ localStages: JSON.parse(originalStagesRef.current), deletedIds: [] });
      setPipelineDirty(currentState !== originalState);
    }
  }, [localStages, deletedIds, open, setPipelineDirty]);

  const oppCountByStage = useMemo(() => {
    const map = new Map<string, number>();
    opportunities.forEach(o => map.set(o.stageId, (map.get(o.stageId) || 0) + 1));
    return map;
  }, [opportunities]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    setLocalStages(prev => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  };

  const moveDown = (index: number) => {
    setLocalStages(prev => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  };

  const addStage = () => {
    setLocalStages(prev => [...prev, {
      id: `new-${Date.now()}`,
      name: "Nuova Colonna",
      color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
      isNew: true,
    }]);
  };

  const removeStage = (index: number) => {
    const stage = localStages[index];
    if (!stage.isNew && (oppCountByStage.get(stage.id) || 0) > 0) {
      toast({ title: "Impossibile eliminare", description: "Ci sono opportunità in questa colonna. Spostale prima.", variant: "destructive" });
      return;
    }
    if (!stage.isNew) setDeletedIds(prev => [...prev, stage.id]);
    setLocalStages(prev => prev.filter((_, i) => i !== index));
  };

  const updateName = (index: number, name: string) => {
    setLocalStages(prev => prev.map((s, i) => i === index ? { ...s, name } : s));
  };

  const updateColor = (index: number, color: string) => {
    setLocalStages(prev => prev.map((s, i) => i === index ? { ...s, color } : s));
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const id of deletedIds) {
        await apiRequest("DELETE", `/api/stages/${id}`);
      }

      for (const stage of localStages) {
        if (stage.isNew) {
          await apiRequest("POST", "/api/stages", { name: stage.name, color: stage.color, order: 0 });
        } else {
          const original = stages.find(s => s.id === stage.id);
          if (original && (original.name !== stage.name || original.color !== stage.color)) {
            await apiRequest("PUT", `/api/stages/${stage.id}`, { name: stage.name, color: stage.color });
          }
        }
      }

      const currentStages = await (await apiRequest("GET", "/api/stages")).json();
      const stageMap = new Map(currentStages.map((s: any) => [s.name, s.id]));
      const orderedIds = localStages
        .filter(s => !deletedIds.includes(s.id))
        .map(s => s.isNew ? stageMap.get(s.name) : s.id)
        .filter(Boolean);

      if (orderedIds.length > 0) {
        await apiRequest("PUT", "/api/stages/reorder", { stageIds: orderedIds });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      toast({ title: "Pipeline aggiornata" });
      setPipelineDirty(false);
      setOpen(false);
    } catch (error: any) {
      const msg = error?.message || "Errore nel salvataggio";
      toast({ title: "Errore", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        handlePipelineConfirmClose(false, () => {
          setOpen(false);
          setPipelineDirty(false);
        });
        return;
      }
      setOpen(v);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-[#4563FF] text-[#4563FF] hover:bg-[#4563FF]/5" data-testid="button-manage-pipeline">
          <Settings className="w-4 h-4 mr-2" />
          Gestisci Pipeline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestisci Pipeline</DialogTitle>
          <DialogDescription>Aggiungi, rinomina, riordina o elimina le colonne della pipeline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {localStages.map((stage, idx) => {
            const count = oppCountByStage.get(stage.id) || 0;
            return (
              <div key={stage.id} className="flex items-center gap-2 p-2 border rounded-lg bg-card" data-testid={`pipeline-stage-row-${idx}`}>
                <div className="flex flex-col gap-0.5">
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveUp(idx)} disabled={idx === 0} data-testid={`button-stage-up-${idx}`}>
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveDown(idx)} disabled={idx === localStages.length - 1} data-testid={`button-stage-down-${idx}`}>
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
                <div className="relative">
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => updateColor(idx, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                    title="Cambia colore"
                    data-testid={`input-stage-color-${idx}`}
                  />
                </div>
                <Input
                  value={stage.name}
                  onChange={(e) => updateName(idx, e.target.value)}
                  className="flex-1 h-8 text-sm"
                  data-testid={`input-stage-name-${idx}`}
                />
                {count > 0 && (
                  <Badge variant="secondary" className="text-xs whitespace-nowrap">{count} opp.</Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => removeStage(idx)}
                  disabled={count > 0}
                  title={count > 0 ? "Sposta prima le opportunità" : "Elimina colonna"}
                  data-testid={`button-stage-delete-${idx}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button variant="outline" onClick={addStage} className="w-full" data-testid="button-add-stage">
          <Plus className="w-4 h-4 mr-2" />
          Aggiungi Colonna
        </Button>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => {
            handlePipelineConfirmClose(false, () => {
              setOpen(false);
              setPipelineDirty(false);
            });
          }}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-pipeline">
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {PipelineConfirmCloseDialog}
    </Dialog>
  );
}

interface OpportunityCardProps {
  opportunity: Opportunity;
  lead: Lead | undefined;
  onClick: () => void;
  assignedUserName?: string | null;
  isAdmin?: boolean;
  isInWonStage?: boolean;
  quoteNumber?: string | null;
  hasActiveReminder?: boolean;
}

function OpportunityCard({ opportunity, lead, onClick, assignedUserName, isAdmin, quoteNumber, isInWonStage, hasActiveReminder }: OpportunityCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: opportunity.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const handleClick = () => {
    if (!isDragging) {
      onClick();
    }
  };

  const getContactName = () => {
    if (!lead) return null;
    if (lead.entityType === "COMPANY") {
      return lead.name || `${lead.firstName} ${lead.lastName}`;
    }
    return `${lead.firstName} ${lead.lastName}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-md p-3 shadow-sm hover-elevate cursor-grab active:cursor-grabbing relative bg-card"
      data-testid={`card-opportunity-${opportunity.id}`}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <div className="relative">
        <GripVertical className="w-4 h-4 text-muted-foreground absolute top-0 right-0 flex-shrink-0" />
        <div className="pr-6">
          <div className="flex items-center gap-2">
            <div className="font-medium text-sm truncate flex-1">
              {opportunity.siteAddress || opportunity.title}
            </div>
          </div>
          {lead && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              {lead.entityType === "COMPANY" ? (
                <Building2 className="w-3 h-3 flex-shrink-0" />
              ) : (
                <User className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="truncate">{getContactName()}</span>
            </div>
          )}
          {opportunity.siteCity && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{opportunity.siteCity}</span>
            </div>
          )}
          {isAdmin && assignedUserName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" data-testid={`text-assigned-user-${opportunity.id}`}>
              <Briefcase className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{assignedUserName}</span>
            </div>
          )}
          {opportunity.value && (
            <div className="font-semibold text-sm text-primary mt-2">
              € {formatCurrency(parseFloat(opportunity.value))}
            </div>
          )}
          {quoteNumber && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" data-testid={`text-quote-number-${opportunity.id}`}>
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span>{quoteNumber}</span>
            </div>
          )}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1">
              {(opportunity as any).siteQuality && (opportunity as any).siteQuality !== "NOTHING" && (
                <span data-testid={`badge-site-quality-${opportunity.id}`}>
                  {(opportunity as any).siteQuality === "PHOTO_VIDEO" ? (
                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-300 gap-1">
                      <Video className="w-3 h-3" />Foto + Video
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-300 gap-1">
                      <Camera className="w-3 h-3" />Foto
                    </Badge>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasActiveReminder && (
                <Bell className="w-3 h-3 text-amber-500" data-testid={`icon-reminder-${opportunity.id}`} />
              )}
              {opportunity.createdAt && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(opportunity.createdAt), "d MMM", { locale: it })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  stage: PipelineStage;
  opportunities: Opportunity[];
  leads: Lead[];
  onOpportunityClick: (opportunity: Opportunity) => void;
  usersMap?: Map<string, string>;
  isAdmin?: boolean;
  quoteNumbersMap?: Map<string, string>;
  isWonStage?: boolean;
  activeManualReminderIds?: Set<string>;
}

function KanbanColumn({ stage, opportunities, leads, onOpportunityClick, usersMap, isAdmin, quoteNumbersMap, isWonStage, activeManualReminderIds }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  const getLeadById = (leadId: string) => leads.find(l => l.id === leadId);

  const totalValue = opportunities.reduce((sum, opp) => {
    return sum + (opp.value ? parseFloat(opp.value) : 0);
  }, 0);

  return (
    <div 
      className="flex-shrink-0 flex-1 min-w-[280px] max-w-[400px]"
      data-testid={`column-stage-${stage.id}`}
    >
      <div 
        ref={setNodeRef}
        className={`bg-muted/50 rounded-lg p-3 min-h-[500px] transition-colors ${isOver ? 'bg-accent/20 ring-2 ring-accent' : ''}`}
      >
        <div className="flex items-center gap-2 mb-3 pb-2 border-b">
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0" 
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-medium text-sm truncate">{stage.name}</h3>
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {opportunities.length}
          </span>
        </div>
        {totalValue > 0 && (
          <div className="text-xs font-medium text-primary mb-3">
            Totale: € {formatCurrency(totalValue)}
          </div>
        )}
        <div className="space-y-2">
          {opportunities.map((opp) => {
            const assignedUserId = opp.assignedToUserId || (getLeadById(opp.leadId) as any)?.assignedToUserId;
            const assignedName = assignedUserId && usersMap ? usersMap.get(assignedUserId) : null;
            return (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                lead={getLeadById(opp.leadId)}
                onClick={() => onOpportunityClick(opp)}
                assignedUserName={assignedName}
                isAdmin={isAdmin}
                quoteNumber={quoteNumbersMap?.get(opp.id) || null}
                isInWonStage={isWonStage}
                hasActiveReminder={activeManualReminderIds?.has(opp.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
        <Target className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        Nessuna opportunità trovata
      </h3>
      <p className="text-muted-foreground max-w-sm">
        Inizia aggiungendo la tua prima opportunità. Clicca su "Aggiungi Opportunità" per iniziare.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex-shrink-0 w-72">
          <Skeleton className="h-[500px] w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function OpportunitaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const { setDirty: setCreateDirty, handleOpenChange: handleCreateConfirmClose, ConfirmCloseDialog: CreateConfirmCloseDialog } = useConfirmClose();
  const { setDirty: setEditDirty, handleOpenChange: handleEditConfirmClose, ConfirmCloseDialog: EditConfirmCloseDialog } = useConfirmClose();
  const [activeOpportunity, setActiveOpportunity] = useState<Opportunity | null>(null);
  const [activeStage, setActiveStage] = useState<PipelineStage | null>(null);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isSchedaOpen, setIsSchedaOpen] = useState(false);
  const [pendingLostMove, setPendingLostMove] = useState<{ opportunityId: string; stageId: string } | null>(null);
  const [pendingLostReason, setPendingLostReason] = useState<string>("");
  const [pendingWonMove, setPendingWonMove] = useState<{ opportunityId: string; stageId: string } | null>(null);
  const [pendingSiteQuality, setPendingSiteQuality] = useState<string>("");
  const [pendingPreventivoMove, setPendingPreventivoMove] = useState<{ opportunityId: string; stageId: string } | null>(null);
  const [pendingReminderDays, setPendingReminderDays] = useState<string>("15");
  const [showWinCelebration, setShowWinCelebration] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<Set<"open" | "won" | "lost">>(() => {
    const validStatuses = new Set(["open", "won", "lost"]);
    try {
      const saved = localStorage.getItem("opportunita_filterStatus");
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every((v) => validStatuses.has(v))) {
          return new Set(parsed as ("open" | "won" | "lost")[]);
        }
      }
    } catch {}
    return new Set(["open", "won", "lost"]);
  });
  const [filterVenditore, setFilterVenditore] = useState<string>("ALL");
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);

  const pipelineScrollRef = useRef<HTMLDivElement>(null);
  const pipelineScrollCleanupRef = useRef<(() => void) | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const el = pipelineScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const pipelineRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (pipelineScrollCleanupRef.current) {
      pipelineScrollCleanupRef.current();
      pipelineScrollCleanupRef.current = null;
    }
    pipelineScrollRef.current = node;
    if (node) {
      const handler = () => {
        setCanScrollLeft(node.scrollLeft > 0);
        setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
      };
      handler();
      node.addEventListener("scroll", handler);
      const ro = new ResizeObserver(handler);
      ro.observe(node);
      pipelineScrollCleanupRef.current = () => {
        node.removeEventListener("scroll", handler);
        ro.disconnect();
      };
    }
  }, []);

  const scrollPipeline = useCallback((direction: "left" | "right") => {
    const el = pipelineScrollRef.current;
    if (!el) return;
    const columnWidth = 300;
    el.scrollBy({ left: direction === "left" ? -columnWidth : columnWidth, behavior: "smooth" });
  }, []);

  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunityFormSchema),
    defaultValues: {
      title: "",
      description: "",
      value: "",
      leadId: "",
      referentId: "",
      stageId: "",
      siteAddress: "",
      siteCity: "",
      siteZip: "",
      siteProvince: "",
      mapsLink: "",
      lostReason: "",
      siteQuality: "",
      veniceZone: "",
      estimatedStartDate: "",
      estimatedEndDate: "",
    },
  });

  const editForm = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunityFormSchema),
    defaultValues: {
      title: "",
      description: "",
      value: "",
      leadId: "",
      referentId: "",
      stageId: "",
      siteAddress: "",
      siteCity: "",
      siteZip: "",
      siteProvince: "",
      mapsLink: "",
      lostReason: "",
      siteQuality: "",
      veniceZone: "",
      estimatedStartDate: "",
      estimatedEndDate: "",
    },
  });

  useEffect(() => {
    setCreateDirty(form.formState.isDirty);
  }, [form.formState.isDirty, setCreateDirty]);

  useEffect(() => {
    setEditDirty(editForm.formState.isDirty);
  }, [editForm.formState.isDirty, setEditDirty]);

  useEffect(() => {
    localStorage.setItem("opportunita_filterStatus", JSON.stringify(Array.from(filterStatus)));
  }, [filterStatus]);

  const watchSiteCity = form.watch("siteCity");
  const watchEditSiteCity = editForm.watch("siteCity");
  const watchLeadId = form.watch("leadId");
  const watchEditLeadId = editForm.watch("leadId");
  const watchStageId = form.watch("stageId");
  const watchEditStageId = editForm.watch("stageId");
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );


  const { data: stages = [], isLoading: isLoadingStages } = useQuery<PipelineStage[]>({
    queryKey: ["/api/stages"],
  });

  useEffect(() => {
    requestAnimationFrame(updateScrollArrows);
  }, [stages, updateScrollArrows]);

  const { data: opportunities = [], isLoading: isLoadingOpportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
  });

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "COMPANY_ADMIN";

  const { data: assignableUsers = [] } = useQuery<{ id: string; firstName: string; lastName: string; role: string }[]>({
    queryKey: ["/api/users/assignable"],
    enabled: isAdmin,
  });

  const usersMap = useMemo(() => {
    const map = new Map<string, string>();
    assignableUsers.forEach((u) => {
      map.set(u.id, `${u.firstName} ${u.lastName}`);
    });
    return map;
  }, [assignableUsers]);

  const quoteNumbersMap = useMemo(() => new Map<string, string>(), []);

  const { data: activeManualReminderOpportunityIds = [] } = useQuery<string[]>({
    queryKey: ["/api/reminders/opportunities-with-active-manual"],
  });

  const activeManualReminderIds = useMemo(
    () => new Set(activeManualReminderOpportunityIds),
    [activeManualReminderOpportunityIds]
  );

  const { data: externalWorkers = [] } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
    select: (data) => data.filter((w) => w.isInternal === false && w.isActive),
  });

  const [showSquadreInfoDialog, setShowSquadreInfoDialog] = useState(false);

  const { data: referents = [] } = useQuery<ContactReferent[]>({
    queryKey: ["/api/leads", watchLeadId, "referents"],
    enabled: !!watchLeadId,
  });

  const { data: editReferents = [] } = useQuery<ContactReferent[]>({
    queryKey: ["/api/leads", watchEditLeadId, "referents"],
    enabled: !!watchEditLeadId,
  });

  // Query per preventivi dell'opportunità selezionata
  const { data: opportunityQuotes = [], isLoading: isLoadingQuotes } = useQuery<Quote[]>({
    queryKey: ["/api/opportunities", selectedOpportunity?.id, "quotes"],
    enabled: !!selectedOpportunity?.id,
  });

  const { data: opportunityDetail } = useQuery<{
    leadNotes: string | null;
    leadName: string | null;
    projectNotes: Array<{ projectId: string; clientName: string; notes: string }>;
  }>({
    queryKey: ["/api/opportunities", selectedOpportunity?.id],
    enabled: !!selectedOpportunity?.id && isDetailOpen,
  });

  const selectedLead = leads.find(l => l.id === watchLeadId);
  const selectedEditLead = leads.find(l => l.id === watchEditLeadId);

  const isLostStage = (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.name?.toLowerCase().includes("perso") || stage?.name?.toLowerCase().includes("persa");
  };

  const isWonStage = (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.name?.toLowerCase().includes("vinto") || stage?.name?.toLowerCase().includes("vinta");
  };

  const isPreventivoInviatoStage = (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.name === "Preventivo Inviato";
  };

  useEffect(() => {
    if (watchStageId && !isLostStage(watchStageId)) {
      form.setValue("lostReason", "");
    }
    if (watchStageId && !isWonStage(watchStageId)) {
      form.setValue("siteQuality", "");
    }
  }, [watchStageId, stages]);

  useEffect(() => {
    if (watchEditStageId && !isLostStage(watchEditStageId)) {
      editForm.setValue("lostReason", "");
    }
    if (watchEditStageId && !isWonStage(watchEditStageId)) {
      editForm.setValue("siteQuality", "");
    }
  }, [watchEditStageId, stages]);

  const copyAddressFromContact = () => {
    if (selectedLead) {
      form.setValue("siteAddress", selectedLead.address || "");
      form.setValue("siteCity", selectedLead.city || "");
      form.setValue("siteZip", selectedLead.zipCode || "");
    }
  };

  const copyEditAddressFromContact = () => {
    if (selectedEditLead) {
      editForm.setValue("siteAddress", selectedEditLead.address || "");
      editForm.setValue("siteCity", selectedEditLead.city || "");
      editForm.setValue("siteZip", selectedEditLead.zipCode || "");
    }
  };

  const createOpportunityMutation = useMutation({
    mutationFn: async (data: OpportunityFormValues) => {
      const response = await apiRequest("POST", "/api/opportunities", {
        title: data.title,
        description: data.description || null,
        value: data.value || null,
        leadId: data.leadId,
        referentId: data.referentId || null,
        stageId: data.stageId,
        siteAddress: data.siteAddress || null,
        siteCity: data.siteCity || null,
        siteZip: data.siteZip || null,
        siteProvince: data.siteProvince || null,
        mapsLink: data.mapsLink || null,
        siteDistanceKm: data.siteDistanceKm ? parseInt(data.siteDistanceKm) : null,
        siteSquadraInZonaKm: data.siteSquadraInZonaKm ? parseInt(data.siteSquadraInZonaKm) : null,
        veniceZone: data.veniceZone || null,
        lostReason: data.lostReason || null,
        siteQuality: data.siteQuality || null,
        estimatedStartDate: data.estimatedStartDate || null,
        estimatedEndDate: data.estimatedEndDate || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      setCreateDirty(false);
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Opportunità creata",
        description: "L'opportunità è stata aggiunta alla pipeline.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile creare l'opportunità. Riprova.",
        variant: "destructive",
      });
    },
  });

  const updateOpportunityMutation = useMutation({
    mutationFn: async ({ opportunityId, data }: { opportunityId: string; data: OpportunityFormValues }) => {
      const response = await apiRequest("PATCH", `/api/opportunities/${opportunityId}`, {
        title: data.title,
        description: data.description || null,
        value: data.value || null,
        leadId: data.leadId,
        referentId: data.referentId || null,
        stageId: data.stageId,
        siteAddress: data.siteAddress || null,
        siteCity: data.siteCity || null,
        siteZip: data.siteZip || null,
        siteProvince: data.siteProvince || null,
        mapsLink: data.mapsLink || null,
        siteDistanceKm: data.siteDistanceKm ? parseInt(data.siteDistanceKm) : null,
        siteSquadraInZonaKm: data.siteSquadraInZonaKm ? parseInt(data.siteSquadraInZonaKm) : null,
        veniceZone: data.veniceZone || null,
        lostReason: data.lostReason || null,
        siteQuality: data.siteQuality || null,
        estimatedStartDate: data.estimatedStartDate || null,
        estimatedEndDate: data.estimatedEndDate || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      editForm.reset(editForm.getValues());
      setEditDirty(false);
      toast({
        title: "Opportunità aggiornata",
        description: "I dati sono stati aggiornati con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare l'opportunità. Riprova.",
        variant: "destructive",
      });
    },
  });

  const deleteOpportunityMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      await apiRequest("DELETE", `/api/opportunities/${opportunityId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      setEditDirty(false);
      setIsDetailOpen(false);
      setSelectedOpportunity(null);
      editForm.reset();
      toast({
        title: "Opportunità eliminata",
        description: "L'opportunità è stata eliminata con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare l'opportunità. Riprova.",
        variant: "destructive",
      });
    },
  });


  const moveOpportunityMutation = useMutation({
    mutationFn: async ({ opportunityId, stageId }: { opportunityId: string; stageId: string }) => {
      const response = await apiRequest("PUT", `/api/opportunities/${opportunityId}/move`, {
        stageId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile spostare l'opportunità. Riprova.",
        variant: "destructive",
      });
    },
  });

  const toggleSopralluogoMutation = useMutation({
    mutationFn: async ({ opportunityId, value }: { opportunityId: string; value: boolean }) => {
      const response = await apiRequest("PATCH", `/api/opportunities/${opportunityId}`, {
        sopralluogoFatto: value,
      });
      return response.json();
    },
    onSuccess: (_data, variables) => {
      setSelectedOpportunity(prev => prev ? { ...prev, sopralluogoFatto: variables.value } : prev);
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare lo stato del sopralluogo.",
        variant: "destructive",
      });
    },
  });

  const duplicateOpportunityMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      const response = await apiRequest("POST", `/api/opportunities/${opportunityId}/duplicate`);
      return response.json();
    },
    onSuccess: (newOpp: Opportunity) => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      setEditDirty(false);
      setIsDuplicateDialogOpen(false);
      setIsDetailOpen(false);
      toast({
        title: "Opportunità duplicata",
        description: "La nuova opportunità è stata creata. Imposta cliente e referente.",
      });
      setTimeout(() => {
        handleOpportunityClick(newOpp);
      }, 300);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile duplicare l'opportunità. Riprova.",
        variant: "destructive",
      });
      setIsDuplicateDialogOpen(false);
    },
  });

  const handleSubmit = (data: OpportunityFormValues) => {
    if (isLostStage(data.stageId) && !data.lostReason) {
      toast({ title: "Motivazione obbligatoria", description: "Seleziona una motivazione per l'opportunità persa.", variant: "destructive" });
      return;
    }
    if (isWonStage(data.stageId) && !data.siteQuality) {
      toast({ title: "Campo obbligatorio", description: "Rispondi alla domanda: Com'è il cantiere?", variant: "destructive" });
      return;
    }
    const submitData = { ...data, veniceZone: data.veniceZone === "NO" ? "" : data.veniceZone };
    createOpportunityMutation.mutate(submitData);
  };

  const handleEditSubmit = (data: OpportunityFormValues) => {
    if (isLostStage(data.stageId) && !data.lostReason) {
      toast({ title: "Motivazione obbligatoria", description: "Seleziona una motivazione per l'opportunità persa.", variant: "destructive" });
      return;
    }
    if (isWonStage(data.stageId) && !data.siteQuality) {
      toast({ title: "Campo obbligatorio", description: "Rispondi alla domanda: Com'è il cantiere?", variant: "destructive" });
      return;
    }
    if (selectedOpportunity) {
      const submitData = { ...data, veniceZone: data.veniceZone === "NO" ? "" : data.veniceZone };
      updateOpportunityMutation.mutate({ opportunityId: selectedOpportunity.id, data: submitData });
    }
  };

  const handleDeleteClick = () => {
    if (selectedOpportunity && confirm(`Sei sicuro di voler eliminare "${selectedOpportunity.title}"?`)) {
      deleteOpportunityMutation.mutate(selectedOpportunity.id);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      handleCreateConfirmClose(false, () => {
        setIsDialogOpen(false);
        form.reset();
        setCreateDirty(false);
      });
      return;
    }
    setIsDialogOpen(open);
    if (stages.length > 0) {
      form.setValue("stageId", stages[0].id);
    }
  };

  const handleDetailOpenChange = (open: boolean) => {
    if (!open) {
      handleEditConfirmClose(false, () => {
        setIsDetailOpen(false);
        setSelectedOpportunity(null);
        editForm.reset();
        setEditDirty(false);
      });
      return;
    }
    setIsDetailOpen(open);
  };

  const handleOpportunityClick = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    editForm.reset({
      title: opportunity.title,
      description: opportunity.description || "",
      value: opportunity.value || "",
      leadId: opportunity.leadId,
      referentId: opportunity.referentId || "",
      stageId: opportunity.stageId || "",
      siteAddress: opportunity.siteAddress || "",
      siteCity: opportunity.siteCity || "",
      siteZip: opportunity.siteZip || "",
      siteProvince: (opportunity as any).siteProvince || "",
      mapsLink: opportunity.mapsLink || "",
      siteDistanceKm: (opportunity as any).siteDistanceKm?.toString() || "",
      siteSquadraInZonaKm: (opportunity as any).siteSquadraInZonaKm?.toString() || "",
      lostReason: opportunity.lostReason || "",
      siteQuality: (opportunity as any).siteQuality || "",
      veniceZone: (opportunity as any).veniceZone || "",
      estimatedStartDate: opportunity.estimatedStartDate || "",
      estimatedEndDate: opportunity.estimatedEndDate || "",
    });
    setIsDetailOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    const schedaId = params.get("scheda");
    if (openId && opportunities.length > 0 && !isDetailOpen) {
      const opp = opportunities.find(o => o.id === openId);
      if (opp) {
        handleOpportunityClick(opp);
        window.history.replaceState({}, "", "/opportunita");
      }
    }
    if (schedaId && opportunities.length > 0 && !isSchedaOpen) {
      const opp = opportunities.find(o => o.id === schedaId);
      if (opp) {
        setSelectedOpportunity(opp);
        setIsSchedaOpen(true);
        window.history.replaceState({}, "", "/opportunita");
      }
    }
  }, [opportunities]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const opportunity = opportunities.find(o => o.id === active.id);
    if (opportunity) {
      setActiveOpportunity(opportunity);
      const stage = stages.find(s => s.id === opportunity.stageId);
      setActiveStage(stage || null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveOpportunity(null);
    setActiveStage(null);

    if (!over) return;

    const opportunityId = active.id as string;
    const newStageId = over.id as string;

    const opportunity = opportunities.find(o => o.id === opportunityId);
    if (!opportunity || opportunity.stageId === newStageId) return;

    if (isLostStage(newStageId)) {
      setPendingLostMove({ opportunityId, stageId: newStageId });
      setPendingLostReason("");
      return;
    }

    if (isWonStage(newStageId)) {
      setPendingWonMove({ opportunityId, stageId: newStageId });
      setPendingSiteQuality("");
      return;
    }

    if (isPreventivoInviatoStage(newStageId)) {
      setPendingPreventivoMove({ opportunityId, stageId: newStageId });
      setPendingReminderDays("15");
      return;
    }

    moveOpportunityMutation.mutate({ opportunityId, stageId: newStageId });
  };

  const confirmWonMove = async () => {
    if (!pendingWonMove || !pendingSiteQuality) return;
    try {
      await apiRequest("PATCH", `/api/opportunities/${pendingWonMove.opportunityId}`, {
        siteQuality: pendingSiteQuality,
      });
      moveOpportunityMutation.mutate({
        opportunityId: pendingWonMove.opportunityId,
        stageId: pendingWonMove.stageId,
      });
      setShowWinCelebration(true);
    } catch {
      toast({
        title: "Errore",
        description: "Impossibile salvare la qualità cantiere.",
        variant: "destructive",
      });
    }
    setPendingWonMove(null);
    setPendingSiteQuality("");
  };

  const confirmLostMove = async () => {
    if (!pendingLostMove || !pendingLostReason) return;
    try {
      await apiRequest("PATCH", `/api/opportunities/${pendingLostMove.opportunityId}`, {
        lostReason: pendingLostReason,
      });
      moveOpportunityMutation.mutate({
        opportunityId: pendingLostMove.opportunityId,
        stageId: pendingLostMove.stageId,
      });
    } catch {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare la motivazione.",
        variant: "destructive",
      });
    }
    setPendingLostMove(null);
    setPendingLostReason("");
  };

  const confirmPreventivoMove = async () => {
    if (!pendingPreventivoMove) return;
    const days = parseInt(pendingReminderDays);
    if (!days || days < 1) {
      toast({ title: "Giorni non validi", description: "Inserisci un numero di giorni maggiore di 0.", variant: "destructive" });
      return;
    }

    moveOpportunityMutation.mutate({
      opportunityId: pendingPreventivoMove.opportunityId,
      stageId: pendingPreventivoMove.stageId,
    });

    const opp = opportunities.find(o => o.id === pendingPreventivoMove.opportunityId);
    const lead = opp?.leadId ? leads.find(l => l.id === opp.leadId) : null;
    const clientName = lead
      ? (lead.entityType === "COMPANY" ? lead.name : `${lead.firstName || ""} ${lead.lastName || ""}`.trim()) || "il cliente"
      : "il cliente";

    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      dueDate.setHours(9, 0, 0, 0);

      await apiRequest("POST", "/api/reminders", {
        title: `Richiamare ${clientName}`,
        description: `Preventivo inviato ${days} giorni fa. Verifica stato e ricontatta il cliente.`,
        dueDate: dueDate.toISOString(),
        opportunityId: pendingPreventivoMove.opportunityId,
        leadId: opp?.leadId || null,
        isAutomatic: true,
      });

      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/reminders");
      }});

      toast({ title: "Promemoria creato", description: `Riceverai un promemoria tra ${days} giorni per richiamare ${clientName}.` });
    } catch {
      toast({ title: "Errore", description: "Opportunità spostata ma impossibile creare il promemoria.", variant: "destructive" });
    }

    setPendingPreventivoMove(null);
    setPendingReminderDays("15");
  };

  const normalizeSearch = useCallback((text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().replace(/[.\-'"/\\,;:()_]/g, "").replace(/\s+/g, " ").trim();
  }, []);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      if (searchQuery) {
        const q = normalizeSearch(searchQuery);
        const lead = leads.find(l => l.id === opp.leadId);
        const quoteNum = quoteNumbersMap.get(opp.id) || "";
        const referentName = (opp as any).referentName || "";
        const valueStr = opp.value ? String(opp.value) : "";
        const fields = [
          opp.title,
          lead?.name,
          lead ? `${lead.firstName} ${lead.lastName}` : null,
          opp.siteAddress,
          opp.siteCity,
          quoteNum,
          referentName,
          valueStr,
        ];
        const matches = fields.some(f => normalizeSearch(f).includes(q));
        if (!matches) return false;
      }
      if (filterVenditore !== "ALL" && opp.assignedToUserId !== filterVenditore) return false;
      if (opp.stageId) {
        const won = isWonStage(opp.stageId);
        const lost = isLostStage(opp.stageId);
        if (won && !filterStatus.has("won")) return false;
        if (lost && !filterStatus.has("lost")) return false;
        if (!won && !lost && !filterStatus.has("open")) return false;
      } else {
        if (!filterStatus.has("open")) return false;
      }
      return true;
    });
  }, [opportunities, leads, searchQuery, filterStatus, filterVenditore, quoteNumbersMap, normalizeSearch, stages]);

  const getOpportunitiesByStage = (stageId: string) => {
    return filteredOpportunities.filter(o => o.stageId === stageId);
  };

  const getLeadById = (leadId: string) => leads.find(l => l.id === leadId);

  const isLoading = isLoadingStages || isLoadingOpportunities;
  const hasNoData = stages.length === 0 || (opportunities.length === 0 && leads.length === 0);

  return (
    <DashboardLayout user={user!} fullWidth>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Opportunità</h1>
            <p className="text-muted-foreground mt-1">
              Gestisci la pipeline dei tuoi cantieri e preventivi
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN") && (
              <PipelineManageDialog stages={stages} opportunities={opportunities} />
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente, cantiere..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-56"
                data-testid="input-search-opportunities"
              />
            </div>
            {isAdmin && (
              <Select value={filterVenditore} onValueChange={setFilterVenditore}>
                <SelectTrigger className="w-44" data-testid="select-filter-venditore">
                  <User className="w-4 h-4 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tutti i venditori</SelectItem>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1" data-testid="filter-status-group">
              {(["open", "won", "lost"] as const).map((status) => {
                const labels = { open: "Aperte", won: "Vinte", lost: "Perse" };
                const activeClasses = {
                  open: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
                  won: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700",
                  lost: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
                };
                const isActive = filterStatus.has(status);
                return (
                  <button
                    key={status}
                    data-testid={`filter-status-${status}`}
                    onClick={() => {
                      setFilterStatus(prev => {
                        const next = new Set(prev);
                        if (next.has(status)) {
                          next.delete(status);
                        } else {
                          next.add(status);
                        }
                        return next;
                      });
                    }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      isActive
                        ? activeClasses[status]
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {labels[status]}
                  </button>
                );
              })}
            </div>
            <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-opportunity" disabled={leads.length === 0}>
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi Opportunità
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-5 gap-3">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)}>
                  <DialogHeader className="space-y-0.5">
                    <DialogTitle className="text-base sm:text-lg">Nuova Opportunità</DialogTitle>
                    <DialogDescription className="text-xs">
                      Crea una nuova opportunità/cantiere. I campi con * sono obbligatori.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-3">
                    <div className="border rounded-md p-3 space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        Informazioni
                      </p>
                    <FormField
                        control={form.control}
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="leadId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contatto *</FormLabel>
                              <FormControl>
                                <SearchableSelect
                                  data-testid="select-lead"
                                  options={leads.map((lead) => ({
                                    value: lead.id,
                                    label: lead.entityType === "COMPANY"
                                      ? (lead.name || `${lead.firstName} ${lead.lastName}`)
                                      : `${lead.firstName} ${lead.lastName}`,
                                  }))}
                                  value={field.value}
                                  onChange={(value) => {
                                    field.onChange(value);
                                    form.setValue("referentId", "");
                                  }}
                                  placeholder="Seleziona un contatto"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="referentId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Referente</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                value={field.value}
                                disabled={!watchLeadId || referents.length === 0}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-referent">
                                    <SelectValue placeholder={
                                      !watchLeadId 
                                        ? "Prima seleziona un contatto" 
                                        : referents.length === 0 
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
                      </div>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
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
                        <FormField
                          control={form.control}
                          name="stageId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fase *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-stage">
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
                        {isLostStage(watchStageId) && (
                          <FormField
                            control={form.control}
                            name="lostReason"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Motivazione Persa</FormLabel>
                                <Select
                                  onValueChange={(val) => field.onChange(val === "_none" ? null : val)}
                                  value={field.value || "_none"}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="select-lost-reason">
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
                        {isWonStage(watchStageId) && (
                          <FormField
                            control={form.control}
                            name="siteQuality"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Com'è il cantiere? *</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value || ""}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="select-site-quality">
                                      <SelectValue placeholder="Seleziona..." />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {siteQualityEnum.map((quality) => (
                                      <SelectItem key={quality} value={quality}>
                                        {siteQualityLabels[quality]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </div>
                    </div>

                    <div className="border rounded-md p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          Cantiere
                        </p>
                        {selectedLead?.address && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={copyAddressFromContact}
                            className="text-xs h-6 px-2"
                            data-testid="button-copy-address"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copia dal Contatto
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-12 gap-3">
                        <FormField
                          control={form.control}
                          name="siteAddress"
                          render={({ field }) => (
                            <FormItem className="col-span-12 sm:col-span-5">
                              <FormLabel>Indirizzo</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Via/Indirizzo"
                                  {...field}
                                  data-testid="input-site-address"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="siteCity"
                          render={({ field }) => (
                            <FormItem className="col-span-12 sm:col-span-3">
                              <FormLabel>Città</FormLabel>
                              <FormControl>
                                <CityAutocomplete
                                  value={field.value || ""}
                                  onChange={(val) => {
                                    field.onChange(val);
                                    if (!val.toLowerCase().includes("venezia")) {
                                      form.setValue("veniceZone", "");
                                    }
                                  }}
                                  onCitySelect={(city) => {
                                    field.onChange(city.name);
                                    form.setValue("siteZip", city.cap);
                                    form.setValue("siteProvince", city.province);
                                    if (!city.name.toLowerCase().includes("venezia")) {
                                      form.setValue("veniceZone", "");
                                    }
                                  }}
                                  placeholder="Città"
                                  data-testid="input-site-city"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="siteZip"
                          render={({ field }) => (
                            <FormItem className="col-span-6 sm:col-span-2">
                              <FormLabel>CAP</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="CAP"
                                  {...field}
                                  data-testid="input-site-zip"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="siteProvince"
                          render={({ field }) => (
                            <FormItem className="col-span-6 sm:col-span-2">
                              <FormLabel>Provincia</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Prov."
                                  maxLength={2}
                                  {...field}
                                  data-testid="input-site-province"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="mapsLink"
                          render={({ field }) => (
                            <FormItem className="col-span-12">
                              <FormLabel>Link Google Maps</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Link Google Maps"
                                  {...field}
                                  data-testid="input-maps-link"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="siteDistanceKm"
                          render={({ field }) => (
                            <FormItem className="col-span-12 sm:col-span-4">
                              <FormLabel className="text-xs">Distanza cantiere (km)</FormLabel>
                              <div className="flex items-center gap-2">
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    {...field}
                                    data-testid="input-site-distance"
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
                          control={form.control}
                          name="siteSquadraInZonaKm"
                          render={({ field }) => (
                            <FormItem className="col-span-12 sm:col-span-4">
                              <FormLabel className="text-xs flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={!!field.value && field.value !== "0"}
                                  onChange={(e) => field.onChange(e.target.checked ? "50" : "")}
                                  className="rounded border-gray-300"
                                  data-testid="checkbox-squadra-in-zona"
                                />
                                Squadra in zona
                                {externalWorkers.length > 0 && (
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                    onClick={(e) => { e.preventDefault(); setShowSquadreInfoDialog(true); }}
                                    title="Vedi città squadre esterne"
                                    data-testid="button-info-squadre-esterne"
                                  >
                                    <Info className="w-3 h-3" />
                                  </button>
                                )}
                              </FormLabel>
                              {field.value && field.value !== "0" ? (
                                <div className="flex items-center gap-2">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="Km effettivi"
                                      {...field}
                                      data-testid="input-squadra-in-zona-km"
                                    />
                                  </FormControl>
                                  <span className="text-xs text-muted-foreground shrink-0">km</span>
                                </div>
                              ) : (
                                <div className="h-9" />
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="estimatedStartDate"
                          render={({ field }) => (
                            <FormItem className="col-span-12 sm:col-span-4">
                              <FormLabel className="text-xs">Data inizio indicativa</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-estimated-start" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      {watchSiteCity && watchSiteCity.toLowerCase().includes("venezia") && (
                        <FormField
                          control={form.control}
                          name="veniceZone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium text-blue-700">Zona Venezia (Trasporto Lagunare)</FormLabel>
                              <Select
                                value={field.value || ""}
                                onValueChange={field.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-venice-zone">
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
                    </div>

                    <div className="border rounded-md p-3 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5" />
                        Note
                      </p>
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                placeholder="Descrizione del lavoro..."
                                rows={3}
                                className="min-h-[72px] resize-y"
                                {...field}
                                data-testid="input-opportunity-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-3 pt-3 border-t">
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
                      disabled={createOpportunityMutation.isPending}
                      data-testid="button-save-opportunity"
                    >
                      {createOpportunityMutation.isPending ? "Salvataggio..." : "Crea Opportunità"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {leads.length === 0 && !isLoading && (
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-muted-foreground">
              Per creare opportunità devi prima aggiungere dei lead nella sezione Lead.
            </p>
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : stages.length === 0 ? (
          <EmptyState />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="relative" data-testid="pipeline-scroll-wrapper">
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollPipeline("left")}
                  className="fixed left-2 lg:left-[calc(16rem+0.5rem)] top-1/2 -translate-y-1/2 z-40 bg-background/80 backdrop-blur-sm border shadow-md rounded-full p-2 hover:bg-accent transition-colors"
                  data-testid="pipeline-scroll-left"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollPipeline("right")}
                  className="fixed right-4 top-1/2 -translate-y-1/2 z-40 bg-background/80 backdrop-blur-sm border shadow-md rounded-full p-2 hover:bg-accent transition-colors"
                  data-testid="pipeline-scroll-right"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              <div ref={pipelineRefCallback} className="flex gap-4 overflow-x-auto pb-4">
                {stages.map((stage) => (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    opportunities={getOpportunitiesByStage(stage.id)}
                    leads={leads}
                    onOpportunityClick={handleOpportunityClick}
                    usersMap={usersMap}
                    isAdmin={isAdmin}
                    quoteNumbersMap={quoteNumbersMap}
                    isWonStage={isWonStage(stage.id)}
                    activeManualReminderIds={activeManualReminderIds}
                  />
                ))}
              </div>
            </div>
            <DragOverlay>
              {activeOpportunity && (
                <div className="bg-card border rounded-md p-3 shadow-lg opacity-90 relative">
                  <GripVertical className="w-4 h-4 text-muted-foreground absolute top-3 right-3" />
                  <div className="pr-6">
                    <div className="font-medium text-sm">
                      {activeOpportunity.title}
                    </div>
                    {activeOpportunity.value && (
                      <div className="font-semibold text-sm text-primary mt-1">
                        € {formatCurrency(parseFloat(activeOpportunity.value))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

        <Dialog open={isDetailOpen} onOpenChange={handleDetailOpenChange}>
          <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-5 gap-3">
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditSubmit)}>
                <DialogHeader className="pr-10 space-y-2 pb-3 border-b mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FormField
                      control={editForm.control}
                      name="stageId"
                      render={({ field }) => {
                        const currentStage = stages.find(s => s.id === field.value);
                        return (
                          <div className="flex flex-col gap-1.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs gap-1.5"
                                  data-testid="select-edit-stage"
                                >
                                  <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: currentStage?.color || "#888" }}
                                  />
                                  {currentStage?.name || "Seleziona fase"}
                                  <ChevronDown className="w-3 h-3 opacity-60" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {stages.map((stage) => (
                                  <DropdownMenuItem
                                    key={stage.id}
                                    onSelect={() => field.onChange(stage.id)}
                                    className="gap-2"
                                  >
                                    <div
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: stage.color }}
                                    />
                                    {stage.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {isLostStage(field.value) && (
                              <FormField
                                control={editForm.control}
                                name="lostReason"
                                render={({ field: lrField }) => (
                                  <FormItem>
                                    <Select
                                      onValueChange={(val) => lrField.onChange(val === "_none" ? null : val)}
                                      value={lrField.value || "_none"}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="h-7 text-xs w-44" data-testid="select-edit-lost-reason">
                                          <SelectValue placeholder="Motivazione..." />
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
                            {isWonStage(field.value) && (
                              <FormField
                                control={editForm.control}
                                name="siteQuality"
                                render={({ field: sqField }) => (
                                  <FormItem>
                                    <Select
                                      onValueChange={sqField.onChange}
                                      value={sqField.value || ""}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="h-7 text-xs w-52" data-testid="select-edit-site-quality">
                                          <SelectValue placeholder="Com'è il cantiere?" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {siteQualityEnum.map((quality) => (
                                          <SelectItem key={quality} value={quality}>
                                            {siteQualityLabels[quality]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>
                        );
                      }}
                    />

                    <FormField
                      control={editForm.control}
                      name="value"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1.5 ml-auto">
                          <span className="text-xs text-muted-foreground font-medium shrink-0">Valore</span>
                          <div className="relative flex items-center">
                            <span className="absolute left-2 text-xs text-muted-foreground pointer-events-none">€</span>
                            <Input
                              type="number"
                              {...field}
                              className="pl-5 h-7 w-32 text-xs font-semibold"
                              data-testid="input-edit-value"
                            />
                          </div>
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 h-7 px-2 text-xs"
                      onClick={() => setIsReminderModalOpen(true)}
                      data-testid="button-open-opportunity-reminders"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      Promemoria
                    </Button>
                  </div>

                  <DialogTitle className="font-normal p-0 m-0">
                    <FormField
                      control={editForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Titolo cantiere..."
                              className="text-base font-semibold border-0 shadow-none px-0 focus-visible:ring-0 h-auto py-0.5 bg-transparent"
                              data-testid="input-edit-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </DialogTitle>
                  <DialogDescription className="sr-only">Visualizza e modifica i dati dell'opportunità.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-3">
                  <div className="border rounded-md p-3 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Contatto
                    </p>

                    {(() => {
                      const watchReferentId = editForm.watch("referentId");
                      const selRef = editReferents.find(r => r.id === watchReferentId);
                      const phone = selRef ? (selRef.phone || selRef.mobile) : selectedEditLead?.phone;
                      const email = selRef ? selRef.email : selectedEditLead?.email;
                      const displayName = selRef
                        ? `${selRef.firstName} ${selRef.lastName}`
                        : selectedEditLead?.entityType === "COMPANY"
                          ? (selectedEditLead?.name || `${selectedEditLead?.firstName || ""} ${selectedEditLead?.lastName || ""}`.trim())
                          : selectedEditLead
                            ? `${selectedEditLead.firstName || ""} ${selectedEditLead.lastName || ""}`.trim()
                            : null;
                      const initials = displayName
                        ? displayName.split(" ").filter(Boolean).map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                        : "?";
                      const role = selRef?.role;
                      const company = selRef && selectedEditLead?.entityType === "COMPANY"
                        ? (selectedEditLead?.name || "")
                        : "";
                      if (!selectedEditLead) return null;
                      return (
                        <div className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
                          <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold truncate">{displayName}</span>
                              {role && <span className="text-xs text-muted-foreground">· {role}</span>}
                            </div>
                            {company && selRef && (
                              <div className="text-xs text-muted-foreground truncate">{company}</div>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                              {phone && (
                                <a
                                  href={`tel:${phone}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  data-testid="link-edit-referent-phone"
                                >
                                  <Phone className="w-3 h-3" />
                                  {phone}
                                </a>
                              )}
                              {email && (
                                <a
                                  href={`mailto:${email}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  data-testid="link-edit-referent-email"
                                >
                                  <Mail className="w-3 h-3" />
                                  {email}
                                </a>
                              )}
                              {watchEditLeadId && (
                                <a
                                  href={`/leads/${watchEditLeadId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid="link-open-contact"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Apri scheda
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={editForm.control}
                        name="leadId"
                        render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={(value) => {
                              field.onChange(value);
                              editForm.setValue("referentId", "");
                            }} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-lead">
                                  <SelectValue placeholder="Seleziona contatto" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {leads.map((lead) => (
                                  <SelectItem key={lead.id} value={lead.id}>
                                    {lead.entityType === "COMPANY"
                                      ? (lead.name || `${lead.firstName} ${lead.lastName}`)
                                      : `${lead.firstName} ${lead.lastName}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="referentId"
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchEditLeadId || editReferents.length === 0}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-referent">
                                  <SelectValue placeholder={
                                    !watchEditLeadId
                                      ? "Prima un contatto"
                                      : editReferents.length === 0
                                        ? "Nessun referente"
                                        : "Seleziona referente"
                                  } />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {editReferents.map((ref) => (
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
                    </div>
                  </div>

                  <div className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Cantiere
                      </p>
                      {selectedEditLead?.address && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={copyEditAddressFromContact}
                          className="text-xs h-6 px-2"
                          data-testid="button-edit-copy-address"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copia dal Contatto
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      <FormField
                        control={editForm.control}
                        name="siteAddress"
                        render={({ field }) => (
                          <FormItem className="col-span-12 sm:col-span-5">
                            <FormLabel className="text-xs">Indirizzo</FormLabel>
                            <FormControl>
                              <Input placeholder="Via/Indirizzo" {...field} data-testid="input-edit-site-address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="siteCity"
                        render={({ field }) => (
                          <FormItem className="col-span-12 sm:col-span-3">
                            <FormLabel className="text-xs">Città</FormLabel>
                            <FormControl>
                              <CityAutocomplete
                                value={field.value || ""}
                                onChange={(val) => {
                                  field.onChange(val);
                                  if (!val.toLowerCase().includes("venezia")) {
                                    editForm.setValue("veniceZone", "");
                                  }
                                }}
                                onCitySelect={(city) => {
                                  field.onChange(city.name);
                                  editForm.setValue("siteZip", city.cap);
                                  editForm.setValue("siteProvince", city.province);
                                  if (!city.name.toLowerCase().includes("venezia")) {
                                    editForm.setValue("veniceZone", "");
                                  }
                                }}
                                placeholder="Città"
                                data-testid="input-edit-site-city"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="siteZip"
                        render={({ field }) => (
                          <FormItem className="col-span-6 sm:col-span-2">
                            <FormLabel className="text-xs">CAP</FormLabel>
                            <FormControl>
                              <Input placeholder="CAP" {...field} data-testid="input-edit-site-zip" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="siteProvince"
                        render={({ field }) => (
                          <FormItem className="col-span-6 sm:col-span-2">
                            <FormLabel className="text-xs">Prov.</FormLabel>
                            <FormControl>
                              <Input placeholder="Prov." maxLength={2} {...field} data-testid="input-edit-site-province" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="mapsLink"
                        render={({ field }) => (
                          <FormItem className="col-span-12">
                            <FormLabel className="text-xs">Link Google Maps</FormLabel>
                            <FormControl>
                              <Input placeholder="Link Google Maps" {...field} data-testid="input-edit-maps-link" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {watchEditSiteCity && watchEditSiteCity.toLowerCase().includes("venezia") && (
                      <FormField
                        control={editForm.control}
                        name="veniceZone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-blue-700">Zona Venezia (Trasporto Lagunare)</FormLabel>
                            <Select value={field.value || ""} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-venice-zone">
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
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:items-stretch">
                    <div className="border rounded-md p-3 space-y-2 flex flex-col">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5" />
                        Note
                      </p>
                      <FormField
                        control={editForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Textarea
                                rows={4}
                                className="min-h-[80px] resize-y"
                                {...field}
                                data-testid="input-edit-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {opportunityDetail && (opportunityDetail.leadNotes || (opportunityDetail.projectNotes && opportunityDetail.projectNotes.length > 0)) && (
                        <div className="rounded-md bg-muted/50 border p-2 space-y-1.5" data-testid="panel-related-notes">
                          <div className="flex items-center gap-1.5">
                            <StickyNote className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note Correlate</span>
                          </div>
                          {opportunityDetail.leadNotes && (
                            <div data-testid="related-note-lead">
                              <span className="text-[11px] text-muted-foreground leading-tight">Contatto: {opportunityDetail.leadName || "—"}</span>
                              <p className="text-xs whitespace-pre-wrap mt-0.5">{opportunityDetail.leadNotes}</p>
                            </div>
                          )}
                          {opportunityDetail.projectNotes && opportunityDetail.projectNotes.map((pn: any) => (
                            <div key={pn.projectId} data-testid={`related-note-project-${pn.projectId}`}>
                              <span className="text-[11px] text-muted-foreground leading-tight">Progetto: {pn.clientName || "—"}</span>
                              <p className="text-xs whitespace-pre-wrap mt-0.5">{pn.notes}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border rounded-md p-3 space-y-2 flex flex-col">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          Preventivi
                        </p>
                        <span className="text-[11px] text-muted-foreground">
                          {opportunityQuotes.length} salvat{opportunityQuotes.length === 1 ? 'o' : 'i'}
                        </span>
                      </div>
                      {isLoadingQuotes ? (
                        <div className="space-y-1.5">
                          <Skeleton className="h-9 w-full" />
                          <Skeleton className="h-9 w-full" />
                        </div>
                      ) : opportunityQuotes.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-3 text-muted-foreground text-xs border rounded-md bg-muted/30">
                          <FileText className="w-5 h-5 mx-auto mb-1 opacity-50" />
                          Nessun preventivo salvato
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto flex-1">
                          {opportunityQuotes.map((quote) => (
                            <div
                              key={quote.id}
                              className="flex items-center justify-between px-2 py-1.5 border rounded-md hover-elevate"
                              data-testid={`quote-row-${quote.id}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-medium text-xs truncate">{quote.number}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {quote.createdAt && format(new Date(quote.createdAt), "dd MMM yyyy, HH:mm", { locale: it })}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="font-semibold text-xs">
                                  €{formatCurrency(parseFloat(quote.totalAmount || "0"))}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => navigate(`/quotes/${quote.id}`)}
                                  title="Apri preventivo"
                                  data-testid={`button-edit-quote-${quote.id}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 mt-3 pt-3 border-t">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground sm:mr-auto"
                        data-testid="button-opportunity-more-actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                        Altre azioni
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem
                        onSelect={() => setIsDuplicateDialogOpen(true)}
                        disabled={duplicateOpportunityMutation.isPending}
                        data-testid="button-duplicate-opportunity"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplica
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={handleDeleteClick}
                        disabled={deleteOpportunityMutation.isPending}
                        className="text-destructive focus:text-destructive"
                        data-testid="button-delete-opportunity"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {deleteOpportunityMutation.isPending ? "Eliminazione..." : "Elimina"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setIsDetailOpen(false);
                        navigate(`/opportunities/${selectedOpportunity?.id}/quotes/new`);
                      }}
                      data-testid="button-create-quote"
                    >
                      <Calculator className="w-4 h-4 mr-2" />
                      Crea Preventivo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDetailOpen(false)}
                      data-testid="button-cancel-edit"
                    >
                      Annulla
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateOpportunityMutation.isPending}
                      data-testid="button-save-edit"
                    >
                      {updateOpportunityMutation.isPending ? "Salvataggio..." : "Salva Modifiche"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {selectedOpportunity && (
          <ReminderModal
            open={isReminderModalOpen}
            onOpenChange={setIsReminderModalOpen}
            opportunityId={selectedOpportunity.id}
            contextName={selectedOpportunity.title}
          />
        )}

        {selectedOpportunity && (
          <OpportunitySchedaCantiereModal
            opportunityId={selectedOpportunity.id}
            open={isSchedaOpen}
            onOpenChange={setIsSchedaOpen}
          />
        )}

        <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Duplica opportunità</DialogTitle>
              <DialogDescription>
                Vuoi duplicare questa opportunità? Verranno copiati tutti i dati del cantiere e il preventivo. Il referente verrà svuotato per impostarne uno nuovo.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDuplicateDialogOpen(false)} data-testid="button-cancel-duplicate">
                Annulla
              </Button>
              <Button
                onClick={() => {
                  if (selectedOpportunity) {
                    duplicateOpportunityMutation.mutate(selectedOpportunity.id);
                  }
                }}
                disabled={duplicateOpportunityMutation.isPending}
                data-testid="button-confirm-duplicate"
              >
                {duplicateOpportunityMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Duplicazione...
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Duplica
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!pendingWonMove} onOpenChange={(open) => { if (!open) { setPendingWonMove(null); setPendingSiteQuality(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Com'è il cantiere?</DialogTitle>
              <DialogDescription>
                Seleziona la qualità del cantiere per questa opportunità vinta.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select value={pendingSiteQuality} onValueChange={setPendingSiteQuality}>
                <SelectTrigger data-testid="select-site-quality-drag">
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  {siteQualityEnum.map((quality) => (
                    <SelectItem key={quality} value={quality} data-testid={`option-site-quality-drag-${quality}`}>
                      {siteQualityLabels[quality]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPendingWonMove(null); setPendingSiteQuality(""); }} data-testid="button-cancel-won-move">
                Annulla
              </Button>
              <Button onClick={confirmWonMove} disabled={!pendingSiteQuality} data-testid="button-confirm-won-move">
                Conferma
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!pendingLostMove} onOpenChange={(open) => { if (!open) { setPendingLostMove(null); setPendingLostReason(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Motivazione Persa</DialogTitle>
              <DialogDescription>
                Seleziona la motivazione per cui l'opportunità è stata persa.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select value={pendingLostReason} onValueChange={setPendingLostReason}>
                <SelectTrigger data-testid="select-lost-reason-drag">
                  <SelectValue placeholder="Seleziona motivazione..." />
                </SelectTrigger>
                <SelectContent>
                  {lostReasonEnum.map((reason) => (
                    <SelectItem key={reason} value={reason} data-testid={`option-lost-reason-drag-${reason}`}>
                      {lostReasonLabels[reason]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPendingLostMove(null); setPendingLostReason(""); }} data-testid="button-cancel-lost-move">
                Annulla
              </Button>
              <Button onClick={confirmLostMove} disabled={!pendingLostReason} data-testid="button-confirm-lost-move">
                Conferma
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!pendingPreventivoMove} onOpenChange={(open) => { if (!open) { setPendingPreventivoMove(null); setPendingReminderDays("15"); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-primary" />
                Promemoria follow-up
              </DialogTitle>
              <DialogDescription>
                Tra quanti giorni vuoi ricevere un promemoria per richiamare il cliente?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={pendingReminderDays}
                  onChange={(e) => setPendingReminderDays(e.target.value)}
                  className="w-24 text-center text-lg font-semibold"
                  data-testid="input-reminder-days"
                />
                <span className="text-sm text-muted-foreground">giorni</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[7, 10, 15, 20, 30].map((d) => (
                  <Button
                    key={d}
                    variant={pendingReminderDays === String(d) ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPendingReminderDays(String(d))}
                    data-testid={`button-preset-days-${d}`}
                  >
                    {d}g
                  </Button>
                ))}
              </div>
              {parseInt(pendingReminderDays) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Riceverai il promemoria il{" "}
                  <span className="font-medium text-foreground">
                    {(() => {
                      const d = new Date();
                      d.setDate(d.getDate() + parseInt(pendingReminderDays));
                      return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
                    })()}
                  </span>
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  moveOpportunityMutation.mutate({ opportunityId: pendingPreventivoMove!.opportunityId, stageId: pendingPreventivoMove!.stageId });
                  setPendingPreventivoMove(null);
                  setPendingReminderDays("15");
                }}
                data-testid="button-skip-reminder"
              >
                Salta
              </Button>
              <Button onClick={confirmPreventivoMove} disabled={!pendingReminderDays || parseInt(pendingReminderDays) < 1} data-testid="button-confirm-preventivo-reminder">
                Crea promemoria
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <WinCelebration show={showWinCelebration} onClose={() => setShowWinCelebration(false)} />
      {CreateConfirmCloseDialog}
      {EditConfirmCloseDialog}

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
