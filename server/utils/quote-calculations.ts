import { storage } from "../storage";
import { calcPrezzoSmaltimentoRete } from "@shared/optionalServices";
import type {
  QuotePhase, PricingData, RentalPricingData, LaborPricingData,
  TransportPricingData, TransportVehicle, DocumentPricingData,
  SimplePricingData, SalePricingData, QuoteDiscounts, HandlingData,
  HandlingParamsData, HoistPricingData, HoistPricingTier, HoistInstallationData,
  InstallationData, InstallationOption, InsertQuote
} from "@shared/schema";

// ============ FUNZIONI DI CALCOLO PREVENTIVO ============

export interface QuoteItemInput {
  articleId: string;
  quantity: number;
  vehicleIndex?: number;       // Per TRANSPORT: indice del veicolo selezionato
  optionIndex?: number;        // Per DOCUMENT: indice opzione selezionata
  installationIndex?: number;  // Per RENTAL: indice opzione installazione selezionata
  variantIndex?: number;       // Per RENTAL con varianti: indice variante selezionata
  manualUnitPrice?: number;    // Override prezzo unitario (opzionale)
  totalPrice?: number;         // Prezzo totale fisso (bypassa calcolo catalogo)
  useCesta?: boolean;          // Aggiungi costo cesta a montaggio/smontaggio
  warehouseCostEnabled?: boolean;
  note?: string;
  // HOIST specific parameters
  hoistAltezzaMetri?: number;  // Altezza totale in metri
  hoistNumSbarchi?: number;    // Numero cancelli sbarco (PM-M10)
  hoistSbalzoMq?: number;      // Superficie sbalzo mq (P26)
}

export interface QuotePreviewParams {
  durationMonths: number;
  distanceKm: number;
  quoteMode?: string;
  logisticsDifficulty?: "LOW" | "MEDIUM" | "HIGH";
  // Voci "A corpo" - articoli con totale editabile manualmente
  aCorpoItems?: Array<{
    articleId: string;
    variantIndex?: number;
    notes?: string;
    quantity: number;
    totalPrice: number;
    splitIntoPhases?: boolean;
  }>;
  // Override prezzo POS/Pimus manuale
  posManualPrice?: number;
  posManualEnabled?: boolean;
  // ML rete antipolvere (NOL-010) per calcolo prezzo a scaglioni SRV-004
  reteAntipolvereQtyML?: number;
}

// Dettaglio calcolo per trasparenza Excel-style
export interface CalculationDetail {
  description: string;  // es. "Fisso €300 + 150km × €2/km × 2"
  breakdown: { label: string; value: number }[];
}

export interface CalculatedItem {
  articleId: string;
  articleName: string;
  variantDescription?: string;
  quantity: number;
  phase: QuotePhase;
  unitPrice: number;
  totalRow: number;
  priceSnapshot: PricingData | null;
  calculationDetail?: CalculationDetail;
  note?: string;
  isACorpo?: boolean;
  vehicleIndex?: number;  // Per TRANSPORT: indice del veicolo (andata/ritorno)
}

// Sezione raggruppata per fase (Excel-style)
export interface PhaseSection {
  phase: QuotePhase;
  label: string;
  items: CalculatedItem[];
  subtotal: number;
}

export interface QuotePreviewResult {
  items: CalculatedItem[];
  phases: PhaseSection[];  // 6 fasi raggruppate
  sections: {  // Mantenuto per retrocompatibilità
    documenti: number;
    trasporto_andata: number;
    montaggio: number;
    noleggio: number;
    smontaggio: number;
    trasporto_ritorno: number;
  };
  total: number;
}

// ============ INTERFACCE PER MODALITÀ FASI (PHASES) ============

// Input di una singola fase del preventivo
export interface QuoteFaseInput {
  id: string;
  faseIndex: number;  // 0-based index
  durationMonths: number;
  items: QuoteItemInput[];
  aCorpoItems?: Array<{
    articleId: string;
    variantIndex?: number;
    notes?: string;
    quantity: number;
    totalPrice: number;
    splitIntoPhases?: boolean;
  }>;
  handlingData?: HandlingData;
}

// Risultato calcolato per una singola fase
export interface FasePreviewResult {
  faseIndex: number;
  faseName: string;  // "Fase 1", "Fase 2", etc.
  durationMonths: number;
  phases: PhaseSection[];  // Sezioni di costo (TRASPORTO_ANDATA, MONTAGGIO, etc.) - esclusi DOCUMENTI
  total: number;
  handling?: {
    mountTotal: number;
    dismountTotal: number;
    saltaretiCost: number;
    extraPrice: number;
    total: number;
    breakdown: {
      zones: Array<{ label: string; type: string; mountCost: number; dismountCost: number }>;
      saltareti: { quantity: number; unitPrice: number; total: number } | null;
    };
  };
}

// Risultato completo per modalità fasi
export interface PhasesPreviewResult {
  isMultiPhase: true;
  documenti: PhaseSection;  // Documenti comuni a tutte le fasi
  fasiResults: FasePreviewResult[];  // Risultati per ogni fase
  grandTotal: number;
}

// Calcola il prezzo unitario per RENTAL in base alla durata
export function calculateRentalPrice(pricingData: RentalPricingData, durationMonths: number): number {
  if (durationMonths <= 2) return pricingData.months_1_2;
  if (durationMonths <= 5) return pricingData.months_3_5;
  if (durationMonths <= 8) return pricingData.months_6_8;
  return pricingData.months_9_plus;
}

// Calcola il totale per TRANSPORT: (fisso * viaggi) + (costoKm * km * viaggi * 2)
export function calculateTransportTotal(vehicle: TransportVehicle, quantity: number, distanceKm: number): number {
  const fixedCost = vehicle.fix * quantity;
  const kmCost = vehicle.perKm * distanceKm * quantity * 2; // *2 per andata/ritorno
  return fixedCost + kmCost;
}

// Calcola il totale per LABOR: (montaggio + smontaggio) * quantità
export function calculateLaborTotal(pricingData: LaborPricingData, quantity: number): number {
  return (pricingData.mount + pricingData.dismount) * quantity;
}

// Calcola il prezzo unitario HOIST per un tier in base alla durata
export function getHoistTierPrice(tier: HoistPricingTier | undefined, durationMonths: number): number {
  if (!tier) return 0;
  if (durationMonths <= 2) return tier.months_1_2 || 0;
  if (durationMonths <= 5) return tier.months_3_5 || 0;
  if (durationMonths <= 8) return tier.months_6_8 || 0;
  return tier.months_9_plus || 0;
}

// Interfaccia parametri montacarichi
export interface HoistParams {
  altezzaMetri: number;       // Altezza totale in metri
  numSbarchi?: number;        // Numero cancelli sbarco (PM-M10)
  sbalzoMq?: number;          // Superficie sbalzo mq (P26)
}

