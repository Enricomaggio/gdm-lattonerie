import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type AccessContext } from "./storage";
import { resolveUserCompany, buildAccessContext, validateUserInSameCompany } from "./utils/accessContext";
import { leadsRouter } from "./routers/leads.router";
import {
  isAuthenticated, 
  requireRole,
  canAccessLeads,
  createUser, 
  getUserByEmail, 
  getUserById,
  verifyPassword, 
  generateToken,
  sanitizeUser,
  hashPassword,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLoginAttempts
} from "./auth";
import { 
  insertLeadSchema, insertOpportunitySchema, registerUserSchema, loginUserSchema, insertArticleSchema, insertPaymentMethodSchema, insertLeadSourceSchema, insertReminderSchema, insertPromoCodeSchema, updatePromoCodeSchema, passwordResetTokens, users,
  unitTypeEnum, pricingLogicEnum, quoteStatusEnum, quotePhaseEnum,
  type UserRole, type PricingData, type RentalPricingData, type LaborPricingData, type TransportPricingData, type TransportVehicle, type DocumentPricingData, type SimplePricingData, type SalePricingData, type QuoteGlobalParams, type QuotePhase, type QuoteDiscounts, type InstallationData, type InstallationOption, type HandlingData, type HandlingParamsData, type HandlingZone, type HoistPricingData, type HoistPricingTier, type HoistInstallationData,
  type InsertOpportunity, type InsertQuote, type InsertQuoteItem, type InsertProject
} from "@shared/schema";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { STANDARD_ARTICLES } from "./data/masterCatalog";
import { calcPrezzoSmaltimentoRete } from "@shared/optionalServices";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql as drizzleSql, inArray, isNull, isNotNull } from "drizzle-orm";
import { quotes, opportunities, pipelineStages, leads as leadsTable, contactReferents, activityLogs as activityLogsTable, reminders as remindersTable, notifications, dailyAssignments, salPeriods as salPeriodsTable, salVoci as salVociTable, articles as articlesTable, projects as projectsTable, projectStages, proxitPresence, userCompanies } from "@shared/schema";
// Note: opportunities, contactReferents, activityLogs, reminders are also used via the storage layer - direct DB access below
import multer from "multer";
import { parse } from "csv-parse/sync";

// Helper: rileva errori di unique constraint PostgreSQL (codice 23505)
function isUniqueConstraintError(error: any): boolean {
  return error?.code === "23505" || 
    (typeof error?.message === "string" && error.message.includes("unique constraint")) ||
    (typeof error?.message === "string" && error.message.includes("duplicate key"));
}

// ============ FUNZIONI DI CALCOLO PREVENTIVO ============

interface QuoteItemInput {
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

interface QuotePreviewParams {
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
interface CalculationDetail {
  description: string;  // es. "Fisso €300 + 150km × €2/km × 2"
  breakdown: { label: string; value: number }[];
}

interface CalculatedItem {
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
}

// Sezione raggruppata per fase (Excel-style)
interface PhaseSection {
  phase: QuotePhase;
  label: string;
  items: CalculatedItem[];
  subtotal: number;
}

interface QuotePreviewResult {
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
interface QuoteFaseInput {
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
interface FasePreviewResult {
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
interface PhasesPreviewResult {
  isMultiPhase: true;
  documenti: PhaseSection;  // Documenti comuni a tutte le fasi
  fasiResults: FasePreviewResult[];  // Risultati per ogni fase
  grandTotal: number;
}

// Calcola il prezzo unitario per RENTAL in base alla durata
function calculateRentalPrice(pricingData: RentalPricingData, durationMonths: number): number {
  if (durationMonths <= 2) return pricingData.months_1_2;
  if (durationMonths <= 5) return pricingData.months_3_5;
  if (durationMonths <= 8) return pricingData.months_6_8;
  return pricingData.months_9_plus;
}

// Calcola il totale per TRANSPORT: (fisso * viaggi) + (costoKm * km * viaggi * 2)
function calculateTransportTotal(vehicle: TransportVehicle, quantity: number, distanceKm: number): number {
  const fixedCost = vehicle.fix * quantity;
  const kmCost = vehicle.perKm * distanceKm * quantity * 2; // *2 per andata/ritorno
  return fixedCost + kmCost;
}

// Calcola il totale per LABOR: (montaggio + smontaggio) * quantità
function calculateLaborTotal(pricingData: LaborPricingData, quantity: number): number {
  return (pricingData.mount + pricingData.dismount) * quantity;
}

// Calcola il prezzo unitario HOIST per un tier in base alla durata
function getHoistTierPrice(tier: HoistPricingTier | undefined, durationMonths: number): number {
  if (!tier) return 0;
  if (durationMonths <= 2) return tier.months_1_2 || 0;
  if (durationMonths <= 5) return tier.months_3_5 || 0;
  if (durationMonths <= 8) return tier.months_6_8 || 0;
  return tier.months_9_plus || 0;
}

// Interfaccia parametri montacarichi
interface HoistParams {
  altezzaMetri: number;       // Altezza totale in metri
  numSbarchi?: number;        // Numero cancelli sbarco (PM-M10)
  sbalzoMq?: number;          // Superficie sbalzo mq (P26)
}

// Calcola il totale noleggio HOIST per un mese
function calculateHoistRental(pricingData: HoistPricingData, params: HoistParams, durationMonths: number): number {
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
function calculateHoistInstallation(installData: HoistInstallationData | null, params: HoistParams): { mount: number; dismount: number } {
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
function mapPricingLogicToPhase(pricingLogic: string): QuotePhase {
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
const PHASE_LABELS: Record<QuotePhase, string> = {
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
const MINIMUM_MONTAGGIO = 1200; // €1200 minimo per fase Montaggio
const MINIMUM_SMONTAGGIO = 720; // €720 minimo per fase Smontaggio (60% di MONTAGGIO)

function isSyntheticArticleId(articleId: string): boolean {
  return (
    articleId.startsWith("MAG-") ||
    articleId.startsWith("ACORPO-") ||
    articleId.startsWith("MANUAL-")
  );
}

const SMONTAGGIO_RATIO = 0.6;

function buildACorpoItems(
  aCorpoItems: Array<{ articleId: string; notes?: string; quantity: number; totalPrice: number; splitIntoPhases?: boolean }>,
  allArticles: Array<{ id: string; name: string }>,
  prefix: string
): { items: CalculatedItem[]; montaggioTotal: number; smontaggioTotal: number; noleggioTotal: number } {
  const items: CalculatedItem[] = [];
  let montaggioTotal = 0, smontaggioTotal = 0, noleggioTotal = 0;

  for (const [idx, item] of aCorpoItems.entries()) {
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
function applyMinimumPricing(
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
interface HandlingCalculationResult {
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

async function calculateHandlingCost(
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
interface CalculateResult {
  items: CalculatedItem[];
  phaseSubtotals: Record<QuotePhase, number>;
  total: number;
}

async function calculateQuoteItemsWithPhases(
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
function applyDiscounts(
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

async function getOrCreateUserCompany(userId: string): Promise<string> {
  let userCompany = await storage.getUserCompany(userId);

  if (!userCompany) {
    const company = await storage.createCompany({
      name: "La Mia Azienda",
      vatNumber: null,
    });

    userCompany = await storage.createUserCompany({
      userId,
      companyId: company.id,
    });
  }

  return userCompany.companyId;
}


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============ MODULAR ROUTERS ============
  app.use('/api', leadsRouter);

  async function recalcOpportunityValue(opportunityId: string, companyId: string) {
    const allQuotes = await storage.getQuotesByOpportunity(opportunityId, companyId);
    const total = allQuotes.reduce((sum, q) => sum + (parseFloat(q.totalAmount ?? "0") || 0), 0);
    await storage.updateOpportunity(opportunityId, companyId, {
      value: total > 0 ? total.toFixed(2) : null,
    });
  }

  const profileImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Formato immagine non supportato. Usa JPG, PNG, WebP o GIF."));
      }
    },
  });

  app.post("/api/register", async (_req, res) => {
    return res.status(403).json({ message: "La registrazione pubblica è disabilitata. L'accesso è possibile solo tramite invito." });
  });

  app.post("/api/login", async (req, res) => {
    try {
      const validatedData = loginUserSchema.parse(req.body);

      const user = await getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ message: "Credenziali non valide" });
      }

      // Blocca login per utenti sospesi
      if (user.status === "SUSPENDED") {
        return res.status(403).json({ message: "Account sospeso. Contatta l'amministratore." });
      }

      // Verifica blocco per tentativi falliti
      const lockStatus = isAccountLocked(user);
      if (lockStatus.locked) {
        return res.status(429).json({ 
          message: `Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra ${lockStatus.minutesRemaining} minut${lockStatus.minutesRemaining === 1 ? 'o' : 'i'}.` 
        });
      }

      const isValid = await verifyPassword(validatedData.password, user.password);
      if (!isValid) {
        const result = await recordFailedLogin(user.id, user.failedLoginAttempts);
        if (result.locked) {
          return res.status(429).json({ 
            message: "Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra 15 minuti." 
          });
        }
        return res.status(401).json({ 
          message: `Credenziali non valide. ${result.attemptsRemaining} tentativ${result.attemptsRemaining === 1 ? 'o' : 'i'} rimanent${result.attemptsRemaining === 1 ? 'e' : 'i'}.` 
        });
      }

      // Login riuscito: reset contatore tentativi
      if (user.failedLoginAttempts > 0) {
        await resetFailedLoginAttempts(user.id);
      }

      const token = generateToken({ userId: user.id, email: user.email });

      res.json({
        user: sanitizeUser(user),
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Errore nel login" });
    }
  });

  app.get("/api/me", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getUserById(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Errore nel recupero dell'utente" });
    }
  });

  // Pipeline Stages routes
  app.get("/api/stages", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const stages = await storage.getStagesByCompany(userCompany.companyId);
      res.json(stages);
    } catch (error) {
      console.error("Error fetching stages:", error);
      res.status(500).json({ message: "Errore nel recupero delle fasi" });
    }
  });


  // POST /api/stages - Crea un nuovo stage della pipeline (solo admin)
  app.post("/api/stages", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { name, color, order } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Il nome è obbligatorio" });
      }
      const stage = await storage.createStage({
        name,
        color: color || "#4563FF",
        order: order || 0,
        companyId: userCompany.companyId,
      });
      res.status(201).json(stage);
    } catch (error) {
      console.error("Error creating stage:", error);
      res.status(500).json({ message: "Errore nella creazione dello stage" });
    }
  });

  // PUT /api/stages/reorder - Riordina gli stage della pipeline (solo admin)
  app.put("/api/stages/reorder", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { stageIds } = req.body;
      if (!Array.isArray(stageIds) || stageIds.length === 0) {
        return res.status(400).json({ message: "Array di stageIds obbligatorio" });
      }
      await storage.reorderStages(userCompany.companyId, stageIds);
      const stages = await storage.getStagesByCompany(userCompany.companyId);
      res.json(stages);
    } catch (error) {
      console.error("Error reordering stages:", error);
      res.status(500).json({ message: "Errore nel riordinamento degli stage" });
    }
  });

