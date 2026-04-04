import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated } from "../auth";
import { insertArticleSchema } from "@shared/schema";
import type { TransportPricingData, TransportVehicle } from "@shared/schema";
import { STANDARD_ARTICLES } from "../data/masterCatalog";

export const catalogRouter = Router();

const updateArticleSchema = insertArticleSchema.omit({ companyId: true, isActive: true }).partial();

// GET /api/articles - Lista articoli del listino
catalogRouter.get("/articles", isAuthenticated, async (req, res) => {
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
catalogRouter.get("/articles/:id", isAuthenticated, async (req, res) => {
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

// POST /api/articles - Crea nuovo articolo (COMPANY_ADMIN+)
catalogRouter.post("/articles", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono creare articoli" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

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
      const existingArticles = await storage.getArticlesByCompany(userCompany.companyId);
      const samePrefix = existingArticles.filter(a => a.code.startsWith(prefix + "-"));
      const numbers = samePrefix.map(a => {
        const match = a.code.match(new RegExp(`^${prefix}-(\\d+)$`));
        return match ? parseInt(match[1]) : 0;
      });
      const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      code = `${prefix}-${String(nextNum).padStart(3, "0")}`;
    }

    const validationResult = insertArticleSchema.safeParse({
      ...req.body,
      code,
      companyId: userCompany.companyId,
    });
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: validationResult.error.flatten().fieldErrors,
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
catalogRouter.patch("/articles/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare articoli" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const validationResult = updateArticleSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: validationResult.error.flatten().fieldErrors,
      });
    }

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
catalogRouter.delete("/articles/:id", isAuthenticated, async (req, res) => {
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
catalogRouter.post("/catalog/seed-defaults", isAuthenticated, async (req, res) => {
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
      total: created + updated,
    });
  } catch (error) {
    console.error("Error seeding catalog:", error);
    res.status(500).json({ message: "Errore nell'inizializzazione del listino" });
  }
});

// POST /api/catalog/migrate-venice-transport - Migrazione trasporti Venezia
catalogRouter.post("/catalog/migrate-venice-transport", isAuthenticated, async (req, res) => {
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