// Calcola il totale noleggio HOIST per un mese
export function calculateHoistRental(pricingData: HoistPricingData, params: HoistParams, durationMonths: number): number {
  // Basamento (1 cad)
  const basamentoPrice = getHoistTierPrice(pricingData.basamento, durationMonths);
  
  // Elevazione (per metro)
  const elevazionePrice = getHoistTierPrice(pricingData.elevazione, durationMonths) * params.altezzaMetri;
  
  // Sbarco (per cad) - PM-M10
  const sbarcoPrice = params.numSbarchi 
    ? getHoistTierPrice(pricingData.sbarco, durationMonths) * params.numSbarchi
    : 0;
  
  // Sbalzo (per mq) - P26
  const sbalzoPrice = params.sbalzoMq 
    ? getHoistTierPrice(pricingData.sbalzo, durationMonths) * params.sbalzoMq
    : 0;
  
  // Totale per mese × durata
  return (basamentoPrice + elevazionePrice + sbarcoPrice + sbalzoPrice) * durationMonths;
}

// Calcola il totale manodopera HOIST
export function calculateHoistInstallation(installData: HoistInstallationData | null, params: HoistParams): { mount: number; dismount: number } {
  if (!installData) return { mount: 0, dismount: 0 };
  
  // Basamento
  const basamentoMount = (installData.basamentoMount || 0);
  const basamentoDismount = (installData.basamentoDismount || 0);
  
  // Elevazione (per metro)
  const elevazioneMount = (installData.elevazioneMountPerMeter || 0) * params.altezzaMetri;
  const elevazioneDismount = (installData.elevazioneDismountPerMeter || 0) * params.altezzaMetri;
  
  // Sbarco (per cad) - PM-M10
  const sbarcoMount = params.numSbarchi 
    ? (installData.sbarcoMount || 0) * params.numSbarchi
    : 0;
  const sbarcoDismount = params.numSbarchi 
    ? (installData.sbarcoDismount || 0) * params.numSbarchi
    : 0;
  
  // Sbalzo (per mq) - P26
  const sbalzoMount = params.sbalzoMq 
    ? (installData.sbalzoMount || 0) * params.sbalzoMq
    : 0;
  const sbalzoDismount = params.sbalzoMq 
    ? (installData.sbalzoDismount || 0) * params.sbalzoMq
    : 0;
  
  return {
    mount: basamentoMount + elevazioneMount + sbarcoMount + sbalzoMount,
    dismount: basamentoDismount + elevazioneDismount + sbarcoDismount + sbalzoDismount
  };
}

// Mappa pricingLogic a QuotePhase (base - per LABOR e TRANSPORT si usa logica speciale)
export function mapPricingLogicToPhase(pricingLogic: string): QuotePhase {
  switch (pricingLogic) {
    case "TRANSPORT": return "TRASPORTO_ANDATA"; // Default, ritorno gestito separatamente
    case "LABOR": return "MONTAGGIO"; // Default, smontaggio gestito separatamente
    case "RENTAL": return "NOLEGGIO";
    case "HOIST": return "NOLEGGIO";  // Montacarichi va in NOLEGGIO, manodopera gestita separatamente
    case "DOCUMENT": return "DOCUMENTI";
    case "EXTRA":
    case "SERVICE": return "DOCUMENTI"; // Servizi extra vanno in documenti
    default: return "DOCUMENTI";
  }
}

// Labels per le fasi (UI)
export const PHASE_LABELS: Record<QuotePhase, string> = {
  DOCUMENTI: "Documenti e Servizi",
  TRASPORTO_ANDATA: "Trasporto Andata",
  MOVIMENTAZIONE_MAGAZZINO: "Costo Magazzino",
  MONTAGGIO: "Montaggio",
  NOLEGGIO: "Noleggio",
  SMONTAGGIO: "Smontaggio",
  TRASPORTO_RITORNO: "Trasporto Ritorno",
};

// ============ MINIMUM PRICING ENFORCEMENT ============
// Soglie minime per le fasi MONTAGGIO e SMONTAGGIO
export const MINIMUM_MONTAGGIO = 1200; // €1200 minimo per fase Montaggio
export const MINIMUM_SMONTAGGIO = 720; // €720 minimo per fase Smontaggio (60% di MONTAGGIO)

export function isSyntheticArticleId(articleId: string): boolean {
  return (
    articleId.startsWith("MAG-") ||
    articleId.startsWith("ACORPO-") ||
    articleId.startsWith("MANUAL-")
  );
}

export const SMONTAGGIO_RATIO = 0.6;

export function buildACorpoItems(
  aCorpoItems: Array<{ articleId: string; notes?: string; quantity: number; totalPrice: number; splitIntoPhases?: boolean }>,
  allArticles: Array<{ id: string; name: string }>,
  prefix: string
): { items: CalculatedItem[]; montaggioTotal: number; smontaggioTotal: number; noleggioTotal: number } {
  const items: CalculatedItem[] = [];
  let montaggioTotal = 0, smontaggioTotal = 0, noleggioTotal = 0;

  for (const [idx, item] of Array.from(aCorpoItems.entries())) {
    const catalogArticle = item.articleId ? allArticles.find(a => a.id === item.articleId) : null;
    const articleName = catalogArticle?.name || "Voce a corpo";
    const displayName = item.notes?.trim() ? item.notes.trim() : articleName;
    const basePrice = item.totalPrice || 0;
    const qty = item.quantity || 1;
    const baseId = item.articleId || `ACORPO-${prefix}-${idx}`;
    const detail = { description: `Voce a corpo (prezzo manuale)`, breakdown: [{ label: "Importo", value: basePrice }] };

    if (item.splitIntoPhases) {
      const smonPrice = Math.round(basePrice * SMONTAGGIO_RATIO * 100) / 100;
      items.push({ articleId: baseId, articleName: displayName, quantity: qty, phase: "MONTAGGIO" as QuotePhase, unitPrice: basePrice / qty, totalRow: basePrice, priceSnapshot: null, calculationDetail: detail, isACorpo: true });
      items.push({ articleId: baseId, articleName: displayName, quantity: qty, phase: "SMONTAGGIO" as QuotePhase, unitPrice: smonPrice / qty, totalRow: smonPrice, priceSnapshot: null, calculationDetail: { description: `Voce a corpo (prezzo manuale - smontaggio 60%)`, breakdown: [{ label: "Importo", value: smonPrice }] }, isACorpo: true });
      items.push({ articleId: baseId, articleName: displayName, quantity: qty, phase: "NOLEGGIO" as QuotePhase, unitPrice: basePrice / qty, totalRow: basePrice, priceSnapshot: null, calculationDetail: detail, isACorpo: true });
      montaggioTotal += basePrice;
      smontaggioTotal += smonPrice;
      noleggioTotal += basePrice;
    } else {
      items.push({ articleId: baseId, articleName: displayName, quantity: qty, phase: "NOLEGGIO" as QuotePhase, unitPrice: basePrice / qty, totalRow: basePrice, priceSnapshot: null, calculationDetail: detail, isACorpo: true });
      noleggioTotal += basePrice;
    }
  }

  return { items, montaggioTotal, smontaggioTotal, noleggioTotal };
}

