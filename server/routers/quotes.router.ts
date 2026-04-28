import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, canAccessLeads } from "../auth";
import { resolveUserCompany } from "../utils/accessContext";
import { isUniqueConstraintError } from "../utils/errors";
import {
  quoteStatusEnum,
  type QuoteItemType,
  type InsertQuoteItem,
} from "@shared/schema";

class NotFoundCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundCatalogError";
  }
}

class ValidationCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationCatalogError";
  }
}

export const quotesRouter = Router();

// ==================== Validation ====================

const itemBaseSchema = z.object({
  id: z.string().optional(), // ignored on save (server reissues IDs)
  description: z.string().nullable().optional(),
  marginPercent: z.coerce.number().min(0).max(10000).optional(),
});

const lattoneriaItemSchema = itemBaseSchema.extend({
  type: z.literal("LATTONERIA"),
  materialId: z.string().min(1, "Materiale obbligatorio"),
  materialThicknessId: z.string().min(1, "Spessore obbligatorio"),
  developmentMm: z.coerce.number().positive("Sviluppo deve essere > 0"),
  quantity: z.coerce.number().positive("Metri lineari devono essere > 0"),
});

const articoloItemSchema = itemBaseSchema.extend({
  type: z.literal("ARTICOLO"),
  catalogArticleId: z.string().min(1, "Articolo obbligatorio"),
  quantity: z.coerce.number().positive("Quantità deve essere > 0"),
});

const giornateItemSchema = itemBaseSchema.extend({
  type: z.literal("GIORNATE"),
  laborRateId: z.string().min(1, "Manodopera obbligatoria"),
  quantity: z.coerce.number().positive("Giorni devono essere > 0"),
});

const quoteItemInputSchema = z.discriminatedUnion("type", [
  lattoneriaItemSchema,
  articoloItemSchema,
  giornateItemSchema,
]);
type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;

const quoteSaveSchema = z.object({
  subject: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(quoteStatusEnum).optional(),
  number: z.string().min(1).optional(), // only for create
  items: z.array(quoteItemInputSchema).default([]),
});

// ==================== Calculation ====================

interface ComputedItem {
  type: QuoteItemType;
  description: string;
  unitOfMeasure: string;
  developmentMm: string | null;
  quantity: string;
  weightKg: string | null;
  unitCost: string;
  marginPercent: string;
  unitPriceApplied: string;
  totalRow: string;
  // FKs
  materialId: string | null;
  materialThicknessId: string | null;
  catalogArticleId: string | null;
  laborRateId: string | null;
}

function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

