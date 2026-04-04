import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, requireRole, canAccessLeads } from "../auth";
import {
  insertPaymentMethodSchema, insertPromoCodeSchema, updatePromoCodeSchema,
  quoteStatusEnum,
  type QuotePhase, type QuoteDiscounts, type HandlingData,
} from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { quotes } from "@shared/schema";
import { resolveUserCompany } from "../utils/accessContext";
import { isUniqueConstraintError } from "../utils/errors";
import {
  calculateQuoteItemsWithPhases,
  buildACorpoItems,
  calculateHandlingCost,
  applyDiscounts,
  isSyntheticArticleId,
  PHASE_LABELS,
  recalcOpportunityValue,
  type QuoteItemInput,
  type QuotePreviewParams,
  type CalculateResult,
  type CalculatedItem,
  type PhaseSection,
} from "../utils/quote-calculations";

export const quotesRouter = Router();

  // ============ QUOTES (Preventivi) ============


  // GET /api/quotes/latest-numbers - Numeri ultimo preventivo per ogni opportunità
quotesRouter.get("/quotes/latest-numbers", isAuthenticated, async (req, res) => {
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
quotesRouter.get("/quotes/next-number", isAuthenticated, async (req, res) => {
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
quotesRouter.get("/quotes/:id", isAuthenticated, async (req, res) => {
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
quotesRouter.post("/quotes/preview", isAuthenticated, async (req, res) => {
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
quotesRouter.post("/quotes/preview-phases", isAuthenticated, async (req, res) => {
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
            ? await calculateQuoteItemsWithPhases(fase.items!, faseParams, userCompany.companyId)
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
          handling: handlingResult.total > 0 ? handlingResult as any : null,
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
quotesRouter.post("/quotes", isAuthenticated, async (req, res) => {
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
quotesRouter.put("/quotes/:id", isAuthenticated, async (req, res) => {
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
quotesRouter.patch("/quotes/:id/status", isAuthenticated, async (req, res) => {
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
quotesRouter.patch("/quotes/:quoteId/items/:itemId", isAuthenticated, async (req, res) => {
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
quotesRouter.delete("/quotes/:id", isAuthenticated, async (req, res) => {
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

  // ========== CREDITSAFE API ==========

quotesRouter.post("/creditsafe/fetch", isAuthenticated, async (req, res) => {
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

      const { fetchAndSaveReport } = await import("../creditsafe");
      const report = await fetchAndSaveReport(leadId, userCompany.companyId, vatNumber);
      
      const updatedLead = await storage.getLeadWithAccess(leadId, { userId, role, companyId: userCompany.companyId });

      res.json({ report, lead: updatedLead });
    } catch (error: any) {
      console.error("Error fetching CreditSafe report:", error);
      res.status(500).json({ message: error.message || "Errore nel recupero del report CreditSafe" });
    }
  });

quotesRouter.get("/creditsafe/report/:leadId", isAuthenticated, async (req, res) => {
    try {
      const { id: userId, role } = req.user!;


      const userCompany = await resolveUserCompany(userId, role, req);
      if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });

      const lead = await storage.getLeadWithAccess(req.params.leadId, { userId, role, companyId: userCompany.companyId });
      if (!lead) return res.status(404).json({ message: "Contatto non trovato" });

      const { getReportByLeadId } = await import("../creditsafe");
      const report = await getReportByLeadId(req.params.leadId, userCompany.companyId);
      
      res.json({ report });
    } catch (error: any) {
      console.error("Error getting CreditSafe report:", error);
      res.status(500).json({ message: error.message || "Errore nel recupero del report" });
    }
  });

  // ========== Payment Methods ==========
quotesRouter.get("/payment-methods", isAuthenticated, async (req, res) => {
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

quotesRouter.post("/payment-methods", isAuthenticated, async (req, res) => {
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

quotesRouter.patch("/payment-methods/:id", isAuthenticated, async (req, res) => {
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

quotesRouter.delete("/payment-methods/:id", isAuthenticated, async (req, res) => {
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

  // ============ CLAUSE OVERRIDES (Testi clausole Step 4) ============

  // Read-only endpoint for quote runtime consumption (all authenticated users)
quotesRouter.get("/clauses", isAuthenticated, async (req, res) => {
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
quotesRouter.get("/settings/clauses", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
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

quotesRouter.put("/settings/clauses/:clauseId", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
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

  // ============ PROMO CODES ============

  // GET /api/promo-codes - Tutti i codici promo dell'azienda (solo admin)
quotesRouter.get("/promo-codes", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
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
quotesRouter.get("/promo-codes/active", isAuthenticated, async (req, res) => {
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
quotesRouter.post("/promo-codes", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
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
quotesRouter.patch("/promo-codes/:id", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
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
quotesRouter.delete("/promo-codes/:id", isAuthenticated, requireRole("COMPANY_ADMIN", "SUPER_ADMIN"), async (req, res) => {
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