/**
 * Applica le soglie minime di prezzo alle fasi MONTAGGIO e SMONTAGGIO.
 * Se il totale di una fase è inferiore al minimo, ricalcola il unitPrice
 * dell'articolo principale per raggiungere esattamente il minimo.
 * 
 * @param items - Array di items calcolati
 * @param phaseSubtotals - Subtotali per fase
 * @returns Oggetto con items e phaseSubtotals aggiornati
 */
export function applyMinimumPricing(
  items: Array<{
    articleId: string;
    articleName: string;
    quantity: number;
    phase: QuotePhase;
    unitPrice: number;
    totalRow: number;
    priceSnapshot: any;
    calculationDetail?: any;
  }>,
  phaseSubtotals: Record<QuotePhase, number>
): {
  items: typeof items;
  phaseSubtotals: Record<QuotePhase, number>;
  minimumApplied: { montaggio: boolean; smontaggio: boolean };
} {
  const updatedItems = [...items];
  const updatedSubtotals = { ...phaseSubtotals };
  const minimumApplied = { montaggio: false, smontaggio: false };

  // Helper: trova l'articolo principale di una fase (quello con totalRow più alto)
  const findPrimaryItem = (phase: QuotePhase) => {
    const phaseItems = updatedItems.filter(item => item.phase === phase);
    if (phaseItems.length === 0) return null;
    return phaseItems.reduce((max, item) => item.totalRow > max.totalRow ? item : max);
  };

  // Helper: applica minimum pricing a una fase
  const applyMinimum = (phase: QuotePhase, minimum: number) => {
    const currentTotal = updatedSubtotals[phase];
    if (currentTotal >= minimum || currentTotal <= 0) return false;

    const primaryItem = findPrimaryItem(phase);
    if (!primaryItem || primaryItem.quantity <= 0) return false;

    // Calcola la differenza necessaria
    const deficit = minimum - currentTotal;
    
    // Calcola nuovo unitPrice: aggiunge il deficit diviso per la quantità
    const additionalPerUnit = deficit / primaryItem.quantity;
    const newUnitPrice = primaryItem.unitPrice + additionalPerUnit;
    const newTotalRow = newUnitPrice * primaryItem.quantity;

    // Aggiorna l'item nel array
    const itemIndex = updatedItems.findIndex(
      item => item.articleId === primaryItem.articleId && item.phase === phase
    );
    if (itemIndex >= 0) {
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        unitPrice: Math.round(newUnitPrice * 100) / 100, // Arrotonda a 2 decimali
        totalRow: Math.round(newTotalRow * 100) / 100,
        calculationDetail: {
          ...(updatedItems[itemIndex].calculationDetail || {}), // Guard against undefined
          minimumApplied: true,
          originalUnitPrice: primaryItem.unitPrice,
          minimumThreshold: minimum,
        }
      };

      // Aggiorna il subtotale della fase
      updatedSubtotals[phase] = Math.round(minimum * 100) / 100;
      return true;
    }
    return false;
  };

  // Applica minimum pricing a MONTAGGIO
  if (applyMinimum("MONTAGGIO", MINIMUM_MONTAGGIO)) {
    minimumApplied.montaggio = true;
  }

  // Applica minimum pricing a SMONTAGGIO
  if (applyMinimum("SMONTAGGIO", MINIMUM_SMONTAGGIO)) {
    minimumApplied.smontaggio = true;
  }

  return { items: updatedItems, phaseSubtotals: updatedSubtotals, minimumApplied };
}

// ============ FUNZIONE CALCOLO MOVIMENTAZIONE ============
// Calcola i costi di logistica cantiere divisi per fase (Montaggio/Smontaggio)
// Formula Smontaggio: Terra 100%, Quota 70%
export interface HandlingCalculationResult {
  mountTotal: number;      // Costo movimentazione fase MONTAGGIO
  dismountTotal: number;   // Costo movimentazione fase SMONTAGGIO (quota al 70%)
  saltaretiCost: number;   // Costo saltareti (incluso in mountTotal)
  extraPrice: number;      // Costo extra manuale (incluso in mountTotal)
  total: number;           // mountTotal + dismountTotal
  breakdown: {
    zones: Array<{
      label: string;
      quantity: number;
      distHoriz: number;
      distVert: number;
      type: "GROUND" | "HEIGHT";
      groundHorizCost: number;
      groundVertCost: number;
      heightHorizCost: number;
      heightVertCost: number;
      mountCost: number;     // Costo zona per montaggio (100%)
      dismountCost: number;  // Costo zona per smontaggio (terra 100%, quota 70%)
    }>;
    saltareti: { quantity: number; unitPrice: number; total: number } | null;
  };
}