async function computeItem(input: QuoteItemInput): Promise<ComputedItem> {
  if (input.type === "LATTONERIA") {
    const material = await storage.getMaterial(input.materialId);
    const thickness = await storage.getMaterialThickness(input.materialThicknessId);
    if (!material) throw new NotFoundCatalogError(`Materiale non trovato: ${input.materialId}`);
    if (!thickness) throw new NotFoundCatalogError(`Spessore non trovato: ${input.materialThicknessId}`);
    if (thickness.materialId !== material.id) {
      throw new ValidationCatalogError(`Lo spessore selezionato non appartiene al materiale scelto`);
    }

    const developmentMm = Number(input.developmentMm);
    const meters = Number(input.quantity);
    const thicknessMm = parseFloat(thickness.thicknessMm);
    const density = parseFloat(material.density);
    const costPerKg = parseFloat(thickness.costPerKg);
    const margin = input.marginPercent !== undefined
      ? Number(input.marginPercent)
      : parseFloat(thickness.marginPercent);

    // Peso(kg) = (sviluppo_mm/1000) * metri * (spessore_mm/1000) * peso_specifico
    const weightKg = (developmentMm / 1000) * meters * (thicknessMm / 1000) * density;
    // Costo(€) = Peso * costo_kg
    const cost = weightKg * costPerKg;
    // Prezzo(€) = Costo * (1 + margine/100)
    const total = cost * (1 + margin / 100);
    const unitPrice = meters > 0 ? total / meters : 0;

    return {
      type: "LATTONERIA",
      description: input.description?.trim() || `${material.name} ${thicknessMm}mm`,
      unitOfMeasure: "ml",
      developmentMm: String(round2(developmentMm)),
      quantity: String(round4(meters)),
      weightKg: String(round4(weightKg)),
      unitCost: String(round4(costPerKg)),
      marginPercent: String(round2(margin)),
      unitPriceApplied: String(round2(unitPrice)),
      totalRow: String(round2(total)),
      materialId: material.id,
      materialThicknessId: thickness.id,
      catalogArticleId: null,
      laborRateId: null,
    };
  }

  if (input.type === "ARTICOLO") {
    const article = await storage.getCatalogArticle(input.catalogArticleId);
    if (!article) throw new NotFoundCatalogError(`Articolo non trovato: ${input.catalogArticleId}`);

    const quantity = Number(input.quantity);
    const unitCost = parseFloat(article.unitCost);
    const margin = input.marginPercent !== undefined
      ? Number(input.marginPercent)
      : parseFloat(article.marginPercent);

    const cost = unitCost * quantity;
    const total = cost * (1 + margin / 100);
    const unitPrice = quantity > 0 ? total / quantity : 0;

    return {
      type: "ARTICOLO",
      description: input.description?.trim() || article.name,
      unitOfMeasure: article.unitOfMeasure || "pz",
      developmentMm: null,
      quantity: String(round4(quantity)),
      weightKg: null,
      unitCost: String(round4(unitCost)),
      marginPercent: String(round2(margin)),
      unitPriceApplied: String(round2(unitPrice)),
      totalRow: String(round2(total)),
      materialId: null,
      materialThicknessId: null,
      catalogArticleId: article.id,
      laborRateId: null,
    };
  }

  // GIORNATE
  const labor = await storage.getLaborRate(input.laborRateId);
  if (!labor) throw new NotFoundCatalogError(`Manodopera non trovata: ${input.laborRateId}`);

  const days = Number(input.quantity);
  const unitCost = parseFloat(labor.costPerDay);
  const margin = input.marginPercent !== undefined
    ? Number(input.marginPercent)
    : parseFloat(labor.marginPercent);

  const cost = unitCost * days;
  const total = cost * (1 + margin / 100);
  const unitPrice = days > 0 ? total / days : 0;

  return {
    type: "GIORNATE",
    description: input.description?.trim() || labor.name,
    unitOfMeasure: "gg",
    developmentMm: null,
    quantity: String(round4(days)),
    weightKg: null,
    unitCost: String(round4(unitCost)),
    marginPercent: String(round2(margin)),
    unitPriceApplied: String(round2(unitPrice)),
    totalRow: String(round2(total)),
    materialId: null,
    materialThicknessId: null,
    catalogArticleId: null,
    laborRateId: labor.id,
  };
}

function toInsertItem(quoteId: string, computed: ComputedItem, displayOrder: number): InsertQuoteItem {
  return {
    quoteId,
    type: computed.type,
    materialId: computed.materialId,
    materialThicknessId: computed.materialThicknessId,
    catalogArticleId: computed.catalogArticleId,
    laborRateId: computed.laborRateId,
    description: computed.description,
    unitOfMeasure: computed.unitOfMeasure,
    developmentMm: computed.developmentMm,
    quantity: computed.quantity,
    weightKg: computed.weightKg,
    unitCost: computed.unitCost,
    marginPercent: computed.marginPercent,
    unitPriceApplied: computed.unitPriceApplied,
    totalRow: computed.totalRow,
    displayOrder,
  };
}

// ==================== Routes ====================

// GET /api/quotes/next-number — anteprima del prossimo numero per l'azienda
quotesRouter.get("/quotes/next-number", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const year = new Date().getFullYear();
    const numbers = await storage.getQuoteNumbersByCompany(userCompany.companyId);

    let maxNum = 299;
    for (const n of numbers) {
      if (!n) continue;
      if (!n.endsWith(`-${year}`) && !n.startsWith(`PREV-${year}`)) continue;
      const m = n.match(/^(?:PREV-\d{4}-)?(\d+)/);
      if (m) {
        const v = parseInt(m[1], 10);
        if (v > maxNum) maxNum = v;
      }
    }
    const nextNumber = `${String(maxNum + 1).padStart(3, "0")}-${year}`;
    res.json({ number: nextNumber });
  } catch (error) {
    console.error("Error generating next quote number:", error);
    res.status(500).json({ message: "Errore nella generazione del numero preventivo" });
  }
});