  // PUT /api/stages/:id - Aggiorna uno stage della pipeline (solo admin)
  app.put("/api/stages/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { name, color, order } = req.body;
      const stage = await storage.updateStage(req.params.id, userCompany.companyId, { name, color, order });
      if (!stage) {
        return res.status(404).json({ message: "Stage non trovato" });
      }
      res.json(stage);
    } catch (error) {
      console.error("Error updating stage:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dello stage" });
    }
  });

  // DELETE /api/stages/:id - Elimina uno stage della pipeline (solo admin)
  app.delete("/api/stages/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const opps = await storage.getOpportunitiesByCompany(userCompany.companyId);
      const hasOpps = opps.some((o: any) => o.stageId === req.params.id);
      if (hasOpps) {
        return res.status(400).json({ message: "Impossibile eliminare: ci sono opportunità in questa colonna. Spostale prima in un'altra colonna." });
      }
      const deleted = await storage.deleteStage(req.params.id, userCompany.companyId);
      if (!deleted) {
        return res.status(404).json({ message: "Stage non trovato" });
      }
      res.json({ message: "Stage eliminato" });
    } catch (error) {
      console.error("Error deleting stage:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dello stage" });
    }
  });

  // GET /api/dashboard/quote-stats - Statistiche preventivi per dashboard commerciale
  app.get("/api/dashboard/quote-stats", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const ctx = await buildAccessContext(userId, role, req);
      if (!ctx) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const allOpportunities = await storage.getOpportunitiesWithAccess(ctx);
      const stages = await storage.getStagesByCompany(ctx.companyId);

      const preventivoInviatoStage = stages.find(s => s.name === "Preventivo Inviato");
      const vintoStage = stages.find(s => s.name === "Vinto");

      const persoStage = stages.find(s => s.name === "Perso");

      const preventivoInviato = preventivoInviatoStage
        ? allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id).length
        : 0;

      const vinteOpportunities = vintoStage
        ? allOpportunities.filter(o => o.stageId === vintoStage.id)
        : [];

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      const currentQuarter = Math.floor(now.getMonth() / 3);
      const startOfLastQuarter = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
      const endOfLastQuarter = new Date(now.getFullYear(), currentQuarter * 3, 0, 23, 59, 59, 999);
      const adjustedStartOfLastQuarter = currentQuarter === 0
        ? new Date(now.getFullYear() - 1, 9, 1)
        : startOfLastQuarter;
      const adjustedEndOfLastQuarter = currentQuarter === 0
        ? new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
        : endOfLastQuarter;

      const parseLocalDateQS = (s: string) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      };
      const customStartDate = req.query.startDate ? parseLocalDateQS(req.query.startDate as string) : null;
      const _endBaseQS = req.query.endDate ? parseLocalDateQS(req.query.endDate as string) : null;
      const customEndDate = _endBaseQS ? new Date(_endBaseQS.getFullYear(), _endBaseQS.getMonth(), _endBaseQS.getDate(), 23, 59, 59, 999) : null;

      const sumValue = (opps: typeof allOpportunities) =>
        opps.reduce((acc, o) => acc + (o.value ? parseFloat(o.value) : 0), 0);

      const filterByCreatedAt = (opps: typeof allOpportunities, start: Date, end: Date) =>
        opps.filter(o => {
          if (!o.createdAt) return false;
          const d = new Date(o.createdAt);
          return d >= start && d <= end;
        });

      const filterByWonAt = (opps: typeof allOpportunities, start: Date, end: Date) =>
        opps.filter(o => {
          if (!o.wonAt) return false;
          const d = new Date(o.wonAt);
          return d >= start && d <= end;
        });

      const filterByLostAt = (opps: typeof allOpportunities, start: Date, end: Date) =>
        opps.filter(o => {
          if (!o.lostAt) return false;
          const d = new Date(o.lostAt);
          return d >= start && d <= end;
        });

      const quoteStageIds = [preventivoInviatoStage?.id, vintoStage?.id, persoStage?.id].filter(Boolean) as string[];
      const quoteOpportunities = allOpportunities.filter(o => quoteStageIds.includes(o.stageId));

      const preventivoInviatoOpportunities = preventivoInviatoStage
        ? allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id)
        : [];

      const monthDuration = now.getTime() - startOfMonth.getTime();
      const prevMonthEnd = new Date(startOfMonth.getTime() - 1);
      const prevMonthStart = new Date(prevMonthEnd.getTime() - monthDuration);

      const quarterDuration = adjustedEndOfLastQuarter.getTime() - adjustedStartOfLastQuarter.getTime();
      const prevQuarterEnd = new Date(adjustedStartOfLastQuarter.getTime() - 1);
      const prevQuarterStart = new Date(prevQuarterEnd.getTime() - quarterDuration);

      const yearDuration = now.getTime() - startOfYear.getTime();
      const prevYearEnd = new Date(startOfYear.getTime() - 1);
      const prevYearStart = new Date(prevYearEnd.getTime() - yearDuration);

      const emessiThisMonthOpps = filterByCreatedAt(quoteOpportunities, startOfMonth, now);
      const emessiLastQuarterOpps = filterByCreatedAt(quoteOpportunities, adjustedStartOfLastQuarter, adjustedEndOfLastQuarter);
      const emessiYearToDateOpps = filterByCreatedAt(quoteOpportunities, startOfYear, now);
      const emessiPrevMonthOpps = filterByCreatedAt(quoteOpportunities, prevMonthStart, prevMonthEnd);
      const emessiPrevQuarterOpps = filterByCreatedAt(quoteOpportunities, prevQuarterStart, prevQuarterEnd);
      const emessiPrevYearOpps = filterByCreatedAt(quoteOpportunities, prevYearStart, prevYearEnd);

      const vintiThisMonthOpps = filterByWonAt(allOpportunities, startOfMonth, now);
      const vintiLastQuarterOpps = filterByWonAt(allOpportunities, adjustedStartOfLastQuarter, adjustedEndOfLastQuarter);
      const vintiYearToDateOpps = filterByWonAt(allOpportunities, startOfYear, now);
      const vintiPrevMonthOpps = filterByWonAt(allOpportunities, prevMonthStart, prevMonthEnd);
      const vintiPrevQuarterOpps = filterByWonAt(allOpportunities, prevQuarterStart, prevQuarterEnd);
      const vintiPrevYearOpps = filterByWonAt(allOpportunities, prevYearStart, prevYearEnd);

      const persiThisMonthOpps = filterByLostAt(allOpportunities, startOfMonth, now);
      const persiLastQuarterOpps = filterByLostAt(allOpportunities, adjustedStartOfLastQuarter, adjustedEndOfLastQuarter);
      const persiYearToDateOpps = filterByLostAt(allOpportunities, startOfYear, now);
      const persiPrevMonthOpps = filterByLostAt(allOpportunities, prevMonthStart, prevMonthEnd);
      const persiPrevQuarterOpps = filterByLostAt(allOpportunities, prevQuarterStart, prevQuarterEnd);
      const persiPrevYearOpps = filterByLostAt(allOpportunities, prevYearStart, prevYearEnd);

      const calcChange = (current: number, previous: number): number | null => {
        if (previous === 0) return null;
        return Math.round(((current - previous) / previous) * 100);
      };

      const customRangeData = customStartDate && customEndDate ? {
        emessiCustom: filterByCreatedAt(quoteOpportunities, customStartDate, customEndDate).length,
        emessiCustomValue: sumValue(filterByCreatedAt(quoteOpportunities, customStartDate, customEndDate)),
        vintiCustom: filterByWonAt(allOpportunities, customStartDate, customEndDate).length,
        vintiCustomValue: sumValue(filterByWonAt(allOpportunities, customStartDate, customEndDate)),
        persiCustom: filterByLostAt(allOpportunities, customStartDate, customEndDate).length,
        persiCustomValue: sumValue(filterByLostAt(allOpportunities, customStartDate, customEndDate)),
        preventivoInviatoCustom: preventivoInviatoStage
          ? allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id && o.createdAt && new Date(o.createdAt) >= customStartDate && new Date(o.createdAt) <= customEndDate).length
          : 0,
        preventivoInviatoCustomValue: preventivoInviatoStage
          ? sumValue(allOpportunities.filter(o => o.stageId === preventivoInviatoStage.id && o.createdAt && new Date(o.createdAt) >= customStartDate && new Date(o.createdAt) <= customEndDate))
          : 0,
      } : null;

      res.json({
        preventivoInviato,
        preventivoInviatoValue: sumValue(preventivoInviatoOpportunities),

        emessiThisMonth: emessiThisMonthOpps.length,
        emessiThisMonthValue: sumValue(emessiThisMonthOpps),
        emessiLastQuarter: emessiLastQuarterOpps.length,
        emessiLastQuarterValue: sumValue(emessiLastQuarterOpps),
        emessiYearToDate: emessiYearToDateOpps.length,
        emessiYearToDateValue: sumValue(emessiYearToDateOpps),
        emessiChangeThisMonth: calcChange(emessiThisMonthOpps.length, emessiPrevMonthOpps.length),
        emessiChangeLastQuarter: calcChange(emessiLastQuarterOpps.length, emessiPrevQuarterOpps.length),
        emessiChangeYearToDate: calcChange(emessiYearToDateOpps.length, emessiPrevYearOpps.length),

        vintiThisMonth: vintiThisMonthOpps.length,
        vintiThisMonthValue: sumValue(vintiThisMonthOpps),
        vintiLastQuarter: vintiLastQuarterOpps.length,
        vintiLastQuarterValue: sumValue(vintiLastQuarterOpps),
        vintiYearToDate: vintiYearToDateOpps.length,
        vintiYearToDateValue: sumValue(vintiYearToDateOpps),
        vintiChangeThisMonth: calcChange(vintiThisMonthOpps.length, vintiPrevMonthOpps.length),
        vintiChangeLastQuarter: calcChange(vintiLastQuarterOpps.length, vintiPrevQuarterOpps.length),
        vintiChangeYearToDate: calcChange(vintiYearToDateOpps.length, vintiPrevYearOpps.length),

        persiThisMonth: persiThisMonthOpps.length,
        persiThisMonthValue: sumValue(persiThisMonthOpps),
        persiLastQuarter: persiLastQuarterOpps.length,
        persiLastQuarterValue: sumValue(persiLastQuarterOpps),
        persiYearToDate: persiYearToDateOpps.length,
        persiYearToDateValue: sumValue(persiYearToDateOpps),
        persiChangeThisMonth: calcChange(persiThisMonthOpps.length, persiPrevMonthOpps.length),
        persiChangeLastQuarter: calcChange(persiLastQuarterOpps.length, persiPrevQuarterOpps.length),
        persiChangeYearToDate: calcChange(persiYearToDateOpps.length, persiPrevYearOpps.length),

        ...(customRangeData ?? {}),
      });
    } catch (error) {
      console.error("Error fetching quote stats:", error);
      res.status(500).json({ message: "Errore nel recupero delle statistiche preventivi" });
    }
  });

  // GET /api/dashboard/won-by-month - Preventivi vinti per mese (3 anni)
  app.get("/api/dashboard/won-by-month", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const ctx = await buildAccessContext(userId, role, req);
      if (!ctx) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const currentYear = parseInt(req.query.year as string) || new Date().getFullYear();
      const sellerIdParam = req.query.sellerId as string | undefined;

      // SALES_AGENT: può vedere solo i propri dati; ignora qualsiasi sellerId nel query param
      let sellerUserId: string | undefined;
      if (role === "SALES_AGENT") {
        sellerUserId = userId;
      } else {
        sellerUserId = sellerIdParam && sellerIdParam !== "all" ? sellerIdParam : undefined;
      }

      const stages = await storage.getStagesByCompany(ctx.companyId);
      const vintoStage = stages.find(s => s.name === "Vinto");

      if (!vintoStage) {
        return res.json({
          currentYear: Array(12).fill(0),
          lastYear: Array(12).fill(0),
          twoYearsAgo: Array(12).fill(0),
          years: { currentYear, lastYear: currentYear - 1, twoYearsAgo: currentYear - 2 },
        });
      }

      const data = await storage.getWonByMonth(ctx.companyId, currentYear, vintoStage.id, sellerUserId);

      res.json({
        ...data,
        years: { currentYear, lastYear: currentYear - 1, twoYearsAgo: currentYear - 2 },
      });
    } catch (error) {
      console.error("Error fetching won-by-month:", error);
      res.status(500).json({ message: "Errore nel recupero dei dati vinti per anno" });
    }
  });

  // ============================================
  // OPPORTUNITIES API Routes
  // ============================================

  // GET /api/opportunities - Lista opportunità dell'azienda (con controllo accesso)
  app.get("/api/opportunities", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const ctx = await buildAccessContext(userId, role, req);
      if (!ctx) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const opportunities = await storage.getOpportunitiesWithAccess(ctx);
      const referentIds = [...new Set(opportunities.map(o => o.referentId).filter(Boolean))] as string[];
      const referentMap = new Map<string, string>();
      for (const refId of referentIds) {
        const ref = await storage.getReferent(refId);
        if (ref) {
          referentMap.set(refId, `${ref.firstName || ""} ${ref.lastName || ""}`.trim());
        }
      }
      const enriched = opportunities.map(o => ({
        ...o,
        referentName: o.referentId ? referentMap.get(o.referentId) || null : null,
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      res.status(500).json({ message: "Errore nel recupero delle opportunità" });
    }
  });

  // ============ ARTICLES (Listino Preventivatore) ============

  // GET /api/articles - Lista articoli del listino
  app.get("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const checklistOnly = req.query.checklist === "true";
      const articles = await storage.getArticlesByCompany(userCompany.companyId, checklistOnly);
      res.json(articles);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Errore nel recupero degli articoli" });
    }
  });

  // GET /api/articles/:id - Dettaglio singolo articolo
  app.get("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const article = await storage.getArticle(req.params.id, userCompany.companyId);
      if (!article) {
        return res.status(404).json({ message: "Articolo non trovato" });
      }

      res.json(article);
    } catch (error) {
      console.error("Error fetching article:", error);
      res.status(500).json({ message: "Errore nel recupero dell'articolo" });
    }
  });

  // Schema per aggiornamento articolo (esclude companyId e isActive, tutti i campi opzionali)
  const updateArticleSchema = insertArticleSchema.omit({ companyId: true, isActive: true }).partial();

  // POST /api/articles - Crea nuovo articolo (COMPANY_ADMIN+)
  app.post("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono creare articoli" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Generate code automatically if not provided
      let code = req.body.code;
      if (!code) {
        const pricingLogic = req.body.pricingLogic || "RENTAL";
        const prefixMap: Record<string, string> = {
          RENTAL: "NOL",
          LABOR: "MAN",
          TRANSPORT: "TRA",
          DOCUMENT: "DOC",
          EXTRA: "EXT",
          SERVICE: "SRV",
        };
        const prefix = prefixMap[pricingLogic] || "ART";
        // Get existing articles to find next number
        const existingArticles = await storage.getArticlesByCompany(userCompany.companyId);
        const samePrefix = existingArticles.filter(a => a.code.startsWith(prefix + "-"));
        const numbers = samePrefix.map(a => {
          const match = a.code.match(new RegExp(`^${prefix}-(\\d+)$`));
          return match ? parseInt(match[1]) : 0;
        });
        const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
        code = `${prefix}-${String(nextNum).padStart(3, "0")}`;
      }

      // Valida usando lo schema condiviso (forza companyId dall'utente autenticato)
      const validationResult = insertArticleSchema.safeParse({
        ...req.body,
        code,
        companyId: userCompany.companyId,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }

      const article = await storage.createArticle(validationResult.data);

      res.status(201).json(article);
    } catch (error) {
      console.error("Error creating article:", error);
      res.status(500).json({ message: "Errore nella creazione dell'articolo" });
    }
  });

  // PATCH /api/articles/:id - Aggiorna articolo (COMPANY_ADMIN+)
  app.patch("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono modificare articoli" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Valida usando lo schema derivato (omette companyId, isActive, tutti opzionali)
      const validationResult = updateArticleSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }

      // Lo schema omit({ companyId }).partial() garantisce solo campi validi
      const article = await storage.updateArticle(req.params.id, userCompany.companyId, validationResult.data);
      if (!article) {
        return res.status(404).json({ message: "Articolo non trovato" });
      }

      res.json(article);
    } catch (error) {
      console.error("Error updating article:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'articolo" });
    }
  });

  // DELETE /api/articles/:id - Elimina articolo (soft delete, COMPANY_ADMIN+)
  app.delete("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono eliminare articoli" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const deleted = await storage.deleteArticle(req.params.id, userCompany.companyId);
      if (!deleted) {
        return res.status(404).json({ message: "Articolo non trovato" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'articolo" });
    }
  });

  // POST /api/catalog/seed-defaults - Inizializza/Aggiorna listino con articoli standard (UPSERT)
  app.post("/api/catalog/seed-defaults", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono inizializzare il listino" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const existingArticles = await storage.getArticlesByCompany(userCompany.companyId);
      const existingByName = new Map(existingArticles.map(a => [a.name, a]));
      const existingByCode = new Map(existingArticles.filter(a => a.code).map(a => [a.code, a]));

      let created = 0;
      let updated = 0;

      for (const masterArticle of STANDARD_ARTICLES) {
        const existing = existingByName.get(masterArticle.name) || existingByCode.get(masterArticle.code);

        if (existing) {
          await storage.updateArticle(existing.id, userCompany.companyId, {
            code: masterArticle.code,
            description: masterArticle.description,
            category: masterArticle.category,
            unitType: masterArticle.unitType,
            pricingLogic: masterArticle.pricingLogic,
            basePrice: masterArticle.basePrice,
            pricingData: masterArticle.pricingData,
            installationData: masterArticle.installationData,
            trasfertaData: masterArticle.trasfertaData,
            variantsData: masterArticle.variantsData,
            isChecklistItem: masterArticle.isChecklistItem,
            checklistOrder: masterArticle.checklistOrder,
          });
          updated++;
        } else {
          await storage.createArticle({
            ...masterArticle,
            companyId: userCompany.companyId,
            isActive: 1,
          });
          created++;
        }
      }

      res.status(201).json({ 
        message: `Listino aggiornato: ${created} nuovi articoli, ${updated} aggiornati`,
        created,
        updated,
        total: created + updated
      });
    } catch (error) {
      console.error("Error seeding catalog:", error);
      res.status(500).json({ message: "Errore nell'inizializzazione del listino" });
    }
  });

  app.post("/api/catalog/migrate-venice-transport", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono eseguire migrazioni" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const existingArticles = await storage.getArticlesByCompany(userCompany.companyId);
      const trfVen = existingArticles.find(a => a.code === "TRF-VEN");
      const trfBar = existingArticles.find(a => a.code === "TRA-BAR" || a.code === "TRF-BAR");
      const tra001 = existingArticles.find(a => a.code === "TRA-001");

      const trfVenVariants = [
        { label: "Santa Croce", description: "Venezia centro", dailyCost: 150 },
        { label: "Dorsoduro", description: "Venezia centro", dailyCost: 200 },
        { label: "San Polo", description: "Venezia centro", dailyCost: 200 },
        { label: "Cannaregio", description: "Venezia centro", dailyCost: 200 },
        { label: "San Marco", description: "Venezia centro", dailyCost: 250 },
        { label: "Castello", description: "Venezia centro", dailyCost: 250 },
        { label: "Giudecca", description: "Isole (barca)", dailyCost: 300 },
        { label: "Murano", description: "Isole (barca)", dailyCost: 300 },
        { label: "Lido", description: "Raggiungibile via Ferry Boat", dailyCost: 0 },
        { label: "Burano", description: "Isole settentrionali (barca)", dailyCost: 350 },
        { label: "Torcello", description: "Isole settentrionali (barca)", dailyCost: 350 },
        { label: "Pellestrina", description: "Raggiungibile via Ferry Boat", dailyCost: 400 },
      ];

      const trfBarVariants = [
        { label: "Barca piccola con gru", description: "Fino a 6 ton", price: 510, isDefault: true },
        { label: "Barca grande con gru", description: "Oltre 6 ton", price: 510 },
      ];

      const results: string[] = [];

      if (trfVen) {
        await storage.updateArticle(trfVen.id, userCompany.companyId, { variantsData: trfVenVariants });
        results.push("TRF-VEN: variantsData aggiornato con 12 zone individuali");
      } else {
        results.push("TRF-VEN: non trovato — eseguire prima Inizializza Listino");
      }

      if (!trfBar) {
        await storage.createArticle({
          code: "TRA-BAR",
          name: "Barca Lagunare",
          description: "Trasporto con barca lagunare per cantieri a Venezia — costo a corpo per direzione",
          category: "TRANSPORT",
          unitType: "AC",
          pricingLogic: "SERVICE",
          basePrice: "510.00",
          pricingData: { price: 510 },
          trasfertaData: { costo1Label: "Prezzo barca", costo1Value: 510, costo1Unit: "€/viaggio", costo2Label: "", costo2Value: 0, costo2Unit: "" },
          variantsData: trfBarVariants,
          companyId: userCompany.companyId,
          isActive: 1,
          isChecklistItem: 0,
          checklistOrder: 0,
        });
        results.push("TRA-BAR: creato con 2 varianti (Piccola/Grande con gru)");
      } else {
        const updates: Record<string, unknown> = { variantsData: trfBarVariants };
        if (trfBar.code === "TRF-BAR") {
          updates.code = "TRA-BAR";
          updates.category = "TRANSPORT";
        }
        await storage.updateArticle(trfBar.id, userCompany.companyId, updates);
        results.push("TRA-BAR: variantsData aggiornato" + (trfBar.code === "TRF-BAR" ? " + codice corretto TRF→TRA" : ""));
      }

      if (tra001) {
        const pricingData = tra001.pricingData as TransportPricingData;
        if (pricingData?.vehicles) {
          const vehicleDefaults: Record<string, { banchinaCost: number; ferryLidoCost: number; ferryPellesCost: number }> = {
            "Furgone DAILY (9)": { banchinaCost: 70, ferryLidoCost: 493, ferryPellesCost: 593 },
            "Camion DAF LF (2)": { banchinaCost: 70, ferryLidoCost: 688, ferryPellesCost: 808 },
            "Camion DAF CF (10)": { banchinaCost: 130, ferryLidoCost: 948, ferryPellesCost: 1113 },
            "Camion DAF CF (10) + RIM": { banchinaCost: 200, ferryLidoCost: 1083, ferryPellesCost: 1248 },
          };
          const updatedVehicles = pricingData.vehicles.map((v: TransportVehicle) => {
            const defaults = vehicleDefaults[v.name];
            if (defaults && !v.banchinaCost && !v.ferryLidoCost && !v.ferryPellesCost) {
              return { ...v, ...defaults };
            }
            return v;
          });
          await storage.updateArticle(tra001.id, userCompany.companyId, { pricingData: { ...pricingData, vehicles: updatedVehicles } });
          results.push("TRA-001: costi Venezia aggiunti ai veicoli");
        }
      } else {
        results.push("TRA-001: non trovato — eseguire prima Inizializza Listino");
      }

      res.json({ message: "Migrazione trasporti Venezia completata", results });
    } catch (error) {
      console.error("Error migrating Venice transport:", error);
      res.status(500).json({ message: "Errore nella migrazione trasporti Venezia" });
    }
  });

  // ============ QUOTES (Preventivi) ============

  // GET /api/opportunities/:opportunityId/quotes - Lista preventivi di un'opportunità
  app.get("/api/opportunities/:opportunityId/quotes", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const quotes = await storage.getQuotesByOpportunity(req.params.opportunityId, userCompany.companyId);
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching quotes:", error);
      res.status(500).json({ message: "Errore nel recupero dei preventivi" });
    }
  });

  // GET /api/quotes/latest-numbers - Numeri ultimo preventivo per ogni opportunità
  app.get("/api/quotes/latest-numbers", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const allQuotes = await db
        .select({
          id: quotes.id,
          opportunityId: quotes.opportunityId,
          number: quotes.number,
          createdAt: quotes.createdAt,
        })
        .from(quotes)
        .where(eq(quotes.companyId, userCompany.companyId))
        .orderBy(desc(quotes.createdAt));

      const latestByOpp = new Map<string, string>();
      for (const q of allQuotes) {
        if (q.opportunityId && q.number && !latestByOpp.has(q.opportunityId)) {
          latestByOpp.set(q.opportunityId, q.number);
        }
      }
      const result = Array.from(latestByOpp.entries()).map(([opportunityId, number]) => ({
        opportunityId,
        number,
      }));
      res.json(result);
    } catch (error) {
      console.error("Error fetching latest quote numbers:", error);
      res.status(500).json({ message: "Errore nel recupero dei numeri preventivo" });
    }
  });

  // GET /api/quotes/next-number - Prossimo numero preventivo
  app.get("/api/quotes/next-number", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const nextNumber = await storage.getNextQuoteNumber(userCompany.companyId);
      res.json({ number: nextNumber });
    } catch (error) {
      console.error("Error getting next quote number:", error);
      res.status(500).json({ message: "Errore nel recupero del numero preventivo" });
    }
  });

  // GET /api/quotes/:id - Dettaglio preventivo con righe
  app.get("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role) && role !== "TECHNICIAN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const quote = await storage.getQuote(req.params.id, userCompany.companyId);
      if (!quote) {
        return res.status(404).json({ message: "Preventivo non trovato" });
      }

      const items = await storage.getQuoteItems(quote.id);
      res.json({ ...quote, items });
    } catch (error) {
      console.error("Error fetching quote:", error);
      res.status(500).json({ message: "Errore nel recupero del preventivo" });
    }
  });

  // POST /api/quotes/preview - Calcola anteprima preventivo (stateless, non salva)
  // USA LA FUNZIONE CONDIVISA per garantire consistenza con POST /api/quotes
  app.post("/api/quotes/preview", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const { items, params, handlingData } = req.body as { 
        items: QuoteItemInput[]; 
        params: QuotePreviewParams;
        handlingData?: HandlingData;
      };

      // Estrai voci "A corpo" (se presenti) - vengono trattate come NOLEGGIO
      const aCorpoItems = params?.aCorpoItems || [];

      // Permetti preview con solo voci A corpo (senza items da catalogo)
      const hasItems = items && Array.isArray(items) && items.length > 0;
      const hasACorpo = aCorpoItems.length > 0;

      if (!hasItems && !hasACorpo) {
        return res.status(400).json({ message: "Nessun articolo selezionato" });
      }

      if (!params || typeof params.durationMonths !== "number" || typeof params.distanceKm !== "number") {
        return res.status(400).json({ message: "Parametri mancanti: durationMonths e distanceKm sono obbligatori" });
      }

      // Recupera tutti gli articoli per risolvere i nomi delle voci a corpo
      const allArticles = await storage.getArticlesByCompany(userCompany.companyId);

      // Usa funzione condivisa per calcolo (se ci sono items da catalogo)
      const calcResult = hasItems 
        ? await calculateQuoteItemsWithPhases(items, params, userCompany.companyId)
        : { items: [], phaseSubtotals: { DOCUMENTI: 0, TRASPORTO_ANDATA: 0, MOVIMENTAZIONE_MAGAZZINO: 0, MONTAGGIO: 0, NOLEGGIO: 0, SMONTAGGIO: 0, TRASPORTO_RITORNO: 0 }, total: 0 };

      const aCorpoResult = buildACorpoItems(aCorpoItems, allArticles, "STD");
      calcResult.items.push(...aCorpoResult.items);
      calcResult.phaseSubtotals.MONTAGGIO += aCorpoResult.montaggioTotal;
      calcResult.phaseSubtotals.SMONTAGGIO += aCorpoResult.smontaggioTotal;
      calcResult.phaseSubtotals.NOLEGGIO += aCorpoResult.noleggioTotal;
      calcResult.total += aCorpoResult.montaggioTotal + aCorpoResult.smontaggioTotal + aCorpoResult.noleggioTotal;

      const adjustedItems = calcResult.items;
      const adjustedSubtotals = calcResult.phaseSubtotals;
      const minimumApplied = { montaggio: false, smontaggio: false };
      const adjustedTotal = Object.values(adjustedSubtotals).reduce((sum, val) => sum + val, 0);
      const result = { items: adjustedItems, phaseSubtotals: adjustedSubtotals, total: adjustedTotal };

      // Calcola costi movimentazione (se abilitata)
      const handlingResult = await calculateHandlingCost(handlingData, userCompany.companyId);

      // Costruisci le fasi raggruppate (nell'ordine Excel)
      const phaseOrder: QuotePhase[] = [
        "DOCUMENTI", "TRASPORTO_ANDATA", "MOVIMENTAZIONE_MAGAZZINO", "MONTAGGIO", 
        "NOLEGGIO", "SMONTAGGIO", "TRASPORTO_RITORNO"
      ];

      const phases: PhaseSection[] = phaseOrder.map(phase => ({
        phase,
        label: PHASE_LABELS[phase],
        items: result.items.filter(item => item.phase === phase),
        subtotal: result.phaseSubtotals[phase],
      })).filter(p => p.items.length > 0 || p.subtotal > 0);

      // Costruisci sezioni per retrocompatibilità
      const sections = {
        documenti: result.phaseSubtotals.DOCUMENTI,
        trasporto_andata: result.phaseSubtotals.TRASPORTO_ANDATA,
        montaggio: result.phaseSubtotals.MONTAGGIO,
        noleggio: result.phaseSubtotals.NOLEGGIO,
        smontaggio: result.phaseSubtotals.SMONTAGGIO,
        trasporto_ritorno: result.phaseSubtotals.TRASPORTO_RITORNO,
      };

      // Totale finale = items + movimentazione (A corpo già incluso in NOLEGGIO)
      const totalWithHandling = result.total + handlingResult.total;

      res.json({ 
        items: result.items, 
        phases, 
        sections, 
        total: result.total,
        handling: handlingResult,
        grandTotal: totalWithHandling,
        minimumApplied: { ...minimumApplied, magazzino: false },
      });
    } catch (error) {
      console.error("Error calculating quote preview:", error);
      res.status(500).json({ message: "Errore nel calcolo del preventivo" });
    }
  });

  // POST /api/quotes/preview-phases - Calcola anteprima preventivo MULTI-FASE (modalità "phases")
  app.post("/api/quotes/preview-phases", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      interface FaseInput {
        id: string;
        faseIndex: number;
        enabledModules?: string[];
        durationMonths: number;
        distanceKm?: number;
        items?: QuoteItemInput[];
        transportItems?: QuoteItemInput[];
        montaggioItems?: QuoteItemInput[];
        smontaggioItems?: QuoteItemInput[];
        noleggioItems?: QuoteItemInput[];
        fornituraItems?: QuoteItemInput[];
        magazzinoItems?: QuoteItemInput[];
        aCorpoItems?: Array<{ articleId: string; variantIndex?: number; notes?: string; quantity: number; totalPrice: number }>;
        handlingData?: HandlingData;
      }

      const { fasi, documentItems, params } = req.body as {
        fasi: FaseInput[];
        documentItems: QuoteItemInput[];
        params: { distanceKm: number; posManualEnabled?: boolean; posManualPrice?: number; reteAntipolvereQtyML?: number };
      };

      if (!fasi || !Array.isArray(fasi) || fasi.length === 0) {
        return res.status(400).json({ message: "Nessuna fase definita" });
      }

      if (typeof params?.distanceKm !== "number") {
        return res.status(400).json({ message: "Parametro distanceKm obbligatorio" });
      }

      const allArticles = await storage.getArticlesByCompany(userCompany.companyId);

      // 1) Calcola DOCUMENTI (comuni a tutte le fasi) - usa durationMonths della prima fase
      let documentiResult = { 
        items: [] as any[], 
        subtotal: 0 
      };

      if (documentItems && documentItems.length > 0) {
        const docParams: QuotePreviewParams = {
          durationMonths: fasi[0].durationMonths,
          distanceKm: params.distanceKm,
          posManualEnabled: params.posManualEnabled,
          posManualPrice: params.posManualPrice,
          reteAntipolvereQtyML: params.reteAntipolvereQtyML,
        };
        const docCalc = await calculateQuoteItemsWithPhases(documentItems, docParams, userCompany.companyId);
        documentiResult.items = docCalc.items.filter(i => i.phase === "DOCUMENTI");
        documentiResult.subtotal = docCalc.phaseSubtotals.DOCUMENTI;
      }

      // 2) Calcola ogni FASE separatamente
      const fasiResults: Array<{
        id: string;
        faseIndex: number;
        durationMonths: number;
        trasportoAndata: { items: any[]; subtotal: number };
        costoMagazzino: { items: any[]; subtotal: number };
        montaggio: { items: any[]; subtotal: number };
        smontaggio: { items: any[]; subtotal: number };
        trasportoRitorno: { items: any[]; subtotal: number };
        noleggio: { items: any[]; subtotal: number };
        handling: { zones: any[]; saltareti: any; extraPrice: number; total: number } | null;
        faseTotal: number;
      }> = [];

      for (const fase of fasi) {
        const aCorpoItems = fase.aCorpoItems || [];
        const isModular = fase.enabledModules && fase.enabledModules.length > 0;

        const faseParams: QuotePreviewParams = {
          durationMonths: fase.durationMonths,
          distanceKm: fase.distanceKm !== undefined && fase.distanceKm !== null ? fase.distanceKm : params.distanceKm,
          posManualEnabled: params.posManualEnabled,
          posManualPrice: params.posManualPrice,
        };

        const emptyResult = { items: [] as any[], phaseSubtotals: { DOCUMENTI: 0, TRASPORTO_ANDATA: 0, MOVIMENTAZIONE_MAGAZZINO: 0, MONTAGGIO: 0, NOLEGGIO: 0, SMONTAGGIO: 0, TRASPORTO_RITORNO: 0 }, total: 0 };
        
        let calcResult: CalculateResult;

        if (isModular) {
          const allItems: CalculatedItem[] = [];
          const mergedSubtotals: Record<QuotePhase, number> = { DOCUMENTI: 0, TRASPORTO_ANDATA: 0, MOVIMENTAZIONE_MAGAZZINO: 0, MONTAGGIO: 0, NOLEGGIO: 0, SMONTAGGIO: 0, TRASPORTO_RITORNO: 0 };

          if (fase.transportItems && fase.transportItems.length > 0) {
            const r = await calculateQuoteItemsWithPhases(fase.transportItems, faseParams, userCompany.companyId, ["TRASPORTO_ANDATA", "TRASPORTO_RITORNO"]);
            allItems.push(...r.items);
            Object.keys(r.phaseSubtotals).forEach(k => { mergedSubtotals[k as QuotePhase] += r.phaseSubtotals[k as QuotePhase]; });
          }
          if (fase.montaggioItems && fase.montaggioItems.length > 0) {
            const r = await calculateQuoteItemsWithPhases(fase.montaggioItems, faseParams, userCompany.companyId, ["MONTAGGIO", "MOVIMENTAZIONE_MAGAZZINO"]);
            allItems.push(...r.items);
            Object.keys(r.phaseSubtotals).forEach(k => { mergedSubtotals[k as QuotePhase] += r.phaseSubtotals[k as QuotePhase]; });
          }
          if (fase.smontaggioItems && fase.smontaggioItems.length > 0) {
            const r = await calculateQuoteItemsWithPhases(fase.smontaggioItems, faseParams, userCompany.companyId, ["SMONTAGGIO"]);
            allItems.push(...r.items);
            Object.keys(r.phaseSubtotals).forEach(k => { mergedSubtotals[k as QuotePhase] += r.phaseSubtotals[k as QuotePhase]; });
          }
          if (fase.noleggioItems && fase.noleggioItems.length > 0) {
            const r = await calculateQuoteItemsWithPhases(fase.noleggioItems, faseParams, userCompany.companyId, ["NOLEGGIO"]);
            allItems.push(...r.items);
            Object.keys(r.phaseSubtotals).forEach(k => { mergedSubtotals[k as QuotePhase] += r.phaseSubtotals[k as QuotePhase]; });
          }
          if (fase.fornituraItems && fase.fornituraItems.length > 0) {
            const r = await calculateQuoteItemsWithPhases(fase.fornituraItems, faseParams, userCompany.companyId, ["NOLEGGIO"]);
            r.items = r.items.map(item => ({ ...item, _fromFornitura: true }));
            allItems.push(...r.items);
            Object.keys(r.phaseSubtotals).forEach(k => { mergedSubtotals[k as QuotePhase] += r.phaseSubtotals[k as QuotePhase]; });
          }
          if (fase.magazzinoItems && fase.magazzinoItems.length > 0) {
            const r = await calculateQuoteItemsWithPhases(fase.magazzinoItems, faseParams, userCompany.companyId, ["MOVIMENTAZIONE_MAGAZZINO"]);
            allItems.push(...r.items);
            Object.keys(r.phaseSubtotals).forEach(k => { mergedSubtotals[k as QuotePhase] += r.phaseSubtotals[k as QuotePhase]; });
          }
          
          calcResult = { items: allItems, phaseSubtotals: mergedSubtotals, total: Object.values(mergedSubtotals).reduce((s, v) => s + v, 0) };
        } else {
          const hasItems = fase.items && fase.items.length > 0;
          calcResult = hasItems
            ? await calculateQuoteItemsWithPhases(fase.items, faseParams, userCompany.companyId)
            : { ...emptyResult };
        }

        const aCorpoResult = buildACorpoItems(aCorpoItems, allArticles, `F${fase.faseIndex}`);
        calcResult.items.push(...aCorpoResult.items);
        calcResult.phaseSubtotals.MONTAGGIO += aCorpoResult.montaggioTotal;
        calcResult.phaseSubtotals.SMONTAGGIO += aCorpoResult.smontaggioTotal;
        calcResult.phaseSubtotals.NOLEGGIO += aCorpoResult.noleggioTotal;
        calcResult.total += aCorpoResult.montaggioTotal + aCorpoResult.smontaggioTotal + aCorpoResult.noleggioTotal;

        const adjustedItems = calcResult.items;
        const adjustedSubtotals = calcResult.phaseSubtotals;

        // Calcola movimentazione per questa fase
        const handlingResult = await calculateHandlingCost(fase.handlingData, userCompany.companyId);

        // Ricalcola totale fase
        const faseSubtotal = Object.values(adjustedSubtotals).reduce((sum, val) => sum + val, 0);
        const faseTotal = faseSubtotal + handlingResult.total;

        fasiResults.push({
          id: fase.id,
          faseIndex: fase.faseIndex,
          durationMonths: fase.durationMonths,
          trasportoAndata: {
            items: adjustedItems.filter(i => i.phase === "TRASPORTO_ANDATA"),
            subtotal: adjustedSubtotals.TRASPORTO_ANDATA
          },
          costoMagazzino: {
            items: adjustedItems.filter(i => i.phase === "MOVIMENTAZIONE_MAGAZZINO"),
            subtotal: adjustedSubtotals.MOVIMENTAZIONE_MAGAZZINO
          },
          montaggio: {
            items: adjustedItems.filter(i => i.phase === "MONTAGGIO"),
            subtotal: adjustedSubtotals.MONTAGGIO
          },
          smontaggio: {
            items: adjustedItems.filter(i => i.phase === "SMONTAGGIO"),
            subtotal: adjustedSubtotals.SMONTAGGIO
          },
          trasportoRitorno: {
            items: adjustedItems.filter(i => i.phase === "TRASPORTO_RITORNO"),
            subtotal: adjustedSubtotals.TRASPORTO_RITORNO
          },
          noleggio: {
            items: adjustedItems.filter(i => i.phase === "NOLEGGIO"),
            subtotal: adjustedSubtotals.NOLEGGIO
          },
          handling: handlingResult.total > 0 ? handlingResult : null,
          faseTotal: faseTotal
        });
      }

      // 3) Calcola totale complessivo
      const grandTotal = documentiResult.subtotal + fasiResults.reduce((sum, f) => sum + f.faseTotal, 0);

      res.json({
        documenti: documentiResult,
        fasiResults: fasiResults,
        grandTotal
      });
    } catch (error) {
      console.error("Error calculating phases preview:", error);
      res.status(500).json({ message: "Errore nel calcolo del preventivo multi-fase" });
    }
  });

  // POST /api/quotes - Crea nuovo preventivo
  app.post("/api/quotes", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const { opportunityId, items, params, discounts, handlingData, pdfData, transportDetails, ponteggioDetails } = req.body as { 
        opportunityId: string;
        items: QuoteItemInput[]; 
        params: QuotePreviewParams;
        discounts?: QuoteDiscounts;
        handlingData?: HandlingData;
        pdfData?: any;
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
            tipologia: string;
            altezzaMt: number;
            numeroSbarchi: number;
            tipoSbarchi: string;
          };
        };
      };

      if (!opportunityId) {
        return res.status(400).json({ message: "opportunityId è obbligatorio" });
      }

      // Verifica che l'opportunità esista
      const opportunity = await storage.getOpportunity(opportunityId, userCompany.companyId);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunità non trovata" });
      }

      const { customNumber } = req.body;

      // Valida customNumber: se fornito manualmente, verifica che non sia già usato
      if (customNumber) {
        const allCompanyQuotes = await db.select({ number: quotes.number }).from(quotes).where(eq(quotes.companyId, userCompany.companyId));
        const isNumberTaken = allCompanyQuotes.some(q => q.number === customNumber);
        if (isNumberTaken) {
          return res.status(409).json({ message: `Il numero preventivo "${customNumber}" è già utilizzato da un altro preventivo. Scegli un numero diverso.` });
        }
      }

      // Estrai voci "A corpo" - vengono trattate come NOLEGGIO
      const aCorpoItems = params?.aCorpoItems || [];
      const hasItems = items && Array.isArray(items) && items.length > 0;
      const hasACorpo = aCorpoItems.length > 0;
      // Modalità fasi/a_corpo: i dati sono in pdfData.quote.fasiConfig, non in items/aCorpoItems
      const isPhaseLikeQuote = params?.quoteMode === 'phases' || params?.quoteMode === 'a_corpo';

      if (!hasItems && !hasACorpo && !isPhaseLikeQuote) {
        return res.status(400).json({ message: "Nessun articolo selezionato" });
      }

      // Recupera tutti gli articoli per risolvere i nomi delle voci a corpo
      const allArticles = await storage.getArticlesByCompany(userCompany.companyId);

      // Deriva la quantità ML di NOL-010 server-side da pdfData.quote.checklistItems
      // Questo garantisce che il prezzo SRV-004 sia calcolato da dati autorevoli lato server
      const nol010Article = allArticles.find((a: { code: string }) => a.code === "NOL-010");
      if (nol010Article) {
        const checklistArr: [string, { enabled: boolean; quantity: number }][] = pdfData?.quote?.checklistItems || [];
        const nol010Entry = checklistArr.find(([id]) => id === String(nol010Article.id));
        if (nol010Entry && nol010Entry[1].enabled && nol010Entry[1].quantity > 0) {
          params.reteAntipolvereQtyML = nol010Entry[1].quantity;
        } else {
          params.reteAntipolvereQtyML = 0;
        }
      }

      // USA FUNZIONE CONDIVISA per calcolo (se ci sono items da catalogo)
      const rawCalcResult = hasItems 
        ? await calculateQuoteItemsWithPhases(items, params, userCompany.companyId)
        : { items: [], phaseSubtotals: { DOCUMENTI: 0, TRASPORTO_ANDATA: 0, MOVIMENTAZIONE_MAGAZZINO: 0, MONTAGGIO: 0, NOLEGGIO: 0, SMONTAGGIO: 0, TRASPORTO_RITORNO: 0 }, total: 0 };

      const aCorpoResult = buildACorpoItems(aCorpoItems, allArticles, "SM");
      rawCalcResult.items.push(...aCorpoResult.items);
      rawCalcResult.phaseSubtotals.MONTAGGIO += aCorpoResult.montaggioTotal;
      rawCalcResult.phaseSubtotals.SMONTAGGIO += aCorpoResult.smontaggioTotal;
      rawCalcResult.phaseSubtotals.NOLEGGIO += aCorpoResult.noleggioTotal;
      rawCalcResult.total += aCorpoResult.montaggioTotal + aCorpoResult.smontaggioTotal + aCorpoResult.noleggioTotal;

      const adjustedItems = rawCalcResult.items;
      const adjustedSubtotals = rawCalcResult.phaseSubtotals;
      const adjustedTotal = Object.values(adjustedSubtotals).reduce((sum, val) => sum + val, 0);
      const calcResult = { items: adjustedItems, phaseSubtotals: adjustedSubtotals, total: adjustedTotal };

      // Calcola costi movimentazione (se abilitata)
      const handlingResult = await calculateHandlingCost(handlingData, userCompany.companyId);

      // Applica sconti usando funzione condivisa (solo sulla parte items)
      const itemsTotalWithDiscounts = applyDiscounts(calcResult.total, calcResult.phaseSubtotals, discounts);

      // Totale finale = items scontati + movimentazione (A corpo già incluso in NOLEGGIO)
      const backendGrandTotal = itemsTotalWithDiscounts + handlingResult.total;

      // Usa il grandTotal dal frontend (pdfData) se disponibile, perché include trasferta, difficoltà e override
      const frontendGrandTotal = pdfData?.quote?.totals?.grandTotal;
      const grandTotal = (typeof frontendGrandTotal === 'number' && frontendGrandTotal > 0) ? frontendGrandTotal : backendGrandTotal;

      // Crea preventivo con retry: se customNumber causa collisione restituisce 409;
      // se auto-generated causa collisione, ritenta con il prossimo numero disponibile
      const quoteData = {
        opportunityId,
        companyId: userCompany.companyId,
        status: "DRAFT" as const,
        totalAmount: grandTotal.toFixed(2),
        globalParams: {
          durationMonths: params.durationMonths,
          distanceKm: params.distanceKm,
          logisticsDifficulty: params.logisticsDifficulty || "LOW",
          aCorpoItems: params.aCorpoItems,
          posManualEnabled: params.posManualEnabled,
          posManualPrice: params.posManualPrice,
        },
        discounts: discounts || null,
        handlingData: handlingData || null,
        pdfData: pdfData || null,
      };

      let quote;
      if (customNumber) {
        try {
          quote = await storage.createQuoteWithNextNumber(quoteData, customNumber);
        } catch (err: any) {
          if (isUniqueConstraintError(err)) {
            return res.status(409).json({ message: `Il numero preventivo "${customNumber}" è già utilizzato da un altro preventivo. Scegli un numero diverso.` });
          }
          throw err;
        }
      } else {
        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            quote = await storage.createQuoteWithNextNumber(quoteData);
            break;
          } catch (err: any) {
            if (isUniqueConstraintError(err)) {
              lastError = err;
              console.warn(`Conflitto numero preventivo (tentativo ${attempt + 1}/3), ritento...`);
              continue;
            }
            throw err;
          }
        }
        if (!quote) {
          console.error("Impossibile assegnare numero univoco dopo 3 tentativi:", lastError);
          return res.status(409).json({ message: "Impossibile assegnare un numero univoco al preventivo. Riprova tra qualche secondo." });
        }
      }

      // Crea righe usando dati dal calcolo condiviso (filtra articoli sintetici che non esistono in DB)
      const quoteItemsData = calcResult.items
        .filter(item => !isSyntheticArticleId(item.articleId))
        .map(item => ({
          quoteId: quote.id,
          articleId: item.articleId,
          quantity: String(item.quantity),
          phase: item.phase,
          priceSnapshot: item.priceSnapshot,
          unitPriceApplied: item.unitPrice.toFixed(2),
          totalRow: item.totalRow.toFixed(2),
        }));

      const createdItems = quoteItemsData.length > 0 ? await storage.createQuoteItems(quoteItemsData) : [];

      // Aggiorna opportunità con dettagli tecnici trasporto (se presenti)
      if (transportDetails) {
        await storage.updateOpportunity(opportunityId, userCompany.companyId, {
          transpallet: transportDetails.transpallet ?? null,
          posizCamion: transportDetails.posizCamion ?? null,
          puoScaricare: transportDetails.puoScaricare ?? null,
          luogoScarico: transportDetails.luogoScarico ?? null,
          ritiroEsubero: transportDetails.ritiroEsubero ?? null,
          cartelliStradali: transportDetails.cartelliStradali ?? null,
          permessiViabilita: transportDetails.permessiViabilita ?? null,
          permessoSosta: transportDetails.permessoSosta ?? null,
        });
      }

      // Aggiorna opportunità con dettagli tecnici ponteggio (se presenti)
      if (ponteggioDetails) {
        await storage.updateOpportunity(opportunityId, userCompany.companyId, {
          ponteggioPerArray: ponteggioDetails.ponteggioPerArray ?? null,
          gruCantiere: ponteggioDetails.gruCantiere ?? null,
          luciSegnalazione: ponteggioDetails.luciSegnalazione ?? null,
          aCaricoClienteArray: ponteggioDetails.aCaricoClienteArray ?? null,
          orariLavoro: ponteggioDetails.orariLavoro ?? null,
          ancoraggi: ponteggioDetails.ancoraggi ?? null,
          maestranze: ponteggioDetails.maestranze ?? null,
          montacarichi: ponteggioDetails.montacarichi ?? null,
        });
      }

      await recalcOpportunityValue(opportunityId, userCompany.companyId);

      res.status(201).json({ ...quote, items: createdItems });
    } catch (error: any) {
      console.error("Error creating quote:", error);
      res.status(500).json({ message: "Errore nella creazione del preventivo" });
    }
  });

  // PUT /api/quotes/:id - Aggiorna preventivo esistente (ricalcola e sostituisce righe)
  app.put("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const existingQuote = await storage.getQuote(req.params.id, userCompany.companyId);
      if (!existingQuote) {
        return res.status(404).json({ message: "Preventivo non trovato" });
      }

      const { items, params, discounts, handlingData, pdfData, transportDetails, ponteggioDetails, customNumber } = req.body as {
        items: QuoteItemInput[];
        params: QuotePreviewParams;
        discounts?: QuoteDiscounts;
        handlingData?: HandlingData;
        pdfData?: any;
        transportDetails?: any;
        ponteggioDetails?: any;
        customNumber?: string;
      };

      const aCorpoItems = params?.aCorpoItems || [];
      const hasItems = items && Array.isArray(items) && items.length > 0;
      const hasACorpo = aCorpoItems.length > 0;
      const isPhaseLikeQuote = params?.quoteMode === 'phases' || params?.quoteMode === 'a_corpo';

      if (!hasItems && !hasACorpo && !isPhaseLikeQuote) {
        return res.status(400).json({ message: "Nessun articolo selezionato" });
      }

      const allArticles = await storage.getArticlesByCompany(userCompany.companyId);

      // Deriva la quantità ML di NOL-010 server-side da pdfData.quote.checklistItems
      // Questo garantisce che il prezzo SRV-004 sia calcolato da dati autorevoli lato server
      const nol010ArticlePut = allArticles.find((a: { code: string }) => a.code === "NOL-010");
      if (nol010ArticlePut) {
        const checklistArrPut: [string, { enabled: boolean; quantity: number }][] = pdfData?.quote?.checklistItems || [];
        const nol010EntryPut = checklistArrPut.find(([id]) => id === String(nol010ArticlePut.id));
        if (nol010EntryPut && nol010EntryPut[1].enabled && nol010EntryPut[1].quantity > 0) {
          params.reteAntipolvereQtyML = nol010EntryPut[1].quantity;
        } else {
          params.reteAntipolvereQtyML = 0;
        }
      }

      const rawCalcResult = hasItems
        ? await calculateQuoteItemsWithPhases(items, params, userCompany.companyId)
        : { items: [], phaseSubtotals: { DOCUMENTI: 0, TRASPORTO_ANDATA: 0, MOVIMENTAZIONE_MAGAZZINO: 0, MONTAGGIO: 0, NOLEGGIO: 0, SMONTAGGIO: 0, TRASPORTO_RITORNO: 0 }, total: 0 };

      const aCorpoResult = buildACorpoItems(aCorpoItems, allArticles, "SAVE");
      rawCalcResult.items.push(...aCorpoResult.items);
      rawCalcResult.phaseSubtotals.MONTAGGIO += aCorpoResult.montaggioTotal;
      rawCalcResult.phaseSubtotals.SMONTAGGIO += aCorpoResult.smontaggioTotal;
      rawCalcResult.phaseSubtotals.NOLEGGIO += aCorpoResult.noleggioTotal;
      rawCalcResult.total += aCorpoResult.montaggioTotal + aCorpoResult.smontaggioTotal + aCorpoResult.noleggioTotal;

      const adjustedItems = rawCalcResult.items;
      const adjustedSubtotals = rawCalcResult.phaseSubtotals;
      const adjustedTotal = Object.values(adjustedSubtotals).reduce((sum, val) => sum + val, 0);
      const calcResult = { items: adjustedItems, phaseSubtotals: adjustedSubtotals, total: adjustedTotal };

      const handlingResult = await calculateHandlingCost(handlingData, userCompany.companyId);
      const itemsTotalWithDiscounts = applyDiscounts(calcResult.total, calcResult.phaseSubtotals, discounts);
      const backendGrandTotal = itemsTotalWithDiscounts + handlingResult.total;

      // Usa il grandTotal dal frontend (pdfData) se disponibile, perché include trasferta, difficoltà e override
      const frontendGrandTotal = pdfData?.quote?.totals?.grandTotal;
      const grandTotal = (typeof frontendGrandTotal === 'number' && frontendGrandTotal > 0) ? frontendGrandTotal : backendGrandTotal;

      // Aggiorna quote
      await storage.updateQuote(req.params.id, userCompany.companyId, {
        totalAmount: grandTotal.toFixed(2),
        ...(customNumber ? { number: customNumber } : {}),
        globalParams: {
          durationMonths: params.durationMonths,
          distanceKm: params.distanceKm,
          logisticsDifficulty: params.logisticsDifficulty || "LOW",
          aCorpoItems: params.aCorpoItems,
          posManualEnabled: params.posManualEnabled,
          posManualPrice: params.posManualPrice,
        },
        discounts: discounts || null,
        handlingData: handlingData || null,
        pdfData: pdfData || null,
      });

      // Elimina vecchie righe e ricrea (filtra articoli sintetici)
      await storage.deleteQuoteItems(req.params.id);
      const quoteItemsData = calcResult.items
        .filter(item => !isSyntheticArticleId(item.articleId))
        .map(item => ({
          quoteId: req.params.id,
          articleId: item.articleId,
          quantity: String(item.quantity),
          phase: item.phase,
          priceSnapshot: item.priceSnapshot,
          unitPriceApplied: item.unitPrice.toFixed(2),
          totalRow: item.totalRow.toFixed(2),
        }));
      const createdItems = quoteItemsData.length > 0 ? await storage.createQuoteItems(quoteItemsData) : [];

      // Aggiorna dettagli trasporto/ponteggio sull'opportunità
      if (transportDetails) {
        await storage.updateOpportunity(existingQuote.opportunityId, userCompany.companyId, {
          transpallet: transportDetails.transpallet ?? null,
          posizCamion: transportDetails.posizCamion ?? null,
          puoScaricare: transportDetails.puoScaricare ?? null,
          luogoScarico: transportDetails.luogoScarico ?? null,
          ritiroEsubero: transportDetails.ritiroEsubero ?? null,
          cartelliStradali: transportDetails.cartelliStradali ?? null,
          permessiViabilita: transportDetails.permessiViabilita ?? null,
          permessoSosta: transportDetails.permessoSosta ?? null,
        });
      }
      if (ponteggioDetails) {
        await storage.updateOpportunity(existingQuote.opportunityId, userCompany.companyId, {
          ponteggioPerArray: ponteggioDetails.ponteggioPerArray ?? null,
          gruCantiere: ponteggioDetails.gruCantiere ?? null,
          luciSegnalazione: ponteggioDetails.luciSegnalazione ?? null,
          aCaricoClienteArray: ponteggioDetails.aCaricoClienteArray ?? null,
          orariLavoro: ponteggioDetails.orariLavoro ?? null,
          ancoraggi: ponteggioDetails.ancoraggi ?? null,
          maestranze: ponteggioDetails.maestranze ?? null,
          montacarichi: ponteggioDetails.montacarichi ?? null,
        });
      }

      await recalcOpportunityValue(existingQuote.opportunityId, userCompany.companyId);

      const updatedQuote = await storage.getQuote(req.params.id, userCompany.companyId);
      res.json({ ...updatedQuote, items: createdItems });
    } catch (error) {
      console.error("Error updating quote:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del preventivo" });
    }
  });

  // PATCH /api/quotes/:id/status - Aggiorna stato preventivo
  app.patch("/api/quotes/:id/status", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const { status } = req.body;
      if (!status || !quoteStatusEnum.includes(status)) {
        return res.status(400).json({ message: "Stato non valido" });
      }

      const quote = await storage.updateQuote(req.params.id, userCompany.companyId, { status });
      if (!quote) {
        return res.status(404).json({ message: "Preventivo non trovato" });
      }

      res.json(quote);
    } catch (error) {
      console.error("Error updating quote status:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del preventivo" });
    }
  });

  // PATCH /api/quotes/:quoteId/items/:itemId - Aggiorna singola riga preventivo
  // Accetta unitPriceApplied senza resettarlo al prezzo listino
  app.patch("/api/quotes/:quoteId/items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const { quoteId, itemId } = req.params;

      // Verifica che il preventivo esista e appartenga all'azienda
      const quote = await storage.getQuote(quoteId, userCompany.companyId);
      if (!quote) {
        return res.status(404).json({ message: "Preventivo non trovato" });
      }

      // Verifica che l'item esista
      const existingItem = await storage.getQuoteItem(itemId, quoteId);
      if (!existingItem) {
        return res.status(404).json({ message: "Riga preventivo non trovata" });
      }

      // Estrai i campi aggiornabili dal body
      const { unitPriceApplied, quantity } = req.body;

      const updateData: { unitPriceApplied?: string; quantity?: string; totalRow?: string } = {};

      // Usa il prezzo inviato dal frontend SENZA resettarlo al listino
      if (unitPriceApplied !== undefined) {
        updateData.unitPriceApplied = String(unitPriceApplied);
      }

      if (quantity !== undefined) {
        updateData.quantity = String(quantity);
      }

      // Ricalcola totalRow se abbiamo abbastanza dati
      const finalUnitPrice = updateData.unitPriceApplied 
        ? parseFloat(updateData.unitPriceApplied) 
        : parseFloat(existingItem.unitPriceApplied);
      const finalQuantity = updateData.quantity 
        ? parseFloat(updateData.quantity) 
        : parseFloat(existingItem.quantity);

      updateData.totalRow = (finalUnitPrice * finalQuantity).toFixed(2);

      const updatedItem = await storage.updateQuoteItem(itemId, quoteId, updateData);
      if (!updatedItem) {
        return res.status(500).json({ message: "Errore nell'aggiornamento" });
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating quote item:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento della riga preventivo" });
    }
  });

  // DELETE /api/quotes/:id - Elimina preventivo
  app.delete("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const quoteToDelete = await storage.getQuote(req.params.id, userCompany.companyId);
      if (!quoteToDelete) {
        return res.status(404).json({ message: "Preventivo non trovato" });
      }

      const deleted = await storage.deleteQuote(req.params.id, userCompany.companyId);
      if (!deleted) {
        return res.status(404).json({ message: "Preventivo non trovato" });
      }

      await recalcOpportunityValue(quoteToDelete.opportunityId, userCompany.companyId);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting quote:", error);
      res.status(500).json({ message: "Errore nell'eliminazione del preventivo" });
    }
  });

  // GET /api/users/assignable - Lista utenti assegnabili (SALES_AGENT e COMPANY_ADMIN)
  app.get("/api/users/assignable", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const allUsers = await storage.getUsersByCompanyId(userCompany.companyId);
      const assignableUsers = allUsers
        .filter(u => u.role === "SALES_AGENT" || u.role === "COMPANY_ADMIN")
        .map(({ profileImageData, ...u }) => u);

      res.json(assignableUsers);
    } catch (error) {
      console.error("Error fetching assignable users:", error);
      res.status(500).json({ message: "Errore nel recupero degli utenti" });
    }
  });

  app.get("/api/users/technicians", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const allUsers = await storage.getUsersByCompanyId(userCompany.companyId);
      const technicians = allUsers
        .filter(u => u.role === "TECHNICIAN")
        .map(({ profileImageData, ...u }) => u);
      res.json(technicians);
    } catch (error) {
      console.error("Error fetching technicians:", error);
      res.status(500).json({ message: "Errore nel recupero dei tecnici" });
    }
  });

  // GET /api/activities - Ultime attività dell'azienda
  app.get("/api/activities", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role === "SUPER_ADMIN") {
        return res.status(403).json({ message: "Super Admin non ha accesso alle attività aziendali" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const activities = await storage.getActivitiesByCompany(userCompany.companyId, Math.min(limit, 100));
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Errore nel recupero delle attività" });
    }
  });

  // GET /api/opportunities/:id - Dettaglio singola opportunità
  app.get("/api/opportunities/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const opportunity = await storage.getOpportunity(req.params.id, userCompany.companyId);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunità non trovata" });
      }

      const lead = await storage.getLead(opportunity.leadId, userCompany.companyId);
      const leadNotes = lead?.notes || null;
      const leadName = lead
        ? (lead.entityType === "COMPANY"
          ? lead.name || ""
          : `${lead.firstName || ""} ${lead.lastName || ""}`.trim())
        : null;

      const allProjects = await storage.getProjectsByCompany(userCompany.companyId);
      const linkedProjects = allProjects.filter(p => p.opportunityId === opportunity.id);
      const projectNotes = linkedProjects
        .filter(p => p.notes)
        .map(p => ({ projectId: p.id, clientName: p.clientName, notes: p.notes }));

      res.json({ ...opportunity, leadNotes, leadName, projectNotes });
    } catch (error) {
      console.error("Error fetching opportunity:", error);
      res.status(500).json({ message: "Errore nel recupero dell'opportunità" });
    }
  });

  // POST /api/opportunities - Crea nuova opportunità
  app.post("/api/opportunities", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const validationSchema = insertOpportunitySchema.omit({ companyId: true, wonAt: true, lostAt: true, quoteSentAt: true, quoteReminderSnoozedUntil: true });
      const validatedData = validationSchema.parse(req.body);

      // Verifica che il lead esista e appartenga alla stessa azienda
      const lead = await storage.getLead(validatedData.leadId, userCompany.companyId);
      if (!lead) {
        return res.status(400).json({ message: "Lead non trovato o non appartiene alla tua azienda" });
      }

      // Verifica che lo stage esista e appartenga alla stessa azienda (se specificato)
      if (validatedData.stageId) {
        const stage = await storage.getStage(validatedData.stageId, userCompany.companyId);
        if (!stage) {
          return res.status(400).json({ message: "Fase pipeline non trovata" });
        }
      }

      // Eredita automaticamente l'assegnazione dal lead
      const opportunity = await storage.createOpportunity({
        ...validatedData,
        companyId: userCompany.companyId,
        assignedToUserId: validatedData.assignedToUserId || lead.assignedToUserId,
      });

      // Log creazione opportunità
      await storage.createActivityLog({
        companyId: userCompany.companyId,
        userId,
        entityType: "opportunity",
        entityId: opportunity.id,
        action: "created",
        details: { 
          title: opportunity.title, 
          value: opportunity.value,
          leadId: opportunity.leadId,
          leadName: `${lead.firstName} ${lead.lastName}`,
        },
      });

      res.status(201).json(opportunity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error creating opportunity:", error);
      res.status(500).json({ message: "Errore nella creazione dell'opportunità" });
    }
  });

  // PATCH /api/opportunities/:id - Aggiorna opportunità
  app.patch("/api/opportunities/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const body = { ...req.body };
      if (body.estimatedStartDate && typeof body.estimatedStartDate === "string") {
        body.estimatedStartDate = new Date(body.estimatedStartDate);
      }
      if (body.estimatedEndDate && typeof body.estimatedEndDate === "string") {
        body.estimatedEndDate = new Date(body.estimatedEndDate);
      }

      const validationSchema = insertOpportunitySchema.omit({ companyId: true, wonAt: true, lostAt: true, quoteSentAt: true, quoteReminderSnoozedUntil: true }).partial();
      const validatedData = validationSchema.parse(body);

      // Verifica che lo stage esista se viene aggiornato
      let patchStage: { name: string } | null = null;
      if (validatedData.stageId) {
        const stage = await storage.getStage(validatedData.stageId, userCompany.companyId);
        if (!stage) {
          return res.status(400).json({ message: "Fase pipeline non trovata" });
        }
        patchStage = stage;
      }

      // Recupera opportunità esistente per log dei cambiamenti
      const existingOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);

      // Imposta wonAt/lostAt/quoteSentAt solo quando lo stage cambia effettivamente
      const stageActuallyChanged = patchStage && validatedData.stageId !== existingOpp?.stageId;
      const dataWithTimestamps: typeof validatedData & { wonAt?: Date | null; lostAt?: Date | null; quoteSentAt?: Date } = { ...validatedData };
      if (stageActuallyChanged && patchStage) {
        if (patchStage.name === "Vinto") {
          dataWithTimestamps.wonAt = new Date();
          dataWithTimestamps.lostAt = null;
        } else if (patchStage.name === "Perso") {
          dataWithTimestamps.lostAt = new Date();
          dataWithTimestamps.wonAt = null;
        } else {
          dataWithTimestamps.wonAt = null;
          dataWithTimestamps.lostAt = null;
        }
        if (patchStage.name === "Preventivo Inviato" && !existingOpp?.quoteSentAt) {
          dataWithTimestamps.quoteSentAt = new Date();
        }
      }

      const opportunity = await storage.updateOpportunity(req.params.id, userCompany.companyId, dataWithTimestamps);

      if (!opportunity) {
        return res.status(404).json({ message: "Opportunità non trovata" });
      }

      // Quando l'opportunità diventa "Vinto" (stage effettivamente cambiato), approva automaticamente tutti i preventivi collegati
      if (stageActuallyChanged && patchStage?.name === "Vinto") {
        try {
          const oppQuotes = await storage.getQuotesByOpportunity(opportunity.id, userCompany.companyId);
          for (const q of oppQuotes) {
            if (q.status !== "ACCEPTED") {
              await storage.updateQuote(q.id, userCompany.companyId, { status: "ACCEPTED" });
            }
          }
        } catch (quoteErr) {
          console.error("Error auto-approving quotes on Vinto:", quoteErr);
        }
      }

      if (validatedData.lostReason === "NOT_IN_TARGET" && opportunity.leadId) {
        try {
          await storage.updateLead(opportunity.leadId, userCompany.companyId, { type: "non_in_target" } as any);
        } catch (err) {
          console.error("Error auto-updating lead type to non_in_target:", err);
        }
      }

      if (validatedData.sopralluogoFatto !== undefined) {
        try {
          const linkedProject = await storage.getProjectByOpportunity(opportunity.id, userCompany.companyId);
          if (linkedProject) {
            await storage.updateProject(linkedProject.id, userCompany.companyId, {
              sopralluogoFatto: validatedData.sopralluogoFatto,
            } as any);
          }
        } catch (syncErr) {
          console.error("Error syncing sopralluogoFatto to project:", syncErr);
        }
      }

      // Auto-geocoding quando cambia l'indirizzo cantiere
      if ((validatedData.siteAddress || validatedData.siteCity) && !validatedData.siteLatitude) {
        const addr = `${opportunity.siteAddress || ""} ${opportunity.siteZip || ""} ${opportunity.siteCity || ""} Italia`;
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=it`,
            { headers: { "User-Agent": "DaDoPonteggiCRM/1.0" } }
          );
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
            await storage.updateOpportunity(req.params.id, userCompany.companyId, {
              siteLatitude: geoData[0].lat,
              siteLongitude: geoData[0].lon,
            } as any);
            opportunity.siteLatitude = geoData[0].lat;
            opportunity.siteLongitude = geoData[0].lon;
          }
        } catch (geoErr) {
          console.error("Geocoding error:", geoErr);
        }
      }

      // Log aggiornamento opportunità
      if (existingOpp) {
        const changes: Record<string, { old: unknown; new: unknown }> = {};
        for (const key of Object.keys(validatedData) as (keyof typeof validatedData)[]) {
          if (existingOpp[key] !== (validatedData as Record<string, unknown>)[key]) {
            changes[key] = { old: existingOpp[key], new: (validatedData as Record<string, unknown>)[key] };
          }
        }
        if (Object.keys(changes).length > 0) {
          await storage.createActivityLog({
            companyId: userCompany.companyId,
            userId,
            entityType: "opportunity",
            entityId: opportunity.id,
            action: "updated",
            details: { title: opportunity.title, changes },
          });
        }
      }

      res.json(opportunity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error updating opportunity:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'opportunità" });
    }
  });

  // PUT /api/opportunities/:id/move - Sposta opportunità in nuova fase (Kanban)
  app.put("/api/opportunities/:id/move", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const { stageId } = req.body;
      if (!stageId) {
        return res.status(400).json({ message: "stageId obbligatorio" });
      }

      // Recupera opportunità e stage precedente per il log
      const existingOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);
      const previousStage = existingOpp?.stageId ? await storage.getStage(existingOpp.stageId, userCompany.companyId) : null;
      const newStage = await storage.getStage(stageId, userCompany.companyId);

      const opportunity = await storage.moveOpportunityToStage(req.params.id, stageId, userCompany.companyId);

      if (!opportunity) {
        return res.status(404).json({ message: "Opportunità o fase non trovati" });
      }

      // Log spostamento opportunità
      if (existingOpp && previousStage?.id !== stageId) {
        await storage.createActivityLog({
          companyId: userCompany.companyId,
          userId,
          entityType: "opportunity",
          entityId: opportunity.id,
          action: "moved",
          details: { 
            title: opportunity.title,
            fromStage: previousStage?.name || "Nessuna fase",
            toStage: newStage?.name || "Sconosciuto",
          },
        });
      }

      // Se si sposta FUORI da "Vinto", elimina il progetto collegato e notifica i tecnici
      if (previousStage?.name === "Vinto" && newStage?.name !== "Vinto") {
        try {
          const existingProject = await storage.getProjectByOpportunity(opportunity.id, userCompany.companyId);
          if (existingProject) {
            await storage.deleteProject(existingProject.id, userCompany.companyId);
            console.log(`Progetto eliminato: opportunità "${opportunity.title}" spostata da Vinto a ${newStage?.name}`);
            try {
              await storage.createNotificationsForCompanyRoles(
                userCompany.companyId,
                ["TECHNICIAN"],
                {
                  type: "PROJECT_CANCELLED",
                  title: "Cantiere annullato",
                  message: `${existingProject.clientName} — verifica eventuali lavori già eseguiti`,
                  link: "/sal",
                }
              );
            } catch (notifErr) {
              console.error("Error sending PROJECT_CANCELLED notification:", notifErr);
            }
          }
        } catch (projErr) {
          console.error("Error deleting project on Vinto exit:", projErr);
        }
      }

      // Auto-creazione progetto quando opportunità passa a "Vinto"
      if (newStage && newStage.name === "Vinto") {
        try {
          const existingProject = await storage.getProjectByOpportunity(opportunity.id, userCompany.companyId);
          if (!existingProject) {
            const lead = await storage.getLead(opportunity.leadId, userCompany.companyId);
            const clientName = lead ? (lead.entityType === "COMPANY" && lead.name ? lead.name : `${lead.firstName} ${lead.lastName}`) : opportunity.title;
            
            const projectStagesForCompany = await storage.getProjectStagesByCompany(userCompany.companyId);
            let firstStageId: string | null = null;
            if (projectStagesForCompany.length === 0) {
              const defaultProjectStages = [
                { name: "Acquisti", order: 1, color: "#4563FF" },
                { name: "Ricorrenti", order: 2, color: "#8B5CF6" },
                { name: "Da preparare", order: 3, color: "#F59E0B" },
                { name: "In lavorazione", order: 4, color: "#3B82F6" },
                { name: "In attesa di conferma progetto", order: 5, color: "#EC4899" },
                { name: "In attesa di RDC (Zanella)", order: 6, color: "#F97316" },
                { name: "In attesa di RDC (Damiani)", order: 7, color: "#EF4444" },
                { name: "Completata", order: 8, color: "#059669" },
              ];
              for (const ps of defaultProjectStages) {
                const created = await storage.createProjectStage({ ...ps, companyId: userCompany.companyId });
                if (ps.order === 1) firstStageId = created.id;
              }
            } else {
              firstStageId = projectStagesForCompany[0].id;
            }

            const projectData: any = {
              opportunityId: opportunity.id,
              companyId: userCompany.companyId,
              clientName,
              workType: opportunity.workType || "PRIVATE",
              sopralluogoFatto: opportunity.sopralluogoFatto ?? false,
              stageId: firstStageId,
            };
            if (opportunity.siteAddress) projectData.siteAddress = opportunity.siteAddress;
            if (opportunity.siteCity) projectData.siteCity = opportunity.siteCity;
            if (opportunity.siteProvince) projectData.siteProvince = opportunity.siteProvince;
            if (opportunity.siteZip) projectData.siteZip = opportunity.siteZip;
            if (opportunity.estimatedStartDate) projectData.estimatedStartDate = new Date(opportunity.estimatedStartDate);
            if (opportunity.estimatedEndDate) projectData.estimatedEndDate = new Date(opportunity.estimatedEndDate);

            await storage.createProject(projectData);
            console.log(`Progetto auto-creato per opportunità "${opportunity.title}" (${opportunity.id})`);

            try {
              const siteInfo = opportunity.siteAddress ? ` - ${opportunity.siteAddress}` : '';
              await storage.createNotificationsForCompanyRoles(
                userCompany.companyId,
                ["TECHNICIAN"],
                {
                  type: "NEW_PROJECT",
                  title: "Nuovo cantiere acquisito",
                  message: `${clientName}${siteInfo}`,
                  link: "/progetti",
                  isRead: false,
                }
              );

              const freshOpp = await storage.getOpportunity(opportunity.id, userCompany.companyId);
              const sq = (freshOpp as any)?.siteQuality;
              if (sq === "PHOTO_VIDEO" || sq === "PHOTO_ONLY") {
                const estimatedStart = (freshOpp as any)?.estimatedStartDate;
                if (estimatedStart) {
                  const scheduledAt = new Date(estimatedStart);
                  scheduledAt.setDate(scheduledAt.getDate() - 10);
                  await storage.updateOpportunity(opportunity.id, userCompany.companyId, {
                    photoNotificationScheduledAt: scheduledAt,
                    photoNotificationSentAt: null,
                  });
                }
              }
            } catch (notifError) {
              console.error("Errore nella creazione notifiche:", notifError);
            }
          }
        } catch (projectError) {
          console.error("Errore nella creazione automatica del progetto:", projectError);
        }
      }

      // Auto-approva preventivi quando opportunità passa a "Vinto"
      if (newStage && newStage.name === "Vinto") {
        try {
          const oppQuotes = await storage.getQuotesByOpportunity(opportunity.id, userCompany.companyId);
          for (const q of oppQuotes) {
            if (q.status !== "ACCEPTED") {
              await storage.updateQuote(q.id, userCompany.companyId, { status: "ACCEPTED" });
            }
          }
        } catch (quoteErr) {
          console.error("Error auto-approving quotes on Vinto (move):", quoteErr);
        }
      }

      res.json(opportunity);
    } catch (error) {
      console.error("Error moving opportunity:", error);
      res.status(500).json({ message: "Errore nello spostamento dell'opportunità" });
    }
  });

  // POST /api/opportunities/:id/duplicate - Duplica opportunità con preventivo
  app.post("/api/opportunities/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const sourceOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);
      if (!sourceOpp) {
        return res.status(404).json({ message: "Opportunità non trovata" });
      }

      const stages = await storage.getStagesByCompany(userCompany.companyId);
      const firstStage = stages.length > 0 ? stages.sort((a, b) => a.order - b.order)[0] : null;

      const newOppData: InsertOpportunity = {
        title: `${sourceOpp.title} (copia)`,
        description: sourceOpp.description,
        value: null,
        stageId: firstStage?.id || sourceOpp.stageId,
        leadId: sourceOpp.leadId,
        referentId: null,
        companyId: userCompany.companyId,
        assignedToUserId: sourceOpp.assignedToUserId,
        workType: sourceOpp.workType,
        siteAddress: sourceOpp.siteAddress,
        siteCity: sourceOpp.siteCity,
        siteZip: sourceOpp.siteZip,
        siteProvince: sourceOpp.siteProvince,
        mapsLink: sourceOpp.mapsLink,
        siteDistanceKm: sourceOpp.siteDistanceKm,
        siteSquadraInZonaKm: sourceOpp.siteSquadraInZonaKm,
        veniceZone: sourceOpp.veniceZone,
        siteLatitude: sourceOpp.siteLatitude,
        siteLongitude: sourceOpp.siteLongitude,
        lostReason: null,
        siteQuality: null,
        transpallet: sourceOpp.transpallet,
        posizCamion: sourceOpp.posizCamion,
        puoScaricare: sourceOpp.puoScaricare,
        luogoScarico: sourceOpp.luogoScarico,
        ritiroEsubero: sourceOpp.ritiroEsubero,
        cartelliStradali: sourceOpp.cartelliStradali,
        permessiViabilita: sourceOpp.permessiViabilita,
        permessoSosta: sourceOpp.permessoSosta,
        ponteggioPerArray: sourceOpp.ponteggioPerArray,
        gruCantiere: sourceOpp.gruCantiere,
        luciSegnalazione: sourceOpp.luciSegnalazione,
        aCaricoClienteArray: sourceOpp.aCaricoClienteArray,
        orariLavoro: sourceOpp.orariLavoro,
        ancoraggi: sourceOpp.ancoraggi,
        ponteggioPerAltroNote: sourceOpp.ponteggioPerAltroNote,
        aCaricoClienteAltroNote: sourceOpp.aCaricoClienteAltroNote,
        ancoraggiAltroNote: sourceOpp.ancoraggiAltroNote,
        maestranze: sourceOpp.maestranze,
        montacarichi: sourceOpp.montacarichi,
        estimatedStartDate: sourceOpp.estimatedStartDate,
        estimatedEndDate: sourceOpp.estimatedEndDate,
        sopralluogoFatto: sourceOpp.sopralluogoFatto,
        expectedCloseDate: sourceOpp.expectedCloseDate,
        probability: sourceOpp.probability,
      };

      const newOpp = await storage.createOpportunity(newOppData);

      const sourceQuotes = await storage.getQuotesByOpportunity(sourceOpp.id, userCompany.companyId);
      const activeQuote = sourceQuotes.find(q => q.status === "ACCEPTED")
        || sourceQuotes.find(q => q.status === "SENT")
        || sourceQuotes.find(q => q.status === "DRAFT")
        || (sourceQuotes.length > 0 ? sourceQuotes[0] : null);

      if (activeQuote) {
        // Retry loop: usa createQuoteWithNextNumber con advisory lock + retry su collisione
        let newQuote = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            newQuote = await storage.createQuoteWithNextNumber({
              opportunityId: newOpp.id,
              companyId: userCompany.companyId,
              status: "DRAFT",
              totalAmount: activeQuote.totalAmount,
              globalParams: activeQuote.globalParams,
              discounts: activeQuote.discounts,
              handlingData: activeQuote.handlingData,
              pdfData: activeQuote.pdfData,
            });
            break;
          } catch (err: any) {
            if (isUniqueConstraintError(err)) {
              lastError = err;
              console.warn(`Conflitto numero preventivo in duplicazione (tentativo ${attempt + 1}/3), ritento...`);
              continue;
            }
            throw err;
          }
        }
        if (!newQuote) {
          throw lastError || new Error("Impossibile assegnare un numero univoco al preventivo duplicato");
        }

        const sourceItems = await storage.getQuoteItems(activeQuote.id);
        if (sourceItems.length > 0) {
          const newItems: InsertQuoteItem[] = sourceItems.map(item => ({
            quoteId: newQuote!.id,
            articleId: item.articleId,
            quantity: item.quantity,
            phase: item.phase,
            priceSnapshot: item.priceSnapshot,
            unitPriceApplied: item.unitPriceApplied,
            totalRow: item.totalRow,
            vatRate: item.vatRate,
          }));
          await storage.createQuoteItems(newItems);
        }
      }

      await storage.createActivityLog({
        companyId: userCompany.companyId,
        userId,
        entityType: "opportunity",
        entityId: newOpp.id,
        action: "created",
        details: {
          title: newOpp.title,
          duplicatedFrom: sourceOpp.id,
          duplicatedFromTitle: sourceOpp.title,
        },
      });

      res.status(201).json(newOpp);
    } catch (error: any) {
      console.error("Error duplicating opportunity:", error);
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({ message: "Impossibile assegnare un numero univoco al preventivo duplicato. Riprova tra qualche secondo." });
      }
      res.status(500).json({ message: "Errore nella duplicazione dell'opportunità" });
    }
  });

  // DELETE /api/opportunities/:id - Elimina opportunità
  app.delete("/api/opportunities/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Recupera opportunità prima dell'eliminazione per il log
      const existingOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);

      const deleted = await storage.deleteOpportunity(req.params.id, userCompany.companyId);

      if (!deleted) {
        return res.status(404).json({ message: "Opportunità non trovata" });
      }

      // Log eliminazione opportunità
      if (existingOpp) {
        await storage.createActivityLog({
          companyId: userCompany.companyId,
          userId,
          entityType: "opportunity",
          entityId: req.params.id,
          action: "deleted",
          details: { title: existingOpp.title, value: existingOpp.value },
        });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting opportunity:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'opportunità" });
    }
  });

  // ============================================
  // SUPER ADMIN API Routes
  // ============================================

  // GET /api/admin/companies - Lista tutte le aziende con conteggio utenti
  app.get("/api/admin/companies", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const companies = await storage.getAllCompaniesWithUserCount();
      res.json(companies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ message: "Errore nel recupero delle aziende" });
    }
  });

  // POST /api/admin/companies - Crea nuova azienda con primo admin (transazione atomica)
  app.post("/api/admin/companies", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const createCompanySchema = z.object({
        companyName: z.string().min(1, "Nome azienda obbligatorio"),
        vatNumber: z.string().optional(),
        address: z.string().optional(),
        adminFirstName: z.string().min(1, "Nome admin obbligatorio"),
        adminLastName: z.string().min(1, "Cognome admin obbligatorio"),
        adminEmail: z.string().email("Email admin non valida"),
        adminPassword: z.string().min(6, "Password deve avere almeno 6 caratteri"),
      });

      const validatedData = createCompanySchema.parse(req.body);

      // Verifica che l'email admin non esista già
      const existingUser = await getUserByEmail(validatedData.adminEmail);
      if (existingUser) {
        return res.status(400).json({ message: "Email admin già registrata nel sistema" });
      }

      // Crea company + admin in transazione atomica (all-or-nothing)
      const { company, admin } = await storage.createCompanyWithAdmin(
        {
          name: validatedData.companyName,
          vatNumber: validatedData.vatNumber || null,
          address: validatedData.address || null,
        },
        {
          firstName: validatedData.adminFirstName,
          lastName: validatedData.adminLastName,
          email: validatedData.adminEmail,
          password: validatedData.adminPassword,
        }
      );

      res.status(201).json({
        company,
        admin: sanitizeUser(admin),
        message: "Azienda e amministratore creati con successo",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Errore nella creazione dell'azienda" });
    }
  });

  // PATCH /api/admin/companies/:id - Modifica azienda
  app.patch("/api/admin/companies/:id", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const updateCompanySchema = z.object({
        name: z.string().min(1, "Nome azienda obbligatorio").optional(),
        vatNumber: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
      });

      const validatedData = updateCompanySchema.parse(req.body);

      const company = await storage.updateCompany(req.params.id, validatedData);

      if (!company) {
        return res.status(404).json({ message: "Azienda non trovata" });
      }

      res.json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error updating company:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'azienda" });
    }
  });

  // DELETE /api/admin/companies/:id - Elimina azienda (cascade su utenti e lead)
  app.delete("/api/admin/companies/:id", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const deleted = await storage.deleteCompanyWithCascade(req.params.id);

      if (!deleted) {
        return res.status(404).json({ message: "Azienda non trovata" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'azienda" });
    }
  });

  // POST /api/admin/sync-opportunity-assignments - Sincronizza venditore da lead a opportunità importate
  // Accessibile solo a COMPANY_ADMIN e SUPER_ADMIN
  app.post("/api/admin/sync-opportunity-assignments", isAuthenticated, async (req, res) => {
    try {
      const { role, id: userId } = req.user!;

      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Accesso negato: richiesto COMPANY_ADMIN o SUPER_ADMIN" });
      }

      // Usa resolveUserCompany che gestisce automaticamente x-company-id header per SUPER_ADMIN
      // COMPANY_ADMIN → companyId della propria azienda
      // SUPER_ADMIN + header x-company-id → quella companyId specifica
      // SUPER_ADMIN senza header → undefined (sync su tutte le aziende)
      const userCompany = await resolveUserCompany(userId, role, req);

      if (role === "COMPANY_ADMIN" && !userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const companyId = userCompany?.companyId;

      const updatedCount = await storage.syncOpportunityAssignments(companyId);

      res.json({
        message: `Sincronizzazione completata: ${updatedCount} opportunità aggiornate`,
        updatedCount,
      });
    } catch (error) {
      console.error("Error syncing opportunity assignments:", error);
      res.status(500).json({ message: "Errore nella sincronizzazione delle opportunità" });
    }
  });

  // POST /api/admin/sync-missing-projects - Crea progetti per opportunità Vinto senza progetto
  // Accessibile solo a COMPANY_ADMIN e SUPER_ADMIN
  app.post("/api/admin/sync-missing-projects", isAuthenticated, async (req, res) => {
    try {
      const { role, id: userId } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const companyId = userCompany.companyId;

      // Trova lo stage "Vinto" per questa azienda
      const stages = await storage.getStagesByCompany(companyId);
      const vintoStage = stages.find(s => s.name === "Vinto");
      if (!vintoStage) {
        return res.status(404).json({ message: "Stage 'Vinto' non trovato" });
      }

      // Recupera il primo project stage (o crea i default)
      const projectStagesForCompany = await storage.getProjectStagesByCompany(companyId);
      let firstStageId: string | null = null;
      if (projectStagesForCompany.length === 0) {
        const defaultProjectStages = [
          { name: "Acquisti", order: 1, color: "#4563FF" },
          { name: "Ricorrenti", order: 2, color: "#8B5CF6" },
          { name: "Da preparare", order: 3, color: "#F59E0B" },
          { name: "In lavorazione", order: 4, color: "#3B82F6" },
          { name: "In attesa di conferma progetto", order: 5, color: "#EC4899" },
          { name: "In attesa di RDC (Zanella)", order: 6, color: "#F97316" },
          { name: "In attesa di RDC (Damiani)", order: 7, color: "#EF4444" },
          { name: "Completata", order: 8, color: "#059669" },
        ];
        for (const ps of defaultProjectStages) {
          const created = await storage.createProjectStage({ ...ps, companyId });
          if (ps.order === 1) firstStageId = created.id;
        }
      } else {
        firstStageId = projectStagesForCompany[0].id;
      }

      // Prendi tutte le opportunità Vinto
      const allOpps = await storage.getOpportunitiesByCompany(companyId);
      const vintoOpps = allOpps.filter(o => o.stageId === vintoStage.id);

      let createdCount = 0;
      let skippedCount = 0;

      for (const opp of vintoOpps) {
        const existingProject = await storage.getProjectByOpportunity(opp.id, companyId);
        if (existingProject) {
          skippedCount++;
          continue;
        }
        const lead = opp.leadId ? await storage.getLead(opp.leadId, companyId) : null;
        const clientName = lead
          ? (lead.entityType === "COMPANY" && lead.name ? lead.name : `${lead.firstName || ""} ${lead.lastName || ""}`.trim())
          : opp.title;
        const projectData: any = {
          opportunityId: opp.id,
          companyId,
          clientName,
          workType: opp.workType || "PRIVATE",
          sopralluogoFatto: opp.sopralluogoFatto ?? false,
          stageId: firstStageId,
        };
        if (opp.siteAddress) projectData.siteAddress = opp.siteAddress;
        if (opp.siteCity) projectData.siteCity = opp.siteCity;
        if (opp.siteProvince) projectData.siteProvince = opp.siteProvince;
        if (opp.siteZip) projectData.siteZip = opp.siteZip;
        if (opp.estimatedStartDate) projectData.estimatedStartDate = new Date(opp.estimatedStartDate);
        if (opp.estimatedEndDate) projectData.estimatedEndDate = new Date(opp.estimatedEndDate);
        await storage.createProject(projectData);
        createdCount++;
      }

      res.json({
        message: `Sync completato: ${createdCount} progetti creati, ${skippedCount} già esistenti`,
        createdCount,
        skippedCount,
        totalVinto: vintoOpps.length,
      });
    } catch (error) {
      console.error("Error syncing missing projects:", error);
      res.status(500).json({ message: "Errore durante la sincronizzazione" });
    }
  });

  // POST /api/opportunities/:id/create-project - Crea progetto per singola opportunità
  app.post("/api/opportunities/:id/create-project", isAuthenticated, async (req, res) => {
    try {
      const { role, id: userId } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const companyId = userCompany.companyId;
      const opp = await storage.getOpportunity(req.params.id, companyId);
      if (!opp) return res.status(404).json({ message: "Opportunità non trovata" });

      const existingProject = await storage.getProjectByOpportunity(opp.id, companyId);
      if (existingProject) {
        return res.status(409).json({ message: "Progetto già esistente per questa opportunità", projectId: existingProject.id });
      }

      const projectStagesForCompany = await storage.getProjectStagesByCompany(companyId);
      let firstStageId: string | null = null;
      if (projectStagesForCompany.length === 0) {
        const defaultProjectStages = [
          { name: "Acquisti", order: 1, color: "#4563FF" },
          { name: "Ricorrenti", order: 2, color: "#8B5CF6" },
          { name: "Da preparare", order: 3, color: "#F59E0B" },
          { name: "In lavorazione", order: 4, color: "#3B82F6" },
        ];
        for (const ps of defaultProjectStages) {
          const created = await storage.createProjectStage({ ...ps, companyId });
          if (ps.order === 1) firstStageId = created.id;
        }
      } else {
        firstStageId = projectStagesForCompany[0].id;
      }

      const lead = opp.leadId ? await storage.getLead(opp.leadId, companyId) : null;
      const clientName = lead
        ? (lead.entityType === "COMPANY" && lead.name ? lead.name : `${lead.firstName || ""} ${lead.lastName || ""}`.trim())
        : opp.title;
      const projectData: any = {
        opportunityId: opp.id,
        companyId,
        clientName,
        workType: opp.workType || "PRIVATE",
        sopralluogoFatto: opp.sopralluogoFatto ?? false,
        stageId: firstStageId,
      };
      if (opp.siteAddress) projectData.siteAddress = opp.siteAddress;
      if (opp.siteCity) projectData.siteCity = opp.siteCity;
      if (opp.siteProvince) projectData.siteProvince = opp.siteProvince;
      if (opp.siteZip) projectData.siteZip = opp.siteZip;
      if (opp.estimatedStartDate) projectData.estimatedStartDate = new Date(opp.estimatedStartDate);
      if (opp.estimatedEndDate) projectData.estimatedEndDate = new Date(opp.estimatedEndDate);
      const project = await storage.createProject(projectData);
      res.status(201).json({ message: "Progetto creato", project });
    } catch (error) {
      console.error("Error creating project for opportunity:", error);
      res.status(500).json({ message: "Errore nella creazione del progetto" });
    }
  });

  app.get("/api/company", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const companyId = await getOrCreateUserCompany(userId);
      const company = await storage.getCompany(companyId);

      if (!company) {
        return res.status(404).json({ message: "Azienda non trovata" });
      }

      res.json(company);
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ message: "Errore nel recupero dell'azienda" });
    }
  });

  // Schema validazione per update company
  const updateCompanySchema = z.object({
    name: z.string().min(1).optional(),
    vatNumber: z.string().optional(),
    fiscalCode: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    shareCapital: z.string().optional(),
    iban: z.string().optional(),
    logoUrl: z.string().optional(),
  });

  app.patch("/api/company", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono modificare i dati azienda
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato. Solo gli amministratori possono modificare i dati aziendali." });
      }

      const companyId = await getOrCreateUserCompany(userId);

      // Validazione dati
      const validatedData = updateCompanySchema.parse(req.body);

      // Filtra campi vuoti o undefined
      const updateData: Record<string, any> = {};
      for (const [key, value] of Object.entries(validatedData)) {
        if (value !== undefined) {
          updateData[key] = value === "" ? null : value;
        }
      }

      const company = await storage.updateCompany(companyId, updateData);

      if (!company) {
        return res.status(404).json({ message: "Azienda non trovata" });
      }

      res.json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error updating company:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'azienda" });
    }
  });

  // ============ TEAM MANAGEMENT (COMPANY_ADMIN+) ============

  // GET /api/users - Lista utenti della stessa azienda
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono vedere la lista utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // SUPER_ADMIN senza company non può vedere utenti (deve selezionare un'azienda)
      if (role === "SUPER_ADMIN" && !userCompany) {
        return res.json([]);
      }

      const companyUsers = await storage.getUsersByCompanyId(userCompany!.companyId);

      const safeUsers = companyUsers.map(({ password, profileImageData, ...user }) => user);

      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Errore nel recupero degli utenti" });
    }
  });

  // PATCH /api/users/profile - Aggiorna profilo utente corrente (displayName, contactEmail, phone)
  app.patch("/api/users/profile", isAuthenticated, async (req, res) => {
    try {
      const { id: userId } = req.user!;

      const profileSchema = z.object({
        displayName: z.string().optional(),
        contactEmail: z.string().email("Email non valida").optional().or(z.literal("")),
        phone: z.string().optional(),
      });

      const validatedData = profileSchema.parse(req.body);

      const updatedUser = await storage.updateUserProfile(userId, {
        displayName: validatedData.displayName || undefined,
        contactEmail: validatedData.contactEmail || undefined,
        phone: validatedData.phone || undefined,
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      const { password, profileImageData, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del profilo" });
    }
  });

  // POST /api/users/profile-image - Upload immagine profilo
  app.post("/api/users/profile-image", isAuthenticated, profileImageUpload.single("image"), async (req, res) => {
    try {
      const { id: userId } = req.user!;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "Nessuna immagine caricata" });
      }
      const base64 = file.buffer.toString("base64");
      const dataUri = `data:${file.mimetype};base64,${base64}`;
      const imageUrl = `/api/users/${userId}/profile-image?t=${Date.now()}`;
      const updatedUser = await storage.updateUserProfile(userId, {
        profileImageUrl: imageUrl,
        profileImageData: dataUri,
      });
      if (!updatedUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }
      const { password, profileImageData, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error uploading profile image:", error);
      res.status(500).json({ message: error.message || "Errore nel caricamento dell'immagine" });
    }
  });

  app.get("/api/users/:id/profile-image", async (req, res) => {
    try {
      const user = await getUserById(req.params.id);
      if (!user || !user.profileImageData) {
        return res.status(404).json({ message: "Immagine non trovata" });
      }
      const match = user.profileImageData.match(/^data:(.+);base64,(.+)$/);
      if (!match) {
        return res.status(500).json({ message: "Formato immagine non valido" });
      }
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], "base64");
      res.set({
        "Content-Type": mimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      });
      res.send(buffer);
    } catch (error: any) {
      console.error("Error serving profile image:", error);
      res.status(500).json({ message: "Errore nel recupero dell'immagine" });
    }
  });

  app.delete("/api/users/profile-image", isAuthenticated, async (req, res) => {
    try {
      const { id: userId } = req.user!;
      const updatedUser = await storage.updateUserProfile(userId, {
        profileImageUrl: "",
        profileImageData: null,
      });
      if (!updatedUser) return res.status(404).json({ message: "Utente non trovato" });
      const { password, profileImageData, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error removing profile image:", error);
      res.status(500).json({ message: error.message || "Errore nella rimozione dell'immagine" });
    }
  });

  // POST /api/users/change-password - Cambio password utente corrente
  app.post("/api/users/change-password", isAuthenticated, async (req, res) => {
    try {
      const { id: userId } = req.user!;

      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, "Password corrente richiesta"),
        newPassword: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
      });

      const validatedData = changePasswordSchema.parse(req.body);

      const currentUser = await getUserById(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      const isCurrentValid = await verifyPassword(validatedData.currentPassword, currentUser.password);
      if (!isCurrentValid) {
        return res.status(401).json({ message: "La password corrente non è corretta" });
      }

      const hashedPassword = await hashPassword(validatedData.newPassword);
      await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));

      res.json({ message: "Password aggiornata con successo" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      }
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Errore nel cambio password" });
    }
  });

  // POST /api/users/invite - Crea invito con token magic link
  app.post("/api/users/invite", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono invitare utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // SUPER_ADMIN senza company non può creare inviti
      if (role === "SUPER_ADMIN" && !userCompany) {
        return res.status(400).json({ message: "Super Admin non associato a nessuna azienda" });
      }

      const inviteSchema = z.object({
        email: z.string().email("Email non valida"),
        role: z.enum(["COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"]),
      });

      const validatedData = inviteSchema.parse(req.body);

      // COMPANY_ADMIN non può creare SUPER_ADMIN
      if ((validatedData.role as string) === "SUPER_ADMIN") {
        return res.status(403).json({ message: "Non puoi creare un Super Admin" });
      }

      // Verifica che l'email non esista già come utente
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Esiste già un utente con questa email" });
      }

      // Verifica che non esista già un invito pendente per questa email+company
      const existingInvite = await storage.getInviteByEmail(validatedData.email, userCompany!.companyId);
      if (existingInvite) {
        // Cancella il vecchio invito e ne crea uno nuovo
        await storage.deleteInvite(existingInvite.id);
      }

      // Genera token casuale
      const token = crypto.randomUUID();

      // Scade tra 7 giorni
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invite = await storage.createInvite({
        email: validatedData.email.toLowerCase(),
        role: validatedData.role,
        companyId: userCompany!.companyId,
        token,
        expiresAt,
      });

      // Costruisci URL invito
      const baseUrl = req.headers.origin || `${req.protocol}://${req.headers.host}`;
      const inviteLink = `${baseUrl}/join?token=${token}`;

      res.status(201).json({
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        },
        inviteLink,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error creating invite:", error);
      res.status(500).json({ message: "Errore nella creazione dell'invito" });
    }
  });

  // PUT /api/team/:id - Modifica ruolo utente
  app.put("/api/team/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const targetUserId = req.params.id;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono modificare utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Verifica che l'utente target appartenga alla stessa azienda
      const targetUserCompany = await storage.getUserCompany(targetUserId);
      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      const updateSchema = z.object({
        role: z.enum(["COMPANY_ADMIN", "SALES_AGENT", "TECHNICIAN"]),
      });

      const validatedData = updateSchema.parse(req.body);

      // Non permettere di creare SUPER_ADMIN
      if ((validatedData.role as string) === "SUPER_ADMIN") {
        return res.status(403).json({ message: "Non puoi promuovere a Super Admin" });
      }

      // Non permettere di modificare se stessi
      if (targetUserId === userId) {
        return res.status(400).json({ message: "Non puoi modificare il tuo ruolo" });
      }

      const updatedUser = await storage.updateUserRole(targetUserId, validatedData.role);

      if (!updatedUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      const { password, profileImageData, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Errore nella modifica dell'utente" });
    }
  });

  // DELETE /api/team/:id - Sospendi utente
  app.delete("/api/team/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const targetUserId = req.params.id;

      // Solo COMPANY_ADMIN e SUPER_ADMIN possono sospendere utenti
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Verifica che l'utente target appartenga alla stessa azienda
      const targetUserCompany = await storage.getUserCompany(targetUserId);
      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      // Non permettere di sospendere se stessi
      if (targetUserId === userId) {
        return res.status(400).json({ message: "Non puoi sospendere te stesso" });
      }

      // Non permettere di sospendere SUPER_ADMIN
      const targetUser = await storage.getUserById(targetUserId);
      if (targetUser?.role === "SUPER_ADMIN") {
        return res.status(403).json({ message: "Non puoi sospendere un Super Admin" });
      }

      const updatedUser = await storage.updateUserStatus(targetUserId, "SUSPENDED");

      if (!updatedUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ message: "Errore nella sospensione dell'utente" });
    }
  });

  // ============ INVITE VERIFICATION (Public) ============

  // GET /api/auth/verify-invite/:token - Verifica token invito
  app.get("/api/auth/verify-invite/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const invite = await storage.getInviteByToken(token);

      if (!invite) {
        return res.status(404).json({ message: "Invito non trovato o non valido" });
      }

      // Verifica scadenza
      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(410).json({ message: "Invito scaduto" });
      }

      // Recupera nome azienda
      const company = await storage.getCompany(invite.companyId);

      res.json({
        email: invite.email,
        role: invite.role,
        companyName: company?.name || "Azienda",
      });
    } catch (error) {
      console.error("Error verifying invite:", error);
      res.status(500).json({ message: "Errore nella verifica dell'invito" });
    }
  });

  // POST /api/auth/complete-registration - Completa registrazione da invito
  app.post("/api/auth/complete-registration", async (req, res) => {
    try {
      const completeSchema = z.object({
        token: z.string().min(1, "Token richiesto"),
        firstName: z.string().min(1, "Nome richiesto"),
        lastName: z.string().min(1, "Cognome richiesto"),
        password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
      });

      const validatedData = completeSchema.parse(req.body);

      const invite = await storage.getInviteByToken(validatedData.token);

      if (!invite) {
        return res.status(404).json({ message: "Invito non trovato o non valido" });
      }

      // Verifica scadenza
      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(410).json({ message: "Invito scaduto" });
      }

      // Verifica che l'email non sia già registrata
      const existingUser = await storage.getUserByEmail(invite.email);
      if (existingUser) {
        await storage.deleteInvite(invite.id);
        return res.status(400).json({ message: "Esiste già un utente con questa email" });
      }

      // Crea l'utente
      const user = await storage.createUserWithCompany({
        email: invite.email,
        password: validatedData.password,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: invite.role,
      }, invite.companyId);

      // Elimina l'invito
      await storage.deleteInvite(invite.id);

      // Genera JWT per login automatico (usa userId come negli altri endpoint)
      const jwtPayload = {
        userId: user.id,
        email: user.email,
      };

      const jwtToken = jwt.sign(jwtPayload, process.env.SESSION_SECRET!, { expiresIn: "7d" });

      res.status(201).json({
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dati non validi", 
          errors: error.errors 
        });
      }
      console.error("Error completing registration:", error);
      res.status(500).json({ message: "Errore nel completamento della registrazione" });
    }
  });

  // ============ PASSWORD RESET (Admin-initiated) ============

  // POST /api/users/:userId/reset-password - Admin genera link reset password
  app.post("/api/users/:userId/reset-password", isAuthenticated, async (req, res) => {
    try {
      const { id: adminId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli admin possono resettare le password" });
      }

      const targetUserId = req.params.userId;
      const userCompany = await storage.getUserCompany(adminId);
      const targetUserCompany = await storage.getUserCompany(targetUserId);

      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ore

      await db.insert(passwordResetTokens).values({
        userId: targetUserId,
        token,
        expiresAt,
      });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const resetLink = `${baseUrl}/reset-password?token=${token}`;

      res.json({ resetLink });
    } catch (error) {
      console.error("Error creating password reset:", error);
      res.status(500).json({ message: "Errore nella creazione del link di reset" });
    }
  });

  // GET /api/auth/verify-reset/:token - Verifica token reset password
  app.get("/api/auth/verify-reset/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));

      if (!resetToken) {
        return res.status(404).json({ message: "Link di reset non valido" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ message: "Questo link è già stato utilizzato" });
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Link di reset scaduto. Chiedi all'amministratore di generarne uno nuovo." });
      }

      const user = await getUserById(resetToken.userId);
      if (!user) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      res.json({ email: user.email });
    } catch (error) {
      console.error("Error verifying reset token:", error);
      res.status(500).json({ message: "Errore nella verifica del token" });
    }
  });

  // POST /api/auth/reset-password - Completa il reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const resetSchema = z.object({
        token: z.string().min(1, "Token richiesto"),
        password: z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
      });

      const validatedData = resetSchema.parse(req.body);

      const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, validatedData.token));

      if (!resetToken) {
        return res.status(404).json({ message: "Link di reset non valido" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ message: "Questo link è già stato utilizzato" });
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Link di reset scaduto" });
      }

      const hashedPassword = await hashPassword(validatedData.password);
      await db.update(users).set({ password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, resetToken.userId));
      await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken.id));

      res.json({ message: "Password aggiornata con successo" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      }
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Errore nel reset della password" });
    }
  });

  // POST /api/users/:userId/unlock - Admin sblocca account bloccato
  app.post("/api/users/:userId/unlock", isAuthenticated, async (req, res) => {
    try {
      const { id: adminId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli admin possono sbloccare gli account" });
      }

      const targetUserId = req.params.userId;
      const userCompany = await storage.getUserCompany(adminId);
      const targetUserCompany = await storage.getUserCompany(targetUserId);

      if (!targetUserCompany || targetUserCompany.companyId !== userCompany?.companyId) {
        return res.status(404).json({ message: "Utente non trovato" });
      }

      await resetFailedLoginAttempts(targetUserId);
      res.json({ message: "Account sbloccato con successo" });
    } catch (error) {
      console.error("Error unlocking account:", error);
      res.status(500).json({ message: "Errore nello sblocco dell'account" });
    }
  });

  // ========== PROJECT STAGES ROUTES ==========

  // GET /api/project-stages - Lista fasi progetto per azienda
  app.get("/api/project-stages", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      let stages = await storage.getProjectStagesByCompany(userCompany.companyId);
      
      if (stages.length === 0) {
        const defaultProjectStages = [
          { name: "Acquisti", order: 1, color: "#4563FF" },
          { name: "Ricorrenti", order: 2, color: "#8B5CF6" },
          { name: "Da preparare", order: 3, color: "#F59E0B" },
          { name: "In lavorazione", order: 4, color: "#3B82F6" },
          { name: "In attesa di conferma progetto", order: 5, color: "#EC4899" },
          { name: "In attesa di RDC (Zanella)", order: 6, color: "#F97316" },
          { name: "In attesa di RDC (Damiani)", order: 7, color: "#EF4444" },
          { name: "Completata", order: 8, color: "#059669" },
        ];
        for (const ps of defaultProjectStages) {
          await storage.createProjectStage({ ...ps, companyId: userCompany.companyId });
        }
        stages = await storage.getProjectStagesByCompany(userCompany.companyId);
      }

      res.json(stages);
    } catch (error) {
      console.error("Error fetching project stages:", error);
      res.status(500).json({ message: "Errore nel recupero delle fasi progetto" });
    }
  });

  // POST /api/project-stages - Crea un nuovo stage progetto (solo admin)
  app.post("/api/project-stages", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { name, color, order } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Il nome è obbligatorio" });
      }
      const stage = await storage.createProjectStage({
        name,
        color: color || "#4563FF",
        order: order || 0,
        companyId: userCompany.companyId,
      });
      res.status(201).json(stage);
    } catch (error) {
      console.error("Error creating project stage:", error);
      res.status(500).json({ message: "Errore nella creazione dello stage" });
    }
  });

  // PUT /api/project-stages/reorder - Riordina gli stage progetto (solo admin)
  app.put("/api/project-stages/reorder", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { stageIds } = req.body;
      if (!Array.isArray(stageIds) || stageIds.length === 0) {
        return res.status(400).json({ message: "Array di stageIds obbligatorio" });
      }
      await storage.reorderProjectStages(userCompany.companyId, stageIds);
      const stages = await storage.getProjectStagesByCompany(userCompany.companyId);
      res.json(stages);
    } catch (error) {
      console.error("Error reordering project stages:", error);
      res.status(500).json({ message: "Errore nel riordinamento degli stage" });
    }
  });

  // PUT /api/project-stages/:id - Aggiorna uno stage progetto (solo admin)
  app.put("/api/project-stages/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { name, color, order } = req.body;
      const stage = await storage.updateProjectStage(req.params.id, userCompany.companyId, { name, color, order });
      if (!stage) {
        return res.status(404).json({ message: "Stage non trovato" });
      }
      res.json(stage);
    } catch (error) {
      console.error("Error updating project stage:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dello stage" });
    }
  });

  // DELETE /api/project-stages/:id - Elimina uno stage progetto (solo admin)
  app.delete("/api/project-stages/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const allProjects = await storage.getProjectsByCompany(userCompany.companyId);
      const hasProjects = allProjects.some((p: any) => p.stageId === req.params.id);
      if (hasProjects) {
        return res.status(400).json({ message: "Impossibile eliminare: ci sono progetti in questa colonna. Spostali prima in un'altra colonna." });
      }
      const deleted = await storage.deleteProjectStage(req.params.id, userCompany.companyId);
      if (!deleted) {
        return res.status(404).json({ message: "Stage non trovato" });
      }
      res.json({ message: "Stage eliminato" });
    } catch (error) {
      console.error("Error deleting project stage:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dello stage" });
    }
  });

  // ========== PROJECTS ROUTES ==========

  // ============ CALCOLO STATO CANTIERE ============
  // Deriva lo stato del cantiere dalle daily_assignments MONTAGGIO/SMONTAGGIO
  type CantiereStatus =
    | "NON_AVVIATO"
    | "MONTAGGIO_PIANIFICATO"
    | "MONTAGGIO_IN_CORSO"
    | "IN_CORSO"
    | "SMONTAGGIO_IN_CORSO"
    | "COMPLETATO";

  function calcCantiereStatus(assignments: import("@shared/schema").DailyAssignment[]): CantiereStatus {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const montaggi = assignments.filter(a => a.activityType === "MONTAGGIO");
    const smontaggi = assignments.filter(a => a.activityType === "SMONTAGGIO");

    // Nessuna assegnazione MONTAGGIO
    if (montaggi.length === 0) return "NON_AVVIATO";

    const getStart = (a: import("@shared/schema").DailyAssignment): Date => {
      const d = new Date(a.date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Un'assegnazione è "finita" se la sua data effettiva di fine ≤ oggi.
    // Data effettiva di fine: endDate se presente, altrimenti date (assegnazione single-day)
    const getEffectiveEnd = (a: import("@shared/schema").DailyAssignment): Date => {
      const d = new Date(a.endDate ?? a.date);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const isFinished = (a: import("@shared/schema").DailyAssignment): boolean =>
      getEffectiveEnd(a) <= today;

    // Tutti i MONTAGGIO nel futuro → Montaggio pianificato
    const allMontaggioFuture = montaggi.every(a => getStart(a) > today);
    if (allMontaggioFuture) return "MONTAGGIO_PIANIFICATO";

    // Almeno un MONTAGGIO iniziato (date ≤ oggi) ma non tutti finiti
    const allMontaggioFinished = montaggi.every(a => isFinished(a));
    const someMontaggioStarted = montaggi.some(a => getStart(a) <= today);

    if (someMontaggioStarted && !allMontaggioFinished) return "MONTAGGIO_IN_CORSO";

    // Tutti i MONTAGGIO finiti (endDate esplicita ≤ oggi per tutti)
    if (allMontaggioFinished) {
      // Nessuno SMONTAGGIO presente → In corso
      if (smontaggi.length === 0) return "IN_CORSO";

      // Almeno uno SMONTAGGIO iniziato ma non tutti finiti
      const allSmontaggioFinished = smontaggi.every(a => isFinished(a));
      if (!allSmontaggioFinished) return "SMONTAGGIO_IN_CORSO";

      // Tutti gli SMONTAGGIO finiti → torna In corso (COMPLETATO va impostato manualmente)
      return "IN_CORSO";
    }

    return "NON_AVVIATO";
  }

  // ============================================================
  // EXTERNAL ENGINEERS (Ingegneri Esterni RDC)
  // ============================================================

  // GET /api/external-engineers
  app.get("/api/external-engineers", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const engineers = await storage.getExternalEngineersByCompany(userCompany.companyId);
      res.json(engineers);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero degli ingegneri esterni" });
    }
  });

  // POST /api/external-engineers
  app.post("/api/external-engineers", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire gli ingegneri esterni" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Nome obbligatorio" });
      }
      const engineer = await storage.createExternalEngineer({ companyId: userCompany.companyId, name: name.trim() });
      res.status(201).json(engineer);
    } catch (error) {
      res.status(500).json({ message: "Errore nella creazione dell'ingegnere esterno" });
    }
  });

  // PUT /api/external-engineers/:id
  app.put("/api/external-engineers/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire gli ingegneri esterni" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Nome obbligatorio" });
      }
      const engineer = await storage.updateExternalEngineer(req.params.id, userCompany.companyId, { name: name.trim() });
      if (!engineer) return res.status(404).json({ message: "Ingegnere non trovato" });
      res.json(engineer);
    } catch (error) {
      res.status(500).json({ message: "Errore nell'aggiornamento dell'ingegnere esterno" });
    }
  });

  // DELETE /api/external-engineers/:id
  app.delete("/api/external-engineers/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono gestire gli ingegneri esterni" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      // Check if assigned to any active (non-completed) project
      // A project is considered "completed" if cantiereStatusOverride === "COMPLETATO"
      // or if it's in the last project stage (by order). If neither condition applies, it's active.
      const [projectsList, allProjectStages] = await Promise.all([
        storage.getProjectsByCompany(userCompany.companyId),
        storage.getProjectStagesByCompany(userCompany.companyId),
      ]);
      const assignedProjects = projectsList.filter(p => p.externalEngineerId === req.params.id);
      // Determine terminal stage id (highest order stage = "done")
      const terminalStageId = allProjectStages.length > 0
        ? allProjectStages.reduce((max, s) => (s.order ?? 0) > (max.order ?? 0) ? s : max, allProjectStages[0]).id
        : null;
      const activeAssignment = assignedProjects.some(p => {
        if (p.cantiereStatusOverride === "COMPLETATO") return false;
        if (terminalStageId && p.stageId === terminalStageId) return false;
        return true;
      });
      if (activeAssignment) {
        return res.status(409).json({ message: "L'ingegnere è assegnato a uno o più progetti attivi. Rimuovilo prima di eliminarlo." });
      }
      const ok = await storage.deleteExternalEngineer(req.params.id, userCompany.companyId);
      if (!ok) return res.status(404).json({ message: "Ingegnere non trovato" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Errore nell'eliminazione dell'ingegnere esterno" });
    }
  });

  // GET /api/projects - Lista progetti per azienda (con tecnico assegnato)
  app.get("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      // Self-healing asincrono: non blocca la risposta al client
      setImmediate(async () => {
        try {
          const pipelineStages = await storage.getStagesByCompany(userCompany.companyId);
          const vintoStage = pipelineStages.find(s => s.name === "Vinto");
          if (vintoStage) {
            const allOpportunities = await storage.getOpportunitiesByCompany(userCompany.companyId);
            const wonOpps = allOpportunities.filter(o => o.stageId === vintoStage.id);
            const projectStagesForCompany = await storage.getProjectStagesByCompany(userCompany.companyId);
            const firstStageId = projectStagesForCompany.length > 0 ? projectStagesForCompany[0].id : null;

            for (const opp of wonOpps) {
              const existingProject = await storage.getProjectByOpportunity(opp.id, userCompany.companyId);
              if (!existingProject && firstStageId) {
                const lead = await storage.getLead(opp.leadId, userCompany.companyId);
                const clientName = lead ? (lead.entityType === "COMPANY" && lead.name ? lead.name : `${lead.firstName} ${lead.lastName}`) : opp.title;
                const projectData: any = {
                  opportunityId: opp.id,
                  companyId: userCompany.companyId,
                  clientName,
                  workType: opp.workType || "PRIVATE",
                  sopralluogoFatto: opp.sopralluogoFatto ?? false,
                  stageId: firstStageId,
                };
                if (opp.siteAddress) projectData.siteAddress = opp.siteAddress;
                if (opp.siteCity) projectData.siteCity = opp.siteCity;
                if (opp.siteProvince) projectData.siteProvince = opp.siteProvince;
                if (opp.siteZip) projectData.siteZip = opp.siteZip;
                if (opp.estimatedStartDate) projectData.estimatedStartDate = new Date(opp.estimatedStartDate);
                if (opp.estimatedEndDate) projectData.estimatedEndDate = new Date(opp.estimatedEndDate);
                await storage.createProject(projectData);
                console.log(`[Self-healing] Progetto auto-creato per opportunità vinta "${opp.title}" (${opp.id})`);
              }
            }
          }
        } catch (healErr) {
          console.error("[Self-healing] Errore nel controllo progetti mancanti:", healErr);
        }
      });

      const projectsList = await storage.getProjectsByCompany(userCompany.companyId);

      // Raccoglie tutti gli ID unici per batch query
      const technicianIds = [...new Set(projectsList.map(p => p.assignedTechnicianId).filter((id): id is string => id != null))];
      const opportunityIds = [...new Set(projectsList.map(p => p.opportunityId).filter((id): id is string => id != null))];
      const projectIdsNeedingAssignments = projectsList.filter(p => p.cantiereStatusOverride == null).map(p => p.id);

      // Esegui tutte le batch query in parallelo
      const [techUsers, opps, allQuotes, allAssignments, allEngineers] = await Promise.all([
        storage.getUsersByIds(technicianIds),
        storage.getOpportunitiesByIds(opportunityIds, userCompany.companyId),
        storage.getQuotesByOpportunityIds(opportunityIds, userCompany.companyId),
        storage.getDailyAssignmentsByProjectIds(projectIdsNeedingAssignments, userCompany.companyId),
        storage.getExternalEngineersByCompany(userCompany.companyId),
      ]);

      // Costruisci mappe per lookup O(1)
      const techMap = new Map(techUsers.map(u => [u.id, u]));
      const oppMap = new Map(opps.map(o => [o.id, o]));
      const engineerMap = new Map(allEngineers.map(e => [e.id, e]));

      // Raggruppa preventivi per opportunityId (ordinati già desc per createdAt)
      const quotesByOpp = new Map<string, typeof allQuotes[0][]>();
      for (const q of allQuotes) {
        if (!q.opportunityId) continue;
        if (!quotesByOpp.has(q.opportunityId)) quotesByOpp.set(q.opportunityId, []);
        quotesByOpp.get(q.opportunityId)!.push(q);
      }

      // Raggruppa daily assignments per projectId
      const assignmentsByProject = new Map<string, typeof allAssignments[0][]>();
      for (const a of allAssignments) {
        if (!assignmentsByProject.has(a.projectId)) assignmentsByProject.set(a.projectId, []);
        assignmentsByProject.get(a.projectId)!.push(a);
      }

      const enriched = projectsList.map((project) => {
        let assignedTechnician = null;
        if (project.assignedTechnicianId) {
          const tech = techMap.get(project.assignedTechnicianId);
          if (tech) {
            assignedTechnician = {
              id: tech.id,
              firstName: tech.firstName,
              lastName: tech.lastName,
              email: tech.email,
            };
          }
        }

        let quoteNumber: string | null = null;
        let quoteId: string | null = null;
        let quoteStatus: string | null = null;
        let liveSopralluogoFatto = project.sopralluogoFatto;
        let opp: any = null;

        if (project.opportunityId) {
          opp = oppMap.get(project.opportunityId) ?? null;
          if (opp) {
            liveSopralluogoFatto = opp.sopralluogoFatto ?? false;
          }
          const projectQuotes = quotesByOpp.get(project.opportunityId) ?? [];
          if (projectQuotes.length > 0) {
            const lastQuote = projectQuotes[projectQuotes.length - 1];
            quoteNumber = lastQuote.number;
            quoteId = lastQuote.id;
            quoteStatus = lastQuote.status;
          }
        }

        const oppEstimatedStartDate = opp?.estimatedStartDate || null;

        let cantiereStatus: string;
        if (project.cantiereStatusOverride != null) {
          cantiereStatus = project.cantiereStatusOverride;
        } else {
          const projectAssignments = assignmentsByProject.get(project.id) ?? [];
          cantiereStatus = calcCantiereStatus(projectAssignments);
        }

        const externalEngineerName = project.externalEngineerId ? (engineerMap.get(project.externalEngineerId)?.name ?? null) : null;
        return { ...project, sopralluogoFatto: liveSopralluogoFatto, assignedTechnician, quoteNumber, quoteId, quoteStatus, oppEstimatedStartDate, cantiereStatus, siteCity: project.siteCity ?? opp?.siteCity ?? null, siteProvince: project.siteProvince ?? opp?.siteProvince ?? null, siteZip: project.siteZip ?? opp?.siteZip ?? null, mapsLink: opp?.mapsLink ?? null, externalEngineerName };
      });

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Errore nel recupero dei progetti" });
    }
  });

  // GET /api/projects/:id - Dettaglio progetto
  app.get("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const project = await storage.getProject(req.params.id, userCompany.companyId);
      if (!project) {
        return res.status(404).json({ message: "Progetto non trovato" });
      }

      let referent: any = null;
      let estimatedStartDate: any = null;
      let estimatedEndDate: any = null;
      let quoteNumber: string | null = null;
      let quoteId: string | null = null;
      let opportunityTitle: string | null = null;
      let opportunityNotes: string | null = null;
      let leadNotes: string | null = null;
      let leadName: string | null = null;

      if (project.opportunityId) {
        const opp = await storage.getOpportunity(project.opportunityId, userCompany.companyId);
        if (opp) {
          estimatedStartDate = opp.estimatedStartDate;
          estimatedEndDate = opp.estimatedEndDate;
          opportunityTitle = opp.title;
          opportunityNotes = opp.description || null;
          if (opp.leadId) {
            const lead = await storage.getLead(opp.leadId, userCompany.companyId);
            if (lead) {
              leadNotes = lead.notes || null;
              leadName = lead.entityType === "PRIVATE"
                ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.name || null
                : lead.name || null;
            }
          }
          if (opp.referentId) {
            const ref = await storage.getReferent(opp.referentId);
            if (ref) {
              referent = {
                id: ref.id,
                firstName: ref.firstName,
                lastName: ref.lastName,
                email: ref.email,
                phone: ref.phone,
                mobile: ref.mobile,
                role: ref.role,
              };
            }
          }
        }
        const quotes = await storage.getQuotesByOpportunity(project.opportunityId, userCompany.companyId);
        if (quotes.length > 0) {
          const lastQuote = quotes[quotes.length - 1];
          quoteNumber = lastQuote.number;
          quoteId = lastQuote.id;
        }
      }

      res.json({
        ...project,
        referent,
        estimatedStartDate,
        estimatedEndDate,
        quoteNumber,
        quoteId,
        opportunityTitle,
        opportunityNotes,
        leadNotes,
        leadName,
      });
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Errore nel recupero del progetto" });
    }
  });

  // GET /api/projects/:id/site-details - Scheda Cantiere completa
  app.get("/api/projects/:id/site-details", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const project = await storage.getProject(req.params.id, userCompany.companyId);
      if (!project) {
        return res.status(404).json({ message: "Progetto non trovato" });
      }

      const opportunity = await storage.getOpportunity(project.opportunityId, userCompany.companyId);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunità collegata non trovata" });
      }

      const lead = opportunity.leadId ? await storage.getLead(opportunity.leadId, userCompany.companyId) : null;

      let referent = null;
      if (opportunity.referentId) {
        referent = await storage.getReferent(opportunity.referentId);
      }

      const quotesForOpp = await storage.getQuotesByOpportunity(opportunity.id, userCompany.companyId);
      const acceptedQuote = quotesForOpp.find(q => q.status === "ACCEPTED") || quotesForOpp[0] || null;

      let quoteItemsList: any[] = [];
      if (acceptedQuote) {
        const rawItems = await storage.getQuoteItems(acceptedQuote.id);
        const articleIds = [...new Set(rawItems.map(i => i.articleId).filter(Boolean))];
        const articlesMap: Record<string, { name: string; pricingLogic: string }> = {};
        for (const artId of articleIds) {
          const art = await storage.getArticle(artId, userCompany.companyId);
          if (art) articlesMap[artId] = { name: art.name, pricingLogic: art.pricingLogic };
        }
        quoteItemsList = rawItems.map(item => ({
          ...item,
          articleName: articlesMap[item.articleId]?.name || item.articleId,
          pricingLogic: articlesMap[item.articleId]?.pricingLogic || null,
        }));
      }

      let transportInfo: Array<{ vehicleName: string; vehicleDescription: string; trips: number }> = [];
      if (acceptedQuote?.pdfData) {
        const pd = acceptedQuote.pdfData as any;
        const tItems = pd?.quote?.transportItems || [];
        const transportQuoteItems = quoteItemsList.filter((qi: any) => qi.pricingLogic === "TRANSPORT" && qi.phase === "TRASPORTO_ANDATA");
        for (const ti of tItems) {
          if (ti.articleId && ti.vehicleIndex != null) {
            const matchingItem = transportQuoteItems.find((qi: any) => qi.articleId === ti.articleId);
            const vehicles = matchingItem?.priceSnapshot?.vehicles || [];
            const v = vehicles[ti.vehicleIndex];
            if (v) {
              transportInfo.push({
                vehicleName: v.name,
                vehicleDescription: v.description || "",
                trips: ti.quantity || 1,
              });
            }
          }
        }
      }

      res.json({
        project,
        opportunity: {
          id: opportunity.id,
          title: opportunity.title,
          description: opportunity.description,
          value: opportunity.value,
          workType: opportunity.workType,
          siteAddress: opportunity.siteAddress,
          siteCity: opportunity.siteCity,
          siteZip: opportunity.siteZip,
          siteProvince: opportunity.siteProvince,
          mapsLink: opportunity.mapsLink,
          estimatedStartDate: opportunity.estimatedStartDate,
          estimatedEndDate: opportunity.estimatedEndDate,
          sopralluogoFatto: opportunity.sopralluogoFatto,
          ponteggioPerArray: opportunity.ponteggioPerArray,
          gruCantiere: opportunity.gruCantiere,
          luciSegnalazione: opportunity.luciSegnalazione,
          aCaricoClienteArray: opportunity.aCaricoClienteArray,
          orariLavoro: opportunity.orariLavoro,
          ancoraggi: opportunity.ancoraggi,
          maestranze: opportunity.maestranze,
          montacarichi: opportunity.montacarichi,
          transpallet: opportunity.transpallet,
          posizCamion: opportunity.posizCamion,
          puoScaricare: opportunity.puoScaricare,
          luogoScarico: opportunity.luogoScarico,
          ritiroEsubero: opportunity.ritiroEsubero,
          cartelliStradali: (opportunity as any).cartelliStradali,
          permessiViabilita: (opportunity as any).permessiViabilita,
          permessoSosta: (opportunity as any).permessoSosta,
        },
        lead: lead ? {
          id: lead.id,
          name: lead.name,
          firstName: lead.firstName,
          lastName: lead.lastName,
          entityType: lead.entityType,
          email: lead.email,
          phone: lead.phone,
        } : null,
        referent: referent ? {
          id: referent.id,
          firstName: referent.firstName,
          lastName: referent.lastName,
          role: referent.role,
          email: referent.email,
          phone: referent.phone,
          mobile: referent.mobile,
        } : null,
        quote: acceptedQuote ? {
          id: acceptedQuote.id,
          number: acceptedQuote.number,
          status: acceptedQuote.status,
          totalAmount: acceptedQuote.totalAmount,
          globalParams: acceptedQuote.globalParams,
          pdfData: acceptedQuote.pdfData,
        } : null,
        quoteItems: quoteItemsList,
        transportInfo,
      });
    } catch (error) {
      console.error("Error fetching site details:", error);
      res.status(500).json({ message: "Errore nel recupero dei dettagli cantiere" });
    }
  });

  // GET /api/opportunities/:id/site-details - Scheda Cantiere da opportunità
  app.get("/api/opportunities/:id/site-details", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const opportunity = await storage.getOpportunity(req.params.id, userCompany.companyId);
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunità non trovata" });
      }

      const lead = opportunity.leadId ? await storage.getLead(opportunity.leadId, userCompany.companyId) : null;

      let referent = null;
      if (opportunity.referentId) {
        referent = await storage.getReferent(opportunity.referentId);
      }

      const quotesForOpp = await storage.getQuotesByOpportunity(opportunity.id, userCompany.companyId);
      const acceptedQuote = quotesForOpp.find(q => q.status === "ACCEPTED") || quotesForOpp[0] || null;

      let quoteItemsList: any[] = [];
      if (acceptedQuote) {
        const rawItems = await storage.getQuoteItems(acceptedQuote.id);
        const articleIds = [...new Set(rawItems.map(i => i.articleId).filter(Boolean))];
        const articlesMap: Record<string, { name: string; pricingLogic: string }> = {};
        for (const artId of articleIds) {
          const art = await storage.getArticle(artId, userCompany.companyId);
          if (art) articlesMap[artId] = { name: art.name, pricingLogic: art.pricingLogic };
        }
        quoteItemsList = rawItems.map(item => ({
          ...item,
          articleName: articlesMap[item.articleId]?.name || item.articleId,
          pricingLogic: articlesMap[item.articleId]?.pricingLogic || null,
        }));
      }

      let transportInfo: Array<{ vehicleName: string; vehicleDescription: string; trips: number }> = [];
      if (acceptedQuote?.pdfData) {
        const pd = acceptedQuote.pdfData as any;
        const tItems = pd?.quote?.transportItems || [];
        const transportQuoteItems = quoteItemsList.filter((qi: any) => qi.pricingLogic === "TRANSPORT" && qi.phase === "TRASPORTO_ANDATA");
        for (const ti of tItems) {
          if (ti.articleId && ti.vehicleIndex != null) {
            const matchingItem = transportQuoteItems.find((qi: any) => qi.articleId === ti.articleId);
            const vehicles = matchingItem?.priceSnapshot?.vehicles || [];
            const v = vehicles[ti.vehicleIndex];
            if (v) {
              transportInfo.push({
                vehicleName: v.name,
                vehicleDescription: v.description || "",
                trips: ti.quantity || 1,
              });
            }
          }
        }
      }

      res.json({
        opportunity: {
          id: opportunity.id,
          title: opportunity.title,
          description: opportunity.description,
          value: opportunity.value,
          workType: opportunity.workType,
          siteAddress: opportunity.siteAddress,
          siteCity: opportunity.siteCity,
          siteZip: opportunity.siteZip,
          siteProvince: opportunity.siteProvince,
          mapsLink: opportunity.mapsLink,
          estimatedStartDate: opportunity.estimatedStartDate,
          estimatedEndDate: opportunity.estimatedEndDate,
          sopralluogoFatto: opportunity.sopralluogoFatto,
          ponteggioPerArray: opportunity.ponteggioPerArray,
          gruCantiere: opportunity.gruCantiere,
          luciSegnalazione: opportunity.luciSegnalazione,
          aCaricoClienteArray: opportunity.aCaricoClienteArray,
          orariLavoro: opportunity.orariLavoro,
          ancoraggi: opportunity.ancoraggi,
          maestranze: opportunity.maestranze,
          montacarichi: opportunity.montacarichi,
          transpallet: opportunity.transpallet,
          posizCamion: opportunity.posizCamion,
          puoScaricare: opportunity.puoScaricare,
          luogoScarico: opportunity.luogoScarico,
          ritiroEsubero: opportunity.ritiroEsubero,
          cartelliStradali: (opportunity as any).cartelliStradali,
          permessiViabilita: (opportunity as any).permessiViabilita,
          permessoSosta: (opportunity as any).permessoSosta,
        },
        lead: lead ? {
          id: lead.id,
          name: lead.name,
          firstName: lead.firstName,
          lastName: lead.lastName,
          entityType: lead.entityType,
          email: lead.email,
          phone: lead.phone,
        } : null,
        referent: referent ? {
          id: referent.id,
          firstName: referent.firstName,
          lastName: referent.lastName,
          role: referent.role,
          email: referent.email,
          phone: referent.phone,
          mobile: referent.mobile,
        } : null,
        quote: acceptedQuote ? {
          id: acceptedQuote.id,
          number: acceptedQuote.number,
          status: acceptedQuote.status,
          totalAmount: acceptedQuote.totalAmount,
          globalParams: acceptedQuote.globalParams,
          pdfData: acceptedQuote.pdfData,
        } : null,
        quoteItems: quoteItemsList,
        transportInfo,
      });
    } catch (error) {
      console.error("Error fetching opportunity site details:", error);
      res.status(500).json({ message: "Errore nel recupero dei dettagli cantiere" });
    }
  });

  // PATCH /api/projects/:id - Aggiorna progetto (incluso assegnazione tecnico)
  app.patch("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      // Validate externalEngineerId belongs to the same company (prevent cross-tenant assignment)
      if (req.body.externalEngineerId) {
        const companyEngineers = await storage.getExternalEngineersByCompany(userCompany.companyId);
        const engineerBelongs = companyEngineers.some(e => e.id === req.body.externalEngineerId);
        if (!engineerBelongs) {
          return res.status(403).json({ message: "Ingegnere esterno non appartenente all'azienda" });
        }
      }
      const project = await storage.updateProject(req.params.id, userCompany.companyId, req.body);
      if (!project) {
        return res.status(404).json({ message: "Progetto non trovato" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del progetto" });
    }
  });

  // PUT /api/projects/:id/move - Sposta progetto in nuova fase (Kanban)
  app.put("/api/projects/:id/move", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { stageId } = req.body;
      if (!stageId) {
        return res.status(400).json({ message: "stageId obbligatorio" });
      }
      const existingProject = await storage.getProject(req.params.id, userCompany.companyId);
      const allProjectStages = await storage.getProjectStagesByCompany(userCompany.companyId);
      const previousStage = existingProject?.stageId
        ? allProjectStages.find(s => s.id === existingProject.stageId) ?? null
        : null;
      const newStage = allProjectStages.find(s => s.id === stageId) ?? null;
      const updateData: Partial<InsertProject> = { stageId };
      if (existingProject && existingProject.stageId !== stageId) {
        updateData.stageEnteredAt = new Date();
      }
      const project = await storage.updateProject(req.params.id, userCompany.companyId, updateData);
      if (!project) {
        return res.status(404).json({ message: "Progetto non trovato" });
      }
      if (existingProject && existingProject.stageId !== stageId) {
        await storage.createActivityLog({
          companyId: userCompany.companyId,
          userId,
          entityType: "project",
          entityId: project.id,
          action: "moved",
          details: {
            fromStage: previousStage?.name ?? "Nessuna fase",
            toStage: newStage?.name ?? "Fase sconosciuta",
          },
        });
      }
      res.json(project);
    } catch (error) {
      console.error("Error moving project:", error);
      res.status(500).json({ message: "Errore nello spostamento del progetto" });
    }
  });

  // ============================================================
  // CRONISTORIA PROGETTO
  // ============================================================

  // GET /api/projects/:projectId/cronistoria - Cronistoria eventi del progetto
  app.get("/api/projects/:projectId/cronistoria", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const project = await storage.getProject(req.params.projectId, userCompany.companyId);
      if (!project) {
        return res.status(404).json({ message: "Progetto non trovato" });
      }

      type TeamInfo = { id: string; name: string; color: string; members: string[] };
      type DriverInfo = { id: string; name: string };
      type VehicleInfo = { id: string; name: string; plate?: string | null };
      type ActivityLogDetails = { note?: string; field?: string; oldValue?: unknown; newValue?: unknown; fromStage?: string | null; toStage?: string | null };

      type AssignmentData = { activityType: string; scheduledTime?: string | null; driver?: DriverInfo | null; vehicle?: VehicleInfo | null; teams: TeamInfo[]; notes?: string | null; status?: string; endDate?: Date | null };
      type PhaseChangeData = { action: string; fromStage?: string | null; toStage?: string | null; details: ActivityLogDetails };
      type ProjectCreatedData = { action: string; clientName?: string };
      type ActivityLogData = { action: string; details: ActivityLogDetails };

      type ActivityTaskData = { name: string; startDate: Date; endDate: Date; progress: number; description?: string | null; assignedUserId?: string | null; assignedUserName?: string | null };

      type CronistoriaEventData = AssignmentData | PhaseChangeData | ProjectCreatedData | ActivityLogData | ActivityTaskData;

      const events: Array<{
        id: string;
        type: "assignment" | "phase_change" | "project_created" | "activity_log" | "activity_task";
        date: Date;
        data: CronistoriaEventData;
      }> = [];

      // 1. Daily assignments for this project
      const assignments = await storage.getDailyAssignmentsByProjectId(req.params.projectId, userCompany.companyId);

      // Fetch all teams and their members for enriching assignment data
      const allTeams = await storage.getTeamsByCompany(userCompany.companyId);
      const allTeamMembers = await storage.getTeamMembersByCompany(userCompany.companyId);
      const allDrivers = await storage.getDriversByCompany(userCompany.companyId);
      const allVehicles = await storage.getVehiclesByCompany(userCompany.companyId);

      for (const assignment of assignments) {
        const driver = assignment.driverId ? allDrivers.find(d => d.id === assignment.driverId) : null;
        const vehicle = assignment.vehicleId ? allVehicles.find(v => v.id === assignment.vehicleId) : null;

        const teamsInfo = (assignment.teamIds || []).map((teamId: string) => {
          const team = allTeams.find(t => t.id === teamId);
          const members = allTeamMembers.filter(m => m.teamId === teamId && m.isActive);
          return {
            id: teamId,
            name: team?.name || "Squadra",
            color: team?.color || "#4563FF",
            members: members.map(m => m.name),
          };
        });

        events.push({
          id: assignment.id,
          type: "assignment",
          date: new Date(assignment.date),
          data: {
            activityType: assignment.activityType,
            scheduledTime: assignment.scheduledTime,
            driver: driver ? { id: driver.id, name: driver.name } : null,
            vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, plate: vehicle.plate } : null,
            teams: teamsInfo,
            notes: assignment.notes,
            status: assignment.status,
            endDate: assignment.endDate,
          },
        });
      }

      // 2. Activity logs with entityType='project'
      const projectLogs = await db
        .select()
        .from(activityLogsTable)
        .where(
          and(
            eq(activityLogsTable.entityType, "project"),
            eq(activityLogsTable.entityId, req.params.projectId),
            eq(activityLogsTable.companyId, userCompany.companyId)
          )
        )
        .orderBy(desc(activityLogsTable.createdAt));

      for (const log of projectLogs) {
        const rawDetails = log.details;
        const details: ActivityLogDetails = (rawDetails !== null && typeof rawDetails === "object" && !Array.isArray(rawDetails))
          ? (rawDetails as ActivityLogDetails)
          : {};
        const isPhaseChange = log.action === "moved" || !!(details.fromStage || details.toStage);

        if (isPhaseChange) {
          events.push({
            id: log.id,
            type: "phase_change",
            date: new Date(log.createdAt!),
            data: {
              action: log.action,
              fromStage: details.fromStage ?? null,
              toStage: details.toStage ?? null,
              details,
            },
          });
        } else if (log.action === "created") {
          events.push({
            id: log.id,
            type: "project_created",
            date: new Date(log.createdAt!),
            data: {
              action: log.action,
            },
          });
        } else {
          events.push({
            id: log.id,
            type: "activity_log",
            date: new Date(log.createdAt!),
            data: {
              action: log.action,
              details,
            },
          });
        }
      }

      // 3. Project tasks
      const projectTasksList = await storage.getProjectTasksByProject(req.params.projectId, userCompany.companyId);
      const companyUsers = projectTasksList.some(t => t.assignedUserId)
        ? await storage.getUsersByCompanyId(userCompany.companyId)
        : [];
      for (const task of projectTasksList) {
        const assignedUser = task.assignedUserId ? companyUsers.find(u => u.id === task.assignedUserId) : null;
        const assignedUserName = assignedUser
          ? [assignedUser.firstName, assignedUser.lastName].filter(Boolean).join(" ") || null
          : null;
        events.push({
          id: `task-${task.id}`,
          type: "activity_task",
          date: new Date(task.startDate),
          data: {
            name: task.name,
            startDate: new Date(task.startDate),
            endDate: new Date(task.endDate),
            progress: task.progress,
            description: task.description,
            assignedUserId: task.assignedUserId,
            assignedUserName,
          },
        });
      }

      // 4. Project creation event (from project.createdAt)
      const hasCreationEvent = events.some(e => e.type === "project_created");
      if (!hasCreationEvent) {
        events.push({
          id: `project-created-${project.id}`,
          type: "project_created",
          date: project.createdAt ? new Date(project.createdAt) : new Date(0),
          data: {
            action: "created",
            clientName: project.clientName,
          },
        });
      }

      // Sort all events by date descending (most recent first)
      events.sort((a, b) => b.date.getTime() - a.date.getTime());

      res.json(events);
    } catch (error) {
      console.error("Error fetching cronistoria:", error);
      res.status(500).json({ message: "Errore nel recupero della cronistoria" });
    }
  });

  // ============================================================
  // PROJECT TASKS (Attività Gantt)
  // ============================================================

  // GET /api/projects/:projectId/tasks - Lista attività per progetto
  app.get("/api/projects/:projectId/tasks", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const project = await storage.getProject(req.params.projectId, userCompany.companyId);
      if (!project) {
        return res.status(404).json({ message: "Progetto non trovato" });
      }
      const tasks = await storage.getProjectTasksByProject(req.params.projectId, userCompany.companyId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching project tasks:", error);
      res.status(500).json({ message: "Errore nel recupero delle attività" });
    }
  });

  // POST /api/projects/:projectId/tasks - Crea nuova attività
  app.post("/api/projects/:projectId/tasks", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const project = await storage.getProject(req.params.projectId, userCompany.companyId);
      if (!project) {
        return res.status(404).json({ message: "Progetto non trovato" });
      }
      const { name, description, startDate, endDate, progress, parentTaskId, dependencyTaskIds, assignedUserId, color, sortOrder } = req.body;
      if (!name || !startDate || !endDate) {
        return res.status(400).json({ message: "Nome, data inizio e data fine sono obbligatori" });
      }
      const task = await storage.createProjectTask({
        projectId: req.params.projectId,
        companyId: userCompany.companyId,
        name,
        description: description || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        progress: progress ?? 0,
        parentTaskId: parentTaskId || null,
        dependencyTaskIds: dependencyTaskIds || null,
        assignedUserId: assignedUserId || null,
        color: color || null,
        sortOrder: sortOrder ?? 0,
      });
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating project task:", error);
      res.status(500).json({ message: "Errore nella creazione dell'attività" });
    }
  });

  // PATCH /api/projects/:projectId/tasks/:taskId - Aggiorna attività
  app.patch("/api/projects/:projectId/tasks/:taskId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const updateData: any = { ...req.body };
      if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
      if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);
      const task = await storage.updateProjectTask(req.params.taskId, userCompany.companyId, updateData);
      if (!task) {
        return res.status(404).json({ message: "Attività non trovata" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error updating project task:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'attività" });
    }
  });

  // DELETE /api/projects/:projectId/tasks/:taskId - Elimina attività
  app.delete("/api/projects/:projectId/tasks/:taskId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const deleted = await storage.deleteProjectTask(req.params.taskId, userCompany.companyId);
      if (!deleted) {
        return res.status(404).json({ message: "Attività non trovata" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting project task:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'attività" });
    }
  });

  // ========== PROXIT - Workers API ==========

  app.get("/api/workers", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const result = await storage.getWorkersByCompany(userCompany.companyId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching workers:", error);
      res.status(500).json({ message: "Errore nel recupero delle persone" });
    }
  });

  app.post("/api/workers", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name, isCaposquadra, color, sortOrder, isInternal, defaultCapoId } = req.body;
      if (!name) return res.status(400).json({ message: "Nome obbligatorio" });
      const worker = await storage.createWorker({
        name,
        isCaposquadra: isCaposquadra === true,
        isInternal: isInternal !== false,
        defaultCapoId: defaultCapoId || null,
        color: color || "#4563FF",
        companyId: userCompany.companyId,
        isActive: true,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      });
      res.status(201).json(worker);
    } catch (error: any) {
      console.error("Error creating worker:", error?.message || error);
      res.status(500).json({ message: "Errore nella creazione della persona" });
    }
  });

  app.patch("/api/workers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name, isCaposquadra, isActive, color, sortOrder, isInternal, defaultCapoId, city } = req.body;
      const allowedFields: Record<string, unknown> = {};
      if (name !== undefined) allowedFields.name = name;
      if (isCaposquadra !== undefined) allowedFields.isCaposquadra = isCaposquadra;
      if (isActive !== undefined) allowedFields.isActive = isActive;
      if (color !== undefined) allowedFields.color = color;
      if (sortOrder !== undefined) allowedFields.sortOrder = sortOrder;
      if (isInternal !== undefined) allowedFields.isInternal = isInternal;
      if ("defaultCapoId" in req.body) allowedFields.defaultCapoId = defaultCapoId || null;
      if ("city" in req.body) allowedFields.city = city || null;
      const worker = await storage.updateWorker(req.params.id, userCompany.companyId, allowedFields);
      if (!worker) return res.status(404).json({ message: "Persona non trovata" });
      res.json(worker);
    } catch (error) {
      console.error("Error updating worker:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento della persona" });
    }
  });

  app.post("/api/workers/reorder", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const companyId = userCompany.companyId;
      const { idA, idB } = req.body;
      if (!idA || !idB) return res.status(400).json({ message: "idA e idB sono obbligatori" });

      const [workerA, workerB] = await Promise.all([
        storage.getWorker(idA, companyId),
        storage.getWorker(idB, companyId),
      ]);
      if (!workerA || !workerB) return res.status(404).json({ message: "Una o entrambe le persone non trovate" });

      const orderA = workerA.sortOrder;
      const orderB = workerB.sortOrder;

      await Promise.all([
        storage.updateWorker(idA, companyId, { sortOrder: orderB } as any),
        storage.updateWorker(idB, companyId, { sortOrder: orderA } as any),
      ]);

      res.json({ ok: true });
    } catch (error) {
      console.error("Error reordering workers:", error);
      res.status(500).json({ message: "Errore nel riordinamento" });
    }
  });

  app.delete("/api/workers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const companyId = userCompany.companyId;
      const workerId = req.params.id;
      const allAssignments = await db
        .select({ id: dailyAssignments.id, workerAssignments: dailyAssignments.workerAssignments })
        .from(dailyAssignments)
        .where(eq(dailyAssignments.companyId, companyId));
      for (const assignment of allAssignments) {
        const wa = assignment.workerAssignments as Record<string, Record<string, string[]>> | null;
        if (!wa) continue;
        let changed = false;
        const newWA: Record<string, Record<string, string[]>> = {};
        for (const [dateStr, daySlot] of Object.entries(wa)) {
          if (!daySlot || typeof daySlot !== "object") {
            newWA[dateStr] = daySlot;
            continue;
          }
          const newDaySlot: Record<string, string[]> = {};
          for (const [capoId, workerIds] of Object.entries(daySlot)) {
            if (capoId === workerId) {
              changed = true;
            } else {
              const filtered = (workerIds || []).filter((id) => id !== workerId);
              if (filtered.length !== (workerIds || []).length) changed = true;
              newDaySlot[capoId] = filtered;
            }
          }
          newWA[dateStr] = newDaySlot;
        }
        if (changed) {
          await storage.updateDailyAssignment(assignment.id, companyId, { workerAssignments: newWA });
        }
      }
      const deleted = await storage.deleteWorker(workerId, companyId);
      if (!deleted) return res.status(404).json({ message: "Persona non trovata" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting worker:", error);
      res.status(500).json({ message: "Errore nell'eliminazione della persona" });
    }
  });

  const patchWorkerAssignmentsHandler: import("express").RequestHandler = async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { workerAssignments } = req.body;
      if (!workerAssignments || typeof workerAssignments !== "object") {
        return res.status(400).json({ message: "workerAssignments deve essere un oggetto" });
      }
      const companyId = userCompany.companyId;
      const companyWorkers = await storage.getWorkersByCompany(companyId);
      const validCapoIds = new Set(companyWorkers.filter((w) => w.isCaposquadra).map((w) => w.id));
      const allCompanyWorkerIds = new Set(companyWorkers.map((w) => w.id));
      const waObj = workerAssignments as Record<string, Record<string, string[]>>;
      for (const [dateStr, daySlot] of Object.entries(waObj)) {
        if (!daySlot || typeof daySlot !== "object") continue;
        for (const [capoId, workerIds] of Object.entries(daySlot)) {
          if (!validCapoIds.has(capoId)) {
            return res.status(400).json({ message: `Caposquadra non valido: ${capoId}` });
          }
          if (!Array.isArray(workerIds)) continue;
          for (const wid of workerIds) {
            if (!allCompanyWorkerIds.has(wid)) {
              return res.status(400).json({ message: `Lavoratore non appartiene a questa azienda: ${wid}` });
            }
          }
        }
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, companyId, { workerAssignments });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating worker assignments:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento delle assegnazioni" });
    }
  };
  app.patch("/api/assignments/:id/worker-assignments", isAuthenticated, requireProxitLock, patchWorkerAssignmentsHandler);
  app.patch("/api/daily-assignments/:id/worker-assignments", isAuthenticated, requireProxitLock, patchWorkerAssignmentsHandler);

  app.patch("/api/assignments/:id/external-counts", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { externalWorkerCounts } = req.body;
      if (!externalWorkerCounts || typeof externalWorkerCounts !== "object") {
        return res.status(400).json({ message: "externalWorkerCounts deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { externalWorkerCounts });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating external worker counts:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dei contatori esterni" });
    }
  });

  app.patch("/api/assignments/:id/external-contacted", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { externalTeamContacted } = req.body;
      if (!externalTeamContacted || typeof externalTeamContacted !== "object") {
        return res.status(400).json({ message: "externalTeamContacted deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { externalTeamContacted });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating external team contacted:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del flag sentita" });
    }
  });

  app.patch("/api/assignments/:id/team-departure-times", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamDepartureTimes } = req.body;
      if (!teamDepartureTimes || typeof teamDepartureTimes !== "object") {
        return res.status(400).json({ message: "teamDepartureTimes deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamDepartureTimes });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team departure times:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento degli orari di partenza" });
    }
  });

  app.patch("/api/assignments/:id/team-free-numbers", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamFreeNumbers } = req.body;
      if (!teamFreeNumbers || typeof teamFreeNumbers !== "object") {
        return res.status(400).json({ message: "teamFreeNumbers deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamFreeNumbers });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team free numbers:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dei numeri liberi" });
    }
  });

  app.patch("/api/assignments/:id/team-notes", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamNotes } = req.body;
      if (!teamNotes || typeof teamNotes !== "object") {
        return res.status(400).json({ message: "teamNotes deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamNotes });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team notes:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento delle note squadra" });
    }
  });

  app.patch("/api/assignments/:id/team-note-colors", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamNoteColors } = req.body;
      if (!teamNoteColors || typeof teamNoteColors !== "object") {
        return res.status(400).json({ message: "teamNoteColors deve essere un oggetto" });
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, { teamNoteColors });
      if (!assignment) return res.status(404).json({ message: "Attività non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating team note colors:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dei colori note squadra" });
    }
  });

  app.post("/api/workers/migrate-from-teams", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Accesso riservato agli amministratori" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const companyId = userCompany.companyId;

      const existingWorkers = await storage.getWorkersByCompany(companyId);
      if (existingWorkers.length > 0) {
        return res.json({ message: "Migrazione già effettuata", count: 0 });
      }

      const teamsData = await storage.getTeamsByCompany(companyId);
      const membersData = await storage.getTeamMembersByCompany(companyId);

      let count = 0;
      const teamToWorkerMap = new Map<string, string>();

      for (const team of teamsData) {
        const worker = await storage.createWorker({
          name: team.name,
          isCaposquadra: true,
          color: team.color,
          companyId,
          isActive: team.isActive,
        });
        teamToWorkerMap.set(team.id, worker.id);
        count++;
      }

      for (const member of membersData) {
        await storage.createWorker({
          name: member.name,
          isCaposquadra: false,
          color: "#6B7280",
          companyId,
          isActive: member.isActive,
        });
        count++;
      }

      const allAssignments = await db
        .select()
        .from(dailyAssignments)
        .where(eq(dailyAssignments.companyId, companyId));

      for (const assignment of allAssignments) {
        const teamIds: string[] = (assignment.teamIds as string[]) || [];
        if (teamIds.length > 0) {
          const capoIds: string[] = [];
          for (const teamId of teamIds) {
            const workerId = teamToWorkerMap.get(teamId);
            if (workerId) capoIds.push(workerId);
          }
          if (capoIds.length > 0) {
            const startStr = typeof assignment.date === "string" ? assignment.date.slice(0, 10) : (assignment.date as Date).toLocaleDateString("sv-SE");
            const endStr = assignment.endDate
              ? (typeof assignment.endDate === "string" ? assignment.endDate.slice(0, 10) : (assignment.endDate as Date).toLocaleDateString("sv-SE"))
              : startStr;
            const workerAssignments: Record<string, Record<string, string[]>> = {};
            const [sy, sm, sd] = startStr.split("-").map(Number);
            const [ey, em, ed] = endStr.split("-").map(Number);
            const cursor = new Date(sy, sm - 1, sd);
            const end = new Date(ey, em - 1, ed);
            while (cursor <= end) {
              const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
              workerAssignments[dateStr] = {};
              for (const capoId of capoIds) {
                workerAssignments[dateStr][capoId] = [];
              }
              cursor.setDate(cursor.getDate() + 1);
            }
            await storage.updateDailyAssignment(assignment.id, companyId, { workerAssignments });
          }
        }
      }

      res.json({ message: "Migrazione completata", count, teamToWorkerMap: Object.fromEntries(teamToWorkerMap) });
    } catch (error) {
      console.error("Error migrating teams to workers:", error);
      res.status(500).json({ message: "Errore nella migrazione" });
    }
  });

  // ========== PROXIT - Teams API ==========
  
  app.get("/api/teams", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const result = await storage.getTeamsByCompany(userCompany.companyId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Errore nel recupero delle squadre" });
    }
  });

  app.post("/api/teams", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name, color, paese } = req.body;
      if (!name) return res.status(400).json({ message: "Nome squadra obbligatorio" });
      const team = await storage.createTeam({ name, color: color || "#4563FF", paese: paese || null, companyId: userCompany.companyId });
      res.status(201).json(team);
    } catch (error) {
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Errore nella creazione della squadra" });
    }
  });

  app.patch("/api/teams/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const body = { ...req.body };
      if ('paese' in body) {
        body.paese = body.paese || null;
      }
      const team = await storage.updateTeam(req.params.id, userCompany.companyId, body);
      if (!team) return res.status(404).json({ message: "Squadra non trovata" });
      res.json(team);
    } catch (error) {
      console.error("Error updating team:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento della squadra" });
    }
  });

  app.delete("/api/teams/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const deleted = await storage.deleteTeam(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Squadra non trovata" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Errore nell'eliminazione della squadra" });
    }
  });

  // ========== PROXIT - Team Members API ==========

  app.get("/api/team-members", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamId } = req.query;
      if (teamId) {
        const result = await storage.getTeamMembersByTeam(teamId as string, userCompany.companyId);
        return res.json(result);
      }
      const result = await storage.getTeamMembersByCompany(userCompany.companyId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Errore nel recupero dei componenti" });
    }
  });

  app.post("/api/team-members", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { teamId, name } = req.body;
      if (!teamId || !name) return res.status(400).json({ message: "teamId e name sono obbligatori" });
      const team = await storage.getTeam(teamId, userCompany.companyId);
      if (!team) return res.status(404).json({ message: "Squadra non trovata o non appartenente all'azienda" });
      const member = await storage.createTeamMember({ teamId, name, companyId: userCompany.companyId, isActive: true });
      res.status(201).json(member);
    } catch (error) {
      console.error("Error creating team member:", error);
      res.status(500).json({ message: "Errore nella creazione del componente" });
    }
  });

  app.patch("/api/team-members/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name, isActive } = req.body;
      if (name === undefined && isActive === undefined) {
        return res.status(400).json({ message: "Almeno un campo tra name e isActive è richiesto" });
      }
      const member = await storage.updateTeamMember(req.params.id, userCompany.companyId, { name, isActive });
      if (!member) return res.status(404).json({ message: "Componente non trovato" });
      res.json(member);
    } catch (error) {
      console.error("Error updating team member:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del componente" });
    }
  });

  app.delete("/api/team-members/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const deleted = await storage.deleteTeamMember(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Componente non trovato" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team member:", error);
      res.status(500).json({ message: "Errore nell'eliminazione del componente" });
    }
  });

  // ========== PROXIT - Drivers API ==========

  app.get("/api/drivers", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const result = await storage.getDriversByCompany(userCompany.companyId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.status(500).json({ message: "Errore nel recupero degli autisti" });
    }
  });

  app.post("/api/drivers", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name, phone } = req.body;
      if (!name) return res.status(400).json({ message: "Nome autista obbligatorio" });
      const driver = await storage.createDriver({ name, phone: phone || null, companyId: userCompany.companyId });
      res.status(201).json(driver);
    } catch (error) {
      console.error("Error creating driver:", error);
      res.status(500).json({ message: "Errore nella creazione dell'autista" });
    }
  });

  app.patch("/api/drivers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const driver = await storage.updateDriver(req.params.id, userCompany.companyId, req.body);
      if (!driver) return res.status(404).json({ message: "Autista non trovato" });
      res.json(driver);
    } catch (error) {
      console.error("Error updating driver:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'autista" });
    }
  });

  app.delete("/api/drivers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const deleted = await storage.deleteDriver(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Autista non trovato" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting driver:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'autista" });
    }
  });

  // ========== PROXIT - Vehicles API ==========

  app.get("/api/vehicles", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const result = await storage.getVehiclesByCompany(userCompany.companyId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      res.status(500).json({ message: "Errore nel recupero dei mezzi" });
    }
  });

  app.post("/api/vehicles", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { name, plate, type } = req.body;
      if (!name) return res.status(400).json({ message: "Nome mezzo obbligatorio" });
      const vehicle = await storage.createVehicle({ name, plate: plate || null, type: type || null, companyId: userCompany.companyId });
      res.status(201).json(vehicle);
    } catch (error) {
      console.error("Error creating vehicle:", error);
      res.status(500).json({ message: "Errore nella creazione del mezzo" });
    }
  });

  app.patch("/api/vehicles/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const vehicle = await storage.updateVehicle(req.params.id, userCompany.companyId, req.body);
      if (!vehicle) return res.status(404).json({ message: "Mezzo non trovato" });
      res.json(vehicle);
    } catch (error) {
      console.error("Error updating vehicle:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del mezzo" });
    }
  });

  app.delete("/api/vehicles/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const deleted = await storage.deleteVehicle(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Mezzo non trovato" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      res.status(500).json({ message: "Errore nell'eliminazione del mezzo" });
    }
  });

  // ========== PROXIT - Daily Assignments API ==========

  async function updateOpportunityStartDateFromMontaggio(projectId: string, companyId: string): Promise<void> {
    try {
      const project = await db.query.projects.findFirst({
        where: and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)),
      });
      if (!project?.opportunityId) return;
      const montaggioAssignments = await db
        .select({ date: dailyAssignments.date })
        .from(dailyAssignments)
        .where(and(
          eq(dailyAssignments.projectId, projectId),
          eq(dailyAssignments.activityType, "MONTAGGIO"),
          eq(dailyAssignments.companyId, companyId),
          eq(dailyAssignments.isDraft, false),
        ));
      if (montaggioAssignments.length === 0) return;
      const earliest = montaggioAssignments.reduce((min, a) => a.date < min ? a.date : min, montaggioAssignments[0].date);

      // Recupera l'opportunità per verificare siteQuality e la data precedente
      const [currentOpp] = await db
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.id, project.opportunityId), eq(opportunities.companyId, companyId)));

      const updateFields: Record<string, unknown> = { estimatedStartDate: earliest, updatedAt: new Date() };

      // Se l'opportunità richiede foto o foto+video, aggiorna la data di notifica programmata
      const sq = currentOpp?.siteQuality;
      if (sq === "PHOTO_VIDEO" || sq === "PHOTO_ONLY") {
        const newScheduledAt = new Date(earliest);
        newScheduledAt.setDate(newScheduledAt.getDate() - 10);

        const prevScheduledAt = currentOpp?.photoNotificationScheduledAt;
        const isDateChanged = !prevScheduledAt || Math.abs(newScheduledAt.getTime() - new Date(prevScheduledAt).getTime()) > 0;

        if (isDateChanged) {
          updateFields.photoNotificationScheduledAt = newScheduledAt;
          // Azzera photoNotificationSentAt solo se la notifica non è ancora stata inviata
          // (o se la data è cambiata, per rinviare la notifica)
          updateFields.photoNotificationSentAt = null;
        }
      }

      await db
        .update(opportunities)
        .set(updateFields)
        .where(and(eq(opportunities.id, project.opportunityId), eq(opportunities.companyId, companyId)));
    } catch (err) {
      console.error("Error updating opportunity start date from MONTAGGIO:", err);
    }
  }

  app.get("/api/assignments/material-sigla", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const CONSEGNA_TYPES = ["CONSEGNA", "CONSEGNA_COMBINATO"];
      const rows = await db
        .select({ projectId: dailyAssignments.projectId, materialType: dailyAssignments.materialType })
        .from(dailyAssignments)
        .where(and(
          eq(dailyAssignments.companyId, userCompany.companyId),
          inArray(dailyAssignments.activityType, CONSEGNA_TYPES),
          isNotNull(dailyAssignments.projectId),
          isNotNull(dailyAssignments.materialType)
        ));
      const map: Record<string, string> = {};
      for (const row of rows) {
        if (!row.projectId || !row.materialType) continue;
        const existing = map[row.projectId];
        if (!existing) {
          map[row.projectId] = row.materialType;
        } else {
          const parts = existing.split("/");
          if (!parts.includes(row.materialType)) {
            map[row.projectId] = existing + "/" + row.materialType;
          }
        }
      }
      res.json(map);
    } catch (error) {
      console.error("Error fetching material sigla:", error);
      res.status(500).json({ message: "Errore nel recupero dei materiali" });
    }
  });

  app.get("/api/projects/:projectId/deliveries", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { projectId } = req.params;
      const CONSEGNA_TYPES = ["CONSEGNA", "CONSEGNA_COMBINATO"];
      const deliveries = await db
        .select()
        .from(dailyAssignments)
        .where(and(
          eq(dailyAssignments.companyId, userCompany.companyId),
          eq(dailyAssignments.projectId, projectId),
          inArray(dailyAssignments.activityType, CONSEGNA_TYPES)
        ))
        .orderBy(dailyAssignments.date);
      res.json(deliveries);
    } catch (error) {
      console.error("Error fetching project deliveries:", error);
      res.status(500).json({ message: "Errore nel recupero delle consegne" });
    }
  });

  app.get("/api/assignments", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate e endDate sono obbligatori" });
      const result = await storage.getDailyAssignmentsByDateRange(
        userCompany.companyId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      res.json(result);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ message: "Errore nel recupero delle assegnazioni" });
    }
  });

  app.post("/api/assignments", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { date, endDate, activityType, clientName, siteCity, siteProvince, siteAddress, scheduledTime, driverId, vehicleId, teamIds, assemblerCount, notes, projectId, gridNote, workerAssignments, timeSlot, endDayTimeSlot, isDraft, workingDays, materialType, materialQuantity, materials, chi, cosa } = req.body;
      if (!date || !activityType) return res.status(400).json({ message: "Data e tipo attività sono obbligatori" });
      if (endDate && new Date(endDate) < new Date(date)) return res.status(400).json({ message: "La data fine non può essere precedente alla data inizio" });
      const workingDaysSchema = z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]);
      const workingDaysParsed = workingDaysSchema.safeParse(workingDays);
      if (!workingDaysParsed.success) return res.status(400).json({ message: "workingDays deve contenere valori interi tra 0 e 6" });
      const workingDaysValidated = workingDaysParsed.data;
      const VALID_MATERIAL_TYPES = ["EP", "PL", "VILLA", "MC", "EL"];
      const materialItemSchema = z.object({ type: z.string(), quantity: z.number().int().positive() });
      const validatedMaterials: Array<{ type: string; quantity: number }> | null = (() => {
        if (!Array.isArray(materials) || materials.length === 0) return null;
        const parsed = materials
          .map((m: unknown) => materialItemSchema.safeParse(m))
          .filter((r): r is z.SafeParseSuccess<{ type: string; quantity: number }> => r.success && VALID_MATERIAL_TYPES.includes(r.data.type))
          .map(r => r.data);
        return parsed.length > 0 ? parsed : null;
      })();
      const firstMaterial = validatedMaterials?.[0] ?? null;
      const validatedMaterialType = firstMaterial ? firstMaterial.type : (materialType && VALID_MATERIAL_TYPES.includes(materialType) ? materialType : null);
      const validatedMaterialQuantity = firstMaterial ? firstMaterial.quantity : (() => { const n = Number(materialQuantity); return (materialQuantity && Number.isInteger(n) && n > 0) ? n : null; })();
      const nextSortOrder = await storage.getNextSortOrderForDay(userCompany.companyId, new Date(date));
      const assignment = await storage.createDailyAssignment({
        companyId: userCompany.companyId,
        projectId: projectId || null,
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        activityType,
        clientName: clientName || null,
        siteCity: siteCity || null,
        siteProvince: siteProvince || null,
        siteAddress: siteAddress || null,
        scheduledTime: scheduledTime || null,
        driverId: driverId || null,
        vehicleId: vehicleId || null,
        teamIds: teamIds || null,
        assemblerCount: assemblerCount || null,
        notes: notes || null,
        gridNote: gridNote || null,
        workerAssignments: workerAssignments || null,
        timeSlot: timeSlot || "FULL_DAY",
        endDayTimeSlot: endDayTimeSlot || "FULL_DAY",
        status: "PIANIFICATA",
        isDraft: isDraft === true,
        sortOrder: nextSortOrder,
        workingDays: workingDaysValidated,
        materialType: validatedMaterialType,
        materialQuantity: validatedMaterialQuantity,
        materials: validatedMaterials,
        chi: chi || null,
        cosa: cosa || null,
      });
      if (activityType === "MONTAGGIO" && projectId) {
        await updateOpportunityStartDateFromMontaggio(projectId, userCompany.companyId);
      }
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating assignment:", error);
      res.status(500).json({ message: "Errore nella creazione dell'assegnazione" });
    }
  });

  app.patch("/api/assignments/reorder", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { idA, idB, id, toIndex, targetDate, prePadding } = req.body;
      if (id !== undefined && toIndex !== undefined) {
        if (typeof toIndex !== "number") return res.status(400).json({ message: "toIndex deve essere un numero" });
        const pp = typeof prePadding === "number" ? prePadding : undefined;
        if (targetDate) {
          const ok = await storage.moveDailyAssignmentToDay(userCompany.companyId, id, new Date(targetDate), toIndex, pp);
          if (!ok) return res.status(409).json({ message: "Assegnazione non trovata" });
          return res.json({ success: true });
        }
        const ok = await storage.moveDailyAssignmentToIndex(userCompany.companyId, id, toIndex, pp);
        if (!ok) return res.status(409).json({ message: "Assegnazione non trovata" });
        return res.json({ success: true });
      }
      if (!idA || !idB) return res.status(400).json({ message: "idA e idB sono obbligatori" });
      if (idA === idB) return res.status(400).json({ message: "idA e idB devono essere diversi" });
      const ok = await storage.reorderDailyAssignments(userCompany.companyId, idA, idB);
      if (!ok) return res.status(409).json({ message: "Assegnazioni non trovate o non appartengono allo stesso giorno" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering assignments:", error);
      res.status(500).json({ message: "Errore nel riordino delle assegnazioni" });
    }
  });

  app.patch("/api/assignments/:id/pre-padding", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { delta } = req.body;
      if (delta !== 1 && delta !== -1) return res.status(400).json({ message: "delta deve essere 1 o -1" });
      const assignment = await storage.updateDailyAssignmentPrePadding(userCompany.companyId, req.params.id, delta);
      if (!assignment) return res.status(404).json({ message: "Assegnazione non trovata" });
      res.json(assignment);
    } catch (error) {
      console.error("Error updating pre-padding:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento del prePadding" });
    }
  });

  app.patch("/api/assignments/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const prevRows = await db
        .select({ activityType: dailyAssignments.activityType, projectId: dailyAssignments.projectId })
        .from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, req.params.id), eq(dailyAssignments.companyId, userCompany.companyId)))
        .limit(1);
      const prev = prevRows[0] ?? null;
      const updateData: any = { ...req.body };
      if (updateData.date) updateData.date = new Date(updateData.date);
      if (updateData.endDate && updateData.endDate !== "") {
        updateData.endDate = new Date(updateData.endDate);
      } else if (updateData.endDate === null || updateData.endDate === "") {
        updateData.endDate = null;
      }
      if (updateData.date && updateData.endDate && updateData.endDate < updateData.date) {
        return res.status(400).json({ message: "La data fine non può essere precedente alla data inizio" });
      }
      if (updateData.workingDays !== undefined) {
        const workingDaysUpdateSchema = z.array(z.number().int().min(0).max(6));
        const wdParsed = workingDaysUpdateSchema.safeParse(updateData.workingDays);
        if (!wdParsed.success) return res.status(400).json({ message: "workingDays deve contenere valori interi tra 0 e 6" });
        updateData.workingDays = wdParsed.data;
      }
      const VALID_MATERIAL_TYPES_PATCH = ["EP", "PL", "VILLA", "MC", "EL"];
      const materialItemSchemaPatch = z.object({ type: z.string(), quantity: z.number().int().positive() });
      if ("materials" in updateData) {
        const rawMats = updateData.materials;
        const validatedMats: Array<{ type: string; quantity: number }> | null = (() => {
          if (!Array.isArray(rawMats) || rawMats.length === 0) return null;
          const parsed = rawMats
            .map((m: unknown) => materialItemSchemaPatch.safeParse(m))
            .filter((r): r is z.SafeParseSuccess<{ type: string; quantity: number }> => r.success && VALID_MATERIAL_TYPES_PATCH.includes(r.data.type))
            .map(r => r.data);
          return parsed.length > 0 ? parsed : null;
        })();
        updateData.materials = validatedMats;
        updateData.materialType = validatedMats ? validatedMats[0].type : null;
        updateData.materialQuantity = validatedMats ? validatedMats[0].quantity : null;
      } else {
        if ("materialType" in updateData) {
          updateData.materialType = (updateData.materialType && VALID_MATERIAL_TYPES_PATCH.includes(updateData.materialType)) ? updateData.materialType : null;
        }
        if ("materialQuantity" in updateData) {
          const mqNum = Number(updateData.materialQuantity);
          updateData.materialQuantity = (updateData.materialQuantity && Number.isInteger(mqNum) && mqNum > 0) ? mqNum : null;
        }
      }
      const assignment = await storage.updateDailyAssignment(req.params.id, userCompany.companyId, updateData);
      if (!assignment) return res.status(404).json({ message: "Assegnazione non trovata" });
      const projectsToRecalc = new Set<string>();
      if (assignment.activityType === "MONTAGGIO" && assignment.projectId) {
        projectsToRecalc.add(assignment.projectId);
      }
      if (prev && prev.activityType === "MONTAGGIO" && prev.projectId) {
        const typeChanged = assignment.activityType !== "MONTAGGIO";
        const projectChanged = prev.projectId !== assignment.projectId;
        if (typeChanged || projectChanged) {
          projectsToRecalc.add(prev.projectId);
        }
      }
      for (const pid of projectsToRecalc) {
        await updateOpportunityStartDateFromMontaggio(pid, userCompany.companyId);
      }
      res.json(assignment);
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento dell'assegnazione" });
    }
  });

  app.delete("/api/assignments/:id", isAuthenticated, requireProxitLock, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const existingAssignment = await db
        .select({ activityType: dailyAssignments.activityType, projectId: dailyAssignments.projectId })
        .from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, req.params.id), eq(dailyAssignments.companyId, userCompany.companyId)))
        .limit(1);
      const deleted = await storage.deleteDailyAssignment(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Assegnazione non trovata" });
      if (existingAssignment.length > 0 && existingAssignment[0].activityType === "MONTAGGIO" && existingAssignment[0].projectId) {
        await updateOpportunityStartDateFromMontaggio(existingAssignment[0].projectId, userCompany.companyId);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'assegnazione" });
    }
  });

  // ========== PROXIT - Presence / Lock API ==========

  const HEARTBEAT_TIMEOUT_MS = 30 * 1000; // 30 secondi

  // Helper: restituisce l'utente che ha il lock (priorità più bassa tra i presenti attivi)
  async function getProxitLockHolder(companyId: string): Promise<{ userId: string; firstName: string; lastName: string } | null> {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
    // Prendi le presenze attive
    const activePresences = await db
      .select({ userId: proxitPresence.userId })
      .from(proxitPresence)
      .where(and(
        eq(proxitPresence.companyId, companyId),
        gte(proxitPresence.lastHeartbeat, cutoff)
      ));
    if (activePresences.length === 0) return null;
    const activeUserIds = activePresences.map((p) => p.userId);
    // Trova chi tra i presenti ha la priorità più bassa (numero più basso = priorità più alta)
    const userRows = await db
      .select({
        userId: userCompanies.userId,
        proxitPriority: userCompanies.proxitPriority,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(userCompanies)
      .innerJoin(users, eq(users.id, userCompanies.userId))
      .where(and(
        eq(userCompanies.companyId, companyId),
        inArray(userCompanies.userId, activeUserIds)
      ));
    // Filtra solo chi ha proxitPriority non null
    const withPriority = userRows.filter((r) => r.proxitPriority !== null && r.proxitPriority !== undefined);
    if (withPriority.length === 0) return null;
    // Ordina per priorità ascending (numero più basso = priorità più alta)
    withPriority.sort((a, b) => (a.proxitPriority! - b.proxitPriority!));
    const winner = withPriority[0];
    return { userId: winner.userId, firstName: winner.firstName, lastName: winner.lastName };
  }

  // GET /api/proxit/warehouse-balances - Recupera tutti i saldi magazzino per l'azienda
  app.get("/api/proxit/warehouse-balances", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const balances = await storage.getWarehouseBalances(userCompany.companyId);
      res.json(balances);
    } catch (error) {
      console.error("Error getting warehouse balances:", error);
      res.status(500).json({ message: "Errore nel recupero dei saldi magazzino" });
    }
  });

  // POST /api/proxit/warehouse-balances - Salva o aggiorna un saldo magazzino
  app.post("/api/proxit/warehouse-balances", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { warehouseType, date, value } = req.body;
      if (!warehouseType || !["VILLA", "PL", "EP"].includes(warehouseType)) {
        return res.status(400).json({ message: "warehouseType deve essere VILLA, PL o EP" });
      }
      if (typeof value !== "number") {
        return res.status(400).json({ message: "value deve essere un numero" });
      }
      const dateObj = date ? new Date(date) : null;
      const balance = await storage.upsertWarehouseBalance(userCompany.companyId, warehouseType, dateObj, value);
      res.json(balance);
    } catch (error) {
      console.error("Error saving warehouse balance:", error);
      res.status(500).json({ message: "Errore nel salvataggio del saldo magazzino" });
    }
  });

  // DELETE /api/proxit/warehouse-balances - Elimina un saldo magazzino (per undo)
  app.delete("/api/proxit/warehouse-balances", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { warehouseType, date } = req.body;
      if (!warehouseType || !["VILLA", "PL", "EP"].includes(warehouseType)) {
        return res.status(400).json({ message: "warehouseType deve essere VILLA, PL o EP" });
      }
      const dateObj = date ? new Date(date) : null;
      await storage.deleteWarehouseBalance(userCompany.companyId, warehouseType, dateObj);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting warehouse balance:", error);
      res.status(500).json({ message: "Errore nell'eliminazione del saldo magazzino" });
    }
  });

  // GET /api/proxit/lock - Restituisce chi ha il lock
  app.get("/api/proxit/lock", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const lockHolder = await getProxitLockHolder(userCompany.companyId);
      res.json({ lockHolder });
    } catch (error) {
      console.error("Error getting proxit lock:", error);
      res.status(500).json({ message: "Errore nel recupero del lock" });
    }
  });

  // POST /api/proxit/heartbeat - Upsert presenza per sessione (un record per sessionId)
  app.post("/api/proxit/heartbeat", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ message: "sessionId obbligatorio" });
      const companyId = userCompany.companyId;
      const now = new Date();
      // Upsert atomico per sessione (ON CONFLICT) — multi-tab safe
      await db
        .insert(proxitPresence)
        .values({ userId, companyId, sessionId, lastHeartbeat: now })
        .onConflictDoUpdate({
          target: [proxitPresence.userId, proxitPresence.companyId, proxitPresence.sessionId],
          set: { lastHeartbeat: now },
        });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error sending proxit heartbeat:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento della presenza" });
    }
  });

  // DELETE /api/proxit/heartbeat - Rimuove presenza (solo se sessionId corrisponde)
  app.delete("/api/proxit/heartbeat", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const { sessionId } = req.body as { sessionId?: string };
      if (sessionId) {
        // Session-safe: rimuove solo se il sessionId corrisponde a quello registrato
        await db
          .delete(proxitPresence)
          .where(and(
            eq(proxitPresence.userId, userId),
            eq(proxitPresence.companyId, userCompany.companyId),
            eq(proxitPresence.sessionId, sessionId)
          ));
      } else {
        // Fallback senza sessionId (compatibilità)
        await db
          .delete(proxitPresence)
          .where(and(eq(proxitPresence.userId, userId), eq(proxitPresence.companyId, userCompany.companyId)));
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Error removing proxit presence:", error);
      res.status(500).json({ message: "Errore nella rimozione della presenza" });
    }
  });

  // Middleware: verifica che l'utente abbia il lock Proxit per le operazioni di scrittura
  async function requireProxitLock(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;
      if (!userId || !role) return res.status(401).json({ message: "Accesso non autorizzato" });
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const lockHolder = await getProxitLockHolder(userCompany.companyId);
      if (!lockHolder || lockHolder.userId !== userId) {
        return res.status(403).json({ message: "Non hai il controllo di Proxit. Solo chi ha il lock può modificare." });
      }
      next();
    } catch (error) {
      console.error("Error checking proxit lock:", error);
      res.status(500).json({ message: "Errore nella verifica del lock" });
    }
  }

  // ========== PROXIT - Admin Priority API ==========

  // GET /api/proxit/priority-list - Lista utenti della company ordinata per priorità
  app.get("/api/proxit/priority-list", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato: solo admin" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const companyId = userCompany.companyId;
      const rows = await db
        .select({
          userId: userCompanies.userId,
          proxitPriority: userCompanies.proxitPriority,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
        })
        .from(userCompanies)
        .innerJoin(users, eq(users.id, userCompanies.userId))
        .where(eq(userCompanies.companyId, companyId));
      // Ordina: prima quelli con priorità (ascending), poi quelli senza
      rows.sort((a, b) => {
        if (a.proxitPriority === null && b.proxitPriority === null) return 0;
        if (a.proxitPriority === null) return 1;
        if (b.proxitPriority === null) return -1;
        return a.proxitPriority - b.proxitPriority;
      });
      res.json(rows);
    } catch (error) {
      console.error("Error fetching proxit priority list:", error);
      res.status(500).json({ message: "Errore nel recupero della lista priorità" });
    }
  });

  // PATCH /api/users/:id/proxit-priority - Imposta priorità Proxit (solo admin)
  app.patch("/api/users/:id/proxit-priority", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato: solo admin" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const companyId = userCompany.companyId;
      const targetUserId = req.params.id;
      // Verifica che l'utente target appartenga alla stessa company
      const targetUserCompany = await storage.getUserCompany(targetUserId);
      if (!targetUserCompany || targetUserCompany.companyId !== companyId) {
        return res.status(404).json({ message: "Utente non trovato nella tua azienda" });
      }
      const { proxitPriority } = req.body;
      let priority: number | null;
      if (proxitPriority === null || proxitPriority === undefined) {
        priority = null;
      } else {
        priority = parseInt(proxitPriority, 10);
        if (isNaN(priority) || priority < 1) {
          return res.status(400).json({ message: "proxitPriority deve essere un intero >= 1 o null" });
        }
      }
      await db
        .update(userCompanies)
        .set({ proxitPriority: priority })
        .where(and(eq(userCompanies.userId, targetUserId), eq(userCompanies.companyId, companyId)));
      res.json({ ok: true, proxitPriority: priority });
    } catch (error) {
      console.error("Error updating proxit priority:", error);
      res.status(500).json({ message: "Errore nell'aggiornamento della priorità" });
    }
  });

  // POST /api/proxit/swap-priority - Scambia priorità tra due utenti (transazionale)
  app.post("/api/proxit/swap-priority", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Accesso negato: solo admin" });
      }
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      const companyId = userCompany.companyId;
      const { userIdA, userIdB } = req.body as { userIdA?: string; userIdB?: string };
      if (!userIdA || !userIdB) return res.status(400).json({ message: "userIdA e userIdB obbligatori" });
      // Verifica che entrambi gli utenti appartengano alla company
      const [rowA] = await db
        .select({ proxitPriority: userCompanies.proxitPriority })
        .from(userCompanies)
        .where(and(eq(userCompanies.userId, userIdA), eq(userCompanies.companyId, companyId)))
        .limit(1);
      const [rowB] = await db
        .select({ proxitPriority: userCompanies.proxitPriority })
        .from(userCompanies)
        .where(and(eq(userCompanies.userId, userIdB), eq(userCompanies.companyId, companyId)))
        .limit(1);
      if (!rowA || !rowB) return res.status(404).json({ message: "Utenti non trovati nella tua azienda" });
      // Scambio transazionale
      await db.transaction(async (tx) => {
        await tx
          .update(userCompanies)
          .set({ proxitPriority: rowB.proxitPriority })
          .where(and(eq(userCompanies.userId, userIdA), eq(userCompanies.companyId, companyId)));
        await tx
          .update(userCompanies)
          .set({ proxitPriority: rowA.proxitPriority })
          .where(and(eq(userCompanies.userId, userIdB), eq(userCompanies.companyId, companyId)));
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error swapping proxit priority:", error);
      res.status(500).json({ message: "Errore nello scambio delle priorità" });
    }
  });

  // ========== CREDITSAFE API ==========

  app.post("/api/creditsafe/fetch", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;


      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const { leadId, vatNumber } = req.body;
      if (!leadId || !vatNumber) {
        return res.status(400).json({ message: "leadId e vatNumber sono obbligatori" });
      }

      const lead = await storage.getLeadWithAccess(leadId, { userId, role, companyId: userCompany.companyId });
      if (!lead) return res.status(404).json({ message: "Contatto non trovato" });

      const { fetchAndSaveReport } = await import("./creditsafe");
      const report = await fetchAndSaveReport(leadId, userCompany.companyId, vatNumber);
      
      const updatedLead = await storage.getLeadWithAccess(leadId, { userId, role, companyId: userCompany.companyId });

      res.json({ report, lead: updatedLead });
    } catch (error: any) {
      console.error("Error fetching CreditSafe report:", error);
      res.status(500).json({ message: error.message || "Errore nel recupero del report CreditSafe" });
    }
  });

  app.get("/api/creditsafe/report/:leadId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;


      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const lead = await storage.getLeadWithAccess(req.params.leadId, { userId, role, companyId: userCompany.companyId });
      if (!lead) return res.status(404).json({ message: "Contatto non trovato" });

      const { getReportByLeadId } = await import("./creditsafe");
      const report = await getReportByLeadId(req.params.leadId, userCompany.companyId);
      
      res.json({ report });
    } catch (error: any) {
      console.error("Error getting CreditSafe report:", error);
      res.status(500).json({ message: error.message || "Errore nel recupero del report" });
    }
  });

  // ========== Payment Methods ==========
  app.get("/api/payment-methods", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const methods = await storage.getPaymentMethodsByCompany(userCompany.companyId);
      res.json(methods);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/payment-methods", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN" && role !== "SALES_AGENT") return res.status(403).json({ message: "Non autorizzato" });
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const parsed = insertPaymentMethodSchema.omit({ companyId: true }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
      const method = await storage.createPaymentMethod({ ...parsed.data, companyId: userCompany.companyId });
      res.status(201).json(method);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/payment-methods/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN" && role !== "SALES_AGENT") return res.status(403).json({ message: "Non autorizzato" });
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Nome obbligatorio" });
      const method = await storage.updatePaymentMethod(req.params.id, userCompany.companyId, { name: name.trim() });
      if (!method) return res.status(404).json({ message: "Modalità non trovata" });
      res.json(method);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/payment-methods/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN" && role !== "SALES_AGENT") return res.status(403).json({ message: "Non autorizzato" });
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const deleted = await storage.deletePaymentMethod(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Modalità non trovata" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ REMINDERS (Promemoria) ============

  // GET /api/reminders - Lista promemoria utente con filtri opzionali
  app.get("/api/reminders", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const filters: { dueBefore?: Date; dueAfter?: Date; completed?: boolean } = {};
      if (req.query.dueBefore) filters.dueBefore = new Date(req.query.dueBefore as string);
      if (req.query.dueAfter) filters.dueAfter = new Date(req.query.dueAfter as string);
      if (req.query.completed !== undefined) filters.completed = req.query.completed === "true";

      const items = await storage.getRemindersByUser(userId, userCompany.companyId, filters);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/reminders/lead/:leadId - Promemoria per un lead specifico
  app.get("/api/reminders/lead/:leadId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const items = await storage.getRemindersByLead(req.params.leadId, userCompany.companyId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/reminders/opportunities-with-active-manual - Opportunità con promemoria manuali attivi
  app.get("/api/reminders/opportunities-with-active-manual", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const opportunityIds = await storage.getOpportunitiesWithActiveManualReminders(userCompany.companyId);
      res.json(opportunityIds);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/reminders/opportunity/:opportunityId - Promemoria per un'opportunità
  app.get("/api/reminders/opportunity/:opportunityId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const items = await storage.getRemindersByOpportunity(req.params.opportunityId, userCompany.companyId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/reminders - Crea nuovo promemoria
  app.post("/api/reminders", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const body = { ...req.body };
      if (typeof body.dueDate === "string") {
        const d = new Date(body.dueDate);
        if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) {
          return res.status(400).json({ message: "Data non valida" });
        }
        body.dueDate = d;
      }
      const parsed = insertReminderSchema.omit({ companyId: true, userId: true }).safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });

      const reminder = await storage.createReminder({
        ...parsed.data,
        userId,
        companyId: userCompany.companyId,
      });
      res.status(201).json(reminder);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/reminders/:id - Aggiorna promemoria (es. completamento)
  app.patch("/api/reminders/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const existing = await storage.getReminder(req.params.id, userCompany.companyId);
      if (!existing) return res.status(404).json({ message: "Promemoria non trovato" });

      const updateData: any = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.dueDate !== undefined) updateData.dueDate = new Date(req.body.dueDate);
      if (req.body.completed !== undefined) {
        updateData.completed = req.body.completed;
        updateData.completedAt = req.body.completed ? new Date() : null;
      }

      const reminder = await storage.updateReminder(req.params.id, userCompany.companyId, updateData);
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/reminders/:id - Elimina promemoria
  app.delete("/api/reminders/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
      const deleted = await storage.deleteReminder(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Promemoria non trovato" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== BILLING PROFILES (Profili di fatturazione) ==========

  // GET /api/billing-profiles - Lista profili fatturazione
  app.get("/api/billing-profiles", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });
      const profiles = await storage.getBillingProfilesByCompany(userCompany.companyId);
      res.json(profiles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/billing-profiles/by-type/:type - Profilo per tipo
  app.get("/api/billing-profiles/by-type/:type", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });
      const profileType = req.params.type as "PRIVATE" | "PUBLIC";
      if (!["PRIVATE", "PUBLIC"].includes(profileType)) {
        return res.status(400).json({ message: "Tipo profilo non valido" });
      }
      const profile = await storage.getBillingProfileByType(userCompany.companyId, profileType);
      if (!profile) return res.status(404).json({ message: "Profilo non trovato" });
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/billing-profiles - Crea profilo fatturazione
  app.post("/api/billing-profiles", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Non autorizzato" });
      }
      const existing = await storage.getBillingProfileByType(userCompany.companyId, req.body.profileType);
      if (existing) {
        return res.status(409).json({ message: `Profilo ${req.body.profileType} già esistente. Utilizzare PUT per aggiornarlo.` });
      }
      const profile = await storage.createBillingProfile({ ...req.body, companyId: userCompany.companyId });
      res.status(201).json(profile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PUT /api/billing-profiles/:id - Aggiorna profilo fatturazione
  app.put("/api/billing-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Non autorizzato" });
      }
      const profile = await storage.updateBillingProfile(req.params.id, userCompany.companyId, req.body);
      if (!profile) return res.status(404).json({ message: "Profilo non trovato" });
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/billing-profiles/:id - Elimina profilo fatturazione
  app.delete("/api/billing-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Non autorizzato" });
      }
      const deleted = await storage.deleteBillingProfile(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Profilo non trovato" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== GEOCODING & MAP ====================

  // POST /api/geocode - Geocodifica indirizzo usando Nominatim (OpenStreetMap)
  app.post("/api/geocode", isAuthenticated, async (req, res) => {
    try {
      const { address } = req.body;
      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "Indirizzo mancante" });
      }
      const encoded = encodeURIComponent(address);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=it`,
        { headers: { "User-Agent": "DaDoPonteggiCRM/1.0" } }
      );
      const results = await response.json();
      if (!results || results.length === 0) {
        return res.json({ found: false });
      }
      res.json({
        found: true,
        latitude: parseFloat(results[0].lat),
        longitude: parseFloat(results[0].lon),
        displayName: results[0].display_name,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/map/geocode-all - Geocodifica tutte le opportunità senza coordinate
  app.post("/api/map/geocode-all", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });
      if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
        return res.status(403).json({ message: "Non autorizzato" });
      }

      const ctx: AccessContext = { userId, role: role as UserRole, companyId: userCompany.companyId };
      const allOpps = await storage.getOpportunitiesWithAccess(ctx);
      const toGeocode = allOpps.filter((o: any) => !o.siteLatitude && (o.siteAddress || o.siteCity));

      let geocoded = 0;
      for (const opp of toGeocode) {
        const addr = `${opp.siteAddress || ""} ${opp.siteZip || ""} ${opp.siteCity || ""} Italia`;
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=it`,
            { headers: { "User-Agent": "DaDoPonteggiCRM/1.0" } }
          );
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
            await storage.updateOpportunity(opp.id, userCompany.companyId, {
              siteLatitude: geoData[0].lat,
              siteLongitude: geoData[0].lon,
            } as any);
            geocoded++;
          }
          await new Promise(resolve => setTimeout(resolve, 1100));
        } catch (err) {
          console.error(`Geocoding failed for ${opp.id}:`, err);
        }
      }

      res.json({ total: toGeocode.length, geocoded });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/map/opportunities - Tutte le opportunità con coordinate per la mappa
  app.get("/api/map/opportunities", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(400).json({ message: "Company ID mancante" });

      const ctx: AccessContext = {
        userId,
        role: role as UserRole,
        companyId: userCompany.companyId,
      };
      const allOpps = await storage.getOpportunitiesWithAccess(ctx);
      const withCoords = allOpps
        .filter((o: any) => o.siteLatitude && o.siteLongitude)
        .map((o: any) => ({
          id: o.id,
          title: o.title,
          siteAddress: o.siteAddress,
          siteCity: o.siteCity,
          siteZip: o.siteZip,
          siteLatitude: parseFloat(o.siteLatitude),
          siteLongitude: parseFloat(o.siteLongitude),
          stageId: o.stageId,
          leadId: o.leadId,
          assignedToUserId: o.assignedToUserId,
          workType: o.workType,
          value: o.value,
          ritiroEsubero: o.ritiroEsubero,
          sopralluogoFatto: o.sopralluogoFatto,
          mapsLink: o.mapsLink,
          estimatedStartDate: o.estimatedStartDate,
          estimatedEndDate: o.estimatedEndDate,
        }));
      res.json(withCoords);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Notifications
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const notifs = await storage.getNotifications(user.id);
      res.json(notifs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const count = await storage.getUnreadNotificationCount(user.id);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await storage.markNotificationRead(req.params.id, user.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await storage.markAllNotificationsRead(user.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notification-preferences", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const prefs = await storage.getNotificationPreferences(user.id);
      res.json(prefs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notification-preferences/:type", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { type } = req.params;
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled deve essere un booleano" });
      }
      await storage.setNotificationPreference(user.id, type, enabled);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/notifications/check-expiring-quotes - Crea notifiche per preventivi inviati da 60+ giorni
  app.post("/api/notifications/check-expiring-quotes", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const companyId = userCompany.companyId;
      const stages = await storage.getStagesByCompany(companyId);
      const preventivoInviatoStage = stages.find(s => s.name === "Preventivo Inviato");
      if (!preventivoInviatoStage) {
        return res.json({ created: 0 });
      }

      const now = new Date();
      const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 giorni fa

      // Carica tutte le opportunità in "Preventivo Inviato" con quoteSentAt ≥ 60 giorni fa
      const expiring = await db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.companyId, companyId),
            eq(opportunities.stageId, preventivoInviatoStage.id),
            lte(opportunities.quoteSentAt, cutoff)
          )
        );

      // Filtra solo quelle il cui snooze è scaduto (o non impostato)
      const toNotify = expiring.filter(opp => {
        if (!opp.quoteReminderSnoozedUntil) return true;
        return new Date(opp.quoteReminderSnoozedUntil) < now;
      });

      let created = 0;
      for (const opp of toNotify) {
        const targetUserId = opp.assignedToUserId || userId;

        // Controlla se esiste già una notifica non letta per questa opportunità
        const existingNotifs = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, targetUserId),
              eq(notifications.type, "QUOTE_EXPIRING"),
              eq(notifications.isRead, false),
              eq(notifications.link, `/opportunita?open=${opp.id}`)
            )
          );

        if (existingNotifs.length > 0) continue;

        const daysAgo = Math.floor((now.getTime() - new Date(opp.quoteSentAt!).getTime()) / (24 * 60 * 60 * 1000));

        // Recupera il nome del cliente per il messaggio
        let clientName = opp.title;
        try {
          const lead = await storage.getLead(opp.leadId, companyId);
          if (lead) {
            clientName = lead.entityType === "COMPANY" ? (lead.name || opp.title) : `${lead.firstName} ${lead.lastName}`.trim() || opp.title;
          }
        } catch {}

        await storage.createNotification({
          userId: targetUserId,
          companyId,
          type: "QUOTE_EXPIRING",
          title: "Preventivo in attesa da 60 giorni",
          message: `${clientName} — preventivo in attesa da ${daysAgo} giorni`,
          link: `/opportunita?open=${opp.id}`,
          isRead: false,
        });
        created++;
      }

      res.json({ created });
    } catch (error: any) {
      console.error("Error checking expiring quotes:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/notifications/check-rdc-pending - Crea notifiche per progetti in fase RDC da 3+ giorni
  app.post("/api/notifications/check-rdc-pending", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const companyId = userCompany.companyId;
      const now = new Date();
      const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 giorni fa

      // Trova le fasi con "RDC" nel nome
      const rdcStages = await db
        .select()
        .from(projectStages)
        .where(
          and(
            eq(projectStages.companyId, companyId),
            drizzleSql`lower(${projectStages.name}) like '%rdc%'`
          )
        );

      if (rdcStages.length === 0) {
        return res.json({ created: 0 });
      }

      const rdcStageIds = rdcStages.map(s => s.id);

      // Trova progetti in fase RDC con stageEnteredAt <= 3 giorni fa (non nullo)
      const rdcProjects = await db
        .select()
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.companyId, companyId),
            drizzleSql`${projectsTable.stageId} = ANY(${rdcStageIds})`,
            drizzleSql`${projectsTable.stageEnteredAt} IS NOT NULL`,
            drizzleSql`${projectsTable.stageEnteredAt} <= ${cutoff}`
          )
        );

      // Recupera admin/super_admin dell'azienda
      const allUsers = await storage.getUsersByCompanyId(companyId);
      const adminUsers = allUsers.filter(u =>
        u.role === "COMPANY_ADMIN" || u.role === "SUPER_ADMIN"
      );

      let created = 0;
      for (const project of rdcProjects) {
        const daysAgo = project.stageEnteredAt
          ? Math.floor((now.getTime() - new Date(project.stageEnteredAt).getTime()) / (24 * 60 * 60 * 1000))
          : 3;

        // Destinatari: tecnico assegnato al progetto + admin/super_admin
        const recipientIds = new Set<string>();
        if (project.assignedTechnicianId) {
          recipientIds.add(project.assignedTechnicianId);
        }
        for (const admin of adminUsers) {
          recipientIds.add(admin.id);
        }

        // Link stabile con ID progetto per deduplicazione
        const notifLink = `/progetti?rdc=${project.id}`;

        for (const recipientId of recipientIds) {
          // Controlla se esiste già una notifica non letta per questo progetto e utente
          const existingNotifs = await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, recipientId),
                eq(notifications.type, "RDC_PENDING"),
                eq(notifications.isRead, false),
                eq(notifications.link, notifLink)
              )
            );

          if (existingNotifs.length > 0) continue;

          await storage.createNotification({
            userId: recipientId,
            companyId,
            type: "RDC_PENDING",
            title: "Sollecita l'ingegnere",
            message: `${project.clientName} è in attesa di RDC da ${daysAgo} giorni`,
            link: notifLink,
            isRead: false,
          });
          created++;
        }
      }

      res.json({ created });
    } catch (error: any) {
      console.error("Error checking RDC pending:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/opportunities/:id/snooze-reminder - Posticipa il promemoria di N giorni
  app.post("/api/opportunities/:id/snooze-reminder", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;

      if (!canAccessLeads(role)) {
        return res.status(403).json({ message: "Accesso negato" });
      }

      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }

      const { days } = req.body;
      if (!days || typeof days !== "number" || days <= 0) {
        return res.status(400).json({ message: "days deve essere un numero positivo" });
      }

      const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const opp = await storage.updateOpportunity(req.params.id, userCompany.companyId, {
        quoteReminderSnoozedUntil: snoozedUntil,
      });

      if (!opp) {
        return res.status(404).json({ message: "Opportunità non trovata" });
      }

      res.json({ success: true, snoozedUntil });
    } catch (error: any) {
      console.error("Error snoozing reminder:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============ CLAUSE OVERRIDES (Testi clausole Step 4) ============

  // Read-only endpoint for quote runtime consumption (all authenticated users)
  app.get("/api/clauses", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const overrides = await storage.getClauseOverridesByCompany(userCompany.companyId);
      res.json(overrides);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Settings management endpoint (admin only)
  app.get("/api/settings/clauses", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      console.log(`[clauses] GET /api/settings/clauses companyId=${userCompany.companyId}`);
      const overrides = await storage.getClauseOverridesByCompany(userCompany.companyId);
      console.log(`[clauses] GET ok, count=${overrides.length}`);
      res.json(overrides);
    } catch (error: any) {
      console.error(`[clauses] GET /api/settings/clauses error: ${error?.message} code=${error?.code}`, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/settings/clauses/:clauseId", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) {
        return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
      }
      const { clauseId } = req.params;
      const { text } = req.body;
      console.log(`[clauses] PUT /api/settings/clauses/${clauseId} companyId=${userCompany.companyId} textLength=${typeof text === 'string' ? text.length : 'invalid'}`);
      if (typeof text !== "string") {
        return res.status(400).json({ message: "text deve essere una stringa" });
      }
      if (text.trim() === "") {
        await storage.deleteClauseOverride(userCompany.companyId, clauseId);
        console.log(`[clauses] PUT deleted clauseId=${clauseId}`);
        return res.json({ deleted: true });
      }
      const override = await storage.upsertClauseOverride(userCompany.companyId, clauseId, text);
      console.log(`[clauses] PUT upserted id=${override.id}`);
      res.json(override);
    } catch (error: any) {
      console.error(`[clauses] PUT /api/settings/clauses error clauseId=${req.params?.clauseId}: ${error?.message} code=${error?.code}`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============ SALES TARGETS (Obiettivi mensili per venditore) ============

  // GET /api/sales-targets?month=&year=
  // Restituisce tutti i target del mese con totali reali calcolati da quotes e opportunities
  // Solo admin può vedere i target di tutti i venditori
  app.get("/api/sales-targets", isAuthenticated, async (req, res) => {
    try {
      // Solo admin può accedere ai target di tutti i venditori
      if (req.user!.role !== "COMPANY_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono vedere gli obiettivi del team" });
      }

      const userCompany = await storage.getUserCompany(req.user!.id);
      if (!userCompany?.companyId) {
        return res.status(403).json({ message: "Nessuna azienda associata" });
      }
      const companyId = userCompany.companyId;

      const monthParam = parseInt(req.query.month as string);
      const yearParam = parseInt(req.query.year as string);
      const startDateParam = req.query.startDate as string | undefined;
      const endDateParam = req.query.endDate as string | undefined;
      const proportionalParam = req.query.proportional === "true";
      const now = new Date();
      const month = isNaN(monthParam) ? now.getMonth() + 1 : monthParam;
      const year = isNaN(yearParam) ? now.getFullYear() : yearParam;

      // Recupera tutti i venditori (SALES_AGENT) dell'azienda
      const teamUsers = await storage.getUsersByCompanyId(companyId);
      const salesAgents = teamUsers.filter(u => u.role === "SALES_AGENT");

      // Calcola inizio e fine del mese (default per filtri mese singolo)
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      const today = new Date();
      const monthDays = new Date(year, month, 0).getDate();
      const daysTotal = monthDays;
      const daysElapsed = today < startOfMonth 
        ? 0
        : today > endOfMonth 
          ? daysTotal
          : today.getDate();

      // Se startDate/endDate sono forniti, usarli per il calcolo degli effettivi
      let periodStart = startOfMonth;
      let periodEnd = endOfMonth;
      let periodDays = monthDays;

      if (startDateParam && endDateParam) {
        periodStart = new Date(startDateParam);
        periodEnd = new Date(endDateParam);
        // Normalize to midnight to avoid time-of-day skew
        const startMidnight = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
        const endMidnight = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
        const msPerDay = 1000 * 60 * 60 * 24;
        periodDays = Math.floor((endMidnight.getTime() - startMidnight.getTime()) / msPerDay) + 1;
      }

      // Recupera i target:
      // - proportional=true (quarter/year/custom): somma i target di tutti i mesi coperti,
      //   con proporzione per mesi parziali (giorni sovrapposti / giorni del mese).
      //   Questo include custom su singolo mese parziale.
      // - last-week / last-month: startDate/endDate presenti ma proportional=false;
      //   il backend restituisce il target mensile intero; il frontend scala per last-week.
      // - Altrimenti: usa getSalesTargets per il mese/anno selezionato (single-month exact).
      let targetsByUser: Map<string, { quoteTarget: number; wonTarget: number }>;

      if (proportionalParam && startDateParam && endDateParam) {
        const allRangeTargets = await storage.getSalesTargetsForRange(companyId, periodStart, periodEnd);
        targetsByUser = new Map();

        // For each month in the range, compute proportional contribution
        const cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
        const rangeEndMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
        while (cursor <= rangeEndMonth) {
          const curYear = cursor.getFullYear();
          const curMonth = cursor.getMonth() + 1;
          const daysInMonth = new Date(curYear, curMonth, 0).getDate();
          // Compute overlap between this calendar month and the requested period
          const monthStart = new Date(curYear, curMonth - 1, 1);
          const monthEnd = new Date(curYear, curMonth, 0, 23, 59, 59, 999);
          const overlapStart = periodStart > monthStart ? periodStart : monthStart;
          const overlapEnd = periodEnd < monthEnd ? periodEnd : monthEnd;
          // Compute overlap in whole days
          const overlapStartMidnight = new Date(overlapStart.getFullYear(), overlapStart.getMonth(), overlapStart.getDate());
          const overlapEndMidnight = new Date(overlapEnd.getFullYear(), overlapEnd.getMonth(), overlapEnd.getDate());
          const overlapDays = Math.floor((overlapEndMidnight.getTime() - overlapStartMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const proportion = daysInMonth > 0 ? Math.min(overlapDays, daysInMonth) / daysInMonth : 0;

          const monthTargets = allRangeTargets.filter(t => t.month === curMonth && t.year === curYear);
          for (const t of monthTargets) {
            const existing = targetsByUser.get(t.userId) ?? { quoteTarget: 0, wonTarget: 0 };
            existing.quoteTarget += parseFloat(t.quoteTarget ?? "0") * proportion;
            existing.wonTarget += parseFloat(t.wonTarget ?? "0") * proportion;
            targetsByUser.set(t.userId, existing);
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        // Single-month: recupera i target salvati per questo mese/anno
        const targets = await storage.getSalesTargets(companyId, month, year);
        targetsByUser = new Map(targets.map(t => ({
          [t.userId]: {
            quoteTarget: parseFloat(t.quoteTarget ?? "0"),
            wonTarget: parseFloat(t.wonTarget ?? "0"),
          }
        })).flatMap(o => Object.entries(o)) as [string, { quoteTarget: number; wonTarget: number }][]);
      }

      // Recupera tutte le opportunità dell'azienda per il calcolo dei totali
      const allOpportunities = await db
        .select({
          id: opportunities.id,
          value: opportunities.value,
          assignedToUserId: opportunities.assignedToUserId,
          stageId: opportunities.stageId,
          wonAt: opportunities.wonAt,
          createdAt: opportunities.createdAt,
        })
        .from(opportunities)
        .where(eq(opportunities.companyId, companyId));

      // Recupera gli stage per identificare "Vinto"
      const stages = await storage.getStagesByCompany(companyId);
      const vintoStage = stages.find(s => s.name.toLowerCase() === "vinto");

      // Recupera preventivi creati nel periodo per venditore
      const monthQuotes = await db
        .select({
          id: quotes.id,
          totalAmount: quotes.totalAmount,
          opportunityId: quotes.opportunityId,
          createdAt: quotes.createdAt,
        })
        .from(quotes)
        .where(and(
          eq(quotes.companyId, companyId),
          gte(quotes.createdAt, periodStart),
          lte(quotes.createdAt, periodEnd)
        ));

      // Mappa opportunità per id per lookup veloce
      const oppMap = new Map(allOpportunities.map(o => [o.id, o]));

      // Calcola totali per venditore
      const sellerResults = salesAgents.map(agent => {
        const agentTargets = targetsByUser.get(agent.id) ?? { quoteTarget: 0, wonTarget: 0 };

        // Totale preventivi fatti (sum totalAmount dei quotes creati nel periodo per questo venditore)
        const agentQuotes = monthQuotes.filter(q => {
          const opp = oppMap.get(q.opportunityId);
          return opp?.assignedToUserId === agent.id;
        });
        const quotesTotal = agentQuotes.reduce((sum, q) => sum + parseFloat(q.totalAmount ?? "0"), 0);

        // Totale acquisiti (sum value delle opportunità vinte nel periodo per questo venditore)
        const wonTotal = allOpportunities
          .filter(o => {
            if (o.assignedToUserId !== agent.id) return false;
            if (!vintoStage || o.stageId !== vintoStage.id) return false;
            if (!o.wonAt) return false;
            const wonDate = new Date(o.wonAt);
            return wonDate >= periodStart && wonDate <= periodEnd;
          })
          .reduce((sum, o) => sum + parseFloat(o.value ?? "0"), 0);

        return {
          userId: agent.id,
          firstName: agent.firstName,
          lastName: agent.lastName,
          email: agent.email,
          displayName: agent.displayName,
          quoteTarget: Math.round(agentTargets.quoteTarget),
          wonTarget: Math.round(agentTargets.wonTarget),
          quotesTotal,
          wonTotal,
        };
      });

      res.json({
        month,
        year,
        daysElapsed,
        daysTotal,
        periodDays,
        monthDays,
        sellers: sellerResults,
      });
    } catch (error: any) {
      console.error("[sales-targets] GET error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/sales-targets/my - Target del venditore corrente per il mese corrente
  app.get("/api/sales-targets/my", isAuthenticated, async (req, res) => {
    try {
      const userCompany = await storage.getUserCompany(req.user!.id);
      if (!userCompany?.companyId) {
        return res.status(403).json({ message: "Nessuna azienda associata" });
      }
      const companyId = userCompany.companyId;
      const userId = req.user!.id;

      const now = new Date();

      const parseLocalDate = (s: string) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      };
      const customStart = req.query.startDate ? parseLocalDate(req.query.startDate as string) : null;
      const _endBase = req.query.endDate ? parseLocalDate(req.query.endDate as string) : null;
      const customEnd = _endBase ? new Date(_endBase.getFullYear(), _endBase.getMonth(), _endBase.getDate(), 23, 59, 59, 999) : null;

      const rangeStart = customStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
      const rangeEnd = customEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // For multi-month ranges (quarter, year), use the current month if today
      // falls within the range; otherwise use the last month of the range.
      const targetRef = (now >= rangeStart && now <= rangeEnd) ? now : rangeEnd;
      const month = targetRef.getMonth() + 1;
      const year = targetRef.getFullYear();

      const startOfMonth = rangeStart;
      const endOfMonth = rangeEnd;
      const daysTotal = customStart && customEnd
        ? Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24))
        : new Date(year, month, 0).getDate();
      const daysElapsed = customStart && customEnd
        ? Math.min(daysTotal, Math.ceil((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)))
        : now.getDate();

      const target = await storage.getSalesTarget(companyId, userId, month, year);

      // Recupera stages per trovare "Vinto"
      const stages = await storage.getStagesByCompany(companyId);
      const vintoStage = stages.find(s => s.name.toLowerCase() === "vinto");

      // Quotes dell'utente nel mese corrente
      const userOpportunities = await db
        .select({ id: opportunities.id, value: opportunities.value, stageId: opportunities.stageId, wonAt: opportunities.wonAt })
        .from(opportunities)
        .where(and(eq(opportunities.companyId, companyId), eq(opportunities.assignedToUserId, userId)));

      const userOppIds = new Set(userOpportunities.map(o => o.id));

      const monthQuotes = await db
        .select({ id: quotes.id, totalAmount: quotes.totalAmount, opportunityId: quotes.opportunityId })
        .from(quotes)
        .where(and(
          eq(quotes.companyId, companyId),
          gte(quotes.createdAt, startOfMonth),
          lte(quotes.createdAt, endOfMonth)
        ));

      const quotesTotal = monthQuotes
        .filter(q => userOppIds.has(q.opportunityId))
        .reduce((sum, q) => sum + parseFloat(q.totalAmount ?? "0"), 0);

      const wonTotal = userOpportunities
        .filter(o => {
          if (!vintoStage || o.stageId !== vintoStage.id) return false;
          if (!o.wonAt) return false;
          const wonDate = new Date(o.wonAt);
          return wonDate >= startOfMonth && wonDate <= endOfMonth;
        })
        .reduce((sum, o) => sum + parseFloat(o.value ?? "0"), 0);

      res.json({
        month,
        year,
        daysElapsed,
        daysTotal,
        quoteTarget: parseFloat(target?.quoteTarget ?? "0"),
        wonTarget: parseFloat(target?.wonTarget ?? "0"),
        quotesTotal,
        wonTotal,
      });
    } catch (error: any) {
      console.error("[sales-targets] GET /my error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Shared handler for POST and PUT /api/sales-targets - Imposta o aggiorna un obiettivo (solo admin)
  const upsertSalesTargetHandler = async (req: any, res: any) => {
    try {
      // Solo admin può scrivere
      if (req.user!.role !== "COMPANY_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Solo gli amministratori possono impostare gli obiettivi" });
      }

      const userCompany = await storage.getUserCompany(req.user!.id);
      if (!userCompany?.companyId) {
        return res.status(403).json({ message: "Nessuna azienda associata" });
      }

      const companyId = userCompany.companyId;
      const { userId, month, year, quoteTarget, wonTarget } = req.body;

      if (!userId || !month || !year) {
        return res.status(400).json({ message: "userId, month e year sono obbligatori" });
      }

      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "month deve essere un numero tra 1 e 12" });
      }
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        return res.status(400).json({ message: "year non valido" });
      }

      // Verifica che userId appartenga alla stessa azienda e sia un venditore
      const teamUsers = await storage.getUsersByCompanyId(companyId);
      const targetUser = teamUsers.find(u => u.id === userId);
      if (!targetUser) {
        return res.status(400).json({ message: "Utente non trovato nell'azienda" });
      }
      if (targetUser.role !== "SALES_AGENT" && targetUser.role !== "COMPANY_ADMIN") {
        return res.status(400).json({ message: "Gli obiettivi possono essere impostati solo per venditori" });
      }

      const target = await storage.upsertSalesTarget({
        companyId,
        userId,
        month: monthNum,
        year: yearNum,
        quoteTarget: String(parseFloat(String(quoteTarget)) || 0),
        wonTarget: String(parseFloat(String(wonTarget)) || 0),
      });

      res.json(target);
    } catch (error: any) {
      console.error("[sales-targets] upsert error:", error);
      res.status(500).json({ message: error.message });
    }
  };

  app.post("/api/sales-targets", isAuthenticated, upsertSalesTargetHandler);
  app.put("/api/sales-targets", isAuthenticated, upsertSalesTargetHandler);

  // ============ SAL - Stato Avanzamento Lavori ============

  const VALID_VAT_RATES = ["22", "10", "4", "RC"] as const;
  type SalVatRate = typeof VALID_VAT_RATES[number];
  function sanitizeVatRate(v: unknown): SalVatRate {
    const s = String(v || "22");
    return (VALID_VAT_RATES as readonly string[]).includes(s) ? (s as SalVatRate) : "22";
  }

  // GET /api/sal?period=YYYY-MM - Lista cantieri con attività nel mese + SAL status
  app.get("/api/sal", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const companyId = userCompany.companyId;

      const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);
      const [year, month] = period.split("-").map(Number);
      const startOfPeriod = new Date(year, month - 1, 1);
      const endOfPeriod = new Date(year, month, 0, 23, 59, 59);

      

      // Recupera tutti i progetti dell'azienda
      const allProjects = await storage.getProjectsByCompany(companyId);

      // Recupera assignments nel periodo con dettagli per Proxit operations summary
      const assignmentsInPeriod = await db
        .select({
          projectId: dailyAssignments.projectId,
          date: dailyAssignments.date,
          activityType: dailyAssignments.activityType,
          teamIds: dailyAssignments.teamIds,
          notes: dailyAssignments.notes,
        })
        .from(dailyAssignments)
        .where(
          and(
            eq(dailyAssignments.companyId, companyId),
            gte(dailyAssignments.date, startOfPeriod),
            lte(dailyAssignments.date, endOfPeriod),
          )
        )
        .orderBy(dailyAssignments.date);

      const projectIdsWithAssignments = new Set(
        assignmentsInPeriod.map((a) => a.projectId).filter(Boolean)
      );

      // Recupera SAL periods esistenti per questo mese
      const existingSalPeriods = await db
        .select()
        .from(salPeriodsTable)
        .where(
          and(
            eq(salPeriodsTable.companyId, companyId),
            eq(salPeriodsTable.period, period)
          )
        );

      const salByProjectId = new Map(existingSalPeriods.map((s) => [s.projectId, s]));

      // Recupera totali voci SAL per tutti i SAL del mese
      const salIds = existingSalPeriods.map((s) => s.id);
      const salTotalsMap = new Map<string, number>();
      if (salIds.length > 0) {
        const vociRows = await db
          .select({
            salPeriodId: salVociTable.salPeriodId,
            total: salVociTable.total,
          })
          .from(salVociTable)
          .where(inArray(salVociTable.salPeriodId, salIds));
        for (const v of vociRows) {
          const current = salTotalsMap.get(v.salPeriodId) || 0;
          salTotalsMap.set(v.salPeriodId, current + parseFloat(String(v.total || "0")));
        }
      }

      // Raggruppa assignments Proxit per progetto con dettagli compatti
      const proxitOpsByProject = new Map<string, Array<{ date: string; activityType: string; teamCount: number; notes: string | null }>>();
      const proxitCountByProject = new Map<string, number>();
      for (const a of assignmentsInPeriod) {
        if (a.projectId) {
          proxitCountByProject.set(a.projectId, (proxitCountByProject.get(a.projectId) || 0) + 1);
          if (!proxitOpsByProject.has(a.projectId)) proxitOpsByProject.set(a.projectId, []);
          proxitOpsByProject.get(a.projectId)!.push({
            date: a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10),
            activityType: a.activityType,
            teamCount: (a.teamIds || []).length,
            notes: a.notes || null,
          });
        }
      }

      // Determina cantiereStatus per ogni progetto (replica logica esistente)
      function getCantiereStatus(project: any): string {
        if (project.cantiereStatusOverride) return project.cantiereStatusOverride;
        return "NON_AVVIATO";
      }

      const ACTIVE_STATUSES = ["IN_CORSO", "MONTAGGIO_IN_CORSO", "SMONTAGGIO_IN_CORSO", "MONTAGGIO_PIANIFICATO"];

      // Filtra progetti rilevanti: attivi nel mese o con assegnazioni nel mese
      const relevantProjects = allProjects.filter((p) => {
        const hasAssignment = projectIdsWithAssignments.has(p.id);
        const status = getCantiereStatus(p);
        const isActive = ACTIVE_STATUSES.includes(status);
        const hasSal = salByProjectId.has(p.id);
        return hasAssignment || isActive || hasSal;
      });

      // Recupera dati aggiuntivi (quote, lead, opportunity)
      const opportunityIds = relevantProjects.map((p) => p.opportunityId);
      let opportunities_data: any[] = [];
      let leads_data: any[] = [];
      let quotes_data: any[] = [];

      if (opportunityIds.length > 0) {
        opportunities_data = await db
          .select()
          .from(opportunities)
          .where(inArray(opportunities.id, opportunityIds));

        const leadIds = [...new Set(opportunities_data.map((o) => o.leadId))];
        if (leadIds.length > 0) {
          leads_data = await db
            .select()
            .from(leadsTable)
            .where(inArray(leadsTable.id, leadIds));
        }

        const quoteIds = relevantProjects.map((p) => p.quoteId).filter(Boolean) as string[];
        if (quoteIds.length > 0) {
          quotes_data = await db
            .select()
            .from(quotes)
            .where(inArray(quotes.id, quoteIds));
        }
      }

      const oppById = new Map(opportunities_data.map((o) => [o.id, o]));
      const leadById = new Map(leads_data.map((l) => [l.id, l]));
      const quoteById = new Map(quotes_data.map((q) => [q.id, q]));

      const result = relevantProjects.map((p) => {
        const opp = oppById.get(p.opportunityId);
        const lead = opp ? leadById.get(opp.leadId) : null;
        const quote = p.quoteId ? quoteById.get(p.quoteId) : null;
        const sal = salByProjectId.get(p.id) || null;
        const status = getCantiereStatus(p);

        const clientName = lead
          ? lead.entityType === "COMPANY" ? lead.name : `${lead.firstName || ""} ${lead.lastName || ""}`.trim()
          : p.clientName;

        const salId = sal?.id || null;
        const salTotal = salId !== null ? (salTotalsMap.get(salId) ?? null) : null;
        const proxitCount = proxitCountByProject.get(p.id) || 0;
        const proxitOps = proxitOpsByProject.get(p.id) || [];

        return {
          projectId: p.id,
          clientName,
          siteAddress: p.siteAddress || opp?.siteAddress || null,
          quoteNumber: quote?.number || null,
          quoteId: p.quoteId || null,
          cantiereStatus: status,
          salId,
          salStatus: sal?.status || null,
          salTotal,
          proxitCount,
          proxitOps,
        };
      });

      res.json(result);
    } catch (error: any) {
      console.error("[sal] GET error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/sal/:id - Dettaglio SAL period con voci
  app.get("/api/sal/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const companyId = userCompany.companyId;

      

      const [salPeriod] = await db
        .select()
        .from(salPeriodsTable)
        .where(and(eq(salPeriodsTable.id, req.params.id), eq(salPeriodsTable.companyId, companyId)));

      if (!salPeriod) return res.status(404).json({ message: "SAL non trovato" });

      const voci = await db
        .select()
        .from(salVociTable)
        .where(eq(salVociTable.salPeriodId, salPeriod.id))
        .orderBy(salVociTable.sortOrder, salVociTable.createdAt);

      res.json({ ...salPeriod, voci });
    } catch (error: any) {
      console.error("[sal] GET/:id error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/sal/initialize - Crea o recupera SAL period per un progetto e mese, auto-popola le voci
  app.post("/api/sal/initialize", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const companyId = userCompany.companyId;

      const { projectId, period } = req.body;
      if (!projectId || !period) return res.status(400).json({ message: "projectId e period obbligatori" });

      

      // Verifica che il progetto esista e appartenga all'azienda
      const project = await storage.getProject(projectId, companyId);
      if (!project) return res.status(404).json({ message: "Progetto non trovato" });

      // Controlla se esiste già un SAL per questo progetto/periodo
      const [existing] = await db
        .select()
        .from(salPeriodsTable)
        .where(and(eq(salPeriodsTable.projectId, projectId), eq(salPeriodsTable.period, period)));

      if (existing) {
        const voci = await db
          .select()
          .from(salVociTable)
          .where(eq(salVociTable.salPeriodId, existing.id))
          .orderBy(salVociTable.sortOrder, salVociTable.createdAt);
        return res.json({ ...existing, voci });
      }

      // Crea nuovo SAL period
      const [newSal] = await db
        .insert(salPeriodsTable)
        .values({
          companyId,
          projectId,
          period,
          status: "BOZZA",
        })
        .returning();

      // Auto-popola le voci dal preventivo accettato
      const vociToInsert: any[] = [];
      let sortOrder = 0;

      if (project.quoteId) {
        const quoteItems_data = await storage.getQuoteItems(project.quoteId);
        const articleIds = quoteItems_data.map((qi) => qi.articleId);
        const articleMap = new Map<string, any>();

        if (articleIds.length > 0) {
          
          const articlesList = await db
            .select()
            .from(articlesTable)
            .where(inArray(articlesTable.id, articleIds));
          articlesList.forEach((a) => articleMap.set(a.id, a));
        }

        // Determina cantiereStatus per auto-inclusione noleggio
        const cantiereStatus = project.cantiereStatusOverride || "NON_AVVIATO";
        const NOLEGGIO_STATUSES = ["IN_CORSO", "MONTAGGIO_IN_CORSO", "SMONTAGGIO_IN_CORSO"];
        const includeNoleggio = NOLEGGIO_STATUSES.includes(cantiereStatus);

        const phaseOrder = ["DOCUMENTI", "TRASPORTO_ANDATA", "MOVIMENTAZIONE_MAGAZZINO", "MONTAGGIO", "NOLEGGIO", "SMONTAGGIO", "TRASPORTO_RITORNO"];
        const itemsByPhase = new Map<string, any[]>();
        phaseOrder.forEach((p) => itemsByPhase.set(p, []));

        for (const qi of quoteItems_data) {
          const phase = qi.phase || "NOLEGGIO";
          if (!itemsByPhase.has(phase)) itemsByPhase.set(phase, []);
          itemsByPhase.get(phase)!.push(qi);
        }

        let hasNoleggioItems = false;
        for (const phase of phaseOrder) {
          const items = itemsByPhase.get(phase) || [];
          if (phase === "NOLEGGIO" && !includeNoleggio) continue;

          for (const qi of items) {
            const article = articleMap.get(qi.articleId);
            const unitPrice = parseFloat(qi.unitPriceApplied || "0");
            const quantity = parseFloat(qi.quantity || "1");
            const total = unitPrice * quantity;

            if (phase === "NOLEGGIO") hasNoleggioItems = true;

            vociToInsert.push({
              salPeriodId: newSal.id,
              companyId,
              description: article?.name || qi.articleId,
              quantity: String(quantity),
              um: "cad",
              unitPrice: String(unitPrice),
              discountPercent: "0",
              total: String(total),
              vatRate: sanitizeVatRate(qi.vatRate),
              phase,
              sourceQuoteItemId: qi.id,
              sortOrder: sortOrder++,
            });
          }
        }

        // Se cantiere attivo ma il preventivo non ha voci NOLEGGIO, aggiungi voce vuota
        if (includeNoleggio && !hasNoleggioItems) {
          vociToInsert.push({
            salPeriodId: newSal.id,
            companyId,
            description: "Canone Noleggio",
            quantity: "1",
            um: "mese",
            unitPrice: "0",
            discountPercent: "0",
            total: "0",
            vatRate: "22",
            phase: "NOLEGGIO",
            sortOrder: sortOrder++,
          });
        }
      } else {
        // Nessun preventivo: inserisci una voce noleggio vuota se cantiere attivo
        const cantiereStatus = project.cantiereStatusOverride || "NON_AVVIATO";
        const NOLEGGIO_STATUSES = ["IN_CORSO", "MONTAGGIO_IN_CORSO", "SMONTAGGIO_IN_CORSO"];
        if (NOLEGGIO_STATUSES.includes(cantiereStatus)) {
          vociToInsert.push({
            salPeriodId: newSal.id,
            companyId,
            description: "Canone Noleggio",
            quantity: "1",
            um: "mese",
            unitPrice: "0",
            discountPercent: "0",
            total: "0",
            vatRate: "22",
            phase: "NOLEGGIO",
            sortOrder: sortOrder++,
          });
        }
      }

      let voci: any[] = [];
      if (vociToInsert.length > 0) {
        voci = await db.insert(salVociTable).values(vociToInsert).returning();
        voci.sort((a, b) => a.sortOrder - b.sortOrder);
      }

      res.json({ ...newSal, voci });
    } catch (error: any) {
      console.error("[sal] POST initialize error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/sal/:id - Aggiorna SAL period (status, notes, isFinalInvoice)
  app.patch("/api/sal/:id", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const companyId = userCompany.companyId;

      

      const [existing] = await db
        .select()
        .from(salPeriodsTable)
        .where(and(eq(salPeriodsTable.id, req.params.id), eq(salPeriodsTable.companyId, companyId)));

      if (!existing) return res.status(404).json({ message: "SAL non trovato" });

      const { status, notes, isFinalInvoice } = req.body;
      const updateData: any = { updatedAt: new Date() };
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      if (isFinalInvoice !== undefined) updateData.isFinalInvoice = isFinalInvoice;
      if (status === "INVIATO" && existing.status !== "INVIATO") updateData.sentAt = new Date();

      const [updated] = await db
        .update(salPeriodsTable)
        .set(updateData)
        .where(eq(salPeriodsTable.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[sal] PATCH error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/sal/:id/voci - Aggiungi voce a SAL
  app.post("/api/sal/:id/voci", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const companyId = userCompany.companyId;

      

      const [salPeriod] = await db
        .select()
        .from(salPeriodsTable)
        .where(and(eq(salPeriodsTable.id, req.params.id), eq(salPeriodsTable.companyId, companyId)));

      if (!salPeriod) return res.status(404).json({ message: "SAL non trovato" });

      const { description, quantity, um, unitPrice, discountPercent, total, vatRate, phase, sortOrder } = req.body;
      const qty = parseFloat(quantity || "1");
      const up = parseFloat(unitPrice || "0");
      const disc = parseFloat(discountPercent || "0");
      const computedTotal = qty * up * (1 - disc / 100);

      const [voce] = await db
        .insert(salVociTable)
        .values({
          salPeriodId: salPeriod.id,
          companyId,
          description: description || "Nuova voce",
          quantity: String(qty),
          um: um || "cad",
          unitPrice: String(up),
          discountPercent: String(disc),
          total: String(total !== undefined ? parseFloat(total) : computedTotal),
          vatRate: sanitizeVatRate(vatRate),
          phase: phase || "NOLEGGIO",
          sortOrder: sortOrder ?? 0,
        })
        .returning();

      res.json(voce);
    } catch (error: any) {
      console.error("[sal] POST voci error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/sal/:id/voci/:voceId - Aggiorna voce SAL
  app.patch("/api/sal/:id/voci/:voceId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const companyId = userCompany.companyId;

      

      const updateData: any = {};
      const { description, quantity, um, unitPrice, discountPercent, total, vatRate, phase } = req.body;
      if (description !== undefined) updateData.description = description;
      if (quantity !== undefined) updateData.quantity = String(parseFloat(quantity));
      if (um !== undefined) updateData.um = um;
      if (unitPrice !== undefined) updateData.unitPrice = String(parseFloat(unitPrice));
      if (discountPercent !== undefined) updateData.discountPercent = String(parseFloat(discountPercent));
      if (total !== undefined) updateData.total = String(parseFloat(total));
      if (vatRate !== undefined) updateData.vatRate = sanitizeVatRate(vatRate);
      if (phase !== undefined) updateData.phase = phase;

      const [updated] = await db
        .update(salVociTable)
        .set(updateData)
        .where(and(eq(salVociTable.id, req.params.voceId), eq(salVociTable.companyId, companyId)))
        .returning();

      if (!updated) return res.status(404).json({ message: "Voce non trovata" });
      res.json(updated);
    } catch (error: any) {
      console.error("[sal] PATCH voce error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/sal/:id/voci/:voceId - Elimina voce SAL
  app.delete("/api/sal/:id/voci/:voceId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const companyId = userCompany.companyId;

      

      await db
        .delete(salVociTable)
        .where(and(eq(salVociTable.id, req.params.voceId), eq(salVociTable.companyId, companyId)));

      res.json({ success: true });
    } catch (error: any) {
      console.error("[sal] DELETE voce error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============ PROMO CODES ============

  // GET /api/promo-codes - Tutti i codici promo dell'azienda (solo admin)
  app.get("/api/promo-codes", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const promos = await storage.getPromoCodesByCompany(userCompany.companyId);
      res.json(promos);
    } catch (error: any) {
      console.error("[promo-codes] GET error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/promo-codes/active - Solo i codici promo attivi oggi
  app.get("/api/promo-codes/active", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const promos = await storage.getActivePromoCodes(userCompany.companyId);
      res.json(promos);
    } catch (error: any) {
      console.error("[promo-codes] GET active error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/promo-codes - Crea nuovo codice promo (solo admin)
  app.post("/api/promo-codes", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const autoCode = `PROMO-${Date.now().toString(36).toUpperCase()}`;
      const parsed = insertPromoCodeSchema.safeParse({ ...req.body, code: req.body.code || autoCode, companyId: userCompany.companyId });
      if (!parsed.success) return res.status(400).json({ message: "Dati non validi", errors: parsed.error.errors });
      const promo = await storage.createPromoCode(parsed.data);
      res.status(201).json(promo);
    } catch (error: any) {
      console.error("[promo-codes] POST error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/promo-codes/:id - Modifica codice promo (solo admin)
  app.patch("/api/promo-codes/:id", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const parsed = updatePromoCodeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dati non validi", errors: parsed.error.errors });
      // updatePromoCodeSchema already omits companyId — tenant isolation is enforced server-side
      const promo = await storage.updatePromoCode(req.params.id, userCompany.companyId, parsed.data);
      if (!promo) return res.status(404).json({ message: "Codice promo non trovato" });
      res.json(promo);
    } catch (error: any) {
      console.error("[promo-codes] PATCH error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/promo-codes/:id - Elimina codice promo (solo admin)
  app.delete("/api/promo-codes/:id", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id: userId, role } = req.user!;
      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
      const deleted = await storage.deletePromoCode(req.params.id, userCompany.companyId);
      if (!deleted) return res.status(404).json({ message: "Codice promo non trovato" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[promo-codes] DELETE error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ========== NOTIFICA PROGRAMMATA FOTO/VIDEO CANTIERE ==========

  // Funzione interna che esegue il check e l'invio delle notifiche foto/video scadute
  async function runSitePhotoNotificationCheck(): Promise<{ sent: number; errors: number }> {
    let sent = 0;
    let errors = 0;
    try {
      const now = new Date();

      // Claim atomicamente le righe: aggiorna photo_notification_sent_at solo dove IS NULL
      // (pattern "claim before send" per idempotenza in caso di run concorrenti)
      const claimedOpps = await db
        .update(opportunities)
        .set({ photoNotificationSentAt: now, updatedAt: new Date() })
        .where(
          and(
            isNull(opportunities.photoNotificationSentAt),
            lte(opportunities.photoNotificationScheduledAt, now),
            inArray(opportunities.siteQuality, ["PHOTO_VIDEO", "PHOTO_ONLY"])
          )
        )
        .returning();

      for (const opp of claimedOpps) {
        try {
          const sq = opp.siteQuality;
          const notifType = sq === "PHOTO_VIDEO" ? "SITE_PHOTO_VIDEO" : "SITE_PHOTO";
          const notifTitle = sq === "PHOTO_VIDEO" ? "Cantiere da foto + video" : "Cantiere da foto";

          // Recupera info cliente per il messaggio
          const [lead] = await db
            .select({ name: leadsTable.name, firstName: leadsTable.firstName, lastName: leadsTable.lastName, entityType: leadsTable.entityType })
            .from(leadsTable)
            .where(eq(leadsTable.id, opp.leadId));
          const clientName = lead
            ? (lead.entityType === "COMPANY" && lead.name ? lead.name : `${lead.firstName || ""} ${lead.lastName || ""}`.trim())
            : opp.title;
          const siteInfo = opp.siteAddress ? ` - ${opp.siteAddress}` : "";

          await storage.createNotificationsForCompanyRoles(
            opp.companyId,
            ["COMPANY_ADMIN", "SUPER_ADMIN"],
            {
              type: notifType,
              title: notifTitle,
              message: `${clientName}${siteInfo}`,
              link: `/opportunita?open=${opp.id}`,
              isRead: false,
            }
          );

          sent++;
        } catch (oppErr) {
          console.error(`[photo-notification] Errore per opportunità ${opp.id}:`, oppErr);
          errors++;
        }
      }
    } catch (err) {
      console.error("[photo-notification] Errore nel check notifiche foto/video:", err);
      errors++;
    }
    return { sent, errors };
  }

  // GET /api/notifications/check-site-photo - Esegue il check manuale (solo SUPER_ADMIN)
  // Operazione globale su tutti i tenant: non esposta ai COMPANY_ADMIN per evitare effetti cross-tenant
  app.get("/api/notifications/check-site-photo", isAuthenticated, requireRole("SUPER_ADMIN"), async (_req, res) => {
    try {
      const result = await runSitePhotoNotificationCheck();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[photo-notification] Errore endpoint check:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Scheduler automatico: esegue il check ogni 24 ore
  const PHOTO_NOTIFICATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(async () => {
    console.log("[photo-notification] Esecuzione check notifiche foto/video programmato...");
    const result = await runSitePhotoNotificationCheck();
    console.log(`[photo-notification] Check completato: ${result.sent} inviate, ${result.errors} errori`);
  }, PHOTO_NOTIFICATION_INTERVAL_MS);
  // Esegui anche subito all'avvio (con ritardo di 30s per lasciar avviare il DB)
  setTimeout(async () => {
    console.log("[photo-notification] Check iniziale notifiche foto/video...");
    const result = await runSitePhotoNotificationCheck();
    console.log(`[photo-notification] Check iniziale completato: ${result.sent} inviate, ${result.errors} errori`);
  }, 30_000);

  return httpServer;
}