export async function calculateHandlingCost(
  handlingData: HandlingData | undefined | null,
  companyId: string
): Promise<HandlingCalculationResult> {
  const emptyResult: HandlingCalculationResult = {
    mountTotal: 0,
    dismountTotal: 0,
    saltaretiCost: 0,
    extraPrice: 0,
    total: 0,
    breakdown: { zones: [], saltareti: null }
  };

  if (!handlingData || !handlingData.enabled) {
    return emptyResult;
  }

  // Recupera i coefficienti dal DB (articolo MOV-PARAMS)
  const allArticles = await storage.getArticlesByCompany(companyId);
  const paramsArticle = allArticles.find((a: { code: string }) => a.code === "MOV-PARAMS");
  // Default coefficienti se articolo non trovato
  const params: HandlingParamsData = paramsArticle?.pricingData 
    ? (paramsArticle.pricingData as HandlingParamsData)
    : { k_terra_orizz: 0.05, k_terra_vert: 0.10, k_quota_orizz: 0.08, k_quota_vert: 0.13, free_meters_limit: 10 };

  // Costanti franchigia per GROUND_HORIZ
  const ACTIVATION_THRESHOLD = 10;
  const FRANCHISE_DEDUCTION = 7;
  // Coefficiente riduzione verticali per smontaggio (70%)
  const VERTICAL_DISMOUNT_FACTOR = 0.7;

  let totalMountZones = 0;
  let totalDismountZones = 0;
  const zonesBreakdown: HandlingCalculationResult["breakdown"]["zones"] = [];

  for (const zone of handlingData.zones) {
    const isGround = zone.type === "GROUND";

    // Calcola i 4 componenti di costo separatamente
    let groundHorizCost = 0;
    let groundVertCost = 0;
    let heightHorizCost = 0;
    let heightVertCost = 0;

    if (isGround) {
      // GROUND_HORIZ: Franchigia - se < 10m = 0, altrimenti qty * (m-7) * k
      if (zone.distHoriz >= ACTIVATION_THRESHOLD) {
        const effectiveHoriz = zone.distHoriz - FRANCHISE_DEDUCTION;
        groundHorizCost = zone.quantity * effectiveHoriz * params.k_terra_orizz;
      }
      // GROUND_VERT: STESSA franchigia - se < 10m = 0, altrimenti qty * (m-7) * k
      if (zone.distVert >= ACTIVATION_THRESHOLD) {
        const effectiveVert = zone.distVert - FRANCHISE_DEDUCTION;
        groundVertCost = zone.quantity * effectiveVert * params.k_terra_vert;
      }
    } else {
      // HEIGHT: Nessuna franchigia, paga tutto
      heightHorizCost = zone.quantity * zone.distHoriz * params.k_quota_orizz;
      heightVertCost = zone.quantity * zone.distVert * params.k_quota_vert;
    }

    // MONTAGGIO: 100% di tutto
    const mountCost = groundHorizCost + groundVertCost + heightHorizCost + heightVertCost;

    // SMONTAGGIO: Orizzontali 100%, Verticali 70% (sia Ground che Height)
    const dismountCost = groundHorizCost + 
                         (groundVertCost * VERTICAL_DISMOUNT_FACTOR) +  // Ground_Vert al 70%
                         heightHorizCost + 
                         (heightVertCost * VERTICAL_DISMOUNT_FACTOR);   // Height_Vert al 70%

    totalMountZones += mountCost;
    totalDismountZones += dismountCost;

    zonesBreakdown.push({
      label: zone.label,
      quantity: zone.quantity,
      distHoriz: zone.distHoriz,
      distVert: zone.distVert,
      type: zone.type,
      groundHorizCost,
      groundVertCost,
      heightHorizCost,
      heightVertCost,
      mountCost,
      dismountCost
    });
  }

  // Saltareti - Formula Excel: (75 + 25 * Qty) * Qty
  // Viene aggiunto PIENO sia al Montaggio che allo Smontaggio
  let saltaretiCost = 0;
  let saltaretiBreakdown: HandlingCalculationResult["breakdown"]["saltareti"] = null;
  if (handlingData.saltareti?.included && handlingData.saltareti.quantity > 0) {
    const qty = handlingData.saltareti.quantity;
    // Formula: (75 + 25 * Qty) * Qty
    saltaretiCost = (75 + 25 * qty) * qty;
    saltaretiBreakdown = {
      quantity: qty,
      unitPrice: 75 + 25 * qty, // Prezzo unitario effettivo per questa quantità
      total: saltaretiCost
    };
  }

  // Extra manuale (aggiunto solo al montaggio)
  const extraPrice = handlingData.extraPrice || 0;

  // Totali finali
  // Saltareti va aggiunto PIENO sia a Montaggio che Smontaggio
  const mountTotal = totalMountZones + saltaretiCost + extraPrice;
  const dismountTotal = totalDismountZones + saltaretiCost; // Saltareti pieno anche qui
  const total = mountTotal + dismountTotal;

  return {
    mountTotal,
    dismountTotal,
    saltaretiCost,
    extraPrice,
    total,
    breakdown: { zones: zonesBreakdown, saltareti: saltaretiBreakdown }
  };
}

// Funzione CONDIVISA per calcolare items e subtotali (usata da preview e save)
// Garantisce consistenza tra i due endpoint
export interface CalculateResult {
  items: CalculatedItem[];
  phaseSubtotals: Record<QuotePhase, number>;
  total: number;
}