// GET /api/quotes/:id — Dettaglio preventivo + righe
quotesRouter.get("/quotes/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const quote = await storage.getQuote(req.params.id, userCompany.companyId);
    if (!quote) return res.status(404).json({ message: "Preventivo non trovato" });

    const items = await storage.getQuoteItems(quote.id);
    res.json({ ...quote, items });
  } catch (error) {
    console.error("Error fetching quote:", error);
    res.status(500).json({ message: "Errore nel recupero del preventivo" });
  }
});

// POST /api/opportunities/:opportunityId/quotes — Crea nuovo preventivo per opportunità
quotesRouter.post("/opportunities/:opportunityId/quotes", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const opportunity = await storage.getOpportunity(req.params.opportunityId, userCompany.companyId);
    if (!opportunity) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    const parsed = quoteSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten(),
      });
    }
    const { subject, notes, status, number, items } = parsed.data;

    // Pre-calcola tutte le righe e congela i prezzi
    const computed: ComputedItem[] = [];
    for (const it of items) {
      computed.push(await computeItem(it));
    }
    const totalAmount = computed.reduce((sum, c) => sum + parseFloat(c.totalRow), 0);

    let quote;
    try {
      quote = await storage.createQuoteWithNextNumber({
        opportunityId: opportunity.id,
        companyId: userCompany.companyId,
        status: status ?? "DRAFT",
        totalAmount: String(round2(totalAmount)),
        subject: subject ?? null,
        notes: notes ?? null,
        globalParams: null,
      }, number);
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        return res.status(409).json({ message: "Numero preventivo già esistente" });
      }
      throw e;
    }

    if (computed.length > 0) {
      const insertItems = computed.map((c, i) => toInsertItem(quote.id, c, i));
      await storage.createQuoteItems(insertItems);
    }

    const savedItems = await storage.getQuoteItems(quote.id);
    res.status(201).json({ ...quote, items: savedItems });
  } catch (error) {
    if (error instanceof NotFoundCatalogError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof ValidationCatalogError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error creating quote:", error);
    const msg = error instanceof Error ? error.message : "Errore nella creazione del preventivo";
    res.status(500).json({ message: msg });
  }
});

// PUT /api/quotes/:id — Aggiorna preventivo (sostituisce tutte le righe)
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

    const existing = await storage.getQuote(req.params.id, userCompany.companyId);
    if (!existing) return res.status(404).json({ message: "Preventivo non trovato" });

    const parsed = quoteSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten(),
      });
    }
    const { subject, notes, status, items } = parsed.data;

    const computed: ComputedItem[] = [];
    for (const it of items) {
      computed.push(await computeItem(it));
    }
    const totalAmount = computed.reduce((sum, c) => sum + parseFloat(c.totalRow), 0);

    const updated = await storage.updateQuote(existing.id, userCompany.companyId, {
      subject: subject ?? null,
      notes: notes ?? null,
      status: status ?? existing.status,
      totalAmount: String(round2(totalAmount)),
    });

    await storage.deleteQuoteItems(existing.id);
    if (computed.length > 0) {
      const insertItems = computed.map((c, i) => toInsertItem(existing.id, c, i));
      await storage.createQuoteItems(insertItems);
    }

    const savedItems = await storage.getQuoteItems(existing.id);
    res.json({ ...(updated || existing), items: savedItems });
  } catch (error) {
    if (error instanceof NotFoundCatalogError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof ValidationCatalogError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error updating quote:", error);
    const msg = error instanceof Error ? error.message : "Errore nell'aggiornamento del preventivo";
    res.status(500).json({ message: msg });
  }
});

// DELETE /api/quotes/:id — Elimina preventivo
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
    const ok = await storage.deleteQuote(req.params.id, userCompany.companyId);
    if (!ok) return res.status(404).json({ message: "Preventivo non trovato" });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting quote:", error);
    res.status(500).json({ message: "Errore nell'eliminazione del preventivo" });
  }
});
