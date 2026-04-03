import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useConfirmClose } from "@/hooks/use-confirm-close";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, ArrowRight, Calculator, Save, Plus, Trash2, X,
  Truck, Package, Wrench, FileText, ChevronLeft, ChevronRight, ChevronDown,
  AlertCircle, AlertTriangle, Check, Percent, Edit2, Mail, Calendar, Layers,
  ClipboardList, Settings, Tag, ArrowUpFromLine, ArrowDownToLine, Clock, ShoppingCart, Eye, Loader2, Warehouse, FileDown, Ship
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { QuotePdfDocument } from "@/components/pdf/QuotePdfDocument";
import { pdf } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/formatCurrency";
const round2 = (n: number) => Math.round(n * 100) / 100;
import type { 
  Opportunity, Lead, PricingLogic, QuotePhase,
  TransportPricingData, TransportVehicle, 
  RentalPricingData, LaborPricingData, 
  DocumentPricingData, SimplePricingData,
  QuoteDiscounts, QuoteItemDiscount,
  InstallationData, InstallationOption,
  HandlingData, HandlingZone,
  QuoteGlobalParams, VatRate
} from "@shared/schema";
import { vatRateEnum } from "@shared/schema";
import { 
  DynamicServiceEntry,
  buildDynamicServices,
  getTrasfertaMultiplier,
  calculateDynamicServicePrice,
  calcPrezzoSmaltimentoRete,
  type ArticleForPricing,
} from "@shared/optionalServices";

interface ArticleVariant {
  label: string;
  description: string;
  rental?: { months_1_2: number; months_3_5: number; months_6_8: number; months_9_plus: number };
  installation?: { mount: number; dismount: number };
  supportsCesta?: boolean;
  cestaPrice?: number;
  cestaMountPrice?: number;
  cestaDismountPrice?: number;
  isDefault?: boolean;
  price?: number;
  // HOIST specific fields
  hoistType?: "PM-M10" | "P26";
  hoistRental?: {
    basamento?: { months_1_2: number; months_3_5: number; months_6_8: number; months_9_plus: number };
    elevazione?: { months_1_2: number; months_3_5: number; months_6_8: number; months_9_plus: number };
    sbarco?: { months_1_2: number; months_3_5: number; months_6_8: number; months_9_plus: number };
    sbalzo?: { months_1_2: number; months_3_5: number; months_6_8: number; months_9_plus: number };
  };
  hoistInstallation?: {
    basamentoMount?: number;
    basamentoDismount?: number;
    elevazioneMountPerMeter?: number;
    elevazioneDismountPerMeter?: number;
    sbarcoMount?: number;
    sbarcoDismount?: number;
    sbalzoMount?: number;
    sbalzoDismount?: number;
  };
}

interface TrasfertaData {
  costo1Label: string;
  costo1Value: number;
  costo1Unit: string;
  costo2Label: string;
  costo2Value: number;
  costo2Unit: string;
}

interface Article {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  unitType: string;
  pricingLogic: PricingLogic;
  basePrice: string;
  pricingData: any;
  installationData: InstallationData | null;
  variantsData: ArticleVariant[] | null;
  trasfertaData: TrasfertaData | null;
  isChecklistItem: number;
  checklistOrder: number;
}

interface ChecklistItemState {
  enabled: boolean;
  quantity: number;
  optionIndex?: number;
  installationIndex?: number;
  variantIndex?: number;
  useCesta?: boolean;       // Aggiungi costo cesta a montaggio/smontaggio
  // HOIST specific parameters
  hoistAltezzaMetri?: number;
  hoistNumSbarchi?: number;
  hoistSbalzoMq?: number;
}

interface ACorpoItem {
  id: string;
  articleId: string;      // Articolo da catalogo
  variantIndex?: number;  // Indice variante selezionata
  notes: string;          // Note aggiuntive
  quantity: number;
  totalPrice: number;     // Totale editabile manualmente
  useCesta?: boolean;       // Aggiungi costo cesta a montaggio/smontaggio
  splitIntoPhases?: boolean; // Genera MONTAGGIO + SMONTAGGIO (60%) + NOLEGGIO
}

// Righe manuali per Montaggio/Smontaggio (aggiunte nell'anteprima)
interface ManualRow {
  id: string;
  description: string;
  amount: number;
  discountPercent: number;
}

// Voci aggiuntive - per duplicare articoli della checklist
interface ExtraChecklistItem {
  id: string;
  articleId: string;
  quantity: number;
  variantIndex?: number;
  installationIndex?: number;
  notes?: string;
  useCesta?: boolean;       // Aggiungi costo cesta a montaggio/smontaggio
  manualUnitPrice?: number; // €/unità per a_corpo mode (bypassa catalogo)
  // HOIST specific parameters
  hoistAltezzaMetri?: number;
  hoistNumSbarchi?: number;
  hoistSbalzoMq?: number;
  warehouseCostEnabled?: boolean;
}

interface QuoteItemInput {
  articleId: string;
  quantity: number;
  vehicleIndex?: number;
  optionIndex?: number;
  installationIndex?: number;
  variantIndex?: number;
  useCesta?: boolean;       // Aggiungi costo cesta a montaggio/smontaggio
  warehouseCostEnabled?: boolean;
  note?: string;
  totalPrice?: number;      // Prezzo totale fisso (bypassa calcolo catalogo, per a_corpo mode)
  // HOIST specific parameters
  hoistAltezzaMetri?: number;
  hoistNumSbarchi?: number;
  hoistSbalzoMq?: number;
}

interface CalculationDetail {
  description: string;
  breakdown: { label: string; value: number }[];
}

interface CalculatedItem {
  articleId: string;
  articleName: string;
  quantity: number;
  phase: QuotePhase;
  unitPrice: number;
  totalRow: number;
  calculationDetail?: CalculationDetail;
}

interface PhaseSection {
  phase: QuotePhase;
  label: string;
  items: CalculatedItem[];
  subtotal: number;
}

interface HandlingBreakdownZone {
  label: string;
  quantity: number;
  distHoriz: number;
  distVert: number;
  type: "GROUND" | "HEIGHT";
  groundHorizCost: number;
  groundVertCost: number;
  heightHorizCost: number;
  heightVertCost: number;
  mountCost: number;
  dismountCost: number;
}

// Tipi predefiniti per incremento difficoltà
const DIFFICULTY_TYPES = {
  TERRAZZE: { label: "Terrazze", unitPrice: 50 },
  SBALZI: { label: "Sbalzi", unitPrice: 200 },
  ANCORAGGI: { label: "Ancoraggi speciali", unitPrice: 25 },
  TONDO: { label: "Ponteggio su tondo", unitPrice: 40 },
  ALTRO: { label: "Altro", unitPrice: 0 }
} as const;

type DifficultyType = keyof typeof DIFFICULTY_TYPES;

interface DifficultyItem {
  id: string;
  type: DifficultyType;
  quantity: number;
  customDescription?: string;  // Solo per tipo ALTRO
  customPrice?: number;        // Solo per tipo ALTRO
}

// Struttura per una singola fase del preventivo a fasi
type FaseModuleType = 'durata' | 'trasporto' | 'montaggio' | 'smontaggio' | 'noleggio' | 'fornitura' | 'magazzino';

interface QuoteFaseData {
  id: string;
  customLabel: string;
  enabledModules: FaseModuleType[];
  durationMonths: number;
  transportItems: Array<{ articleId: string; vehicleIndex: number; quantity: number; andataEnabled: boolean; ritornoEnabled: boolean; note?: string }>;
  montaggioItems: ExtraChecklistItem[];
  smontaggioItems: ExtraChecklistItem[];
  noleggioItems: ExtraChecklistItem[];
  fornituraItems: ExtraChecklistItem[];
  magazzinoItems: ExtraChecklistItem[];
  aCorpoItems: ACorpoItem[];
  handlingEnabled: boolean;
  handlingZones: HandlingZone[];
  saltaretiEnabled: boolean;
  saltaretiQuantity: number;
  handlingExtraPrice: number;
  difficultyEnabled: boolean;
  difficultyItems: DifficultyItem[];
  distanceKm: number;
  squadraInZonaEnabled: boolean;
  squadraInZonaKm: number;
}

interface HandlingCalculationResult {
  mountTotal: number;
  dismountTotal: number;
  saltaretiCost: number;
  extraPrice: number;
  total: number;
  breakdown: {
    zones: HandlingBreakdownZone[];
    saltareti: { quantity: number; unitPrice: number; total: number } | null;
  };
}

// Contesto per valutare le condizioni delle clausole (Step 4)
interface ClauseContext {
  ponteggioPerArray: string[];
  hasTelaio105: boolean;
  hasMultidirezionale: boolean;
  hasMontacarichi: boolean;
  hasMensole: boolean;
  hasParapettiParete: boolean;
  hasParapettiMorsa: boolean;
  hasParapettiTuboGiunto: boolean;
  hasCesta: boolean;
  hasScala: boolean;
  hasCielo: boolean;
  hasCopertura: boolean;
  hasPonteggio: boolean;
  isSoloManodopera: boolean;
  mqPonteggio: number;
  montacarichiDesc: string;
  montacarichiAltezza: number;
  montacarichiSbarchi: number;
  scalaAltezza: number;
  validitaOfferta: number;
  sopralluogoFatto: boolean;
  gruCantierePrevista: boolean;
  isCantiereAMq: boolean;
}

// Definizione di una clausola per Step 4
interface ClauseEntry {
  id: string;
  defaultText: string;
  condition: (ctx: ClauseContext) => boolean;
}

interface PreviewResult {
  items: CalculatedItem[];
  phases: PhaseSection[];
  sections: {
    documenti: number;
    trasporto_andata: number;
    montaggio: number;
    noleggio: number;
    smontaggio: number;
    trasporto_ritorno: number;
  };
  total: number;
  handling?: HandlingCalculationResult;
  grandTotal?: number;
}

// ============ INTERFACCE PER MODALITÀ FASI (PHASES) ============

// Risultato calcolato per una singola fase
interface FasePreviewResult {
  faseIndex: number;
  faseName: string;  // "Fase 1", "Fase 2", etc.
  durationMonths: number;
  phases: PhaseSection[];  // Sezioni di costo (TRASPORTO_ANDATA, MONTAGGIO, etc.) - esclusi DOCUMENTI
  total: number;
  handling?: HandlingCalculationResult;
}

// Risultato completo per modalità fasi
interface PhasesPreviewResult {
  isMultiPhase: true;
  documenti: PhaseSection;  // Documenti comuni a tutte le fasi
  fasiResults: FasePreviewResult[];  // Risultati per ogni fase
  grandTotal: number;
}

// Unione dei tipi di risultato possibili
type AnyPreviewResult = PreviewResult | PhasesPreviewResult;

const STEP_LABELS = [
  "Materiali & Durata",
  "Logistica & Servizi",
  "Dettagli Tecnici",
  "Clausole e Note",
  "Revisione & Sconti"
];

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  iconBg?: string;
  defaultOpen?: boolean;
  testId?: string;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon, iconBg, defaultOpen = true, testId, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setIsOpen(prev => !prev)}
        data-testid={testId ? `toggle-${testId}` : undefined}
      >
        {icon && iconBg && (
          <div className={`p-1.5 rounded-md ${iconBg}`}>{icon}</div>
        )}
        <h3 className="font-semibold flex-1">{title}</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`} />
      </button>
      {isOpen && children}
    </div>
  );
}

function getCategoryIcon(pricingLogic: string) {
  switch (pricingLogic) {
    case "TRANSPORT": return <Truck className="w-4 h-4" />;
    case "RENTAL": return <Package className="w-4 h-4" />;
    case "SALE": return <Package className="w-4 h-4" />;
    case "LABOR": return <Wrench className="w-4 h-4" />;
    case "DOCUMENT":
    case "SERVICE":
    case "EXTRA": return <FileText className="w-4 h-4" />;
    default: return null;
  }
}

function getCategoryColor(pricingLogic: string): string {
  switch (pricingLogic) {
    case "TRANSPORT": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    case "RENTAL": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "SALE": return "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300";
    case "LABOR": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
    case "DOCUMENT": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
    case "SERVICE":
    case "EXTRA": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function getPhaseColor(phase: string): string {
  switch (phase) {
    case "DOCUMENTI": return "bg-purple-50/50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800";
    case "TRASPORTO_ANDATA": return "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800";
    case "MOVIMENTAZIONE_MAGAZZINO": return "bg-cyan-50/50 border-cyan-200 dark:bg-cyan-950/20 dark:border-cyan-800";
    case "MONTAGGIO": return "bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800";
    case "NOLEGGIO": return "bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800";
    case "SMONTAGGIO": return "bg-orange-50/50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800";
    case "TRASPORTO_RITORNO": return "bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800";
    case "FORNITURA": return "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800";
    default: return "bg-muted border-border";
  }
}

const VENICE_FERRY_ZONES = new Set(["Lido", "Pellestrina"]);

interface AppliedPromo {
  promoId: string;
  code: string;
  description: string | null;
  discountPercent: number;
  isGlobal: boolean;
  articleCodes: string[];
  totalAmount: number;
}

export default function QuoteNewPage() {
  const { id: opportunityId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const searchParams = new URLSearchParams(window.location.search);
  const editQuoteId = searchParams.get("edit");
  const isEditMode = !!editQuoteId;
  const [editDataLoaded, setEditDataLoaded] = useState(false);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  // Track max step reached and scroll to top when step changes
  useEffect(() => {
    setMaxStepReached(prev => Math.max(prev, currentStep));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // Form state - Step 1
  // Modalità preventivo: 'rental' = Noleggio + Manodopera, 'labor_only' = Solo Manodopera, 'phases' = Fasi, 'a_corpo' = A corpo
  const [quoteMode, setQuoteMode] = useState<'rental' | 'labor_only' | 'phases' | 'a_corpo'>('rental');
  const [durationMonths, setDurationMonths] = useState(1);
  // Aliquota IVA di default per il preventivo
  const [vatRateDefault, setVatRateDefault] = useState<VatRate>("22");
  const [checklistItems, setChecklistItems] = useState<Map<string, ChecklistItemState>>(new Map());

  // Gestione Fasi (multi-fase)
  const [fasi, setFasi] = useState<QuoteFaseData[]>([]);
  const [currentFaseIndex, setCurrentFaseIndex] = useState(0);
  const currentFaseIndexRef = useRef(0);

  // Helper per creare una nuova fase vuota
  const createEmptyFase = (index: number): QuoteFaseData => ({
    id: `fase-${Date.now()}-${index}`,
    customLabel: '',
    enabledModules: [],
    durationMonths: 1,
    transportItems: [],
    montaggioItems: [],
    smontaggioItems: [],
    noleggioItems: [],
    fornituraItems: [],
    magazzinoItems: [],
    aCorpoItems: [],
    handlingEnabled: false,
    handlingZones: [],
    saltaretiEnabled: false,
    saltaretiQuantity: 0,
    handlingExtraPrice: 0,
    difficultyEnabled: false,
    difficultyItems: [],
    distanceKm: 0,
    squadraInZonaEnabled: false,
    squadraInZonaKm: 0,
  });

  const isPhaseLikeMode = quoteMode === 'phases' || quoteMode === 'a_corpo';

  // Handler per selezionare la modalità "phases" - crea subito la prima fase
  const createFirstFaseWithDefaults = () => {
    const fase = createEmptyFase(0);
    const oppDist = (opportunity as any)?.siteDistanceKm;
    const oppSquadra = (opportunity as any)?.siteSquadraInZonaKm;
    if (oppDist > 0) fase.distanceKm = oppDist;
    if (oppSquadra > 0) {
      fase.squadraInZonaEnabled = true;
      fase.squadraInZonaKm = oppSquadra;
    }
    return fase;
  };

  const selectPhasesMode = () => {
    setQuoteMode('phases');
    if (fasi.length === 0) {
      setFasi([createFirstFaseWithDefaults()]);
      setCurrentFaseIndex(0);
    }
  };

  const selectACorpoMode = () => {
    setQuoteMode('a_corpo');
    if (fasi.length === 0) {
      setFasi([createFirstFaseWithDefaults()]);
      setCurrentFaseIndex(0);
    }
  };

  // Quando cambia modalità, aggiusta durationMonths
  useEffect(() => {
    if (quoteMode === 'labor_only') {
      setDurationMonths(0);
    } else if (quoteMode === 'rental' && durationMonths === 0) {
      setDurationMonths(1);
    }
  }, [quoteMode]);

  // "A corpo" items - voci con importo totale fisso
  const [aCorpoItems, setACorpoItems] = useState<ACorpoItem[]>([]);

  // Extra checklist items - per duplicare articoli già in checklist
  const [extraChecklistItems, setExtraChecklistItems] = useState<ExtraChecklistItem[]>([]);

  // Form state - Step 2
  const [distanceKm, setDistanceKm] = useState(0);
  const [squadraInZonaEnabled, setSquadraInZonaEnabled] = useState(false);
  const [squadraInZonaKm, setSquadraInZonaKm] = useState(0);
  const [transportItems, setTransportItems] = useState<Array<{ articleId: string; vehicleIndex: number; quantity: number; andataEnabled: boolean; ritornoEnabled: boolean; note?: string }>>([]);
  const [serviceItems, setServiceItems] = useState<Map<string, { enabled: boolean; quantity: number; optionIndex?: number }>>(new Map());

  // Override manuale prezzo POS/Pimus
  const [posManualEnabled, setPosManualEnabled] = useState(false);
  const [posManualPrice, setPosManualPrice] = useState(0);

  // Ritiro esubero (viaggio furgone per ritiro spazzatura)
  const [ritiroEsuberoEnabled, setRitiroEsuberoEnabled] = useState(false);

  // Handling (Movimentazione) state
  const [handlingEnabled, setHandlingEnabled] = useState(false);
  const [handlingZones, setHandlingZones] = useState<HandlingZone[]>([]);
  const [saltaretiEnabled, setSaltaretiEnabled] = useState(false);
  const [saltaretiQuantity, setSaltaretiQuantity] = useState(0);
  const [handlingExtraPrice, setHandlingExtraPrice] = useState(0);

  // Incremento Difficoltà state
  const [difficultyEnabled, setDifficultyEnabled] = useState(false);
  const [difficultyItems, setDifficultyItems] = useState<DifficultyItem[]>([]);

  // Trasporti Lagunari Venezia - Barca (solo per zone non-ferry)
  const [lagunariBarcaVariantIndex, setLagunariBarcaVariantIndex] = useState<number>(0);
  const [lagunariNumeroBarca, setLagunariNumeroBarca] = useState<number>(1);

  const [lagunariAmountOverrides, setLagunariAmountOverrides] = useState<Map<string, number | null>>(new Map());
  const [lagunariDiscounts, setLagunariDiscounts] = useState<Map<string, number>>(new Map());
  const [lagunariVatOverrides, setLagunariVatOverrides] = useState<Map<string, VatRate>>(new Map());
  const [deletedLagunariItems, setDeletedLagunariItems] = useState<Set<string>>(new Set());

  // Righe manuali Montaggio/Smontaggio (per modalità normale: rental e labor_only)
  const [manualMontaggioRows, setManualMontaggioRows] = useState<ManualRow[]>([]);
  const [manualSmontaggioRows, setManualSmontaggioRows] = useState<ManualRow[]>([]);
  const [manualNoleggioRows, setManualNoleggioRows] = useState<ManualRow[]>([]);
  
  // Righe manuali per modalità phases (per fase: Map<faseIndex, { montaggio: ManualRow[], smontaggio: ManualRow[], noleggio: ManualRow[] }>)
  const [phasesManualRows, setPhasesManualRows] = useState<Map<number, { montaggio: ManualRow[]; smontaggio: ManualRow[]; noleggio: ManualRow[] }>>(new Map());

  const [deletedItems, setDeletedItems] = useState<Set<string>>(new Set());
  const [deletedPhaseItems, setDeletedPhaseItems] = useState<Set<string>>(new Set());
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  // === Funzioni gestione Fasi ===
  const currentFase = fasi[currentFaseIndex];

  // Mantieni il ref sincronizzato con l'indice corrente (sempre aggiornato)
  currentFaseIndexRef.current = currentFaseIndex;

  // Aggiorna un campo della fase corrente (protetto da array vuoti)
  const updateCurrentFase = <K extends keyof QuoteFaseData>(field: K, value: QuoteFaseData[K]) => {
    const idx = currentFaseIndexRef.current;
    setFasi(prev => {
      if (prev.length === 0 || idx >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  // Aggiungi una nuova fase
  const addFase = () => {
    if (fasi.length >= 50) return;
    const newFase = createEmptyFase(fasi.length);
    const prevFase = fasi[fasi.length - 1];
    if (prevFase) {
      newFase.distanceKm = prevFase.distanceKm;
      newFase.squadraInZonaEnabled = prevFase.squadraInZonaEnabled;
      newFase.squadraInZonaKm = prevFase.squadraInZonaKm;
    } else {
      const oppDist = (opportunity as any)?.siteDistanceKm;
      const oppSquadra = (opportunity as any)?.siteSquadraInZonaKm;
      if (oppDist > 0) newFase.distanceKm = oppDist;
      if (oppSquadra > 0) {
        newFase.squadraInZonaEnabled = true;
        newFase.squadraInZonaKm = oppSquadra;
      }
    }
    const newFaseIndex = fasi.length; // Indice della nuova fase (catturato prima di setFasi)
    setFasi(prev => [...prev, newFase]);
    setCurrentFaseIndex(newFaseIndex); // Vai alla nuova fase
  };

  // Rimuovi una fase (minimo 1 fase)
  const removeFase = (index: number) => {
    if (fasi.length <= 1) return;
    setFasi(prev => prev.filter((_, i) => i !== index));
    if (currentFaseIndex >= fasi.length - 1) {
      setCurrentFaseIndex(Math.max(0, fasi.length - 2));
    }
  };

  // Vai alla fase precedente
  const goToPreviousFase = () => {
    if (currentFaseIndex > 0) {
      setCurrentFaseIndex(prev => prev - 1);
    }
  };

  // Vai alla fase successiva
  const goToNextFase = () => {
    if (currentFaseIndex < fasi.length - 1) {
      setCurrentFaseIndex(prev => prev + 1);
    }
  };

  // === Getter/Setter che usano fase corrente in modalità phases ===
  // Questi wrapper permettono di usare lo stesso UI sia per fasi che per rental/labor_only
  
  const getActiveChecklistItems = (): Map<string, ChecklistItemState> => {
    return checklistItems;
  };
  
  const setActiveChecklistItems = (items: Map<string, ChecklistItemState>) => {
    setChecklistItems(items);
  };
  
  const getActiveACorpoItems = (): ACorpoItem[] => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.aCorpoItems;
    }
    return aCorpoItems;
  };
  
  const setActiveACorpoItems = (items: ACorpoItem[]) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('aCorpoItems', items);
    } else {
      setACorpoItems(items);
    }
  };
  
  const getActiveExtraChecklistItems = (): ExtraChecklistItem[] => {
    return extraChecklistItems;
  };
  
  const setActiveExtraChecklistItems = (items: ExtraChecklistItem[]) => {
    setExtraChecklistItems(items);
  };

  const getFaseModuleItems = (moduleType: 'montaggioItems' | 'smontaggioItems' | 'noleggioItems' | 'fornituraItems' | 'magazzinoItems'): ExtraChecklistItem[] => {
    if (currentFase) return currentFase[moduleType];
    return [];
  };

  const setFaseModuleItems = (moduleType: 'montaggioItems' | 'smontaggioItems' | 'noleggioItems' | 'fornituraItems' | 'magazzinoItems', items: ExtraChecklistItem[]) => {
    updateCurrentFase(moduleType, items);
  };

  const addFaseModule = (moduleType: FaseModuleType) => {
    if (!currentFase) return;
    const modules = currentFase.enabledModules;
    if (!modules.includes(moduleType)) {
      updateCurrentFase('enabledModules', [...modules, moduleType]);
    }
  };

  const removeFaseModule = (moduleType: FaseModuleType) => {
    if (!currentFase) return;
    updateCurrentFase('enabledModules', currentFase.enabledModules.filter(m => m !== moduleType));
  };

  const isFaseModuleEnabled = (moduleType: FaseModuleType): boolean => {
    if (!currentFase) return false;
    return currentFase.enabledModules.includes(moduleType);
  };

  const addModuleArticle = (moduleType: 'montaggioItems' | 'smontaggioItems' | 'noleggioItems' | 'fornituraItems' | 'magazzinoItems') => {
    const current = getFaseModuleItems(moduleType);
    setFaseModuleItems(moduleType, [...current, {
      id: `module-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      articleId: '',
      quantity: 1,
      variantIndex: undefined,
      installationIndex: undefined,
    }]);
  };

  const updateModuleArticle = (moduleType: 'montaggioItems' | 'smontaggioItems' | 'noleggioItems' | 'fornituraItems' | 'magazzinoItems', id: string, updates: Partial<ExtraChecklistItem>) => {
    const current = getFaseModuleItems(moduleType);
    setFaseModuleItems(moduleType, current.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const removeModuleArticle = (moduleType: 'montaggioItems' | 'smontaggioItems' | 'noleggioItems' | 'fornituraItems' | 'magazzinoItems', id: string) => {
    const current = getFaseModuleItems(moduleType);
    setFaseModuleItems(moduleType, current.filter(item => item.id !== id));
  };
  
  const getActiveTransportItems = (): Array<{ articleId: string; vehicleIndex: number; quantity: number; andataEnabled: boolean; ritornoEnabled: boolean; note?: string }> => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.transportItems;
    }
    return transportItems;
  };
  
  const setActiveTransportItems = (items: Array<{ articleId: string; vehicleIndex: number; quantity: number; andataEnabled: boolean; ritornoEnabled: boolean; note?: string }>) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('transportItems', items);
    } else {
      setTransportItems(items);
    }
  };
  
  const getActiveHandlingEnabled = (): boolean => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.handlingEnabled;
    }
    return handlingEnabled;
  };
  
  const setActiveHandlingEnabled = (enabled: boolean) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('handlingEnabled', enabled);
    } else {
      setHandlingEnabled(enabled);
    }
  };
  
  const getActiveHandlingZones = (): HandlingZone[] => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.handlingZones;
    }
    return handlingZones;
  };
  
  const setActiveHandlingZones = (zones: HandlingZone[]) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('handlingZones', zones);
    } else {
      setHandlingZones(zones);
    }
  };
  
  const getActiveSaltaretiEnabled = (): boolean => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.saltaretiEnabled;
    }
    return saltaretiEnabled;
  };
  
  const setActiveSaltaretiEnabled = (enabled: boolean) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('saltaretiEnabled', enabled);
    } else {
      setSaltaretiEnabled(enabled);
    }
  };
  
  const getActiveSaltaretiQuantity = (): number => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.saltaretiQuantity;
    }
    return saltaretiQuantity;
  };
  
  const setActiveSaltaretiQuantity = (qty: number) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('saltaretiQuantity', qty);
    } else {
      setSaltaretiQuantity(qty);
    }
  };
  
  const getActiveHandlingExtraPrice = (): number => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.handlingExtraPrice;
    }
    return handlingExtraPrice;
  };
  
  const setActiveHandlingExtraPrice = (price: number) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('handlingExtraPrice', price);
    } else {
      setHandlingExtraPrice(price);
    }
  };
  
  // Incremento Difficoltà getter/setter (supporta phases/a_corpo mode)
  const getActiveDifficultyEnabled = (): boolean => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.difficultyEnabled;
    }
    return difficultyEnabled;
  };
  
  const setActiveDifficultyEnabled = (enabled: boolean) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('difficultyEnabled', enabled);
    } else {
      setDifficultyEnabled(enabled);
    }
  };
  
  const getActiveDifficultyItems = (): DifficultyItem[] => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.difficultyItems || [];
    }
    return difficultyItems;
  };
  
  const setActiveDifficultyItems = (items: DifficultyItem[]) => {
    if (isPhaseLikeMode) {
      updateCurrentFase('difficultyItems', items);
    } else {
      setDifficultyItems(items);
    }
  };
  
  const getActiveDurationMonths = (): number => {
    if (isPhaseLikeMode && currentFase) {
      return currentFase.durationMonths;
    }
    return durationMonths;
  };

  // Form state - Step 3
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [phasesPreviewResult, setPhasesPreviewResult] = useState<PhasesPreviewResult | null>(null);
  // Map: "phase:itemIndex" -> discount percent
  const [itemDiscounts, setItemDiscounts] = useState<Map<string, number>>(new Map());
  // Map: "phase:itemIndex" -> amount override (null = usa valore originale)
  const [itemAmountOverrides, setItemAmountOverrides] = useState<Map<string, number | null>>(new Map());
  // Map: "phase:itemIndex" -> unit price override (null = usa valore listino)
  const [unitPriceOverrides, setUnitPriceOverrides] = useState<Map<string, number | null>>(new Map());
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState(0);
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState(0);
  // Sconti movimentazione separati (totale)
  const [movMountDiscount, setMovMountDiscount] = useState(0);
  const [movDismountDiscount, setMovDismountDiscount] = useState(0);
  // Override per singole zone movimentazione: "zoneIdx:mount|dismount" -> amount override
  const [handlingZoneOverrides, setHandlingZoneOverrides] = useState<Map<string, number | null>>(new Map());
  // Sconti per singole zone movimentazione: "zoneIdx:mount|dismount" -> discount percent
  const [handlingZoneDiscounts, setHandlingZoneDiscounts] = useState<Map<string, number>>(new Map());

  // Sconti e override per modalità FASI: "faseIndex:phase:itemIndex" -> values
  // Es: "0:MONTAGGIO:1" per il secondo item di montaggio della prima fase
  const [phaseItemDiscounts, setPhaseItemDiscounts] = useState<Map<string, number>>(new Map());
  const [phaseItemAmountOverrides, setPhaseItemAmountOverrides] = useState<Map<string, number | null>>(new Map());
  const [phaseUnitPriceOverrides, setPhaseUnitPriceOverrides] = useState<Map<string, number | null>>(new Map());
  
  // Override IVA per singole righe: "phase:itemIndex" -> VatRate (null = usa default)
  // Per modalità normale (rental/labor_only)
  const [itemVatOverrides, setItemVatOverrides] = useState<Map<string, VatRate>>(new Map());
  // Per modalità fasi: "faseIndex:phase:itemIndex" -> VatRate
  const [phaseItemVatOverrides, setPhaseItemVatOverrides] = useState<Map<string, VatRate>>(new Map());
  // Override e sconti per movimentazione fasi: "faseIndex:mount|dismount:zoneIdx" -> values
  const [phaseHandlingZoneOverrides, setPhaseHandlingZoneOverrides] = useState<Map<string, number | null>>(new Map());
  const [phaseHandlingZoneDiscounts, setPhaseHandlingZoneDiscounts] = useState<Map<string, number>>(new Map());
  const [phaseHandlingMountGlobalDiscount, setPhaseHandlingMountGlobalDiscount] = useState<Map<number, number>>(new Map());
  const [phaseHandlingDismountGlobalDiscount, setPhaseHandlingDismountGlobalDiscount] = useState<Map<number, number>>(new Map());
  // Sconto globale per tutte le fasi (percentuale)
  const [phasesGlobalDiscountPercent, setPhasesGlobalDiscountPercent] = useState(0);
  // Extra sconto fisso in €
  const [extraDiscountAmount, setExtraDiscountAmount] = useState(0);
  const [extraDiscountNote, setExtraDiscountNote] = useState("");

  // Promozioni auto-applicate (Step 5)
  const [appliedPromos, setAppliedPromos] = useState<AppliedPromo[]>([]);
  // pendingPromos: fresh promo data to apply (set after refetch completes)
  const [pendingPromos, setPendingPromos] = useState<Array<{
    id: string; code: string; description: string | null;
    discountPercent: string; articleCodes: string[];
  }> | null>(null);
  // Track which keys+amounts (effective delta after clamping) were added by promos
  const [promoAddedKeys, setPromoAddedKeys] = useState<Map<string, number>>(new Map());
  const [promoAddedPhaseKeys, setPromoAddedPhaseKeys] = useState<Map<string, number>>(new Map());

  // Dettagli tecnici - Trasporti (Step 3)
  const [transpallet, setTranspallet] = useState<string>("");
  const [posizCamion, setPosizCamion] = useState<string>("");
  const [puoScaricare, setPuoScaricare] = useState<string>("");
  const [luogoScarico, setLuogoScarico] = useState<string[]>([]);
  const [ritiroEsubero, setRitiroEsubero] = useState<boolean>(false);
  const [cartelliStradali, setCartelliStradali] = useState<string>("");
  const [permessiViabilita, setPermessiViabilita] = useState<string>("");
  const [permessoSosta, setPermessoSosta] = useState<string>("");

  // Dettagli tecnici - Optional Ponteggio (Step 3)
  const [ponteggioPerArray, setPonteggioPerArray] = useState<string[]>([]);
  const [gruCantiere, setGruCantiere] = useState<string>("");

  const [luciSegnalazione, setLuciSegnalazione] = useState<string>("");
  const [aCaricoClienteArray, setACaricoClienteArray] = useState<string[]>([]);
  const [orariLavoro, setOrariLavoro] = useState<string>("");
  const [ancoraggi, setAncoraggi] = useState<string>("");
  const [ponteggioPerAltroNote, setPonteggioPerAltroNote] = useState<string>("");
  const [aCaricoClienteAltroNote, setACaricoClienteAltroNote] = useState<string>("");
  const [ancoraggiAltroNote, setAncoraggiAltroNote] = useState<string>("");
  const [maestranze, setMaestranze] = useState<string>("");
  const [montacarichiTipoSbarchi, setMontacarichiTipoSbarchi] = useState<string>("");
  const [montacarichiRuote, setMontacarichiRuote] = useState<string>("");
  const [montacarichiTraliccio, setMontacarichiTraliccio] = useState<string>("");
  const [montacarichiTerzaSponda, setMontacarichiTerzaSponda] = useState<string>("");
  const [montacarichiAltro, setMontacarichiAltro] = useState<string>("");

  // Form state - Step 4: Clausole e Note
  // Stato clausole: { clauseId: { selected: boolean, text: string } }
  const [clauseSelections, setClauseSelections] = useState<Record<string, { selected: boolean; text: string }>>({});
  const [userModifiedClauses, setUserModifiedClauses] = useState<Set<string>>(new Set());
  const [validitaOfferta, setValiditaOfferta] = useState<number>(20);
  const [campoLiberoInstallazione, setCampoLiberoInstallazione] = useState<string>("");
  const [campoLiberoServizi, setCampoLiberoServizi] = useState<string>("");
  const [campoLiberoClausole, setCampoLiberoClausole] = useState<string>("");
  
  // Stato servizi opzionali - Step 4
  const [optionalServices, setOptionalServices] = useState<Record<string, boolean>>({});
  const [optionalServicesTexts, setOptionalServicesTexts] = useState<Record<string, string>>({});
  
  const [customQuoteNumber, setCustomQuoteNumber] = useState<string>("");

  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const draftRestoredRef = useRef(false);
  const DRAFT_KEY = `quote_draft_${opportunityId}`;

  const buildDraftSnapshot = useCallback(() => {
    return {
      savedAt: Date.now(),
      currentStep,
      quoteMode,
      durationMonths,
      vatRateDefault,
      checklistItems: Array.from(checklistItems.entries()),
      fasi,
      currentFaseIndex,
      aCorpoItems,
      extraChecklistItems,
      distanceKm,
      squadraInZonaEnabled,
      squadraInZonaKm,
      transportItems,
      serviceItems: Array.from(serviceItems.entries()),
      posManualEnabled,
      posManualPrice,
      ritiroEsuberoEnabled,
      handlingEnabled,
      handlingZones,
      saltaretiEnabled,
      saltaretiQuantity,
      handlingExtraPrice,
      difficultyEnabled,
      difficultyItems,
      manualMontaggioRows,
      manualSmontaggioRows,
      manualNoleggioRows,
      phasesManualRows: Array.from(phasesManualRows.entries()),
      deletedItems: Array.from(deletedItems),
      deletedPhaseItems: Array.from(deletedPhaseItems),
      clauseSelections,
      campoLiberoInstallazione,
      campoLiberoServizi,
      campoLiberoClausole,
      validitaOfferta,
      optionalServices,
      optionalServicesTexts,
      customQuoteNumber,
      transpallet,
      posizCamion,
      puoScaricare,
      luogoScarico,
      ritiroEsubero,
      cartelliStradali,
      permessiViabilita,
      permessoSosta,
      ponteggioPerArray,
      ponteggioPerAltroNote,
      gruCantiere,
      luciSegnalazione,
      aCaricoClienteArray,
      aCaricoClienteAltroNote,
      orariLavoro,
      ancoraggi,
      ancoraggiAltroNote,
      maestranze,
      montacarichiTipoSbarchi,
      montacarichiRuote,
      montacarichiTraliccio,
      montacarichiTerzaSponda,
      montacarichiAltro,
      extraDiscountAmount,
      extraDiscountNote,
      globalDiscountPercent,
      movMountDiscount,
      movDismountDiscount,
      itemDiscounts: Array.from(itemDiscounts.entries()),
      itemAmountOverrides: Array.from(itemAmountOverrides.entries()),
      unitPriceOverrides: Array.from(unitPriceOverrides.entries()),
      itemVatOverrides: Array.from(itemVatOverrides.entries()),
      phaseItemDiscounts: Array.from(phaseItemDiscounts.entries()),
      phaseItemAmountOverrides: Array.from(phaseItemAmountOverrides.entries()),
      phaseUnitPriceOverrides: Array.from(phaseUnitPriceOverrides.entries()),
      phaseItemVatOverrides: Array.from(phaseItemVatOverrides.entries()),
      phasesGlobalDiscountPercent,
      phaseHandlingZoneOverrides: Array.from(phaseHandlingZoneOverrides.entries()),
      phaseHandlingZoneDiscounts: Array.from(phaseHandlingZoneDiscounts.entries()),
      phaseHandlingMountGlobalDiscount: Array.from(phaseHandlingMountGlobalDiscount.entries()),
      phaseHandlingDismountGlobalDiscount: Array.from(phaseHandlingDismountGlobalDiscount.entries()),
      handlingZoneOverrides: Array.from(handlingZoneOverrides.entries()),
      handlingZoneDiscounts: Array.from(handlingZoneDiscounts.entries()),
      lagunariAmountOverrides: Array.from(lagunariAmountOverrides.entries()),
      lagunariDiscounts: Array.from(lagunariDiscounts.entries()),
      lagunariVatOverrides: Array.from(lagunariVatOverrides.entries()),
      deletedLagunariItems: Array.from(deletedLagunariItems),
    };
  }, [currentStep, quoteMode, durationMonths, vatRateDefault, checklistItems, fasi, currentFaseIndex,
    aCorpoItems, extraChecklistItems, distanceKm, squadraInZonaEnabled, squadraInZonaKm, transportItems,
    serviceItems, posManualEnabled, posManualPrice, ritiroEsuberoEnabled, handlingEnabled, handlingZones,
    saltaretiEnabled, saltaretiQuantity, handlingExtraPrice, difficultyEnabled, difficultyItems,
    manualMontaggioRows, manualSmontaggioRows, manualNoleggioRows, phasesManualRows, deletedItems,
    deletedPhaseItems, clauseSelections, campoLiberoInstallazione, campoLiberoServizi, campoLiberoClausole, validitaOfferta, optionalServices,
    optionalServicesTexts, customQuoteNumber, transpallet, posizCamion, puoScaricare, luogoScarico,
    ritiroEsubero, cartelliStradali, permessiViabilita, permessoSosta, ponteggioPerArray, ponteggioPerAltroNote, gruCantiere,
    luciSegnalazione, aCaricoClienteArray, aCaricoClienteAltroNote, orariLavoro, ancoraggi, ancoraggiAltroNote, maestranze, montacarichiTipoSbarchi,
    montacarichiRuote, montacarichiTraliccio, montacarichiTerzaSponda, montacarichiAltro,
    extraDiscountAmount, extraDiscountNote, globalDiscountPercent, movMountDiscount, movDismountDiscount,
    itemDiscounts, itemAmountOverrides, unitPriceOverrides, itemVatOverrides,
    phaseItemDiscounts, phaseItemAmountOverrides, phaseUnitPriceOverrides, phaseItemVatOverrides,
    phasesGlobalDiscountPercent, phaseHandlingZoneOverrides, phaseHandlingZoneDiscounts,
    phaseHandlingMountGlobalDiscount, phaseHandlingDismountGlobalDiscount,
    handlingZoneOverrides, handlingZoneDiscounts,
    lagunariAmountOverrides, lagunariDiscounts, lagunariVatOverrides, deletedLagunariItems]);

  const restoreDraftSnapshot = useCallback((draft: any) => {
    if (draft.currentStep) setCurrentStep(draft.currentStep);
    if (draft.quoteMode) setQuoteMode(draft.quoteMode);
    if (draft.durationMonths !== undefined) setDurationMonths(draft.durationMonths);
    if (draft.vatRateDefault) setVatRateDefault(draft.vatRateDefault);
    if (draft.checklistItems) setChecklistItems(new Map(draft.checklistItems));
    if (draft.fasi) setFasi(draft.fasi.map((f: any) => ({ ...f, magazzinoItems: f.magazzinoItems || [] })));
    if (draft.currentFaseIndex !== undefined) setCurrentFaseIndex(draft.currentFaseIndex);
    if (draft.aCorpoItems) setACorpoItems(draft.aCorpoItems);
    if (draft.extraChecklistItems) setExtraChecklistItems(draft.extraChecklistItems);
    if (draft.distanceKm !== undefined) setDistanceKm(draft.distanceKm);
    if (draft.squadraInZonaEnabled !== undefined) setSquadraInZonaEnabled(draft.squadraInZonaEnabled);
    if (draft.squadraInZonaKm !== undefined) setSquadraInZonaKm(draft.squadraInZonaKm);
    if (draft.transportItems) setTransportItems(draft.transportItems);
    if (draft.serviceItems) setServiceItems(new Map(draft.serviceItems));
    if (draft.posManualEnabled !== undefined) setPosManualEnabled(draft.posManualEnabled);
    if (draft.posManualPrice !== undefined) setPosManualPrice(draft.posManualPrice);
    if (draft.ritiroEsuberoEnabled !== undefined) setRitiroEsuberoEnabled(draft.ritiroEsuberoEnabled);
    if (draft.handlingEnabled !== undefined) setHandlingEnabled(draft.handlingEnabled);
    if (draft.handlingZones) setHandlingZones(draft.handlingZones);
    if (draft.saltaretiEnabled !== undefined) setSaltaretiEnabled(draft.saltaretiEnabled);
    if (draft.saltaretiQuantity !== undefined) setSaltaretiQuantity(draft.saltaretiQuantity);
    if (draft.handlingExtraPrice !== undefined) setHandlingExtraPrice(draft.handlingExtraPrice);
    if (draft.difficultyEnabled !== undefined) setDifficultyEnabled(draft.difficultyEnabled);
    if (draft.difficultyItems) setDifficultyItems(draft.difficultyItems);
    if (draft.manualMontaggioRows) setManualMontaggioRows(draft.manualMontaggioRows);
    if (draft.manualSmontaggioRows) setManualSmontaggioRows(draft.manualSmontaggioRows);
    if (draft.manualNoleggioRows) setManualNoleggioRows(draft.manualNoleggioRows);
    if (draft.phasesManualRows) setPhasesManualRows(new Map(draft.phasesManualRows));
    if (draft.deletedItems) setDeletedItems(new Set(draft.deletedItems));
    if (draft.deletedPhaseItems) setDeletedPhaseItems(new Set(draft.deletedPhaseItems));
    if (draft.clauseSelections) setClauseSelections(draft.clauseSelections);
    if (draft.campoLiberoInstallazione !== undefined) setCampoLiberoInstallazione(draft.campoLiberoInstallazione);
    if (draft.campoLiberoServizi !== undefined) setCampoLiberoServizi(draft.campoLiberoServizi);
    if (draft.campoLiberoClausole !== undefined) setCampoLiberoClausole(draft.campoLiberoClausole);
    if (draft.validitaOfferta !== undefined) setValiditaOfferta(draft.validitaOfferta);
    if (draft.optionalServices) setOptionalServices(draft.optionalServices);
    if (draft.optionalServicesTexts) setOptionalServicesTexts(draft.optionalServicesTexts);
    if (draft.customQuoteNumber !== undefined) setCustomQuoteNumber(draft.customQuoteNumber);
    if (draft.transpallet !== undefined) setTranspallet(draft.transpallet);
    if (draft.posizCamion !== undefined) setPosizCamion(draft.posizCamion);
    if (draft.puoScaricare !== undefined) setPuoScaricare(draft.puoScaricare);
    if (draft.luogoScarico) setLuogoScarico(draft.luogoScarico);
    if (draft.ritiroEsubero !== undefined) setRitiroEsubero(draft.ritiroEsubero);
    if (draft.cartelliStradali !== undefined) setCartelliStradali(draft.cartelliStradali);
    if (draft.permessiViabilita !== undefined) setPermessiViabilita(draft.permessiViabilita);
    if (draft.permessoSosta !== undefined) setPermessoSosta(draft.permessoSosta);
    if (draft.ponteggioPerArray) setPonteggioPerArray(draft.ponteggioPerArray);
    if (draft.ponteggioPerAltroNote !== undefined) setPonteggioPerAltroNote(draft.ponteggioPerAltroNote);
    if (draft.gruCantiere !== undefined) setGruCantiere(draft.gruCantiere);
    if (draft.luciSegnalazione !== undefined) setLuciSegnalazione(draft.luciSegnalazione);
    if (draft.aCaricoClienteArray) setACaricoClienteArray(draft.aCaricoClienteArray);
    if (draft.aCaricoClienteAltroNote !== undefined) setACaricoClienteAltroNote(draft.aCaricoClienteAltroNote);
    if (draft.orariLavoro !== undefined) setOrariLavoro(draft.orariLavoro);
    if (draft.ancoraggi !== undefined) setAncoraggi(draft.ancoraggi);
    if (draft.ancoraggiAltroNote !== undefined) setAncoraggiAltroNote(draft.ancoraggiAltroNote);
    if (draft.maestranze !== undefined) setMaestranze(draft.maestranze);
    if (draft.montacarichiTipoSbarchi !== undefined) setMontacarichiTipoSbarchi(draft.montacarichiTipoSbarchi);
    if (draft.montacarichiRuote !== undefined) setMontacarichiRuote(draft.montacarichiRuote);
    if (draft.montacarichiTraliccio !== undefined) setMontacarichiTraliccio(draft.montacarichiTraliccio);
    if (draft.montacarichiTerzaSponda !== undefined) setMontacarichiTerzaSponda(draft.montacarichiTerzaSponda);
    if (draft.montacarichiAltro !== undefined) setMontacarichiAltro(draft.montacarichiAltro);
    if (draft.extraDiscountAmount !== undefined) setExtraDiscountAmount(draft.extraDiscountAmount);
    if (draft.extraDiscountNote !== undefined) setExtraDiscountNote(draft.extraDiscountNote);
    if (draft.globalDiscountPercent !== undefined) setGlobalDiscountPercent(draft.globalDiscountPercent);
    if (draft.movMountDiscount !== undefined) setMovMountDiscount(draft.movMountDiscount);
    if (draft.movDismountDiscount !== undefined) setMovDismountDiscount(draft.movDismountDiscount);
    if (draft.itemDiscounts) setItemDiscounts(new Map(draft.itemDiscounts));
    if (draft.itemAmountOverrides) setItemAmountOverrides(new Map(draft.itemAmountOverrides));
    if (draft.unitPriceOverrides) setUnitPriceOverrides(new Map(draft.unitPriceOverrides));
    if (draft.itemVatOverrides) setItemVatOverrides(new Map(draft.itemVatOverrides));
    if (draft.phaseItemDiscounts) setPhaseItemDiscounts(new Map(draft.phaseItemDiscounts));
    if (draft.phaseItemAmountOverrides) setPhaseItemAmountOverrides(new Map(draft.phaseItemAmountOverrides));
    if (draft.phaseUnitPriceOverrides) setPhaseUnitPriceOverrides(new Map(draft.phaseUnitPriceOverrides));
    if (draft.phaseItemVatOverrides) setPhaseItemVatOverrides(new Map(draft.phaseItemVatOverrides));
    if (draft.phasesGlobalDiscountPercent !== undefined) setPhasesGlobalDiscountPercent(draft.phasesGlobalDiscountPercent);
    if (draft.phaseHandlingZoneOverrides) setPhaseHandlingZoneOverrides(new Map(draft.phaseHandlingZoneOverrides));
    if (draft.phaseHandlingZoneDiscounts) setPhaseHandlingZoneDiscounts(new Map(draft.phaseHandlingZoneDiscounts));
    if (draft.phaseHandlingMountGlobalDiscount) setPhaseHandlingMountGlobalDiscount(new Map(draft.phaseHandlingMountGlobalDiscount));
    if (draft.phaseHandlingDismountGlobalDiscount) setPhaseHandlingDismountGlobalDiscount(new Map(draft.phaseHandlingDismountGlobalDiscount));
    if (draft.handlingZoneOverrides) setHandlingZoneOverrides(new Map(draft.handlingZoneOverrides));
    if (draft.handlingZoneDiscounts) setHandlingZoneDiscounts(new Map(draft.handlingZoneDiscounts));
    if (draft.lagunariAmountOverrides) setLagunariAmountOverrides(new Map(draft.lagunariAmountOverrides));
    if (draft.lagunariDiscounts) setLagunariDiscounts(new Map(draft.lagunariDiscounts));
    if (draft.lagunariVatOverrides) setLagunariVatOverrides(new Map(draft.lagunariVatOverrides));
    if (draft.deletedLagunariItems) setDeletedLagunariItems(new Set(draft.deletedLagunariItems));
    draftRestoredRef.current = true;
  }, []);

  useEffect(() => {
    if (isEditMode || draftRestoredRef.current) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        const ageHours = (Date.now() - (draft.savedAt || 0)) / (1000 * 60 * 60);
        if (ageHours < 72) {
          setShowDraftDialog(true);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch { /* ignore */ }
  }, [isEditMode, DRAFT_KEY]);

  useEffect(() => {
    if (isEditMode) return;
    if (currentStep <= 1 && !draftRestoredRef.current) return;
    const interval = setInterval(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraftSnapshot()));
      } catch { /* quota exceeded */ }
    }, 120000);
    return () => clearInterval(interval);
  }, [isEditMode, DRAFT_KEY, buildDraftSnapshot, currentStep]);

  useEffect(() => {
    if (isEditMode) return;
    if (currentStep <= 1 && !draftRestoredRef.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraftSnapshot()));
    } catch { /* quota exceeded */ }
  }, [currentStep]);

  const updateOptionalServiceText = (serviceId: string, text: string) => {
    setOptionalServicesTexts(prev => ({
      ...prev,
      [serviceId]: text
    }));
  };
  
  // Stato per editing inline delle clausole/servizi
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Fetch opportunity
  const { data: opportunity, isLoading: opportunityLoading } = useQuery<Opportunity>({
    queryKey: ["/api/opportunities", opportunityId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/opportunities/${opportunityId}`);
      if (!res.ok) throw new Error("Opportunità non trovata");
      return res.json();
    },
    enabled: !!opportunityId,
  });

  // Fetch lead
  const { data: lead } = useQuery<Lead>({
    queryKey: ["/api/leads", opportunity?.leadId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/${opportunity?.leadId}`);
      if (!res.ok) throw new Error("Contatto non trovato");
      return res.json();
    },
    enabled: !!opportunity?.leadId,
  });

  const { data: referents } = useQuery<any[]>({
    queryKey: ["/api/leads", opportunity?.leadId, "referents"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leads/${opportunity?.leadId}/referents`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!opportunity?.leadId,
  });

  const contactReferent = useMemo(() => {
    if (lead?.entityType === "PRIVATE") {
      return { firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone };
    }
    if (!opportunity?.referentId || !referents) return null;
    return referents.find((r: any) => r.id === opportunity.referentId) || null;
  }, [opportunity?.referentId, referents, lead]);

  // Fetch articles
  const { data: articles = [], isLoading: articlesLoading } = useQuery<Article[]>({
    queryKey: ["/api/articles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/articles");
      if (!res.ok) throw new Error("Errore nel caricamento articoli");
      return res.json();
    },
  });

  // Fetch clause overrides (testi personalizzati clausole Step 4)
  const { data: clauseOverridesData = [] } = useQuery<{ id: string; clauseId: string; text: string }[]>({
    queryKey: ["/api/clauses"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/clauses");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const clauseOverrideMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const o of clauseOverridesData) {
      if (o.text) map[o.clauseId] = o.text;
    }
    return map;
  }, [clauseOverridesData]);

  // Fetch company
  const { data: company } = useQuery({
    queryKey: ["/api/company"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/company");
      if (!res.ok) throw new Error("Errore nel caricamento azienda");
      return res.json();
    },
  });

  // Fetch billing profile basato su workType dell'opportunità
  const workType = opportunity?.workType || "PRIVATE";
  const { data: billingProfile } = useQuery({
    queryKey: ["/api/billing-profiles/by-type", workType],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/billing-profiles/by-type/${workType}`);
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: !!opportunity,
  });

  // Fetch payment methods per risolvere il nome della modalità di pagamento
  const { data: paymentMethods = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-methods"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/payment-methods");
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
  });

  // Fetch assignable users per trovare il proprietario dell'opportunità
  const { data: assignableUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users/assignable"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/assignable");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Trova l'utente proprietario dell'opportunità (assignedToUserId)
  const opportunityOwner = useMemo(() => {
    if (!opportunity?.assignedToUserId || !assignableUsers.length) return null;
    return assignableUsers.find(u => u.id === opportunity.assignedToUserId) || null;
  }, [opportunity?.assignedToUserId, assignableUsers]);

  const paymentMethodName = useMemo(() => {
    if (!paymentMethods.length) return null;
    const pmId = lead?.paymentMethodId;
    if (!pmId) return null;
    const pm = paymentMethods.find((p: any) => p.id === pmId);
    return pm?.name || null;
  }, [lead?.paymentMethodId, paymentMethods]);

  const { data: nextQuoteNumber } = useQuery({
    queryKey: ["/api/quotes/next-number"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/quotes/next-number");
      if (!res.ok) throw new Error("Errore numero preventivo");
      const data = await res.json();
      return data.number as string;
    },
    enabled: !isEditMode,
  });

  const { data: editQuoteData } = useQuery({
    queryKey: ["/api/quotes", editQuoteId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/quotes/${editQuoteId}`);
      if (!res.ok) throw new Error("Preventivo non trovato");
      return res.json();
    },
    enabled: isEditMode && !!editQuoteId,
  });

  useEffect(() => {
    if (!isEditMode || !editQuoteData || editDataLoaded || !articles.length) return;

    if (!editQuoteData.pdfData) {
      toast({
        title: "Modifica non disponibile",
        description: "Questo preventivo è stato creato prima dell'aggiornamento. Non è possibile modificarlo.",
        variant: "destructive",
      });
      setEditDataLoaded(true);
      navigate(`/opportunita`);
      return;
    }

    const gp = editQuoteData.globalParams;
    if (gp) {
      if (gp.durationMonths !== undefined) setDurationMonths(gp.durationMonths);
      if (gp.distanceKm !== undefined) setDistanceKm(gp.distanceKm);
      if (gp.posManualEnabled) {
        setPosManualEnabled(true);
        if (gp.posManualPrice) setPosManualPrice(gp.posManualPrice);
      }
      if (gp.optionalServices && Array.isArray(gp.optionalServices)) {
        const svcMap: Record<string, boolean> = {};
        gp.optionalServices.forEach((s: string) => { svcMap[s] = true; });
        setOptionalServices(svcMap);
      }
      if (gp.optionalServicesTexts) {
        setOptionalServicesTexts(gp.optionalServicesTexts);
      }
      if (gp.squadraInZonaEnabled) {
        setSquadraInZonaEnabled(true);
        if (gp.squadraInZonaKm) setSquadraInZonaKm(gp.squadraInZonaKm);
      }
      if (gp.lagunariBarcaVariantIndex !== undefined) setLagunariBarcaVariantIndex(gp.lagunariBarcaVariantIndex);
      if (gp.lagunariNumeroBarca !== undefined) setLagunariNumeroBarca(gp.lagunariNumeroBarca);
    }

    if (editQuoteData.pdfData?.quote) {
      const pd = editQuoteData.pdfData.quote;

      if (pd.checklistItems && Array.isArray(pd.checklistItems)) {
        const restoredChecklist = new Map<string, ChecklistItemState>(pd.checklistItems);
        setChecklistItems(restoredChecklist);
      }

      if (pd.extraChecklistItems && Array.isArray(pd.extraChecklistItems)) {
        const restored: ExtraChecklistItem[] = pd.extraChecklistItems.map((item: any, idx: number) => ({
          id: item.id || `extra-edit-${idx}`,
          articleId: item.articleId || "",
          quantity: item.quantity || 1,
          variantIndex: item.variantIndex,
          installationIndex: item.installationIndex,
          notes: item.notes || "",
          useCesta: item.useCesta,
          hoistAltezzaMetri: item.hoistAltezzaMetri,
          hoistNumSbarchi: item.hoistNumSbarchi,
          hoistSbalzoMq: item.hoistSbalzoMq,
        }));
        setExtraChecklistItems(restored);
      }

      if (pd.serviceItems && Array.isArray(pd.serviceItems)) {
        const restoredServices = new Map<string, { enabled: boolean; quantity: number; optionIndex?: number }>(pd.serviceItems);
        setServiceItems(restoredServices);
      }

      if (pd.transportItems && Array.isArray(pd.transportItems)) {
        setTransportItems(pd.transportItems);
      }



      if (pd.discounts && Array.isArray(pd.discounts)) {
        const restoredDiscounts = new Map<string, number>(pd.discounts);
        setItemDiscounts(restoredDiscounts);
      }

      if (pd.globalDiscount !== undefined) setGlobalDiscountPercent(pd.globalDiscount);
      if (pd.movMountDiscount !== undefined) setMovMountDiscount(pd.movMountDiscount);
      if (pd.movDismountDiscount !== undefined) setMovDismountDiscount(pd.movDismountDiscount);
      if (pd.vatRateDefault) setVatRateDefault(pd.vatRateDefault);
      if (pd.handlingEnabled) setHandlingEnabled(true);
      if (pd.handlingZones && Array.isArray(pd.handlingZones)) setHandlingZones(pd.handlingZones);
      if (pd.saltaretiEnabled) setSaltaretiEnabled(true);
      if (pd.saltaretiQuantity) setSaltaretiQuantity(pd.saltaretiQuantity);
      if (pd.handlingExtraPrice) setHandlingExtraPrice(pd.handlingExtraPrice);
      if (pd.difficultyEnabled) setDifficultyEnabled(true);
      if (pd.difficultyItems && Array.isArray(pd.difficultyItems)) setDifficultyItems(pd.difficultyItems);
      if (pd.ritiroEsuberoEnabled) setRitiroEsuberoEnabled(true);
      if (pd.squadraInZonaEnabled) {
        setSquadraInZonaEnabled(true);
        if (pd.squadraInZonaKm) setSquadraInZonaKm(pd.squadraInZonaKm);
      }

      if (pd.itemVatOverrides && Array.isArray(pd.itemVatOverrides)) {
        setItemVatOverrides(new Map<string, VatRate>(pd.itemVatOverrides));
      }
      if (pd.extraDiscountAmount !== undefined) setExtraDiscountAmount(pd.extraDiscountAmount);
      if (pd.extraDiscountNote !== undefined) setExtraDiscountNote(pd.extraDiscountNote);

      let detectedMode: 'rental' | 'labor_only' | 'phases' | 'a_corpo' = 'rental';
      if (pd.quoteMode) {
        detectedMode = pd.quoteMode;
      } else if (pd.totals?.phasesMode === true) {
        detectedMode = 'phases';
      } else if (gp && gp.durationMonths === 0) {
        detectedMode = 'labor_only';
      }
      setQuoteMode(detectedMode);

      if (detectedMode === 'phases' || detectedMode === 'a_corpo') {
        if (pd.fasiConfig && Array.isArray(pd.fasiConfig)) {
          setFasi(pd.fasiConfig.map((f: any) => ({
            ...f,
            magazzinoItems: f.magazzinoItems || [],
          })));
          setCurrentFaseIndex(0);
        } else if (pd.totals?.fasiData && Array.isArray(pd.totals.fasiData)) {
          const sectionTypeToModule: Record<string, FaseModuleType> = {
            'TRASPORTO_ANDATA': 'trasporto',
            'TRASPORTO_RITORNO': 'trasporto',
            'MONTAGGIO': 'montaggio',
            'MOVIMENTAZIONE_MAGAZZINO': 'magazzino',
            'SMONTAGGIO': 'smontaggio',
            'NOLEGGIO': 'noleggio',
            'FORNITURA': 'fornitura',
          };
          const reconstructed: QuoteFaseData[] = pd.totals.fasiData.map((fd: any, idx: number) => {
            const modules = new Set<FaseModuleType>();
            const montaggioItems: ExtraChecklistItem[] = [];
            const smontaggioItems: ExtraChecklistItem[] = [];
            const noleggioItems: ExtraChecklistItem[] = [];
            const fornituraItems: ExtraChecklistItem[] = [];
            const magazzinoItems: ExtraChecklistItem[] = [];
            const transportItemsList: Array<{ articleId: string; vehicleIndex: number; quantity: number; andataEnabled: boolean; ritornoEnabled: boolean; note?: string }> = [];

            (fd.sections || []).forEach((section: any) => {
              const mod = sectionTypeToModule[section.type];
              if (mod) modules.add(mod);

              if (section.type === 'TRASPORTO_ANDATA') {
                (section.items || []).forEach((item: any) => {
                  if (!item.isManualRow) {
                    transportItemsList.push({
                      articleId: item.articleId || "",
                      vehicleIndex: item.vehicleIndex ?? 0,
                      quantity: item.quantity || 1,
                      andataEnabled: true,
                      ritornoEnabled: true,
                    });
                  }
                });
              }

              const buildExtraItem = (item: any, i: number): ExtraChecklistItem => ({
                id: `restore-${idx}-${section.type}-${i}`,
                articleId: item.articleId || "",
                quantity: item.quantity || 1,
                variantIndex: item.variantIndex,
                installationIndex: item.installationIndex,
                notes: item.notes || "",
                useCesta: item.useCesta,
                hoistAltezzaMetri: item.hoistAltezzaMetri,
                hoistNumSbarchi: item.hoistNumSbarchi,
                hoistSbalzoMq: item.hoistSbalzoMq,
              });

              if (section.type === 'MONTAGGIO') {
                (section.items || []).filter((it: any) => !it.isManualRow).forEach((item: any, i: number) => {
                  montaggioItems.push(buildExtraItem(item, i));
                });
              } else if (section.type === 'SMONTAGGIO') {
                (section.items || []).filter((it: any) => !it.isManualRow).forEach((item: any, i: number) => {
                  smontaggioItems.push(buildExtraItem(item, i));
                });
              } else if (section.type === 'NOLEGGIO') {
                (section.items || []).filter((it: any) => !it.isManualRow).forEach((item: any, i: number) => {
                  noleggioItems.push(buildExtraItem(item, i));
                });
              } else if (section.type === 'FORNITURA') {
                (section.items || []).filter((it: any) => !it.isManualRow).forEach((item: any, i: number) => {
                  fornituraItems.push(buildExtraItem(item, i));
                });
              } else if (section.type === 'MOVIMENTAZIONE_MAGAZZINO') {
                (section.items || []).filter((it: any) => !it.isManualRow).forEach((item: any, i: number) => {
                  magazzinoItems.push({
                    id: `restore-${idx}-${section.type}-${i}`,
                    articleId: item.articleId || '',
                    quantity: item.quantity || 1,
                    notes: item.notes || item.articleName || '',
                    manualUnitPrice: item.unitPrice || 0,
                  });
                });
              }
            });

            if (fd.faseDuration && fd.faseDuration !== 1) modules.add('durata');

            return {
              id: `fase-restore-${Date.now()}-${idx}`,
              customLabel: '',
              enabledModules: Array.from(modules),
              durationMonths: fd.faseDuration || 1,
              transportItems: transportItemsList,
              montaggioItems,
              smontaggioItems,
              noleggioItems,
              fornituraItems,
              magazzinoItems,
              aCorpoItems: [],
              handlingEnabled: (fd.handlingMountAfterDiscount || 0) > 0 || (fd.handlingDismountAfterDiscount || 0) > 0,
              handlingZones: [],
              saltaretiEnabled: false,
              saltaretiQuantity: 0,
              handlingExtraPrice: 0,
              difficultyEnabled: false,
              difficultyItems: [],
              distanceKm: gp?.distanceKm || 0,
              squadraInZonaEnabled: false,
              squadraInZonaKm: 0,
            } as QuoteFaseData;
          });
          if (reconstructed.length > 0) {
            setFasi(reconstructed);
            setCurrentFaseIndex(0);
          }
        }
      }

      if (pd.phasesManualRows && Array.isArray(pd.phasesManualRows)) {
        setPhasesManualRows(new Map(pd.phasesManualRows));
      }
      if (pd.phaseItemDiscounts && Array.isArray(pd.phaseItemDiscounts)) {
        setPhaseItemDiscounts(new Map<string, number>(pd.phaseItemDiscounts));
      }
      if (pd.phaseItemAmountOverrides && Array.isArray(pd.phaseItemAmountOverrides)) {
        setPhaseItemAmountOverrides(new Map<string, number | null>(pd.phaseItemAmountOverrides));
      }
      if (pd.phaseUnitPriceOverrides && Array.isArray(pd.phaseUnitPriceOverrides)) {
        setPhaseUnitPriceOverrides(new Map<string, number | null>(pd.phaseUnitPriceOverrides));
      }
      if (pd.phaseItemVatOverrides && Array.isArray(pd.phaseItemVatOverrides)) {
        setPhaseItemVatOverrides(new Map<string, VatRate>(pd.phaseItemVatOverrides));
      }
      if (pd.phaseHandlingMountGlobalDiscount && Array.isArray(pd.phaseHandlingMountGlobalDiscount)) {
        setPhaseHandlingMountGlobalDiscount(new Map<number, number>(pd.phaseHandlingMountGlobalDiscount));
      }
      if (pd.phaseHandlingDismountGlobalDiscount && Array.isArray(pd.phaseHandlingDismountGlobalDiscount)) {
        setPhaseHandlingDismountGlobalDiscount(new Map<number, number>(pd.phaseHandlingDismountGlobalDiscount));
      }
      if (pd.deletedPhaseItems && Array.isArray(pd.deletedPhaseItems)) {
        setDeletedPhaseItems(new Set<string>(pd.deletedPhaseItems));
      }

      if (pd.lagunariAmountOverrides && Array.isArray(pd.lagunariAmountOverrides)) {
        setLagunariAmountOverrides(new Map<string, number | null>(pd.lagunariAmountOverrides));
      }
      if (pd.lagunariDiscounts && Array.isArray(pd.lagunariDiscounts)) {
        setLagunariDiscounts(new Map<string, number>(pd.lagunariDiscounts));
      }
      if (pd.lagunariVatOverrides && Array.isArray(pd.lagunariVatOverrides)) {
        setLagunariVatOverrides(new Map<string, VatRate>(pd.lagunariVatOverrides));
      }
      if (pd.deletedLagunariItems && Array.isArray(pd.deletedLagunariItems)) {
        setDeletedLagunariItems(new Set<string>(pd.deletedLagunariItems));
      }
    }

    if (gp?.aCorpoItems && Array.isArray(gp.aCorpoItems)) {
      const restored = gp.aCorpoItems.map((item: any, idx: number) => ({
        id: `acorpo-edit-${idx}`,
        articleId: item.articleId || "",
        variantIndex: item.variantIndex,
        notes: item.notes || "",
        quantity: item.quantity || 1,
        totalPrice: item.totalPrice || 0,
      }));
      setACorpoItems(restored);
    }

    if (editQuoteData.discounts) {
      const d = editQuoteData.discounts;
      if (d.globalDiscountPercent) setGlobalDiscountPercent(d.globalDiscountPercent);
      if (d.itemDiscounts && Array.isArray(d.itemDiscounts)) {
        const discMap = new Map<string, number>();
        d.itemDiscounts.forEach((disc: any) => {
          discMap.set(`${disc.phase}:${disc.itemIndex}`, disc.discountPercent);
        });
        setItemDiscounts(discMap);
      }
    }

    if (editQuoteData.pdfData?.clauseSelections) {
      const cs = editQuoteData.pdfData.clauseSelections;
      if (cs.custom_note?.selected && cs.custom_note?.text) {
        setCampoLiberoInstallazione(cs.custom_note.text);
      }
      if (cs.custom_service_note?.selected && cs.custom_service_note?.text) {
        setCampoLiberoServizi(cs.custom_service_note.text);
      }
      if (cs.custom_clause_note?.selected && cs.custom_clause_note?.text) {
        setCampoLiberoClausole(cs.custom_clause_note.text);
      }
      const filtered = { ...cs };
      delete filtered.custom_note;
      delete filtered.custom_service_note;
      delete filtered.custom_clause_note;
      if (Object.keys(filtered).length > 0) {
        setClauseSelections(filtered);
        const restoredIds = new Set<string>(Object.keys(filtered));
        setUserModifiedClauses(restoredIds);
      }
    }

    if (editQuoteData.pdfData?.quote?.manualMontaggioRows) {
      setManualMontaggioRows(editQuoteData.pdfData.quote.manualMontaggioRows);
    }
    if (editQuoteData.pdfData?.quote?.manualSmontaggioRows) {
      setManualSmontaggioRows(editQuoteData.pdfData.quote.manualSmontaggioRows);
    }
    if (editQuoteData.pdfData?.quote?.manualNoleggioRows) {
      setManualNoleggioRows(editQuoteData.pdfData.quote.manualNoleggioRows);
    }
    if (editQuoteData.pdfData?.quote?.itemAmountOverrides && Array.isArray(editQuoteData.pdfData.quote.itemAmountOverrides)) {
      setItemAmountOverrides(new Map<string, number | null>(editQuoteData.pdfData.quote.itemAmountOverrides));
    }
    if (editQuoteData.pdfData?.quote?.unitPriceOverrides && Array.isArray(editQuoteData.pdfData.quote.unitPriceOverrides)) {
      setUnitPriceOverrides(new Map<string, number | null>(editQuoteData.pdfData.quote.unitPriceOverrides));
    }

    if (editQuoteData.pdfData?.quote?.opportunity) {
      const savedOpp = editQuoteData.pdfData.quote.opportunity;
      if (savedOpp.ponteggioPerArray) setPonteggioPerArray(savedOpp.ponteggioPerArray);
      if (savedOpp.ponteggioPerAltroNote) setPonteggioPerAltroNote(savedOpp.ponteggioPerAltroNote);
      if (savedOpp.aCaricoClienteArray) setACaricoClienteArray(savedOpp.aCaricoClienteArray);
      if (savedOpp.aCaricoClienteAltroNote) setACaricoClienteAltroNote(savedOpp.aCaricoClienteAltroNote);
      if (savedOpp.transpallet) setTranspallet(savedOpp.transpallet);
      if (savedOpp.posizCamion) setPosizCamion(savedOpp.posizCamion);
      if (savedOpp.puoScaricare) setPuoScaricare(savedOpp.puoScaricare);
      if (savedOpp.luogoScarico) setLuogoScarico(savedOpp.luogoScarico);
      if (savedOpp.ritiroEsubero) setRitiroEsuberoEnabled(savedOpp.ritiroEsubero);
      if (savedOpp.gruCantiere) setGruCantiere(savedOpp.gruCantiere);
      if (savedOpp.luciSegnalazione) setLuciSegnalazione(savedOpp.luciSegnalazione);
      if (savedOpp.orariLavoro) setOrariLavoro(savedOpp.orariLavoro);
      if (savedOpp.ancoraggi) setAncoraggi(savedOpp.ancoraggi);
      if (savedOpp.ancoraggiAltroNote) setAncoraggiAltroNote(savedOpp.ancoraggiAltroNote);
      if (savedOpp.maestranze) setMaestranze(savedOpp.maestranze);
      if (savedOpp.cartelliStradali) setCartelliStradali(savedOpp.cartelliStradali);
      if (savedOpp.permessiViabilita) setPermessiViabilita(savedOpp.permessiViabilita);
      if (savedOpp.permessoSosta) setPermessoSosta(savedOpp.permessoSosta);
    }

    if (editQuoteData.number) {
      setCustomQuoteNumber(editQuoteData.number);
    }

    setEditDataLoaded(true);
    toast({
      title: "Preventivo caricato",
      description: `Dati del preventivo ${editQuoteData.number} caricati per la modifica.`,
    });
  }, [isEditMode, editQuoteData, editDataLoaded, articles]);

  const [oppDistanceLoaded, setOppDistanceLoaded] = useState(false);
  useEffect(() => {
    if (oppDistanceLoaded || isEditMode || !opportunity) return;
    const oppDist = (opportunity as any).siteDistanceKm;
    const oppSquadra = (opportunity as any).siteSquadraInZonaKm;
    if (oppDist != null && oppDist > 0) {
      setDistanceKm(oppDist);
    }
    if (oppSquadra != null && oppSquadra > 0) {
      setSquadraInZonaEnabled(true);
      setSquadraInZonaKm(oppSquadra);
    }
    setOppDistanceLoaded(true);
  }, [opportunity, isEditMode, oppDistanceLoaded]);

  useEffect(() => {
    if (!isEditMode && nextQuoteNumber && !customQuoteNumber) {
      setCustomQuoteNumber(nextQuoteNumber);
    }
  }, [nextQuoteNumber, isEditMode]);

  // Categorize articles
  const transportArticles = useMemo(() => articles.filter(a => a.pricingLogic === "TRANSPORT"), [articles]);
  
  // Articoli RENTAL per noleggio e montaggio
  // In modalità 'labor_only' gli stessi articoli calcolano solo montaggio/smontaggio
  const rentalArticles = useMemo(() => 
    articles
      .filter(a => (a.pricingLogic === "RENTAL" || a.pricingLogic === "SALE") && Number(a.isChecklistItem) === 1 && a.category !== "SCAFFOLDING_LABOR")
      .sort((a, b) => (a.checklistOrder || 0) - (b.checklistOrder || 0)), 
    [articles]
  );
  
  const laborArticles = useMemo(() => 
    articles
      .filter(a => (a.pricingLogic as string) === "LABOR" && Number(a.isChecklistItem) === 1)
      .sort((a, b) => (a.checklistOrder || 0) - (b.checklistOrder || 0)), 
    [articles]
  );

  // Articoli HOIST (montacarichi) per noleggio e montaggio
  const hoistArticles = useMemo(() => 
    articles
      .filter(a => a.pricingLogic === "HOIST" && Number(a.isChecklistItem) === 1)
      .sort((a, b) => (a.checklistOrder || 0) - (b.checklistOrder || 0)), 
    [articles]
  );
  
  // Tutti gli articoli checklist per selezione (include rental + labor + hoist)
  const allChecklistArticles = useMemo(() => 
    [...rentalArticles, ...laborArticles, ...hoistArticles],
    [rentalArticles, laborArticles, hoistArticles]
  );
  const documentArticles = useMemo(() => articles.filter(a => a.pricingLogic === "DOCUMENT"), [articles]);
  const posArticle = useMemo(() => documentArticles.find(a => a.name.toLowerCase().includes("pos")), [documentArticles]);

  const dynamicServicesDef = useMemo<DynamicServiceEntry[]>(() => {
    if (articles.length === 0) return [];
    const articlesForPricing: ArticleForPricing[] = articles.map(a => ({
      id: String(a.id),
      code: a.code,
      name: a.name,
      basePrice: a.basePrice,
      unitType: a.unitType,
      pricingLogic: a.pricingLogic,
      pricingData: a.pricingData,
      installationData: a.installationData,
      variantsData: a.variantsData as any,
      isAdditionalService: a.isAdditionalService ?? 0,
      serviceDescriptionMounting: a.serviceDescriptionMounting,
      serviceDescriptionRental: a.serviceDescriptionRental,
      serviceMountingApplyTrasferta: a.serviceMountingApplyTrasferta ?? 0,
      serviceUnitMounting: a.serviceUnitMounting,
      displayOrder: a.displayOrder ?? 0,
    }));
    return buildDynamicServices(articlesForPricing).filter(s => 
      s.articleCode !== "SRV-003" &&
      s.articleCode !== "SRV-007" &&
      !s.label.toLowerCase().includes("in economia")
    );
  }, [articles]);

  const dynamicServicesInitialized = useRef(false);
  useEffect(() => {
    if (dynamicServicesDef.length > 0 && !dynamicServicesInitialized.current) {
      dynamicServicesInitialized.current = true;
      const initSelected: Record<string, boolean> = {};
      const initTexts: Record<string, string> = {};
      dynamicServicesDef.forEach(s => {
        initSelected[s.id] = false;
        initTexts[s.id] = s.label;
      });
      setOptionalServices(initSelected);
      setOptionalServicesTexts(initTexts);
    }
  }, [dynamicServicesDef]);

  // VERIFICA DATABASE: Fallback per articolo Magazzino
  const magazzinoArticle = useMemo(() => 
    articles.find(a => a.code === "MAG001") || 
    articles.find(a => a.name.toLowerCase().includes("magazzino")), 
  [articles]);

  // Articolo Furgone DAILY (9) per Ritiro esubero
  const furgoneArticle = useMemo(() => 
    articles.find(a => a.code === "TRA-001") || 
    articles.find(a => a.name.toLowerCase().includes("furgone")), 
  [articles]);

  // Articoli Trasferta per calcolo automatico costi
  const trasfertaGiornaliera = useMemo(() => 
    articles.find(a => a.code === "TRF-001"), // Trasferta <100km (giornaliera)
  [articles]);
  
  const trasfertaPernottamento = useMemo(() => 
    articles.find(a => a.code === "TRF-002"), // Trasferta >100km (con pernottamento)
  [articles]);

  // Distanza effettiva per calcolo trasferta:
  // Se "Squadra in zona" è abilitata, usa quella distanza, altrimenti usa distanza cantiere
  const trasfertaDistanceKm = squadraInZonaEnabled ? squadraInZonaKm : distanceKm;

  // Calcolo costi trasferta basato sulla distanza
  // Formula: giorni = (articoli + movimentazione) / 1200
  const calcolaTrasferta = useMemo(() => {
    const calcola = (
      distanzaKm: number, 
      totaleMontaggioConMov: number, // articoli montaggio + movimentazione montaggio
      totaleSmontaggioConMov: number  // articoli smontaggio + movimentazione smontaggio
    ): { 
      costoMontaggioTrasferta: number; 
      costoSmontaggioTrasferta: number; 
      giorniMontaggio: number;
      giorniSmontaggio: number;
      fascia: 'nessuna' | 'giornaliera' | 'pernottamento';
    } => {
      // < 70km: nessun costo trasferta
      if (distanzaKm <= 70) {
        return { 
          costoMontaggioTrasferta: 0, 
          costoSmontaggioTrasferta: 0, 
          giorniMontaggio: 0, 
          giorniSmontaggio: 0,
          fascia: 'nessuna' 
        };
      }

      // Calcola giorni manodopera: (articoli + movimentazione) / 1200, arrotondato a 1 decimale
      const giorniMontaggio = Math.round((totaleMontaggioConMov / 1200) * 10) / 10;
      const giorniSmontaggio = Math.round((totaleSmontaggioConMov / 1200) * 10) / 10;

      // 71-100km: trasferta giornaliera
      if (distanzaKm >= 71 && distanzaKm <= 100) {
        if (!trasfertaGiornaliera?.trasfertaData) {
          return { costoMontaggioTrasferta: 0, costoSmontaggioTrasferta: 0, giorniMontaggio: 0, giorniSmontaggio: 0, fascia: 'giornaliera' };
        }
        
        const costoAuto = trasfertaGiornaliera.trasfertaData.costo1Value; // €/km
        const costoPersona = trasfertaGiornaliera.trasfertaData.costo2Value; // €/km
        
        // km eccesso A/R = (distanza - 70) * 2
        const kmEccessoAR = (distanzaKm - 70) * 2;
        
        // Costo base = (costo_auto + costo_persona * 3) * km_eccesso_AR
        const costoBase = (costoAuto + costoPersona * 3) * kmEccessoAR;
        
        // Costo trasferta = costo_base * giorni_manodopera
        const costoMontaggioTrasferta = costoBase * giorniMontaggio;
        const costoSmontaggioTrasferta = costoBase * giorniSmontaggio;
        
        return { costoMontaggioTrasferta, costoSmontaggioTrasferta, giorniMontaggio, giorniSmontaggio, fascia: 'giornaliera' };
      }

      // > 100km: trasferta con pernottamento
      if (distanzaKm > 100) {
        if (!trasfertaPernottamento?.trasfertaData) {
          return { costoMontaggioTrasferta: 0, costoSmontaggioTrasferta: 0, giorniMontaggio: 0, giorniSmontaggio: 0, fascia: 'pernottamento' };
        }
        
        const costoHotel = trasfertaPernottamento.trasfertaData.costo1Value; // €/squadra
        const costoExtraPersonale = trasfertaPernottamento.trasfertaData.costo2Value; // €/squadra
        
        // Costo base = costo_hotel + costo_extra_personale
        const costoBase = costoHotel + costoExtraPersonale;
        
        // Costo trasferta = costo_base * giorni_manodopera
        const costoMontaggioTrasferta = costoBase * giorniMontaggio;
        const costoSmontaggioTrasferta = costoBase * giorniSmontaggio;
        
        return { costoMontaggioTrasferta, costoSmontaggioTrasferta, giorniMontaggio, giorniSmontaggio, fascia: 'pernottamento' };
      }

      return { costoMontaggioTrasferta: 0, costoSmontaggioTrasferta: 0, giorniMontaggio: 0, giorniSmontaggio: 0, fascia: 'nessuna' };
    };

    return calcola;
  }, [trasfertaGiornaliera, trasfertaPernottamento]);

  const veneziaArticle = useMemo(() =>
    articles.find(a => a.code === "TRF-VEN"),
  [articles]);

  const calcolaVenezia = useMemo(() => {
    const calcola = (
      totaleMontaggioConMov: number,
      totaleSmontaggioConMov: number
    ): {
      costoMontaggioVenezia: number;
      costoSmontaggioVenezia: number;
      giorniMontaggio: number;
      giorniSmontaggio: number;
      costoGiornaliero: number;
      zonaLabel: string;
    } => {
      const veniceZoneValue = opportunity?.veniceZone;
      if (!veniceZoneValue || !veneziaArticle?.variantsData) {
        return { costoMontaggioVenezia: 0, costoSmontaggioVenezia: 0, giorniMontaggio: 0, giorniSmontaggio: 0, costoGiornaliero: 0, zonaLabel: '' };
      }

      const variante = (veneziaArticle.variantsData as any[]).find(
        (v: any) => v.label === veniceZoneValue
      );
      if (!variante || !variante.dailyCost) {
        return { costoMontaggioVenezia: 0, costoSmontaggioVenezia: 0, giorniMontaggio: 0, giorniSmontaggio: 0, costoGiornaliero: 0, zonaLabel: veniceZoneValue };
      }

      const costoGiornaliero = variante.dailyCost;
      const giorniMontaggio = Math.round((totaleMontaggioConMov / 1200) * 10) / 10;
      const giorniSmontaggio = Math.round((totaleSmontaggioConMov / 1200) * 10) / 10;

      const costoMontaggioVenezia = costoGiornaliero * giorniMontaggio;
      const costoSmontaggioVenezia = costoGiornaliero * giorniSmontaggio;

      return { costoMontaggioVenezia, costoSmontaggioVenezia, giorniMontaggio, giorniSmontaggio, costoGiornaliero, zonaLabel: veniceZoneValue };
    };

    return calcola;
  }, [veneziaArticle, opportunity]);

  const transportArticleForLagunari = useMemo(
    () => articles.find(a => a.code === "TRA-001"),
    [articles]
  );
  const transportVehiclesForLagunari: TransportVehicle[] = useMemo(
    () => (transportArticleForLagunari?.pricingData as TransportPricingData)?.vehicles || [],
    [transportArticleForLagunari]
  );
  const barcaArticle = useMemo(
    () => articles.find(a => a.code === "TRA-BAR"),
    [articles]
  );
  const barcaVariants: ArticleVariant[] = useMemo(
    () => (barcaArticle?.variantsData as ArticleVariant[]) || [],
    [barcaArticle]
  );
  const selectedBarcaVariant = barcaVariants[lagunariBarcaVariantIndex] ?? null;

  // NB: calcolaVeneziaTransport calculates PHYSICAL transport costs (ferry/banchina/barca)
  // Reads from getActiveTransportItems() (phase transportItems in fasi/a_corpo, global transportItems in rental)
  // Respects andataEnabled/ritornoEnabled from each transport row

  interface VeneziaTransportResult {
    isFerry: boolean; veniceZone: string;
    vehicleBreakdown: { vehicleName: string; qty: number; directionsCount: number; directionsLabel: string; unitCost: number; total: number; andataEnabled: boolean; ritornoEnabled: boolean; }[];
    costoMezziTotale: number; hasMezzi: boolean; barcaLabel: string; barcaUnitPrice: number; numBarca: number;
    costoBarcaAndata: number; costoBarcaRitorno: number; costoBarcaTotale: number; barcaDirectionsLabel: string; costoTotale: number;
  }

  const computeVeneziaTransportForItems = useCallback((itemsForCalc: Array<{ articleId: string; vehicleIndex: number; quantity: number; andataEnabled: boolean; ritornoEnabled: boolean }>): VeneziaTransportResult | null => {
    const veniceZone = opportunity?.veniceZone;
    if (!veniceZone) return null;

    const tra001Id = transportArticleForLagunari?.id;
    const activeItems = itemsForCalc.filter(item =>
      item.articleId === tra001Id &&
      (item.andataEnabled || item.ritornoEnabled) &&
      item.quantity > 0
    );

    const isFerry = VENICE_FERRY_ZONES.has(veniceZone);

    const vehicleBreakdown: VeneziaTransportResult['vehicleBreakdown'] = [];
    let costoMezziTotale = 0;

    for (const item of activeItems) {
      const vehicle = transportVehiclesForLagunari[item.vehicleIndex];
      if (!vehicle) continue;
      const directionsCount = (item.andataEnabled ? 1 : 0) + (item.ritornoEnabled ? 1 : 0);
      const directionsLabel = item.andataEnabled && item.ritornoEnabled
        ? 'andata+ritorno' : item.andataEnabled ? 'solo andata' : 'solo ritorno';
      const unitCost = isFerry
        ? (veniceZone === "Lido" ? (vehicle.ferryLidoCost ?? 0) : (vehicle.ferryPellesCost ?? 0))
        : (vehicle.banchinaCost ?? 0);
      const total = unitCost * item.quantity * directionsCount;
      costoMezziTotale += total;
      vehicleBreakdown.push({ vehicleName: vehicle.name, qty: item.quantity, directionsCount, directionsLabel, unitCost, total, andataEnabled: !!item.andataEnabled, ritornoEnabled: !!item.ritornoEnabled });
    }

    const barcaUnitPrice =
      (veniceZone && selectedBarcaVariant?.zonePrices?.[veniceZone])
        ? (selectedBarcaVariant.zonePrices[veniceZone] as number)
        : (selectedBarcaVariant?.price ?? 0);
    const barcaLabel = selectedBarcaVariant?.label ?? "";
    const barcaHasAndata = activeItems.some(item => item.andataEnabled);
    const barcaHasRitorno = activeItems.some(item => item.ritornoEnabled);
    const barcaDirectionsCount = (barcaHasAndata ? 1 : 0) + (barcaHasRitorno ? 1 : 0);
    const costoBarcaAndata = barcaHasAndata ? barcaUnitPrice * lagunariNumeroBarca : 0;
    const costoBarcaRitorno = barcaHasRitorno ? barcaUnitPrice * lagunariNumeroBarca : 0;
    const costoBarcaTotale = barcaUnitPrice * lagunariNumeroBarca * barcaDirectionsCount;
    const barcaDirectionsLabel = barcaHasAndata && barcaHasRitorno
      ? 'andata+ritorno' : barcaHasAndata ? 'solo andata' : barcaHasRitorno ? 'solo ritorno' : '';
    const costoTotale = costoMezziTotale + costoBarcaTotale;

    if (activeItems.length === 0 && costoBarcaTotale === 0) return { isFerry, veniceZone, vehicleBreakdown: [], costoMezziTotale: 0, hasMezzi: false, barcaLabel, barcaUnitPrice, numBarca: lagunariNumeroBarca, costoBarcaAndata, costoBarcaRitorno, costoBarcaTotale, barcaDirectionsLabel, costoTotale: 0 };

    return { isFerry, veniceZone, vehicleBreakdown, costoMezziTotale, hasMezzi: activeItems.length > 0, barcaLabel, barcaUnitPrice, numBarca: lagunariNumeroBarca, costoBarcaAndata, costoBarcaRitorno, costoBarcaTotale, barcaDirectionsLabel, costoTotale };
  }, [opportunity, transportArticleForLagunari, transportVehiclesForLagunari,
    selectedBarcaVariant, lagunariNumeroBarca]);

  const calcolaVeneziaTransport = useMemo(() => {
    return computeVeneziaTransportForItems(getActiveTransportItems());
  }, [computeVeneziaTransportForItems, fasi, currentFaseIndex, transportItems]);

  const phasesLagunariData = useMemo(() => {
    if (!isPhaseLikeMode) return new Map<number, VeneziaTransportResult>();
    const result = new Map<number, VeneziaTransportResult>();
    fasi.forEach((fase, idx) => {
      const computed = computeVeneziaTransportForItems(fase.transportItems);
      if (computed) result.set(idx, computed);
    });
    return result;
  }, [isPhaseLikeMode, fasi, computeVeneziaTransportForItems]);

  function buildLagunariItems(v: NonNullable<typeof calcolaVeneziaTransport>) {
    const items: { label: string; qty: number; unitPrice: number; total: number; isACorpo: boolean }[] = [];
    for (const bd of v.vehicleBreakdown) {
      if (bd.total <= 0) continue;
      const prefix = v.isFerry ? `Ferry Boat ${v.veniceZone}` : `Scarico banchina`;
      items.push({
        label: `${prefix} ${bd.vehicleName} - ${bd.directionsLabel}`,
        qty: bd.qty * bd.directionsCount,
        unitPrice: bd.unitCost,
        total: bd.total,
        isACorpo: true,
      });
    }
    if (v.costoBarcaAndata > 0) {
      items.push(
        { label: `${v.barcaLabel} - Andata`, qty: v.numBarca, unitPrice: v.barcaUnitPrice, total: v.costoBarcaAndata, isACorpo: true },
      );
    }
    if (v.costoBarcaRitorno > 0) {
      items.push(
        { label: `${v.barcaLabel} - Ritorno`, qty: v.numBarca, unitPrice: v.barcaUnitPrice, total: v.costoBarcaRitorno, isACorpo: true },
      );
    }
    return items;
  }

  function buildLagunariAndataItems(v: NonNullable<typeof calcolaVeneziaTransport>, keyPrefix = '') {
    let totalAndata = 0;
    const parts: string[] = [];
    for (const bd of v.vehicleBreakdown) {
      if (!bd.andataEnabled) continue;
      const cost = bd.unitCost * bd.qty;
      if (cost <= 0) continue;
      totalAndata += cost;
      const partLabel = v.isFerry ? `ferry ${bd.vehicleName}` : `scarico banchina`;
      if (!parts.includes(partLabel)) parts.push(partLabel);
    }
    if (v.costoBarcaAndata > 0) {
      totalAndata += v.costoBarcaAndata;
      const barcaPart = (v.barcaLabel || 'barca').toLowerCase();
      if (!parts.includes(barcaPart)) parts.push(barcaPart);
    }
    if (totalAndata <= 0) return [];
    const label = `Trasporto lagunare (${parts.join(' + ')})`;
    return [{
      label,
      qty: 1,
      unitPrice: totalAndata,
      total: totalAndata,
      key: `${keyPrefix}andata:combined`,
    }];
  }

  function buildLagunariRitornoItems(v: NonNullable<typeof calcolaVeneziaTransport>, keyPrefix = '') {
    let totalRitorno = 0;
    const parts: string[] = [];
    for (const bd of v.vehicleBreakdown) {
      if (!bd.ritornoEnabled) continue;
      const cost = bd.unitCost * bd.qty;
      if (cost <= 0) continue;
      totalRitorno += cost;
      const partLabel = v.isFerry ? `ferry ${bd.vehicleName}` : `scarico banchina`;
      if (!parts.includes(partLabel)) parts.push(partLabel);
    }
    if (v.costoBarcaRitorno > 0) {
      totalRitorno += v.costoBarcaRitorno;
      const barcaPart = (v.barcaLabel || 'barca').toLowerCase();
      if (!parts.includes(barcaPart)) parts.push(barcaPart);
    }
    if (totalRitorno <= 0) return [];
    const label = `Trasporto lagunare (${parts.join(' + ')})`;
    return [{
      label,
      qty: 1,
      unitPrice: totalRitorno,
      total: totalRitorno,
      key: `${keyPrefix}ritorno:combined`,
    }];
  }

  const getLagunariEffectiveTotal = () => {
    if (isPhaseLikeMode) {
      let total = 0;
      phasesLagunariData.forEach((vt, faseIdx) => {
        const kp = `f${faseIdx}:`;
        const allItems = [...buildLagunariAndataItems(vt, kp), ...buildLagunariRitornoItems(vt, kp)];
        total += allItems.reduce((sum, item) => {
          if (deletedLagunariItems.has(item.key)) return sum;
          const override = lagunariAmountOverrides.get(item.key);
          const discount = lagunariDiscounts.get(item.key) || 0;
          const basePrice = override !== null && override !== undefined ? override : item.total;
          return sum + round2(basePrice * (1 - discount / 100));
        }, 0);
      });
      return total;
    }
    if (!calcolaVeneziaTransport) return 0;
    const allItems = [...buildLagunariAndataItems(calcolaVeneziaTransport), ...buildLagunariRitornoItems(calcolaVeneziaTransport)];
    return allItems.reduce((sum, item) => {
      if (deletedLagunariItems.has(item.key)) return sum;
      const override = lagunariAmountOverrides.get(item.key);
      const discount = lagunariDiscounts.get(item.key) || 0;
      const basePrice = override !== null && override !== undefined ? override : item.total;
      return sum + round2(basePrice * (1 - discount / 100));
    }, 0);
  };

  const getLagunariItemEffective = (item: { total: number; key: string }) => {
    if (deletedLagunariItems.has(item.key)) return 0;
    const override = lagunariAmountOverrides.get(item.key);
    const discount = lagunariDiscounts.get(item.key) || 0;
    const basePrice = override !== null && override !== undefined ? override : item.total;
    return round2(basePrice * (1 - discount / 100));
  };

  const serviceArticles = useMemo(() => {
    // Filter SERVICE and EXTRA articles, excluding special codes
    // MAG001 (Movimentazione Magazzino) is auto-calculated by backend when RENTAL items exist
    // TRF-001, TRF-002 (Trasferte) - removed, replaced by "Ritiro esubero" toggle
    const excludedCodes = new Set(["EXT-SALT", "MOV-PARAMS", "MAG001", "TRF-001", "TRF-002", "TRF-VEN", "TRA-BAR", "TRF-BAR", "SRV-003", "SRV-007", "MAN-001"]);
    const baseList = articles.filter(a => {
      if (a.pricingLogic !== "SERVICE" && (a.pricingLogic as string) !== "EXTRA") return false;
      const code = (a.code || "").trim();
      if (excludedCodes.has(code)) return false;
      if (a.category === "TRASFERTA") return false;
      const nameLower = (a.name || "").toLowerCase();
      if (nameLower.includes("lagunare") || nameLower.includes("lagunari")) return false;
      if (nameLower.includes("ore in economia")) return false;
      return true;
    });
    return baseList;
  }, [articles]);

  // ==================== CLAUSOLE INSTALLAZIONE ====================
  // Definizione di tutte le voci per la categoria "Descrizione Installazione"
  const installazioneClausesDef: ClauseEntry[] = useMemo(() => {
    const ov = clauseOverrideMap;
    return [
    // Validità offerta (sempre visibile)
    { 
      id: "validita_offerta", 
      defaultText: ov["validita_offerta"] || `VALIDITA' OFFERTA E PROMOZIONE: ${validitaOfferta} gg.`,
      condition: (_ctx: ClauseContext) => true // Sempre attiva
    },
    // Ponteggio facciata + copertura (Tetto+Facciata o Nuova Costruzione)
    { 
      id: "pont_facciata_copertura", 
      defaultText: ov["pont_facciata_copertura"] || "Ponteggio per Vostre lavorazioni di facciata e in copertura, posizionando l'ultimo piano di lavoro a circa 50 cm dalla linea di gronda con parapetti H. 2 mt e rete anti caduta. Lo stesso seguirà l'andamento geometrico delle facciate e sarà dotato di piani di lavoro con interasse 2 mt",
      condition: (ctx: ClauseContext) => (ctx.ponteggioPerArray.includes("TETTO") && ctx.ponteggioPerArray.includes("FACCIATA")) || ctx.ponteggioPerArray.includes("NUOVA_COSTR")
    },
    // Ponteggio solo facciata
    { 
      id: "pont_solo_facciata", 
      defaultText: ov["pont_solo_facciata"] || "Ponteggio per Vostre lavorazioni di facciata, posizionando l'ultimo piano di lavoro a circa 1.80 mt dalla linea di gronda, seguirà per quanto possibile l'andamento geometrico delle facciate e sarà dotato di piani di lavoro con interasse 2 mt",
      condition: (ctx: ClauseContext) => ctx.ponteggioPerArray.includes("FACCIATA") && !ctx.ponteggioPerArray.includes("TETTO") && !ctx.ponteggioPerArray.includes("NUOVA_COSTR")
    },
    // Ponteggio solo tetto
    { 
      id: "pont_solo_tetto", 
      defaultText: ov["pont_solo_tetto"] || "Ponteggio per Vostre lavorazioni in copertura, posizionando l'ultimo piano di lavoro a circa 50 cm dalla linea di gronda con parapetti H. 2 mt e rete anti caduta con relativo sottoponte di sicurezza e con una rampa scale di risalita sino all'ultimo livello",
      condition: (ctx: ClauseContext) => ctx.ponteggioPerArray.includes("TETTO") && !ctx.ponteggioPerArray.includes("FACCIATA") && !ctx.ponteggioPerArray.includes("NUOVA_COSTR")
    },
    // Struttura Telaio 105
    { 
      id: "struttura_telaio_105", 
      defaultText: ov["struttura_telaio_105"] || "Struttura in materiale a telai avente passo 1,80 e larghezza 1,05 corredato da parapetti a protezione e salvaguardia del personale, piani di lavoro e relativo sottoponte di sicurezza, fermapiedi, botole e scale d'accesso come da normativa vigente in materia",
      condition: (ctx: ClauseContext) => ctx.hasTelaio105
    },
    // Struttura Multidirezionale
    { 
      id: "struttura_multidirezionale", 
      defaultText: ov["struttura_multidirezionale"] || "Struttura in materiale a montanti e traversi prefabbricati (multidirezionale con larghezza 75) corredato da parapetti a protezione e salvaguardia del personale, piani di lavoro e relativo sottoponte di sicurezza, fermapiedi, botole e scale d'accesso come da normativa vigente in materia",
      condition: (ctx: ClauseContext) => ctx.hasMultidirezionale
    },
    // Montacarichi
    { 
      id: "montacarichi_desc", 
      defaultText: ov["montacarichi_desc"] || `Ascensore montacarichi Electroelsa modello PM-M10 monofase con portata di 800 kg alto 15 mt e con 3 sbarchi in quota dotato di ogni dispositivo di sicurezza necessario, come da normativa vigente in materia.\nVerrà previsto inoltre un castelletto di servizio in ponteggio tradizionale per agevolare lo sbarco ai piani`,
      condition: (ctx: ClauseContext) => ctx.hasMontacarichi
    },
    // Mensole - 4 voci
    { 
      id: "mensole_sbalzo", 
      defaultText: ov["mensole_sbalzo"] || "Mensole a sbalzo ove necessarie",
      condition: (ctx: ClauseContext) => ctx.hasMensole
    },
    { 
      id: "mensole_parete", 
      defaultText: ov["mensole_parete"] || "Mensole a sbalzo Verso parete",
      condition: (ctx: ClauseContext) => ctx.hasMensole
    },
    { 
      id: "mensole_copertura", 
      defaultText: ov["mensole_copertura"] || "Mensole a sbalzo Per camminamento in copertura",
      condition: (ctx: ClauseContext) => ctx.hasMensole
    },
    { 
      id: "mensole_tubo_tavolone", 
      defaultText: ov["mensole_tubo_tavolone"] || "Tubo con tavolone in legno verso parete ad ogni solaio (legname a Vostro carico)",
      condition: (ctx: ClauseContext) => ctx.hasMensole
    },
    // Parapetti a parete/salvafacciate/sottoveletta - 6 voci
    { 
      id: "parap_parete_parte", 
      defaultText: ov["parap_parete_parte"] || "Parapetti provvisori a parete su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio",
      condition: (ctx: ClauseContext) => ctx.hasParapettiParete
    },
    { 
      id: "parap_parete_perimetro", 
      defaultText: ov["parap_parete_perimetro"] || "Parapetti provvisori a parete lungo il perimetro del tetto oggetto del vostro intervento",
      condition: (ctx: ClauseContext) => ctx.hasParapettiParete
    },
    { 
      id: "parap_salvafacciate_parte", 
      defaultText: ov["parap_salvafacciate_parte"] || "Parapetti provvisori salvafacciate su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio",
      condition: (ctx: ClauseContext) => ctx.hasParapettiParete
    },
    { 
      id: "parap_salvafacciate_perimetro", 
      defaultText: ov["parap_salvafacciate_perimetro"] || "Parapetti provvisori salvafacciate lungo il perimetro del tetto oggetto del vostro intervento",
      condition: (ctx: ClauseContext) => ctx.hasParapettiParete
    },
    { 
      id: "parap_sottoveletta_parte", 
      defaultText: ov["parap_sottoveletta_parte"] || "Parapetti provvisori sottoveletta su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio",
      condition: (ctx: ClauseContext) => ctx.hasParapettiParete
    },
    { 
      id: "parap_sottoveletta_perimetro", 
      defaultText: ov["parap_sottoveletta_perimetro"] || "Parapetti provvisori sottoveletta lungo il perimetro del tetto oggetto del vostro intervento",
      condition: (ctx: ClauseContext) => ctx.hasParapettiParete
    },
    // Parapetti a morsa - 4 voci
    { 
      id: "parap_morsa_vert_parte", 
      defaultText: ov["parap_morsa_vert_parte"] || "Parapetti provvisori a morsa verticale su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio",
      condition: (ctx: ClauseContext) => ctx.hasParapettiMorsa
    },
    { 
      id: "parap_morsa_vert_perimetro", 
      defaultText: ov["parap_morsa_vert_perimetro"] || "Parapetti provvisori a morsa verticale lungo il perimetro del tetto oggetto del vostro intervento",
      condition: (ctx: ClauseContext) => ctx.hasParapettiMorsa
    },
    { 
      id: "parap_morsa_oriz_parte", 
      defaultText: ov["parap_morsa_oriz_parte"] || "Parapetti provvisori a morsa orizzontale su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio",
      condition: (ctx: ClauseContext) => ctx.hasParapettiMorsa
    },
    { 
      id: "parap_morsa_oriz_perimetro", 
      defaultText: ov["parap_morsa_oriz_perimetro"] || "Parapetti provvisori a morsa orizzontale lungo il perimetro del tetto oggetto del vostro intervento",
      condition: (ctx: ClauseContext) => ctx.hasParapettiMorsa
    },
    // Parapetti tubo e giunto - 2 voci
    { 
      id: "parap_tubogiunto_parte", 
      defaultText: ov["parap_tubogiunto_parte"] || "Parapetto in tubo e giunto su parte del perimetro del tetto oggetto del vostro intervento, non coperta dal ponteggio",
      condition: (ctx: ClauseContext) => ctx.hasParapettiTuboGiunto
    },
    { 
      id: "parap_tubogiunto_area", 
      defaultText: ov["parap_tubogiunto_area"] || "Parapetto in tubo e giunto per delimitazione area di lavoro in copertura",
      condition: (ctx: ClauseContext) => ctx.hasParapettiTuboGiunto
    },
    // Rampa scale (se parapetti presenti)
    { 
      id: "rampa_scale_parapetti", 
      defaultText: ov["rampa_scale_parapetti"] || "Verrà prevista inoltre una rampa scale in materiale a telai avente lunghezza 3,60 e larghezza 1,05 corredata da parapetti a protezione e salvaguardia del personale, piani di lavoro, fermapiedi e quant'altro necessario, come da normativa vigente in materia",
      condition: (ctx: ClauseContext) => ctx.hasParapettiParete || ctx.hasParapettiMorsa || ctx.hasParapettiTuboGiunto
    },
    // Scala esterna
    { 
      id: "scala_esterna", 
      defaultText: ov["scala_esterna"] || `Scala esterna in materiale multidirezionale con altezza di 8 mt\nStruttura in materiale a montanti e traversi prefabbricati corredato da parapetti a protezione e salvaguardia del personale e fermapiedi come da normativa vigente in materia`,
      condition: (ctx: ClauseContext) => ctx.hasScala
    },
    // Cielo
    { 
      id: "cielo_piano_lavoro", 
      defaultText: ov["cielo_piano_lavoro"] || "Piano di lavoro in quota composto da travi reticolari e compreso di rete anti caduta come sottoponte",
      condition: (ctx: ClauseContext) => ctx.hasCielo
    },
    // Copertura
    { 
      id: "copertura_provvisoria", 
      defaultText: ov["copertura_provvisoria"] || "Copertura scorrevole provvisoria con struttura formata da travi prefabbricate in alluminio e teli in PVC montata su rotaie al disopra del ponteggio completa di tiranti, diagonali e quant'altro onere necessario per garantire la massima sicurezza e stabilità",
      condition: (ctx: ClauseContext) => ctx.hasCopertura
    },
    // Stima MQ ponteggio - 4 alternative
    { 
      id: "stima_mq_indicazioni", 
      defaultText: ov["stima_mq_indicazioni"] || `Si stima indicativamente una superficie di ponteggio pari a: ${0} mq calcolato in base alle Vostre indicazioni`,
      condition: (ctx: ClauseContext) => ctx.hasPonteggio
    },
    { 
      id: "stima_mq_computo", 
      defaultText: ov["stima_mq_computo"] || `Si stima indicativamente una superficie di ponteggio pari a: ${0} mq come indicato da Vostro computo`,
      condition: (ctx: ClauseContext) => ctx.hasPonteggio
    },
    { 
      id: "stima_mq_generico", 
      defaultText: ov["stima_mq_generico"] || `Si stima indicativamente una superficie di ponteggio pari a: ${0} mq`,
      condition: (ctx: ClauseContext) => ctx.hasPonteggio
    },
    // Solo manodopera
    { 
      id: "materiale_proprieta_cliente", 
      defaultText: ov["materiale_proprieta_cliente"] || "Si precisa che il materiale è di Vs. proprietà, per quanto riguarda la fase di montaggio, sarà nostra cura inviarvi una distinta con le quantità necessarie, che dovranno essere presenti a piè d'opera in cantiere prima dell'inizio dei lavori. Lo stesso dovrà, come previsto dalla normativa vigente, per ogni tipologia – tubo & giunto, montanti e traversi, telai - appartenere tutto ad una stessa autorizzazione ministeriale, deve inoltre essere integro in ogni sua parte ed adeguatamente verniciato",
      condition: (ctx: ClauseContext) => ctx.isSoloManodopera
    },
  ];
  }, [validitaOfferta, clauseOverrideMap]);

  // Clausole NOTA BENE per Step 4
  const notaBeneClauses: ClauseEntry[] = useMemo(() => {
    const ov = clauseOverrideMap;
    return [
    // Condizionale: solo se cantiere a MQ/Pezzo (non "a corpo")
    { 
      id: "nb_fattura_quantita_effettive", 
      defaultText: ov["nb_fattura_quantita_effettive"] || "In fattura verranno contabilizzate le quantità effettivamente installate in base alle rilevazioni eseguite a fine montaggio",
      condition: (ctx: ClauseContext) => ctx.isCantiereAMq
    },
    // Condizionale: solo se sopralluogo NON fatto
    { 
      id: "nb_prezzi_previo_sopralluogo", 
      defaultText: ov["nb_prezzi_previo_sopralluogo"] || "I prezzi indicati verranno confermati solo previo sopralluogo in cantiere di un nostro tecnico",
      condition: (ctx: ClauseContext) => !ctx.sopralluogoFatto
    },
    // Condizionale: solo se gru di cantiere prevista
    { 
      id: "nb_gru_cantiere", 
      defaultText: ov["nb_gru_cantiere"] || "La movimentazione dei materiali con gru di cantiere, durante le fasi di montaggio, smontaggio, carico e scarico del camion sarà a Vostro carico; in caso contrario i prezzi indicati potrebbero essere soggetti a variazioni",
      condition: (ctx: ClauseContext) => ctx.gruCantierePrevista
    },
    // Sempre attive
    { 
      id: "nb_danni_calpestio", 
      defaultText: ov["nb_danni_calpestio"] || "Durante le fasi di montaggio e smontaggio sopra tetti le riparazioni degli eventuali danni causati dal calpestio di nostre maestranze saranno a vostro carico",
      condition: () => true
    },
    { 
      id: "nb_escluso_non_menzionato", 
      defaultText: ov["nb_escluso_non_menzionato"] || "Quanto non espressamente menzionato nell'offerta è da ritenersi escluso",
      condition: () => true
    },
    { 
      id: "nb_assito_cantiere", 
      defaultText: ov["nb_assito_cantiere"] || "Assito di cantiere a Vostro carico.",
      condition: () => true
    },
  ];
  }, [clauseOverrideMap]);

  // Lista servizi opzionali (importata da modulo condiviso)
  const getDynamicServicePrice = (service: DynamicServiceEntry): number => {
    const article = articles.find(a => String(a.id) === service.articleId);
    if (!article) return 0;
    const artForPricing: ArticleForPricing = {
      id: String(article.id),
      code: article.code,
      name: article.name,
      basePrice: article.basePrice,
      unitType: article.unitType,
      pricingLogic: article.pricingLogic,
      pricingData: article.pricingData,
      installationData: article.installationData,
      variantsData: article.variantsData as any,
    };
    return calculateDynamicServicePrice(service, artForPricing, trasfertaDistanceKm, {
      reteAntipolvereQtyML,
      durationMonths,
    });
  };

  // Toggle servizio opzionale
  const toggleOptionalService = (serviceId: string) => {
    setOptionalServices(prev => ({
      ...prev,
      [serviceId]: !prev[serviceId]
    }));
  };

  // Calcola il contesto per le clausole in base agli elementi selezionati
  const allChecklistEntries = useMemo(() => {
    const merged: [string, ChecklistItemState][] = [];
    const addEntry = (articleId: string, state: ChecklistItemState) => {
      const existing = merged.find(([id]) => id === articleId);
      if (existing) {
        existing[1] = { ...existing[1], quantity: existing[1].quantity + state.quantity };
      } else {
        merged.push([articleId, { ...state }]);
      }
    };

    if (isPhaseLikeMode) {
      fasi.forEach(fase => {
        const allModuleItems = [
          ...fase.montaggioItems,
          ...fase.noleggioItems,
          ...fase.fornituraItems,
          ...fase.magazzinoItems,
        ];
        allModuleItems.forEach(extra => {
          if (extra.articleId && extra.quantity > 0) {
            addEntry(extra.articleId, {
              enabled: true,
              quantity: extra.quantity,
              variantIndex: extra.variantIndex,
              installationIndex: extra.installationIndex,
              useCesta: extra.useCesta,
              hoistAltezzaMetri: extra.hoistAltezzaMetri,
              hoistNumSbarchi: extra.hoistNumSbarchi,
            });
          }
        });
        fase.aCorpoItems.forEach(aCorpo => {
          if (aCorpo.articleId && aCorpo.quantity > 0) {
            addEntry(aCorpo.articleId, {
              enabled: true,
              quantity: aCorpo.quantity,
              variantIndex: aCorpo.variantIndex,
            });
          }
        });
      });
      return merged;
    }
    return Array.from(checklistItems.entries());
  }, [quoteMode, checklistItems, fasi]);

  const clauseContext = useMemo((): ClauseContext => {
    const isArticleEnabled = (searchTerms: string[]): boolean => {
      for (const [articleId, state] of allChecklistEntries) {
        if (!state.enabled) continue;
        const article = articles.find(a => a.id === articleId);
        if (!article) continue;
        const searchText = `${article.name} ${article.code}`.toLowerCase();
        if (searchTerms.some(term => searchText.includes(term.toLowerCase()))) {
          return true;
        }
      }
      if (!isPhaseLikeMode) {
        for (const extra of extraChecklistItems) {
          const article = articles.find(a => a.id === extra.articleId);
          if (!article) continue;
          const searchText = `${article.name} ${article.code}`.toLowerCase();
          if (searchTerms.some(term => searchText.includes(term.toLowerCase()))) {
            return true;
          }
        }
        for (const aCorpo of aCorpoItems) {
          const article = articles.find(a => a.id === aCorpo.articleId);
          if (!article) continue;
          const searchText = `${article.name} ${article.code}`.toLowerCase();
          if (searchTerms.some(term => searchText.includes(term.toLowerCase()))) {
            return true;
          }
        }
      }
      return false;
    };

    const getArticleVariantLabel = (article: Article, variantIndex: number | undefined): string => {
      if (article.variantsData && variantIndex !== undefined) {
        const variant = article.variantsData[variantIndex];
        if (variant && variant.label) return variant.label.toLowerCase();
      }
      return "";
    };

    const isVariantEnabled = (articleNameTerms: string[], variantTerms: string[]): boolean => {
      for (const [articleId, state] of allChecklistEntries) {
        if (!state.enabled) continue;
        const article = articles.find(a => a.id === articleId);
        if (!article) continue;
        const searchText = `${article.name} ${article.code}`.toLowerCase();
        if (!articleNameTerms.some(term => searchText.includes(term.toLowerCase()))) continue;
        const variantLabel = getArticleVariantLabel(article, state.variantIndex);
        if (variantTerms.some(term => variantLabel.includes(term.toLowerCase()))) return true;
      }
      if (!isPhaseLikeMode) {
        for (const extra of extraChecklistItems) {
          if (extra.quantity <= 0) continue;
          const article = articles.find(a => a.id === extra.articleId);
          if (!article) continue;
          const searchText = `${article.name} ${article.code}`.toLowerCase();
          if (!articleNameTerms.some(term => searchText.includes(term.toLowerCase()))) continue;
          const variantLabel = getArticleVariantLabel(article, extra.variantIndex);
          if (variantTerms.some(term => variantLabel.includes(term.toLowerCase()))) return true;
        }
        for (const aCorpo of aCorpoItems) {
          if (aCorpo.quantity <= 0) continue;
          const article = articles.find(a => a.id === aCorpo.articleId);
          if (!article) continue;
          const searchText = `${article.name} ${article.code}`.toLowerCase();
          if (!articleNameTerms.some(term => searchText.includes(term.toLowerCase()))) continue;
          const variantLabel = getArticleVariantLabel(article, aCorpo.variantIndex);
          if (variantTerms.some(term => variantLabel.includes(term.toLowerCase()))) return true;
        }
      }
      return false;
    };

    const isParapettiParete = (): boolean => {
      const articleNameTerms = ["parapett"];
      const excludeTerms = ["morsa", "tubo", "giunto"];
      for (const [articleId, state] of allChecklistEntries) {
        if (!state.enabled) continue;
        const article = articles.find(a => a.id === articleId);
        if (!article) continue;
        const searchText = `${article.name} ${article.code}`.toLowerCase();
        if (!articleNameTerms.some(term => searchText.includes(term))) continue;
        const variantLabel = getArticleVariantLabel(article, state.variantIndex);
        if (!excludeTerms.some(term => variantLabel.includes(term))) return true;
      }
      if (!isPhaseLikeMode) {
        for (const extra of extraChecklistItems) {
          if (extra.quantity <= 0) continue;
          const article = articles.find(a => a.id === extra.articleId);
          if (!article) continue;
          const searchText = `${article.name} ${article.code}`.toLowerCase();
          if (!articleNameTerms.some(term => searchText.includes(term))) continue;
          const variantLabel = getArticleVariantLabel(article, extra.variantIndex);
          if (!excludeTerms.some(term => variantLabel.includes(term))) return true;
        }
        for (const aCorpo of aCorpoItems) {
          if (aCorpo.quantity <= 0) continue;
          const article = articles.find(a => a.id === aCorpo.articleId);
          if (!article) continue;
          const searchText = `${article.name} ${article.code}`.toLowerCase();
          if (!articleNameTerms.some(term => searchText.includes(term))) continue;
          const variantLabel = getArticleVariantLabel(article, aCorpo.variantIndex);
          if (!excludeTerms.some(term => variantLabel.includes(term))) return true;
        }
      }
      return false;
    };

    const isPonteggioArticle = (article: { name: string; code: string }): boolean => {
      const searchText = `${article.name} ${article.code}`.toLowerCase();
      return searchText.includes("telaio") || 
             searchText.includes("105") || 
             searchText.includes("multidirezionale") || 
             searchText.includes("75");
    };
    
    let mqPonteggio = 0;
    if (isPhaseLikeMode) {
      fasi.forEach(fase => {
        let faseMq = 0;
        fase.montaggioItems.forEach(item => {
          if (!item.articleId || item.quantity <= 0) return;
          const article = articles.find(a => a.id === item.articleId);
          if (!article) return;
          if (article.unitType === "MQ" && isPonteggioArticle(article)) {
            faseMq += item.quantity;
          }
        });
        mqPonteggio += faseMq;
      });
    } else {
      for (const [articleId, state] of allChecklistEntries) {
        if (!state.enabled || state.quantity <= 0) continue;
        const article = articles.find(a => a.id === articleId);
        if (!article) continue;
        if (article.unitType === "MQ" && isPonteggioArticle(article)) {
          mqPonteggio += state.quantity;
        }
      }
      for (const extra of extraChecklistItems) {
        if (extra.quantity <= 0) continue;
        const article = articles.find(a => a.id === extra.articleId);
        if (!article) continue;
        if (article.unitType === "MQ" && isPonteggioArticle(article)) {
          mqPonteggio += extra.quantity;
        }
      }
    }

    let montacarichiDesc = "PM-M10 monofase con portata di 800 kg.";
    let montacarichiAltezza = 15;
    let montacarichiSbarchi = 3;
    for (const [articleId, state] of allChecklistEntries) {
      if (!state.enabled) continue;
      const article = articles.find(a => a.id === articleId);
      if (!article) continue;
      if (article.pricingLogic === "HOIST") {
        montacarichiAltezza = state.hoistAltezzaMetri || 15;
        montacarichiSbarchi = state.hoistNumSbarchi || 3;
        if (article.variantsData && state.variantIndex !== undefined) {
          const variant = article.variantsData[state.variantIndex];
          if (variant && variant.label) {
            montacarichiDesc = variant.label;
          }
        }
        break;
      }
    }

    return {
      ponteggioPerArray,
      hasTelaio105: isArticleEnabled(["telaio", "telai 105", "telaio 105"]),
      hasMultidirezionale: isArticleEnabled(["multidirezionale", "multidir"]),
      hasMontacarichi: isArticleEnabled(["montacarichi"]) || hoistArticles.some(a => {
        for (const [id, st] of allChecklistEntries) { if (id === a.id && st.enabled) return true; }
        return false;
      }),
      hasMensole: isArticleEnabled(["mensole", "mensola"]),
      hasParapettiParete: isParapettiParete(),
      hasParapettiMorsa: isVariantEnabled(["parapett"], ["morsa"]),
      hasParapettiTuboGiunto: isVariantEnabled(["parapett"], ["tubo", "giunto"]),
      hasCesta: isArticleEnabled(["cesta"]),
      hasScala: isArticleEnabled(["scala esterna", "scala"]),
      hasCielo: isArticleEnabled(["cielo"]),
      hasCopertura: isArticleEnabled(["copertura"]),
      hasPonteggio: isArticleEnabled(["ponteggio"]) || mqPonteggio > 0,
      isSoloManodopera: quoteMode === "labor_only",
      mqPonteggio,
      montacarichiDesc,
      montacarichiAltezza,
      montacarichiSbarchi,
      scalaAltezza: 8,
      validitaOfferta,
      sopralluogoFatto: !!opportunity?.sopralluogoFatto,
      gruCantierePrevista: gruCantiere === "SI_NOSTRO" || gruCantiere === "SI_CLIENTE",
      isCantiereAMq: mqPonteggio > 0,
    };
  }, [allChecklistEntries, extraChecklistItems, aCorpoItems, articles, ponteggioPerArray, quoteMode, validitaOfferta, hoistArticles, opportunity?.sopralluogoFatto, gruCantiere]);

  // Funzione per generare il testo dinamico di una clausola
  const getClauseText = (clause: ClauseEntry): string => {
    let text = clause.defaultText;
    
    // Clausole con valori dinamici specifici
    if (clause.id === "validita_offerta") {
      text = `VALIDITA' OFFERTA E PROMOZIONE: ${validitaOfferta} gg`;
    } else if (clause.id === "montacarichi_desc") {
      text = `Ascensore montacarichi Electroelsa modello ${clauseContext.montacarichiDesc} alto ${clauseContext.montacarichiAltezza} mt e con ${clauseContext.montacarichiSbarchi} sbarchi in quota dotato di ogni dispositivo di sicurezza necessario, come da normativa vigente in materia\nVerrà previsto inoltre un castelletto di servizio in ponteggio tradizionale per agevolare lo sbarco ai piani`;
    } else if (clause.id === "stima_mq_indicazioni") {
      text = `Si stima indicativamente una superficie di ponteggio pari a: ${clauseContext.mqPonteggio} mq calcolato in base alle Vostre indicazioni`;
    } else if (clause.id === "stima_mq_computo") {
      text = `Si stima indicativamente una superficie di ponteggio pari a: ${clauseContext.mqPonteggio} mq come indicato da Vostro computo`;
    } else if (clause.id === "stima_mq_generico") {
      text = `Si stima indicativamente una superficie di ponteggio pari a: ${clauseContext.mqPonteggio} mq`;
    } else if (clause.id === "scala_esterna") {
      text = `Scala esterna in materiale multidirezionale con altezza di ${clauseContext.scalaAltezza} mt\nStruttura in materiale a montanti e traversi prefabbricati corredato da parapetti a protezione e salvaguardia del personale e fermapiedi come da normativa vigente in materia`;
    }
    
    // Aggiungi "con servizio ausiliario di cesta" a tutte le voci parapetto se cesta è presente
    const isParapettoClause = clause.id.startsWith("parap_");
    if (isParapettoClause && clauseContext.hasCesta) {
      text = text + " con servizio ausiliario di cesta";
    }
    
    return text;
  };

  // Inizializza le clausole quando il contesto cambia
  useEffect(() => {
    if (installazioneClausesDef.length > 0) {
      setClauseSelections(prev => {
        const newSelections = { ...prev };
        installazioneClausesDef.forEach(clause => {
          const isActive = clause.condition(clauseContext);
          const dynamicText = getClauseText(clause);
          
          if (!newSelections[clause.id]) {
            newSelections[clause.id] = { selected: isActive, text: dynamicText };
          } else {
            const isUserModified = userModifiedClauses.has(clause.id);
            newSelections[clause.id] = {
              ...newSelections[clause.id],
              selected: isUserModified ? newSelections[clause.id].selected : isActive,
              text: dynamicText,
            };
          }
        });
        return newSelections;
      });
    }
  }, [installazioneClausesDef, clauseContext, validitaOfferta]);

  // Inizializza le clausole NOTA BENE quando il contesto cambia
  useEffect(() => {
    if (notaBeneClauses.length > 0) {
      setClauseSelections(prev => {
        const newSelections = { ...prev };
        notaBeneClauses.forEach(clause => {
          const isActive = clause.condition(clauseContext);
          
          if (!newSelections[clause.id]) {
            newSelections[clause.id] = { selected: isActive, text: clause.defaultText };
          } else {
            const isUserModified = userModifiedClauses.has(clause.id);
            if (!isUserModified) {
              newSelections[clause.id] = { ...newSelections[clause.id], selected: isActive };
            }
          }
        });
        return newSelections;
      });
    }
  }, [notaBeneClauses, clauseContext]);

  // Funzioni helper per gestire clausole
  const toggleClause = (clauseId: string) => {
    setUserModifiedClauses(prev => new Set(prev).add(clauseId));
    setClauseSelections(prev => ({
      ...prev,
      [clauseId]: {
        ...prev[clauseId],
        selected: !prev[clauseId]?.selected
      }
    }));
  };

  const updateClauseText = (clauseId: string, text: string) => {
    setClauseSelections(prev => ({
      ...prev,
      [clauseId]: {
        ...prev[clauseId],
        text
      }
    }));
  };

  // Initialize checklist items when articles load (include both SCAFFOLDING and SCAFFOLDING_LABOR)
  // Also adds missing articles if allChecklistArticles changes (e.g., labor-only articles load after rental)
  useEffect(() => {
    if (allChecklistArticles.length > 0) {
      setChecklistItems(prevMap => {
        // Check if any articles are missing from the map
        const missingArticles = allChecklistArticles.filter(a => !prevMap.has(a.id));
        if (missingArticles.length === 0 && prevMap.size > 0) {
          return prevMap; // No changes needed
        }
        
        // Create new map with existing entries + missing articles
        const newMap = new Map(prevMap);
        allChecklistArticles.forEach(article => {
          if (!newMap.has(article.id)) {
            const hasInstallation = article.installationData && article.installationData.length > 0;
            const defaultInstIdx = hasInstallation 
              ? (article.installationData!.findIndex(opt => opt.isDefault) ?? 0)
              : undefined;
            newMap.set(article.id, { 
              enabled: false, 
              quantity: 0,
              installationIndex: hasInstallation ? Math.max(0, defaultInstIdx ?? 0) : undefined
            });
          }
        });
        return newMap;
      });
    }
  }, [allChecklistArticles]);

  // Initialize service items
  useEffect(() => {
    if (documentArticles.length > 0 || serviceArticles.length > 0) {
      setServiceItems(prevMap => {
        const allServiceArticles = [...documentArticles, ...serviceArticles];
        const missingArticles = allServiceArticles.filter(a => !prevMap.has(a.id));
        if (missingArticles.length === 0 && prevMap.size > 0) {
          return prevMap;
        }
        const newMap = new Map(prevMap);
        documentArticles.forEach(article => {
          if (!newMap.has(article.id)) {
            newMap.set(article.id, { enabled: false, quantity: 1, optionIndex: 0 });
          }
        });
        serviceArticles.forEach(article => {
          if (!newMap.has(article.id)) {
            newMap.set(article.id, { enabled: false, quantity: 1 });
          }
        });
        return newMap;
      });
    }
  }, [documentArticles, serviceArticles]);

  // Active promo codes (fetched fresh when entering Step 5)
  const { data: activePromos = [], refetch: refetchActivePromos } = useQuery<Array<{
    id: string;
    code: string;
    description: string | null;
    discountPercent: string;
    articleCodes: string[];
  }>>({
    queryKey: ["/api/promo-codes/active"],
    enabled: false, // Only fetch on demand (triggered when entering Step 5)
    staleTime: 0, // Always fresh when fetched
  });

  // Preview mutation (modalità normale)
  const previewMutation = useMutation({
    mutationFn: async (data: { items: QuoteItemInput[]; params: QuoteGlobalParams; handlingData?: HandlingData }) => {
      const res = await apiRequest("POST", "/api/quotes/preview", data);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Errore nel calcolo");
      }
      return res.json();
    },
    onSuccess: (data: PreviewResult) => {
      setPreviewResult(data);
      setPhasesPreviewResult(null);  // Reset phases result
      setPendingPromos(null); // Will be set after refetch completes
      setCurrentStep(5);
      // Fetch fresh active promos and trigger application once data arrives
      refetchActivePromos().then((result) => {
        setPendingPromos(result.data || []);
      }).catch(() => {
        setPendingPromos([]); // No promos on error
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore nel calcolo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Preview mutation per modalità FASI
  const phasesPreviewMutation = useMutation({
    mutationFn: async (data: { 
      fasi: Array<{
        id: string;
        faseIndex: number;
        enabledModules?: FaseModuleType[];
        durationMonths: number;
        distanceKm?: number;
        items?: QuoteItemInput[];
        transportItems?: QuoteItemInput[];
        montaggioItems?: QuoteItemInput[];
        smontaggioItems?: QuoteItemInput[];
        noleggioItems?: QuoteItemInput[];
        fornituraItems?: QuoteItemInput[];
        magazzinoItems?: QuoteItemInput[];
        aCorpoItems?: Array<{ articleId: string; variantIndex?: number; notes?: string; quantity: number; totalPrice: number; splitIntoPhases?: boolean }>;
        handlingData?: HandlingData;
      }>;
      documentItems: QuoteItemInput[];
      params: { distanceKm: number; posManualEnabled?: boolean; posManualPrice?: number; reteAntipolvereQtyML?: number };
    }) => {
      const res = await apiRequest("POST", "/api/quotes/preview-phases", data);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Errore nel calcolo fasi");
      }
      return res.json();
    },
    onSuccess: (data: PhasesPreviewResult) => {
      setPhasesPreviewResult(data);
      setPreviewResult(null);  // Reset normal result
      setPendingPromos(null); // Will be set after refetch completes
      setCurrentStep(5);
      // Fetch fresh active promos and trigger application once data arrives
      refetchActivePromos().then((result) => {
        setPendingPromos(result.data || []);
      }).catch(() => {
        setPendingPromos([]); // No promos on error
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore nel calcolo fasi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { 
      opportunityId: string; 
      items: QuoteItemInput[]; 
      params: QuoteGlobalParams; 
      discounts?: QuoteDiscounts; 
      handlingData?: HandlingData; 
      pdfData?: any;
      customNumber?: string;
      transportDetails?: { 
        transpallet?: string; 
        posizCamion?: string; 
        puoScaricare?: string; 
        luogoScarico?: string[]; 
        ritiroEsubero?: boolean; 
        cartelliStradali?: string; 
        permessiViabilita?: string; 
        permessoSosta?: string; 
      };
      ponteggioDetails?: {
        ponteggioPerArray?: string[];
        gruCantiere?: string;
        luciSegnalazione?: string;
        aCaricoClienteArray?: string[];
        orariLavoro?: string;
        ancoraggi?: string;
        maestranze?: string;
        montacarichi?: {
          tipoSbarchi: string;
          ruoteMovimentazione: string;
          traliccio: string;
          terzaSponda: string;
          altro: string;
        };
      };
    }) => {
      const method = isEditMode ? "PUT" : "POST";
      const url = isEditMode ? `/api/quotes/${editQuoteId}` : "/api/quotes";
      const res = await apiRequest(method, url, data);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Errore nel salvataggio");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast({
        title: isEditMode ? "Preventivo aggiornato" : "Preventivo creato",
        description: isEditMode ? "Il preventivo è stato aggiornato con successo." : "Il preventivo è stato salvato con successo.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "quotes"] });
      if (isEditMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/quotes", editQuoteId] });
      } else if (data?.id) {
        const newUrl = `/opportunities/${opportunityId}/quotes/new?edit=${data.id}`;
        window.history.replaceState(null, "", newUrl);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Errore nel salvataggio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Build items array for API
  const buildQuoteItems = (): QuoteItemInput[] => {
    const items: QuoteItemInput[] = [];

    // Transport items
    transportItems.forEach(ti => {
      if (ti.quantity > 0 && ti.articleId) {
        items.push({
          articleId: ti.articleId,
          quantity: ti.quantity,
          vehicleIndex: ti.vehicleIndex,
          note: ti.note?.trim() || undefined,
        });
      }
    });

    // POS/Pimus - manuale o automatico
    if (posArticle && (posManualEnabled || ponteggioMq > 0)) {
      items.push({
        articleId: posArticle.id,
        quantity: 1,
        optionIndex: posManualEnabled ? undefined : posOptionIndex,
        // Se manuale, passiamo il prezzo come override (gestito lato frontend nel preview)
      });
    }

    // Service items (documents except POS + extras)
    serviceItems.forEach((value, articleId) => {
      // Skip POS since it's auto-calculated
      if (articleId === posArticle?.id) return;
      if (value.enabled && value.quantity > 0) {
        items.push({
          articleId,
          quantity: value.quantity,
          optionIndex: value.optionIndex,
        });
      }
    });

    // Ritiro esubero - aggiunge 1 viaggio furgone per ritiro spazzatura
    if (ritiroEsuberoEnabled && furgoneArticle) {
      items.push({
        articleId: furgoneArticle.id,
        quantity: 1, // 1 viaggio
      });
    }

    // Extra checklist items - voci aggiuntive duplicabili
    extraChecklistItems.forEach(extra => {
      if (extra.quantity > 0) {
        const article = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
        const hasInstallation = article?.installationData && article.installationData.length > 0;
        const hasVariants = article?.variantsData && article.variantsData.length > 0;
        
        // Compute effective variant index with default fallback (same logic as checklist items)
        let effectiveVariantIndex: number | undefined = undefined;
        if (hasVariants) {
          if (extra.variantIndex !== undefined) {
            effectiveVariantIndex = extra.variantIndex;
          } else {
            const defaultIdx = article!.variantsData!.findIndex((v: ArticleVariant) => v.isDefault);
            effectiveVariantIndex = defaultIdx >= 0 ? defaultIdx : 0;
          }
        }
        
        // Compute effective installation index with default fallback
        let effectiveInstallationIndex: number | undefined = undefined;
        if (hasInstallation) {
          effectiveInstallationIndex = extra.installationIndex ?? 0;
        }
        
        items.push({
          articleId: extra.articleId,
          quantity: extra.quantity,
          installationIndex: effectiveInstallationIndex,
          variantIndex: effectiveVariantIndex,
          useCesta: extra.useCesta,
          note: extra.notes?.trim() || undefined,
          hoistAltezzaMetri: extra.hoistAltezzaMetri,
          hoistNumSbarchi: extra.hoistNumSbarchi,
          hoistSbalzoMq: extra.hoistSbalzoMq,
        });
      }
    });

    return items;
  };

  const buildModuleItemInputs = (moduleItems: ExtraChecklistItem[]): QuoteItemInput[] => {
    // In a_corpo mode: usa prezzo manuale (manualUnitPrice × quantity)
    if (quoteMode === 'a_corpo') {
      return moduleItems
        .filter(extra => (extra.manualUnitPrice || 0) > 0 && (extra.quantity || 0) > 0)
        .map(extra => ({
          articleId: 'MANUAL',
          quantity: extra.quantity || 1,
          note: extra.notes?.trim() || undefined,
          totalPrice: (extra.manualUnitPrice || 0) * (extra.quantity || 1),
        }));
    }
    // Modalità standard: catalogo articoli
    return moduleItems
      .filter(extra => extra.quantity > 0 && extra.articleId)
      .map(extra => {
        const article = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
        const hasInstallation = article?.installationData && article.installationData.length > 0;
        const hasVariants = article?.variantsData && article.variantsData.length > 0;
        
        let effectiveVariantIndex: number | undefined = undefined;
        if (hasVariants) {
          if (extra.variantIndex !== undefined) {
            effectiveVariantIndex = extra.variantIndex;
          } else {
            const defaultIdx = article!.variantsData!.findIndex((v: ArticleVariant) => v.isDefault);
            effectiveVariantIndex = defaultIdx >= 0 ? defaultIdx : 0;
          }
        }
        
        let effectiveInstallationIndex: number | undefined = undefined;
        if (hasInstallation) {
          effectiveInstallationIndex = extra.installationIndex ?? 0;
        }
        
        return {
          articleId: extra.articleId,
          quantity: extra.quantity,
          installationIndex: effectiveInstallationIndex,
          variantIndex: effectiveVariantIndex,
          useCesta: extra.useCesta,
          note: extra.notes?.trim() || undefined,
          hoistAltezzaMetri: extra.hoistAltezzaMetri,
          hoistNumSbarchi: extra.hoistNumSbarchi,
          hoistSbalzoMq: extra.hoistSbalzoMq,
          warehouseCostEnabled: extra.warehouseCostEnabled,
        };
      });
  };

  const buildFaseTransportItems = (fase: QuoteFaseData): QuoteItemInput[] => {
    return fase.transportItems
      .filter(ti => ti.quantity > 0 && ti.articleId)
      .map(ti => ({
        articleId: ti.articleId,
        quantity: ti.quantity,
        vehicleIndex: ti.vehicleIndex,
        note: ti.note?.trim() || undefined,
      }));
  };

  // Build handling data for a single fase
  const buildFaseHandlingData = (fase: QuoteFaseData): HandlingData | undefined => {
    if (!fase.handlingEnabled) return undefined;
    
    return {
      enabled: true,
      zones: fase.handlingZones,
      saltareti: { 
        included: fase.saltaretiEnabled, 
        quantity: fase.saltaretiQuantity 
      },
      extraPrice: fase.handlingExtraPrice,
    };
  };

  // Navigation handlers
  const handleNext = () => {
    if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Step 2 -> 3: passa semplicemente al prossimo step (Dettagli Tecnici)
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Step 3 -> 4: passa semplicemente al prossimo step (Clausole e Note)
      setCurrentStep(4);
    } else if (currentStep === 4) {
      // Step 4 -> 5: Calculate preview and go to Revisione & Sconti
      
      // ==================== MODALITÀ FASI ====================
      if (isPhaseLikeMode) {
        // Costruisci array di fasi per il backend
        const fasiInput = fasi.map((fase, index) => {
          const validACorpoItems = fase.aCorpoItems
            .filter(item => item.articleId && item.totalPrice > 0)
            .map(({ articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases }) => ({ 
              articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases 
            }));
          
          return {
            id: fase.id,
            faseIndex: index,
            enabledModules: fase.enabledModules,
            durationMonths: fase.durationMonths,
            distanceKm: fase.distanceKm,
            transportItems: buildFaseTransportItems(fase),
            montaggioItems: fase.enabledModules.includes('montaggio') ? buildModuleItemInputs(fase.montaggioItems) : [],
            smontaggioItems: fase.enabledModules.includes('smontaggio') ? buildModuleItemInputs(fase.smontaggioItems) : [],
            noleggioItems: fase.enabledModules.includes('noleggio') ? buildModuleItemInputs(fase.noleggioItems) : [],
            fornituraItems: fase.enabledModules.includes('fornitura') ? buildModuleItemInputs(fase.fornituraItems) : [],
            magazzinoItems: fase.enabledModules.includes('magazzino') ? buildModuleItemInputs(fase.magazzinoItems) : [],
            aCorpoItems: validACorpoItems.length > 0 ? validACorpoItems : undefined,
            handlingData: buildFaseHandlingData(fase),
          };
        });

        // Prepara documenti (comuni a tutte le fasi)
        const documentItems: QuoteItemInput[] = [];
        
        // POS/Pimus
        if (posArticle && (posManualEnabled || ponteggioMq > 0)) {
          documentItems.push({
            articleId: posArticle.id,
            quantity: 1,
            optionIndex: posManualEnabled ? undefined : posOptionIndex,
          });
        }
        
        // Altri documenti e servizi
        serviceItems.forEach((value, articleId) => {
          if (articleId === posArticle?.id) return;
          if (value.enabled && value.quantity > 0) {
            documentItems.push({
              articleId,
              quantity: value.quantity,
              optionIndex: value.optionIndex,
            });
          }
        });

        // Chiama il backend con le fasi
        phasesPreviewMutation.mutate({
          fasi: fasiInput,
          documentItems,
          params: {
            distanceKm,
            posManualEnabled: posManualEnabled || undefined,
            posManualPrice: posManualEnabled ? posManualPrice : undefined,
            reteAntipolvereQtyML: reteAntipolvereQtyML > 0 ? reteAntipolvereQtyML : undefined,
          },
        });
        return;
      }

      // ==================== MODALITÀ NORMALE (RENTAL/LABOR_ONLY) ====================
      const items = buildQuoteItems();
      const hasACorpoItems = aCorpoItems.some(item => item.articleId && item.totalPrice > 0);

      // Se non ci sono articoli dal catalogo, vai direttamente allo step 5
      // con un previewResult vuoto (i totali manuali/"A corpo" sono calcolati nel frontend)
      if (items.length === 0) {
        setPreviewResult({
          items: [],
          phases: [],
          sections: {
            documenti: 0,
            trasporto_andata: 0,
            montaggio: 0,
            noleggio: 0,
            smontaggio: 0,
            trasporto_ritorno: 0,
          },
          total: 0,
        });
        setCurrentStep(5);
        return;
      }

      // Prepara voci "A corpo" per preview
      const validACorpoItems = aCorpoItems
        .filter(item => item.articleId && item.totalPrice > 0)
        .map(({ articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases }) => ({ articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases }));

      previewMutation.mutate({
        items,
        params: { 
          durationMonths, 
          distanceKm,
          quoteMode,
          logisticsDifficulty: "LOW" as const,
          aCorpoItems: validACorpoItems.length > 0 ? validACorpoItems : undefined,
          posManualEnabled: posManualEnabled || undefined,
          posManualPrice: posManualEnabled ? posManualPrice : undefined,
          reteAntipolvereQtyML: reteAntipolvereQtyML > 0 ? reteAntipolvereQtyML : undefined,
        },
        handlingData: buildHandlingData(),
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const { setDirty: setValidationDirty, handleOpenChange: handleValidationConfirmClose, ConfirmCloseDialog: ValidationConfirmCloseDialog } = useConfirmClose();
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfDownloadLoading, setPdfDownloadLoading] = useState(false);
  const [validationMissingReferent, setValidationMissingReferent] = useState(false);
  const [validationMissingPayment, setValidationMissingPayment] = useState(false);
  const [validationSelectedPaymentId, setValidationSelectedPaymentId] = useState("");
  const [validationSelectedReferentId, setValidationSelectedReferentId] = useState("");
  const [validationNewRefFirstName, setValidationNewRefFirstName] = useState("");
  const [validationNewRefLastName, setValidationNewRefLastName] = useState("");
  const [validationNewRefEmail, setValidationNewRefEmail] = useState("");
  const [validationNewRefPhone, setValidationNewRefPhone] = useState("");
  const [validationCreateNewRef, setValidationCreateNewRef] = useState(false);
  const [validationSaving, setValidationSaving] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!showValidationDialog) {
      setValidationDirty(false);
      return;
    }
    const hasInput = validationSelectedPaymentId !== "" ||
      validationSelectedReferentId !== "" ||
      validationNewRefFirstName.trim() !== "" ||
      validationNewRefLastName.trim() !== "" ||
      validationNewRefEmail.trim() !== "" ||
      validationNewRefPhone.trim() !== "";
    setValidationDirty(hasInput);
  }, [showValidationDialog, validationSelectedPaymentId, validationSelectedReferentId, validationNewRefFirstName, validationNewRefLastName, validationNewRefEmail, validationNewRefPhone, setValidationDirty]);

  const ponteggioMq = useMemo(() => {
    let total = 0;
    if (isPhaseLikeMode) {
      fasi.forEach((fase) => {
        if (!fase.enabledModules.includes('montaggio')) return;
        fase.montaggioItems.forEach((extra) => {
          if (!extra.articleId || extra.quantity <= 0) return;
          const article = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
          if (article && article.unitType === "MQ") {
            const nameLower = article.name.toLowerCase();
            if (nameLower.includes("ponteggio")) {
              total += extra.quantity;
            }
          }
        });
      });
    } else {
      for (const [articleId, state] of allChecklistEntries) {
        if (!state.enabled || state.quantity <= 0) continue;
        const article = allChecklistArticles.find((a: Article) => a.id === articleId);
        if (article && article.unitType === "MQ") {
          const nameLower = article.name.toLowerCase();
          if (nameLower.includes("ponteggio")) {
            total += state.quantity;
          }
        }
      }
      extraChecklistItems.forEach((extra) => {
        if (extra.articleId && extra.quantity > 0) {
          const article = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
          if (article && article.unitType === "MQ") {
            const nameLower = article.name.toLowerCase();
            if (nameLower.includes("ponteggio")) {
              total += extra.quantity;
            }
          }
        }
      });
    }
    return total;
  }, [allChecklistEntries, extraChecklistItems, allChecklistArticles, quoteMode, fasi]);

  const reteAntipolvereQtyML = useMemo(() => {
    const nol010 = articles.find(a => a.code === "NOL-010");
    if (!nol010) return 0;
    const state = checklistItems.get(nol010.id);
    if (!state || !state.enabled || state.quantity <= 0) return 0;
    return state.quantity;
  }, [articles, checklistItems]);

  const posOptions = useMemo(() => {
    if (!posArticle) return [];
    const data = posArticle.pricingData as DocumentPricingData;
    return data?.options || [];
  }, [posArticle]);
  const posOptionIndex = ponteggioMq > 1000 && posOptions.length > 1 ? 1 : 0;

  const validateQuoteBeforeAction = useCallback((): boolean => {
    const missingReferent = !contactReferent && lead?.entityType !== "PRIVATE";
    const missingPayment = !lead?.paymentMethodId;

    if (missingReferent || missingPayment) {
      setValidationMissingReferent(!!missingReferent);
      setValidationMissingPayment(!!missingPayment);
      setValidationSelectedPaymentId("");
      setValidationSelectedReferentId("");
      setValidationNewRefFirstName("");
      setValidationNewRefLastName("");
      setValidationNewRefEmail("");
      setValidationNewRefPhone("");
      setValidationCreateNewRef(!referents?.length);
      setShowValidationDialog(true);
      return false;
    }
    return true;
  }, [contactReferent, lead?.paymentMethodId, lead?.entityType, referents]);

  const handleValidationSaveAndProceed = async () => {
    setValidationSaving(true);
    try {
      if (validationMissingPayment && validationSelectedPaymentId) {
        await apiRequest("PATCH", `/api/leads/${lead?.id}`, { paymentMethodId: validationSelectedPaymentId });
        await queryClient.invalidateQueries({ queryKey: ["/api/leads", opportunity?.leadId] });
      }
      if (validationMissingReferent) {
        if (validationCreateNewRef) {
          const res = await apiRequest("POST", `/api/leads/${opportunity?.leadId}/referents`, {
            firstName: validationNewRefFirstName || "",
            lastName: validationNewRefLastName || "",
            email: validationNewRefEmail || "",
            phone: validationNewRefPhone || "",
          });
          if (res.ok) {
            const newRef = await res.json();
            await apiRequest("PATCH", `/api/opportunities/${opportunityId}`, { referentId: newRef.id });
            await queryClient.invalidateQueries({ queryKey: ["/api/leads", opportunity?.leadId, "referents"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId] });
          }
        } else if (validationSelectedReferentId) {
          await apiRequest("PATCH", `/api/opportunities/${opportunityId}`, { referentId: validationSelectedReferentId });
          await queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId] });
        }
      }
      toast({ title: "Dati aggiornati", description: "I dati mancanti sono stati salvati. Ora puoi procedere." });
      setShowValidationDialog(false);
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action) {
        setTimeout(() => action(), 600);
      }
    } catch (err) {
      toast({ title: "Errore", description: "Errore nel salvataggio dei dati.", variant: "destructive" });
    } finally {
      setValidationSaving(false);
    }
  };

  const handleValidationSkip = () => {
    setShowValidationDialog(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) action();
  };

  const buildPdfClauseSelections = () => ({
    ...clauseSelections,
    ...(campoLiberoInstallazione.trim() ? { custom_note: { selected: true, text: campoLiberoInstallazione.trim() } } : {}),
    ...(campoLiberoServizi.trim() ? { custom_service_note: { selected: true, text: campoLiberoServizi.trim() } } : {}),
    ...(campoLiberoClausole.trim() ? { custom_clause_note: { selected: true, text: campoLiberoClausole.trim() } } : {}),
  });

  const buildPdfQuoteProps = (phasesResultOverride?: PhasesPreviewResult | null) => ({
    number: customQuoteNumber || "",
    items: previewResult,
    globalParams: { durationMonths, distanceKm, vatRateDefault, optionalServices, optionalServicesTexts, aCorpoItems, lagunariBarcaVariantIndex, lagunariNumeroBarca },
    checklistItems: Array.from(checklistItems.entries()),
    transportItems,
    serviceItems: Array.from(serviceItems.entries()),
    discounts: Array.from(itemDiscounts.entries()),
    globalDiscount: globalDiscountPercent,
    movMountDiscount,
    movDismountDiscount,
    handlingEnabled,
    handlingZones,
    saltaretiEnabled,
    saltaretiQuantity,
    handlingExtraPrice,
    opportunity,
    lead,
    vatRateDefault,
    itemVatOverrides: Array.from(itemVatOverrides.entries()),
    vatBreakdown: isPhaseLikeMode ? calculatePhasesVatBreakdown(phasesResultOverride) : calculateVatBreakdownByRate(calculateTotalsWithDiscounts()),
    totals: isPhaseLikeMode ? calculatePhasesTotalsForPdf(phasesResultOverride) : calculateTotalsWithDiscounts(),
    notaBene: [],
    paymentMethodName,
    extraDiscountAmount,
    extraDiscountNote,
    appliedPromos,
    quoteMode,
    fasiConfig: isPhaseLikeMode ? fasi : undefined,
    lagunariItems: calcolaVeneziaTransport ? buildLagunariItems(calcolaVeneziaTransport) : [],
    lagunariAndataItems: (() => {
      if (!calcolaVeneziaTransport) return [];
      return buildLagunariAndataItems(calcolaVeneziaTransport)
        .filter(item => !deletedLagunariItems.has(item.key))
        .map(item => {
          const override = lagunariAmountOverrides.get(item.key);
          const discount = lagunariDiscounts.get(item.key) || 0;
          const basePrice = override !== null && override !== undefined ? override : item.total;
          const effectiveTotal = round2(basePrice * (1 - discount / 100));
          const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
          return { ...item, label: 'Trasporto lagunare', total: effectiveTotal, unitPrice: effectiveTotal, vatRate: lagVat };
        });
    })(),
    lagunariRitornoItems: (() => {
      if (!calcolaVeneziaTransport) return [];
      return buildLagunariRitornoItems(calcolaVeneziaTransport)
        .filter(item => !deletedLagunariItems.has(item.key))
        .map(item => {
          const override = lagunariAmountOverrides.get(item.key);
          const discount = lagunariDiscounts.get(item.key) || 0;
          const basePrice = override !== null && override !== undefined ? override : item.total;
          const effectiveTotal = round2(basePrice * (1 - discount / 100));
          const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
          return { ...item, label: 'Trasporto lagunare', total: effectiveTotal, unitPrice: effectiveTotal, vatRate: lagVat };
        });
    })(),
  });

  const handlePreviewPdf = useCallback(async () => {
    if (!validateQuoteBeforeAction()) return;
    setPdfPreviewLoading(true);
    try {
      let phasesOverride: PhasesPreviewResult | null | undefined;

      if (isPhaseLikeMode && !phasesPreviewResult) {
        const fasiInput = fasi.map((fase, index) => {
          const validACorpoItems = fase.aCorpoItems
            .filter(item => item.articleId && item.totalPrice > 0)
            .map(({ articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases }) => ({
              articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases
            }));

          return {
            id: fase.id,
            faseIndex: index,
            enabledModules: fase.enabledModules,
            durationMonths: fase.durationMonths,
            distanceKm: fase.distanceKm,
            transportItems: buildFaseTransportItems(fase),
            montaggioItems: fase.enabledModules.includes('montaggio') ? buildModuleItemInputs(fase.montaggioItems) : [],
            smontaggioItems: fase.enabledModules.includes('smontaggio') ? buildModuleItemInputs(fase.smontaggioItems) : [],
            noleggioItems: fase.enabledModules.includes('noleggio') ? buildModuleItemInputs(fase.noleggioItems) : [],
            fornituraItems: fase.enabledModules.includes('fornitura') ? buildModuleItemInputs(fase.fornituraItems) : [],
            magazzinoItems: fase.enabledModules.includes('magazzino') ? buildModuleItemInputs(fase.magazzinoItems) : [],
            aCorpoItems: validACorpoItems.length > 0 ? validACorpoItems : undefined,
            handlingData: buildFaseHandlingData(fase),
          };
        });

        const documentItems: QuoteItemInput[] = [];
        if (posArticle && (posManualEnabled || ponteggioMq > 0)) {
          documentItems.push({
            articleId: posArticle.id,
            quantity: 1,
            optionIndex: posManualEnabled ? undefined : posOptionIndex,
          });
        }
        serviceItems.forEach((value, articleId) => {
          if (articleId === posArticle?.id) return;
          if (value.enabled && value.quantity > 0) {
            documentItems.push({
              articleId,
              quantity: value.quantity,
              optionIndex: value.optionIndex,
            });
          }
        });

        const res = await apiRequest("POST", "/api/quotes/preview-phases", {
          fasi: fasiInput,
          documentItems,
          params: {
            distanceKm,
            posManualEnabled: posManualEnabled || undefined,
            posManualPrice: posManualEnabled ? posManualPrice : undefined,
            reteAntipolvereQtyML: reteAntipolvereQtyML > 0 ? reteAntipolvereQtyML : undefined,
          },
        });
        if (res.ok) {
          phasesOverride = await res.json();
          setPhasesPreviewResult(phasesOverride!);
        }
      }

      const doc = <QuotePdfDocument quote={buildPdfQuoteProps(phasesOverride)} company={company} articles={articles} user={opportunityOwner} clauseSelections={buildPdfClauseSelections()} billingProfile={billingProfile} contactReferent={contactReferent} />;
      const blob = await pdf(doc).toBlob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setPdfPreviewUrl(dataUrl);
    } catch (err) {
      console.error("Errore generazione anteprima PDF:", err);
      toast({ title: "Errore", description: "Impossibile generare l'anteprima del PDF", variant: "destructive" });
    } finally {
      setPdfPreviewLoading(false);
    }
  }, [previewResult, phasesPreviewResult, company, articles, opportunityOwner, billingProfile, contactReferent, clauseSelections, customQuoteNumber, durationMonths, distanceKm, vatRateDefault, optionalServices, optionalServicesTexts, aCorpoItems, checklistItems, transportItems, serviceItems, itemDiscounts, globalDiscountPercent, movMountDiscount, movDismountDiscount, handlingEnabled, handlingZones, saltaretiEnabled, saltaretiQuantity, handlingExtraPrice, opportunity, lead, itemVatOverrides, paymentMethodName, extraDiscountAmount, extraDiscountNote, quoteMode, fasi, isPhaseLikeMode, campoLiberoInstallazione, campoLiberoServizi, campoLiberoClausole, posArticle, posManualEnabled, ponteggioMq, posOptionIndex, posManualPrice, calcolaVeneziaTransport, lagunariAmountOverrides, lagunariDiscounts, deletedLagunariItems, lagunariVatOverrides]);

  const handleDownloadPdf = useCallback(async () => {
    if (!validateQuoteBeforeAction()) return;
    setPdfDownloadLoading(true);
    try {
      let phasesOverride: PhasesPreviewResult | null | undefined;

      if (isPhaseLikeMode && !phasesPreviewResult) {
        const fasiInput = fasi.map((fase, index) => {
          const validACorpoItems = fase.aCorpoItems
            .filter(item => item.articleId && item.totalPrice > 0)
            .map(({ articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases }) => ({
              articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases
            }));

          return {
            id: fase.id,
            faseIndex: index,
            enabledModules: fase.enabledModules,
            durationMonths: fase.durationMonths,
            distanceKm: fase.distanceKm,
            transportItems: buildFaseTransportItems(fase),
            montaggioItems: fase.enabledModules.includes('montaggio') ? buildModuleItemInputs(fase.montaggioItems) : [],
            smontaggioItems: fase.enabledModules.includes('smontaggio') ? buildModuleItemInputs(fase.smontaggioItems) : [],
            noleggioItems: fase.enabledModules.includes('noleggio') ? buildModuleItemInputs(fase.noleggioItems) : [],
            fornituraItems: fase.enabledModules.includes('fornitura') ? buildModuleItemInputs(fase.fornituraItems) : [],
            magazzinoItems: fase.enabledModules.includes('magazzino') ? buildModuleItemInputs(fase.magazzinoItems) : [],
            aCorpoItems: validACorpoItems.length > 0 ? validACorpoItems : undefined,
            handlingData: buildFaseHandlingData(fase),
          };
        });

        const documentItems: QuoteItemInput[] = [];
        if (posArticle && (posManualEnabled || ponteggioMq > 0)) {
          documentItems.push({
            articleId: posArticle.id,
            quantity: 1,
            optionIndex: posManualEnabled ? undefined : posOptionIndex,
          });
        }
        serviceItems.forEach((value, articleId) => {
          if (articleId === posArticle?.id) return;
          if (value.enabled && value.quantity > 0) {
            documentItems.push({
              articleId,
              quantity: value.quantity,
              optionIndex: value.optionIndex,
            });
          }
        });

        const res = await apiRequest("POST", "/api/quotes/preview-phases", {
          fasi: fasiInput,
          documentItems,
          params: {
            distanceKm,
            posManualEnabled: posManualEnabled || undefined,
            posManualPrice: posManualEnabled ? posManualPrice : undefined,
            reteAntipolvereQtyML: reteAntipolvereQtyML > 0 ? reteAntipolvereQtyML : undefined,
          },
        });
        if (res.ok) {
          phasesOverride = await res.json();
          setPhasesPreviewResult(phasesOverride!);
        }
      }

      const pdfFilename = workType === "PUBLIC" ? `Preventivo ${customQuoteNumber || "draft"} (Partners).pdf` : `Preventivo ${customQuoteNumber || "draft"}.pdf`;
      const doc = <QuotePdfDocument quote={buildPdfQuoteProps(phasesOverride)} company={company} articles={articles} user={opportunityOwner} clauseSelections={buildPdfClauseSelections()} billingProfile={billingProfile} contactReferent={contactReferent} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      doSave();
    } catch (err) {
      console.error("Errore generazione PDF:", err);
      toast({ title: "Errore", description: "Impossibile generare il PDF", variant: "destructive" });
    } finally {
      setPdfDownloadLoading(false);
    }
  }, [previewResult, phasesPreviewResult, company, articles, opportunityOwner, billingProfile, contactReferent, clauseSelections, customQuoteNumber, durationMonths, distanceKm, vatRateDefault, optionalServices, optionalServicesTexts, aCorpoItems, checklistItems, transportItems, serviceItems, itemDiscounts, globalDiscountPercent, movMountDiscount, movDismountDiscount, handlingEnabled, handlingZones, saltaretiEnabled, saltaretiQuantity, handlingExtraPrice, opportunity, lead, itemVatOverrides, paymentMethodName, extraDiscountAmount, extraDiscountNote, quoteMode, fasi, isPhaseLikeMode, campoLiberoInstallazione, campoLiberoServizi, campoLiberoClausole, posArticle, posManualEnabled, ponteggioMq, posOptionIndex, posManualPrice, workType, calcolaVeneziaTransport, lagunariAmountOverrides, lagunariDiscounts, deletedLagunariItems, lagunariVatOverrides]);

  const handleSave = () => {
    if (!validateQuoteBeforeAction()) {
      pendingActionRef.current = () => doSave();
      return;
    }
    doSave();
  };

  const doSave = () => {
    const items = buildQuoteItems();

    // Build discounts object with per-item discounts
    const itemDiscountsList: QuoteItemDiscount[] = [];
    itemDiscounts.forEach((percent, key) => {
      if (percent > 0) {
        const [phase, itemIndexStr] = key.split(":");
        itemDiscountsList.push({
          phase: phase as QuotePhase,
          itemIndex: parseInt(itemIndexStr),
          discountPercent: percent,
        });
      }
    });

    const discounts: QuoteDiscounts = {
      itemDiscounts: itemDiscountsList.length > 0 ? itemDiscountsList : undefined,
      globalDiscountPercent: globalDiscountPercent > 0 ? globalDiscountPercent : undefined,
    };

    const validACorpoItems = aCorpoItems
      .filter(item => item.articleId && item.totalPrice > 0)
      .map(({ articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases }) => ({ articleId, variantIndex, notes, quantity, totalPrice, splitIntoPhases }));

    const transportDetails = {
      transpallet: transpallet || undefined,
      posizCamion: posizCamion || undefined,
      puoScaricare: puoScaricare || undefined,
      luogoScarico: luogoScarico.length > 0 ? luogoScarico : undefined,
      ritiroEsubero,
      cartelliStradali: cartelliStradali || undefined,
      permessiViabilita: permessiViabilita || undefined,
      permessoSosta: permessoSosta || undefined,
    };

    // Dettagli tecnici ponteggio - sempre disponibili
    const ponteggioDetails = {
      ponteggioPerArray: ponteggioPerArray.length > 0 ? ponteggioPerArray : undefined,
      ponteggioPerAltroNote: ponteggioPerAltroNote || undefined,
      gruCantiere: gruCantiere || undefined,
      luciSegnalazione: luciSegnalazione || undefined,
      aCaricoClienteArray: aCaricoClienteArray.length > 0 ? aCaricoClienteArray : undefined,
      aCaricoClienteAltroNote: aCaricoClienteAltroNote || undefined,
      orariLavoro: orariLavoro || undefined,
      ancoraggi: ancoraggi || undefined,
      ancoraggiAltroNote: ancoraggiAltroNote || undefined,
      maestranze: maestranze || undefined,
      montacarichi: (montacarichiTipoSbarchi || montacarichiRuote || montacarichiTraliccio || montacarichiTerzaSponda || montacarichiAltro) ? {
        tipoSbarchi: montacarichiTipoSbarchi || "",
        ruoteMovimentazione: montacarichiRuote || "",
        traliccio: montacarichiTraliccio || "",
        terzaSponda: montacarichiTerzaSponda || "",
        altro: montacarichiAltro || "",
      } : undefined,
    };

    const computedTotals = isPhaseLikeMode ? calculatePhasesTotalsForPdf() : calculateTotalsWithDiscounts();
    const pdfData = {
      quote: {
        quoteMode,
        items: previewResult,
        globalParams: { durationMonths, distanceKm, squadraInZonaEnabled, squadraInZonaKm, vatRateDefault, optionalServices, optionalServicesTexts, aCorpoItems: validACorpoItems, posManualEnabled, posManualPrice, lagunariBarcaVariantIndex, lagunariNumeroBarca },
        checklistItems: Array.from(checklistItems.entries()),
        extraChecklistItems,
        transportItems,
        serviceItems: Array.from(serviceItems.entries()),
        discounts: Array.from(itemDiscounts.entries()),
        globalDiscount: globalDiscountPercent,
        movMountDiscount,
        movDismountDiscount,
        handlingEnabled,
        handlingZones,
        saltaretiEnabled,
        saltaretiQuantity,
        handlingExtraPrice,
        difficultyEnabled,
        difficultyItems,
        ritiroEsuberoEnabled,
        squadraInZonaEnabled,
        squadraInZonaKm,
        opportunity: { ...opportunity, ...transportDetails, ...ponteggioDetails },
        lead,
        vatRateDefault,
        itemVatOverrides: Array.from(itemVatOverrides.entries()),
        vatBreakdown: isPhaseLikeMode ? calculatePhasesVatBreakdown() : calculateVatBreakdownByRate(computedTotals),
        totals: computedTotals,
        manualMontaggioRows,
        manualSmontaggioRows,
        manualNoleggioRows,
        itemAmountOverrides: Array.from(itemAmountOverrides.entries()),
        unitPriceOverrides: Array.from(unitPriceOverrides.entries()),
        extraDiscountAmount,
        lagunariItems: calcolaVeneziaTransport ? buildLagunariItems(calcolaVeneziaTransport) : [],
        lagunariAndataItems: (() => {
          if (!calcolaVeneziaTransport) return [];
          return buildLagunariAndataItems(calcolaVeneziaTransport)
            .filter(item => !deletedLagunariItems.has(item.key))
            .map(item => {
              const override = lagunariAmountOverrides.get(item.key);
              const discount = lagunariDiscounts.get(item.key) || 0;
              const basePrice = override !== null && override !== undefined ? override : item.total;
              const effectiveTotal = round2(basePrice * (1 - discount / 100));
              const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
              return { ...item, label: 'Trasporto lagunare', total: effectiveTotal, unitPrice: effectiveTotal, vatRate: lagVat };
            });
        })(),
        lagunariRitornoItems: (() => {
          if (!calcolaVeneziaTransport) return [];
          return buildLagunariRitornoItems(calcolaVeneziaTransport)
            .filter(item => !deletedLagunariItems.has(item.key))
            .map(item => {
              const override = lagunariAmountOverrides.get(item.key);
              const discount = lagunariDiscounts.get(item.key) || 0;
              const basePrice = override !== null && override !== undefined ? override : item.total;
              const effectiveTotal = round2(basePrice * (1 - discount / 100));
              const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
              return { ...item, label: 'Trasporto lagunare', total: effectiveTotal, unitPrice: effectiveTotal, vatRate: lagVat };
            });
        })(),
        extraDiscountNote,
        appliedPromos,
        notaBene: [],
        paymentMethodName,
        fasiConfig: isPhaseLikeMode ? fasi : undefined,
        phasesManualRows: isPhaseLikeMode ? Array.from(phasesManualRows.entries()) : undefined,
        phaseItemDiscounts: isPhaseLikeMode ? Array.from(phaseItemDiscounts.entries()) : undefined,
        phaseItemAmountOverrides: isPhaseLikeMode ? Array.from(phaseItemAmountOverrides.entries()) : undefined,
        phaseUnitPriceOverrides: isPhaseLikeMode ? Array.from(phaseUnitPriceOverrides.entries()) : undefined,
        phaseItemVatOverrides: isPhaseLikeMode ? Array.from(phaseItemVatOverrides.entries()) : undefined,
        phaseHandlingMountGlobalDiscount: isPhaseLikeMode ? Array.from(phaseHandlingMountGlobalDiscount.entries()) : undefined,
        phaseHandlingDismountGlobalDiscount: isPhaseLikeMode ? Array.from(phaseHandlingDismountGlobalDiscount.entries()) : undefined,
        deletedPhaseItems: isPhaseLikeMode ? Array.from(deletedPhaseItems) : undefined,
        lagunariAmountOverrides: Array.from(lagunariAmountOverrides.entries()),
        lagunariDiscounts: Array.from(lagunariDiscounts.entries()),
        lagunariVatOverrides: Array.from(lagunariVatOverrides.entries()),
        deletedLagunariItems: Array.from(deletedLagunariItems),
      },
      contactReferent: contactReferent ? {
        firstName: contactReferent.firstName,
        lastName: contactReferent.lastName,
        email: contactReferent.email,
        phone: contactReferent.phone,
      } : null,
      company,
      user: opportunityOwner,
      billingProfile,
      clauseSelections: {
        ...clauseSelections,
        ...(campoLiberoInstallazione.trim() ? {
          custom_note: { selected: true, text: campoLiberoInstallazione.trim() }
        } : {}),
        ...(campoLiberoServizi.trim() ? {
          custom_service_note: { selected: true, text: campoLiberoServizi.trim() }
        } : {}),
        ...(campoLiberoClausole.trim() ? {
          custom_clause_note: { selected: true, text: campoLiberoClausole.trim() }
        } : {}),
      },
    };

    saveMutation.mutate({
      opportunityId: opportunityId!,
      items,
      params: { 
        durationMonths, 
        distanceKm,
        quoteMode,
        squadraInZonaEnabled: squadraInZonaEnabled || undefined,
        squadraInZonaKm: squadraInZonaEnabled ? squadraInZonaKm : undefined,
        logisticsDifficulty: "LOW" as const,
        aCorpoItems: validACorpoItems.length > 0 ? validACorpoItems : undefined,
        posManualEnabled: posManualEnabled || undefined,
        posManualPrice: posManualEnabled ? posManualPrice : undefined,
        reteAntipolvereQtyML: reteAntipolvereQtyML > 0 ? reteAntipolvereQtyML : undefined,
        optionalServices: Object.keys(optionalServices).filter(k => optionalServices[k]).length > 0 
          ? Object.keys(optionalServices).filter(k => optionalServices[k]) 
          : undefined,
        optionalServicesTexts: Object.keys(optionalServicesTexts).length > 0 
          ? optionalServicesTexts 
          : undefined,
      },
      discounts: discounts.itemDiscounts?.length || discounts.globalDiscountPercent ? discounts : undefined,
      handlingData: buildHandlingData(),
      pdfData,
      customNumber: customQuoteNumber || undefined,
      transportDetails,
      ponteggioDetails,
    });
  };

  // Transport handlers - usano getter/setter attivi per supportare modalità phases
  const addTransportItem = () => {
    if (transportArticles.length === 0) return;
    const article = transportArticles[0];
    const vehicles = getVehicleOptions(article);
    if (vehicles.length === 0) return;
    const current = getActiveTransportItems();
    setActiveTransportItems([...current, { articleId: article.id, vehicleIndex: 0, quantity: 1, andataEnabled: true, ritornoEnabled: true }]);
  };

  const updateTransportItem = (index: number, updates: Partial<{ articleId: string; vehicleIndex: number; quantity: number; andataEnabled: boolean; ritornoEnabled: boolean; note?: string }>) => {
    const current = getActiveTransportItems();
    setActiveTransportItems(current.map((item, i) => 
      i === index ? { ...item, ...updates } : item
    ));
  };

  const removeTransportItem = (index: number) => {
    const current = getActiveTransportItems();
    setActiveTransportItems(current.filter((_, i) => i !== index));
  };

  // Handling (Movimentazione) handlers - usano getter/setter attivi per supportare modalità phases
  const addHandlingZone = () => {
    const current = getActiveHandlingZones();
    setActiveHandlingZones([...current, { 
      label: `Zona ${current.length + 1}`, 
      quantity: 0, 
      distHoriz: 0, 
      distVert: 0, 
      type: "GROUND" 
    }]);
  };

  const updateHandlingZone = (index: number, updates: Partial<HandlingZone>) => {
    const current = getActiveHandlingZones();
    setActiveHandlingZones(current.map((zone, i) => 
      i === index ? { ...zone, ...updates } : zone
    ));
  };

  const removeHandlingZone = (index: number) => {
    const current = getActiveHandlingZones();
    setActiveHandlingZones(current.filter((_, i) => i !== index));
  };

  const buildHandlingData = (): HandlingData | undefined => {
    const enabled = getActiveHandlingEnabled();
    if (!enabled) return undefined;
    return {
      enabled: true,
      zones: getActiveHandlingZones(),
      saltareti: { included: getActiveSaltaretiEnabled(), quantity: getActiveSaltaretiQuantity() },
      extraPrice: getActiveHandlingExtraPrice()
    };
  };

  // Incremento Difficoltà handlers
  const addDifficultyItem = () => {
    const current = getActiveDifficultyItems();
    const newItem: DifficultyItem = {
      id: `diff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "TERRAZZE",
      quantity: 1
    };
    setActiveDifficultyItems([...current, newItem]);
  };

  const updateDifficultyItem = (id: string, updates: Partial<Omit<DifficultyItem, 'id'>>) => {
    const current = getActiveDifficultyItems();
    setActiveDifficultyItems(current.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const removeDifficultyItem = (id: string) => {
    const current = getActiveDifficultyItems();
    setActiveDifficultyItems(current.filter(item => item.id !== id));
  };

  // Calcola il totale dell'incremento difficoltà
  const calculateDifficultyTotal = (): number => {
    const items = getActiveDifficultyItems();
    return items.reduce((sum, item) => {
      if (item.type === 'ALTRO') {
        return sum + (item.customPrice || 0) * item.quantity;
      }
      return sum + DIFFICULTY_TYPES[item.type].unitPrice * item.quantity;
    }, 0);
  };

  // "A corpo" handlers - usano getter/setter attivi per supportare modalità phases
  const addACorpoItem = () => {
    const newItem: ACorpoItem = {
      id: `acorpo-${Date.now()}`,
      articleId: "",
      variantIndex: 0,
      notes: "",
      quantity: 0,
      totalPrice: 0,
      splitIntoPhases: true,
    };
    const current = getActiveACorpoItems();
    setActiveACorpoItems([...current, newItem]);
  };

  const updateACorpoItem = (id: string, updates: Partial<Omit<ACorpoItem, 'id'>>) => {
    const current = getActiveACorpoItems();
    setActiveACorpoItems(current.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const removeACorpoItem = (id: string) => {
    const current = getActiveACorpoItems();
    setActiveACorpoItems(current.filter(item => item.id !== id));
  };

  // === Righe manuali Montaggio/Smontaggio handlers ===
  const createManualRow = (): ManualRow => ({
    id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    description: "",
    amount: 0,
    discountPercent: 0,
  });

  // Per modalità normale (rental e labor_only)
  const addManualMontaggioRow = () => {
    setManualMontaggioRows(prev => [...prev, createManualRow()]);
  };
  const updateManualMontaggioRow = (id: string, updates: Partial<ManualRow>) => {
    setManualMontaggioRows(prev => prev.map(row => row.id === id ? { ...row, ...updates } : row));
  };
  const removeManualMontaggioRow = (id: string) => {
    setManualMontaggioRows(prev => prev.filter(row => row.id !== id));
  };

  const addManualSmontaggioRow = () => {
    setManualSmontaggioRows(prev => [...prev, createManualRow()]);
  };
  const updateManualSmontaggioRow = (id: string, updates: Partial<ManualRow>) => {
    setManualSmontaggioRows(prev => prev.map(row => row.id === id ? { ...row, ...updates } : row));
  };
  const removeManualSmontaggioRow = (id: string) => {
    setManualSmontaggioRows(prev => prev.filter(row => row.id !== id));
  };

  const addManualNoleggioRow = () => {
    setManualNoleggioRows(prev => [...prev, createManualRow()]);
  };
  const updateManualNoleggioRow = (id: string, updates: Partial<ManualRow>) => {
    setManualNoleggioRows(prev => prev.map(row => row.id === id ? { ...row, ...updates } : row));
  };
  const removeManualNoleggioRow = (id: string) => {
    setManualNoleggioRows(prev => prev.filter(row => row.id !== id));
  };

  // Per modalità phases
  const getPhaseManualRows = (faseIndex: number, type: 'montaggio' | 'smontaggio' | 'noleggio'): ManualRow[] => {
    const phaseData = phasesManualRows.get(faseIndex);
    return phaseData ? phaseData[type] : [];
  };
  const getPhaseManualRowsSubtotal = (faseIndex: number, type: 'montaggio' | 'smontaggio' | 'noleggio'): number => {
    const rows = getPhaseManualRows(faseIndex, type);
    return rows.reduce((sum, row) => sum + row.amount * (1 - row.discountPercent / 100), 0);
  };
  const addPhaseManualRow = (faseIndex: number, type: 'montaggio' | 'smontaggio' | 'noleggio') => {
    setPhasesManualRows(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(faseIndex) || { montaggio: [], smontaggio: [], noleggio: [] };
      newMap.set(faseIndex, {
        ...existing,
        [type]: [...existing[type], createManualRow()],
      });
      return newMap;
    });
  };
  const updatePhaseManualRow = (faseIndex: number, type: 'montaggio' | 'smontaggio' | 'noleggio', id: string, updates: Partial<ManualRow>) => {
    setPhasesManualRows(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(faseIndex) || { montaggio: [], smontaggio: [], noleggio: [] };
      newMap.set(faseIndex, {
        ...existing,
        [type]: existing[type].map(row => row.id === id ? { ...row, ...updates } : row),
      });
      return newMap;
    });
  };
  const removePhaseManualRow = (faseIndex: number, type: 'montaggio' | 'smontaggio' | 'noleggio', id: string) => {
    setPhasesManualRows(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(faseIndex) || { montaggio: [], smontaggio: [], noleggio: [] };
      newMap.set(faseIndex, {
        ...existing,
        [type]: existing[type].filter(row => row.id !== id),
      });
      return newMap;
    });
  };

  // Extra checklist items handlers - usano getter/setter attivi per supportare modalità phases
  const addExtraChecklistItem = () => {
    const current = getActiveExtraChecklistItems();
    setActiveExtraChecklistItems([...current, {
      id: `extra-${Date.now()}`,
      articleId: "",  // Lascia vuoto per mostrare "Seleziona articolo"
      quantity: 0,
      variantIndex: undefined,
      installationIndex: undefined,
    }]);
  };

  const updateExtraChecklistItem = (id: string, updates: Partial<ExtraChecklistItem>) => {
    const current = getActiveExtraChecklistItems();
    setActiveExtraChecklistItems(current.map(item => {
      if (item.id !== id) return item;
      // Se cambia articolo, reset variante e installazione
      if (updates.articleId && updates.articleId !== item.articleId) {
        const newArticle = allChecklistArticles.find((a: Article) => a.id === updates.articleId);
        const hasVariants = newArticle?.variantsData && newArticle.variantsData.length > 0;
        const hasInstallation = newArticle?.installationData && newArticle.installationData.length > 0;
        const defaultVariantIdx = hasVariants 
          ? newArticle!.variantsData!.findIndex((v: ArticleVariant) => v.isDefault) >= 0 
            ? newArticle!.variantsData!.findIndex((v: ArticleVariant) => v.isDefault) 
            : 0 
          : undefined;
        return {
          ...item,
          ...updates,
          variantIndex: defaultVariantIdx,
          installationIndex: hasInstallation ? 0 : undefined,
        };
      }
      return { ...item, ...updates };
    }));
  };

  const removeExtraChecklistItem = (id: string) => {
    const current = getActiveExtraChecklistItems();
    setActiveExtraChecklistItems(current.filter(item => item.id !== id));
  };

  // Service handlers
  const toggleServiceItem = (articleId: string, enabled: boolean) => {
    const newMap = new Map(serviceItems);
    const current = newMap.get(articleId) || { enabled: false, quantity: 1 };
    newMap.set(articleId, { ...current, enabled });
    setServiceItems(newMap);
  };

  const updateServiceOption = (articleId: string, optionIndex: number) => {
    const newMap = new Map(serviceItems);
    const current = newMap.get(articleId) || { enabled: false, quantity: 1 };
    newMap.set(articleId, { ...current, optionIndex });
    setServiceItems(newMap);
  };

  const updateServiceQuantity = (articleId: string, quantity: number) => {
    const newMap = new Map(serviceItems);
    const current = newMap.get(articleId) || { enabled: false, quantity: 1 };
    newMap.set(articleId, { ...current, quantity: Math.max(1, quantity) });
    setServiceItems(newMap);
  };

  // Discount handlers
  const updateItemDiscount = (phase: QuotePhase, itemIndex: number, percent: number) => {
    const key = `${phase}:${itemIndex}`;
    const newMap = new Map(itemDiscounts);
    newMap.set(key, Math.max(0, Math.min(100, percent)));
    setItemDiscounts(newMap);
  };

  const getItemDiscount = (phase: QuotePhase, itemIndex: number): number => {
    return itemDiscounts.get(`${phase}:${itemIndex}`) || 0;
  };

  const applyBulkDiscount = () => {
    const pct = Math.max(0, Math.min(100, bulkDiscountPercent));
    if (isPhaseLikeMode && phasesPreviewResult) {
      const newMap = new Map(phaseItemDiscounts);
      phasesPreviewResult.fasiResults?.forEach((fase: any) => {
        const faseConfig = fasi[fase.faseIndex];
        const faseTransportItems = faseConfig?.transportItems || [];
        const phases = [
          { items: (fase.trasportoAndata?.items || []).filter((_: any, idx: number) => faseTransportItems[idx]?.andataEnabled !== false), phase: 'TRASPORTO_ANDATA' },
          { items: fase.costoMagazzino?.items || [], phase: 'MOVIMENTAZIONE_MAGAZZINO' },
          { items: fase.montaggio?.items || [], phase: 'MONTAGGIO' },
          { items: fase.smontaggio?.items || [], phase: 'SMONTAGGIO' },
          { items: (fase.trasportoRitorno?.items || []).filter((_: any, idx: number) => faseTransportItems[idx]?.ritornoEnabled !== false), phase: 'TRASPORTO_RITORNO' },
          { items: fase.noleggio?.items || [], phase: 'NOLEGGIO' },
        ];
        phases.forEach(({ items, phase }) => {
          items.forEach((_: any, idx: number) => {
            const key = `${fase.faseIndex}:${phase}:${idx}`;
            if (!deletedPhaseItems.has(key)) {
              newMap.set(key, pct);
            }
          });
        });
      });
      phasesPreviewResult.documenti?.items?.forEach((_: any, idx: number) => {
        const key = `DOCUMENTI:${idx}`;
        if (!deletedPhaseItems.has(key)) {
          newMap.set(key, pct);
        }
      });
      setPhaseItemDiscounts(newMap);
    } else if (previewResult) {
      const newMap = new Map(itemDiscounts);
      previewResult.phases
        .filter((p: any) => p.items.length > 0)
        .forEach((p: any) => {
          p.items.forEach((_: any, idx: number) => {
            newMap.set(`${p.phase}:${idx}`, pct);
          });
        });
      setItemDiscounts(newMap);
    }
  };

  // Amount override handlers
  const updateItemAmountOverride = (phase: QuotePhase, itemIndex: number, amount: number | null) => {
    const key = `${phase}:${itemIndex}`;
    const newMap = new Map(itemAmountOverrides);
    if (amount === null || isNaN(amount)) {
      newMap.delete(key);
    } else {
      newMap.set(key, Math.max(0, amount));
    }
    setItemAmountOverrides(newMap);
  };

  const getItemAmountOverride = (phase: QuotePhase, itemIndex: number): number | null => {
    return itemAmountOverrides.get(`${phase}:${itemIndex}`) ?? null;
  };

  const updateUnitPriceOverride = (phase: QuotePhase, itemIndex: number, price: number | null) => {
    const key = `${phase}:${itemIndex}`;
    const newMap = new Map(unitPriceOverrides);
    if (price === null || isNaN(price)) {
      newMap.delete(key);
    } else {
      newMap.set(key, Math.max(0, price));
    }
    setUnitPriceOverrides(newMap);
  };

  const getUnitPriceOverride = (phase: QuotePhase, itemIndex: number): number | null => {
    return unitPriceOverrides.get(`${phase}:${itemIndex}`) ?? null;
  };

  // Handling zone override handlers
  const updateHandlingZoneOverride = (zoneIdx: number, type: "mount" | "dismount", amount: number | null) => {
    const key = `${zoneIdx}:${type}`;
    const newMap = new Map(handlingZoneOverrides);
    if (amount === null || isNaN(amount)) {
      newMap.delete(key);
    } else {
      newMap.set(key, Math.max(0, amount));
    }
    setHandlingZoneOverrides(newMap);
  };

  const getHandlingZoneOverride = (zoneIdx: number, type: "mount" | "dismount"): number | null => {
    return handlingZoneOverrides.get(`${zoneIdx}:${type}`) ?? null;
  };

  const updateHandlingZoneDiscount = (zoneIdx: number, type: "mount" | "dismount", percent: number) => {
    const key = `${zoneIdx}:${type}`;
    const newMap = new Map(handlingZoneDiscounts);
    if (!percent || percent <= 0) {
      newMap.delete(key);
    } else {
      newMap.set(key, Math.min(100, Math.max(0, percent)));
    }
    setHandlingZoneDiscounts(newMap);
  };

  const getHandlingZoneDiscount = (zoneIdx: number, type: "mount" | "dismount"): number => {
    return handlingZoneDiscounts.get(`${zoneIdx}:${type}`) || 0;
  };

  // Get lead display name
  const getLeadName = () => {
    if (!lead) return "...";
    if (lead.entityType === "COMPANY") {
      return lead.name || `${lead.firstName} ${lead.lastName}`;
    }
    return `${lead.firstName} ${lead.lastName}`;
  };

  // Calculate rental MQ (only company-owned materials) for warehouse cost
  // Uses extraChecklistItems (articoli dal catalogo)
  const rentalMq = useMemo(() => {
    let total = 0;
    extraChecklistItems.forEach((extra) => {
      if (extra.articleId && extra.quantity > 0) {
        const article = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
        // Count all MQ articles from rental category (company-owned materials)
        if (article && article.unitType === "MQ" && article.category !== "SCAFFOLDING_LABOR") {
          total += extra.quantity;
        }
      }
    });
    return total;
  }, [extraChecklistItems, allChecklistArticles]);
  
  // Calculate total MQ (rental + labor-only) for POS calculation
  const totalMq = useMemo(() => {
    let total = 0;
    extraChecklistItems.forEach((extra) => {
      if (extra.articleId && extra.quantity > 0) {
        const article = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
        if (article && article.unitType === "MQ") {
          total += extra.quantity;
        }
      }
    });
    return total;
  }, [extraChecklistItems, allChecklistArticles]);
  
  // CONTROLLO DATI: Logs aggressivi
  console.log("=== QUOTE NEW DEBUG ===");
  console.log("Articles Total:", articles.length);
  console.log("Magazzino Article found:", magazzinoArticle);
  console.log("Rental MQ (materiale nostro):", rentalMq);
  console.log("Total MQ (incluso cliente):", totalMq);

  useEffect(() => {
    console.log("ServiceItems Changed:", Array.from(serviceItems.entries()));
  }, [serviceItems]);

  // AUTOMAZIONE: Attiva Magazzino SOLO se c'è materiale noleggio (rentalMq > 0)
  // NON attivare per materiale del cliente (SCAFFOLDING_LABOR)
  useEffect(() => {
    if (magazzinoArticle) {
      setServiceItems(prev => {
        const current = prev.get(magazzinoArticle.id);
        if (rentalMq > 0) {
          // Attiva solo se non già abilitato
          if (!current?.enabled) {
            console.log("AUTO-ENABLING Magazzino for rentalMQ:", rentalMq);
            const newMap = new Map(prev);
            newMap.set(magazzinoArticle.id, { 
              enabled: true, 
              quantity: 1, 
              optionIndex: 0 
            });
            return newMap;
          }
        } else {
          // Disattiva se rentalMq è 0 (solo manodopera cliente)
          if (current?.enabled) {
            console.log("AUTO-DISABLING Magazzino - no rental MQ");
            const newMap = new Map(prev);
            newMap.set(magazzinoArticle.id, { 
              enabled: false, 
              quantity: 0, 
              optionIndex: 0 
            });
            return newMap;
          }
        }
        return prev;
      });
    }
  }, [rentalMq, magazzinoArticle]);

  // Auto-apply active promo codes when Step 5 is open and fresh promo data arrives (pendingPromos !== null)
  useEffect(() => {
    if (currentStep !== 5 || pendingPromos === null) return;
    if (!previewResult && !phasesPreviewResult) return;

    // Build a map of articleId -> article.code for quick lookup
    const articleCodeById = new Map<string, string>();
    if (articles) {
      articles.forEach((a) => {
        articleCodeById.set(String(a.id), a.code || "");
      });
    }

    // Step 1: Remove previously promo-added discounts (effective delta tracking ensures exact rollback)
    if (promoAddedKeys.size > 0) {
      setItemDiscounts((prev) => {
        const newMap = new Map(prev);
        promoAddedKeys.forEach((addedAmt, key) => {
          const current = newMap.get(key) || 0;
          const reduced = Math.max(0, current - addedAmt);
          if (reduced === 0) {
            newMap.delete(key);
          } else {
            newMap.set(key, reduced);
          }
        });
        return newMap;
      });
    }
    if (promoAddedPhaseKeys.size > 0) {
      setPhaseItemDiscounts((prev) => {
        const newMap = new Map(prev);
        promoAddedPhaseKeys.forEach((addedAmt, key) => {
          const current = newMap.get(key) || 0;
          const reduced = Math.max(0, current - addedAmt);
          if (reduced === 0) {
            newMap.delete(key);
          } else {
            newMap.set(key, reduced);
          }
        });
        return newMap;
      });
    }

    // Consume pendingPromos — mark as processed immediately to prevent re-runs
    const promosToApply = pendingPromos;
    setPendingPromos(null);

    // Step 2: If no active promos, clear state and exit
    if (promosToApply.length === 0) {
      setAppliedPromos([]);
      setPromoAddedKeys(new Map());
      setPromoAddedPhaseKeys(new Map());
      return;
    }

    // Step 3: Compute which keys each promo applies to and accumulate nominal discount per key
    const newApplied: typeof appliedPromos = [];
    const newPromoAddedKeys = new Map<string, number>();
    const newPromoAddedPhaseKeys = new Map<string, number>();

    // We need the current discount state AFTER the cleanup in Step 1 above.
    // Since setItemDiscounts is batched, we compute this manually from the current closure snapshot
    // (promoAddedKeys cleanup is exact, so closure snapshot minus cleanup = post-cleanup state).
    const snapshotItemDiscounts = new Map(itemDiscounts);
    promoAddedKeys.forEach((addedAmt, key) => {
      const current = snapshotItemDiscounts.get(key) || 0;
      const reduced = Math.max(0, current - addedAmt);
      if (reduced === 0) {
        snapshotItemDiscounts.delete(key);
      } else {
        snapshotItemDiscounts.set(key, reduced);
      }
    });
    const snapshotPhaseItemDiscounts = new Map(phaseItemDiscounts);
    promoAddedPhaseKeys.forEach((addedAmt, key) => {
      const current = snapshotPhaseItemDiscounts.get(key) || 0;
      const reduced = Math.max(0, current - addedAmt);
      if (reduced === 0) {
        snapshotPhaseItemDiscounts.delete(key);
      } else {
        snapshotPhaseItemDiscounts.set(key, reduced);
      }
    });

    promosToApply.forEach((promo) => {
      const discountPct = parseFloat(promo.discountPercent);
      if (!discountPct || discountPct <= 0) return;

      const isGlobal = !promo.articleCodes || promo.articleCodes.length === 0;
      const promoCodeSet = new Set(promo.articleCodes || []);

      const matchingKeys: string[] = [];

      if (!isPhaseLikeMode && previewResult) {
        previewResult.phases?.forEach((phase: any) => {
          phase.items?.forEach((item: any, idx: number) => {
            if (isGlobal) {
              matchingKeys.push(`${phase.phase}:${idx}`);
            } else {
              const artCode = articleCodeById.get(String(item.articleId));
              if (artCode && promoCodeSet.has(artCode)) {
                matchingKeys.push(`${phase.phase}:${idx}`);
              }
            }
          });
        });
      } else if (isPhaseLikeMode && phasesPreviewResult) {
        phasesPreviewResult.fasiResults?.forEach((fase: any) => {
          const allPhaseGroups = [
            { items: fase.trasportoAndata?.items || [], phaseName: "TRASPORTO_ANDATA" },
            { items: fase.costoMagazzino?.items || [], phaseName: "MOVIMENTAZIONE_MAGAZZINO" },
            { items: fase.montaggio?.items || [], phaseName: "MONTAGGIO" },
            { items: fase.smontaggio?.items || [], phaseName: "SMONTAGGIO" },
            { items: fase.trasportoRitorno?.items || [], phaseName: "TRASPORTO_RITORNO" },
            { items: fase.noleggio?.items || [], phaseName: "NOLEGGIO" },
          ];
          allPhaseGroups.forEach(({ items, phaseName }) => {
            items.forEach((item: any, idx: number) => {
              if (isGlobal) {
                matchingKeys.push(`${fase.faseIndex}:${phaseName}:${idx}`);
              } else {
                const artCode = articleCodeById.get(String(item.articleId));
                if (artCode && promoCodeSet.has(artCode)) {
                  matchingKeys.push(`${fase.faseIndex}:${phaseName}:${idx}`);
                }
              }
            });
          });
        });
        phasesPreviewResult.documenti?.items?.forEach((item: any, idx: number) => {
          if (isGlobal) {
            matchingKeys.push(`DOCUMENTI:${idx}`);
          } else {
            const artCode = articleCodeById.get(String(item.articleId));
            if (artCode && promoCodeSet.has(artCode)) {
              matchingKeys.push(`DOCUMENTI:${idx}`);
            }
          }
        });
      }

      if (matchingKeys.length > 0) {
        if (!isPhaseLikeMode) {
          matchingKeys.forEach((key) => {
            const prev = newPromoAddedKeys.get(key) || 0;
            newPromoAddedKeys.set(key, prev + discountPct);
          });
        } else {
          matchingKeys.forEach((key) => {
            const prev = newPromoAddedPhaseKeys.get(key) || 0;
            newPromoAddedPhaseKeys.set(key, prev + discountPct);
          });
        }

        newApplied.push({
          promoId: promo.id,
          code: promo.code,
          description: promo.description,
          discountPercent: discountPct,
          isGlobal,
          articleCodes: promo.articleCodes || [],
          totalAmount: 0,
        });
      }
    });

    // Step 4: Apply discounts and track effective delta (post-clamp) for clean future rollback
    const effectivePromoAddedKeys = new Map<string, number>();
    const effectivePromoAddedPhaseKeys = new Map<string, number>();

    if (newPromoAddedKeys.size > 0) {
      newPromoAddedKeys.forEach((addedAmt, key) => {
        const existing = snapshotItemDiscounts.get(key) || 0;
        const clamped = Math.min(100, existing + addedAmt);
        effectivePromoAddedKeys.set(key, clamped - existing);
      });
      setItemDiscounts((prev) => {
        const newMap = new Map(prev);
        newPromoAddedKeys.forEach((addedAmt, key) => {
          const existing = newMap.get(key) || 0;
          newMap.set(key, Math.min(100, existing + addedAmt));
        });
        return newMap;
      });
    }
    if (newPromoAddedPhaseKeys.size > 0) {
      newPromoAddedPhaseKeys.forEach((addedAmt, key) => {
        const existing = snapshotPhaseItemDiscounts.get(key) || 0;
        const clamped = Math.min(100, existing + addedAmt);
        effectivePromoAddedPhaseKeys.set(key, clamped - existing);
      });
      setPhaseItemDiscounts((prev) => {
        const newMap = new Map(prev);
        newPromoAddedPhaseKeys.forEach((addedAmt, key) => {
          const existing = newMap.get(key) || 0;
          newMap.set(key, Math.min(100, existing + addedAmt));
        });
        return newMap;
      });
    }

    setPromoAddedKeys(effectivePromoAddedKeys);
    setPromoAddedPhaseKeys(effectivePromoAddedPhaseKeys);
    setAppliedPromos(newApplied);

    if (newApplied.length > 0) {
      toast({
        title: "Promo applicate",
        description: newApplied.map((p) => p.code).join(", ") + " applicat" + (newApplied.length === 1 ? "a" : "e") + " automaticamente",
      });
    }
  }, [currentStep, pendingPromos, previewResult, phasesPreviewResult, isPhaseLikeMode, articles]);

  // Get vehicle options for transport article
  const getVehicleOptions = (article: Article): TransportVehicle[] => {
    const data = article.pricingData as TransportPricingData;
    return data?.vehicles || [];
  };

  // Get document options
  const getDocumentOptions = (article: Article): Array<{ name: string; price: number }> => {
    const data = article.pricingData as DocumentPricingData;
    return data?.options || [];
  };

  // Format rental price hint
  const getRentalPriceHint = (article: Article, selectedVariant?: ArticleVariant | null): string => {
    // SALE items: prezzo fisso unitario (vendita, non noleggio)
    if (article.pricingLogic === "SALE") {
      const saleData = article.pricingData as { price: number; unitCoverage?: number };
      const price = saleData?.price ?? parseFloat(article.basePrice);
      if (saleData?.unitCoverage) {
        return `€${price.toFixed(2)}/rl (${saleData.unitCoverage} mq/rl) - vendita`;
      }
      return `€${price.toFixed(2)}/${article.unitType} (vendita)`;
    }

    // Use variant pricing if available, otherwise fall back to article pricing
    const variantRental = selectedVariant?.rental;
    const data = variantRental || (article.pricingData as RentalPricingData);
    if (!data) return "";
    
    // In modalità Solo Manodopera, mostra solo i costi di installazione
    if (quoteMode === 'labor_only') {
      // First check variant installation, then fall back to article installationData
      if (selectedVariant?.installation) {
        return `Montaggio €${selectedVariant.installation.mount.toFixed(2)} + Smontaggio €${selectedVariant.installation.dismount.toFixed(2)}`;
      }
      const installData = article.installationData;
      if (installData && installData.length > 0) {
        const defaultOpt = installData.find(i => i.isDefault) || installData[0];
        return `Montaggio €${defaultOpt.mount.toFixed(2)} + Smontaggio €${defaultOpt.dismount.toFixed(2)}`;
      }
      return "Solo manodopera";
    }
    
    // Guard against missing pricing data properties
    if (data.months_1_2 === undefined) return "";
    let price = data.months_1_2;
    if (durationMonths > 2 && durationMonths <= 5) price = data.months_3_5 ?? price;
    else if (durationMonths > 5 && durationMonths <= 8) price = data.months_6_8 ?? price;
    else if (durationMonths > 8) price = data.months_9_plus ?? price;
    return `€${(price ?? 0).toFixed(2)}/${article.unitType}/mese`;
  };

  // Format labor price hint
  const getLaborPriceHint = (article: Article): string => {
    const data = article.pricingData as LaborPricingData;
    if (!data) return "";
    return `M: €${data.mount.toFixed(2)} / S: €${data.dismount.toFixed(2)}`;
  };

  // Calcola totale voci "A corpo"
  const aCorpoTotal = useMemo(() => {
    return aCorpoItems.reduce((acc, item) => acc + item.totalPrice, 0);
  }, [aCorpoItems]);

  // Calcola override prezzo POS se manuale
  const posManualOverride = useMemo(() => {
    if (!posManualEnabled) return 0;
    return posManualPrice;
  }, [posManualEnabled, posManualPrice]);

  // Calcola totali fasi con override e sconti applicati
  const phasesAdjustedTotals = useMemo(() => {
    if (!phasesPreviewResult) return { documentiTotal: 0, fasiTotals: [] as { faseIndex: number; total: number }[], grandTotal: 0, totalDiscounts: 0, subtotalBeforeDiscounts: 0, globalDiscountAmount: 0, lagunariTotal: 0 };
    
    let totalDiscounts = 0;
    
    // Calcola totale Documenti con override e sconti
    let documentiTotal = 0;
    if (phasesPreviewResult.documenti?.items) {
      phasesPreviewResult.documenti.items.forEach((item: any, idx: number) => {
        if (deletedPhaseItems.has(`DOCUMENTI:${idx}`)) return;
        const key = `DOCUMENTI:${idx}`;
        const override = phaseItemAmountOverrides.get(key);
        const discount = phaseItemDiscounts.get(key) || 0;
        const basePrice = override !== null && override !== undefined ? override : item.totalRow;
        const qty = item.quantity > 0 ? item.quantity : 1;
        const costoUnitario = basePrice / qty;
        const costoUnitarioScontato = Math.round(costoUnitario * (1 - discount / 100) * 100) / 100;
        const afterDiscount = discount === 0 ? basePrice : Math.round(costoUnitarioScontato * qty * 100) / 100;
        totalDiscounts += basePrice - afterDiscount;
        documentiTotal += afterDiscount;
      });
    }
    
    // Calcola totali per ogni fase
    const fasiTotals: { faseIndex: number; total: number }[] = [];
    
    phasesPreviewResult.fasiResults?.forEach((fase: any) => {
      let faseTotal = 0;
      const faseConfig = fasi[fase.faseIndex];
      const faseTransportItems = faseConfig?.transportItems || [];
      
      const andataItems = (fase.trasportoAndata?.items || []).filter((_: any, idx: number) => faseTransportItems[idx]?.andataEnabled !== false);
      const ritornoItems = (fase.trasportoRitorno?.items || []).filter((_: any, idx: number) => faseTransportItems[idx]?.ritornoEnabled !== false);
      
      const phases = [
        { items: andataItems, phase: 'TRASPORTO_ANDATA' },
        { items: fase.costoMagazzino?.items || [], phase: 'MOVIMENTAZIONE_MAGAZZINO' },
        { items: fase.montaggio?.items || [], phase: 'MONTAGGIO' },
        { items: fase.smontaggio?.items || [], phase: 'SMONTAGGIO' },
        { items: ritornoItems, phase: 'TRASPORTO_RITORNO' },
        { items: fase.noleggio?.items || [], phase: 'NOLEGGIO' },
      ];
      
      phases.forEach(({ items, phase }) => {
        items.forEach((item: any, idx: number) => {
          const key = `${fase.faseIndex}:${phase}:${idx}`;
          if (deletedPhaseItems.has(key)) return;
          const override = phaseItemAmountOverrides.get(key);
          const upOverride = phaseUnitPriceOverrides.get(key);
          const discount = phaseItemDiscounts.get(key) || 0;
          const totalAfterUnitPrice = upOverride !== null && upOverride !== undefined ? (item.unitPrice > 0 ? (upOverride / item.unitPrice) * item.totalRow : upOverride * item.quantity) : item.totalRow;
          const basePrice = override !== null && override !== undefined ? override : totalAfterUnitPrice;
          const qty = item.quantity > 0 ? item.quantity : 1;
          const costoUnitario = basePrice / qty;
          const costoUnitarioScontato = Math.round(costoUnitario * (1 - discount / 100) * 100) / 100;
          const afterDiscount = discount === 0 ? basePrice : Math.round(costoUnitarioScontato * qty * 100) / 100;
          totalDiscounts += basePrice - afterDiscount;
          faseTotal += afterDiscount;
        });
      });
      
      // Aggiungi costi movimentazione (handling) con override e sconti
      if (fase.handling?.breakdown?.zones?.length > 0) {
        let handlingMountAfterZone = 0;
        let handlingDismountAfterZone = 0;
        fase.handling.breakdown.zones.forEach((zone: any, idx: number) => {
          const mountKey = `${fase.faseIndex}:HANDLING_MOUNT:${idx}`;
          const mountOverride = phaseItemAmountOverrides.get(mountKey);
          const mountDiscount = phaseItemDiscounts.get(mountKey) || 0;
          const mountBase = mountOverride !== null && mountOverride !== undefined ? mountOverride : (zone.mountCost || 0);
          handlingMountAfterZone += mountBase * (1 - mountDiscount / 100);
          totalDiscounts += mountBase * (mountDiscount / 100);
          
          const dismountKey = `${fase.faseIndex}:HANDLING_DISMOUNT:${idx}`;
          const dismountOverride = phaseItemAmountOverrides.get(dismountKey);
          const dismountDiscount = phaseItemDiscounts.get(dismountKey) || 0;
          const dismountBase = dismountOverride !== null && dismountOverride !== undefined ? dismountOverride : (zone.dismountCost || 0);
          handlingDismountAfterZone += dismountBase * (1 - dismountDiscount / 100);
          totalDiscounts += dismountBase * (dismountDiscount / 100);
        });
        if (fase.handling.breakdown.saltareti) {
          handlingMountAfterZone += fase.handling.breakdown.saltareti.total;
          handlingDismountAfterZone += fase.handling.breakdown.saltareti.total;
        }
        if (fase.handling.extraPrice) {
          handlingMountAfterZone += fase.handling.extraPrice;
        }
        const mountGlobalDisc = phaseHandlingMountGlobalDiscount.get(fase.faseIndex) || 0;
        const dismountGlobalDisc = phaseHandlingDismountGlobalDiscount.get(fase.faseIndex) || 0;
        const mountGlobalDiscAmount = handlingMountAfterZone * (mountGlobalDisc / 100);
        const dismountGlobalDiscAmount = handlingDismountAfterZone * (dismountGlobalDisc / 100);
        totalDiscounts += mountGlobalDiscAmount + dismountGlobalDiscAmount;
        faseTotal += (handlingMountAfterZone - mountGlobalDiscAmount) + (handlingDismountAfterZone - dismountGlobalDiscAmount);
      }
      
      // Aggiungi righe manuali per questa fase
      const faseManualRows = phasesManualRows.get(fase.faseIndex);
      if (faseManualRows) {
        [...faseManualRows.montaggio, ...faseManualRows.smontaggio, ...faseManualRows.noleggio].forEach((row) => {
          const netAmount = row.amount * (1 - row.discountPercent / 100);
          const discountAmount = row.amount * (row.discountPercent / 100);
          totalDiscounts += discountAmount;
          faseTotal += netAmount;
        });
      }
      
      // Aggiungi trasferta per questa fase
      const faseData = fasi[fase.faseIndex];
      const faseDistanceKm = faseData?.squadraInZonaEnabled ? (faseData?.squadraInZonaKm || 0) : (faseData?.distanceKm || 0);
      // Calcola totali montaggio/smontaggio per trasferta
      const montaggioItems = fase.montaggio?.items || [];
      const smontaggioItems = fase.smontaggio?.items || [];
      const handlingZones = fase.handling?.breakdown?.zones || [];
      
      let totaleMontaggioConMov = montaggioItems.reduce((sum: number, item: any, idx: number) => {
        const key = `${fase.faseIndex}:MONTAGGIO:${idx}`;
        if (deletedPhaseItems.has(key)) return sum;
        const override = phaseItemAmountOverrides.get(key);
        const discount = phaseItemDiscounts.get(key) || 0;
        const basePrice = override !== null && override !== undefined ? override : item.totalRow;
        const qty = item.quantity > 0 ? item.quantity : 1;
        const cu = basePrice / qty;
        const cuScontato = Math.round(cu * (1 - discount / 100) * 100) / 100;
        return sum + Math.round(cuScontato * qty * 100) / 100;
      }, 0);
      
      let totaleSmontaggioConMov = smontaggioItems.reduce((sum: number, item: any, idx: number) => {
        const key = `${fase.faseIndex}:SMONTAGGIO:${idx}`;
        if (deletedPhaseItems.has(key)) return sum;
        const override = phaseItemAmountOverrides.get(key);
        const discount = phaseItemDiscounts.get(key) || 0;
        const basePrice = override !== null && override !== undefined ? override : item.totalRow;
        const qty = item.quantity > 0 ? item.quantity : 1;
        const cu = basePrice / qty;
        const cuScontato = Math.round(cu * (1 - discount / 100) * 100) / 100;
        return sum + Math.round(cuScontato * qty * 100) / 100;
      }, 0);
      
      // Aggiungi handling ai totali solo se esistono item montaggio/smontaggio attivi
      const hasActiveMontaggioItems = montaggioItems.some((_: any, idx: number) => !deletedPhaseItems.has(`${fase.faseIndex}:MONTAGGIO:${idx}`));
      const hasActiveSmontaggioItems = smontaggioItems.some((_: any, idx: number) => !deletedPhaseItems.has(`${fase.faseIndex}:SMONTAGGIO:${idx}`));
      handlingZones.forEach((zone: any, idx: number) => {
        if (hasActiveMontaggioItems) {
          const mountKey = `${fase.faseIndex}:HANDLING_MOUNT:${idx}`;
          const mountOverride = phaseItemAmountOverrides.get(mountKey);
          const mountDiscount = phaseItemDiscounts.get(mountKey) || 0;
          const mountBase = mountOverride !== null && mountOverride !== undefined ? mountOverride : (zone.mountCost || 0);
          totaleMontaggioConMov += mountBase * (1 - mountDiscount / 100);
        }
        
        if (hasActiveSmontaggioItems) {
          const dismountKey = `${fase.faseIndex}:HANDLING_DISMOUNT:${idx}`;
          const dismountOverride = phaseItemAmountOverrides.get(dismountKey);
          const dismountDiscount = phaseItemDiscounts.get(dismountKey) || 0;
          const dismountBase = dismountOverride !== null && dismountOverride !== undefined ? dismountOverride : (zone.dismountCost || 0);
          totaleSmontaggioConMov += dismountBase * (1 - dismountDiscount / 100);
        }
      });
      
      // Calcola e aggiungi trasferta
      const trasfertaResult = calcolaTrasferta(faseDistanceKm, totaleMontaggioConMov, totaleSmontaggioConMov);
      faseTotal += trasfertaResult.costoMontaggioTrasferta + trasfertaResult.costoSmontaggioTrasferta;

      // Calcola e aggiungi difficoltà per questa fase
      const diffItems = fase.difficultyItems || [];
      const diffEnabled = fase.difficultyEnabled || false;
      let faseDifficultyTotal = 0;
      if (diffEnabled && diffItems.length > 0) {
        faseDifficultyTotal = diffItems.reduce((sum: number, item: any) => {
          if (item.type === 'ALTRO') return sum + (item.customPrice || 0) * item.quantity;
          const typeInfo = DIFFICULTY_TYPES[item.type as DifficultyType];
          return sum + (typeInfo ? typeInfo.unitPrice * item.quantity : 0);
        }, 0);
      }
      faseTotal += faseDifficultyTotal;

      const faseVt = phasesLagunariData.get(fase.faseIndex);
      if (faseVt) {
        const kp = `f${fase.faseIndex}:`;
        const faseLagItems = [...buildLagunariAndataItems(faseVt, kp), ...buildLagunariRitornoItems(faseVt, kp)];
        faseLagItems.forEach(li => {
          if (deletedLagunariItems.has(li.key)) return;
          const override = lagunariAmountOverrides.get(li.key);
          const discount = lagunariDiscounts.get(li.key) || 0;
          const basePrice = override !== null && override !== undefined ? override : li.total;
          const afterDiscount = round2(basePrice * (1 - discount / 100));
          totalDiscounts += basePrice - afterDiscount;
          faseTotal += afterDiscount;
        });
      }
      
      fasiTotals.push({ faseIndex: fase.faseIndex, total: faseTotal });
    });
    
    const lagunariTot = getLagunariEffectiveTotal();
    const subtotalBeforeDiscounts = documentiTotal + fasiTotals.reduce((sum, f) => sum + f.total, 0) + totalDiscounts;
    const afterItemDiscounts = documentiTotal + fasiTotals.reduce((sum, f) => sum + f.total, 0);
    const globalDiscountAmount = afterItemDiscounts * (globalDiscountPercent / 100);
    const grandTotal = Math.max(0, afterItemDiscounts - globalDiscountAmount - extraDiscountAmount);
    
    return { documentiTotal, fasiTotals, grandTotal, totalDiscounts: totalDiscounts + globalDiscountAmount, subtotalBeforeDiscounts, globalDiscountAmount, lagunariTotal: lagunariTot };
  }, [phasesPreviewResult, phaseItemAmountOverrides, phaseUnitPriceOverrides, phaseItemDiscounts, calcolaTrasferta, phasesManualRows, globalDiscountPercent, extraDiscountAmount, phaseHandlingMountGlobalDiscount, phaseHandlingDismountGlobalDiscount, fasi, deletedPhaseItems, phasesLagunariData, lagunariAmountOverrides, lagunariDiscounts, deletedLagunariItems]);

  // Calcola trasferta per ogni fase in modalità phases
  const phasesTrasfertaInfo = useMemo(() => {
    if (!phasesPreviewResult?.fasiResults) return new Map<number, {
      fascia: 'nessuna' | 'giornaliera' | 'pernottamento';
      costoMontaggioTrasferta: number;
      costoSmontaggioTrasferta: number;
      distribuzioneMontaggioItems: Map<number, { quotaTrasferta: number; trasfertaPerUnit: number; costoUnitarioRettificato: number }>;
      distribuzioneSmontaggioItems: Map<number, { quotaTrasferta: number; trasfertaPerUnit: number; costoUnitarioRettificato: number }>;
    }>();
    
    const result = new Map<number, any>();
    
    phasesPreviewResult.fasiResults.forEach((fase: any) => {
      const faseData = fasi[fase.faseIndex];
      const faseDistanceKm = faseData?.squadraInZonaEnabled ? (faseData?.squadraInZonaKm || 0) : (faseData?.distanceKm || 0);
      // Calcola totali montaggio e smontaggio per questa fase (incluso handling)
      const montaggioItems = fase.montaggio?.items || [];
      const smontaggioItems = fase.smontaggio?.items || [];
      const handlingZones = fase.handling?.breakdown?.zones || [];
      
      // Calcola totale montaggio (inline) — usa totalRow originale per proporzioni stabili
      let totaleMontaggioConMov = montaggioItems.reduce((sum: number, item: any, idx: number) => {
        return sum + item.totalRow;
      }, 0);
      
      // Calcola totale smontaggio (inline) — usa totalRow originale per proporzioni stabili
      let totaleSmontaggioConMov = smontaggioItems.reduce((sum: number, item: any, idx: number) => {
        return sum + item.totalRow;
      }, 0);
      
      // Aggiungi handling (inline) solo se esistono item montaggio/smontaggio
      if (handlingZones.length > 0) {
        handlingZones.forEach((zone: any, idx: number) => {
          if (montaggioItems.length > 0) totaleMontaggioConMov += zone.mountCost || 0;
          if (smontaggioItems.length > 0) totaleSmontaggioConMov += zone.dismountCost || 0;
        });
      }
      
      // Calcola trasferta
      const trasfertaResult = calcolaTrasferta(faseDistanceKm, totaleMontaggioConMov, totaleSmontaggioConMov);
      
      // Distribuisci trasferta proporzionalmente
      const distribuzioneMontaggioItems = new Map<number, { quotaTrasferta: number; trasfertaPerUnit: number; costoUnitarioRettificato: number }>();
      const distribuzioneSmontaggioItems = new Map<number, { quotaTrasferta: number; trasfertaPerUnit: number; costoUnitarioRettificato: number }>();
      
      // Totale base montaggio (per calcolare proporzioni) — usa totalRow originale per proporzioni stabili
      const totaleMontaggioBase = montaggioItems.reduce((sum: number, item: any, idx: number) => {
        return sum + item.totalRow;
      }, 0);
      
      // Totale base smontaggio — usa totalRow originale
      const totaleSmontaggioBase = smontaggioItems.reduce((sum: number, item: any, idx: number) => {
        return sum + item.totalRow;
      }, 0);
      
      // Distribuisci trasferta montaggio (usa totalRow originale per proporzioni stabili)
      if (trasfertaResult.costoMontaggioTrasferta > 0 && totaleMontaggioBase > 0) {
        montaggioItems.forEach((item: any, idx: number) => {
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleMontaggioBase;
          const baseUnitPrice = item.quantity > 0 ? originalTotal / item.quantity : 0;
          const rawTrasfertaPerUnit = item.quantity > 0 ? (trasfertaResult.costoMontaggioTrasferta * proporzione) / item.quantity : 0;
          const costoUnitarioRettificato = Math.round((baseUnitPrice + rawTrasfertaPerUnit) * 100) / 100;
          const trasfertaPerUnit = Math.round(rawTrasfertaPerUnit * 100) / 100;
          const quotaTrasferta = item.quantity > 0 ? costoUnitarioRettificato * item.quantity - originalTotal : 0;
          distribuzioneMontaggioItems.set(idx, { quotaTrasferta, trasfertaPerUnit, costoUnitarioRettificato });
        });
      }
      
      // Distribuisci trasferta smontaggio
      if (trasfertaResult.costoSmontaggioTrasferta > 0 && totaleSmontaggioBase > 0) {
        smontaggioItems.forEach((item: any, idx: number) => {
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleSmontaggioBase;
          const baseUnitPrice = item.quantity > 0 ? originalTotal / item.quantity : 0;
          const rawTrasfertaPerUnit = item.quantity > 0 ? (trasfertaResult.costoSmontaggioTrasferta * proporzione) / item.quantity : 0;
          const costoUnitarioRettificato = Math.round((baseUnitPrice + rawTrasfertaPerUnit) * 100) / 100;
          const trasfertaPerUnit = Math.round(rawTrasfertaPerUnit * 100) / 100;
          const quotaTrasferta = item.quantity > 0 ? costoUnitarioRettificato * item.quantity - originalTotal : 0;
          distribuzioneSmontaggioItems.set(idx, { quotaTrasferta, trasfertaPerUnit, costoUnitarioRettificato });
        });
      }
      
      result.set(fase.faseIndex, {
        fascia: trasfertaResult.fascia,
        costoMontaggioTrasferta: trasfertaResult.costoMontaggioTrasferta,
        costoSmontaggioTrasferta: trasfertaResult.costoSmontaggioTrasferta,
        distribuzioneMontaggioItems,
        distribuzioneSmontaggioItems
      });
    });
    
    return result;
  }, [phasesPreviewResult, fasi, calcolaTrasferta]);

  const phasesDifficultyInfo = useMemo(() => {
    if (!phasesPreviewResult?.fasiResults) return new Map<number, {
      totale: number;
      costoMontaggioDifficolta: number;
      costoSmontaggioDifficolta: number;
      distribuzioneMontaggioItems: Map<number, { quotaDifficolta: number; costoUnitarioConDifficolta: number }>;
      distribuzioneSmontaggioItems: Map<number, { quotaDifficolta: number; costoUnitarioConDifficolta: number }>;
    }>();

    const result = new Map<number, any>();

    phasesPreviewResult.fasiResults.forEach((fase: any) => {
      const faseData = fase;
      const diffItems = faseData.difficultyItems || [];
      const diffEnabled = faseData.difficultyEnabled || false;

      let diffTotal = 0;
      if (diffEnabled && diffItems.length > 0) {
        diffTotal = diffItems.reduce((sum: number, item: any) => {
          if (item.type === 'ALTRO') return sum + (item.customPrice || 0) * item.quantity;
          const typeInfo = DIFFICULTY_TYPES[item.type as DifficultyType];
          return sum + (typeInfo ? typeInfo.unitPrice * item.quantity : 0);
        }, 0);
      }

      const costoMontaggioDifficolta = diffTotal / 2;
      const costoSmontaggioDifficolta = diffTotal / 2;

      const montaggioItems = fase.montaggio?.items || [];
      const smontaggioItems = fase.smontaggio?.items || [];

      // Usa totalRow originale per proporzioni stabili
      const totaleMontaggioBase = montaggioItems.reduce((sum: number, item: any, idx: number) => {
        return sum + item.totalRow;
      }, 0);

      const totaleSmontaggioBase = smontaggioItems.reduce((sum: number, item: any, idx: number) => {
        return sum + item.totalRow;
      }, 0);

      const distribuzioneMontaggioItems = new Map<number, { quotaDifficolta: number; costoUnitarioConDifficolta: number }>();
      const distribuzioneSmontaggioItems = new Map<number, { quotaDifficolta: number; costoUnitarioConDifficolta: number }>();

      if (costoMontaggioDifficolta > 0 && totaleMontaggioBase > 0) {
        montaggioItems.forEach((item: any, idx: number) => {
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleMontaggioBase;
          const quotaDifficolta = costoMontaggioDifficolta * proporzione;
          const costoUnitarioConDifficolta = item.quantity > 0 ? (originalTotal + quotaDifficolta) / item.quantity : 0;
          distribuzioneMontaggioItems.set(idx, { quotaDifficolta, costoUnitarioConDifficolta });
        });
      }

      if (costoSmontaggioDifficolta > 0 && totaleSmontaggioBase > 0) {
        smontaggioItems.forEach((item: any, idx: number) => {
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleSmontaggioBase;
          const quotaDifficolta = costoSmontaggioDifficolta * proporzione;
          const costoUnitarioConDifficolta = item.quantity > 0 ? (originalTotal + quotaDifficolta) / item.quantity : 0;
          distribuzioneSmontaggioItems.set(idx, { quotaDifficolta, costoUnitarioConDifficolta });
        });
      }

      result.set(fase.faseIndex, {
        totale: diffTotal,
        costoMontaggioDifficolta,
        costoSmontaggioDifficolta,
        distribuzioneMontaggioItems,
        distribuzioneSmontaggioItems,
      });
    });

    return result;
  }, [phasesPreviewResult]);

  const phasesVeneziaInfo = useMemo(() => {
    if (!phasesPreviewResult?.fasiResults) return new Map<number, {
      costoMontaggioVenezia: number;
      costoSmontaggioVenezia: number;
      costoGiornaliero: number;
      zonaLabel: string;
      distribuzioneMontaggioItems: Map<number, { quotaVenezia: number }>;
      distribuzioneSmontaggioItems: Map<number, { quotaVenezia: number }>;
    }>();

    const result = new Map<number, any>();

    phasesPreviewResult.fasiResults.forEach((fase: any) => {
      const montaggioItems = fase.montaggio?.items || [];
      const smontaggioItems = fase.smontaggio?.items || [];
      const handlingZones = fase.handling?.breakdown?.zones || [];

      // Usa totalRow originale per proporzioni stabili
      let totaleMontaggioConMov = montaggioItems.reduce((sum: number, item: any, idx: number) => {
        if (item.isACorpo) return sum;
        return sum + item.totalRow;
      }, 0);

      let totaleSmontaggioConMov = smontaggioItems.reduce((sum: number, item: any, idx: number) => {
        if (item.isACorpo) return sum;
        return sum + item.totalRow;
      }, 0);

      if (handlingZones.length > 0) {
        handlingZones.forEach((zone: any, idx: number) => {
          totaleMontaggioConMov += zone.mountCost || 0;
          totaleSmontaggioConMov += zone.dismountCost || 0;
        });
      }

      const veneziaResult = calcolaVenezia(totaleMontaggioConMov, totaleSmontaggioConMov);

      const distribuzioneMontaggioItems = new Map<number, { quotaVenezia: number }>();
      const distribuzioneSmontaggioItems = new Map<number, { quotaVenezia: number }>();

      const totaleMontaggioBase = montaggioItems.reduce((sum: number, item: any, idx: number) => {
        if (item.isACorpo) return sum;
        return sum + item.totalRow;
      }, 0);

      const totaleSmontaggioBase = smontaggioItems.reduce((sum: number, item: any, idx: number) => {
        if (item.isACorpo) return sum;
        return sum + item.totalRow;
      }, 0);

      if (veneziaResult.costoMontaggioVenezia > 0 && totaleMontaggioBase > 0) {
        montaggioItems.forEach((item: any, idx: number) => {
          if (item.isACorpo) return;
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleMontaggioBase;
          const quotaVenezia = veneziaResult.costoMontaggioVenezia * proporzione;
          distribuzioneMontaggioItems.set(idx, { quotaVenezia });
        });
      }

      if (veneziaResult.costoSmontaggioVenezia > 0 && totaleSmontaggioBase > 0) {
        smontaggioItems.forEach((item: any, idx: number) => {
          if (item.isACorpo) return;
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleSmontaggioBase;
          const quotaVenezia = veneziaResult.costoSmontaggioVenezia * proporzione;
          distribuzioneSmontaggioItems.set(idx, { quotaVenezia });
        });
      }

      result.set(fase.faseIndex, {
        costoMontaggioVenezia: veneziaResult.costoMontaggioVenezia,
        costoSmontaggioVenezia: veneziaResult.costoSmontaggioVenezia,
        costoGiornaliero: veneziaResult.costoGiornaliero,
        zonaLabel: veneziaResult.zonaLabel,
        distribuzioneMontaggioItems,
        distribuzioneSmontaggioItems,
      });
    });

    return result;
  }, [phasesPreviewResult, calcolaVenezia]);

  // Helper per calcolare subtotale sezione con override e sconti (per phases mode)
  const getPhasesSectionSubtotal = (faseIndex: number, phase: string, items: any[]) => {
    return items.reduce((sum, item, idx) => {
      const key = `${faseIndex}:${phase}:${idx}`;
      if (deletedPhaseItems.has(key)) return sum;
      const override = phaseItemAmountOverrides.get(key);
      const upOvr = phaseUnitPriceOverrides.get(key);
      const discount = phaseItemDiscounts.get(key) || 0;
      const totalAfterUp = upOvr !== null && upOvr !== undefined ? (item.unitPrice > 0 ? (upOvr / item.unitPrice) * item.totalRow : upOvr * item.quantity) : item.totalRow;
      const basePrice = override !== null && override !== undefined ? override : totalAfterUp;
      return sum + basePrice * (1 - discount / 100);
    }, 0);
  };

  // Helper per calcolare subtotale movimentazione con override e sconti
  const getHandlingSubtotal = (faseIndex: number, zones: any[], type: 'mount' | 'dismount', fase?: any) => {
    let total = zones.reduce((sum, zone, idx) => {
      const key = `${faseIndex}:HANDLING_${type.toUpperCase()}:${idx}`;
      const override = phaseItemAmountOverrides.get(key);
      const discount = phaseItemDiscounts.get(key) || 0;
      const basePrice = override !== null && override !== undefined ? override : (type === 'mount' ? zone.mountCost : zone.dismountCost) || 0;
      return sum + basePrice * (1 - discount / 100);
    }, 0);
    if (fase) {
      if (fase.handling?.breakdown?.saltareti) {
        total += fase.handling.breakdown.saltareti.total;
      }
      if (type === 'mount' && fase.handling?.extraPrice) {
        total += fase.handling.extraPrice;
      }
    }
    return total;
  };

  // Calculate totals with discounts (per-item discounts)
  const calculateTotalsWithDiscounts = () => {
    if (!previewResult) return { phases: [], subtotalBeforeDiscounts: 0, totalDiscounts: 0, grandTotal: 0, handlingTotal: 0, trasfertaInfo: null, veneziaInfo: null };

    let totalItemDiscounts = 0;

    const manualRowToCalcItem = (row: ManualRow, phase: QuotePhase) => ({
      articleId: `MANUAL-${row.id}`,
      articleName: row.description || "Voce aggiuntiva",
      unitPrice: row.amount,
      quantity: 1,
      totalRow: row.amount,
      phase,
      isManualRow: true,
      discountPercent: row.discountPercent || 0,
    });

    let enrichedPhases = previewResult.phases
      .map(p => {
        if (!isPhaseLikeMode) {
          if (p.phase === "TRASPORTO_ANDATA") {
            const filteredItems = p.items.filter((_: any, idx: number) => transportItems[idx]?.andataEnabled !== false);
            return { ...p, items: filteredItems };
          }
          if (p.phase === "TRASPORTO_RITORNO") {
            const filteredItems = p.items.filter((_: any, idx: number) => transportItems[idx]?.ritornoEnabled !== false);
            return { ...p, items: filteredItems };
          }
        }
        return p;
      })
      .filter(p => {
        if (p.items.length > 0) return true;
        if (calcolaVeneziaTransport && p.phase === "TRASPORTO_ANDATA") {
          const lagA = buildLagunariAndataItems(calcolaVeneziaTransport).filter(li => !deletedLagunariItems.has(li.key));
          if (lagA.length > 0) return true;
        }
        if (calcolaVeneziaTransport && p.phase === "TRASPORTO_RITORNO") {
          const lagR = buildLagunariRitornoItems(calcolaVeneziaTransport).filter(li => !deletedLagunariItems.has(li.key));
          if (lagR.length > 0) return true;
        }
        return false;
      })
      .map(p => {
      if (p.phase === "MONTAGGIO" && manualMontaggioRows.length > 0) {
        const manualItems = manualMontaggioRows.filter(r => r.description || r.amount > 0).map(r => manualRowToCalcItem(r, "MONTAGGIO"));
        return { ...p, items: [...p.items, ...manualItems] };
      }
      if (p.phase === "SMONTAGGIO" && manualSmontaggioRows.length > 0) {
        const manualItems = manualSmontaggioRows.filter(r => r.description || r.amount > 0).map(r => manualRowToCalcItem(r, "SMONTAGGIO"));
        return { ...p, items: [...p.items, ...manualItems] };
      }
      if (p.phase === "NOLEGGIO" && manualNoleggioRows.length > 0) {
        const manualItems = manualNoleggioRows.filter(r => r.description || r.amount > 0).map(r => manualRowToCalcItem(r, "NOLEGGIO"));
        return { ...p, items: [...p.items, ...manualItems] };
      }
      return p;
    });

    if (!enrichedPhases.find(p => p.phase === "MONTAGGIO")) {
      const manualItems = manualMontaggioRows.filter(r => r.description || r.amount > 0).map(r => manualRowToCalcItem(r, "MONTAGGIO"));
      enrichedPhases = [...enrichedPhases, { phase: "MONTAGGIO" as QuotePhase, label: "Montaggio", items: manualItems, totalSection: 0, afterDiscount: 0 }];
    }
    if (!enrichedPhases.find(p => p.phase === "SMONTAGGIO")) {
      const manualItems = manualSmontaggioRows.filter(r => r.description || r.amount > 0).map(r => manualRowToCalcItem(r, "SMONTAGGIO"));
      enrichedPhases = [...enrichedPhases, { phase: "SMONTAGGIO" as QuotePhase, label: "Smontaggio", items: manualItems, totalSection: 0, afterDiscount: 0 }];
    }
    if (!enrichedPhases.find(p => p.phase === "NOLEGGIO")) {
      const manualItems = manualNoleggioRows.filter(r => r.description || r.amount > 0).map(r => manualRowToCalcItem(r, "NOLEGGIO"));
      enrichedPhases = [...enrichedPhases, { phase: "NOLEGGIO" as QuotePhase, label: "Noleggio", items: manualItems, totalSection: 0, afterDiscount: 0 }];
    }

    const getEffectiveTotalRow = (item: any, phase: QuotePhase, idx: number): number => {
      const op = item._overridePhase || phase;
      const oi = item._overrideIndex ?? idx;
      if (deletedItems.has(`${op}:${oi}`)) return 0;
      const amountOverride = getItemAmountOverride(phase, idx);
      if (amountOverride !== null) return amountOverride;
      const upOverride = getUnitPriceOverride(phase, idx);
      if (upOverride !== null) return item.unitPrice > 0 ? (upOverride / item.unitPrice) * item.totalRow : upOverride * item.quantity;
      return item.totalRow;
    };

    const montaggioPhase = enrichedPhases.find(p => p.phase === "MONTAGGIO");
    const smontaggioPhase = enrichedPhases.find(p => p.phase === "SMONTAGGIO");
    
    let totaleMontaggioBase = 0;
    let totaleSmontaggioBase = 0;
    
    if (montaggioPhase) {
      montaggioPhase.items.forEach((item, idx) => {
        if ((item as any).isACorpo) return;
        totaleMontaggioBase += item.totalRow;
      });
    }
    
    if (smontaggioPhase) {
      smontaggioPhase.items.forEach((item, idx) => {
        if ((item as any).isACorpo) return;
        totaleSmontaggioBase += item.totalRow;
      });
    }
    
    // Aggiungi movimentazione al totale montaggio/smontaggio
    let movimentazioneMontaggio = 0;
    let movimentazioneSmontaggio = 0;
    
    if (previewResult.handling?.breakdown?.zones) {
      previewResult.handling.breakdown.zones.forEach((zone, idx) => {
        const mountOverride = getHandlingZoneOverride(idx, "mount");
        const dismountOverride = getHandlingZoneOverride(idx, "dismount");
        movimentazioneMontaggio += mountOverride !== null ? mountOverride : zone.mountCost;
        movimentazioneSmontaggio += dismountOverride !== null ? dismountOverride : zone.dismountCost;
      });
      if (previewResult.handling.breakdown.saltareti) {
        movimentazioneMontaggio += previewResult.handling.breakdown.saltareti.total;
        movimentazioneSmontaggio += previewResult.handling.breakdown.saltareti.total;
      }
      if (previewResult.handling.extraPrice) {
        movimentazioneMontaggio += previewResult.handling.extraPrice;
      }
    }
    
    // STEP 2: Calcola trasferta includendo movimentazione nei giorni
    // Formula: giorni = (articoli + movimentazione) / 1200
    const totaleMontaggioConMov = totaleMontaggioBase + movimentazioneMontaggio;
    const totaleSmontaggioConMov = totaleSmontaggioBase + movimentazioneSmontaggio;
    const trasfertaResult = calcolaTrasferta(trasfertaDistanceKm, totaleMontaggioConMov, totaleSmontaggioConMov);
    
    // STEP 3: Prepara informazioni trasferta per distribuzione proporzionale
    // Trasferta montaggio → distribuita su voci MONTAGGIO
    // Trasferta smontaggio → distribuita su voci SMONTAGGIO
    type TrasfertaInfo = {
      fascia: 'nessuna' | 'giornaliera' | 'pernottamento';
      costoMontaggioTrasferta: number;
      costoSmontaggioTrasferta: number;
      totaleMontaggioBase: number;
      totaleSmontaggioBase: number;
      distribuzioneMontaggioItems: Map<number, { quotaTrasferta: number; costoUnitarioRettificato: number }>;
      distribuzioneSmontaggioItems: Map<number, { quotaTrasferta: number; costoUnitarioRettificato: number }>;
    };
    
    const trasfertaInfo: TrasfertaInfo = {
      fascia: trasfertaResult.fascia,
      costoMontaggioTrasferta: trasfertaResult.costoMontaggioTrasferta,
      costoSmontaggioTrasferta: trasfertaResult.costoSmontaggioTrasferta,
      totaleMontaggioBase,
      totaleSmontaggioBase,
      distribuzioneMontaggioItems: new Map(),
      distribuzioneSmontaggioItems: new Map(),
    };
    
    // Distribuisci trasferta MONTAGGIO proporzionalmente su voci MONTAGGIO (usa totalRow originale per proporzioni stabili)
    if (trasfertaResult.costoMontaggioTrasferta > 0 && totaleMontaggioBase > 0) {
      if (montaggioPhase) {
        montaggioPhase.items.forEach((item, idx) => {
          if ((item as any).isACorpo) return;
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleMontaggioBase;
          const rawCostoUnitario = item.quantity > 0 
            ? (originalTotal + trasfertaResult.costoMontaggioTrasferta * proporzione) / item.quantity 
            : item.unitPrice;
          const costoUnitarioRettificato = Math.round(rawCostoUnitario * 100) / 100;
          const quotaTrasferta = item.quantity > 0 ? costoUnitarioRettificato * item.quantity - originalTotal : 0;
          trasfertaInfo.distribuzioneMontaggioItems.set(idx, { quotaTrasferta, costoUnitarioRettificato });
        });
      }
    }
    
    // Distribuisci trasferta SMONTAGGIO proporzionalmente su voci SMONTAGGIO
    if (trasfertaResult.costoSmontaggioTrasferta > 0 && totaleSmontaggioBase > 0) {
      if (smontaggioPhase) {
        smontaggioPhase.items.forEach((item, idx) => {
          if ((item as any).isACorpo) return;
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleSmontaggioBase;
          const rawCostoUnitario = item.quantity > 0 
            ? (originalTotal + trasfertaResult.costoSmontaggioTrasferta * proporzione) / item.quantity 
            : item.unitPrice;
          const costoUnitarioRettificato = Math.round(rawCostoUnitario * 100) / 100;
          const quotaTrasferta = item.quantity > 0 ? costoUnitarioRettificato * item.quantity - originalTotal : 0;
          trasfertaInfo.distribuzioneSmontaggioItems.set(idx, { quotaTrasferta, costoUnitarioRettificato });
        });
      }
    }

    // STEP 4: Prepara informazioni incremento difficoltà per distribuzione proporzionale
    // Difficoltà → 50% su MONTAGGIO, 50% su SMONTAGGIO (come trasferta)
    type DifficultyInfo = {
      totale: number;
      costoMontaggioDifficolta: number;
      costoSmontaggioDifficolta: number;
      distribuzioneMontaggioItems: Map<number, { quotaDifficolta: number; costoUnitarioConDifficolta: number }>;
      distribuzioneSmontaggioItems: Map<number, { quotaDifficolta: number; costoUnitarioConDifficolta: number }>;
    };
    
    const difficultyTotal = calculateDifficultyTotal();
    const difficultyInfo: DifficultyInfo = {
      totale: difficultyTotal,
      costoMontaggioDifficolta: difficultyTotal / 2, // 50% su montaggio
      costoSmontaggioDifficolta: difficultyTotal / 2, // 50% su smontaggio
      distribuzioneMontaggioItems: new Map(),
      distribuzioneSmontaggioItems: new Map(),
    };
    
    // Distribuisci difficoltà MONTAGGIO proporzionalmente su voci MONTAGGIO (usa totalRow originale per proporzioni stabili)
    if (difficultyInfo.costoMontaggioDifficolta > 0 && totaleMontaggioBase > 0) {
      if (montaggioPhase) {
        montaggioPhase.items.forEach((item, idx) => {
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleMontaggioBase;
          const quotaDifficolta = difficultyInfo.costoMontaggioDifficolta * proporzione;
          const costoUnitarioConDifficolta = item.quantity > 0 
            ? (originalTotal + quotaDifficolta) / item.quantity 
            : item.unitPrice;
          difficultyInfo.distribuzioneMontaggioItems.set(idx, { quotaDifficolta, costoUnitarioConDifficolta });
        });
      }
    }
    
    // Distribuisci difficoltà SMONTAGGIO proporzionalmente su voci SMONTAGGIO
    if (difficultyInfo.costoSmontaggioDifficolta > 0 && totaleSmontaggioBase > 0) {
      if (smontaggioPhase) {
        smontaggioPhase.items.forEach((item, idx) => {
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleSmontaggioBase;
          const quotaDifficolta = difficultyInfo.costoSmontaggioDifficolta * proporzione;
          const costoUnitarioConDifficolta = item.quantity > 0 
            ? (originalTotal + quotaDifficolta) / item.quantity 
            : item.unitPrice;
          difficultyInfo.distribuzioneSmontaggioItems.set(idx, { quotaDifficolta, costoUnitarioConDifficolta });
        });
      }
    }

    // STEP 5: Prepara informazioni Venezia per distribuzione proporzionale
    type VeneziaInfo = {
      costoMontaggioVenezia: number;
      costoSmontaggioVenezia: number;
      costoGiornaliero: number;
      zonaLabel: string;
      distribuzioneMontaggioItems: Map<number, { quotaVenezia: number }>;
      distribuzioneSmontaggioItems: Map<number, { quotaVenezia: number }>;
    };

    const veneziaResult = calcolaVenezia(totaleMontaggioConMov, totaleSmontaggioConMov);
    const veneziaInfo: VeneziaInfo = {
      costoMontaggioVenezia: veneziaResult.costoMontaggioVenezia,
      costoSmontaggioVenezia: veneziaResult.costoSmontaggioVenezia,
      costoGiornaliero: veneziaResult.costoGiornaliero,
      zonaLabel: veneziaResult.zonaLabel,
      distribuzioneMontaggioItems: new Map(),
      distribuzioneSmontaggioItems: new Map(),
    };

    if (veneziaResult.costoMontaggioVenezia > 0 && totaleMontaggioBase > 0) {
      if (montaggioPhase) {
        montaggioPhase.items.forEach((item, idx) => {
          if ((item as any).isACorpo) return;
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleMontaggioBase;
          const quotaVenezia = veneziaResult.costoMontaggioVenezia * proporzione;
          veneziaInfo.distribuzioneMontaggioItems.set(idx, { quotaVenezia });
        });
      }
    }

    if (veneziaResult.costoSmontaggioVenezia > 0 && totaleSmontaggioBase > 0) {
      if (smontaggioPhase) {
        smontaggioPhase.items.forEach((item, idx) => {
          if ((item as any).isACorpo) return;
          const originalTotal = item.totalRow;
          const proporzione = originalTotal / totaleSmontaggioBase;
          const quotaVenezia = veneziaResult.costoSmontaggioVenezia * proporzione;
          veneziaInfo.distribuzioneSmontaggioItems.set(idx, { quotaVenezia });
        });
      }
    }

    const phaseTotals = enrichedPhases.map(phase => {
      // Calculate each item with its individual discount and amount override
      const itemsWithDiscounts = phase.items.map((item, idx) => {
        const itemOverridePhase = (item as any)._overridePhase || phase.phase;
        const itemOverrideIdx = (item as any)._overrideIndex ?? idx;
        const itemIsDeleted = deletedItems.has(`${itemOverridePhase}:${itemOverrideIdx}`);

        const isPosItem = posArticle && item.articleId === posArticle.id && posManualEnabled;
        const baseTotal = isPosItem ? posManualPrice : item.totalRow;
        
        const upOverride = getUnitPriceOverride(phase.phase, idx);
        const isNoleggioRental = phase.phase === "NOLEGGIO" && !(articles || []).some(a => a.pricingLogic === "SALE" && String(a.id) === String(item.articleId));
        const totalAfterUnitPrice = upOverride !== null ? upOverride * item.quantity * (isNoleggioRental ? durationMonths : 1) : baseTotal;
        
        const amountOverride = getItemAmountOverride(phase.phase, idx);
        const actualTotal = itemIsDeleted ? 0 : (amountOverride !== null ? amountOverride : totalAfterUnitPrice);
        const hasAmountOverride = amountOverride !== null;
        const hasUnitPriceOverride = upOverride !== null;


        let trasfertaItem = null;
        if (phase.phase === "MONTAGGIO" && trasfertaInfo.distribuzioneMontaggioItems.has(idx)) {
          trasfertaItem = trasfertaInfo.distribuzioneMontaggioItems.get(idx);
        } else if (phase.phase === "SMONTAGGIO" && trasfertaInfo.distribuzioneSmontaggioItems.has(idx)) {
          trasfertaItem = trasfertaInfo.distribuzioneSmontaggioItems.get(idx);
        }
        
        // Aggiungi info difficoltà per voci montaggio e smontaggio
        let difficultyItem = null;
        if (phase.phase === "MONTAGGIO" && difficultyInfo.distribuzioneMontaggioItems.has(idx)) {
          difficultyItem = difficultyInfo.distribuzioneMontaggioItems.get(idx);
        } else if (phase.phase === "SMONTAGGIO" && difficultyInfo.distribuzioneSmontaggioItems.has(idx)) {
          difficultyItem = difficultyInfo.distribuzioneSmontaggioItems.get(idx);
        }

        let veneziaItem = null;
        if (phase.phase === "MONTAGGIO" && veneziaInfo.distribuzioneMontaggioItems.has(idx)) {
          veneziaItem = veneziaInfo.distribuzioneMontaggioItems.get(idx);
        } else if (phase.phase === "SMONTAGGIO" && veneziaInfo.distribuzioneSmontaggioItems.has(idx)) {
          veneziaItem = veneziaInfo.distribuzioneSmontaggioItems.get(idx);
        }
        
        // Calcola totale rettificato (base + trasferta + difficoltà + venezia) per applicare lo sconto
        const quotaTrasferta = trasfertaItem?.quotaTrasferta || 0;
        const quotaDifficolta = difficultyItem?.quotaDifficolta || 0;
        const quotaVenezia = veneziaItem?.quotaVenezia || 0;
        const totaleRettificato = actualTotal + quotaTrasferta + quotaDifficolta + quotaVenezia;
        
        const discountPercent = (item as any).isManualRow ? ((item as any).discountPercent || 0) : getItemDiscount(phase.phase, idx);
        const nolMonths = isNoleggioRental ? durationMonths : 1;
        const costoUnitario = item.quantity > 0 ? totaleRettificato / item.quantity / nolMonths : totaleRettificato;
        const costoUnitarioScontato = Math.round(costoUnitario * (1 - discountPercent / 100) * 100) / 100;
        const afterDiscount = discountPercent === 0 ? totaleRettificato : (item.quantity > 0 ? Math.round(costoUnitarioScontato * item.quantity * nolMonths * 100) / 100 : costoUnitarioScontato);
        const discountAmount = totaleRettificato - afterDiscount;
        totalItemDiscounts += discountAmount;
        
        return {
          ...item,
          originalTotal: baseTotal,
          totalRow: actualTotal,
          totaleRettificato,
          hasAmountOverride,
          hasUnitPriceOverride,
          discountPercent,
          discountAmount,
          afterDiscount,
          trasfertaItem,
          difficultyItem,
          veneziaItem,
          _deleted: itemIsDeleted,
        };
      });

      const visibleItems = itemsWithDiscounts.filter(i => !i._deleted);
      const phaseAfterDiscounts = visibleItems.reduce((acc, item) => acc + item.afterDiscount, 0);

      return {
        ...phase,
        items: visibleItems,
        afterDiscount: phaseAfterDiscounts,
      };
    });

    const saleArticleIds = new Set(
      (articles || []).filter(a => a.pricingLogic === "SALE").map(a => String(a.id))
    );

    const finalPhaseTotals: typeof phaseTotals = [];
    for (const phase of phaseTotals) {
      if (phase.phase === "NOLEGGIO") {
        const taggedItems = phase.items.map((item, origIdx) => ({ item, origIdx }));
        const saleTagged = taggedItems.filter(t => saleArticleIds.has(String(t.item.articleId)));
        const noleggioTagged = taggedItems.filter(t => !saleArticleIds.has(String(t.item.articleId)));
        
        const noleggioAfterDiscount = noleggioTagged.reduce((acc, t) => acc + t.item.afterDiscount, 0);
        const noleggioItemsWithMeta = noleggioTagged.map(t => ({
          ...t.item,
          _overridePhase: "NOLEGGIO" as QuotePhase,
          _overrideIndex: t.origIdx,
        }));
        finalPhaseTotals.push({
          ...phase,
          items: noleggioItemsWithMeta,
          afterDiscount: noleggioAfterDiscount,
        });

        if (saleTagged.length > 0) {
          const fornituraAfterDiscount = saleTagged.reduce((acc, t) => acc + t.item.afterDiscount, 0);
          const saleItemsWithMeta = saleTagged.map(t => ({
            ...t.item,
            _overridePhase: "NOLEGGIO" as any,
            _overrideIndex: t.origIdx,
          }));
          finalPhaseTotals.push({
            phase: "FORNITURA" as any,
            label: "Fornitura",
            items: saleItemsWithMeta,
            subtotal: saleTagged.reduce((acc, t) => acc + t.item.totalRow, 0),
            afterDiscount: fornituraAfterDiscount,
          });
        }
      } else {
        finalPhaseTotals.push(phase);
      }
    }

    // Somma totaleRettificato per item (base + trasferta + difficoltà, PRIMA degli sconti)
    const itemsTotaleRettificato = finalPhaseTotals.reduce((acc, phase) => {
      return acc + phase.items.reduce((itemAcc, item) => itemAcc + (item.totaleRettificato || item.totalRow), 0);
    }, 0);

    // Somma afterDiscount (base + trasferta + difficoltà, DOPO sconti per articolo)
    const sumAfterItemDiscounts = finalPhaseTotals.reduce((acc, phase) => {
      return acc + phase.items.reduce((itemAcc, item) => itemAcc + item.afterDiscount, 0);
    }, 0);

    const globalDiscountAmount = sumAfterItemDiscounts * (globalDiscountPercent / 100);
    const itemsGrandTotal = sumAfterItemDiscounts - globalDiscountAmount;

    // Handling costs con override e sconti individuali per zona
    let handlingMountBase = 0;
    let handlingDismountBase = 0;
    let handlingMountAfterZoneDiscounts = 0;
    let handlingDismountAfterZoneDiscounts = 0;
    
    if (previewResult.handling?.breakdown?.zones) {
      previewResult.handling.breakdown.zones.forEach((zone, idx) => {
        // Montaggio (senza trasferta - calcolo semplice)
        const mountOverride = getHandlingZoneOverride(idx, "mount");
        const mountDiscount = getHandlingZoneDiscount(idx, "mount");
        const currentMount = mountOverride !== null ? mountOverride : zone.mountCost;
        const afterDiscountMount = currentMount * (1 - mountDiscount / 100);
        handlingMountBase += currentMount;
        handlingMountAfterZoneDiscounts += afterDiscountMount;
        
        // Smontaggio (senza trasferta - calcolo semplice)
        const dismountOverride = getHandlingZoneOverride(idx, "dismount");
        const dismountDiscount = getHandlingZoneDiscount(idx, "dismount");
        const currentDismount = dismountOverride !== null ? dismountOverride : zone.dismountCost;
        const afterDiscountDismount = currentDismount * (1 - dismountDiscount / 100);
        handlingDismountBase += currentDismount;
        handlingDismountAfterZoneDiscounts += afterDiscountDismount;
      });
      
      // Aggiungi saltareti e extra se presenti
      if (previewResult.handling.breakdown.saltareti) {
        handlingMountBase += previewResult.handling.breakdown.saltareti.total;
        handlingDismountBase += previewResult.handling.breakdown.saltareti.total;
        handlingMountAfterZoneDiscounts += previewResult.handling.breakdown.saltareti.total;
        handlingDismountAfterZoneDiscounts += previewResult.handling.breakdown.saltareti.total;
      }
      if (previewResult.handling.extraPrice) {
        handlingMountBase += previewResult.handling.extraPrice;
        handlingMountAfterZoneDiscounts += previewResult.handling.extraPrice;
      }
    }
    
    // Applica sconto globale sul totale movimentazione (dopo sconti individuali)
    const handlingMountDiscountAmount = handlingMountAfterZoneDiscounts * (movMountDiscount / 100);
    const handlingDismountDiscountAmount = handlingDismountAfterZoneDiscounts * (movDismountDiscount / 100);
    const handlingMountAfterDiscount = handlingMountAfterZoneDiscounts - handlingMountDiscountAmount;
    const handlingDismountAfterDiscount = handlingDismountAfterZoneDiscounts - handlingDismountDiscountAmount;
    const handlingTotal = handlingMountAfterDiscount + handlingDismountAfterDiscount;

    // Sconti movimentazione (zona + globali)
    const handlingZoneDiscounts = (handlingMountBase - handlingMountAfterZoneDiscounts) + (handlingDismountBase - handlingDismountAfterZoneDiscounts);
    const handlingGlobalDiscounts = handlingMountDiscountAmount + handlingDismountDiscountAmount;

    // Trasporti Lagunari
    const lagunariTotal = getLagunariEffectiveTotal();

    // Totale Articoli = tutti i costi prima degli sconti (articoli con T+D + movimentazione base + lagunari)
    const subtotalBeforeDiscounts = itemsTotaleRettificato + handlingMountBase + handlingDismountBase + lagunariTotal;

    // Totale Sconti = tutti gli sconti (articoli + globale + movimentazione zona + movimentazione globale)
    const totalDiscounts = totalItemDiscounts + globalDiscountAmount + handlingZoneDiscounts + handlingGlobalDiscounts;

    // Grand total = items (con trasferta+difficoltà, dopo sconti) + handling netto + lagunari - extra sconto
    const grandTotal = Math.max(0, itemsGrandTotal + handlingTotal + lagunariTotal - extraDiscountAmount);

    const phaseOrder: string[] = [
      "DOCUMENTI",
      "TRASPORTO_ANDATA", 
      "MOVIMENTAZIONE_MAGAZZINO",
      "MONTAGGIO",
      "SMONTAGGIO",
      "TRASPORTO_RITORNO",
      "NOLEGGIO",
      "FORNITURA",
    ];
    
    const sortedPhaseTotals = [...finalPhaseTotals].sort((a, b) => {
      const indexA = phaseOrder.indexOf(a.phase);
      const indexB = phaseOrder.indexOf(b.phase);
      return indexA - indexB;
    });

    return { 
      phases: sortedPhaseTotals, 
      subtotalBeforeDiscounts, 
      totalDiscounts, 
      grandTotal, 
      handlingTotal,
      handlingMountBase,
      handlingDismountBase,
      handlingMountAfterZoneDiscounts,
      handlingDismountAfterZoneDiscounts,
      handlingMountAfterDiscount,
      handlingDismountAfterDiscount,
      itemsAfterDiscounts: itemsGrandTotal,
      trasfertaInfo,
      difficultyInfo,
      veneziaInfo,
      extraDiscountAmount,
      extraDiscountNote,
      lagunariTotal,
      lagunariItems: calcolaVeneziaTransport ? buildLagunariItems(calcolaVeneziaTransport) : [],
    };
  };

  const calculatePhasesTotalsForPdf = (phasesResultOverride?: PhasesPreviewResult | null) => {
    const effectivePhasesResult = phasesResultOverride || phasesPreviewResult;
    if (!effectivePhasesResult?.fasiResults) return { phases: [], phasesMode: false, fasiData: [], documenti: { items: [] }, subtotalBeforeDiscounts: 0, totalDiscounts: 0, grandTotal: 0, handlingTotal: 0, trasfertaInfo: null, difficultyInfo: null, veneziaInfo: null, handlingMountAfterDiscount: 0, handlingDismountAfterDiscount: 0, handlingMountBase: 0, handlingDismountBase: 0, handlingMountAfterZoneDiscounts: 0, handlingDismountAfterZoneDiscounts: 0, itemsAfterDiscounts: 0, extraDiscountAmount, extraDiscountNote };

    let totalItemDiscounts = 0;
    let totalHandlingMountBase = 0;
    let totalHandlingDismountBase = 0;
    let totalHandlingMountAfterZone = 0;
    let totalHandlingDismountAfterZone = 0;

    const saleArticleIds = new Set(
      (articles || []).filter(a => a.pricingLogic === "SALE").map(a => String(a.id))
    );

    const processItem = (item: any, fi: number, phaseType: string, idx: number, faseTrasferta: any, faseDiff: any, faseVenezia?: any, faseDurationMonths?: number) => {
      const key = `${fi}:${phaseType}:${idx}`;
      const isDeleted = deletedPhaseItems.has(key);
      const override = phaseItemAmountOverrides.get(key);
      const discount = phaseItemDiscounts.get(key) || 0;
      const upOverride = phaseUnitPriceOverrides.get(key);
      const hasUpOverride = upOverride !== null && upOverride !== undefined;
      const isNoleggioRentalFase = phaseType === "NOLEGGIO" && !(saleArticleIds.has(String(item.articleId))) && !item._fromFornitura;
      const nolDurationMultiplier = isNoleggioRentalFase ? (faseDurationMonths ?? durationMonths) : 1;
      const basePrice = isDeleted ? 0 : (override !== null && override !== undefined
        ? override
        : (hasUpOverride ? upOverride * item.quantity * nolDurationMultiplier : item.totalRow));

      let trasfertaItem = null;
      let difficultyItem = null;
      let veneziaItem = null;
      let quotaTrasferta = 0;
      let quotaDifficolta = 0;
      let quotaVenezia = 0;

      if (phaseType === "MONTAGGIO" && faseTrasferta?.distribuzioneMontaggioItems.has(idx)) {
        trasfertaItem = faseTrasferta.distribuzioneMontaggioItems.get(idx);
        quotaTrasferta = trasfertaItem?.quotaTrasferta || 0;
      } else if (phaseType === "SMONTAGGIO" && faseTrasferta?.distribuzioneSmontaggioItems.has(idx)) {
        trasfertaItem = faseTrasferta.distribuzioneSmontaggioItems.get(idx);
        quotaTrasferta = trasfertaItem?.quotaTrasferta || 0;
      }

      if (phaseType === "MONTAGGIO" && faseDiff?.distribuzioneMontaggioItems.has(idx)) {
        difficultyItem = faseDiff.distribuzioneMontaggioItems.get(idx);
        quotaDifficolta = difficultyItem?.quotaDifficolta || 0;
      } else if (phaseType === "SMONTAGGIO" && faseDiff?.distribuzioneSmontaggioItems.has(idx)) {
        difficultyItem = faseDiff.distribuzioneSmontaggioItems.get(idx);
        quotaDifficolta = difficultyItem?.quotaDifficolta || 0;
      }

      if (phaseType === "MONTAGGIO" && faseVenezia?.distribuzioneMontaggioItems.has(idx)) {
        veneziaItem = faseVenezia.distribuzioneMontaggioItems.get(idx);
        quotaVenezia = veneziaItem?.quotaVenezia || 0;
      } else if (phaseType === "SMONTAGGIO" && faseVenezia?.distribuzioneSmontaggioItems.has(idx)) {
        veneziaItem = faseVenezia.distribuzioneSmontaggioItems.get(idx);
        quotaVenezia = veneziaItem?.quotaVenezia || 0;
      }

      const totaleRettificato = Math.round((basePrice + quotaTrasferta + quotaDifficolta + quotaVenezia) * 100) / 100;
      const nolMonthsFase = isNoleggioRentalFase ? (faseDurationMonths ?? durationMonths) : 1;
      const costoUnitario = item.quantity > 0 ? totaleRettificato / item.quantity / nolMonthsFase : totaleRettificato;
      const costoUnitarioScontato = Math.round(costoUnitario * (1 - discount / 100) * 100) / 100;
      const afterDiscount = discount === 0 ? totaleRettificato : (item.quantity > 0 ? Math.round(costoUnitarioScontato * item.quantity * nolMonthsFase * 100) / 100 : costoUnitarioScontato);
      const discountAmount = totaleRettificato - afterDiscount;
      totalItemDiscounts += discountAmount;

      return {
        ...item,
        phase: phaseType,
        totalRow: basePrice,
        totaleRettificato,
        hasAmountOverride: override !== null && override !== undefined,
        hasUnitPriceOverride: hasUpOverride,
        discountPercent: discount,
        discountAmount,
        afterDiscount,
        trasfertaItem,
        difficultyItem,
        veneziaItem,
        _deleted: isDeleted,
      };
    };

    const documentiItems: any[] = [];
    if (effectivePhasesResult.documenti?.items) {
      effectivePhasesResult.documenti.items.forEach((item: any, idx: number) => {
        if (deletedPhaseItems.has(`DOCUMENTI:${idx}`)) return;
        const key = `DOCUMENTI:${idx}`;
        const override = phaseItemAmountOverrides.get(key);
        const discount = phaseItemDiscounts.get(key) || 0;
        const basePrice = override !== null && override !== undefined ? override : item.totalRow;
        const discountAmount = basePrice * (discount / 100);
        totalItemDiscounts += discountAmount;
        documentiItems.push({
          ...item,
          phase: "DOCUMENTI",
          totalRow: basePrice,
          totaleRettificato: basePrice,
          hasAmountOverride: override !== null && override !== undefined,
          discountPercent: discount,
          discountAmount,
          afterDiscount: basePrice - discountAmount,
          trasfertaItem: null,
          difficultyItem: null,
        });
      });
    }

    const fasiData: any[] = [];
    let allItemsForPhasesFlat: any[] = [...documentiItems];

    effectivePhasesResult.fasiResults.forEach((fase: any) => {
      const fi = fase.faseIndex;
      const faseConfig = fasi[fi];
      const faseTransportItemsCfg = faseConfig?.transportItems || [];
      const faseTrasferta = phasesTrasfertaInfo.get(fi);
      const faseDiff = phasesDifficultyInfo.get(fi);
      const faseVenezia = phasesVeneziaInfo.get(fi);

      const sections: any[] = [];

      const addSection = (type: string, title: string, items: any[]) => {
        const processedItems = items.map((item: any, idx: number) => processItem(item, fi, type, idx, faseTrasferta, faseDiff, faseVenezia, faseConfig?.durationMonths)).filter(i => !i._deleted);
        if (processedItems.length > 0) {
          sections.push({ type, title, items: processedItems });
          allItemsForPhasesFlat.push(...processedItems);
        }
        return processedItems;
      };

      const andataFiltered = (fase.trasportoAndata?.items || []).filter((_: any, idx: number) => faseTransportItemsCfg[idx]?.andataEnabled !== false);
      addSection("TRASPORTO_ANDATA", "Trasporto Andata", andataFiltered);
      addSection("MOVIMENTAZIONE_MAGAZZINO", "Costo Magazzino", fase.costoMagazzino?.items || []);

      const montaggioProcessed = addSection("MONTAGGIO", "Montaggio", fase.montaggio?.items || []);

      const faseManualRows = phasesManualRows.get(fi);
      if (faseManualRows) {
        const montaggioSection = sections.find(s => s.type === "MONTAGGIO");
        faseManualRows.montaggio.filter(r => r.description || r.amount > 0).forEach((row) => {
          const discountAmount = row.amount * (row.discountPercent / 100);
          totalItemDiscounts += discountAmount;
          const manualItem = {
            articleId: `MANUAL-${row.id}`,
            articleName: row.description || "Voce aggiuntiva",
            unitPrice: row.amount,
            quantity: 1,
            totalRow: row.amount,
            totaleRettificato: row.amount,
            phase: "MONTAGGIO",
            isManualRow: true,
            discountPercent: row.discountPercent || 0,
            discountAmount,
            afterDiscount: row.amount - discountAmount,
            hasAmountOverride: false,
            trasfertaItem: null,
            difficultyItem: null,
          };
          if (montaggioSection) {
            montaggioSection.items.push(manualItem);
          } else {
            sections.push({ type: "MONTAGGIO", title: "Montaggio", items: [manualItem] });
          }
          allItemsForPhasesFlat.push(manualItem);
        });
      }

      addSection("SMONTAGGIO", "Smontaggio", fase.smontaggio?.items || []);

      if (faseManualRows) {
        const smontaggioSection = sections.find(s => s.type === "SMONTAGGIO");
        faseManualRows.smontaggio.filter(r => r.description || r.amount > 0).forEach((row) => {
          const discountAmount = row.amount * (row.discountPercent / 100);
          totalItemDiscounts += discountAmount;
          const manualItem = {
            articleId: `MANUAL-${row.id}`,
            articleName: row.description || "Voce aggiuntiva",
            unitPrice: row.amount,
            quantity: 1,
            totalRow: row.amount,
            totaleRettificato: row.amount,
            phase: "SMONTAGGIO",
            isManualRow: true,
            discountPercent: row.discountPercent || 0,
            discountAmount,
            afterDiscount: row.amount - discountAmount,
            hasAmountOverride: false,
            trasfertaItem: null,
            difficultyItem: null,
          };
          if (smontaggioSection) {
            smontaggioSection.items.push(manualItem);
          } else {
            sections.push({ type: "SMONTAGGIO", title: "Smontaggio", items: [manualItem] });
          }
          allItemsForPhasesFlat.push(manualItem);
        });
      }

      const ritornoFiltered = (fase.trasportoRitorno?.items || []).filter((_: any, idx: number) => faseTransportItemsCfg[idx]?.ritornoEnabled !== false);
      addSection("TRASPORTO_RITORNO", "Trasporto Ritorno", ritornoFiltered);

      const noleggioRaw = fase.noleggio?.items || [];
      const noleggioProcessed = noleggioRaw.map((item: any, idx: number) => processItem(item, fi, "NOLEGGIO", idx, faseTrasferta, faseDiff, faseVenezia, faseConfig?.durationMonths));

      const noleggioItems = noleggioProcessed.filter((item: any) => !saleArticleIds.has(String(item.articleId)) && !item._fromFornitura);
      const saleItems = noleggioProcessed.filter((item: any) => saleArticleIds.has(String(item.articleId)) || item._fromFornitura);

      const faseManualRowsForNoleggio = phasesManualRows.get(fi);
      if (faseManualRowsForNoleggio?.noleggio) {
        faseManualRowsForNoleggio.noleggio.filter(r => r.description || r.amount > 0).forEach((row) => {
          const discountAmount = row.amount * (row.discountPercent / 100);
          totalItemDiscounts += discountAmount;
          const manualItem = {
            articleId: `MANUAL-${row.id}`,
            articleName: row.description || "Voce aggiuntiva",
            unitPrice: row.amount,
            quantity: 1,
            totalRow: row.amount,
            totaleRettificato: row.amount,
            phase: "NOLEGGIO",
            isManualRow: true,
            discountPercent: row.discountPercent || 0,
            discountAmount,
            afterDiscount: row.amount - discountAmount,
            hasAmountOverride: false,
            trasfertaItem: null,
            difficultyItem: null,
          };
          noleggioItems.push(manualItem);
        });
      }

      if (noleggioItems.length > 0) {
        sections.push({ type: "NOLEGGIO", title: "Noleggio", items: noleggioItems });
        allItemsForPhasesFlat.push(...noleggioItems);
      }
      if (saleItems.length > 0) {
        sections.push({ type: "FORNITURA", title: "Fornitura", items: saleItems });
        allItemsForPhasesFlat.push(...saleItems);
      }

      let faseHandlingMountAfterDiscount = 0;
      let faseHandlingDismountAfterDiscount = 0;

      if (fase.handling?.breakdown?.zones?.length > 0) {
        let faseHandlingMountBase = 0;
        let faseHandlingDismountBase = 0;
        let faseHandlingMountAfterZoneLocal = 0;
        let faseHandlingDismountAfterZoneLocal = 0;

        fase.handling.breakdown.zones.forEach((zone: any, idx: number) => {
          const mountKey = `${fi}:HANDLING_MOUNT:${idx}`;
          const mountOverride = phaseItemAmountOverrides.get(mountKey);
          const mountDiscount = phaseItemDiscounts.get(mountKey) || 0;
          const mountBase = mountOverride !== null && mountOverride !== undefined ? mountOverride : (zone.mountCost || 0);
          faseHandlingMountBase += mountBase;
          faseHandlingMountAfterZoneLocal += mountBase * (1 - mountDiscount / 100);

          const dismountKey = `${fi}:HANDLING_DISMOUNT:${idx}`;
          const dismountOverride = phaseItemAmountOverrides.get(dismountKey);
          const dismountDiscount = phaseItemDiscounts.get(dismountKey) || 0;
          const dismountBase = dismountOverride !== null && dismountOverride !== undefined ? dismountOverride : (zone.dismountCost || 0);
          faseHandlingDismountBase += dismountBase;
          faseHandlingDismountAfterZoneLocal += dismountBase * (1 - dismountDiscount / 100);
        });

        if (fase.handling.breakdown.saltareti) {
          faseHandlingMountBase += fase.handling.breakdown.saltareti.total;
          faseHandlingDismountBase += fase.handling.breakdown.saltareti.total;
          faseHandlingMountAfterZoneLocal += fase.handling.breakdown.saltareti.total;
          faseHandlingDismountAfterZoneLocal += fase.handling.breakdown.saltareti.total;
        }
        if (fase.handling.extraPrice) {
          faseHandlingMountBase += fase.handling.extraPrice;
          faseHandlingMountAfterZoneLocal += fase.handling.extraPrice;
        }

        const mountGlobalDisc = phaseHandlingMountGlobalDiscount.get(fi) || 0;
        const dismountGlobalDisc = phaseHandlingDismountGlobalDiscount.get(fi) || 0;
        faseHandlingMountAfterDiscount = faseHandlingMountAfterZoneLocal * (1 - mountGlobalDisc / 100);
        faseHandlingDismountAfterDiscount = faseHandlingDismountAfterZoneLocal * (1 - dismountGlobalDisc / 100);

        totalHandlingMountBase += faseHandlingMountBase;
        totalHandlingDismountBase += faseHandlingDismountBase;
        totalHandlingMountAfterZone += faseHandlingMountAfterDiscount;
        totalHandlingDismountAfterZone += faseHandlingDismountAfterDiscount;
      }

      const faseName = faseConfig?.customLabel?.trim() || (quoteMode === 'a_corpo' ? 'A corpo' : `Fase ${fi + 1}`);
      const faseDuration = faseConfig?.durationMonths || 1;

      const faseVt = phasesLagunariData.get(fi);
      const kp = `f${fi}:`;
      const faseLagunariAndata = faseVt ? buildLagunariAndataItems(faseVt, kp)
        .filter(item => !deletedLagunariItems.has(item.key))
        .map(item => {
          const override = lagunariAmountOverrides.get(item.key);
          const disc = lagunariDiscounts.get(item.key) || 0;
          const base = override !== null && override !== undefined ? override : item.total;
          const eff = round2(base * (1 - disc / 100));
          const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
          return { ...item, label: 'Trasporto lagunare', total: eff, unitPrice: eff, vatRate: lagVat };
        }) : [];
      const faseLagunariRitorno = faseVt ? buildLagunariRitornoItems(faseVt, kp)
        .filter(item => !deletedLagunariItems.has(item.key))
        .map(item => {
          const override = lagunariAmountOverrides.get(item.key);
          const disc = lagunariDiscounts.get(item.key) || 0;
          const base = override !== null && override !== undefined ? override : item.total;
          const eff = round2(base * (1 - disc / 100));
          const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
          return { ...item, label: 'Trasporto lagunare', total: eff, unitPrice: eff, vatRate: lagVat };
        }) : [];

      fasiData.push({
        faseIndex: fi,
        faseName,
        faseDuration,
        sections,
        handlingMountAfterDiscount: faseHandlingMountAfterDiscount,
        handlingDismountAfterDiscount: faseHandlingDismountAfterDiscount,
        lagunariAndataItems: faseLagunariAndata,
        lagunariRitornoItems: faseLagunariRitorno,
      });
    });

    const allTotaleRettificato = allItemsForPhasesFlat.reduce((acc, item) => acc + (item.totaleRettificato || item.totalRow), 0);
    const sumAfterItemDiscounts = allItemsForPhasesFlat.reduce((acc, item) => acc + item.afterDiscount, 0);
    const globalDiscountAmount = sumAfterItemDiscounts * (globalDiscountPercent / 100);
    const itemsGrandTotal = sumAfterItemDiscounts - globalDiscountAmount;

    const handlingTotal = totalHandlingMountAfterZone + totalHandlingDismountAfterZone;
    const lagunariTotalForPhases = getLagunariEffectiveTotal();
    const subtotalBeforeDiscounts = allTotaleRettificato + totalHandlingMountBase + totalHandlingDismountBase + lagunariTotalForPhases;
    const handlingZoneDiscounts = (totalHandlingMountBase - totalHandlingMountAfterZone) + (totalHandlingDismountBase - totalHandlingDismountAfterZone);
    const totalDiscounts = totalItemDiscounts + globalDiscountAmount + handlingZoneDiscounts;
    const grandTotal = Math.max(0, itemsGrandTotal + handlingTotal + lagunariTotalForPhases - extraDiscountAmount);

    return {
      phases: [],
      phasesMode: true,
      documenti: { items: documentiItems },
      fasiData,
      subtotalBeforeDiscounts,
      totalDiscounts,
      grandTotal,
      handlingTotal,
      handlingMountBase: totalHandlingMountBase,
      handlingDismountBase: totalHandlingDismountBase,
      handlingMountAfterZoneDiscounts: totalHandlingMountAfterZone,
      handlingDismountAfterZoneDiscounts: totalHandlingDismountAfterZone,
      handlingMountAfterDiscount: totalHandlingMountAfterZone,
      handlingDismountAfterDiscount: totalHandlingDismountAfterZone,
      itemsAfterDiscounts: itemsGrandTotal,
      trasfertaInfo: null,
      difficultyInfo: null,
      veneziaInfo: null,
      extraDiscountAmount,
      extraDiscountNote,
      lagunariTotal: lagunariTotalForPhases,
      lagunariItems: calcolaVeneziaTransport ? buildLagunariItems(calcolaVeneziaTransport) : [],
    };
  };

  // Calculate VAT breakdown by rate (handles per-item VAT overrides)
  const calculateVatBreakdownByRate = (totalsData: ReturnType<typeof calculateTotalsWithDiscounts>) => {
    const breakdown: Record<string, { imponibile: number; iva: number }> = {
      "22": { imponibile: 0, iva: 0 },
      "10": { imponibile: 0, iva: 0 },
      "4": { imponibile: 0, iva: 0 },
      "RC": { imponibile: 0, iva: 0 },
    };
    
    totalsData.phases.forEach(phase => {
      phase.items.forEach((item: any, idx: number) => {
        const key = `${phase.phase}:${idx}`;
        const itemVat = itemVatOverrides.get(key) || vatRateDefault;
        const itemTotal = item.afterDiscount !== undefined && item.afterDiscount !== null ? item.afterDiscount : item.totalRow;
        
        breakdown[itemVat].imponibile += itemTotal;
      });
    });
    
    const globalFactor = 1 - globalDiscountPercent / 100;
    Object.keys(breakdown).forEach(rate => {
      breakdown[rate].imponibile *= globalFactor;
      if (rate !== "RC") {
        breakdown[rate].iva = breakdown[rate].imponibile * (parseFloat(rate) / 100);
      }
    });
    
    if (totalsData.handlingTotal > 0) {
      breakdown[vatRateDefault].imponibile += totalsData.handlingTotal;
      if (vatRateDefault !== "RC") {
        breakdown[vatRateDefault].iva += totalsData.handlingTotal * (parseFloat(vatRateDefault) / 100);
      }
    }
    
    if (calcolaVeneziaTransport) {
      const allLag = [...buildLagunariAndataItems(calcolaVeneziaTransport), ...buildLagunariRitornoItems(calcolaVeneziaTransport)];
      allLag.forEach(item => {
        const eff = getLagunariItemEffective(item);
        if (eff <= 0) return;
        const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
        breakdown[lagVat].imponibile += eff;
        if (lagVat !== "RC") {
          breakdown[lagVat].iva += eff * (parseFloat(lagVat) / 100);
        }
      });
    }

    if (totalsData.extraDiscountAmount > 0) {
      const totalBeforeExtra = Object.values(breakdown).reduce((sum, b) => sum + b.imponibile, 0);
      if (totalBeforeExtra > 0) {
        Object.keys(breakdown).forEach(rate => {
          const proportion = breakdown[rate].imponibile / totalBeforeExtra;
          const extraForRate = totalsData.extraDiscountAmount * proportion;
          breakdown[rate].imponibile -= extraForRate;
          if (rate !== "RC") {
            breakdown[rate].iva = breakdown[rate].imponibile * (parseFloat(rate) / 100);
          }
        });
      }
    }
    
    const totalImponibile = Object.values(breakdown).reduce((sum, b) => sum + b.imponibile, 0);
    const totalIva = Object.values(breakdown).reduce((sum, b) => sum + b.iva, 0);
    const totalIvato = totalImponibile + totalIva;
    
    const usedRates = Object.entries(breakdown).filter(([_, b]) => b.imponibile > 0);
    const hasMixedRates = usedRates.length > 1;
    
    return { breakdown, totalImponibile, totalIva, totalIvato, hasMixedRates, usedRates };
  };

  const calculatePhasesVatBreakdown = (phasesResultOverride?: PhasesPreviewResult | null) => {
    const effectivePhasesResult = phasesResultOverride || phasesPreviewResult;
    const breakdown: Record<string, { imponibile: number; iva: number }> = {
      "22": { imponibile: 0, iva: 0 },
      "10": { imponibile: 0, iva: 0 },
      "4": { imponibile: 0, iva: 0 },
      "RC": { imponibile: 0, iva: 0 },
    };
    
    if (!effectivePhasesResult?.fasiResults) return null;
    
    effectivePhasesResult.fasiResults.forEach((fase: any) => {
      const fi = fase.faseIndex;
      const faseConfig = fasi[fi];
      const faseTransportItemsVat = faseConfig?.transportItems || [];
      const addToBreakdown = (amount: number, vatRate: string) => {
        breakdown[vatRate].imponibile += amount;
        if (vatRate !== "RC") {
          breakdown[vatRate].iva += amount * (parseFloat(vatRate) / 100);
        }
      };
      const saleArticleIds = new Set(
        (articles || []).filter((a: any) => a.pricingLogic === "SALE").map((a: any) => String(a.id))
      );
      const getItemFinal = (faseIdx: number, phase: string, idx: number, defaultTotal: number, item?: any) => {
        const key = `${faseIdx}:${phase}:${idx}`;
        const override = phaseItemAmountOverrides.get(key);
        const phaseUpOverride = phaseUnitPriceOverrides.get(key);
        const discount = phaseItemDiscounts.get(key) || 0;
        let durationMultiplier = 1;
        if (phase === 'NOLEGGIO' && item && !saleArticleIds.has(String(item.articleId))) {
          durationMultiplier = faseConfig?.durationMonths || durationMonths || 1;
        }
        const totalAfterUp = phaseUpOverride !== null && phaseUpOverride !== undefined ? phaseUpOverride * (item?.quantity || 1) * durationMultiplier : defaultTotal;
        const basePrice = override !== null && override !== undefined ? override : totalAfterUp;
        return basePrice * (1 - discount / 100);
      };

      const getItemExtra = (faseIdx: number, phase: string, idx: number, item: any) => {
        const key = `${faseIdx}:${phase}:${idx}`;
        const discount = phaseItemDiscounts.get(key) || 0;
        const faseTrasferta = phasesTrasfertaInfo.get(faseIdx);
        const faseDiff = phasesDifficultyInfo.get(faseIdx);
        const faseVen = phasesVeneziaInfo.get(faseIdx);
        const isMontaggio = phase === 'MONTAGGIO';
        const trasfertaItem = isMontaggio ? faseTrasferta?.distribuzioneMontaggioItems.get(idx) : faseTrasferta?.distribuzioneSmontaggioItems.get(idx);
        const difficultyItem = isMontaggio ? faseDiff?.distribuzioneMontaggioItems.get(idx) : faseDiff?.distribuzioneSmontaggioItems.get(idx);
        const veneziaItem = isMontaggio ? faseVen?.distribuzioneMontaggioItems.get(idx) : faseVen?.distribuzioneSmontaggioItems.get(idx);
        const showTrasferta = faseTrasferta?.fascia !== 'nessuna' && trasfertaItem && item.quantity > 0;
        const showDifficulty = (faseDiff?.totale || 0) > 0 && difficultyItem && item.quantity > 0;
        const showVenezia = isMontaggio
          ? (faseVen?.costoMontaggioVenezia || 0) > 0 && veneziaItem && item.quantity > 0
          : (faseVen?.costoSmontaggioVenezia || 0) > 0 && veneziaItem && item.quantity > 0;
        const quotaTrasferta = showTrasferta ? (trasfertaItem?.quotaTrasferta || 0) : 0;
        const quotaDifficolta = showDifficulty ? (difficultyItem?.quotaDifficolta || 0) : 0;
        const quotaVenezia = showVenezia ? (veneziaItem?.quotaVenezia || 0) : 0;
        return (quotaTrasferta + quotaDifficolta + quotaVenezia) * (1 - discount / 100);
      };

      const montaggioItems = fase.montaggio?.items || [];
      montaggioItems.forEach((item: any, idx: number) => {
        const key = `${fi}:MONTAGGIO:${idx}`;
        if (deletedPhaseItems.has(key)) return;
        const itemVat = phaseItemVatOverrides.get(key) || vatRateDefault;
        addToBreakdown(getItemFinal(fi, 'MONTAGGIO', idx, item.totalRow, item) + getItemExtra(fi, 'MONTAGGIO', idx, item), itemVat);
      });

      const smontaggioItems = fase.smontaggio?.items || [];
      smontaggioItems.forEach((item: any, idx: number) => {
        const key = `${fi}:SMONTAGGIO:${idx}`;
        if (deletedPhaseItems.has(key)) return;
        const itemVat = phaseItemVatOverrides.get(key) || vatRateDefault;
        addToBreakdown(getItemFinal(fi, 'SMONTAGGIO', idx, item.totalRow, item) + getItemExtra(fi, 'SMONTAGGIO', idx, item), itemVat);
      });

      const trasportoAndata = (fase.trasportoAndata?.items || []);
      trasportoAndata.forEach((item: any, idx: number) => {
        if (deletedPhaseItems.has(`${fi}:TRASPORTO_ANDATA:${idx}`)) return;
        if (faseTransportItemsVat[idx]?.andataEnabled !== false) {
          addToBreakdown(getItemFinal(fi, 'TRASPORTO_ANDATA', idx, item.totalRow), vatRateDefault);
        }
      });

      const trasportoRitorno = (fase.trasportoRitorno?.items || []);
      trasportoRitorno.forEach((item: any, idx: number) => {
        if (deletedPhaseItems.has(`${fi}:TRASPORTO_RITORNO:${idx}`)) return;
        if (faseTransportItemsVat[idx]?.ritornoEnabled !== false) {
          addToBreakdown(getItemFinal(fi, 'TRASPORTO_RITORNO', idx, item.totalRow), vatRateDefault);
        }
      });

      const costoMagazzino = fase.costoMagazzino?.items || [];
      costoMagazzino.forEach((item: any, idx: number) => {
        if (deletedPhaseItems.has(`${fi}:MOVIMENTAZIONE_MAGAZZINO:${idx}`)) return;
        addToBreakdown(getItemFinal(fi, 'MOVIMENTAZIONE_MAGAZZINO', idx, item.totalRow), vatRateDefault);
      });

      const noleggioItems = fase.noleggio?.items || [];
      noleggioItems.forEach((item: any, idx: number) => {
        if (deletedPhaseItems.has(`${fi}:NOLEGGIO:${idx}`)) return;
        addToBreakdown(getItemFinal(fi, 'NOLEGGIO', idx, item.totalRow, item), vatRateDefault);
      });

      if (fase.handling?.breakdown?.zones?.length > 0) {
        let handlingMountForVat = 0;
        let handlingDismountForVat = 0;
        fase.handling.breakdown.zones.forEach((zone: any, idx: number) => {
          handlingMountForVat += getItemFinal(fi, 'HANDLING_MOUNT', idx, zone.mountCost || 0);
          handlingDismountForVat += getItemFinal(fi, 'HANDLING_DISMOUNT', idx, zone.dismountCost || 0);
        });
        if (fase.handling.breakdown.saltareti) {
          handlingMountForVat += fase.handling.breakdown.saltareti.total;
          handlingDismountForVat += fase.handling.breakdown.saltareti.total;
        }
        if (fase.handling.extraPrice) {
          handlingMountForVat += fase.handling.extraPrice;
        }
        const mountGlobalDisc = phaseHandlingMountGlobalDiscount.get(fi) || 0;
        const dismountGlobalDisc = phaseHandlingDismountGlobalDiscount.get(fi) || 0;
        handlingMountForVat *= (1 - mountGlobalDisc / 100);
        handlingDismountForVat *= (1 - dismountGlobalDisc / 100);
        addToBreakdown(handlingMountForVat, vatRateDefault);
        addToBreakdown(handlingDismountForVat, vatRateDefault);
      }

      const faseManualRows = phasesManualRows.get(fi);
      if (faseManualRows) {
        [...faseManualRows.montaggio, ...faseManualRows.smontaggio, ...faseManualRows.noleggio].forEach((row) => {
          addToBreakdown(row.amount * (1 - row.discountPercent / 100), vatRateDefault);
        });
      }

      const faseTrasfertaFallback = phasesTrasfertaInfo.get(fi);
      if (faseTrasfertaFallback && faseTrasfertaFallback.fascia !== 'nessuna') {
        if (faseTrasfertaFallback.costoMontaggioTrasferta > 0) {
          let montaggioDistTotal = 0;
          faseTrasfertaFallback.distribuzioneMontaggioItems.forEach((d: any) => { montaggioDistTotal += d.quotaTrasferta || 0; });
          const montaggioUndist = faseTrasfertaFallback.costoMontaggioTrasferta - montaggioDistTotal;
          if (montaggioUndist > 0.01) {
            addToBreakdown(montaggioUndist, vatRateDefault);
          }
        }
        if (faseTrasfertaFallback.costoSmontaggioTrasferta > 0) {
          let smontaggioDistTotal = 0;
          faseTrasfertaFallback.distribuzioneSmontaggioItems.forEach((d: any) => { smontaggioDistTotal += d.quotaTrasferta || 0; });
          const smontaggioUndist = faseTrasfertaFallback.costoSmontaggioTrasferta - smontaggioDistTotal;
          if (smontaggioUndist > 0.01) {
            addToBreakdown(smontaggioUndist, vatRateDefault);
          }
        }
      }

      const faseDiffFallback = phasesDifficultyInfo.get(fi);
      if (faseDiffFallback && faseDiffFallback.totale > 0) {
        let diffDistTotal = 0;
        faseDiffFallback.distribuzioneMontaggioItems.forEach((d: any) => { diffDistTotal += d.quotaDifficolta || 0; });
        faseDiffFallback.distribuzioneSmontaggioItems.forEach((d: any) => { diffDistTotal += d.quotaDifficolta || 0; });
        const diffUndist = faseDiffFallback.totale - diffDistTotal;
        if (diffUndist > 0.01) {
          addToBreakdown(diffUndist, vatRateDefault);
        }
      }

      const faseVenFallback = phasesVeneziaInfo.get(fi);
      if (faseVenFallback) {
        if (faseVenFallback.costoMontaggioVenezia > 0) {
          let venMontaggioDistTotal = 0;
          faseVenFallback.distribuzioneMontaggioItems.forEach((d: any) => { venMontaggioDistTotal += d.quotaVenezia || 0; });
          const venMontaggioUndist = faseVenFallback.costoMontaggioVenezia - venMontaggioDistTotal;
          if (venMontaggioUndist > 0.01) {
            addToBreakdown(venMontaggioUndist, vatRateDefault);
          }
        }
        if (faseVenFallback.costoSmontaggioVenezia > 0) {
          let venSmontaggioDistTotal = 0;
          faseVenFallback.distribuzioneSmontaggioItems.forEach((d: any) => { venSmontaggioDistTotal += d.quotaVenezia || 0; });
          const venSmontaggioUndist = faseVenFallback.costoSmontaggioVenezia - venSmontaggioDistTotal;
          if (venSmontaggioUndist > 0.01) {
            addToBreakdown(venSmontaggioUndist, vatRateDefault);
          }
        }
      }

    });
    
    breakdown[vatRateDefault].imponibile += phasesAdjustedTotals.documentiTotal;
    if (vatRateDefault !== "RC") {
      breakdown[vatRateDefault].iva += phasesAdjustedTotals.documentiTotal * (parseFloat(vatRateDefault) / 100);
    }

    phasesLagunariData.forEach((vt, faseIdx) => {
      const kp = `f${faseIdx}:`;
      const allLag = [...buildLagunariAndataItems(vt, kp), ...buildLagunariRitornoItems(vt, kp)];
      allLag.forEach(item => {
        const eff = getLagunariItemEffective(item);
        if (eff <= 0) return;
        const lagVat = lagunariVatOverrides.get(item.key) || vatRateDefault;
        breakdown[lagVat].imponibile += eff;
        if (lagVat !== "RC") {
          breakdown[lagVat].iva += eff * (parseFloat(lagVat) / 100);
        }
      });
    });

    if (globalDiscountPercent > 0) {
      const factor = 1 - globalDiscountPercent / 100;
      Object.keys(breakdown).forEach(rate => {
        breakdown[rate].imponibile *= factor;
        if (rate !== "RC") {
          breakdown[rate].iva = breakdown[rate].imponibile * (parseFloat(rate) / 100);
        }
      });
    }

    if (extraDiscountAmount > 0) {
      const totalBeforeExtra = Object.values(breakdown).reduce((sum, b) => sum + b.imponibile, 0);
      if (totalBeforeExtra > 0) {
        Object.keys(breakdown).forEach(rate => {
          const proportion = breakdown[rate].imponibile / totalBeforeExtra;
          const extraForRate = extraDiscountAmount * proportion;
          breakdown[rate].imponibile -= extraForRate;
          if (rate !== "RC") {
            breakdown[rate].iva = breakdown[rate].imponibile * (parseFloat(rate) / 100);
          }
        });
      }
    }
    
    const rawImponibile = Object.values(breakdown).reduce((sum, b) => sum + b.imponibile, 0);
    const usedRates = Object.entries(breakdown).filter(([_, b]) => b.imponibile > 0);
    const hasMixedRates = usedRates.length > 1;

    const correctGrandTotal = phasesAdjustedTotals.grandTotal;

    if (!hasMixedRates) {
      const rate = usedRates.length === 1 ? usedRates[0][0] : vatRateDefault;
      const totalIva = rate !== "RC" ? correctGrandTotal * (parseFloat(rate) / 100) : 0;
      const totalIvato = correctGrandTotal + totalIva;
      const correctedBreakdown: Record<string, { imponibile: number; iva: number }> = {};
      correctedBreakdown[rate] = { imponibile: correctGrandTotal, iva: totalIva };
      return { breakdown: correctedBreakdown, totalImponibile: correctGrandTotal, totalIva, totalIvato, hasMixedRates, usedRates: Object.entries(correctedBreakdown).filter(([_, b]) => b.imponibile > 0) };
    }

    if (rawImponibile > 0) {
      Object.keys(breakdown).forEach(rate => {
        const proportion = breakdown[rate].imponibile / rawImponibile;
        breakdown[rate].imponibile = correctGrandTotal * proportion;
        if (rate !== "RC") {
          breakdown[rate].iva = breakdown[rate].imponibile * (parseFloat(rate) / 100);
        }
      });
    }

    const totalImponibile = Object.values(breakdown).reduce((sum, b) => sum + b.imponibile, 0);
    const totalIva = Object.values(breakdown).reduce((sum, b) => sum + b.iva, 0);
    const totalIvato = totalImponibile + totalIva;

    return { breakdown, totalImponibile, totalIva, totalIvato, hasMixedRates, usedRates: Object.entries(breakdown).filter(([_, b]) => b.imponibile > 0) };
  };

  if (opportunityLoading || articlesLoading) {
    return (
      <DashboardLayout user={user || undefined} fullWidth>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!opportunity) {
    return (
      <DashboardLayout user={user || undefined} fullWidth>
        <div className="p-6">
          <p>Opportunità non trovata.</p>
          <Button variant="outline" onClick={() => navigate("/opportunita")} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Torna alle Opportunità
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const totals = calculateTotalsWithDiscounts();

  return (
    <DashboardLayout user={user || undefined} fullWidth>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/opportunita")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{isEditMode ? "Modifica Preventivo" : "Nuovo Preventivo"}</h1>
            <p className="text-muted-foreground">
              {opportunity.title} - {getLeadName()}
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEP_LABELS.map((label, index) => {
            const stepNum = index + 1;
            const isActive = stepNum === currentStep;
            const isComplete = stepNum < currentStep;
            const isClickable = stepNum <= maxStepReached && stepNum !== currentStep;

            return (
              <div key={label} className="flex-1 flex items-center">
                <div
                  className={`flex flex-col items-center w-full ${isClickable ? "cursor-pointer group" : ""}`}
                  onClick={() => { if (isClickable) setCurrentStep(stepNum); }}
                  data-testid={`stepper-step-${stepNum}`}
                >
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
                    ${isComplete ? "bg-primary text-primary-foreground" : ""}
                    ${isActive ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : ""}
                    ${!isActive && !isComplete && stepNum <= maxStepReached ? "bg-primary/20 text-primary" : ""}
                    ${!isActive && !isComplete && stepNum > maxStepReached ? "bg-muted text-muted-foreground" : ""}
                    ${isClickable ? "group-hover:ring-4 group-hover:ring-primary/20 group-hover:scale-110" : ""}
                  `}>
                    {isComplete ? <Check className="w-5 h-5" /> : stepNum}
                  </div>
                  <span className={`text-xs mt-2 text-center ${isActive ? "font-medium text-foreground" : isClickable ? "text-foreground/70 group-hover:text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </div>
                {index < STEP_LABELS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${isComplete ? "bg-primary" : stepNum < maxStepReached ? "bg-primary/40" : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Materiali & Durata */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {/* Scheda 1: Tipo di Preventivo */}
            <Card className="border-l-4 border-l-primary">
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="font-semibold text-base">Tipo di Preventivo</h3>
                      <p className="text-sm text-muted-foreground">Scegli la modalità di lavoro per questo preventivo</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={quoteMode === 'rental' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setQuoteMode('rental')}
                        data-testid="btn-mode-rental"
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Noleggio + Manodopera
                      </Button>
                      <Button
                        type="button"
                        variant={quoteMode === 'labor_only' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setQuoteMode('labor_only')}
                        data-testid="btn-mode-labor-only"
                      >
                        <Wrench className="w-4 h-4 mr-2" />
                        Solo Manodopera
                      </Button>
                      <Button
                        type="button"
                        variant={quoteMode === 'phases' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={selectPhasesMode}
                        data-testid="btn-mode-phases"
                      >
                        <Layers className="w-4 h-4 mr-2" />
                        Fasi
                      </Button>
                      <Button
                        type="button"
                        variant={quoteMode === 'a_corpo' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={selectACorpoMode}
                        data-testid="btn-mode-a-corpo"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        A corpo
                      </Button>
                    </div>
                    {quoteMode === 'labor_only' && (
                      <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
                        <Wrench className="w-4 h-4 inline mr-1" />
                        Il cliente fornisce il materiale. Verranno calcolati solo i costi di montaggio e smontaggio.
                      </p>
                    )}
                    {quoteMode === 'phases' && (
                      <p className="text-sm text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 p-3 rounded-md">
                        <Layers className="w-4 h-4 inline mr-1" />
                        Lavori a fasi: ogni fase ha durata, articoli, trasporti e movimentazione dedicati.
                      </p>
                    )}
                    {quoteMode === 'a_corpo' && (
                      <p className="text-sm text-teal-600 bg-teal-50 dark:bg-teal-950/30 p-3 rounded-md">
                        <FileText className="w-4 h-4 inline mr-1" />
                        Preventivo a corpo: composizione libera con moduli e voci a importo fisso.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scheda Fasi: Timeline con pallini numerati (solo per modalità phases) */}
            {quoteMode === 'phases' && fasi.length > 0 && (
              <Card className="border-l-4 border-l-violet-500">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                      <Layers className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-base">Fasi del Preventivo</h3>
                          <p className="text-sm text-muted-foreground">
                            {fasi.length} fas{fasi.length === 1 ? 'e' : 'i'} - Stai compilando la Fase {currentFaseIndex + 1}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addFase}
                          disabled={fasi.length >= 50}
                          data-testid="button-add-fase"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Aggiungi Fase
                        </Button>
                      </div>
                      
                      {/* Selettore fasi compatto con navigazione */}
                      <div className="space-y-2 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCurrentFaseIndex(Math.max(0, currentFaseIndex - 1))}
                            disabled={currentFaseIndex === 0}
                            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted hover:bg-violet-100 dark:hover:bg-violet-900/50 text-muted-foreground hover:text-violet-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            data-testid="button-fase-prev"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <div className="flex-1 flex flex-wrap gap-1.5 justify-center">
                            {fasi.map((fase, index) => (
                              <button
                                key={fase.id}
                                type="button"
                                onClick={() => setCurrentFaseIndex(index)}
                                title={fase.customLabel?.trim() || `Fase ${index + 1}`}
                                className={`
                                  ${fasi.length > 10 ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'} rounded-full flex items-center justify-center font-medium
                                  transition-all cursor-pointer
                                  ${index === currentFaseIndex 
                                    ? "bg-violet-600 text-white ring-3 ring-violet-200 dark:ring-violet-900 scale-110" 
                                    : "bg-muted hover:bg-violet-100 dark:hover:bg-violet-900/50 text-muted-foreground hover:text-violet-700"
                                  }
                                `}
                                data-testid={`button-fase-${index + 1}`}
                              >
                                {index + 1}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setCurrentFaseIndex(Math.min(fasi.length - 1, currentFaseIndex + 1))}
                            disabled={currentFaseIndex === fasi.length - 1}
                            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted hover:bg-violet-100 dark:hover:bg-violet-900/50 text-muted-foreground hover:text-violet-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            data-testid="button-fase-next"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Info fase corrente */}
                      <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-md space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                              Fase {currentFaseIndex + 1}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {currentFase?.durationMonths || 1} mes{(currentFase?.durationMonths || 1) === 1 ? 'e' : 'i'} di noleggio
                              {currentFase && (currentFase.montaggioItems.length + currentFase.smontaggioItems.length + currentFase.noleggioItems.length + currentFase.fornituraItems.length + currentFase.magazzinoItems.length) > 0 && ` • ${currentFase.montaggioItems.length + currentFase.smontaggioItems.length + currentFase.noleggioItems.length + currentFase.fornituraItems.length + currentFase.magazzinoItems.length} articol${(currentFase.montaggioItems.length + currentFase.smontaggioItems.length + currentFase.noleggioItems.length + currentFase.fornituraItems.length + currentFase.magazzinoItems.length) === 1 ? 'o' : 'i'}`}
                            </span>
                          </div>
                          {fasi.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFase(currentFaseIndex)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              data-testid="button-remove-current-fase"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Rimuovi Fase
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground whitespace-nowrap">Titolo fase:</label>
                          <input
                            type="text"
                            value={currentFase?.customLabel || ''}
                            onChange={(e) => updateCurrentFase('customLabel', e.target.value)}
                            placeholder={`Fase ${currentFaseIndex + 1} (${currentFase?.durationMonths || 1} ${(currentFase?.durationMonths || 1) === 1 ? 'mese' : 'mesi'})`}
                            className="flex-1 text-sm px-2 py-1 rounded border border-violet-200 dark:border-violet-700 bg-white dark:bg-violet-950/50 focus:outline-none focus:ring-1 focus:ring-violet-400"
                            data-testid="input-fase-custom-label"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scheda 2: Mesi di Noleggio (solo per modalità rental) */}
            {quoteMode === 'rental' && (
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                      <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-base">Mesi di Noleggio</h3>
                          <p className="text-sm text-muted-foreground">Durata prevista del noleggio ponteggio</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input
                            id="duration"
                            type="number"
                            min={1}
                            placeholder="Mesi"
                            value={durationMonths || ""}
                            onChange={(e) => setDurationMonths(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-20 text-lg font-medium text-center"
                            data-testid="input-duration-months"
                          />
                          <Badge variant="outline" className="whitespace-nowrap">
                            {durationMonths >= 1 && durationMonths <= 2 && "Fascia 1-2 mesi"}
                            {durationMonths > 2 && durationMonths <= 5 && "Fascia 3-5 mesi"}
                            {durationMonths > 5 && durationMonths <= 8 && "Fascia 6-8 mesi"}
                            {durationMonths > 8 && "Fascia 9+ mesi"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scheda Mesi Noleggio - Modalità Fasi/A corpo (usa dati della fase corrente) */}
            {isPhaseLikeMode && currentFase && (
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                      <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-base">
                            Mesi di Noleggio{quoteMode === 'phases' ? ` - Fase ${currentFaseIndex + 1}` : ''}
                          </h3>
                          <p className="text-sm text-muted-foreground">Durata del noleggio per questa fase</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input
                            id="fase-duration"
                            type="number"
                            min={1}
                            placeholder="Mesi"
                            value={currentFase.durationMonths || ""}
                            onChange={(e) => updateCurrentFase('durationMonths', Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-20 text-lg font-medium text-center"
                            data-testid="input-fase-duration-months"
                          />
                          <Badge variant="outline" className="whitespace-nowrap">
                            {currentFase.durationMonths >= 1 && currentFase.durationMonths <= 2 && "Fascia 1-2 mesi"}
                            {currentFase.durationMonths > 2 && currentFase.durationMonths <= 5 && "Fascia 3-5 mesi"}
                            {currentFase.durationMonths > 5 && currentFase.durationMonths <= 8 && "Fascia 6-8 mesi"}
                            {currentFase.durationMonths > 8 && "Fascia 9+ mesi"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scheda 3 PHASES/A_CORPO: Moduli */}
            {isPhaseLikeMode && currentFase && (() => {
              const moduleLabels: Record<FaseModuleType, { label: string; icon: typeof Truck; color: string; bgColor: string }> = {
                durata: { label: 'Durata', icon: Clock, color: 'text-indigo-500', bgColor: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800' },
                trasporto: { label: 'Trasporto', icon: Truck, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' },
                montaggio: { label: 'Montaggio', icon: ArrowUpFromLine, color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' },
                smontaggio: { label: 'Smontaggio', icon: ArrowDownToLine, color: 'text-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800' },
                noleggio: { label: 'Noleggio', icon: ClipboardList, color: 'text-violet-500', bgColor: 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800' },
                fornitura: { label: 'Fornitura', icon: ShoppingCart, color: 'text-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800' },
                magazzino: { label: 'Magazzino', icon: Warehouse, color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800' },
              };
              const allModules: FaseModuleType[] = ['trasporto', 'montaggio', 'smontaggio', 'noleggio', 'fornitura', 'magazzino'];
              const availableModules = allModules.filter(m => !currentFase.enabledModules.includes(m));

              const renderModuleArticleRow = (moduleType: 'montaggioItems' | 'smontaggioItems' | 'noleggioItems' | 'fornituraItems' | 'magazzinoItems', extra: ExtraChecklistItem) => {
                // In a_corpo mode: riga semplificata con descrizione + €/unità × pezzi
                if (quoteMode === 'a_corpo') {
                  const total = (extra.manualUnitPrice || 0) * (extra.quantity || 1);
                  return (
                    <div key={extra.id} className="flex flex-wrap items-center gap-3 p-3 border rounded-md bg-white/50 dark:bg-gray-900/30">
                      <div className="flex-1 min-w-[160px]">
                        <Input
                          placeholder="Descrizione voce"
                          value={extra.notes || ''}
                          onChange={(e) => updateModuleArticle(moduleType, extra.id, { notes: e.target.value })}
                          data-testid={`input-module-desc-${moduleType}-${extra.id}`}
                        />
                      </div>
                      <div className="w-28">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="€/unità"
                          value={extra.manualUnitPrice || ''}
                          onChange={(e) => updateModuleArticle(moduleType, extra.id, { manualUnitPrice: parseFloat(e.target.value) || 0 })}
                          data-testid={`input-module-unit-price-${moduleType}-${extra.id}`}
                        />
                      </div>
                      <span className="text-muted-foreground text-sm">×</span>
                      <div className="w-20">
                        <Input
                          type="number"
                          step="1"
                          min={1}
                          placeholder="Pezzi"
                          value={extra.quantity || ''}
                          onChange={(e) => updateModuleArticle(moduleType, extra.id, { quantity: parseInt(e.target.value) || 1 })}
                          data-testid={`input-module-qty-acorpo-${moduleType}-${extra.id}`}
                        />
                      </div>
                      {total > 0 && (
                        <Badge variant="outline" className="min-w-[70px] justify-center bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                          € {total.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </Badge>
                      )}
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeModuleArticle(moduleType, extra.id)} className="text-red-500 hover:text-red-700 hover:bg-red-100" data-testid={`button-remove-module-acorpo-${moduleType}-${extra.id}`}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                }

                const selectedArticle = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
                const hasVariants = selectedArticle?.variantsData && selectedArticle.variantsData.length > 0;
                const hasInstallation = selectedArticle?.installationData && selectedArticle.installationData.length > 0;
                const showInstallation = (moduleType === 'montaggioItems' || moduleType === 'smontaggioItems') && hasInstallation;

                return (
                  <div key={extra.id} className="flex flex-wrap items-center gap-3 p-3 border rounded-md bg-white/50 dark:bg-gray-900/30">
                    <div className="w-56">
                      <SearchableSelect
                        data-testid={`select-module-article-${moduleType}-${extra.id}`}
                        options={allChecklistArticles.map((article: Article) => ({ value: article.id, label: article.name }))}
                        value={extra.articleId}
                        onChange={(value) => updateModuleArticle(moduleType, extra.id, { articleId: value, variantIndex: undefined, installationIndex: undefined })}
                        placeholder="Seleziona articolo"
                      />
                    </div>
                    {hasVariants && (
                      <div className="w-40">
                        <Select value={String(extra.variantIndex ?? 0)} onValueChange={(val) => updateModuleArticle(moduleType, extra.id, { variantIndex: parseInt(val), useCesta: false })}>
                          <SelectTrigger data-testid={`select-module-variant-${moduleType}-${extra.id}`}>
                            <SelectValue placeholder="Variante" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedArticle!.variantsData!.map((v: ArticleVariant, idx: number) => (
                              <SelectItem key={idx} value={String(idx)}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {hasVariants && (() => {
                      const variant = selectedArticle!.variantsData![extra.variantIndex ?? 0];
                      if (!variant?.supportsCesta) return null;
                      return (
                        <div className="flex items-center gap-1.5">
                          <Switch checked={extra.useCesta || false} onCheckedChange={(checked) => updateModuleArticle(moduleType, extra.id, { useCesta: checked })} data-testid={`switch-module-cesta-${moduleType}-${extra.id}`} />
                          <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">Con cesta</span>
                        </div>
                      );
                    })()}
                    {showInstallation && (
                      <div className="w-48">
                        <Select value={String(extra.installationIndex ?? 0)} onValueChange={(val) => updateModuleArticle(moduleType, extra.id, { installationIndex: parseInt(val) })}>
                          <SelectTrigger data-testid={`select-module-install-${moduleType}-${extra.id}`}>
                            <SelectValue placeholder="Installazione" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedArticle!.installationData!.map((opt: InstallationOption, idx: number) => (
                              <SelectItem key={idx} value={String(idx)}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {selectedArticle?.pricingLogic === "HOIST" && hasVariants && (() => {
                      const variant = selectedArticle!.variantsData![extra.variantIndex ?? 0];
                      const isP26 = variant?.hoistType === "P26";
                      const isPMM10 = variant?.hoistType === "PM-M10";
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-24">
                            <Input type="number" min={0} step={0.5} placeholder="Altezza mt" value={extra.hoistAltezzaMetri || ""} onChange={(e) => updateModuleArticle(moduleType, extra.id, { hoistAltezzaMetri: parseFloat(e.target.value) || 0 })} data-testid={`input-module-hoist-altezza-${extra.id}`} />
                          </div>
                          {isPMM10 && <div className="w-20"><Input type="number" min={0} placeholder="N. Sbarchi" value={extra.hoistNumSbarchi || ""} onChange={(e) => updateModuleArticle(moduleType, extra.id, { hoistNumSbarchi: parseInt(e.target.value) || 0 })} data-testid={`input-module-hoist-sbarchi-${extra.id}`} /></div>}
                          {isP26 && <div className="w-24"><Input type="number" min={0} step={0.1} placeholder="Sbalzo mq" value={extra.hoistSbalzoMq || ""} onChange={(e) => updateModuleArticle(moduleType, extra.id, { hoistSbalzoMq: parseFloat(e.target.value) || 0 })} data-testid={`input-module-hoist-sbalzo-${extra.id}`} /></div>}
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-[120px]">
                      <Input placeholder="Note" value={extra.notes || ""} onChange={(e) => updateModuleArticle(moduleType, extra.id, { notes: e.target.value })} data-testid={`input-module-notes-${moduleType}-${extra.id}`} />
                    </div>
                    <div className="w-24">
                      <Input type="number" step="any" min={0} placeholder="Quantità" value={extra.quantity || ""} onChange={(e) => updateModuleArticle(moduleType, extra.id, { quantity: parseFloat(e.target.value) || 0 })} data-testid={`input-module-qty-${moduleType}-${extra.id}`} />
                    </div>
                    <Badge variant="outline" className="w-14 justify-center">{selectedArticle?.unitType || "?"}</Badge>
                    {moduleType === 'montaggioItems' && (
                      <div className="flex items-center gap-1.5" title="Calcola Costo Magazzino per questo articolo">
                        <Checkbox
                          id={`warehouse-${extra.id}`}
                          checked={extra.warehouseCostEnabled !== false}
                          onCheckedChange={(checked) => updateModuleArticle(moduleType, extra.id, { warehouseCostEnabled: !!checked })}
                          data-testid={`checkbox-warehouse-${extra.id}`}
                        />
                        <label htmlFor={`warehouse-${extra.id}`} className="text-xs text-cyan-700 dark:text-cyan-400 cursor-pointer select-none whitespace-nowrap">
                          Mag.
                        </label>
                      </div>
                    )}
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeModuleArticle(moduleType, extra.id)} className="text-red-500 hover:text-red-700 hover:bg-red-100" data-testid={`button-remove-module-${moduleType}-${extra.id}`}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              };

              return (
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 rounded-lg bg-green-100 dark:bg-green-900/30">
                        <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 space-y-4">
                        <div>
                          <h3 className="font-semibold text-base">{quoteMode === 'a_corpo' ? 'Moduli A corpo' : `Moduli Fase ${currentFaseIndex + 1}`}</h3>
                          <p className="text-sm text-muted-foreground">
                            {currentFase.enabledModules.length === 0
                              ? (quoteMode === 'a_corpo' ? "Aggiungi i moduli necessari" : "Aggiungi i moduli necessari per questa fase")
                              : `${currentFase.enabledModules.length} modul${currentFase.enabledModules.length === 1 ? 'o' : 'i'} attiv${currentFase.enabledModules.length === 1 ? 'o' : 'i'}`
                            }
                          </p>
                        </div>

                        {availableModules.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {availableModules.map(moduleType => {
                              const info = moduleLabels[moduleType];
                              const IconComp = info.icon;
                              return (
                                <button
                                  key={moduleType}
                                  type="button"
                                  onClick={() => addFaseModule(moduleType)}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
                                  data-testid={`button-add-module-${moduleType}`}
                                >
                                  <IconComp className={`w-4 h-4 ${info.color}`} />
                                  <span className="text-xs font-medium">{info.label}</span>
                                  <Plus className="w-3 h-3 text-muted-foreground" />
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {currentFase.enabledModules.map(moduleType => {
                          const info = moduleLabels[moduleType];
                          const IconComp = info.icon;

                          if (moduleType === 'trasporto') {
                            return (
                              <div key={moduleType} className={`p-4 border rounded-lg ${info.bgColor} space-y-3`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <IconComp className={`w-4 h-4 ${info.color}`} />
                                    <span className="font-medium text-sm">{info.label}</span>
                                    <Badge variant="secondary" className="text-xs">{getActiveTransportItems().length} mezz{getActiveTransportItems().length !== 1 ? 'i' : 'o'}</Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={addTransportItem} disabled={transportArticles.length === 0} data-testid="button-add-module-transport-item">
                                      <Plus className="w-3 h-3 mr-1" /> Mezzo
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => removeFaseModule('trasporto')} className="text-destructive hover:text-destructive" data-testid="button-remove-module-trasporto">
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs whitespace-nowrap">Distanza cantiere (km)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      className="w-24 h-8 text-sm"
                                      value={currentFase?.distanceKm || ""}
                                      onChange={(e) => updateCurrentFase('distanceKm', parseInt(e.target.value) || 0)}
                                      data-testid="input-fase-distance-km"
                                    />
                                    <Badge variant="outline" className="text-xs">A/R: {(currentFase?.distanceKm || 0) * 2} km</Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id={`squadra-zona-fase-${currentFaseIndex}`}
                                      checked={currentFase?.squadraInZonaEnabled || false}
                                      onChange={(e) => updateCurrentFase('squadraInZonaEnabled', e.target.checked)}
                                      className="rounded border-gray-300"
                                      data-testid="checkbox-fase-squadra-in-zona"
                                    />
                                    <Label htmlFor={`squadra-zona-fase-${currentFaseIndex}`} className="text-xs cursor-pointer whitespace-nowrap">
                                      Squadra in zona
                                    </Label>
                                    {currentFase?.squadraInZonaEnabled && (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          min={0}
                                          className="w-20 h-8 text-sm"
                                          value={currentFase?.squadraInZonaKm || ""}
                                          onChange={(e) => updateCurrentFase('squadraInZonaKm', parseInt(e.target.value) || 0)}
                                          data-testid="input-fase-squadra-in-zona-km"
                                        />
                                        <span className="text-xs text-muted-foreground">km</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {getActiveTransportItems().length === 0 ? (
                                  <p className="text-sm text-muted-foreground italic">Nessun mezzo aggiunto</p>
                                ) : (
                                  <div className="space-y-2">
                                    {getActiveTransportItems().map((item, index) => {
                                      const article = transportArticles.find(a => a.id === item.articleId);
                                      const vehicles = article ? getVehicleOptions(article) : [];
                                      const selectedVehicle = vehicles[item.vehicleIndex];
                                      const allOptions = transportArticles.flatMap(art => {
                                        const vehs = getVehicleOptions(art);
                                        return vehs.map((v, vi) => ({ key: `${art.id}|${vi}`, articleId: art.id, vehicleIndex: vi, vehicle: v, label: `${v.name} (€${v.fix} + €${v.perKm}/km)` }));
                                      });
                                      const currentKey = `${item.articleId}|${item.vehicleIndex}`;
                                      const directionsActive = (item.andataEnabled !== false ? 1 : 0) + (item.ritornoEnabled !== false ? 1 : 0);
                                      const faseEffectiveDistance = currentFase?.distanceKm || 0;
                                      return (
                                        <div key={index} className="p-2 border rounded bg-white/50 dark:bg-gray-900/30 space-y-2">
                                          <div className="flex items-end gap-3">
                                            <div className="flex-1 space-y-1">
                                              <Label className="text-xs">Mezzo</Label>
                                              <Select value={currentKey} onValueChange={(v) => { const [artId, vehIdx] = v.split("|"); updateTransportItem(index, { articleId: artId, vehicleIndex: parseInt(vehIdx) }); }}>
                                                <SelectTrigger data-testid={`select-module-transport-vehicle-${index}`}>
                                                  <SelectValue placeholder="Seleziona mezzo">{selectedVehicle ? `${selectedVehicle.name} (€${selectedVehicle.fix} + €${selectedVehicle.perKm}/km)` : "Seleziona mezzo"}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>{allOptions.map(opt => (<SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>))}</SelectContent>
                                              </Select>
                                            </div>
                                            <div className="w-20 space-y-1">
                                              <Label className="text-xs">Viaggi</Label>
                                              <Input type="number" min={1} placeholder="Viaggi" value={item.quantity || ""} onChange={(e) => updateTransportItem(index, { quantity: parseInt(e.target.value) || 0 })} data-testid={`input-module-transport-qty-${index}`} />
                                            </div>
                                            {selectedVehicle && <Badge variant="secondary" className="whitespace-nowrap mb-1">€{formatCurrency((selectedVehicle.fix + selectedVehicle.perKm * faseEffectiveDistance * 2) * item.quantity * directionsActive)}</Badge>}
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeTransportItem(index)} className="text-destructive hover:text-destructive" data-testid={`button-remove-module-transport-${index}`}><Trash2 className="w-4 h-4" /></Button>
                                          </div>
                                          <div className="flex items-center gap-4 pl-1">
                                            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={item.andataEnabled !== false} onChange={(e) => updateTransportItem(index, { andataEnabled: e.target.checked })} className="rounded border-gray-300" /><span className="text-xs font-medium">Andata</span></label>
                                            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={item.ritornoEnabled !== false} onChange={(e) => updateTransportItem(index, { ritornoEnabled: e.target.checked })} className="rounded border-gray-300" /><span className="text-xs font-medium">Ritorno</span></label>
                                            {directionsActive === 0 && <span className="text-xs text-amber-600 dark:text-amber-400">Trasporto disabilitato</span>}
                                          </div>
                                          <input
                                            type="text"
                                            value={item.note || ''}
                                            onChange={(e) => updateTransportItem(index, { note: e.target.value })}
                                            placeholder="Nota trasporto (opzionale)"
                                            className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                            data-testid={`input-module-transport-note-${index}`}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {opportunity?.veniceZone && (
                                  <div className="mt-4 rounded-lg border-2 border-blue-200 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                      <Ship className="w-4 h-4 text-blue-600" />
                                      <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                                        Trasporti Lagunari — {opportunity.veniceZone}
                                      </span>
                                      {VENICE_FERRY_ZONES.has(opportunity.veniceZone) && (
                                        <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-300">Ferry Boat</Badge>
                                      )}
                                    </div>

                                    {!calcolaVeneziaTransport?.hasMezzi && (
                                      <p className="text-xs text-muted-foreground italic">
                                        {VENICE_FERRY_ZONES.has(opportunity.veniceZone)
                                          ? "Aggiungi un mezzo sopra per calcolare il costo del ferry boat."
                                          : "Aggiungi un mezzo sopra per calcolare il costo di banchina."}
                                      </p>
                                    )}

                                    {!VENICE_FERRY_ZONES.has(opportunity.veniceZone) && (
                                      <div className="flex items-center gap-4 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          {barcaVariants.length > 0 ? (
                                            barcaVariants.map((v, idx) => (
                                              <Button key={idx} type="button" size="sm"
                                                variant={lagunariBarcaVariantIndex === idx ? "default" : "outline"}
                                                onClick={() => setLagunariBarcaVariantIndex(idx)}
                                                data-testid={`button-fase-lagunari-barca-${idx}`}>
                                                {v.label}
                                              </Button>
                                            ))
                                          ) : (
                                            <span className="text-xs text-muted-foreground">Nessuna barca nel catalogo (TRA-BAR)</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0"
                                            onClick={() => setLagunariNumeroBarca(n => Math.max(1, n - 1))}
                                            data-testid="button-fase-lagunari-barca-dec">−</Button>
                                          <span className="w-6 text-center text-sm font-mono font-semibold">{lagunariNumeroBarca}</span>
                                          <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0"
                                            onClick={() => setLagunariNumeroBarca(n => n + 1)}
                                            data-testid="button-fase-lagunari-barca-inc">+</Button>
                                          <span className="text-xs text-muted-foreground ml-1">barche</span>
                                        </div>
                                      </div>
                                    )}

                                    {calcolaVeneziaTransport && calcolaVeneziaTransport.costoTotale > 0 && (
                                      <div className="space-y-1 pt-2 border-t border-blue-200 text-sm">
                                        {calcolaVeneziaTransport.vehicleBreakdown.map((bd, i) => bd.total > 0 && (
                                          <div key={i} className="flex justify-between text-muted-foreground">
                                            <span>
                                              {calcolaVeneziaTransport.isFerry ? "Ferry Boat" : "Banchina"} {bd.vehicleName} × {bd.qty} ({bd.directionsLabel})
                                            </span>
                                            <span>€{formatCurrency(bd.total)}</span>
                                          </div>
                                        ))}
                                        {calcolaVeneziaTransport.costoBarcaTotale > 0 && (
                                          <div className="flex justify-between text-muted-foreground">
                                            <span>{calcolaVeneziaTransport.barcaLabel} × {calcolaVeneziaTransport.numBarca} ({calcolaVeneziaTransport.barcaDirectionsLabel})</span>
                                            <span>€{formatCurrency(calcolaVeneziaTransport.costoBarcaTotale)}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between font-semibold pt-1 border-t border-blue-200">
                                          <span>Totale Trasporti Lagunari</span>
                                          <span className="text-blue-700 font-mono">€{formatCurrency(calcolaVeneziaTransport.costoTotale)}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          if (moduleType === 'durata') return null;

                          const articleModuleKey = moduleType === 'montaggio' ? 'montaggioItems' : moduleType === 'smontaggio' ? 'smontaggioItems' : moduleType === 'noleggio' ? 'noleggioItems' : moduleType === 'magazzino' ? 'magazzinoItems' : 'fornituraItems';
                          const moduleItems = getFaseModuleItems(articleModuleKey);

                          return (
                            <div key={moduleType} className={`p-4 border rounded-lg ${info.bgColor} space-y-3`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <IconComp className={`w-4 h-4 ${info.color}`} />
                                  <span className="font-medium text-sm">{info.label}</span>
                                  <Badge variant="secondary" className="text-xs">{moduleItems.length} articol{moduleItems.length !== 1 ? 'i' : 'o'}</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button variant="outline" size="sm" onClick={() => addModuleArticle(articleModuleKey)} data-testid={`button-add-module-article-${moduleType}`}>
                                    <Plus className="w-3 h-3 mr-1" /> Articolo
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => removeFaseModule(moduleType)} className="text-destructive hover:text-destructive" data-testid={`button-remove-module-${moduleType}`}>
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                              {moduleItems.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">Nessun articolo aggiunto. Clicca "+ Articolo" per iniziare.</p>
                              ) : (
                                <div className="space-y-2">
                                  {moduleItems.map(extra => renderModuleArticleRow(articleModuleKey, extra))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {quoteMode !== 'a_corpo' && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-purple-600" />
                              <span className="font-medium text-purple-800 dark:text-purple-300">Voci "A corpo"</span>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={addACorpoItem} data-testid="button-add-acorpo-phases">
                              <Plus className="w-4 h-4 mr-1" /> Aggiungi voce
                            </Button>
                          </div>
                          {getActiveACorpoItems().length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">Nessuna voce "a corpo" aggiunta</p>
                          ) : (
                            <div className="space-y-2">
                              {getActiveACorpoItems().map((item) => {
                                const selectedArticle = allChecklistArticles.find((a: Article) => a.id === item.articleId);
                                const hasVariants = selectedArticle?.variantsData && selectedArticle.variantsData.length > 0;
                                return (
                                  <div key={item.id} className="flex flex-wrap items-center gap-3 p-3 border rounded-md bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                                    <div className="w-56">
                                      <SearchableSelect
                                        data-testid={`select-acorpo-article-phases-${item.id}`}
                                        options={allChecklistArticles.map((article: Article) => ({ value: article.id, label: article.name }))}
                                        value={item.articleId}
                                        onChange={(value) => updateACorpoItem(item.id, { articleId: value, variantIndex: 0 })}
                                        placeholder="Seleziona articolo"
                                      />
                                    </div>
                                    {hasVariants && (
                                      <div className="w-40">
                                        <Select value={String(item.variantIndex ?? 0)} onValueChange={(val) => updateACorpoItem(item.id, { variantIndex: parseInt(val) })}>
                                          <SelectTrigger><SelectValue placeholder="Variante" /></SelectTrigger>
                                          <SelectContent>{selectedArticle!.variantsData!.map((v: ArticleVariant, idx: number) => (<SelectItem key={idx} value={String(idx)}>{v.label}</SelectItem>))}</SelectContent>
                                        </Select>
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-[120px]"><Input placeholder="Note" value={item.notes || ""} onChange={(e) => updateACorpoItem(item.id, { notes: e.target.value })} /></div>
                                    <div className="w-24"><Input type="number" min={0} placeholder="Qtà" value={item.quantity || ""} onChange={(e) => updateACorpoItem(item.id, { quantity: parseInt(e.target.value) || 0 })} /></div>
                                    <div className="w-28"><Input type="number" min={0} step={0.01} placeholder="Totale €" value={item.totalPrice || ""} onChange={(e) => updateACorpoItem(item.id, { totalPrice: parseFloat(e.target.value) || 0 })} /></div>
                                    {item.splitIntoPhases ? (
                                      <Badge variant="outline" className="w-auto justify-center bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] px-1.5" title="Genera Montaggio + Smontaggio (60%) + Noleggio">M+S+N</Badge>
                                    ) : (
                                      <Badge variant="outline" className="w-14 justify-center bg-purple-100 dark:bg-purple-900">AC</Badge>
                                    )}
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeACorpoItem(item.id)} className="text-red-500 hover:text-red-700 hover:bg-red-100"><X className="w-4 h-4" /></Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Scheda 3: Articoli Preventivo (solo per rental e labor_only) */}
            {!isPhaseLikeMode && (
            <Card className={`border-l-4 ${quoteMode === 'rental' ? 'border-l-green-500' : 'border-l-amber-500'}`}>
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-lg ${quoteMode === 'rental' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                    {quoteMode === 'rental' ? (
                      <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="mb-4">
                      <h3 className="font-semibold text-base">
                        {quoteMode === 'rental' ? 'Articoli Preventivo' : 'Materiali da Montare'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {quoteMode === 'rental'
                          ? "Aggiungi gli articoli dal catalogo per il preventivo" 
                          : "Aggiungi i materiali (del cliente) per calcolare la manodopera"}
                      </p>
                    </div>
                <div className="space-y-6">
                  {/* Sezione "Articoli preventivo" - selezione articoli dal catalogo */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-blue-800 dark:text-blue-300">Articoli da catalogo</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addExtraChecklistItem}
                        data-testid="button-add-extra"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Aggiungi articolo
                      </Button>
                    </div>

                    {getActiveExtraChecklistItems().length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Nessun articolo aggiunto. Clicca su "Aggiungi articolo" per iniziare.</p>
                    ) : (
                        <div className="space-y-2">
                          {getActiveExtraChecklistItems().map((extra) => {
                            const selectedArticle = allChecklistArticles.find((a: Article) => a.id === extra.articleId);
                            const hasVariants = selectedArticle?.variantsData && selectedArticle.variantsData.length > 0;
                            const hasInstallation = selectedArticle?.installationData && selectedArticle.installationData.length > 0;
                            
                            return (
                              <div 
                                key={extra.id}
                                className="flex flex-wrap items-center gap-3 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                              >
                                <div className="w-56">
                                  <SearchableSelect
                                    data-testid={`select-extra-article-${extra.id}`}
                                    options={allChecklistArticles.map((article: Article) => ({ value: article.id, label: article.name }))}
                                    value={extra.articleId}
                                    onChange={(value) => updateExtraChecklistItem(extra.id, { articleId: value })}
                                    placeholder="Seleziona articolo"
                                  />
                                </div>
                                
                                {hasVariants && (
                                  <div className="w-40">
                                    <Select
                                      value={String(extra.variantIndex ?? 0)}
                                      onValueChange={(val) => updateExtraChecklistItem(extra.id, { variantIndex: parseInt(val), useCesta: false })}
                                    >
                                      <SelectTrigger data-testid={`select-extra-variant-${extra.id}`}>
                                        <SelectValue placeholder="Variante" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {selectedArticle!.variantsData!.map((v: ArticleVariant, idx: number) => (
                                          <SelectItem key={idx} value={String(idx)}>
                                            {v.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                
                                {/* Opzioni variante: Con cesta */}
                                {hasVariants && (() => {
                                  const variant = selectedArticle!.variantsData![extra.variantIndex ?? 0];
                                  const supportsCesta = variant?.supportsCesta;
                                  if (!supportsCesta) return null;
                                  return (
                                    <div className="flex items-center gap-3">
                                      {supportsCesta && (
                                        <div className="flex items-center gap-1.5">
                                          <Switch
                                            checked={extra.useCesta || false}
                                            onCheckedChange={(checked) => updateExtraChecklistItem(extra.id, { useCesta: checked })}
                                            data-testid={`switch-extra-cesta-${extra.id}`}
                                          />
                                          <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">Con cesta</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                
                                {hasInstallation && (
                                  <div className="w-48">
                                    <Select
                                      value={String(extra.installationIndex ?? 0)}
                                      onValueChange={(val) => updateExtraChecklistItem(extra.id, { installationIndex: parseInt(val) })}
                                    >
                                      <SelectTrigger data-testid={`select-extra-install-${extra.id}`}>
                                        <SelectValue placeholder="Installazione" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {selectedArticle!.installationData!.map((opt: InstallationOption, idx: number) => (
                                          <SelectItem key={idx} value={String(idx)}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                
                                {/* HOIST specific parameters */}
                                {selectedArticle?.pricingLogic === "HOIST" && hasVariants && (() => {
                                  const variant = selectedArticle!.variantsData![extra.variantIndex ?? 0];
                                  const isP26 = variant?.hoistType === "P26";
                                  const isPMM10 = variant?.hoistType === "PM-M10";
                                  return (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className="w-24">
                                        <Input
                                          type="number"
                                          min={0}
                                          step={0.5}
                                          placeholder="Altezza mt"
                                          value={extra.hoistAltezzaMetri || ""}
                                          onChange={(e) => updateExtraChecklistItem(extra.id, { hoistAltezzaMetri: parseFloat(e.target.value) || 0 })}
                                          data-testid={`input-extra-hoist-altezza-${extra.id}`}
                                        />
                                      </div>
                                      {isPMM10 && (
                                        <div className="w-20">
                                          <Input
                                            type="number"
                                            min={0}
                                            placeholder="N. Sbarchi"
                                            value={extra.hoistNumSbarchi || ""}
                                            onChange={(e) => updateExtraChecklistItem(extra.id, { hoistNumSbarchi: parseInt(e.target.value) || 0 })}
                                            data-testid={`input-extra-hoist-sbarchi-${extra.id}`}
                                          />
                                        </div>
                                      )}
                                      {isP26 && (
                                          <div className="w-24">
                                            <Input
                                              type="number"
                                              min={0}
                                              step={0.1}
                                              placeholder="Sbalzo mq"
                                              value={extra.hoistSbalzoMq || ""}
                                              onChange={(e) => updateExtraChecklistItem(extra.id, { hoistSbalzoMq: parseFloat(e.target.value) || 0 })}
                                              data-testid={`input-extra-hoist-sbalzo-${extra.id}`}
                                            />
                                          </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                
                                <div className="flex-1 min-w-[150px]">
                                  <Input
                                    placeholder="Note"
                                    value={extra.notes || ""}
                                    onChange={(e) => updateExtraChecklistItem(extra.id, { notes: e.target.value })}
                                    data-testid={`input-extra-notes-${extra.id}`}
                                  />
                                </div>
                                
                                <div className="w-24">
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder="Quantità"
                                    value={extra.quantity || ""}
                                    step="any"
                                    onChange={(e) => updateExtraChecklistItem(extra.id, { quantity: parseFloat(e.target.value) || 0 })}
                                    data-testid={`input-extra-qty-${extra.id}`}
                                  />
                                </div>
                                
                                <Badge variant="outline" className="w-14 justify-center">
                                  {selectedArticle?.unitType || "?"}
                                </Badge>
                                
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeExtraChecklistItem(extra.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-100"
                                  data-testid={`button-remove-extra-${extra.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Sezione "A corpo" - nascosta in modo a_corpo */}
                    {quoteMode !== 'a_corpo' && (
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-purple-600" />
                          <span className="font-medium text-purple-800 dark:text-purple-300">Voci "A corpo"</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addACorpoItem}
                          data-testid="button-add-acorpo"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Aggiungi voce
                        </Button>
                      </div>

                      {getActiveACorpoItems().length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Nessuna voce "a corpo" aggiunta</p>
                      ) : (
                        <div className="space-y-2">
                          {getActiveACorpoItems().map((item) => {
                            const selectedArticle = allChecklistArticles.find((a: Article) => a.id === item.articleId);
                            const hasVariants = selectedArticle?.variantsData && selectedArticle.variantsData.length > 0;
                            
                            return (
                              <div 
                                key={item.id}
                                className="flex flex-wrap items-center gap-3 p-3 border rounded-md bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800"
                              >
                                <div className="w-56">
                                  <SearchableSelect
                                    data-testid={`select-acorpo-article-${item.id}`}
                                    options={allChecklistArticles.map((article: Article) => ({ value: article.id, label: article.name }))}
                                    value={item.articleId}
                                    onChange={(value) => updateACorpoItem(item.id, { articleId: value, variantIndex: 0 })}
                                    placeholder="Seleziona articolo"
                                  />
                                </div>
                                
                                {hasVariants && (
                                  <div className="w-40">
                                    <Select
                                      value={String(item.variantIndex ?? 0)}
                                      onValueChange={(val) => updateACorpoItem(item.id, { variantIndex: parseInt(val), useCesta: false })}
                                    >
                                      <SelectTrigger data-testid={`select-acorpo-variant-${item.id}`}>
                                        <SelectValue placeholder="Variante" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {selectedArticle!.variantsData!.map((v: ArticleVariant, idx: number) => (
                                          <SelectItem key={idx} value={String(idx)}>
                                            {v.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                
                                {/* Opzioni variante: Con cesta */}
                                {hasVariants && (() => {
                                  const variant = selectedArticle!.variantsData![item.variantIndex ?? 0];
                                  const supportsCesta = variant?.supportsCesta;
                                  if (!supportsCesta) return null;
                                  return (
                                    <div className="flex items-center gap-3">
                                      {supportsCesta && (
                                        <div className="flex items-center gap-1.5">
                                          <Switch
                                            checked={item.useCesta || false}
                                            onCheckedChange={(checked) => updateACorpoItem(item.id, { useCesta: checked })}
                                            data-testid={`switch-acorpo-cesta-${item.id}`}
                                          />
                                          <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">Con cesta</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                
                                <div className="flex-1 min-w-[150px]">
                                  <Input
                                    placeholder="Note"
                                    value={item.notes || ""}
                                    onChange={(e) => updateACorpoItem(item.id, { notes: e.target.value })}
                                    data-testid={`input-acorpo-notes-${item.id}`}
                                  />
                                </div>
                                
                                <div className="w-28">
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="Totale €"
                                    value={item.totalPrice || ""}
                                    onChange={(e) => updateACorpoItem(item.id, { totalPrice: parseFloat(e.target.value) || 0 })}
                                    data-testid={`input-acorpo-total-${item.id}`}
                                  />
                                </div>
                                
                                <div className="w-24">
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Quantità"
                                    value={item.quantity || ""}
                                    step="any"
                                    onChange={(e) => updateACorpoItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                    data-testid={`input-acorpo-qty-${item.id}`}
                                  />
                                </div>
                                
                                {item.splitIntoPhases ? (
                                  <Badge variant="outline" className="w-auto justify-center bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] px-1.5" title="Genera Montaggio + Smontaggio (60%) + Noleggio">M+S+N</Badge>
                                ) : (
                                  <Badge variant="outline" className="w-14 justify-center bg-purple-100 dark:bg-purple-900">AC</Badge>
                                )}
                                
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeACorpoItem(item.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-100"
                                  data-testid={`button-remove-acorpo-${item.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            {/* Scheda 4: Trasporti - solo per modalità Noleggio */}
            {quoteMode === 'rental' && (
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-base">
                            Trasporti
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {getActiveTransportItems().length > 0 
                              ? `${getActiveTransportItems().length} mezz${getActiveTransportItems().length > 1 ? 'i' : 'o'} selezionat${getActiveTransportItems().length > 1 ? 'i' : 'o'}`
                              : "Seleziona i mezzi e viaggi per il cantiere"
                            }
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={addTransportItem}
                          disabled={transportArticles.length === 0}
                          data-testid="button-add-transport"
                        >
                          <Plus className="w-4 h-4 mr-1" /> Aggiungi Mezzo
                        </Button>
                      </div>

                      {transportArticles.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nessun articolo trasporto nel listino</p>
                      ) : getActiveTransportItems().length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground border rounded-md bg-muted/20">
                          <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Nessun trasporto aggiunto</p>
                          <p className="text-xs">Clicca "Aggiungi Mezzo" per inserire un veicolo</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {getActiveTransportItems().map((item, index) => {
                            const article = transportArticles.find(a => a.id === item.articleId);
                            const vehicles = article ? getVehicleOptions(article) : [];
                            const selectedVehicle = vehicles[item.vehicleIndex];

                            const allOptions = transportArticles.flatMap(art => {
                              const vehs = getVehicleOptions(art);
                              return vehs.map((v, vi) => ({
                                key: `${art.id}|${vi}`,
                                articleId: art.id,
                                vehicleIndex: vi,
                                vehicle: v,
                                label: `${v.name} (€${v.fix} + €${v.perKm}/km)`
                              }));
                            });

                            const currentKey = `${item.articleId}|${item.vehicleIndex}`;

                            const directionsActive = (item.andataEnabled !== false ? 1 : 0) + (item.ritornoEnabled !== false ? 1 : 0);

                            return (
                              <div key={index} className="p-3 border rounded-md bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
                                <div className="flex items-end gap-3">
                                  <div className="flex-1 space-y-1">
                                    <Label className="text-xs">Mezzo</Label>
                                    <Select
                                      value={currentKey}
                                      onValueChange={(v) => {
                                        const [artId, vehIdx] = v.split("|");
                                        updateTransportItem(index, { articleId: artId, vehicleIndex: parseInt(vehIdx) });
                                      }}
                                    >
                                      <SelectTrigger data-testid={`select-transport-vehicle-${index}`}>
                                        <SelectValue placeholder="Seleziona mezzo">
                                          {selectedVehicle ? `${selectedVehicle.name} (€${selectedVehicle.fix} + €${selectedVehicle.perKm}/km)` : "Seleziona mezzo"}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {allOptions.map((opt) => (
                                          <SelectItem key={opt.key} value={opt.key}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="w-24 space-y-1">
                                    <Label className="text-xs">Viaggi</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      placeholder="Viaggi"
                                      value={item.quantity || ""}
                                      onChange={(e) => updateTransportItem(index, { quantity: parseInt(e.target.value) || 0 })}
                                      data-testid={`input-transport-qty-${index}`}
                                    />
                                  </div>
                                  {selectedVehicle && (
                                    <Badge variant="secondary" className="whitespace-nowrap mb-1">
                                      €{formatCurrency((selectedVehicle.fix + selectedVehicle.perKm * distanceKm * 2) * item.quantity * directionsActive)}
                                    </Badge>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeTransportItem(index)}
                                    className="text-destructive hover:text-destructive"
                                    data-testid={`button-remove-transport-${index}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-4 pl-1">
                                  <label className="flex items-center gap-1.5 cursor-pointer" data-testid={`toggle-andata-${index}`}>
                                    <input
                                      type="checkbox"
                                      checked={item.andataEnabled !== false}
                                      onChange={(e) => updateTransportItem(index, { andataEnabled: e.target.checked })}
                                      className="rounded border-gray-300"
                                    />
                                    <span className="text-xs font-medium">Andata</span>
                                  </label>
                                  <label className="flex items-center gap-1.5 cursor-pointer" data-testid={`toggle-ritorno-${index}`}>
                                    <input
                                      type="checkbox"
                                      checked={item.ritornoEnabled !== false}
                                      onChange={(e) => updateTransportItem(index, { ritornoEnabled: e.target.checked })}
                                      className="rounded border-gray-300"
                                    />
                                    <span className="text-xs font-medium">Ritorno</span>
                                  </label>
                                  {directionsActive === 0 && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400">Trasporto disabilitato</span>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={item.note || ''}
                                  onChange={(e) => updateTransportItem(index, { note: e.target.value })}
                                  placeholder="Nota trasporto (opzionale)"
                                  className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  data-testid={`input-transport-note-${index}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="border-t pt-4 mt-4">
                        <div className="flex items-center gap-6 flex-wrap">
                          <div className="flex items-center gap-3">
                            <Label htmlFor="distance" className="text-base font-semibold">Distanza Cantiere</Label>
                          </div>
                          <div className="flex items-center gap-3">
                            <Input
                              id="distance"
                              type="number"
                              min={0}
                              placeholder="Km"
                              value={distanceKm || ""}
                              onChange={(e) => setDistanceKm(parseInt(e.target.value) || 0)}
                              className="w-24 text-lg font-medium"
                              data-testid="input-distance-km"
                            />
                            <span className="text-sm text-muted-foreground">km (andata)</span>
                            <Badge variant="outline" className="ml-2">A/R: {distanceKm * 2} km</Badge>
                          </div>
                          
                          <div className="h-8 w-px bg-border mx-2" />
                          
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id="squadra-in-zona"
                              checked={squadraInZonaEnabled}
                              onCheckedChange={(checked) => {
                                setSquadraInZonaEnabled(!!checked);
                                if (!checked) setSquadraInZonaKm(0);
                              }}
                              data-testid="checkbox-squadra-in-zona"
                            />
                            <Label htmlFor="squadra-in-zona" className="text-sm font-medium cursor-pointer">
                              Squadra in zona
                            </Label>
                            {squadraInZonaEnabled && (
                              <>
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="Km"
                                  value={squadraInZonaKm || ""}
                                  onChange={(e) => setSquadraInZonaKm(parseInt(e.target.value) || 0)}
                                  className="w-20 h-8 text-sm"
                                  data-testid="input-squadra-in-zona-km"
                                />
                                <span className="text-xs text-muted-foreground">km</span>
                                <Badge variant="secondary" className="text-xs">
                                  {squadraInZonaKm <= 70 ? "Nessuna trasferta" : squadraInZonaKm <= 100 ? "Trasferta giornaliera" : "Trasferta con pernottamento"}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scheda 5: Movimentazione - per tutte le modalità */}
            {(quoteMode === 'rental' || quoteMode === 'labor_only' || isPhaseLikeMode) && (
              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-base">
                            Movimentazione{quoteMode === 'phases' ? ` - Fase ${currentFaseIndex + 1}` : (quoteMode === 'a_corpo' ? '' : '')}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {getActiveHandlingEnabled() 
                              ? `${getActiveHandlingZones().length} zon${getActiveHandlingZones().length !== 1 ? 'e' : 'a'} configurata`
                              : "Costi extra logistica cantiere (opzionale)"
                            }
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label htmlFor="handling-toggle" className="text-sm">Abilita</Label>
                          <Switch
                            id="handling-toggle"
                            checked={getActiveHandlingEnabled()}
                            onCheckedChange={setActiveHandlingEnabled}
                            data-testid="switch-handling-enabled"
                          />
                        </div>
                      </div>

                      {getActiveHandlingEnabled() && (
                        <div className="space-y-4">
                          {/* Zone di movimentazione */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">Zone di Movimentazione</Label>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={addHandlingZone}
                                data-testid="button-add-handling-zone"
                              >
                                <Plus className="w-4 h-4 mr-1" /> Aggiungi Zona
                              </Button>
                            </div>

                            {getActiveHandlingZones().length === 0 ? (
                              <div className="text-center py-4 text-muted-foreground border rounded-md bg-muted/20">
                                <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">Nessuna zona aggiunta</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {getActiveHandlingZones().map((zone, index) => (
                                  <div key={index} className="p-3 border rounded-md bg-orange-50/50 dark:bg-orange-950/20 space-y-3">
                                    <div className="flex items-end gap-3">
                                      <div className="flex-1 space-y-1">
                                        <Label className="text-xs">Nome zona</Label>
                                        <Input
                                          value={zone.label}
                                          onChange={(e) => updateHandlingZone(index, { label: e.target.value })}
                                          placeholder="Es. Zona A"
                                          data-testid={`input-zone-label-${index}`}
                                        />
                                      </div>
                                      <div className="w-24 space-y-1">
                                        <Label className="text-xs">Quantità</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          placeholder="MQ"
                                          value={zone.quantity || ""}
                                          onChange={(e) => updateHandlingZone(index, { quantity: parseFloat(e.target.value) || 0 })}
                                          data-testid={`input-zone-qty-${index}`}
                                        />
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeHandlingZone(index)}
                                        className="text-destructive hover:text-destructive"
                                        data-testid={`button-remove-zone-${index}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                    <div className="flex items-end gap-3">
                                      <div className="w-28 space-y-1">
                                        <Label className="text-xs">Dist. Orizz. (m)</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          placeholder="m"
                                          value={zone.distHoriz || ""}
                                          onChange={(e) => updateHandlingZone(index, { distHoriz: parseFloat(e.target.value) || 0 })}
                                          data-testid={`input-zone-horiz-${index}`}
                                        />
                                      </div>
                                      <div className="w-28 space-y-1">
                                        <Label className="text-xs">Dist. Vert. (m)</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          placeholder="m"
                                          value={zone.distVert || ""}
                                          onChange={(e) => updateHandlingZone(index, { distVert: parseFloat(e.target.value) || 0 })}
                                          data-testid={`input-zone-vert-${index}`}
                                        />
                                      </div>
                                      <div className="flex-1 space-y-1">
                                        <Label className="text-xs">Tipo</Label>
                                        <Select
                                          value={zone.type}
                                          onValueChange={(v: "GROUND" | "HEIGHT") => updateHandlingZone(index, { type: v })}
                                        >
                                          <SelectTrigger data-testid={`select-zone-type-${index}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="GROUND">A Terra</SelectItem>
                                            <SelectItem value="HEIGHT">In Quota</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <Separator />

                          {/* Saltareti e Costi extra in riga */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-3 p-3 border rounded-md">
                              <Checkbox
                                checked={getActiveSaltaretiEnabled()}
                                onCheckedChange={(checked) => setActiveSaltaretiEnabled(!!checked)}
                                data-testid="checkbox-saltareti"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium">Saltareti</div>
                                <div className="text-xs text-muted-foreground">€2.50/mq</div>
                              </div>
                              {getActiveSaltaretiEnabled() && (
                                <Input
                                  type="number"
                                  min={0}
                                  className="w-20"
                                  placeholder="MQ"
                                  value={getActiveSaltaretiQuantity() || ""}
                                  onChange={(e) => setActiveSaltaretiQuantity(parseFloat(e.target.value) || 0)}
                                  data-testid="input-saltareti-qty"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-3 p-3 border rounded-md">
                              <div className="flex-1">
                                <div className="text-sm font-medium">Costo Extra</div>
                                <div className="text-xs text-muted-foreground">Una tantum</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm">€</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="w-24"
                                  placeholder="Extra"
                                  value={getActiveHandlingExtraPrice() || ""}
                                  onChange={(e) => setActiveHandlingExtraPrice(parseFloat(e.target.value) || 0)}
                                  data-testid="input-handling-extra"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scheda 6: Incremento Difficoltà - per tutte le modalità */}
            {(quoteMode === 'rental' || quoteMode === 'phases' || quoteMode === 'labor_only' || quoteMode === 'a_corpo') && (
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-base">
                            Incremento Difficoltà{quoteMode === 'phases' ? ` - Fase ${currentFaseIndex + 1}` : (quoteMode === 'a_corpo' ? '' : '')}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {getActiveDifficultyEnabled() 
                              ? `${getActiveDifficultyItems().length} extra configurat${getActiveDifficultyItems().length !== 1 ? 'i' : 'o'}`
                              : "Maggiorazioni per criticità cantiere (opzionale)"
                            }
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label htmlFor="difficulty-toggle" className="text-sm">Abilita</Label>
                          <Switch
                            id="difficulty-toggle"
                            checked={getActiveDifficultyEnabled()}
                            onCheckedChange={setActiveDifficultyEnabled}
                            data-testid="switch-difficulty-enabled"
                          />
                        </div>
                      </div>

                      {getActiveDifficultyEnabled() && (
                        <div className="space-y-4">
                          {/* Lista extra difficoltà */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">Extra Difficoltà</Label>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={addDifficultyItem}
                                data-testid="button-add-difficulty"
                              >
                                <Plus className="w-4 h-4 mr-1" /> Aggiungi Extra
                              </Button>
                            </div>

                            {getActiveDifficultyItems().length === 0 ? (
                              <div className="text-center py-4 text-muted-foreground border rounded-md bg-muted/20">
                                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">Nessun extra aggiunto</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {getActiveDifficultyItems().map((item) => (
                                  <div key={item.id} className="p-3 border rounded-md bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                                    <div className="flex items-end gap-3">
                                      <div className="flex-1 space-y-1">
                                        <Label className="text-xs">Tipo</Label>
                                        <Select
                                          value={item.type}
                                          onValueChange={(v: DifficultyType) => updateDifficultyItem(item.id, { type: v })}
                                        >
                                          <SelectTrigger data-testid={`select-difficulty-type-${item.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {Object.entries(DIFFICULTY_TYPES).map(([key, val]) => (
                                              <SelectItem key={key} value={key}>
                                                {val.label} {val.unitPrice > 0 ? `(€${val.unitPrice})` : ''}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="w-24 space-y-1">
                                        <Label className="text-xs">Quantità</Label>
                                        <Input
                                          type="number"
                                          min={1}
                                          value={item.quantity || ""}
                                          step="any"
                                          onChange={(e) => updateDifficultyItem(item.id, { quantity: parseFloat(e.target.value) || 1 })}
                                          data-testid={`input-difficulty-qty-${item.id}`}
                                        />
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeDifficultyItem(item.id)}
                                        className="text-destructive hover:text-destructive"
                                        data-testid={`button-remove-difficulty-${item.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                    
                                    {/* Campi extra per tipo "ALTRO" */}
                                    {item.type === 'ALTRO' && (
                                      <div className="flex items-end gap-3">
                                        <div className="flex-1 space-y-1">
                                          <Label className="text-xs">Descrizione</Label>
                                          <Input
                                            value={item.customDescription || ""}
                                            onChange={(e) => updateDifficultyItem(item.id, { customDescription: e.target.value })}
                                            placeholder="Descrizione difficoltà"
                                            data-testid={`input-difficulty-desc-${item.id}`}
                                          />
                                        </div>
                                        <div className="w-28 space-y-1">
                                          <Label className="text-xs">Prezzo unitario</Label>
                                          <div className="flex items-center gap-1">
                                            <span className="text-sm">€</span>
                                            <Input
                                              type="number"
                                              min={0}
                                              step={0.01}
                                              value={item.customPrice || ""}
                                              onChange={(e) => updateDifficultyItem(item.id, { customPrice: parseFloat(e.target.value) || 0 })}
                                              data-testid={`input-difficulty-price-${item.id}`}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Subtotale riga */}
                                    <div className="text-right text-sm font-medium text-amber-700 dark:text-amber-300">
                                      Subtotale: €{formatCurrency(item.type === 'ALTRO' 
                                        ? (item.customPrice || 0) * item.quantity 
                                        : DIFFICULTY_TYPES[item.type].unitPrice * item.quantity
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Totale incremento difficoltà */}
                          {getActiveDifficultyItems().length > 0 && (
                            <>
                              <Separator />
                              <div className="flex justify-between items-center p-3 bg-amber-100/50 dark:bg-amber-900/20 rounded-md">
                                <span className="font-medium">Totale Incremento Difficoltà</span>
                                <span className="text-lg font-bold text-amber-700 dark:text-amber-300">
                                  €{formatCurrency(calculateDifficultyTotal())}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigazione Fasi - solo in modalità phases */}
            {quoteMode === 'phases' && fasi.length > 0 && (
              <Card className="border-l-4 border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-violet-600 text-white">
                        Fase {currentFaseIndex + 1} di {fasi.length}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {currentFase?.durationMonths || 1} mes{(currentFase?.durationMonths || 1) === 1 ? 'e' : 'i'}
                        {currentFase && (currentFase.montaggioItems.length + currentFase.smontaggioItems.length + currentFase.noleggioItems.length + currentFase.fornituraItems.length + currentFase.magazzinoItems.length) > 0 && ` • ${currentFase.montaggioItems.length + currentFase.smontaggioItems.length + currentFase.noleggioItems.length + currentFase.fornituraItems.length + currentFase.magazzinoItems.length} articoli`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Torna alla fase precedente */}
                      {currentFaseIndex > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={goToPreviousFase}
                          data-testid="button-prev-fase"
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" />
                          Torna alla Fase {currentFaseIndex}
                        </Button>
                      )}
                      
                      {/* Aggiungi nuova fase (sempre visibile se < 10) */}
                      {fasi.length < 50 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addFase}
                          data-testid="button-add-fase-bottom"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Aggiungi Fase
                        </Button>
                      )}
                      
                      {/* Vai alla fase successiva (se esiste) */}
                      {currentFaseIndex < fasi.length - 1 && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={goToNextFase}
                          data-testid="button-next-fase"
                        >
                          Vai alla Fase {currentFaseIndex + 2}
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 2: Logistica & Servizi */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* Documenti & Servizi - visibile per tutte le modalità */}
            <Card>
              <CardContent className="pt-6">
                <Accordion type="multiple" defaultValue={["documenti"]} className="w-full">
                  {/* Sezione Documenti & Servizi */}
                  <AccordionItem value="documenti" className="border-b-0">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                          <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="text-left">
                          <span>Documenti & Servizi</span>
                          <p className="text-sm font-normal text-muted-foreground">POS, Pimus, Relazione di Calcolo</p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-6">
                <div className="space-y-3">
                  {/* POS e Pimus - Scelta tra calcolo automatico o inserimento manuale */}
                  {posArticle && (
                    <div className={`p-3 border rounded-md transition-colors ${(ponteggioMq > 0 || posManualEnabled) ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-muted/30"}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={posManualEnabled || ponteggioMq > 0}
                          onCheckedChange={(checked) => {
                            setPosManualEnabled(!!checked);
                            if (!checked) setPosManualPrice(0);
                          }}
                          data-testid="checkbox-pos"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{posArticle.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {posManualEnabled ? (
                              <span className="text-blue-600 dark:text-blue-400">Inserimento manuale attivo</span>
                            ) : ponteggioMq > 0 ? (
                              <>
                                Calcolato: <strong>{ponteggioMq} m²</strong> → {ponteggioMq > 1000 ? "Oltre 1000 mq" : "Fino a 1000 mq"}
                                {" - "}€{getDocumentOptions(posArticle)[posOptionIndex]?.price.toFixed(2) || "0.00"}
                              </>
                            ) : (
                              "Spunta per inserire manualmente o seleziona un Ponteggio per calcolo automatico"
                            )}
                          </div>
                        </div>

                        {posManualEnabled && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm whitespace-nowrap">€</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-28"
                              placeholder="Prezzo"
                              value={posManualPrice || ""}
                              onChange={(e) => setPosManualPrice(parseFloat(e.target.value) || 0)}
                              data-testid="input-pos-manual-price"
                            />
                          </div>
                        )}

                        {posManualEnabled ? (
                          <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                            <Edit2 className="w-3 h-3 mr-1" />
                            MANUALE
                          </Badge>
                        ) : ponteggioMq > 0 ? (
                          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                            AUTO
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Altri documenti e servizi - ordinati */}
                  {[...documentArticles.filter(a => a.id !== posArticle?.id), ...serviceArticles].sort((a, b) => {
                    const orderMap: Record<string, number> = {
                      "relazione di calcolo": 1,
                      "ritiro e smaltimento rete antipolvere": 2,
                      "controllo semestrale chiave dinamometrica": 3,
                      "trasporto esubero bancali": 4,
                    };
                    const aOrder = orderMap[a.name.toLowerCase()] ?? 99;
                    const bOrder = orderMap[b.name.toLowerCase()] ?? 99;
                    return aOrder - bOrder;
                  }).map((article) => {
                    const itemState = serviceItems.get(article.id) || { enabled: false, quantity: 1, optionIndex: 0 };
                    const isDocument = article.pricingLogic === "DOCUMENT";
                    const isService = article.pricingLogic === "SERVICE" || (article.pricingLogic as string) === "EXTRA";
                    const docOptions = isDocument ? getDocumentOptions(article) : [];
                    const showQuantity = isService; // Show quantity for SERVICE articles like "Relazione di calcolo"

                    return (
                      <div 
                        key={article.id} 
                        className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${
                          itemState.enabled ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                        }`}
                      >
                        <Checkbox
                          checked={itemState.enabled}
                          onCheckedChange={(checked) => toggleServiceItem(article.id, !!checked)}
                          data-testid={`checkbox-service-${article.id}`}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{article.name}</div>
                          {isDocument && docOptions.length > 0 && itemState.enabled && (
                            <Select
                              value={String(itemState.optionIndex || 0)}
                              onValueChange={(v) => updateServiceOption(article.id, parseInt(v))}
                            >
                              <SelectTrigger className="mt-2 w-64" data-testid={`select-doc-option-${article.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {docOptions.map((opt, idx) => (
                                  <SelectItem key={idx} value={String(idx)}>
                                    {opt.name} - €{opt.price.toFixed(2)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {showQuantity && itemState.enabled && (
                          <div className="w-20">
                            <Input
                              type="number"
                              min={1}
                              placeholder="Qtà"
                              value={itemState.quantity || ""}
                              onChange={(e) => updateServiceQuantity(article.id, parseInt(e.target.value) || 0)}
                              data-testid={`input-service-qty-${article.id}`}
                            />
                          </div>
                        )}
                        {isService && (() => {
                          const isSrv004 = article.code === "SRV-004";
                          const displayPrice = isSrv004
                            ? calcPrezzoSmaltimentoRete(reteAntipolvereQtyML)
                            : ((article.pricingData as SimplePricingData)?.price ?? 0);
                          return (
                            <div className="text-sm text-muted-foreground whitespace-nowrap">
                              €{displayPrice.toFixed(2)}/cad
                              {isSrv004 && (
                                <span className="ml-1 text-xs text-muted-foreground" title="€100 per i primi 500 ML, +€50 ogni 500 ML aggiuntivi">
                                  ({reteAntipolvereQtyML > 0 ? `${reteAntipolvereQtyML} ML` : "0 ML"})
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}

                  {/* Ritiro esubero - Checkbox uniforme alle altre voci */}
                  {furgoneArticle && (
                    <div className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${ritiroEsuberoEnabled ? "bg-primary/5 border-primary/20" : "bg-muted/30"}`}>
                      <Checkbox
                        checked={ritiroEsuberoEnabled}
                        onCheckedChange={(checked) => setRitiroEsuberoEnabled(!!checked)}
                        data-testid="checkbox-ritiro-esubero"
                      />
                      <div className="flex-1">
                        <div className="font-medium">Ritiro esubero</div>
                        <div className="text-sm text-muted-foreground">
                          Viaggio furgone per ritiro materiale di scarto
                        </div>
                      </div>
                      {ritiroEsuberoEnabled && (
                        <div className="text-sm text-muted-foreground whitespace-nowrap">
                          1 viaggio ({distanceKm * 2} km A/R)
                        </div>
                      )}
                    </div>
                  )}

                  {documentArticles.length === 0 && serviceArticles.length === 0 && !furgoneArticle && (
                    <p className="text-sm text-muted-foreground">Nessun servizio nel listino</p>
                  )}
                </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
          </div>
        )}

        {/* Step 3: Dettagli Tecnici */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Dettagli Tecnici</CardTitle>
                <CardDescription>
                  Configura le opzioni avanzate per trasporti e ponteggio
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={(quoteMode === 'rental' || isPhaseLikeMode) ? "trasporto" : "ponteggio"} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    {(quoteMode === 'rental' || isPhaseLikeMode) && (
                      <TabsTrigger value="trasporto" className="flex items-center gap-2" data-testid="tab-trasporto">
                        <Truck className="w-4 h-4" />
                        Trasporto
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="ponteggio" className={`flex items-center gap-2 ${quoteMode !== 'rental' && !isPhaseLikeMode ? 'col-span-2' : ''}`} data-testid="tab-ponteggio">
                      <Package className="w-4 h-4" />
                      Ponteggio
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab Trasporto */}
                  {(quoteMode === 'rental' || isPhaseLikeMode) && (
                  <TabsContent value="trasporto" className="space-y-6 mt-0">
                      {/* Transpallet */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Transpallet</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "NO", label: "NO" },
                            { value: "SI_NOSTRO", label: "Sì a carico nostro" },
                            { value: "SI_CLIENTE", label: "Sì a carico cliente" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={transpallet === opt.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setTranspallet(opt.value)}
                              data-testid={`button-transpallet-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Posiz. camion */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Posiz. camion</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "FUORI", label: "Scarica da fuori" },
                            { value: "DENTRO", label: "Deve entrare" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={posizCamion === opt.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPosizCamion(opt.value)}
                              data-testid={`button-posiz-camion-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Si può scaricare */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Si può scaricare</Label>
                        <Select value={puoScaricare} onValueChange={setPuoScaricare}>
                          <SelectTrigger className="w-full max-w-xs" data-testid="select-puo-scaricare">
                            <SelectValue placeholder="Seleziona opzione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DURANTE_LAVORI">Solo durante i lavori</SelectItem>
                            <SelectItem value="SENZA_SQUADRA">Anche senza squadra</SelectItem>
                            <SelectItem value="SENZA_SQUADRA_PLUS">Anche senza squadra +1</SelectItem>
                            <SelectItem value="DA_VERIFICARE">Da verificare</SelectItem>
                            <SelectItem value="ORARI_PRECISI">Orari precisi</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Luogo di scarico - Multi-select con checkbox */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Luogo di scarico</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            { value: "AREA_CANTIERE", label: "Area di cantiere" },
                            { value: "PIAZZALE_PRIVATO", label: "Piazzale privato" },
                            { value: "GIARDINO", label: "Giardino" },
                            { value: "VIALETTO_PRIVATO", label: "Vialetto privato" },
                            { value: "PARCHEGGI_INT", label: "Parcheggi int." },
                            { value: "IN_STRADA", label: "In strada" },
                            { value: "MARCIAPIEDE", label: "Sul marciapiede" },
                            { value: "PARCHEGGI_EST", label: "Parcheggi esterno" },
                          ].map((opt) => (
                            <div key={opt.value} className="flex items-center gap-2">
                              <Checkbox
                                id={`luogo-${opt.value}`}
                                checked={luogoScarico.includes(opt.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setLuogoScarico([...luogoScarico, opt.value]);
                                  } else {
                                    setLuogoScarico(luogoScarico.filter(v => v !== opt.value));
                                  }
                                }}
                                data-testid={`checkbox-luogo-${opt.value}`}
                              />
                              <label htmlFor={`luogo-${opt.value}`} className="text-sm cursor-pointer">
                                {opt.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cartelli stradali */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Cartelli stradali</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "NO", label: "NO" },
                            { value: "SI_NOSTRO", label: "Sì a carico nostro" },
                            { value: "SI_CLIENTE", label: "Sì a carico cliente" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={cartelliStradali === opt.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCartelliStradali(opt.value)}
                              data-testid={`button-cartelli-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Permessi Viabilità */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Permessi Viabilità</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "NO", label: "NO" },
                            { value: "SI_NOSTRO", label: "Sì a carico nostro" },
                            { value: "SI_CLIENTE", label: "Sì a carico cliente" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={permessiViabilita === opt.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPermessiViabilita(opt.value)}
                              data-testid={`button-permessi-viabilita-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Permesso sosta camion carico/scarico */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Permesso sosta camion carico/scarico</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "NO", label: "NO" },
                            { value: "SI_NOSTRO", label: "Sì a carico nostro" },
                            { value: "SI_CLIENTE", label: "Sì a carico cliente" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={permessoSosta === opt.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPermessoSosta(opt.value)}
                              data-testid={`button-permesso-sosta-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                  </TabsContent>
                  )}

                  {/* Tab Ponteggio */}
                  <TabsContent value="ponteggio" className="space-y-6 mt-0">
                      {/* Ponteggio per - Multi-select */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Ponteggio per</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            { value: "TETTO", label: "Tetto" },
                            { value: "FACCIATA", label: "Facciata" },
                            { value: "NUOVA_COSTR", label: "Nuova Costr." },
                            { value: "TERRAZZE", label: "Terrazze" },
                            { value: "CANNE_FUMARIE", label: "Canne fumarie" },
                            { value: "GRONDAIE", label: "Grondaie" },
                            { value: "PIANO_CARICO", label: "Piano di carico" },
                            { value: "CASTELLO_RISALITA", label: "Castello di risalita" },
                            { value: "RISTRUTTURAZIONE", label: "Ristrutt. interna" },
                            { value: "FINESTRE_SCURI", label: "Finestre/scuri" },
                            { value: "DEMOLIZIONE", label: "Demolizione" },
                            { value: "ALTRO", label: "Altro" },
                          ].map((opt) => (
                            <div key={opt.value} className="flex items-center gap-2">
                              <Checkbox
                                id={`ponteggio-per-${opt.value}`}
                                checked={ponteggioPerArray.includes(opt.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setPonteggioPerArray([...ponteggioPerArray, opt.value]);
                                  } else {
                                    setPonteggioPerArray(ponteggioPerArray.filter(v => v !== opt.value));
                                    if (opt.value === "ALTRO") setPonteggioPerAltroNote("");
                                  }
                                }}
                                data-testid={`checkbox-ponteggio-per-${opt.value}`}
                              />
                              <label htmlFor={`ponteggio-per-${opt.value}`} className="text-sm cursor-pointer">
                                {opt.label}
                              </label>
                            </div>
                          ))}
                        </div>
                        {ponteggioPerArray.includes("ALTRO") && (
                          <Input
                            placeholder="Specifica..."
                            value={ponteggioPerAltroNote}
                            onChange={(e) => setPonteggioPerAltroNote(e.target.value)}
                            className="mt-2 max-w-md"
                            data-testid="input-ponteggio-per-altro-note"
                          />
                        )}
                      </div>

                      {/* Gru di cantiere - 3 opzioni */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Gru di cantiere</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "NO", label: "NO" },
                            { value: "SI_NOSTRO", label: "Sì a carico nostro" },
                            { value: "SI_CLIENTE", label: "Sì a carico cliente" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={gruCantiere === opt.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setGruCantiere(opt.value)}
                              data-testid={`button-gru-cantiere-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Luci segnalazione - 3 opzioni */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Luci segnalazione</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "NO", label: "NO" },
                            { value: "SI_NOSTRO", label: "Sì a carico nostro" },
                            { value: "SI_CLIENTE", label: "Sì a carico cliente" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={luciSegnalazione === opt.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setLuciSegnalazione(opt.value)}
                              data-testid={`button-luci-segnalazione-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* A carico del cliente - Multi-select */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">A carico del cliente</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            { value: "RIMOZ_PENSILINE", label: "Rimoz. pensiline" },
                            { value: "RIMOZ_TENDE", label: "Rimoz. tende" },
                            { value: "PUNTELLAMENTI", label: "Puntellamenti" },
                            { value: "ISOLAMENTO_CAVI", label: "Isolamento cavi" },
                            { value: "PERM_OCCUPAZIONE", label: "Perm. di occupazione" },
                            { value: "LEGNAME", label: "Legname" },
                            { value: "ASSITO", label: "Assito" },
                            { value: "PARAPETTI_TETTO", label: "Parapetti tetto" },
                            { value: "APERTURA_RETI", label: "Apertura reti giardini" },
                            { value: "ALTRO", label: "Altro" },
                          ].map((opt) => (
                            <div key={opt.value} className="flex items-center gap-2">
                              <Checkbox
                                id={`a-carico-cliente-${opt.value}`}
                                checked={aCaricoClienteArray.includes(opt.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setACaricoClienteArray([...aCaricoClienteArray, opt.value]);
                                  } else {
                                    setACaricoClienteArray(aCaricoClienteArray.filter(v => v !== opt.value));
                                    if (opt.value === "ALTRO") setACaricoClienteAltroNote("");
                                  }
                                }}
                                data-testid={`checkbox-a-carico-cliente-${opt.value}`}
                              />
                              <label htmlFor={`a-carico-cliente-${opt.value}`} className="text-sm cursor-pointer">
                                {opt.label}
                              </label>
                            </div>
                          ))}
                        </div>
                        {aCaricoClienteArray.includes("ALTRO") && (
                          <Input
                            placeholder="Specifica..."
                            value={aCaricoClienteAltroNote}
                            onChange={(e) => setACaricoClienteAltroNote(e.target.value)}
                            className="mt-2 max-w-md"
                            data-testid="input-a-carico-cliente-altro-note"
                          />
                        )}
                      </div>

                      {/* Orari di Lavoro - Dropdown 6 opzioni */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Orari di Lavoro</Label>
                        <Select value={orariLavoro} onValueChange={setOrariLavoro}>
                          <SelectTrigger className="w-full max-w-xs" data-testid="select-orari-lavoro">
                            <SelectValue placeholder="Seleziona orario" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STANDARD">Standard</SelectItem>
                            <SelectItem value="ORARI_PRESTABILITI">Orari prestabiliti</SelectItem>
                            <SelectItem value="SOLO_FESTIVI">Solo festivi</SelectItem>
                            <SelectItem value="NO_MERCATO">No quando c'è mercato</SelectItem>
                            <SelectItem value="NO_SABATO">No sabato</SelectItem>
                            <SelectItem value="DA_VERIFICARE">Da verificare</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Ancoraggi - Dropdown molte opzioni */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Ancoraggi</Label>
                        <Select value={ancoraggi} onValueChange={(val) => { setAncoraggi(val); if (val !== "ALTRO") setAncoraggiAltroNote(""); }}>
                          <SelectTrigger className="w-full max-w-xs" data-testid="select-ancoraggi">
                            <SelectValue placeholder="Seleziona tipo ancoraggio" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OCCHIOLI_CORTI">Occhioli corti</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_X">Occhioli per cappotto da ?</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_5">Occhioli per cappotto da 5</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_8">Occhioli per cappotto da 8</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_10">Occhioli per cappotto da 10</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_12">Occhioli per cappotto da 12</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_15">Occhioli per cappotto da 15</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_18">Occhioli per cappotto da 18</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_20">Occhioli per cappotto da 20</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_22">Occhioli per cappotto da 22</SelectItem>
                            <SelectItem value="OCCHIOLI_CAPPOTTO_25">Occhioli per cappotto da 25</SelectItem>
                            <SelectItem value="SPINTE">Spinte</SelectItem>
                            <SelectItem value="A_CRAVATTA">A cravatta</SelectItem>
                            <SelectItem value="ZAVORRE">Zavorre</SelectItem>
                            <SelectItem value="PUNTONI">Puntoni</SelectItem>
                            <SelectItem value="NO_ANCORAGGI">No ancoraggi</SelectItem>
                            <SelectItem value="VARIABILE">Variabile</SelectItem>
                            <SelectItem value="ALTRO">Altro</SelectItem>
                          </SelectContent>
                        </Select>
                        {ancoraggi === "ALTRO" && (
                          <Input
                            placeholder="Specifica..."
                            value={ancoraggiAltroNote}
                            onChange={(e) => setAncoraggiAltroNote(e.target.value)}
                            className="mt-2 max-w-md"
                            data-testid="input-ancoraggi-altro-note"
                          />
                        )}
                      </div>

                      {/* Maestranze - Dropdown 6 opzioni */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Maestranze</Label>
                        <Select value={maestranze} onValueChange={setMaestranze}>
                          <SelectTrigger className="w-full max-w-xs" data-testid="select-maestranze">
                            <SelectValue placeholder="Seleziona maestranze" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SOLO_DIPENDENTI">Solo dipendenti</SelectItem>
                            <SelectItem value="DIPENDENTI_PERM">Dipendenti con perm.</SelectItem>
                            <SelectItem value="DIPENDENTI_ARTIGIANI">Dipendenti e artigiani</SelectItem>
                            <SelectItem value="DIP_ART_PERM">Dip. e Art. con perm.</SelectItem>
                            <SelectItem value="PARTNERS">Partners</SelectItem>
                            <SelectItem value="DA_VERIFICARE">Da verificare</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Ponteggi Elettrici - Card strutturata */}
                      <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                        <Label className="text-sm font-medium">Ponteggi Elettrici</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Tipo sbarchi</Label>
                            <Select value={montacarichiTipoSbarchi} onValueChange={setMontacarichiTipoSbarchi}>
                              <SelectTrigger data-testid="select-montacarichi-tipo-sbarchi">
                                <SelectValue placeholder="Seleziona tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="SCORREVOLE_DX">Scorrevole ap. DX</SelectItem>
                                <SelectItem value="SCORREVOLE_SX">Scorrevole ap. SX</SelectItem>
                                <SelectItem value="SCORREVOLE_INDIFF">Scorrevole ap. indiff.</SelectItem>
                                <SelectItem value="ANTA">Ad anta</SelectItem>
                                <SelectItem value="SOFFIETTO">A soffietto</SelectItem>
                                <SelectItem value="INDIFFERENTE">Indifferente</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Ruote per movimentazione</Label>
                            <Select value={montacarichiRuote} onValueChange={setMontacarichiRuote}>
                              <SelectTrigger data-testid="select-montacarichi-ruote">
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NO">NO</SelectItem>
                                <SelectItem value="SI_NOSTRO">Sì a carico nostro</SelectItem>
                                <SelectItem value="SI_CLIENTE">Sì a carico cliente</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Traliccio</Label>
                            <Select value={montacarichiTraliccio} onValueChange={setMontacarichiTraliccio}>
                              <SelectTrigger data-testid="select-montacarichi-traliccio">
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DESTRA">Destra</SelectItem>
                                <SelectItem value="SINISTRA">Sinistra</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">3° sponda</Label>
                            <Select value={montacarichiTerzaSponda} onValueChange={setMontacarichiTerzaSponda}>
                              <SelectTrigger data-testid="select-montacarichi-terza-sponda">
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NO">NO</SelectItem>
                                <SelectItem value="SI_NOSTRO">Sì a carico nostro</SelectItem>
                                <SelectItem value="SI_CLIENTE">Sì a carico cliente</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-xs text-muted-foreground">Altro</Label>
                            <Input
                              type="text"
                              value={montacarichiAltro}
                              onChange={(e) => setMontacarichiAltro(e.target.value)}
                              placeholder="Note aggiuntive..."
                              data-testid="input-montacarichi-altro"
                            />
                          </div>
                        </div>
                      </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Clausole e Note */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Clausole e Note del Preventivo
                </CardTitle>
                <CardDescription>
                  Seleziona le voci da includere nel preventivo. Le voci evidenziate in verde sono attivate automaticamente in base ai materiali selezionati.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Categoria: Descrizione Installazione */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="font-semibold">Descrizione Installazione</h3>
                    <Badge variant="secondary" className="ml-auto">
                      {installazioneClausesDef.filter(c => c.condition(clauseContext)).length} attive
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    {installazioneClausesDef.map((clause) => {
                      const isActive = clause.condition(clauseContext);
                      const selection = clauseSelections[clause.id] || { selected: false, text: clause.defaultText };
                      const isEditing = editingItemId === `clause-${clause.id}`;
                      
                      return (
                        <div 
                          key={clause.id}
                          className={`border rounded-md px-3 py-2 transition-colors ${
                            isActive 
                              ? selection.selected 
                                ? 'border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-950/30'
                                : 'border-border bg-background'
                              : 'border-muted bg-muted/20 opacity-50'
                          }`}
                          data-testid={`clause-item-${clause.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id={`clause-${clause.id}`}
                              checked={selection.selected}
                              disabled={!isActive}
                              onCheckedChange={() => {
                                if (isActive) {
                                  toggleClause(clause.id);
                                }
                              }}
                              className={`mt-0.5 flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}
                              data-testid={`checkbox-clause-${clause.id}`}
                            />
                            {isEditing ? (
                              <textarea
                                value={selection.text}
                                onChange={(e) => updateClauseText(clause.id, e.target.value)}
                                onBlur={() => setEditingItemId(null)}
                                autoFocus
                                rows={Math.max(2, Math.ceil(selection.text.length / 100))}
                                className="flex-1 text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-foreground resize-none leading-tight"
                                data-testid={`input-clause-${clause.id}`}
                              />
                            ) : (
                              <span 
                                className={`flex-1 text-sm leading-tight ${
                                  selection.selected 
                                    ? 'text-foreground font-medium' 
                                    : isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'
                                }`}
                              >
                                {selection.text}
                              </span>
                            )}
                            {selection.selected && isActive && !isEditing && (
                              <button
                                type="button"
                                onClick={() => setEditingItemId(`clause-${clause.id}`)}
                                className="flex-shrink-0 p-1 rounded hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                                data-testid={`edit-clause-${clause.id}`}
                              >
                                <Edit2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Campo libero personalizzabile */}
                    <div className="border rounded-md px-3 py-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/20">
                      <div className="flex items-start gap-2">
                        <Plus className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                        <textarea
                          value={campoLiberoInstallazione}
                          onChange={(e) => setCampoLiberoInstallazione(e.target.value)}
                          onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                          placeholder="Nota personalizzata..."
                          rows={1}
                          className="w-full text-sm resize-none border-0 bg-transparent p-0 focus:outline-none focus:ring-0 overflow-hidden"
                          style={{ minHeight: '28px' }}
                          data-testid="textarea-campo-libero-installazione"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Categoria: Servizi Opzionali */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30">
                      <Settings className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="font-semibold">Altri Servizi Opzionali (Non Compresi nel Prezzo Totale)</h3>
                    <Badge variant="secondary" className="ml-auto">
                      {Object.values(optionalServices).filter(Boolean).length} selezionati
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seleziona i servizi opzionali da includere nel preventivo. I prezzi con trasferta variano in base alla distanza del cantiere ({distanceKm} km).
                  </p>
                  
                  <div className="space-y-1">
                    {dynamicServicesDef.map((service) => {
                      const price = getDynamicServicePrice(service);
                      const isSelected = optionalServices[service.id] || false;
                      const hasPrice = price > 0;
                      const serviceText = optionalServicesTexts[service.id] || service.label;
                      const isEditing = editingItemId === `service-${service.id}`;
                      
                      return (
                        <div 
                          key={service.id}
                          className={`border rounded-md px-3 py-2 transition-colors ${
                            isSelected 
                              ? 'border-purple-300 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-950/30'
                              : 'border-border bg-background'
                          }`}
                          data-testid={`optional-service-${service.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`service-${service.id}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleOptionalService(service.id)}
                              className="flex-shrink-0"
                              data-testid={`checkbox-service-${service.id}`}
                            />
                            {isEditing ? (
                              <textarea
                                value={serviceText}
                                onChange={(e) => updateOptionalServiceText(service.id, e.target.value)}
                                onBlur={() => setEditingItemId(null)}
                                autoFocus
                                rows={Math.max(1, Math.ceil(serviceText.length / 80))}
                                className="flex-1 text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-foreground resize-none leading-tight"
                                data-testid={`input-service-${service.id}`}
                              />
                            ) : (
                              <label 
                                htmlFor={`service-${service.id}`}
                                className={`flex-1 text-sm cursor-pointer ${
                                  isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'
                                }`}
                              >
                                {serviceText}
                              </label>
                            )}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {hasPrice && price > 0 ? (
                                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                                  € {formatCurrency(price)}
                                </span>
                              ) : null}
                              <span className="text-xs text-muted-foreground">
                                {service.unit}
                              </span>
                              {service.applyTrasferta && trasfertaDistanceKm >= 70 && (
                                <Badge variant="outline" className="text-xs py-0 px-1">
                                  +{Math.round((getTrasfertaMultiplier(trasfertaDistanceKm) - 1) * 100)}%
                                </Badge>
                              )}
                              {isSelected && !isEditing && (
                                <button
                                  type="button"
                                  onClick={() => setEditingItemId(`service-${service.id}`)}
                                  className="p-1 rounded hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                                  data-testid={`edit-service-${service.id}`}
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="border rounded-md px-3 py-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/30 dark:bg-purple-950/20">
                      <div className="flex items-start gap-2">
                        <Plus className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
                        <textarea
                          value={campoLiberoServizi}
                          onChange={(e) => setCampoLiberoServizi(e.target.value)}
                          onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                          placeholder="Nota personalizzata servizi opzionali..."
                          rows={1}
                          className="w-full text-sm resize-none border-0 bg-transparent p-0 focus:outline-none focus:ring-0 overflow-hidden"
                          style={{ minHeight: '28px' }}
                          data-testid="textarea-campo-libero-servizi"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Categoria: Clausole Legali / Note Bene */}
                <CollapsibleSection
                  title="Clausole Legali / Note Bene"
                  icon={<AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
                  iconBg="bg-red-100 dark:bg-red-900/30"
                  defaultOpen={true}
                  testId="section-clausole-legali"
                >
                  <div className="space-y-1">
                    {notaBeneClauses.map((clause) => {
                      const isActive = clause.condition(clauseContext);
                      const selection = clauseSelections[clause.id] || { selected: false, text: clause.defaultText };
                      const isEditing = editingItemId === `notabene-${clause.id}`;
                      
                      return (
                        <div 
                          key={clause.id}
                          className={`border rounded-md px-3 py-2 transition-colors ${
                            isActive 
                              ? selection.selected 
                                ? 'border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-950/30'
                                : 'border-border bg-background'
                              : 'border-muted bg-muted/20 opacity-50'
                          }`}
                          data-testid={`notabene-item-${clause.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id={`notabene-${clause.id}`}
                              checked={selection.selected}
                              disabled={!isActive}
                              onCheckedChange={() => {
                                if (isActive) {
                                  toggleClause(clause.id);
                                }
                              }}
                              className={`mt-0.5 flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}
                              data-testid={`checkbox-notabene-${clause.id}`}
                            />
                            {isEditing ? (
                              <textarea
                                value={selection.text}
                                onChange={(e) => updateClauseText(clause.id, e.target.value)}
                                onBlur={() => setEditingItemId(null)}
                                autoFocus
                                rows={Math.max(2, Math.ceil(selection.text.length / 100))}
                                className="flex-1 text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-foreground resize-none leading-tight"
                                data-testid={`input-notabene-${clause.id}`}
                              />
                            ) : (
                              <span className={`flex-1 text-sm leading-tight ${
                                selection.selected 
                                  ? 'text-foreground font-medium' 
                                  : isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'
                              }`}>
                                {selection.text}
                              </span>
                            )}
                            {selection.selected && isActive && !isEditing && (
                              <button
                                type="button"
                                onClick={() => setEditingItemId(`notabene-${clause.id}`)}
                                className="flex-shrink-0 p-1 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                                data-testid={`edit-notabene-${clause.id}`}
                              >
                                <Edit2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="border rounded-md px-3 py-2 border-dashed border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/20">
                      <div className="flex items-start gap-2">
                        <Plus className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />
                        <textarea
                          value={campoLiberoClausole}
                          onChange={(e) => setCampoLiberoClausole(e.target.value)}
                          onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                          placeholder="Nota personalizzata clausole/note bene..."
                          rows={1}
                          className="w-full text-sm resize-none border-0 bg-transparent p-0 focus:outline-none focus:ring-0 overflow-hidden"
                          style={{ minHeight: '28px' }}
                          data-testid="textarea-campo-libero-clausole"
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>

              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 5: Revisione & Sconti - MODALITA' PHASES / A CORPO */}
        {currentStep === 5 && isPhaseLikeMode && phasesPreviewResult && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  {quoteMode === 'a_corpo' ? 'Riepilogo Preventivo A corpo' : 'Riepilogo Preventivo Multi-Fase'}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                  <span>Distanza: {distanceKm} km{quoteMode !== 'a_corpo' ? ` | ${phasesPreviewResult?.fasiResults?.length || 0} ${(phasesPreviewResult?.fasiResults?.length || 0) === 1 ? 'fase' : 'fasi'}` : ''}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Sezione DOCUMENTI (comune a tutte le fasi) */}
                {phasesPreviewResult?.documenti && phasesPreviewResult.documenti.items?.length > 0 && (
                  <div className="border rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        Documenti (comune)
                      </h3>
                      <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                        €{formatCurrency(phasesAdjustedTotals.documentiTotal)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {phasesPreviewResult.documenti.items.map((item: any, idx: number) => {
                        const key = `DOCUMENTI:${idx}`;
                        if (deletedPhaseItems.has(key)) return null;
                        const override = phaseItemAmountOverrides.get(key);
                        const discount = phaseItemDiscounts.get(key) || 0;
                        const basePrice = override !== null && override !== undefined ? override : item.totalRow;
                        const finalPrice = round2(basePrice * (1 - discount / 100));
                        return (
                          <div key={idx} className="flex items-center justify-between text-sm py-1.5 border-b border-purple-200/50 dark:border-purple-800/50 last:border-0">
                            <span className="font-medium flex-1 min-w-0 truncate">{item.articleName}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">€</span>
                                <NumericInput
                                  className="w-28 h-7 text-xs"
                                  value={override !== null && override !== undefined ? override : round2(item.totalRow)}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                    setPhaseItemAmountOverrides(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(key, val);
                                      return newMap;
                                    });
                                  }}
                                  data-testid={`input-documenti-price-${idx}`}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <NumericInput
                                  className="w-14 h-7 text-xs"
                                  placeholder="%"
                                  value={discount || ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setPhaseItemDiscounts(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(key, Math.min(100, Math.max(0, val)));
                                      return newMap;
                                    });
                                  }}
                                  data-testid={`input-documenti-discount-${idx}`}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                              {(() => {
                                const vatKey = `DOCUMENTI:${idx}`;
                                const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                return (
                                  <Select value={itemVat} onValueChange={(v) => { const newMap = new Map(phaseItemVatOverrides); if (v === vatRateDefault) { newMap.delete(vatKey); } else { newMap.set(vatKey, v as VatRate); } setPhaseItemVatOverrides(newMap); }}>
                                    <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-documenti-vat-${idx}`}>
                                      <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="22">22%</SelectItem>
                                      <SelectItem value="10">10%</SelectItem>
                                      <SelectItem value="4">4%</SelectItem>
                                      <SelectItem value="RC">RC</SelectItem>
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                              {confirmDeleteKey === key ? (
                                <div className="flex items-center gap-1 ml-1">
                                  <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }} data-testid={`button-confirm-delete-phase-${key}`}><Check className="w-3 h-3" /></Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)} data-testid={`button-cancel-delete-phase-${key}`}><X className="w-3 h-3" /></Button>
                                </div>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)} data-testid={`button-delete-phase-item-${key}`}><X className="w-3.5 h-3.5" /></Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Sezioni per ogni FASE */}
                {phasesPreviewResult?.fasiResults?.map((fase: any) => (
                  <div key={fase.id} className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-xl flex items-center gap-2">
                        <Badge variant="secondary" className="text-base px-3 py-1">
                          {fasi[fase.faseIndex]?.customLabel?.trim() || (quoteMode === 'a_corpo' ? 'A corpo' : `Fase ${fase.faseIndex + 1}`)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          ({fase.durationMonths} {fase.durationMonths === 1 ? 'mese' : 'mesi'})
                        </span>
                      </h3>
                      <span className="font-mono font-bold text-lg text-primary">
                        €{formatCurrency(phasesAdjustedTotals.fasiTotals.find(f => f.faseIndex === fase.faseIndex)?.total || fase.faseTotal)}
                      </span>
                    </div>
                    <div className="space-y-4">
                      {/* Trasporto Andata */}
                      {(() => {
                        const andataFurgoneItems = fase.trasportoAndata.items.filter((_: any, tIdx: number) => (fasi[fase.faseIndex]?.transportItems || [])[tIdx]?.andataEnabled !== false);
                        const faseVtAndata = phasesLagunariData.get(fase.faseIndex);
                        const lagAndataItems = faseVtAndata ? buildLagunariAndataItems(faseVtAndata, `f${fase.faseIndex}:`) : [];
                        const lagAndataVisible = lagAndataItems.filter(li => !deletedLagunariItems.has(li.key));
                        const lagAndataSubtotal = lagAndataVisible.reduce((s, li) => s + getLagunariItemEffective(li), 0);
                        if (andataFurgoneItems.length === 0 && lagAndataVisible.length === 0) return null;
                        return (
                        <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium flex items-center gap-2">
                              <Truck className="w-4 h-4 text-blue-600" />
                              Trasporto Andata
                            </span>
                            <span className="font-mono font-semibold">€{formatCurrency(getPhasesSectionSubtotal(fase.faseIndex, 'TRASPORTO_ANDATA', fase.trasportoAndata.items) + lagAndataSubtotal)}</span>
                          </div>
                          {fase.trasportoAndata.items.map((item: any, idx: number) => {
                            const key = `${fase.faseIndex}:TRASPORTO_ANDATA:${idx}`;
                            if (deletedPhaseItems.has(key)) return null;
                            const override = phaseItemAmountOverrides.get(key);
                            const discount = phaseItemDiscounts.get(key) || 0;
                            const basePrice = override !== null && override !== undefined ? override : item.totalRow;
                            const finalPrice = round2(basePrice * (1 - discount / 100));
                            return (
                              <div key={idx} className="pl-6 py-1.5 border-b border-blue-100 dark:border-blue-900 last:border-0">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="flex-1 min-w-0 truncate">{item.articleName}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <NumericInput
                                        className="w-28 h-7 text-xs"
                                        value={override !== null && override !== undefined ? override : round2(item.totalRow)}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          setPhaseItemAmountOverrides(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, val);
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-trasporto-andata-price-${idx}`}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={discount || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPhaseItemDiscounts(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, Math.min(100, Math.max(0, val)));
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-trasporto-andata-discount-${idx}`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    {(() => {
                                      const vatKey = `${fase.faseIndex}:TRASPORTO_ANDATA:${idx}`;
                                      const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                      const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                      return (
                                        <Select value={itemVat} onValueChange={(v) => { const newMap = new Map(phaseItemVatOverrides); if (v === vatRateDefault) { newMap.delete(vatKey); } else { newMap.set(vatKey, v as VatRate); } setPhaseItemVatOverrides(newMap); }}>
                                          <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-phase-${fase.faseIndex}-trasporto-andata-vat-${idx}`}>
                                            <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="22">22%</SelectItem>
                                            <SelectItem value="10">10%</SelectItem>
                                            <SelectItem value="4">4%</SelectItem>
                                            <SelectItem value="RC">RC</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                    {confirmDeleteKey === key ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ) : (
                                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)}><X className="w-3.5 h-3.5" /></Button>
                                    )}
                                  </div>
                                </div>
                                {item.calculationDetail?.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.calculationDetail.description}</p>
                                )}
                              </div>
                            );
                          })}
                          {lagAndataItems.map((lagItem) => {
                            if (deletedLagunariItems.has(lagItem.key)) return null;
                            const lagOverride = lagunariAmountOverrides.get(lagItem.key);
                            const lagDiscount = lagunariDiscounts.get(lagItem.key) || 0;
                            const lagBase = lagOverride !== null && lagOverride !== undefined ? lagOverride : lagItem.total;
                            return (
                              <div key={`lag-${lagItem.key}`} className="pl-6 py-1.5 border-b border-blue-100 dark:border-blue-900 last:border-0">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="flex-1 min-w-0 truncate flex items-center gap-1">
                                    <Ship className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                    {lagItem.label}
                                  </span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <NumericInput
                                        className="w-28 h-7 text-xs"
                                        value={lagOverride !== null && lagOverride !== undefined ? lagOverride : round2(lagItem.total)}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          setLagunariAmountOverrides(prev => { const m = new Map(prev); m.set(lagItem.key, val); return m; });
                                        }}
                                        data-testid={`input-lagunari-price-${lagItem.key}`}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={lagDiscount || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setLagunariDiscounts(prev => { const m = new Map(prev); m.set(lagItem.key, Math.min(100, Math.max(0, val))); return m; });
                                        }}
                                        data-testid={`input-lagunari-discount-${lagItem.key}`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    {(() => {
                                      const lagVat = lagunariVatOverrides.get(lagItem.key) || vatRateDefault;
                                      const isLagVatOverridden = lagunariVatOverrides.has(lagItem.key);
                                      return (
                                        <Select value={lagVat} onValueChange={(v) => { const m = new Map(lagunariVatOverrides); if (v === vatRateDefault) { m.delete(lagItem.key); } else { m.set(lagItem.key, v as VatRate); } setLagunariVatOverrides(m); }}>
                                          <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isLagVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-lagunari-vat-${lagItem.key}`}>
                                            <SelectValue>{lagVat === "RC" ? "RC" : `${lagVat}%`}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="22">22%</SelectItem>
                                            <SelectItem value="10">10%</SelectItem>
                                            <SelectItem value="4">4%</SelectItem>
                                            <SelectItem value="RC">RC</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                    {confirmDeleteKey === `lag:${lagItem.key}` ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedLagunariItems(prev => { const s = new Set(prev); s.add(lagItem.key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ) : (
                                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(`lag:${lagItem.key}`)}><X className="w-3.5 h-3.5" /></Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        );
                      })()}
                      {/* Costo Magazzino */}
                      {fase.costoMagazzino.items.length > 0 && (
                        <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium flex items-center gap-2">
                              <Package className="w-4 h-4 text-amber-600" />
                              Costo Magazzino
                            </span>
                            <span className="font-mono font-semibold">€{formatCurrency(getPhasesSectionSubtotal(fase.faseIndex, 'MOVIMENTAZIONE_MAGAZZINO', fase.costoMagazzino.items))}</span>
                          </div>
                          {fase.costoMagazzino.items.map((item: any, idx: number) => {
                            const key = `${fase.faseIndex}:MOVIMENTAZIONE_MAGAZZINO:${idx}`;
                            if (deletedPhaseItems.has(key)) return null;
                            const override = phaseItemAmountOverrides.get(key);
                            const discount = phaseItemDiscounts.get(key) || 0;
                            const basePrice = override !== null && override !== undefined ? override : item.totalRow;
                            const finalPrice = round2(basePrice * (1 - discount / 100));
                            return (
                              <div key={idx} className="pl-6 py-1.5 border-b border-amber-100 dark:border-amber-900 last:border-0">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="flex-1 min-w-0 truncate">{item.articleName}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <NumericInput
                                        className="w-28 h-7 text-xs"
                                        value={override !== null && override !== undefined ? override : round2(item.totalRow)}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          setPhaseItemAmountOverrides(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, val);
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-magazzino-price-${idx}`}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={discount || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPhaseItemDiscounts(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, Math.min(100, Math.max(0, val)));
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-magazzino-discount-${idx}`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    {(() => {
                                      const vatKey = `${fase.faseIndex}:MOVIMENTAZIONE_MAGAZZINO:${idx}`;
                                      const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                      const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                      return (
                                        <Select value={itemVat} onValueChange={(v) => { const newMap = new Map(phaseItemVatOverrides); if (v === vatRateDefault) { newMap.delete(vatKey); } else { newMap.set(vatKey, v as VatRate); } setPhaseItemVatOverrides(newMap); }}>
                                          <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-phase-${fase.faseIndex}-magazzino-vat-${idx}`}>
                                            <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="22">22%</SelectItem>
                                            <SelectItem value="10">10%</SelectItem>
                                            <SelectItem value="4">4%</SelectItem>
                                            <SelectItem value="RC">RC</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                    {confirmDeleteKey === key ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ) : (
                                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)}><X className="w-3.5 h-3.5" /></Button>
                                    )}
                                  </div>
                                </div>
                                {item.calculationDetail?.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.calculationDetail.description}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Montaggio (include movimentazione montaggio) - sempre visibile per righe manuali */}
                        <div className="border rounded-lg p-3 bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium flex items-center gap-2">
                              <Wrench className="w-4 h-4 text-green-600" />
                              Montaggio
                            </span>
                            <span className="font-mono font-semibold">
                              €{formatCurrency(getPhasesSectionSubtotal(fase.faseIndex, 'MONTAGGIO', fase.montaggio.items) + (fase.handling?.breakdown?.zones ? getHandlingSubtotal(fase.faseIndex, fase.handling.breakdown.zones, 'mount', fase) : 0) + (phasesTrasfertaInfo.get(fase.faseIndex)?.costoMontaggioTrasferta || 0) + (phasesVeneziaInfo.get(fase.faseIndex)?.costoMontaggioVenezia || 0) + getPhaseManualRowsSubtotal(fase.faseIndex, 'montaggio'))}
                            </span>
                          </div>
                          {fase.montaggio.items.map((item: any, idx: number) => {
                            const key = `${fase.faseIndex}:MONTAGGIO:${idx}`;
                            if (deletedPhaseItems.has(key)) return null;
                            const override = phaseItemAmountOverrides.get(key);
                            const phaseUpOverride = phaseUnitPriceOverrides.get(key);
                            const discount = phaseItemDiscounts.get(key) || 0;
                            const totalAfterUp = phaseUpOverride !== null && phaseUpOverride !== undefined ? phaseUpOverride * item.quantity : item.totalRow;
                            const basePrice = override !== null && override !== undefined ? override : totalAfterUp;
                            const finalPrice = round2(basePrice * (1 - discount / 100));
                            const hasAmountOverride = override !== null && override !== undefined;
                            const hasPhaseUnitPriceOverride = phaseUpOverride !== null && phaseUpOverride !== undefined;
                            const faseTrasferta = phasesTrasfertaInfo.get(fase.faseIndex);
                            const trasfertaItem = faseTrasferta?.distribuzioneMontaggioItems.get(idx);
                            const showTrasferta = faseTrasferta?.fascia !== 'nessuna' && trasfertaItem && item.quantity > 0;
                            const faseDifficulty = phasesDifficultyInfo.get(fase.faseIndex);
                            const difficultyItem = faseDifficulty?.distribuzioneMontaggioItems.get(idx);
                            const showDifficulty = (faseDifficulty?.totale || 0) > 0 && difficultyItem && item.quantity > 0;
                            const faseVeneziaData = phasesVeneziaInfo.get(fase.faseIndex);
                            const veneziaItemData = faseVeneziaData?.distribuzioneMontaggioItems.get(idx);
                            const showVenezia = (faseVeneziaData?.costoMontaggioVenezia || 0) > 0 && veneziaItemData && item.quantity > 0;
                            const actualTotal = override !== null && override !== undefined ? override : totalAfterUp;
                            const baseUnitPrice = item.quantity > 0 ? actualTotal / item.quantity : 0;
                            const trasfertaPerUnit = trasfertaItem && item.quantity > 0 ? trasfertaItem.quotaTrasferta / item.quantity : 0;
                            const difficultyPerUnit = difficultyItem && item.quantity > 0 ? difficultyItem.quotaDifficolta / item.quantity : 0;
                            const veneziaPerUnit = veneziaItemData && item.quantity > 0 ? veneziaItemData.quotaVenezia / item.quantity : 0;
                            const quotaTrasferta = showTrasferta ? (trasfertaItem?.quotaTrasferta || 0) : 0;
                            const quotaDifficolta = showDifficulty ? (difficultyItem?.quotaDifficolta || 0) : 0;
                            const quotaVeneziaVal = showVenezia ? (veneziaItemData?.quotaVenezia || 0) : 0;
                            const quotaExtra = quotaTrasferta + quotaDifficolta + quotaVeneziaVal;
                            const inputValueItem = (override !== null && override !== undefined ? override : totalAfterUp) + quotaExtra;
                            return (
                              <div key={idx} className="pl-6 py-1.5 border-b border-green-100 dark:border-green-900 last:border-0">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <div className="flex-1 min-w-0">
                                    <span className="truncate">{item.articleName}</span>
                                    {hasAmountOverride && (
                                      <p className="text-xs text-orange-600 dark:text-orange-400">
                                        Originale: €{formatCurrency(item.totalRow)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {(showTrasferta || showDifficulty) && item.quantity > 0 && (
                                      <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded">
                                        <div className="text-center" title="Costo unitario base">
                                          <span className="text-muted-foreground block text-[10px]">€/unità</span>
                                          <span className="font-mono">€{baseUnitPrice.toFixed(2)}</span>
                                        </div>
                                        {trasfertaItem && showTrasferta && (
                                          <div className="text-center" title="Quota trasferta per unità">
                                            <span className="text-muted-foreground block text-[10px]">+Trasf./u</span>
                                            <span className="font-mono text-blue-600 dark:text-blue-400">€{trasfertaPerUnit.toFixed(2)}</span>
                                          </div>
                                        )}
                                        {difficultyItem && showDifficulty && (
                                          <div className="text-center" title="Quota difficoltà per unità">
                                            <span className="text-muted-foreground block text-[10px]">+Diff./u</span>
                                            <span className="font-mono text-amber-600 dark:text-amber-400">€{difficultyPerUnit.toFixed(2)}</span>
                                          </div>
                                        )}
                                        {(trasfertaItem || difficultyItem) && (
                                          <div className="text-center" title="Costo unitario rettificato (base + extra)">
                                            <span className="text-muted-foreground block text-[10px]">€/u rett.</span>
                                            <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">€{(baseUnitPrice + trasfertaPerUnit + difficultyPerUnit).toFixed(2)}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {item.quantity > 0 && (() => {
                                      const extraPerUnit = item.quantity > 0 ? quotaExtra / item.quantity : 0;
                                      const baseUnitPriceDisplay = hasPhaseUnitPriceOverride ? phaseUpOverride : item.unitPrice;
                                      const rettificatoPerUnit = baseUnitPriceDisplay + extraPerUnit;
                                      return (
                                      <div className="flex items-center gap-1 relative">
                                        <span className="text-xs text-muted-foreground">€/u</span>
                                        <div className="relative">
                                          <NumericInput
                                            value={baseUnitPriceDisplay}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value);
                                              if (isNaN(val)) return;
                                              setPhaseUnitPriceOverrides(prev => {
                                                const newMap = new Map(prev);
                                                const refPrice = item.quantity > 0 ? item.totalRow / item.quantity : item.unitPrice;
                                                if (Math.abs(val - refPrice) < 0.001) {
                                                  newMap.delete(key);
                                                } else {
                                                  newMap.set(key, val);
                                                }
                                                return newMap;
                                              });
                                            }}
                                            className={`w-20 h-7 text-xs ${hasPhaseUnitPriceOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                            data-testid={`input-phase-${fase.faseIndex}-montaggio-unitprice-${idx}`}
                                          />
                                          {extraPerUnit > 0 && (
                                            <span className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-muted-foreground font-mono whitespace-nowrap">rett. €{rettificatoPerUnit.toFixed(2)}/u</span>
                                          )}
                                        </div>
                                      </div>
                                      );
                                    })()}
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <div className="relative">
                                        <NumericInput
                                          className={`w-28 h-7 text-xs ${hasAmountOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                          value={Math.round(inputValueItem * 100) / 100}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            if (isNaN(val)) return;
                                            const subtotaleBase = val - quotaExtra;
                                            if (Math.abs(subtotaleBase - item.totalRow) < 0.01) {
                                              setPhaseItemAmountOverrides(prev => {
                                                const newMap = new Map(prev);
                                                newMap.delete(key);
                                                return newMap;
                                              });
                                            } else {
                                              setPhaseItemAmountOverrides(prev => {
                                                const newMap = new Map(prev);
                                                newMap.set(key, Math.round(subtotaleBase * 100) / 100);
                                                return newMap;
                                              });
                                            }
                                          }}
                                          data-testid={`input-phase-${fase.faseIndex}-montaggio-price-${idx}`}
                                        />
                                        {quotaExtra > 0 && (
                                          <span className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-muted-foreground whitespace-nowrap">incl. trasferta</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={discount || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPhaseItemDiscounts(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, Math.min(100, Math.max(0, val)));
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-montaggio-discount-${idx}`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    {/* Badge IVA cliccabile - montaggio fasi */}
                                    {(() => {
                                      const vatKey = `${fase.faseIndex}:MONTAGGIO:${idx}`;
                                      const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                      const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                      return (
                                        <Select
                                          value={itemVat}
                                          onValueChange={(v) => {
                                            const newMap = new Map(phaseItemVatOverrides);
                                            if (v === vatRateDefault) {
                                              newMap.delete(vatKey);
                                            } else {
                                              newMap.set(vatKey, v as VatRate);
                                            }
                                            setPhaseItemVatOverrides(newMap);
                                          }}
                                        >
                                          <SelectTrigger 
                                            className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`}
                                            data-testid={`select-phase-${fase.faseIndex}-montaggio-vat-${idx}`}
                                          >
                                            <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="22">22%</SelectItem>
                                            <SelectItem value="10">10%</SelectItem>
                                            <SelectItem value="4">4%</SelectItem>
                                            <SelectItem value="RC">RC</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                    {confirmDeleteKey === key ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ) : (
                                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)}><X className="w-3.5 h-3.5" /></Button>
                                    )}
                                    {/* Mostra totale solo se c'è sconto o modifica prezzo */}
                                    {(discount > 0 || (override !== null && override !== undefined) || hasPhaseUnitPriceOverride) && (
                                      <span className="font-mono font-medium w-20 text-right">
                                        €{formatCurrency(round2((basePrice + quotaExtra) * (1 - discount / 100)))}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {item.calculationDetail?.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.calculationDetail.description}</p>
                                )}
                              </div>
                            );
                          })}
                          {/* Movimentazione Montaggio integrata */}
                          {fase.handling?.breakdown?.zones?.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                              <div className="flex items-center gap-2 mb-1">
                                <Package className="w-3 h-3 text-green-600" />
                                <span className="text-xs font-medium text-green-700 dark:text-green-300">Movimentazione Montaggio</span>
                              </div>
                              {fase.handling.breakdown.zones.map((zone: any, idx: number) => {
                                const key = `${fase.faseIndex}:HANDLING_MOUNT:${idx}`;
                                const override = phaseItemAmountOverrides.get(key);
                                const discount = phaseItemDiscounts.get(key) || 0;
                                const basePrice = override !== null && override !== undefined ? override : (zone.mountCost || 0);
                                const finalPrice = round2(basePrice * (1 - discount / 100));
                                return (
                                  <div key={idx} className="pl-4 py-1.5">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground flex-1 min-w-0 truncate">{zone.label} ({zone.type === "GROUND" ? "Terra" : "Quota"})</span>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-muted-foreground">€</span>
                                          <NumericInput
                                            className="w-28 h-7 text-xs"
                                            value={override !== null && override !== undefined ? override : (zone.mountCost || 0)}
                                            onChange={(e) => {
                                              const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                              setPhaseItemAmountOverrides(prev => {
                                                const newMap = new Map(prev);
                                                newMap.set(key, val);
                                                return newMap;
                                              });
                                            }}
                                            data-testid={`input-handling-mount-price-${fase.faseIndex}-${idx}`}
                                          />
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <NumericInput
                                            className="w-14 h-7 text-xs"
                                            placeholder="%"
                                            value={discount || ''}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value) || 0;
                                              setPhaseItemDiscounts(prev => {
                                                const newMap = new Map(prev);
                                                newMap.set(key, Math.min(100, Math.max(0, val)));
                                                return newMap;
                                              });
                                            }}
                                            data-testid={`input-handling-mount-discount-${fase.faseIndex}-${idx}`}
                                          />
                                          <span className="text-xs text-muted-foreground">%</span>
                                        </div>
                                        {(discount > 0 || (override !== null && override !== undefined)) && (
                                          <span className="font-mono font-medium w-24 text-right">
                                            €{formatCurrency(finalPrice)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {fase.handling.breakdown.saltareti && (
                                <div className="pl-4 py-1.5 flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">Saltareti ({fase.handling.breakdown.saltareti.quantity})</span>
                                  <span className="font-mono font-medium w-24 text-right">€{formatCurrency(fase.handling.breakdown.saltareti.total)}</span>
                                </div>
                              )}
                              {(fase.handling.extraPrice || 0) > 0 && (
                                <div className="pl-4 py-1.5 flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">Extra</span>
                                  <span className="font-mono font-medium w-24 text-right">€{formatCurrency(fase.handling.extraPrice)}</span>
                                </div>
                              )}
                              {(() => {
                                const mountTotal = getHandlingSubtotal(fase.faseIndex, fase.handling.breakdown.zones, 'mount', fase);
                                const mountGlobalDisc = phaseHandlingMountGlobalDiscount.get(fase.faseIndex) || 0;
                                const mountAfterDisc = mountTotal * (1 - mountGlobalDisc / 100);
                                return (
                                  <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-700 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-green-700 dark:text-green-300">Totale Mov. Montaggio</span>
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={mountGlobalDisc || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPhaseHandlingMountGlobalDiscount(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(fase.faseIndex, Math.min(100, Math.max(0, val)));
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-mov-mount-global-discount`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    <div className="text-right">
                                      {mountGlobalDisc > 0 ? (
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-muted-foreground line-through text-xs">€{formatCurrency(mountTotal)}</span>
                                          <span className="font-mono font-medium text-green-700 dark:text-green-300">€{formatCurrency(mountAfterDisc)}</span>
                                        </div>
                                      ) : (
                                        <span className="font-mono font-medium text-green-700 dark:text-green-300">€{formatCurrency(mountTotal)}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {/* Righe manuali Montaggio per questa fase */}
                          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-green-700 dark:text-green-300">Voci aggiuntive manuali</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => addPhaseManualRow(fase.faseIndex, 'montaggio')}
                                className="h-6 text-xs text-green-600 hover:text-green-700"
                                data-testid={`button-add-manual-montaggio-fase-${fase.faseIndex}`}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Aggiungi riga
                              </Button>
                            </div>
                            {getPhaseManualRows(fase.faseIndex, 'montaggio').map((row) => (
                              <div key={row.id} className="flex items-center gap-2 pl-4 py-1.5 text-sm">
                                <Input
                                  type="text"
                                  placeholder="Descrizione..."
                                  className="flex-1 h-7 text-xs"
                                  value={row.description}
                                  onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'montaggio', row.id, { description: e.target.value })}
                                  data-testid={`input-manual-montaggio-fase-${fase.faseIndex}-desc-${row.id}`}
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">€</span>
                                  <NumericInput
                                    className="w-28 h-7 text-xs"
                                    value={row.amount || ''}
                                    onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'montaggio', row.id, { amount: parseFloat(e.target.value) || 0 })}
                                    data-testid={`input-manual-montaggio-fase-${fase.faseIndex}-amount-${row.id}`}
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <NumericInput
                                    className="w-14 h-7 text-xs"
                                    placeholder="%"
                                    value={row.discountPercent || ''}
                                    onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'montaggio', row.id, { discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                    data-testid={`input-manual-montaggio-fase-${fase.faseIndex}-discount-${row.id}`}
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                                {row.discountPercent > 0 && (
                                  <span className="font-mono text-xs text-green-700 dark:text-green-400 min-w-16 text-right">
                                    €{formatCurrency(row.amount * (1 - row.discountPercent / 100))}
                                  </span>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removePhaseManualRow(fase.faseIndex, 'montaggio', row.id)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  data-testid={`button-remove-manual-montaggio-fase-${fase.faseIndex}-${row.id}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      {/* Smontaggio (include movimentazione smontaggio) - sempre visibile per righe manuali */}
                        <div className="border rounded-lg p-3 bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium flex items-center gap-2">
                              <Wrench className="w-4 h-4 text-orange-600" />
                              Smontaggio
                            </span>
                            <span className="font-mono font-semibold">
                              €{formatCurrency(getPhasesSectionSubtotal(fase.faseIndex, 'SMONTAGGIO', fase.smontaggio.items) + (fase.handling?.breakdown?.zones ? getHandlingSubtotal(fase.faseIndex, fase.handling.breakdown.zones, 'dismount', fase) : 0) + (phasesTrasfertaInfo.get(fase.faseIndex)?.costoSmontaggioTrasferta || 0) + (phasesVeneziaInfo.get(fase.faseIndex)?.costoSmontaggioVenezia || 0) + getPhaseManualRowsSubtotal(fase.faseIndex, 'smontaggio'))}
                            </span>
                          </div>
                          {fase.smontaggio.items.map((item: any, idx: number) => {
                            const key = `${fase.faseIndex}:SMONTAGGIO:${idx}`;
                            if (deletedPhaseItems.has(key)) return null;
                            const override = phaseItemAmountOverrides.get(key);
                            const phaseUpOverride = phaseUnitPriceOverrides.get(key);
                            const discount = phaseItemDiscounts.get(key) || 0;
                            const totalAfterUp = phaseUpOverride !== null && phaseUpOverride !== undefined ? phaseUpOverride * item.quantity : item.totalRow;
                            const basePrice = override !== null && override !== undefined ? override : totalAfterUp;
                            const finalPrice = round2(basePrice * (1 - discount / 100));
                            const hasAmountOverride = override !== null && override !== undefined;
                            const hasPhaseUnitPriceOverride = phaseUpOverride !== null && phaseUpOverride !== undefined;
                            const faseTrasferta = phasesTrasfertaInfo.get(fase.faseIndex);
                            const trasfertaItem = faseTrasferta?.distribuzioneSmontaggioItems.get(idx);
                            const showTrasferta = faseTrasferta?.fascia !== 'nessuna' && trasfertaItem && item.quantity > 0;
                            const faseDifficulty = phasesDifficultyInfo.get(fase.faseIndex);
                            const difficultyItem = faseDifficulty?.distribuzioneSmontaggioItems.get(idx);
                            const showDifficulty = (faseDifficulty?.totale || 0) > 0 && difficultyItem && item.quantity > 0;
                            const faseVeneziaData = phasesVeneziaInfo.get(fase.faseIndex);
                            const veneziaItemData = faseVeneziaData?.distribuzioneSmontaggioItems.get(idx);
                            const showVenezia = (faseVeneziaData?.costoSmontaggioVenezia || 0) > 0 && veneziaItemData && item.quantity > 0;
                            const actualTotal = override !== null && override !== undefined ? override : totalAfterUp;
                            const baseUnitPrice = item.quantity > 0 ? actualTotal / item.quantity : 0;
                            const trasfertaPerUnit = trasfertaItem && item.quantity > 0 ? trasfertaItem.quotaTrasferta / item.quantity : 0;
                            const difficultyPerUnit = difficultyItem && item.quantity > 0 ? difficultyItem.quotaDifficolta / item.quantity : 0;
                            const veneziaPerUnit = veneziaItemData && item.quantity > 0 ? veneziaItemData.quotaVenezia / item.quantity : 0;
                            const quotaTrasferta = showTrasferta ? (trasfertaItem?.quotaTrasferta || 0) : 0;
                            const quotaDifficolta = showDifficulty ? (difficultyItem?.quotaDifficolta || 0) : 0;
                            const quotaVeneziaVal = showVenezia ? (veneziaItemData?.quotaVenezia || 0) : 0;
                            const quotaExtra = quotaTrasferta + quotaDifficolta + quotaVeneziaVal;
                            const inputValueItem = (override !== null && override !== undefined ? override : totalAfterUp) + quotaExtra;
                            return (
                              <div key={idx} className="pl-6 py-1.5 border-b border-orange-100 dark:border-orange-900 last:border-0">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <div className="flex-1 min-w-0">
                                    <span className="truncate">{item.articleName}</span>
                                    {hasAmountOverride && (
                                      <p className="text-xs text-orange-600 dark:text-orange-400">
                                        Originale: €{formatCurrency(item.totalRow)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {(showTrasferta || showDifficulty) && item.quantity > 0 && (
                                      <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded">
                                        <div className="text-center" title="Costo unitario base">
                                          <span className="text-muted-foreground block text-[10px]">€/unità</span>
                                          <span className="font-mono">€{baseUnitPrice.toFixed(2)}</span>
                                        </div>
                                        {trasfertaItem && showTrasferta && (
                                          <div className="text-center" title="Quota trasferta per unità">
                                            <span className="text-muted-foreground block text-[10px]">+Trasf./u</span>
                                            <span className="font-mono text-blue-600 dark:text-blue-400">€{trasfertaPerUnit.toFixed(2)}</span>
                                          </div>
                                        )}
                                        {difficultyItem && showDifficulty && (
                                          <div className="text-center" title="Quota difficoltà per unità">
                                            <span className="text-muted-foreground block text-[10px]">+Diff./u</span>
                                            <span className="font-mono text-amber-600 dark:text-amber-400">€{difficultyPerUnit.toFixed(2)}</span>
                                          </div>
                                        )}
                                        {(trasfertaItem || difficultyItem) && (
                                          <div className="text-center" title="Costo unitario rettificato (base + extra)">
                                            <span className="text-muted-foreground block text-[10px]">€/u rett.</span>
                                            <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">€{(baseUnitPrice + trasfertaPerUnit + difficultyPerUnit).toFixed(2)}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {item.quantity > 0 && (() => {
                                      const extraPerUnit = item.quantity > 0 ? quotaExtra / item.quantity : 0;
                                      const baseUnitPriceDisplay = hasPhaseUnitPriceOverride ? phaseUpOverride : item.unitPrice;
                                      const rettificatoPerUnit = baseUnitPriceDisplay + extraPerUnit;
                                      return (
                                      <div className="flex items-center gap-1 relative">
                                        <span className="text-xs text-muted-foreground">€/u</span>
                                        <div className="relative">
                                          <NumericInput
                                            value={baseUnitPriceDisplay}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value);
                                              if (isNaN(val)) return;
                                              setPhaseUnitPriceOverrides(prev => {
                                                const newMap = new Map(prev);
                                                const refPrice = item.quantity > 0 ? item.totalRow / item.quantity : item.unitPrice;
                                                if (Math.abs(val - refPrice) < 0.001) {
                                                  newMap.delete(key);
                                                } else {
                                                  newMap.set(key, val);
                                                }
                                                return newMap;
                                              });
                                            }}
                                            className={`w-20 h-7 text-xs ${hasPhaseUnitPriceOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                            data-testid={`input-phase-${fase.faseIndex}-smontaggio-unitprice-${idx}`}
                                          />
                                          {extraPerUnit > 0 && (
                                            <span className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-muted-foreground font-mono whitespace-nowrap">rett. €{rettificatoPerUnit.toFixed(2)}/u</span>
                                          )}
                                        </div>
                                      </div>
                                      );
                                    })()}
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <div className="relative">
                                        <NumericInput
                                          className={`w-28 h-7 text-xs ${hasAmountOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                          value={Math.round(inputValueItem * 100) / 100}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            if (isNaN(val)) return;
                                            const subtotaleBase = val - quotaExtra;
                                            if (Math.abs(subtotaleBase - item.totalRow) < 0.01) {
                                              setPhaseItemAmountOverrides(prev => {
                                                const newMap = new Map(prev);
                                                newMap.delete(key);
                                                return newMap;
                                              });
                                            } else {
                                              setPhaseItemAmountOverrides(prev => {
                                                const newMap = new Map(prev);
                                                newMap.set(key, Math.round(subtotaleBase * 100) / 100);
                                                return newMap;
                                              });
                                            }
                                          }}
                                          data-testid={`input-phase-${fase.faseIndex}-smontaggio-price-${idx}`}
                                        />
                                        {quotaExtra > 0 && (
                                          <span className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-muted-foreground whitespace-nowrap">incl. trasferta</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={discount || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPhaseItemDiscounts(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, Math.min(100, Math.max(0, val)));
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-smontaggio-discount-${idx}`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    {/* Badge IVA cliccabile - smontaggio fasi */}
                                    {(() => {
                                      const vatKey = `${fase.faseIndex}:SMONTAGGIO:${idx}`;
                                      const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                      const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                      return (
                                        <Select
                                          value={itemVat}
                                          onValueChange={(v) => {
                                            const newMap = new Map(phaseItemVatOverrides);
                                            if (v === vatRateDefault) {
                                              newMap.delete(vatKey);
                                            } else {
                                              newMap.set(vatKey, v as VatRate);
                                            }
                                            setPhaseItemVatOverrides(newMap);
                                          }}
                                        >
                                          <SelectTrigger 
                                            className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`}
                                            data-testid={`select-phase-${fase.faseIndex}-smontaggio-vat-${idx}`}
                                          >
                                            <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="22">22%</SelectItem>
                                            <SelectItem value="10">10%</SelectItem>
                                            <SelectItem value="4">4%</SelectItem>
                                            <SelectItem value="RC">RC</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                    {confirmDeleteKey === key ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ) : (
                                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)}><X className="w-3.5 h-3.5" /></Button>
                                    )}
                                    {/* Mostra totale solo se c'è sconto o modifica prezzo */}
                                    {(discount > 0 || (override !== null && override !== undefined) || hasPhaseUnitPriceOverride) && (
                                      <span className="font-mono font-medium w-20 text-right">
                                        €{formatCurrency(round2((basePrice + quotaExtra) * (1 - discount / 100)))}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {item.calculationDetail?.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.calculationDetail.description}</p>
                                )}
                              </div>
                            );
                          })}
                          {/* Movimentazione Smontaggio integrata */}
                          {fase.handling?.breakdown?.zones?.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                              <div className="flex items-center gap-2 mb-1">
                                <Package className="w-3 h-3 text-orange-600" />
                                <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Movimentazione Smontaggio</span>
                              </div>
                              {fase.handling.breakdown.zones.map((zone: any, idx: number) => {
                                const key = `${fase.faseIndex}:HANDLING_DISMOUNT:${idx}`;
                                const override = phaseItemAmountOverrides.get(key);
                                const discount = phaseItemDiscounts.get(key) || 0;
                                const basePrice = override !== null && override !== undefined ? override : (zone.dismountCost || 0);
                                const finalPrice = round2(basePrice * (1 - discount / 100));
                                return (
                                  <div key={idx} className="pl-4 py-1.5">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground flex-1 min-w-0 truncate">{zone.label} ({zone.type === "GROUND" ? "Terra" : "Quota"})</span>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-muted-foreground">€</span>
                                          <NumericInput
                                            className="w-28 h-7 text-xs"
                                            value={override !== null && override !== undefined ? override : (zone.dismountCost || 0)}
                                            onChange={(e) => {
                                              const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                              setPhaseItemAmountOverrides(prev => {
                                                const newMap = new Map(prev);
                                                newMap.set(key, val);
                                                return newMap;
                                              });
                                            }}
                                            data-testid={`input-handling-dismount-price-${fase.faseIndex}-${idx}`}
                                          />
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <NumericInput
                                            className="w-14 h-7 text-xs"
                                            placeholder="%"
                                            value={discount || ''}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value) || 0;
                                              setPhaseItemDiscounts(prev => {
                                                const newMap = new Map(prev);
                                                newMap.set(key, Math.min(100, Math.max(0, val)));
                                                return newMap;
                                              });
                                            }}
                                            data-testid={`input-handling-dismount-discount-${fase.faseIndex}-${idx}`}
                                          />
                                          <span className="text-xs text-muted-foreground">%</span>
                                        </div>
                                        {(discount > 0 || (override !== null && override !== undefined)) && (
                                          <span className="font-mono font-medium w-24 text-right">
                                            €{formatCurrency(finalPrice)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {fase.handling.breakdown.saltareti && (
                                <div className="pl-4 py-1.5 flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">Saltareti ({fase.handling.breakdown.saltareti.quantity})</span>
                                  <span className="font-mono font-medium w-24 text-right">€{formatCurrency(fase.handling.breakdown.saltareti.total)}</span>
                                </div>
                              )}
                              {(() => {
                                const dismountTotal = getHandlingSubtotal(fase.faseIndex, fase.handling.breakdown.zones, 'dismount', fase);
                                const dismountGlobalDisc = phaseHandlingDismountGlobalDiscount.get(fase.faseIndex) || 0;
                                const dismountAfterDisc = dismountTotal * (1 - dismountGlobalDisc / 100);
                                return (
                                  <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-700 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Totale Mov. Smontaggio</span>
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={dismountGlobalDisc || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPhaseHandlingDismountGlobalDiscount(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(fase.faseIndex, Math.min(100, Math.max(0, val)));
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-mov-dismount-global-discount`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    <div className="text-right">
                                      {dismountGlobalDisc > 0 ? (
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-muted-foreground line-through text-xs">€{formatCurrency(dismountTotal)}</span>
                                          <span className="font-mono font-medium text-orange-700 dark:text-orange-300">€{formatCurrency(dismountAfterDisc)}</span>
                                        </div>
                                      ) : (
                                        <span className="font-mono font-medium text-orange-700 dark:text-orange-300">€{formatCurrency(dismountTotal)}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {/* Righe manuali Smontaggio per questa fase */}
                          <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Voci aggiuntive manuali</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => addPhaseManualRow(fase.faseIndex, 'smontaggio')}
                                className="h-6 text-xs text-orange-600 hover:text-orange-700"
                                data-testid={`button-add-manual-smontaggio-fase-${fase.faseIndex}`}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Aggiungi riga
                              </Button>
                            </div>
                            {getPhaseManualRows(fase.faseIndex, 'smontaggio').map((row) => (
                              <div key={row.id} className="flex items-center gap-2 pl-4 py-1.5 text-sm">
                                <Input
                                  type="text"
                                  placeholder="Descrizione..."
                                  className="flex-1 h-7 text-xs"
                                  value={row.description}
                                  onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'smontaggio', row.id, { description: e.target.value })}
                                  data-testid={`input-manual-smontaggio-fase-${fase.faseIndex}-desc-${row.id}`}
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">€</span>
                                  <NumericInput
                                    className="w-28 h-7 text-xs"
                                    value={row.amount || ''}
                                    onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'smontaggio', row.id, { amount: parseFloat(e.target.value) || 0 })}
                                    data-testid={`input-manual-smontaggio-fase-${fase.faseIndex}-amount-${row.id}`}
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <NumericInput
                                    className="w-14 h-7 text-xs"
                                    placeholder="%"
                                    value={row.discountPercent || ''}
                                    onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'smontaggio', row.id, { discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                    data-testid={`input-manual-smontaggio-fase-${fase.faseIndex}-discount-${row.id}`}
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                                <span className="font-mono text-xs text-orange-700 dark:text-orange-400 w-20 text-right">
                                  €{formatCurrency(row.amount * (1 - row.discountPercent / 100))}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removePhaseManualRow(fase.faseIndex, 'smontaggio', row.id)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  data-testid={`button-remove-manual-smontaggio-fase-${fase.faseIndex}-${row.id}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      {/* Trasporto Ritorno */}
                      {(() => {
                        const ritornoFurgoneItems = fase.trasportoRitorno.items.filter((_: any, tIdx: number) => (fasi[fase.faseIndex]?.transportItems || [])[tIdx]?.ritornoEnabled !== false);
                        const faseVtRitorno = phasesLagunariData.get(fase.faseIndex);
                        const lagRitornoItems = faseVtRitorno ? buildLagunariRitornoItems(faseVtRitorno, `f${fase.faseIndex}:`) : [];
                        const lagRitornoVisible = lagRitornoItems.filter(li => !deletedLagunariItems.has(li.key));
                        const lagRitornoSubtotal = lagRitornoVisible.reduce((s, li) => s + getLagunariItemEffective(li), 0);
                        if (ritornoFurgoneItems.length === 0 && lagRitornoVisible.length === 0) return null;
                        return (
                        <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium flex items-center gap-2">
                              <Truck className="w-4 h-4 text-blue-600" />
                              Trasporto Ritorno
                            </span>
                            <span className="font-mono font-semibold">€{formatCurrency(getPhasesSectionSubtotal(fase.faseIndex, 'TRASPORTO_RITORNO', fase.trasportoRitorno.items) + lagRitornoSubtotal)}</span>
                          </div>
                          {fase.trasportoRitorno.items.map((item: any, idx: number) => {
                            const key = `${fase.faseIndex}:TRASPORTO_RITORNO:${idx}`;
                            if (deletedPhaseItems.has(key)) return null;
                            const override = phaseItemAmountOverrides.get(key);
                            const discount = phaseItemDiscounts.get(key) || 0;
                            const basePrice = override !== null && override !== undefined ? override : item.totalRow;
                            const finalPrice = round2(basePrice * (1 - discount / 100));
                            return (
                              <div key={idx} className="pl-6 py-1.5 border-b border-blue-100 dark:border-blue-900 last:border-0">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="flex-1 min-w-0 truncate">{item.articleName}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <NumericInput
                                        className="w-28 h-7 text-xs"
                                        value={override !== null && override !== undefined ? override : round2(item.totalRow)}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          setPhaseItemAmountOverrides(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, val);
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-trasporto-ritorno-price-${idx}`}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={discount || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPhaseItemDiscounts(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(key, Math.min(100, Math.max(0, val)));
                                            return newMap;
                                          });
                                        }}
                                        data-testid={`input-phase-${fase.faseIndex}-trasporto-ritorno-discount-${idx}`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    {(() => {
                                      const vatKey = `${fase.faseIndex}:TRASPORTO_RITORNO:${idx}`;
                                      const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                      const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                      return (
                                        <Select value={itemVat} onValueChange={(v) => { const newMap = new Map(phaseItemVatOverrides); if (v === vatRateDefault) { newMap.delete(vatKey); } else { newMap.set(vatKey, v as VatRate); } setPhaseItemVatOverrides(newMap); }}>
                                          <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-phase-${fase.faseIndex}-trasporto-ritorno-vat-${idx}`}>
                                            <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="22">22%</SelectItem>
                                            <SelectItem value="10">10%</SelectItem>
                                            <SelectItem value="4">4%</SelectItem>
                                            <SelectItem value="RC">RC</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                    {confirmDeleteKey === key ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ) : (
                                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)}><X className="w-3.5 h-3.5" /></Button>
                                    )}
                                  </div>
                                </div>
                                {item.calculationDetail?.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.calculationDetail.description}</p>
                                )}
                              </div>
                            );
                          })}
                          {lagRitornoItems.map((lagItem) => {
                            if (deletedLagunariItems.has(lagItem.key)) return null;
                            const lagOverride = lagunariAmountOverrides.get(lagItem.key);
                            const lagDiscount = lagunariDiscounts.get(lagItem.key) || 0;
                            const lagBase = lagOverride !== null && lagOverride !== undefined ? lagOverride : lagItem.total;
                            return (
                              <div key={`lag-${lagItem.key}`} className="pl-6 py-1.5 border-b border-blue-100 dark:border-blue-900 last:border-0">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="flex-1 min-w-0 truncate flex items-center gap-1">
                                    <Ship className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                    {lagItem.label}
                                  </span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <NumericInput
                                        className="w-28 h-7 text-xs"
                                        value={lagOverride !== null && lagOverride !== undefined ? lagOverride : round2(lagItem.total)}
                                        onChange={(e) => {
                                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                          setLagunariAmountOverrides(prev => { const m = new Map(prev); m.set(lagItem.key, val); return m; });
                                        }}
                                        data-testid={`input-lagunari-price-${lagItem.key}`}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <NumericInput
                                        className="w-14 h-7 text-xs"
                                        placeholder="%"
                                        value={lagDiscount || ''}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setLagunariDiscounts(prev => { const m = new Map(prev); m.set(lagItem.key, Math.min(100, Math.max(0, val))); return m; });
                                        }}
                                        data-testid={`input-lagunari-discount-${lagItem.key}`}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    {(() => {
                                      const lagVat = lagunariVatOverrides.get(lagItem.key) || vatRateDefault;
                                      const isLagVatOverridden = lagunariVatOverrides.has(lagItem.key);
                                      return (
                                        <Select value={lagVat} onValueChange={(v) => { const m = new Map(lagunariVatOverrides); if (v === vatRateDefault) { m.delete(lagItem.key); } else { m.set(lagItem.key, v as VatRate); } setLagunariVatOverrides(m); }}>
                                          <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isLagVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-lagunari-vat-${lagItem.key}`}>
                                            <SelectValue>{lagVat === "RC" ? "RC" : `${lagVat}%`}</SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="22">22%</SelectItem>
                                            <SelectItem value="10">10%</SelectItem>
                                            <SelectItem value="4">4%</SelectItem>
                                            <SelectItem value="RC">RC</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                    {confirmDeleteKey === `lag:${lagItem.key}` ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedLagunariItems(prev => { const s = new Set(prev); s.add(lagItem.key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    ) : (
                                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(`lag:${lagItem.key}`)}><X className="w-3.5 h-3.5" /></Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        );
                      })()}
                      {/* Noleggio + Fornitura (separati da pricingLogic SALE) */}
                      {(() => {
                        const allNoleggioItems = fase.noleggio.items as any[];
                        const saleIds = new Set((articles || []).filter((a: any) => a.pricingLogic === "SALE").map((a: any) => String(a.id)));
                        const noleggioOnly = allNoleggioItems.map((item: any, idx: number) => ({ item, originalIdx: idx })).filter(({ item }) => !saleIds.has(String(item.articleId)) && !item._fromFornitura);
                        const fornituraOnly = allNoleggioItems.map((item: any, idx: number) => ({ item, originalIdx: idx })).filter(({ item }) => saleIds.has(String(item.articleId)) || item._fromFornitura);
                        return (
                          <>
                            {(noleggioOnly.length > 0 || getPhaseManualRows(fase.faseIndex, 'noleggio').length > 0) && (
                              <div className="border rounded-lg p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-indigo-600" />
                                    Noleggio
                                  </span>
                                  <span className="font-mono font-semibold">€{formatCurrency(noleggioOnly.reduce((sum, { item, originalIdx }) => { const key = `${fase.faseIndex}:NOLEGGIO:${originalIdx}`; if (deletedPhaseItems.has(key)) return sum; const ov = phaseItemAmountOverrides.get(key); const upOv = phaseUnitPriceOverrides.get(key); const d = phaseItemDiscounts.get(key) || 0; const bp = ov !== null && ov !== undefined ? ov : (upOv !== null && upOv !== undefined ? upOv * item.quantity * (fase.durationMonths || 1) : item.totalRow); return sum + bp * (1 - d / 100); }, 0) + getPhaseManualRowsSubtotal(fase.faseIndex, 'noleggio'))}</span>
                                </div>
                                {noleggioOnly.map(({ item, originalIdx }) => {
                                  const key = `${fase.faseIndex}:NOLEGGIO:${originalIdx}`;
                                  if (deletedPhaseItems.has(key)) return null;
                                  const override = phaseItemAmountOverrides.get(key);
                                  const nolUpOverride = phaseUnitPriceOverrides.get(key);
                                  const hasNolUpOverride = nolUpOverride !== null && nolUpOverride !== undefined;
                                  const discount = phaseItemDiscounts.get(key) || 0;
                                  return (
                                    <div key={originalIdx} className="pl-6 py-1.5 border-b border-indigo-100 dark:border-indigo-900 last:border-0">
                                      <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="flex-1 min-w-0 truncate">{item.articleName}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {item.quantity > 0 && (
                                            <div className="flex items-center gap-1">
                                              <span className="text-xs text-muted-foreground">€/u</span>
                                              <NumericInput
                                                value={hasNolUpOverride ? nolUpOverride : item.unitPrice}
                                                onChange={(e) => {
                                                  const val = parseFloat(e.target.value);
                                                  if (isNaN(val)) return;
                                                  setPhaseUnitPriceOverrides(prev => {
                                                    const newMap = new Map(prev);
                                                    if (Math.abs(val - item.unitPrice) < 0.001) { newMap.delete(key); } else { newMap.set(key, val); }
                                                    return newMap;
                                                  });
                                                }}
                                                className={`w-20 h-7 text-xs ${hasNolUpOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                                data-testid={`input-phase-${fase.faseIndex}-noleggio-unitprice-${originalIdx}`}
                                              />
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-muted-foreground">€</span>
                                            <NumericInput
                                              className="w-28 h-7 text-xs"
                                              value={override !== null && override !== undefined ? override : round2(hasNolUpOverride ? nolUpOverride * item.quantity * (fase.durationMonths || 1) : item.totalRow)}
                                              onChange={(e) => {
                                                const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                setPhaseItemAmountOverrides(prev => { const newMap = new Map(prev); newMap.set(key, val); return newMap; });
                                              }}
                                              data-testid={`input-phase-${fase.faseIndex}-noleggio-price-${originalIdx}`}
                                            />
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <NumericInput
                                              className="w-14 h-7 text-xs"
                                              placeholder="%"
                                              value={discount || ''}
                                              onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setPhaseItemDiscounts(prev => { const newMap = new Map(prev); newMap.set(key, Math.min(100, Math.max(0, val))); return newMap; });
                                              }}
                                              data-testid={`input-phase-${fase.faseIndex}-noleggio-discount-${originalIdx}`}
                                            />
                                            <span className="text-xs text-muted-foreground">%</span>
                                          </div>
                                          {(() => {
                                            const vatKey = `${fase.faseIndex}:NOLEGGIO:${originalIdx}`;
                                            const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                            const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                            return (
                                              <Select value={itemVat} onValueChange={(v) => { const newMap = new Map(phaseItemVatOverrides); if (v === vatRateDefault) { newMap.delete(vatKey); } else { newMap.set(vatKey, v as VatRate); } setPhaseItemVatOverrides(newMap); }}>
                                                <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-phase-${fase.faseIndex}-noleggio-vat-${originalIdx}`}>
                                                  <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="22">22%</SelectItem>
                                                  <SelectItem value="10">10%</SelectItem>
                                                  <SelectItem value="4">4%</SelectItem>
                                                  <SelectItem value="RC">RC</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            );
                                          })()}
                                          {confirmDeleteKey === key ? (
                                            <div className="flex items-center gap-1 ml-1">
                                              <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                            </div>
                                          ) : (
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)}><X className="w-3.5 h-3.5" /></Button>
                                          )}
                                        </div>
                                      </div>
                                      {item.calculationDetail?.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5">{item.calculationDetail.description}</p>
                                      )}
                                    </div>
                                  );
                                })}
                                {/* Righe manuali Noleggio per questa fase - dentro la card */}
                                <div className="mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-800">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Voci aggiuntive manuali</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => addPhaseManualRow(fase.faseIndex, 'noleggio')}
                                      className="h-6 text-xs text-indigo-600 hover:text-indigo-700"
                                      data-testid={`button-add-manual-noleggio-phase-${fase.faseIndex}`}
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Aggiungi riga
                                    </Button>
                                  </div>
                                  {getPhaseManualRows(fase.faseIndex, 'noleggio').map((row) => (
                                    <div key={row.id} className="flex items-center gap-2 pl-4 py-1.5 text-sm">
                                      <Input
                                        type="text"
                                        placeholder="Descrizione..."
                                        className="flex-1 h-7 text-xs"
                                        value={row.description}
                                        onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'noleggio', row.id, { description: e.target.value })}
                                        data-testid={`input-manual-noleggio-phase-${fase.faseIndex}-desc-${row.id}`}
                                      />
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-muted-foreground">€</span>
                                        <NumericInput
                                          className="w-28 h-7 text-xs"
                                          value={row.amount || ''}
                                          onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'noleggio', row.id, { amount: parseFloat(e.target.value) || 0 })}
                                          data-testid={`input-manual-noleggio-phase-${fase.faseIndex}-amount-${row.id}`}
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <NumericInput
                                          className="w-14 h-7 text-xs"
                                          placeholder="%"
                                          value={row.discountPercent || ''}
                                          onChange={(e) => updatePhaseManualRow(fase.faseIndex, 'noleggio', row.id, { discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                          data-testid={`input-manual-noleggio-phase-${fase.faseIndex}-discount-${row.id}`}
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                      </div>
                                      <span className="font-mono text-xs text-indigo-700 dark:text-indigo-400 w-20 text-right">
                                        €{formatCurrency(row.amount * (1 - row.discountPercent / 100))}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removePhaseManualRow(fase.faseIndex, 'noleggio', row.id)}
                                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                        data-testid={`button-remove-manual-noleggio-phase-${fase.faseIndex}-${row.id}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {fornituraOnly.length > 0 && (
                              <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium flex items-center gap-2">
                                    <Package className="w-4 h-4 text-amber-600" />
                                    Fornitura
                                  </span>
                                  <span className="font-mono font-semibold">€{formatCurrency(fornituraOnly.reduce((sum, { item, originalIdx }) => { const key = `${fase.faseIndex}:NOLEGGIO:${originalIdx}`; if (deletedPhaseItems.has(key)) return sum; const ov = phaseItemAmountOverrides.get(key); const upOv = phaseUnitPriceOverrides.get(key); const d = phaseItemDiscounts.get(key) || 0; const bp = ov !== null && ov !== undefined ? ov : (upOv !== null && upOv !== undefined ? upOv * item.quantity : item.totalRow); return sum + bp * (1 - d / 100); }, 0))}</span>
                                </div>
                                {fornituraOnly.map(({ item, originalIdx }) => {
                                  const key = `${fase.faseIndex}:NOLEGGIO:${originalIdx}`;
                                  if (deletedPhaseItems.has(key)) return null;
                                  const override = phaseItemAmountOverrides.get(key);
                                  const fornUpOverride = phaseUnitPriceOverrides.get(key);
                                  const hasFornUpOverride = fornUpOverride !== null && fornUpOverride !== undefined;
                                  const discount = phaseItemDiscounts.get(key) || 0;
                                  return (
                                    <div key={originalIdx} className="pl-6 py-1.5 border-b border-amber-100 dark:border-amber-900 last:border-0">
                                      <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="flex-1 min-w-0 truncate">{item.articleName}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {item.quantity > 0 && (
                                            <div className="flex items-center gap-1">
                                              <span className="text-xs text-muted-foreground">€/u</span>
                                              <NumericInput
                                                value={hasFornUpOverride ? fornUpOverride : item.unitPrice}
                                                onChange={(e) => {
                                                  const val = parseFloat(e.target.value);
                                                  if (isNaN(val)) return;
                                                  setPhaseUnitPriceOverrides(prev => {
                                                    const newMap = new Map(prev);
                                                    if (Math.abs(val - item.unitPrice) < 0.001) { newMap.delete(key); } else { newMap.set(key, val); }
                                                    return newMap;
                                                  });
                                                }}
                                                className={`w-20 h-7 text-xs ${hasFornUpOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                                data-testid={`input-phase-${fase.faseIndex}-fornitura-unitprice-${originalIdx}`}
                                              />
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-muted-foreground">€</span>
                                            <NumericInput
                                              className="w-28 h-7 text-xs"
                                              value={override !== null && override !== undefined ? override : round2(hasFornUpOverride ? fornUpOverride * item.quantity : item.totalRow)}
                                              onChange={(e) => {
                                                const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                setPhaseItemAmountOverrides(prev => { const newMap = new Map(prev); newMap.set(key, val); return newMap; });
                                              }}
                                              data-testid={`input-phase-${fase.faseIndex}-fornitura-price-${originalIdx}`}
                                            />
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <NumericInput
                                              className="w-14 h-7 text-xs"
                                              placeholder="%"
                                              value={discount || ''}
                                              onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setPhaseItemDiscounts(prev => { const newMap = new Map(prev); newMap.set(key, Math.min(100, Math.max(0, val))); return newMap; });
                                              }}
                                              data-testid={`input-phase-${fase.faseIndex}-fornitura-discount-${originalIdx}`}
                                            />
                                            <span className="text-xs text-muted-foreground">%</span>
                                          </div>
                                          {(() => {
                                            const vatKey = `${fase.faseIndex}:NOLEGGIO:${originalIdx}`;
                                            const itemVat = phaseItemVatOverrides.get(vatKey) || vatRateDefault;
                                            const isVatOverridden = phaseItemVatOverrides.has(vatKey);
                                            return (
                                              <Select value={itemVat} onValueChange={(v) => { const newMap = new Map(phaseItemVatOverrides); if (v === vatRateDefault) { newMap.delete(vatKey); } else { newMap.set(vatKey, v as VatRate); } setPhaseItemVatOverrides(newMap); }}>
                                                <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-phase-${fase.faseIndex}-fornitura-vat-${originalIdx}`}>
                                                  <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="22">22%</SelectItem>
                                                  <SelectItem value="10">10%</SelectItem>
                                                  <SelectItem value="4">4%</SelectItem>
                                                  <SelectItem value="RC">RC</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            );
                                          })()}
                                          {confirmDeleteKey === key ? (
                                            <div className="flex items-center gap-1 ml-1">
                                              <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedPhaseItems(prev => { const s = new Set(prev); s.add(key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                                            </div>
                                          ) : (
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(key)}><X className="w-3.5 h-3.5" /></Button>
                                          )}
                                        </div>
                                      </div>
                                      {item.calculationDetail?.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5">{item.calculationDetail.description}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                <Separator />
          {/* Sconto Rapido - Fasi */}
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-sm">Sconto rapido su tutte le righe</span>
              <NumericInput
                value={bulkDiscountPercent || ""}
                onChange={(e) => setBulkDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                placeholder="%"
                className="w-16 h-7 text-sm"
                data-testid="input-bulk-discount-phases"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900"
                onClick={applyBulkDiscount}
                data-testid="button-apply-bulk-discount-phases"
              >
                Applica a tutti
              </Button>
            </div>
          </div>
          {/* Sconto Globale - Fasi */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Sconto Globale</span>
              <NumericInput
                value={globalDiscountPercent || ""}
                onChange={(e) => setGlobalDiscountPercent(parseInt(e.target.value) || 0)}
                placeholder="%"
                className="w-16 h-7 text-sm"
                data-testid="input-global-discount-phases"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          {/* Extra Sconto - Fasi */}
          <div className="p-3 bg-muted/50 rounded-lg border space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Extra Sconto</span>
              <span className="text-sm text-muted-foreground">€</span>
              <NumericInput
                value={extraDiscountAmount || ""}
                onChange={(e) => setExtraDiscountAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-24 h-7 text-sm"
                data-testid="input-extra-discount-amount-phases"
              />
            </div>
            {extraDiscountAmount > 0 && (
              <Input
                type="text"
                value={extraDiscountNote}
                onChange={(e) => setExtraDiscountNote(e.target.value)}
                placeholder="Nota sconto (es. Sconto commerciale accordato)"
                className="h-7 text-sm"
                data-testid="input-extra-discount-note-phases"
              />
            )}
          </div>
                {/* Riepilogo Totali - Fasi */}
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="py-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Documenti</span>
                    <span className="font-mono">€{formatCurrency(phasesAdjustedTotals.documentiTotal)}</span>
                  </div>
                  {phasesAdjustedTotals.fasiTotals.map((faseTotal) => (
                    <div key={faseTotal.faseIndex} className="flex justify-between text-sm">
                      <span>Fase {faseTotal.faseIndex + 1}</span>
                      <span className="font-mono">€{formatCurrency(faseTotal.total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm">
                    <span>Totale Articoli</span>
                    <span className="font-mono">€{formatCurrency(phasesAdjustedTotals.subtotalBeforeDiscounts)}</span>
                  </div>
                  {(phasesAdjustedTotals.totalDiscounts - phasesAdjustedTotals.globalDiscountAmount) > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Sconti Articoli</span>
                      <span className="font-mono">-€{formatCurrency(phasesAdjustedTotals.totalDiscounts - phasesAdjustedTotals.globalDiscountAmount)}</span>
                    </div>
                  )}
                  {phasesAdjustedTotals.globalDiscountAmount > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Sconto Globale ({globalDiscountPercent}%)</span>
                      <span className="font-mono">-€{formatCurrency(phasesAdjustedTotals.globalDiscountAmount)}</span>
                    </div>
                  )}
                  {extraDiscountAmount > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Extra Sconto{extraDiscountNote ? ` (${extraDiscountNote})` : ""}</span>
                      <span className="font-mono">-€{formatCurrency(extraDiscountAmount)}</span>
                    </div>
                  )}
                  {appliedPromos.length > 0 && (
                    <>
                      {appliedPromos.map((promo) => (
                        <div key={promo.promoId} className="flex justify-between text-sm text-green-600 dark:text-green-400">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {promo.description || "Promozione"} ({promo.discountPercent}%{promo.isGlobal ? " - tutti gli articoli" : ` - ${promo.articleCodes.join(", ")}`})
                          </span>
                          <span className="font-mono">applicata</span>
                        </div>
                      ))}
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Imponibile</span>
                    <span className="font-mono">€{formatCurrency(phasesAdjustedTotals.grandTotal)}</span>
                  </div>
                  
                  {/* Selettore IVA - Fasi */}
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="text-sm font-medium">Aliquota IVA</span>
                    <Select 
                      value={vatRateDefault} 
                      onValueChange={(v) => setVatRateDefault(v as VatRate)}
                    >
                      <SelectTrigger className="w-28" data-testid="select-vat-rate-phases">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="22">22%</SelectItem>
                        <SelectItem value="10">10%</SelectItem>
                        <SelectItem value="4">4%</SelectItem>
                        <SelectItem value="RC">Rev. Charge</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {(() => {
                    const vatBreakdown = calculatePhasesVatBreakdown();
                    if (!vatBreakdown) {
                      return vatRateDefault !== "RC" ? (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>IVA ({vatRateDefault}%)</span>
                          <span className="font-mono">€{formatCurrency(phasesAdjustedTotals.grandTotal * parseFloat(vatRateDefault) / 100)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-sm text-muted-foreground italic">
                          <span>Reverse Charge</span>
                          <span className="text-xs">IVA a carico del cliente</span>
                        </div>
                      );
                    }
                    
                    if (vatBreakdown.hasMixedRates) {
                      return (
                        <>
                          <div className="space-y-1 text-xs">
                            <div className="text-muted-foreground font-medium">Ripartizione IVA:</div>
                            {vatBreakdown.usedRates.map(([rate, data]) => (
                              <div key={rate} className="flex justify-between text-muted-foreground pl-2">
                                <span>Imponibile {rate === "RC" ? "R.C." : `${rate}%`}</span>
                                <span className="font-mono">€{formatCurrency(data.imponibile)}</span>
                                {rate !== "RC" && (
                                  <span className="font-mono text-right w-24">IVA: €{formatCurrency(data.iva)}</span>
                                )}
                                {rate === "RC" && (
                                  <span className="text-right w-24 italic">Rev. Charge</span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>IVA Totale</span>
                            <span className="font-mono">€{formatCurrency(vatBreakdown.totalIva)}</span>
                          </div>
                        </>
                      );
                    } else if (vatRateDefault === "RC") {
                      return (
                        <div className="flex justify-between text-sm text-muted-foreground italic">
                          <span>Reverse Charge</span>
                          <span className="text-xs">IVA a carico del cliente</span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>IVA ({vatRateDefault}%)</span>
                          <span className="font-mono">€{formatCurrency(vatBreakdown.totalIva)}</span>
                        </div>
                      );
                    }
                  })()}
                  
                  <Separator />
                  {(() => {
                    const vatBreakdown = calculatePhasesVatBreakdown();
                    return (
                      <div className="flex justify-between text-xl font-bold">
                        <span>TOTALE {vatBreakdown && vatBreakdown.totalIva > 0 ? "IVATO" : (vatRateDefault !== "RC" ? "IVATO" : "")}</span>
                        <span className="font-mono text-primary">
                          €{formatCurrency(vatBreakdown ? vatBreakdown.totalIvato : (
                            vatRateDefault === "RC" 
                              ? phasesAdjustedTotals.grandTotal 
                              : phasesAdjustedTotals.grandTotal * (1 + parseFloat(vatRateDefault) / 100)
                          ))}
                        </span>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Step 5: Revisione & Sconti - MODALITA' NORMALE (rental/labor_only) */}
        {currentStep === 5 && !isPhaseLikeMode && previewResult && (
          <div className="space-y-4">
            {/* Header Compatto */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Riepilogo Preventivo
                </CardTitle>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                  <span>Durata: {durationMonths} mesi | Distanza: {distanceKm} km</span>
                </CardDescription>
              </CardHeader>
            </Card>
            {/* Sezioni per fase - stile compatto */}
            {totals.phases.map((phase) => {
              const isMontaggio = phase.phase === "MONTAGGIO";
              const isSmontaggio = phase.phase === "SMONTAGGIO";
              const showHandlingMount = isMontaggio && previewResult?.handling && previewResult.handling.mountTotal > 0;
              const showHandlingDismount = isSmontaggio && previewResult?.handling && previewResult.handling.dismountTotal > 0;
              const phaseIcon = phase.phase === "TRASPORTO_ANDATA" || phase.phase === "TRASPORTO_RITORNO" ? <Truck className="w-4 h-4" /> :
                              phase.phase === "MOVIMENTAZIONE_MAGAZZINO" ? <Package className="w-4 h-4" /> :
                              phase.phase === "MONTAGGIO" || phase.phase === "SMONTAGGIO" ? <Wrench className="w-4 h-4" /> :
                              phase.phase === "NOLEGGIO" ? <Calendar className="w-4 h-4" /> :
                              phase.phase === "FORNITURA" ? <Package className="w-4 h-4" /> :
                              <FileText className="w-4 h-4" />;
              const phaseLagItems = phase.phase === "TRASPORTO_ANDATA" && calcolaVeneziaTransport
                ? buildLagunariAndataItems(calcolaVeneziaTransport)
                : phase.phase === "TRASPORTO_RITORNO" && calcolaVeneziaTransport
                  ? buildLagunariRitornoItems(calcolaVeneziaTransport)
                  : [];
              const phaseLagVisible = phaseLagItems.filter(li => !deletedLagunariItems.has(li.key));
              const phaseLagSubtotal = phaseLagVisible.reduce((s, li) => s + getLagunariItemEffective(li), 0);
              return (
                <div key={phase.phase} className={`border rounded-lg p-3 ${getPhaseColor(phase.phase)}`}>
                  {/* Header sezione con icona, nome e subtotale */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium flex items-center gap-2">
                      {phaseIcon}
                      {phase.label}
                    </span>
                    <span className="font-mono font-semibold">€{formatCurrency(phase.afterDiscount + phaseLagSubtotal)}</span>
                  </div>
                      <div className="space-y-2">
                        {phase.items.map((item, idx) => {
                          const overridePhase = (item as any)._overridePhase || phase.phase;
                          const overrideIdx = (item as any)._overrideIndex ?? idx;
                          const deleteKey = `${overridePhase}:${overrideIdx}`;
                          if ((item as any)._deleted) return null;
                          const itemDiscount = item.discountPercent || 0;
                          const itemAfterDiscount = item.afterDiscount || item.totalRow;
                          const originalTotal = (item as any).originalTotal || item.totalRow;
                          const hasAmountOverride = (item as any).hasAmountOverride || false;
                          const hasUnitPriceOverride = (item as any).hasUnitPriceOverride || false;
                          const currentAmountOverride = getItemAmountOverride(overridePhase, overrideIdx);
                          const currentUnitPriceOverride = getUnitPriceOverride(overridePhase, overrideIdx);
                          const isEditableUnitPrice = !((item as any).isManualRow) && (phase.phase === "MONTAGGIO" || phase.phase === "SMONTAGGIO" || phase.phase === "NOLEGGIO" || phase.phase === "FORNITURA") && item.quantity > 0;
                          const trasfertaItem = (item as any).trasfertaItem as { quotaTrasferta: number; costoUnitarioRettificato: number } | null;
                          const difficultyItem = (item as any).difficultyItem as { quotaDifficolta: number; costoUnitarioConDifficolta: number } | null;
                          const veneziaItemStep5 = (item as any).veneziaItem as { quotaVenezia: number } | null;
                          const showTrasfertaColumns = (phase.phase === "MONTAGGIO" || phase.phase === "SMONTAGGIO") && totals.trasfertaInfo?.fascia !== 'nessuna';
                          const showDifficultyColumns = (phase.phase === "MONTAGGIO" || phase.phase === "SMONTAGGIO") && (totals.difficultyInfo?.totale || 0) > 0;
                          const showVeneziaColumns = (phase.phase === "MONTAGGIO" || phase.phase === "SMONTAGGIO") && (totals.veneziaInfo?.costoMontaggioVenezia || 0) + (totals.veneziaInfo?.costoSmontaggioVenezia || 0) > 0;
                          // Border color based on phase type (matching Fasi design)
                          const borderColor = isMontaggio 
                            ? "border-green-100 dark:border-green-900" 
                            : isSmontaggio 
                              ? "border-orange-100 dark:border-orange-900" 
                              : "border-border/30";
                          
                          return (
                            <div key={idx} className={`flex items-center gap-2 text-sm pl-6 py-1.5 border-b ${borderColor} last:border-0`}>
                              <div className="flex-1 min-w-0">
                                <span className="truncate">{item.articleName}</span>
                                {item.calculationDetail && (
                                  <p className="text-xs text-muted-foreground">{item.calculationDetail.description}</p>
                                )}
                                {hasAmountOverride && (
                                  <p className="text-xs text-orange-600 dark:text-orange-400">
                                    Originale: €{formatCurrency(originalTotal)}
                                  </p>
                                )}
                              </div>
                              {/* Colonne trasferta e difficoltà per montaggio/smontaggio */}
                              {(() => {
                                // Calcola base unit price usando lo stesso actualTotal usato nella distribuzione trasferta
                                const actualTotal = currentAmountOverride !== null ? currentAmountOverride : originalTotal;
                                const baseUnitPrice = item.quantity > 0 ? actualTotal / item.quantity : 0;
                                const trasfertaPerUnit = trasfertaItem && item.quantity > 0 ? trasfertaItem.quotaTrasferta / item.quantity : 0;
                                const difficultyPerUnit = difficultyItem && item.quantity > 0 ? difficultyItem.quotaDifficolta / item.quantity : 0;
                                const veneziaPerUnitStep5 = veneziaItemStep5 && item.quantity > 0 ? veneziaItemStep5.quotaVenezia / item.quantity : 0;
                                
                                return (showTrasfertaColumns || showDifficultyColumns || showVeneziaColumns) && item.quantity > 0 ? (
                                  <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded">
                                    <div className="text-center" title="Costo unitario base">
                                      <span className="text-muted-foreground block text-[10px]">€/unità</span>
                                      <span className="font-mono">€{baseUnitPrice.toFixed(2)}</span>
                                    </div>
                                    {trasfertaItem && showTrasfertaColumns && (
                                      <div className="text-center" title="Quota trasferta per unità">
                                        <span className="text-muted-foreground block text-[10px]">+Trasf./u</span>
                                        <span className="font-mono text-blue-600 dark:text-blue-400">€{trasfertaPerUnit.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {difficultyItem && showDifficultyColumns && (
                                      <div className="text-center" title="Quota difficoltà per unità">
                                        <span className="text-muted-foreground block text-[10px]">+Diff./u</span>
                                        <span className="font-mono text-amber-600 dark:text-amber-400">€{difficultyPerUnit.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {veneziaItemStep5 && showVeneziaColumns && (
                                      <div className="text-center" title="Quota trasporto lagunare per unità">
                                        <span className="text-muted-foreground block text-[10px]">+Ven./u</span>
                                        <span className="font-mono text-cyan-600 dark:text-cyan-400">€{veneziaPerUnitStep5.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {(trasfertaItem || difficultyItem || veneziaItemStep5) && (
                                      <div className="text-center" title="Costo unitario rettificato (base + extra)">
                                        <span className="text-muted-foreground block text-[10px]">€/u rett.</span>
                                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">€{(baseUnitPrice + trasfertaPerUnit + difficultyPerUnit + veneziaPerUnitStep5).toFixed(2)}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : null;
                              })()}
                              {isEditableUnitPrice && (() => {
                                const extraTrasfPerUnit = showTrasfertaColumns && trasfertaItem && item.quantity > 0 ? trasfertaItem.quotaTrasferta / item.quantity : 0;
                                const extraDiffPerUnit = showDifficultyColumns && difficultyItem && item.quantity > 0 ? difficultyItem.quotaDifficolta / item.quantity : 0;
                                const extraVenPerUnit = showVeneziaColumns && veneziaItemStep5 && item.quantity > 0 ? veneziaItemStep5.quotaVenezia / item.quantity : 0;
                                const extraPerUnit = extraTrasfPerUnit + extraDiffPerUnit + extraVenPerUnit;
                                const basePrice = currentUnitPriceOverride !== null ? currentUnitPriceOverride : item.unitPrice;
                                const rettificatoPerUnit = basePrice + extraPerUnit;
                                return (
                                <div className="flex items-center gap-1 relative">
                                  <span className="text-xs text-muted-foreground">€/u</span>
                                  <div className="relative">
                                    <NumericInput
                                      value={basePrice}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (isNaN(val)) return;
                                        const isNoleggioItem = phase.phase === "NOLEGGIO";
                                        const nolMonths = isNoleggioItem ? durationMonths : 1;
                                        const refPrice = item.quantity > 0 ? originalTotal / item.quantity / nolMonths : item.unitPrice;
                                        if (Math.abs(val - refPrice) < 0.001) {
                                          updateUnitPriceOverride(overridePhase, overrideIdx, null);
                                        } else {
                                          updateUnitPriceOverride(overridePhase, overrideIdx, val);
                                        }
                                      }}
                                      className={`w-20 h-7 text-xs ${hasUnitPriceOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                      data-testid={`input-unit-price-${phase.phase}-${idx}`}
                                    />
                                    {extraPerUnit > 0 && (
                                      <span className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-muted-foreground font-mono whitespace-nowrap">rett. €{rettificatoPerUnit.toFixed(2)}/u</span>
                                    )}
                                  </div>
                                </div>
                                );
                              })()}
                              {/* Campo importo editabile - mostra totale rettificato (base + trasferta + difficoltà) se attivi */}
                              {(() => {
                                // Per montaggio/smontaggio con trasferta/difficoltà, mostra totale rettificato
                                const quotaTrasferta = showTrasfertaColumns && trasfertaItem ? trasfertaItem.quotaTrasferta : 0;
                                const quotaDifficolta = showDifficultyColumns && difficultyItem ? difficultyItem.quotaDifficolta : 0;
                                const quotaVeneziaVal = showVeneziaColumns && veneziaItemStep5 ? veneziaItemStep5.quotaVenezia : 0;
                                const quotaExtra = quotaTrasferta + quotaDifficolta + quotaVeneziaVal;
                                const isNoleggioPhase = phase.phase === "NOLEGGIO";
                                const effectiveTotal = currentUnitPriceOverride !== null ? currentUnitPriceOverride * item.quantity * (isNoleggioPhase ? durationMonths : 1) : originalTotal;
                                const inputValueItem = currentAmountOverride !== null ? (currentAmountOverride + quotaExtra) : (effectiveTotal + quotaExtra);
                                
                                return (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">€</span>
                                    <div className="relative">
                                      <NumericInput
                                        value={Math.round(inputValueItem * 100) / 100}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value);
                                          if (isNaN(val)) return;
                                          const subtotaleBase = val - quotaExtra;
                                          if (Math.abs(subtotaleBase - originalTotal) < 0.01) {
                                            updateItemAmountOverride(overridePhase, overrideIdx, null);
                                          } else {
                                            updateItemAmountOverride(overridePhase, overrideIdx, Math.round(subtotaleBase * 100) / 100);
                                          }
                                        }}
                                        placeholder="Importo"
                                        className={`w-28 h-7 text-xs ${hasAmountOverride ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                        data-testid={`input-item-amount-${phase.phase}-${idx}`}
                                      />
                                      {quotaExtra > 0 && (
                                        <span className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-muted-foreground whitespace-nowrap">incl. trasferta</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                              {/* Campo sconto % */}
                              <div className="flex items-center gap-1">
                                <NumericInput
                                  value={itemDiscount || ""}
                                  onChange={(e) => updateItemDiscount(overridePhase, overrideIdx, parseInt(e.target.value) || 0)}
                                  placeholder="%"
                                  className="w-14 h-7 text-xs"
                                  data-testid={`input-item-discount-${phase.phase}-${idx}`}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                              {/* Badge IVA cliccabile */}
                              {(() => {
                                const key = `${overridePhase}:${overrideIdx}`;
                                const itemVat = itemVatOverrides.get(key) || vatRateDefault;
                                const isOverridden = itemVatOverrides.has(key);
                                return (
                                  <Select
                                    value={itemVat}
                                    onValueChange={(v) => {
                                      const newMap = new Map(itemVatOverrides);
                                      if (v === vatRateDefault) {
                                        newMap.delete(key);
                                      } else {
                                        newMap.set(key, v as VatRate);
                                      }
                                      setItemVatOverrides(newMap);
                                    }}
                                  >
                                    <SelectTrigger 
                                      className={`w-14 h-6 text-[10px] px-1.5 ${isOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`}
                                      data-testid={`select-item-vat-${phase.phase}-${idx}`}
                                    >
                                      <SelectValue>{itemVat === "RC" ? "RC" : `${itemVat}%`}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="22">22%</SelectItem>
                                      <SelectItem value="10">10%</SelectItem>
                                      <SelectItem value="4">4%</SelectItem>
                                      <SelectItem value="RC">RC</SelectItem>
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                              {/* Totale finale - solo se c'è sconto applicato o override prezzo/importo */}
                              {(itemDiscount > 0 || hasUnitPriceOverride || hasAmountOverride) && (
                                <div className="text-right min-w-20">
                                  <span className="font-mono font-medium text-green-700 dark:text-green-400">€{formatCurrency(itemAfterDiscount)}</span>
                                </div>
                              )}
                              {confirmDeleteKey === deleteKey ? (
                                <div className="flex items-center gap-1 ml-1">
                                  <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedItems(prev => { const s = new Set(prev); s.add(deleteKey); return s; }); setConfirmDeleteKey(null); }} data-testid={`button-confirm-delete-${deleteKey}`}>
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)} data-testid={`button-cancel-delete-${deleteKey}`}>
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(deleteKey)} data-testid={`button-delete-item-${deleteKey}`}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {phaseLagItems.length > 0 && phaseLagItems.map((lagItem) => {
                        if (deletedLagunariItems.has(lagItem.key)) return null;
                        const lagOverride = lagunariAmountOverrides.get(lagItem.key);
                        const lagDiscount = lagunariDiscounts.get(lagItem.key) || 0;
                        const lagBase = lagOverride !== null && lagOverride !== undefined ? lagOverride : lagItem.total;
                        return (
                          <div key={`lag-${lagItem.key}`} className="flex items-center gap-2 text-sm pl-6 py-1.5 border-b border-border/30 last:border-0">
                            <div className="flex-1 min-w-0">
                              <span className="truncate flex items-center gap-1">
                                <Ship className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                {lagItem.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">€</span>
                              <NumericInput
                                value={lagOverride !== null && lagOverride !== undefined ? lagOverride : round2(lagItem.total)}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                  setLagunariAmountOverrides(prev => { const m = new Map(prev); m.set(lagItem.key, val); return m; });
                                }}
                                className={`w-28 h-7 text-xs ${lagOverride !== null && lagOverride !== undefined ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' : ''}`}
                                data-testid={`input-lagunari-price-${lagItem.key}`}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <NumericInput
                                value={lagDiscount || ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setLagunariDiscounts(prev => { const m = new Map(prev); m.set(lagItem.key, Math.min(100, Math.max(0, val))); return m; });
                                }}
                                placeholder="%"
                                className="w-14 h-7 text-xs"
                                data-testid={`input-lagunari-discount-${lagItem.key}`}
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                            {(() => {
                              const lagVat = lagunariVatOverrides.get(lagItem.key) || vatRateDefault;
                              const isLagVatOverridden = lagunariVatOverrides.has(lagItem.key);
                              return (
                                <Select value={lagVat} onValueChange={(v) => { const m = new Map(lagunariVatOverrides); if (v === vatRateDefault) { m.delete(lagItem.key); } else { m.set(lagItem.key, v as VatRate); } setLagunariVatOverrides(m); }}>
                                  <SelectTrigger className={`w-14 h-6 text-[10px] px-1.5 ${isLagVatOverridden ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300' : 'bg-muted/50'}`} data-testid={`select-lagunari-vat-${lagItem.key}`}>
                                    <SelectValue>{lagVat === "RC" ? "RC" : `${lagVat}%`}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="22">22%</SelectItem>
                                    <SelectItem value="10">10%</SelectItem>
                                    <SelectItem value="4">4%</SelectItem>
                                    <SelectItem value="RC">RC</SelectItem>
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                            {lagDiscount > 0 && (
                              <div className="text-right min-w-20">
                                <span className="font-mono font-medium text-green-700 dark:text-green-400">€{formatCurrency(getLagunariItemEffective(lagItem))}</span>
                              </div>
                            )}
                            {confirmDeleteKey === `lag:${lagItem.key}` ? (
                              <div className="flex items-center gap-1 ml-1">
                                <span className="text-xs text-destructive whitespace-nowrap">Elimina?</span>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={() => { setDeletedLagunariItems(prev => { const s = new Set(prev); s.add(lagItem.key); return s; }); setConfirmDeleteKey(null); }}><Check className="w-3 h-3" /></Button>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:bg-muted" onClick={() => setConfirmDeleteKey(null)}><X className="w-3 h-3" /></Button>
                              </div>
                            ) : (
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1" onClick={() => setConfirmDeleteKey(`lag:${lagItem.key}`)}><X className="w-3.5 h-3.5" /></Button>
                            )}
                          </div>
                        );
                      })}
                      {/* Movimentazione Montaggio - dentro fase MONTAGGIO (stile Fasi) */}
                      {showHandlingMount && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-2 mb-1">
                            <Package className="w-3 h-3 text-green-600" />
                            <span className="text-xs font-medium text-green-700 dark:text-green-300">Movimentazione Montaggio</span>
                          </div>
                          <div>
                            {previewResult.handling!.breakdown.zones.map((zone, idx) => {
                              const mountOverride = getHandlingZoneOverride(idx, "mount");
                              const mountDiscount = getHandlingZoneDiscount(idx, "mount");
                              const originalMount = zone.mountCost;
                              const currentMount = mountOverride !== null ? mountOverride : originalMount;
                              const afterDiscountMount = currentMount * (1 - mountDiscount / 100);
                              
                              return (
                                <div key={idx} className="pl-4 py-1.5">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground flex-1 min-w-0 truncate">{zone.label} ({zone.type === "GROUND" ? "Terra" : "Quota"})</span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-muted-foreground">€</span>
                                        <NumericInput
                                          className="w-28 h-7 text-xs"
                                          value={mountOverride !== null ? mountOverride : (zone.mountCost || 0)}
                                          onChange={(e) => {
                                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                            if (val === null || Math.abs(val - originalMount) < 0.01) {
                                              updateHandlingZoneOverride(idx, "mount", null);
                                            } else {
                                              updateHandlingZoneOverride(idx, "mount", val);
                                            }
                                          }}
                                          data-testid={`input-zone-mount-amount-${idx}`}
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <NumericInput
                                          className="w-14 h-7 text-xs"
                                          placeholder="%"
                                          value={mountDiscount || ''}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            updateHandlingZoneDiscount(idx, "mount", Math.min(100, Math.max(0, val)));
                                          }}
                                          data-testid={`input-zone-mount-discount-${idx}`}
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                      </div>
                                      {/* Mostra totale solo se c'è sconto o modifica prezzo */}
                                      {(mountDiscount > 0 || mountOverride !== null) && (
                                        <span className="font-mono font-medium w-24 text-right">
                                          €{formatCurrency(afterDiscountMount)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {previewResult.handling!.breakdown.saltareti && (
                              <div className="pl-4 py-1.5 flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Saltareti ({previewResult.handling!.breakdown.saltareti.quantity})</span>
                                <span className="font-mono font-medium w-24 text-right">€{formatCurrency(previewResult.handling!.breakdown.saltareti.total)}</span>
                              </div>
                            )}
                            {(previewResult.handling!.extraPrice || 0) > 0 && (
                              <div className="pl-4 py-1.5 flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Extra</span>
                                <span className="font-mono font-medium w-24 text-right">€{formatCurrency(previewResult.handling!.extraPrice)}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-700 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-green-700 dark:text-green-300">Totale Mov. Montaggio</span>
                              <NumericInput
                                className="w-14 h-7 text-xs"
                                placeholder="%"
                                value={movMountDiscount || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setMovMountDiscount(Math.min(100, Math.max(0, val)));
                                }}
                                data-testid="input-mov-mount-discount"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                            <div className="text-right">
                              {movMountDiscount > 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-muted-foreground line-through text-xs">€{formatCurrency(totals.handlingMountAfterZoneDiscounts || 0)}</span>
                                  <span className="font-mono font-medium text-green-700 dark:text-green-300">€{formatCurrency(totals.handlingMountAfterDiscount || 0)}</span>
                                </div>
                              ) : (
                                <span className="font-mono font-medium text-green-700 dark:text-green-300">€{formatCurrency(totals.handlingMountAfterZoneDiscounts || 0)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Righe manuali Montaggio */}
                      {isMontaggio && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-green-700 dark:text-green-300">Voci aggiuntive manuali</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={addManualMontaggioRow}
                              className="h-6 text-xs text-green-600 hover:text-green-700"
                              data-testid="button-add-manual-montaggio"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Aggiungi riga
                            </Button>
                          </div>
                          {manualMontaggioRows.map((row) => (
                            <div key={row.id} className="flex items-center gap-2 pl-4 py-1.5 text-sm">
                              <Input
                                type="text"
                                placeholder="Descrizione..."
                                className="flex-1 h-7 text-xs"
                                value={row.description}
                                onChange={(e) => updateManualMontaggioRow(row.id, { description: e.target.value })}
                                data-testid={`input-manual-montaggio-desc-${row.id}`}
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">€</span>
                                <NumericInput
                                  className="w-28 h-7 text-xs"
                                  value={row.amount || ''}
                                  onChange={(e) => updateManualMontaggioRow(row.id, { amount: parseFloat(e.target.value) || 0 })}
                                  data-testid={`input-manual-montaggio-amount-${row.id}`}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <NumericInput
                                  className="w-14 h-7 text-xs"
                                  placeholder="%"
                                  value={row.discountPercent || ''}
                                  onChange={(e) => updateManualMontaggioRow(row.id, { discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                  data-testid={`input-manual-montaggio-discount-${row.id}`}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                              {row.discountPercent > 0 && (
                                <span className="font-mono text-xs text-green-700 dark:text-green-400 min-w-16 text-right">
                                  €{formatCurrency(row.amount * (1 - row.discountPercent / 100))}
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeManualMontaggioRow(row.id)}
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                data-testid={`button-remove-manual-montaggio-${row.id}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Movimentazione Smontaggio - dentro fase SMONTAGGIO (stile Fasi) */}
                      {showHandlingDismount && (
                        <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                          <div className="flex items-center gap-2 mb-1">
                            <Package className="w-3 h-3 text-orange-600" />
                            <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Movimentazione Smontaggio</span>
                          </div>
                          <div>
                            {previewResult.handling!.breakdown.zones.map((zone, idx) => {
                              const dismountOverride = getHandlingZoneOverride(idx, "dismount");
                              const dismountDiscount = getHandlingZoneDiscount(idx, "dismount");
                              const originalDismount = zone.dismountCost;
                              const currentDismount = dismountOverride !== null ? dismountOverride : originalDismount;
                              const afterDiscountDismount = currentDismount * (1 - dismountDiscount / 100);
                              
                              return (
                                <div key={idx} className="pl-4 py-1.5">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground flex-1 min-w-0 truncate">{zone.label} ({zone.type === "GROUND" ? "Terra" : "Quota"}) {zone.type === "HEIGHT" ? "(70%)" : ""}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-muted-foreground">€</span>
                                        <NumericInput
                                          className="w-28 h-7 text-xs"
                                          value={dismountOverride !== null ? dismountOverride : (zone.dismountCost || 0)}
                                          onChange={(e) => {
                                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                            if (val === null || Math.abs(val - originalDismount) < 0.01) {
                                              updateHandlingZoneOverride(idx, "dismount", null);
                                            } else {
                                              updateHandlingZoneOverride(idx, "dismount", val);
                                            }
                                          }}
                                          data-testid={`input-zone-dismount-amount-${idx}`}
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <NumericInput
                                          className="w-14 h-7 text-xs"
                                          placeholder="%"
                                          value={dismountDiscount || ''}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            updateHandlingZoneDiscount(idx, "dismount", Math.min(100, Math.max(0, val)));
                                          }}
                                          data-testid={`input-zone-dismount-discount-${idx}`}
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                      </div>
                                      {/* Mostra totale solo se c'è sconto o modifica prezzo */}
                                      {(dismountDiscount > 0 || dismountOverride !== null) && (
                                        <span className="font-mono font-medium w-24 text-right">
                                          €{formatCurrency(afterDiscountDismount)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {previewResult.handling!.breakdown.saltareti && (
                              <div className="pl-4 py-1.5 flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Saltareti ({previewResult.handling!.breakdown.saltareti.quantity})</span>
                                <span className="font-mono font-medium w-24 text-right">€{formatCurrency(previewResult.handling!.breakdown.saltareti.total)}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-700 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Totale Mov. Smontaggio</span>
                              <NumericInput
                                className="w-14 h-7 text-xs"
                                placeholder="%"
                                value={movDismountDiscount || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setMovDismountDiscount(Math.min(100, Math.max(0, val)));
                                }}
                                data-testid="input-mov-dismount-discount"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                            <div className="text-right">
                              {movDismountDiscount > 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-muted-foreground line-through text-xs">€{formatCurrency(totals.handlingDismountAfterZoneDiscounts || 0)}</span>
                                  <span className="font-mono font-medium text-orange-700 dark:text-orange-300">€{formatCurrency(totals.handlingDismountAfterDiscount || 0)}</span>
                                </div>
                              ) : (
                                <span className="font-mono font-medium text-orange-700 dark:text-orange-300">€{formatCurrency(totals.handlingDismountAfterZoneDiscounts || 0)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Righe manuali Smontaggio */}
                      {isSmontaggio && (
                        <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Voci aggiuntive manuali</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={addManualSmontaggioRow}
                              className="h-6 text-xs text-orange-600 hover:text-orange-700"
                              data-testid="button-add-manual-smontaggio"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Aggiungi riga
                            </Button>
                          </div>
                          {manualSmontaggioRows.map((row) => (
                            <div key={row.id} className="flex items-center gap-2 pl-4 py-1.5 text-sm">
                              <Input
                                type="text"
                                placeholder="Descrizione..."
                                className="flex-1 h-7 text-xs"
                                value={row.description}
                                onChange={(e) => updateManualSmontaggioRow(row.id, { description: e.target.value })}
                                data-testid={`input-manual-smontaggio-desc-${row.id}`}
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">€</span>
                                <NumericInput
                                  className="w-28 h-7 text-xs"
                                  value={row.amount || ''}
                                  onChange={(e) => updateManualSmontaggioRow(row.id, { amount: parseFloat(e.target.value) || 0 })}
                                  data-testid={`input-manual-smontaggio-amount-${row.id}`}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <NumericInput
                                  className="w-14 h-7 text-xs"
                                  placeholder="%"
                                  value={row.discountPercent || ''}
                                  onChange={(e) => updateManualSmontaggioRow(row.id, { discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                  data-testid={`input-manual-smontaggio-discount-${row.id}`}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                              {row.discountPercent > 0 && (
                                <span className="font-mono text-xs text-orange-700 dark:text-orange-400 min-w-16 text-right">
                                  €{formatCurrency(row.amount * (1 - row.discountPercent / 100))}
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeManualSmontaggioRow(row.id)}
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                data-testid={`button-remove-manual-smontaggio-${row.id}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {phase.phase === "NOLEGGIO" && (
                        <div className="mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Voci aggiuntive manuali</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={addManualNoleggioRow}
                              className="h-6 text-xs text-indigo-600 hover:text-indigo-700"
                              data-testid="button-add-manual-noleggio"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Aggiungi riga
                            </Button>
                          </div>
                          {manualNoleggioRows.map((row) => (
                            <div key={row.id} className="flex items-center gap-2 pl-4 py-1.5 text-sm">
                              <Input
                                type="text"
                                placeholder="Descrizione..."
                                className="flex-1 h-7 text-xs"
                                value={row.description}
                                onChange={(e) => updateManualNoleggioRow(row.id, { description: e.target.value })}
                                data-testid={`input-manual-noleggio-desc-${row.id}`}
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">€</span>
                                <NumericInput
                                  className="w-28 h-7 text-xs"
                                  value={row.amount || ''}
                                  onChange={(e) => updateManualNoleggioRow(row.id, { amount: parseFloat(e.target.value) || 0 })}
                                  data-testid={`input-manual-noleggio-amount-${row.id}`}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <NumericInput
                                  className="w-14 h-7 text-xs"
                                  placeholder="%"
                                  value={row.discountPercent || ''}
                                  onChange={(e) => updateManualNoleggioRow(row.id, { discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                  data-testid={`input-manual-noleggio-discount-${row.id}`}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                              {row.discountPercent > 0 && (
                                <span className="font-mono text-xs text-indigo-700 dark:text-indigo-400 min-w-16 text-right">
                                  €{formatCurrency(row.amount * (1 - row.discountPercent / 100))}
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeManualNoleggioRow(row.id)}
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                data-testid={`button-remove-manual-noleggio-${row.id}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-border/50 flex justify-between items-center">
                        <span className="font-medium">Subtotale Fase</span>
                        <span className="font-mono font-bold">€{formatCurrency(
                          phase.afterDiscount + phaseLagSubtotal +
                          (isMontaggio && showHandlingMount ? (totals.handlingMountAfterDiscount || 0) : 0) +
                          (isSmontaggio && showHandlingDismount ? (totals.handlingDismountAfterDiscount || 0) : 0)
                        )}</span>
                </div>
              </div>
            );
          })}
          {/* Sconto Rapido */}
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-sm">Sconto rapido su tutte le righe</span>
              <NumericInput
                value={bulkDiscountPercent || ""}
                onChange={(e) => setBulkDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                placeholder="%"
                className="w-16 h-7 text-sm"
                data-testid="input-bulk-discount"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900"
                onClick={applyBulkDiscount}
                data-testid="button-apply-bulk-discount"
              >
                Applica a tutti
              </Button>
            </div>
          </div>
          {/* Sconto Globale */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Sconto Globale</span>
              <NumericInput
                value={globalDiscountPercent || ""}
                onChange={(e) => setGlobalDiscountPercent(parseInt(e.target.value) || 0)}
                placeholder="%"
                className="w-16 h-7 text-sm"
                data-testid="input-global-discount"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          {/* Extra Sconto */}
          <div className="p-3 bg-muted/50 rounded-lg border space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Extra Sconto</span>
              <span className="text-sm text-muted-foreground">€</span>
              <NumericInput
                value={extraDiscountAmount || ""}
                onChange={(e) => setExtraDiscountAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-24 h-7 text-sm"
                data-testid="input-extra-discount-amount"
              />
            </div>
            {extraDiscountAmount > 0 && (
              <Input
                type="text"
                value={extraDiscountNote}
                onChange={(e) => setExtraDiscountNote(e.target.value)}
                placeholder="Nota sconto (es. Sconto commerciale accordato)"
                className="h-7 text-sm"
                data-testid="input-extra-discount-note"
              />
            )}
          </div>
          {/* Riepilogo Totali */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Totale Articoli</span>
                <span className="font-mono">€{formatCurrency(totals.subtotalBeforeDiscounts)}</span>
              </div>
              {totals.totalDiscounts > 0 && (
                <div className="flex justify-between text-sm text-destructive">
                  <span>Totale Sconti</span>
                  <span className="font-mono">-€{formatCurrency(totals.totalDiscounts)}</span>
                </div>
              )}
              {extraDiscountAmount > 0 && (
                <div className="flex justify-between text-sm text-destructive">
                  <span>Extra Sconto{extraDiscountNote ? ` (${extraDiscountNote})` : ""}</span>
                  <span className="font-mono">-€{formatCurrency(extraDiscountAmount)}</span>
                </div>
              )}
              {appliedPromos.length > 0 && (
                <>
                  {appliedPromos.map((promo) => (
                    <div key={promo.promoId} className="flex justify-between text-sm text-green-600 dark:text-green-400">
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {promo.description || "Promozione"} ({promo.discountPercent}%{promo.isGlobal ? " - tutti gli articoli" : ` - ${promo.articleCodes.join(", ")}`})
                      </span>
                      <span className="font-mono">applicata</span>
                    </div>
                  ))}
                </>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-semibold">
                <span>Imponibile</span>
                <span className="font-mono">€{formatCurrency(totals.grandTotal)}</span>
              </div>
              
              {/* Selettore IVA */}
              <div className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm font-medium">Aliquota IVA</span>
                <Select 
                  value={vatRateDefault} 
                  onValueChange={(v) => setVatRateDefault(v as VatRate)}
                >
                  <SelectTrigger className="w-28" data-testid="select-vat-rate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="22">22%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="4">4%</SelectItem>
                    <SelectItem value="RC">Rev. Charge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {(() => {
                const vatBreakdown = calculateVatBreakdownByRate(totals);
                
                // Show breakdown if mixed rates, otherwise simple display
                if (vatBreakdown.hasMixedRates) {
                  return (
                    <>
                      <div className="space-y-1 text-xs">
                        <div className="text-muted-foreground font-medium">Ripartizione IVA:</div>
                        {vatBreakdown.usedRates.map(([rate, data]) => (
                          <div key={rate} className="flex justify-between text-muted-foreground pl-2">
                            <span>Imponibile {rate === "RC" ? "R.C." : `${rate}%`}</span>
                            <span className="font-mono">€{formatCurrency(data.imponibile)}</span>
                            {rate !== "RC" && (
                              <span className="font-mono text-right w-24">IVA: €{formatCurrency(data.iva)}</span>
                            )}
                            {rate === "RC" && (
                              <span className="text-right w-24 italic">Rev. Charge</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>IVA Totale</span>
                        <span className="font-mono">€{formatCurrency(vatBreakdown.totalIva)}</span>
                      </div>
                    </>
                  );
                } else if (vatRateDefault === "RC") {
                  return (
                    <div className="flex justify-between text-sm text-muted-foreground italic">
                      <span>Reverse Charge</span>
                      <span className="text-xs">IVA a carico del cliente</span>
                    </div>
                  );
                } else {
                  return (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>IVA ({vatRateDefault}%)</span>
                      <span className="font-mono">€{formatCurrency(vatBreakdown.totalIva)}</span>
                    </div>
                  );
                }
              })()}
              
              <Separator />
              {(() => {
                const vatBreakdown = calculateVatBreakdownByRate(totals);
                return (
                  <div className="flex justify-between text-xl font-bold">
                    <span>TOTALE {vatBreakdown.totalIva > 0 ? "IVATO" : ""}</span>
                    <span className="font-mono text-primary">
                      €{formatCurrency(vatBreakdown.totalIvato)}
                    </span>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            data-testid="button-prev-step"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Indietro
          </Button>
          {currentStep < 5 ? (
            <Button 
              onClick={handleNext}
              disabled={previewMutation.isPending || phasesPreviewMutation.isPending}
              data-testid="button-next-step"
            >
              {(previewMutation.isPending || phasesPreviewMutation.isPending) ? (
                "Calcolo in corso..."
              ) : currentStep === 4 ? (
                <>Calcola Anteprima <Calculator className="w-4 h-4 ml-1" /></>
              ) : (
                <>Avanti <ChevronRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">N° Preventivo</label>
                <input
                  type="text"
                  value={customQuoteNumber}
                  onChange={(e) => setCustomQuoteNumber(e.target.value)}
                  className="h-9 px-3 py-1 text-sm border rounded-md bg-background w-[180px]"
                  data-testid="input-quote-number"
                />
              </div>
              <Button
                variant="outline"
                disabled={pdfPreviewLoading}
                onClick={handlePreviewPdf}
                data-testid="button-preview-pdf"
              >
                {pdfPreviewLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generazione...</>
                ) : (
                  <><Eye className="w-4 h-4 mr-2" />Anteprima PDF</>
                )}
              </Button>
              <Button
                variant="outline"
                disabled={pdfDownloadLoading}
                onClick={handleDownloadPdf}
                data-testid="button-download-pdf"
              >
                {pdfDownloadLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generazione...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4 mr-2" />
                    Scarica Preventivo PDF
                  </>
                )}
              </Button>
              <Button 
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-quote"
              >
                {saveMutation.isPending ? "Salvataggio..." : (
                  <>{isEditMode ? "Aggiorna Preventivo" : "Salva Preventivo"} <Save className="w-4 h-4 ml-1" /></>
                )}
              </Button>
              <Button
                variant="outline"
                asChild
                disabled={!contactReferent?.email}
                data-testid="button-send-email"
              >
                <a 
                  href={`mailto:${contactReferent?.email || ''}?subject=${encodeURIComponent(`Cantiere in ${[opportunity?.siteAddress || opportunity?.title || '[Indirizzo]', opportunity?.siteCity, opportunity?.siteProvince ? `(${opportunity.siteProvince})` : ''].filter(Boolean).join(', ')}`)}&body=${encodeURIComponent(`Gentile ${getLeadName()},\n\nLa ringraziamo per aver contattato DA.DO. PONTEGGI. In allegato Le inviamo la nostra migliore offerta per l'allestimento del ponteggio nel cantiere in oggetto.\n\nIn caso di conferma, Le chiediamo gentilmente di restituirci l'offerta e le condizioni contrattuali allegate, debitamente compilate e firmate in ogni loro parte. Per poter organizzare al meglio l'intervento, La preghiamo di inviare la documentazione con congruo anticipo rispetto alla data di inizio lavori desiderata.\n\nLe ricordiamo che l'inizio delle attività è previsto a circa 10 giorni solari dalla firma del contratto. Una volta ricevuta la documentazione, il nostro responsabile, Raffaele Carotenuto (Cel. 328 4525004), provvederà a contattarLa per concordare la data esatta.`)}`}
                >
                  Invia via Mail <Mail className="w-4 h-4 ml-1" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
      <Dialog open={showDraftDialog} onOpenChange={(open) => { if (!open) { setShowDraftDialog(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📋 Bozza trovata
            </DialogTitle>
            <DialogDescription>
              {(() => {
                try {
                  const saved = localStorage.getItem(DRAFT_KEY);
                  if (saved) {
                    const d = JSON.parse(saved);
                    const date = new Date(d.savedAt);
                    return `È stata trovata una bozza salvata il ${date.toLocaleDateString("it-IT")} alle ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}. Vuoi ripristinarla o ricominciare da zero?`;
                  }
                } catch { /* ignore */ }
                return "È stata trovata una bozza precedente. Vuoi ripristinarla?";
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
                setShowDraftDialog(false);
              }}
              data-testid="button-discard-draft"
            >
              Scarta e ricomincia
            </Button>
            <Button
              onClick={() => {
                try {
                  const saved = localStorage.getItem(DRAFT_KEY);
                  if (saved) {
                    restoreDraftSnapshot(JSON.parse(saved));
                  }
                } catch { /* ignore */ }
                setShowDraftDialog(false);
              }}
              data-testid="button-restore-draft"
            >
              Ripristina bozza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showValidationDialog} onOpenChange={(open) => {
        if (!open) {
          handleValidationConfirmClose(false, () => {
            setShowValidationDialog(false);
            pendingActionRef.current = null;
            setValidationDirty(false);
          });
          return;
        }
        setShowValidationDialog(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Dati mancanti
            </DialogTitle>
            <DialogDescription>
              Compila i dati mancanti qui sotto oppure prosegui comunque.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {validationMissingPayment && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Metodo di pagamento</Label>
                <Select value={validationSelectedPaymentId} onValueChange={setValidationSelectedPaymentId}>
                  <SelectTrigger data-testid="select-validation-payment">
                    <SelectValue placeholder="Seleziona metodo di pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((pm: any) => (
                      <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {validationMissingReferent && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Referente dell'opportunità</Label>
                {referents && referents.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!validationCreateNewRef}
                        onCheckedChange={(checked) => setValidationCreateNewRef(!checked)}
                        data-testid="switch-validation-ref-mode"
                      />
                      <span className="text-sm text-muted-foreground">Seleziona esistente</span>
                    </div>
                    {!validationCreateNewRef && (
                      <Select value={validationSelectedReferentId} onValueChange={setValidationSelectedReferentId}>
                        <SelectTrigger data-testid="select-validation-referent">
                          <SelectValue placeholder="Seleziona referente" />
                        </SelectTrigger>
                        <SelectContent>
                          {referents.map((r: any) => (
                            <SelectItem key={r.id} value={r.id}>
                              {[r.firstName, r.lastName].filter(Boolean).join(" ") || "Senza nome"}{r.role ? ` (${r.role})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                {validationCreateNewRef && (
                  <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-2">Crea nuovo referente</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Nome"
                        value={validationNewRefFirstName}
                        onChange={(e) => setValidationNewRefFirstName(e.target.value)}
                        data-testid="input-validation-ref-firstname"
                      />
                      <Input
                        placeholder="Cognome"
                        value={validationNewRefLastName}
                        onChange={(e) => setValidationNewRefLastName(e.target.value)}
                        data-testid="input-validation-ref-lastname"
                      />
                    </div>
                    <Input
                      placeholder="Email"
                      type="email"
                      value={validationNewRefEmail}
                      onChange={(e) => setValidationNewRefEmail(e.target.value)}
                      data-testid="input-validation-ref-email"
                    />
                    <Input
                      placeholder="Telefono"
                      value={validationNewRefPhone}
                      onChange={(e) => setValidationNewRefPhone(e.target.value)}
                      data-testid="input-validation-ref-phone"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={handleValidationSkip}
              disabled={validationSaving}
              data-testid="button-validation-skip"
            >
              Prosegui senza salvare
            </Button>
            <Button
              type="button"
              onClick={handleValidationSaveAndProceed}
              disabled={validationSaving || (validationMissingPayment && !validationSelectedPaymentId && validationMissingReferent && !validationSelectedReferentId && !validationCreateNewRef)}
              data-testid="button-validation-save"
            >
              {validationSaving ? "Salvataggio..." : "Salva e prosegui"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!pdfPreviewUrl} onOpenChange={(open) => { if (!open) { setPdfPreviewUrl(null); } }}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Anteprima Preventivo
            </DialogTitle>
            <DialogDescription>
              Preventivo {customQuoteNumber || "bozza"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 px-6 pb-6 min-h-0">
            {pdfPreviewUrl && (
              <object
                data={pdfPreviewUrl}
                type="application/pdf"
                className="w-full h-full rounded-md border"
              >
                <p className="p-4 text-center text-muted-foreground">Il browser non può visualizzare il PDF. <a href={pdfPreviewUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Aprilo qui</a></p>
              </object>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {ValidationConfirmCloseDialog}
    </DashboardLayout>
  );
}