export async function calculateQuoteItemsWithPhases(
  inputItems: QuoteItemInput[],
  params: QuotePreviewParams,
  companyId: string,
  targetPhases?: QuotePhase[]
): Promise<CalculateResult> {
  const shouldInclude = (phase: QuotePhase) => !targetPhases || targetPhases.includes(phase);
  const calculatedItems: CalculatedItem[] = [];
  const phaseSubtotals: Record<QuotePhase, number> = {
    DOCUMENTI: 0,
    TRASPORTO_ANDATA: 0,
    MOVIMENTAZIONE_MAGAZZINO: 0,
    MONTAGGIO: 0,
    NOLEGGIO: 0,
    SMONTAGGIO: 0,
    TRASPORTO_RITORNO: 0,
  };

  // Quantità ML di NOL-010 per calcolo prezzo a scaglioni SRV-004
  // Nei flussi di salvataggio (POST/PUT), questo valore è già stato derivato server-side
  // da pdfData.quote.checklistItems prima di chiamare questa funzione.
  // Nel flusso preview, viene passato dal client (calcolato da checklistItems state).
  const reteAntipolvereQtyML = params.reteAntipolvereQtyML ?? 0;

  // Traccia i MQ totali di articoli RENTAL (per calcolo automatico Movimentazione Magazzino)
  // NOTA: totalRentalMQ esclude articoli SCAFFOLDING_LABOR (materiale del cliente)
  // Il POS usa selezione manuale opzioni, non calcolo automatico basato su MQ
  let totalRentalMQ = 0;      // Solo materiale NOSTRO (per Magazzino)

  for (const item of inputItems) {
    // Se totalPrice è fornito, è una voce a corpo manuale → bypassa il catalogo
    if (item.totalPrice !== undefined && item.totalPrice > 0) {
      const phase = (targetPhases?.[0] || 'NOLEGGIO') as QuotePhase;
      if (!shouldInclude(phase)) continue;
      const qty = item.quantity || 1;
      calculatedItems.push({
        articleId: item.articleId || 'MANUAL',
        articleName: item.note || 'Voce a corpo',
        quantity: qty,
        phase,
        unitPrice: item.totalPrice / qty,
        totalRow: item.totalPrice,
        priceSnapshot: null,
        isACorpo: true,
        calculationDetail: {
          description: `Voce a corpo manuale: €${item.totalPrice.toFixed(2)}`,
          breakdown: [{ label: 'Importo totale', value: item.totalPrice }]
        }
      });
      phaseSubtotals[phase] += item.totalPrice;
      continue;
    }

    const article = await storage.getArticle(item.articleId, companyId);
    if (!article) continue;

    const pricingData = article.pricingData as PricingData | null;

    // Check for manual price override first
    const hasManualPrice = item.manualUnitPrice !== undefined && item.manualUnitPrice >= 0;

    switch (article.pricingLogic) {
      case "RENTAL": {
        // Check for variant-specific pricing
        const variantsData = article.variantsData as Array<{
          label: string;
          description: string;
          rental?: { months_1_2: number; months_3_5: number; months_6_8: number; months_9_plus: number };
          installation?: { mount: number; dismount: number };
          supportsCesta?: boolean;
          cestaPrice?: number;
          cestaMountPrice?: number;
          cestaDismountPrice?: number;
          isDefault?: boolean;
        }> | null;
        
        const selectedVariant = variantsData && typeof item.variantIndex === 'number' && variantsData[item.variantIndex]
          ? variantsData[item.variantIndex]
          : null;
        
        const variantRentalData = selectedVariant?.rental;
        
        // Use variant rental pricing if available, otherwise fall back to article pricingData
        const effectiveRentalData = variantRentalData || (pricingData as RentalPricingData | null);
        
        if (effectiveRentalData && 'months_1_2' in effectiveRentalData) {
          const rentalData = effectiveRentalData as RentalPricingData;
          // Use manual price if provided, otherwise calculate based on duration
          const unitPrice = hasManualPrice 
            ? item.manualUnitPrice! 
            : calculateRentalPrice(rentalData, params.durationMonths);

          const totalRow = unitPrice * item.quantity * params.durationMonths;

          // Article name includes variant label if applicable
          const displayName = selectedVariant ? `${article.name} - ${selectedVariant.label}` : article.name;

          const effectiveDescription = (selectedVariant?.description) || undefined;

          // 1. NOLEGGIO (skip in labor_only mode)
          if (shouldInclude("NOLEGGIO") && params.quoteMode !== 'labor_only') {
            calculatedItems.push({
              articleId: article.id,
              articleName: displayName,
              variantDescription: effectiveDescription,
              quantity: item.quantity,
              phase: "NOLEGGIO",
              unitPrice,
              totalRow,
              note: item.note,
              priceSnapshot: effectiveRentalData,
              calculationDetail: {
                description: hasManualPrice 
                  ? `Prezzo manuale: €${unitPrice}/mese × ${item.quantity} ${article.unitType} × ${params.durationMonths} mesi`
                  : `€${unitPrice}/mese × ${item.quantity} ${article.unitType} × ${params.durationMonths} mesi`,
                breakdown: [
                  { label: "Prezzo unitario/mese", value: unitPrice },
                  { label: "Quantità", value: item.quantity },
                  { label: "Durata (mesi)", value: params.durationMonths },
                  { label: "Totale", value: totalRow },
                ]
              }
            });
            phaseSubtotals.NOLEGGIO += totalRow;
          }

          // Traccia i MQ per Movimentazione Magazzino (solo per unità MQ)
          // Escludi SCAFFOLDING_LABOR: materiale del cliente = no costo magazzino
          if (article.unitType === "MQ" && article.category !== "SCAFFOLDING_LABOR") {
            totalRentalMQ += item.quantity;
          }

          // 2. MONTAGGIO + SMONTAGGIO
          // Check variant installation pricing first, then fall back to installationData
          const variantInstallation = selectedVariant?.installation;
          const installationData = article.installationData as InstallationData | null;
          
          if (variantInstallation) {
            // Use variant-specific mount/dismount prices
            // Add cesta price if useCesta is true and variant supports it (separate mount/dismount costs)
            const cestaMountAdj = (item.useCesta && selectedVariant?.supportsCesta) 
              ? (selectedVariant.cestaMountPrice ?? selectedVariant.cestaPrice ?? 0) 
              : 0;
            const cestaDismountAdj = (item.useCesta && selectedVariant?.supportsCesta) 
              ? (selectedVariant.cestaDismountPrice ?? selectedVariant.cestaPrice ?? 0) 
              : 0;
            const effectiveMountPrice = variantInstallation.mount + cestaMountAdj;
            const effectiveDismountPrice = variantInstallation.dismount + cestaDismountAdj;
            const mountTotal = effectiveMountPrice * item.quantity;
            const dismountTotal = effectiveDismountPrice * item.quantity;
            
            // Build description and breakdown with cesta info if applicable
            const cestaMountLabel = cestaMountAdj > 0 ? ` (incl. cesta +€${cestaMountAdj})` : "";
            const cestaDismountLabel = cestaDismountAdj > 0 ? ` (incl. cesta +€${cestaDismountAdj})` : "";

            // MONTAGGIO
            if (shouldInclude("MONTAGGIO")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${displayName} (Montaggio)${cestaMountLabel}`,
                variantDescription: effectiveDescription,
                quantity: item.quantity,
                phase: "MONTAGGIO",
                unitPrice: effectiveMountPrice,
                totalRow: mountTotal,
                note: item.note,
                priceSnapshot: null,
                calculationDetail: {
                  description: `€${effectiveMountPrice}/${article.unitType} × ${item.quantity}${cestaMountLabel}`,
                  breakdown: [
                    { label: `Montaggio (${selectedVariant!.label})`, value: variantInstallation.mount },
                    ...(cestaMountAdj > 0 ? [{ label: "Cesta montaggio", value: cestaMountAdj }] : []),
                    { label: "Quantità", value: item.quantity },
                    { label: "Totale montaggio", value: mountTotal },
                  ]
                }
              });
              phaseSubtotals.MONTAGGIO += mountTotal;
            }

            // SMONTAGGIO
            if (shouldInclude("SMONTAGGIO")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${displayName} (Smontaggio)${cestaDismountLabel}`,
                variantDescription: effectiveDescription,
                quantity: item.quantity,
                phase: "SMONTAGGIO",
                unitPrice: effectiveDismountPrice,
                totalRow: dismountTotal,
                note: item.note,
                priceSnapshot: null,
                calculationDetail: {
                  description: `€${effectiveDismountPrice}/${article.unitType} × ${item.quantity}${cestaDismountLabel}`,
                  breakdown: [
                    { label: `Smontaggio (${selectedVariant!.label})`, value: variantInstallation.dismount },
                    ...(cestaDismountAdj > 0 ? [{ label: "Cesta smontaggio", value: cestaDismountAdj }] : []),
                    { label: "Quantità", value: item.quantity },
                    { label: "Totale smontaggio", value: dismountTotal },
                  ]
                }
              });
              phaseSubtotals.SMONTAGGIO += dismountTotal;
            }
          } else if (installationData && installationData.length > 0) {
            const instIndex = item.installationIndex ?? 0;
            const installOption = installationData[instIndex] || installationData.find(o => o.isDefault) || installationData[0];

            if (installOption) {
              const mountTotal = installOption.mount * item.quantity;
              const dismountTotal = installOption.dismount * item.quantity;

              if (shouldInclude("MONTAGGIO")) {
                calculatedItems.push({
                  articleId: article.id,
                  articleName: `${displayName} - ${installOption.label} (Montaggio)`,
                  quantity: item.quantity,
                  phase: "MONTAGGIO",
                  unitPrice: installOption.mount,
                  totalRow: mountTotal,
                  note: item.note,
                  priceSnapshot: null,
                  calculationDetail: {
                    description: `€${installOption.mount}/${article.unitType} × ${item.quantity}`,
                    breakdown: [
                      { label: `Montaggio (${installOption.label})`, value: installOption.mount },
                      { label: "Quantità", value: item.quantity },
                      { label: "Totale montaggio", value: mountTotal },
                    ]
                  }
                });
                phaseSubtotals.MONTAGGIO += mountTotal;
              }

              if (shouldInclude("SMONTAGGIO")) {
                calculatedItems.push({
                  articleId: article.id,
                  articleName: `${article.name} - ${installOption.label} (Smontaggio)`,
                  quantity: item.quantity,
                  phase: "SMONTAGGIO",
                  unitPrice: installOption.dismount,
                  totalRow: dismountTotal,
                  note: item.note,
                  priceSnapshot: null,
                  calculationDetail: {
                    description: `€${installOption.dismount}/${article.unitType} × ${item.quantity}`,
                    breakdown: [
                      { label: `Smontaggio (${installOption.label})`, value: installOption.dismount },
                      { label: "Quantità", value: item.quantity },
                      { label: "Totale smontaggio", value: dismountTotal },
                    ]
                  }
                });
                phaseSubtotals.SMONTAGGIO += dismountTotal;
              }
            }
          }
        }
        break;
      }

      case "SALE": {
        const saleData = pricingData as SalePricingData | null;
        const unitPrice = hasManualPrice
          ? item.manualUnitPrice!
          : (saleData?.price ?? parseFloat(article.basePrice));

        // Se unitCoverage è definito, calcola quantità in unità di vendita (es. rotoli)
        const unitCoverage = saleData?.unitCoverage;
        const saleQuantity = unitCoverage && unitCoverage > 0
          ? Math.ceil(item.quantity / unitCoverage)
          : item.quantity;
        const totalRow = unitPrice * saleQuantity;

        if (shouldInclude("NOLEGGIO")) {
          calculatedItems.push({
            articleId: article.id,
            articleName: article.name,
            quantity: saleQuantity,
            phase: "NOLEGGIO",
            unitPrice,
            totalRow,
            note: item.note,
            priceSnapshot: saleData,
            calculationDetail: {
              description: unitCoverage
                ? `${item.quantity} mq → ${saleQuantity} unità (copertura ${unitCoverage} mq/unità) × €${unitPrice} (vendita)`
                : (hasManualPrice
                  ? `Prezzo manuale: €${unitPrice}/${article.unitType} × ${item.quantity} (vendita)`
                  : `€${unitPrice}/${article.unitType} × ${item.quantity} (vendita)`),
              breakdown: unitCoverage
                ? [
                    { label: "Metri quadri richiesti", value: item.quantity },
                    { label: `Unità necessarie (${unitCoverage} mq/unità)`, value: saleQuantity },
                    { label: "Prezzo per unità", value: unitPrice },
                    { label: "Totale fornitura", value: totalRow },
                  ]
                : [
                    { label: "Prezzo unitario", value: unitPrice },
                    { label: "Quantità", value: item.quantity },
                    { label: "Totale", value: totalRow },
                  ]
            }
          });
          phaseSubtotals.NOLEGGIO += totalRow;
        }

        // Montaggio/Smontaggio per articoli SALE (es. rete antipolvere - ha costi di posa)
        const saleInstallData = article.installationData as InstallationData | null;
        if (saleInstallData && saleInstallData.length > 0) {
          const instIndex = item.installationIndex ?? 0;
          const installOption = saleInstallData[instIndex] || saleInstallData.find(o => o.isDefault) || saleInstallData[0];
          if (installOption) {
            const mountTotal = installOption.mount * item.quantity;
            const dismountTotal = installOption.dismount * item.quantity;

            if (shouldInclude("MONTAGGIO")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${article.name} - ${installOption.label} (Montaggio)`,
                quantity: item.quantity,
                phase: "MONTAGGIO",
                unitPrice: installOption.mount,
                totalRow: mountTotal,
                note: item.note,
                priceSnapshot: null,
                calculationDetail: {
                  description: `€${installOption.mount}/${article.unitType} × ${item.quantity}`,
                  breakdown: [
                    { label: `Montaggio (${installOption.label})`, value: installOption.mount },
                    { label: "Quantità", value: item.quantity },
                    { label: "Totale montaggio", value: mountTotal },
                  ]
                }
              });
              phaseSubtotals.MONTAGGIO += mountTotal;
            }

            if (dismountTotal > 0 && shouldInclude("SMONTAGGIO")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${article.name} - ${installOption.label} (Smontaggio)`,
                quantity: item.quantity,
                phase: "SMONTAGGIO",
                unitPrice: installOption.dismount,
                totalRow: dismountTotal,
                note: item.note,
                priceSnapshot: null,
                calculationDetail: {
                  description: `€${installOption.dismount}/${article.unitType} × ${item.quantity}`,
                  breakdown: [
                    { label: `Smontaggio (${installOption.label})`, value: installOption.dismount },
                    { label: "Quantità", value: item.quantity },
                    { label: "Totale smontaggio", value: dismountTotal },
                  ]
                }
              });
              phaseSubtotals.SMONTAGGIO += dismountTotal;
            }
          }
        }
        break;
      }

      case "TRANSPORT": {
        if (pricingData && 'vehicles' in pricingData) {
          const transportData = pricingData as TransportPricingData;
          const vehicleIndex = item.vehicleIndex ?? 0;
          const vehicle = transportData.vehicles[vehicleIndex];
          if (vehicle) {
            // For transport, if manual price is set, we assume it's the fixed cost override?
            // Or maybe total override? For simplicity, we apply it as fixed cost override per trip
            // But transport is complex (fix + km). 
            // If manual price is sent, we treat it as the TOTAL ONE WAY cost per quantity unit.

            let totalOneWay: number;
            let fixedCost: number;
            let kmCostOneWay: number;
            let unitPriceApplied: number;

            if (hasManualPrice) {
               // Manual price is treated as the total cost per vehicle (andata+ritorno)
               unitPriceApplied = item.manualUnitPrice!;
               totalOneWay = unitPriceApplied * item.quantity;
               fixedCost = totalOneWay; // Attribution purely for breakdown
               kmCostOneWay = 0;
            } else {
               // Formula corretta: (PrezzoFisso + (PrezzoAlKm * Distanza * 2)) * QuantitàViaggi
               // Il moltiplicatore x2 sui km considera andata + ritorno per ogni viaggio
               unitPriceApplied = vehicle.fix + (vehicle.perKm * params.distanceKm * 2);
               fixedCost = vehicle.fix * item.quantity;
               kmCostOneWay = vehicle.perKm * params.distanceKm * 2 * item.quantity; // km x2 (andata+ritorno)
               totalOneWay = (vehicle.fix + (vehicle.perKm * params.distanceKm * 2)) * item.quantity;
            }

            // TRASPORTO ANDATA
            if (shouldInclude("TRASPORTO_ANDATA")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${vehicle.name} - Andata`,
                quantity: item.quantity,
                phase: "TRASPORTO_ANDATA",
                unitPrice: unitPriceApplied,
                totalRow: totalOneWay,
                vehicleIndex: vehicleIndex,
                priceSnapshot: pricingData,
                note: item.note,
                calculationDetail: {
                  description: hasManualPrice 
                    ? `Prezzo manuale: €${unitPriceApplied} × ${item.quantity}`
                    : `(€${vehicle.fix} fisso + €${vehicle.perKm}/km × ${params.distanceKm}km × 2) × ${item.quantity} viaggi`,
                  breakdown: [
                    { label: "Costo fisso", value: fixedCost },
                    { label: "Costo km (A/R)", value: kmCostOneWay },
                    { label: "Totale andata", value: totalOneWay },
                  ]
                }
              });
              phaseSubtotals.TRASPORTO_ANDATA += totalOneWay;
            }

            // TRASPORTO RITORNO (stesso calcolo)
            if (shouldInclude("TRASPORTO_RITORNO")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${vehicle.name} - Ritorno`,
                quantity: item.quantity,
                phase: "TRASPORTO_RITORNO",
                unitPrice: unitPriceApplied,
                totalRow: totalOneWay,
                vehicleIndex: vehicleIndex,
                priceSnapshot: pricingData,
                note: item.note,
                calculationDetail: {
                  description: hasManualPrice 
                    ? `Prezzo manuale: €${unitPriceApplied} × ${item.quantity}`
                    : `(€${vehicle.fix} fisso + €${vehicle.perKm}/km × ${params.distanceKm}km × 2) × ${item.quantity} viaggi`,
                  breakdown: [
                    { label: "Costo fisso", value: fixedCost },
                    { label: "Costo km (A/R)", value: kmCostOneWay },
                    { label: "Totale ritorno", value: totalOneWay },
                  ]
                }
              });
              phaseSubtotals.TRASPORTO_RITORNO += totalOneWay;
            }
          }
        }
        break;
      }

      case "DOCUMENT": {
        let unitPrice = 0;
        let totalRow = 0;
        let optionName = "";
        let isManualPOS = false;

        // Verifica se è POS/Pimus con override manuale attivo
        const isPOSArticle = article.name.toLowerCase().includes("pos") || 
                            article.name.toLowerCase().includes("pimus");

        if (params.posManualEnabled && params.posManualPrice !== undefined && isPOSArticle) {
          // Usa prezzo manuale per POS/Pimus (priorità su manualUnitPrice generico)
          unitPrice = params.posManualPrice;
          totalRow = unitPrice;  // Il prezzo manuale è già il totale
          optionName = "Prezzo Manuale";
          isManualPOS = true;
        } else if (hasManualPrice) {
          unitPrice = item.manualUnitPrice!;
          totalRow = unitPrice * item.quantity;
        } else if (pricingData && 'options' in pricingData) {
          const docData = pricingData as DocumentPricingData;
          const optionIndex = item.optionIndex ?? 0;
          const option = docData.options[optionIndex];
          if (option) {
            unitPrice = option.price;
            totalRow = unitPrice * item.quantity;
            optionName = option.name;
          }
        } else if (pricingData && 'price' in pricingData) {
          unitPrice = (pricingData as SimplePricingData).price;
          totalRow = unitPrice * item.quantity;
        }

        if (totalRow > 0 || isManualPOS || hasManualPrice) {
          calculatedItems.push({
            articleId: article.id,
            articleName: optionName ? `${article.name} (${optionName})` : article.name,
            quantity: isManualPOS ? 1 : item.quantity,
            phase: "DOCUMENTI",
            unitPrice: isManualPOS ? totalRow : unitPrice,
            totalRow,
            priceSnapshot: pricingData,
            calculationDetail: {
              description: isManualPOS ? `Prezzo Manuale: €${totalRow}` : `€${unitPrice} × ${item.quantity}`,
              breakdown: isManualPOS ? [
                { label: "Prezzo Manuale", value: totalRow },
              ] : [
                { label: "Prezzo", value: unitPrice },
                { label: "Quantità", value: item.quantity },
                { label: "Totale", value: totalRow },
              ]
            }
          });
          phaseSubtotals.DOCUMENTI += totalRow;
        }
        break;
      }

      case "EXTRA":
      case "SERVICE": {
        // Skip MAG001 - viene auto-inserito nella fase MOVIMENTAZIONE_MAGAZZINO
        if (article.code === "MAG001") {
          break;
        }

        if (pricingData && 'price' in pricingData) {
          let unitPrice = (pricingData as SimplePricingData).price;

          if (article.code === "SRV-004" && !hasManualPrice) {
            unitPrice = calcPrezzoSmaltimentoRete(reteAntipolvereQtyML);
          }

          if (hasManualPrice) {
            unitPrice = item.manualUnitPrice!;
          }

          const totalRow = unitPrice * item.quantity;

          const isSrv004 = article.code === "SRV-004" && !hasManualPrice;
          const qtyML = reteAntipolvereQtyML;

          calculatedItems.push({
            articleId: article.id,
            articleName: article.name,
            quantity: item.quantity,
            phase: "DOCUMENTI", // Default per servizi
            unitPrice,
            totalRow,
            priceSnapshot: pricingData,
            calculationDetail: isSrv004 ? {
              description: `Prezzo a scaglioni: ${qtyML} ML rilevati → €${unitPrice}`,
              breakdown: [
                { label: "ML rete antipolvere (NOL-010)", value: qtyML },
                { label: "Prezzo calcolato (scaglioni)", value: unitPrice },
                { label: "Quantità", value: item.quantity },
                { label: "Totale", value: totalRow },
              ]
            } : {
              description: `€${unitPrice} × ${item.quantity}`,
              breakdown: [
                { label: "Prezzo", value: unitPrice },
                { label: "Quantità", value: item.quantity },
                { label: "Totale", value: totalRow },
              ]
            }
          });

          phaseSubtotals.DOCUMENTI += totalRow;
        }
        break;
      }

      case "HOIST": {
        // HOIST: Montacarichi con pricing per componenti e varianti
        const variantsData = article.variantsData as Array<{
          label: string;
          description?: string;
          hoistType?: "PM-M10" | "P26";
          hoistRental?: HoistPricingData;
          hoistInstallation?: HoistInstallationData;
          isDefault?: boolean;
        }> | null;

        const selectedVariant = variantsData && typeof item.variantIndex === 'number' && variantsData[item.variantIndex]
          ? variantsData[item.variantIndex]
          : null;

        if (selectedVariant?.hoistRental) {
          const hoistParams: HoistParams = {
            altezzaMetri: item.hoistAltezzaMetri || 0,
            numSbarchi: item.hoistNumSbarchi,
            sbalzoMq: item.hoistSbalzoMq,
          };

          const displayName = `${article.name} - ${selectedVariant.label}`;

          // 1. NOLEGGIO - Calcola con la formula HOIST
          // rentalTotal è il costo per 1 montacarichi (basamento + elevazione + sbarco/sbalzo) × durata
          const rentalPerUnit = calculateHoistRental(selectedVariant.hoistRental, hoistParams, params.durationMonths);
          const rentalTotal = rentalPerUnit * item.quantity;

          if ((rentalTotal > 0 || item.quantity > 0) && shouldInclude("NOLEGGIO")) {
            calculatedItems.push({
              articleId: article.id,
              articleName: displayName,
              quantity: item.quantity,
              phase: "NOLEGGIO",
              unitPrice: rentalPerUnit,
              totalRow: rentalTotal,
              note: item.note,
              priceSnapshot: null,
              calculationDetail: {
                description: `Ponteggio Elettrico ${selectedVariant.label} - ${hoistParams.altezzaMetri}mt`,
                breakdown: [
                  { label: "Altezza (mt)", value: hoistParams.altezzaMetri },
                  ...(hoistParams.numSbarchi ? [{ label: "N. Sbarchi", value: hoistParams.numSbarchi }] : []),
                  ...(hoistParams.sbalzoMq ? [{ label: "Sbalzo (mq)", value: hoistParams.sbalzoMq }] : []),
                  { label: "Durata (mesi)", value: params.durationMonths },
                  { label: "Prezzo unitario", value: rentalPerUnit },
                  { label: "Quantità", value: item.quantity },
                  { label: "Totale noleggio", value: rentalTotal },
                ]
              }
            });
            phaseSubtotals.NOLEGGIO += rentalTotal;
          }

          // 2. MONTAGGIO + SMONTAGGIO
          if (selectedVariant.hoistInstallation) {
            const { mount, dismount } = calculateHoistInstallation(selectedVariant.hoistInstallation, hoistParams);
            const mountTotal = mount * item.quantity;
            const dismountTotal = dismount * item.quantity;

            if (mountTotal > 0 && shouldInclude("MONTAGGIO")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${displayName} (Montaggio)`,
                quantity: item.quantity,
                phase: "MONTAGGIO",
                unitPrice: mount,
                totalRow: mountTotal,
                note: item.note,
                priceSnapshot: null,
                calculationDetail: {
                  description: `Ponteggio Elettrico ${selectedVariant.label} - ${hoistParams.altezzaMetri}mt`,
                  breakdown: [
                    { label: "Basamento mont.", value: (selectedVariant.hoistInstallation.basamentoMount || 0) },
                    { label: "Elevazione mont.", value: (selectedVariant.hoistInstallation.elevazioneMountPerMeter || 0) * hoistParams.altezzaMetri },
                    { label: "Totale montaggio", value: mountTotal },
                  ]
                }
              });
              phaseSubtotals.MONTAGGIO += mountTotal;
            }

            if (dismountTotal > 0 && shouldInclude("SMONTAGGIO")) {
              calculatedItems.push({
                articleId: article.id,
                articleName: `${displayName} (Smontaggio)`,
                quantity: item.quantity,
                phase: "SMONTAGGIO",
                unitPrice: dismount,
                totalRow: dismountTotal,
                note: item.note,
                priceSnapshot: null,
                calculationDetail: {
                  description: `Ponteggio Elettrico ${selectedVariant.label} - ${hoistParams.altezzaMetri}mt`,
                  breakdown: [
                    { label: "Basamento smont.", value: (selectedVariant.hoistInstallation.basamentoDismount || 0) },
                    { label: "Elevazione smont.", value: (selectedVariant.hoistInstallation.elevazioneDismountPerMeter || 0) * hoistParams.altezzaMetri },
                    { label: "Totale smontaggio", value: dismountTotal },
                  ]
                }
              });
              phaseSubtotals.SMONTAGGIO += dismountTotal;
            }
          }
        }
        break;
      }
    }
  }

  // CALCOLO COSTO MAGAZZINO PER OGNI ARTICOLO
  // Usa gli inputItems originali (quantità inserite dall'utente) per evitare di sommare
  // le voci duplicate generate per ogni fase (noleggio + montaggio + smontaggio)
  if (shouldInclude("MOVIMENTAZIONE_MAGAZZINO") && params.quoteMode !== 'labor_only') {
    const warehouseCostsByArticle = new Map<string, { 
      articleId: string; 
      articleName: string; 
      quantity: number; 
      unitCost: number; 
      unitType: string;
    }>();
    
    const allArticlesForWarehouse = await storage.getArticlesByCompany(companyId);
    
    for (const inputItem of inputItems) {
      if (inputItem.warehouseCostEnabled === false) continue;
      
      const article = allArticlesForWarehouse.find(a => a.id === inputItem.articleId);
      
      if (!article || !article.warehouseCostPerUnit) continue;
      
      const warehouseCost = parseFloat(article.warehouseCostPerUnit);
      if (isNaN(warehouseCost) || warehouseCost <= 0) continue;
      
      const qty = inputItem.quantity || 1;
      
      const key = article.code;
      const existing = warehouseCostsByArticle.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        warehouseCostsByArticle.set(key, {
          articleId: article.id,
          articleName: article.name,
          quantity: qty,
          unitCost: warehouseCost,
          unitType: article.unitType,
        });
      }
    }
    
    for (const [code, data] of Array.from(warehouseCostsByArticle.entries())) {
      const totalCost = data.unitCost * data.quantity;
      calculatedItems.push({
        articleId: `MAG-${data.articleId}`,
        articleName: `Magazzino: ${data.articleName}`,
        quantity: data.quantity,
        phase: "MOVIMENTAZIONE_MAGAZZINO",
        unitPrice: data.unitCost,
        totalRow: totalCost,
        priceSnapshot: null,
        calculationDetail: {
          description: `€${data.unitCost.toFixed(2)}/${data.unitType} × ${data.quantity} ${data.unitType}`,
          breakdown: [
            { label: "Costo unitario", value: data.unitCost },
            { label: `Quantità (${data.unitType})`, value: data.quantity },
            { label: "Totale", value: totalCost },
          ]
        }
      });
      phaseSubtotals.MOVIMENTAZIONE_MAGAZZINO += totalCost;
    }
  }

  const total = Object.values(phaseSubtotals).reduce((acc, val) => acc + val, 0);

  return { items: calculatedItems, phaseSubtotals, total };
}

// Applica sconti ai subtotali delle fasi
export function applyDiscounts(
  totalBeforeDiscounts: number, 
  phaseSubtotals: Record<QuotePhase, number>,
  discounts?: QuoteDiscounts | null
): number {
  if (!discounts) return totalBeforeDiscounts;

  let phaseDiscountsTotal = 0;
  if (discounts.phaseDiscounts && discounts.phaseDiscounts.length > 0) {
    for (const pd of discounts.phaseDiscounts) {
      const phaseTotal = phaseSubtotals[pd.phase] || 0;
      // Priorità all'importo fisso, altrimenti usa percentuale
      if (pd.discountAmount !== undefined && pd.discountAmount > 0) {
        phaseDiscountsTotal += pd.discountAmount;
      } else if (pd.discountPercent !== undefined && pd.discountPercent > 0) {
        phaseDiscountsTotal += phaseTotal * (pd.discountPercent / 100);
      }
    }
  }
  const afterPhaseDiscounts = totalBeforeDiscounts - phaseDiscountsTotal;

  // Applica sconto globale (percentuale)
  const globalDiscountAmount = discounts.globalDiscountPercent 
    ? afterPhaseDiscounts * (discounts.globalDiscountPercent / 100)
    : 0;

  // Garantisce che il totale non sia negativo
  return Math.max(0, afterPhaseDiscounts - globalDiscountAmount);
}

// Ricalcola il valore dell'opportunità dalla somma di tutti i suoi preventivi
export async function recalcOpportunityValue(opportunityId: string, companyId: string): Promise<void> {
  const allQuotes = await storage.getQuotesByOpportunity(opportunityId, companyId);
  const total = allQuotes.reduce((sum, q) => sum + (parseFloat(q.totalAmount ?? "0") || 0), 0);
  await storage.updateOpportunity(opportunityId, companyId, {
    value: total > 0 ? total.toFixed(2) : null,
  });
}
