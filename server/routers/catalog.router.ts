import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import {
  insertMaterialSchema,
  insertMaterialThicknessSchema,
  insertCatalogArticleSchema,
  insertLaborRateSchema,
} from "@shared/schema";

export const catalogRouter = Router();

const updateMaterialSchema = insertMaterialSchema.partial();
const updateMaterialThicknessSchema = insertMaterialThicknessSchema.partial();
const updateCatalogArticleSchema = insertCatalogArticleSchema.partial();
const updateLaborRateSchema = insertLaborRateSchema.partial();

function isCatalogAdmin(role: string | undefined): boolean {
  return role === "COMPANY_ADMIN" || role === "SUPER_ADMIN";
}

function isFkViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23503";
}

// ============ MATERIALI ============

// GET /api/materials - Lista materiali con i loro spessori
catalogRouter.get("/materials", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getMaterials();
    res.json(items);
  } catch (error) {
    console.error("Error fetching materials:", error);
    res.status(500).json({ message: "Errore nel recupero dei materiali" });
  }
});

// POST /api/materials - Crea materiale (admin)
catalogRouter.post("/materials", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare materiali" });
    }
    const parsed = insertMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const created = await storage.createMaterial(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating material:", error);
    res.status(500).json({ message: "Errore nella creazione del materiale" });
  }
});

// PUT /api/materials/:id - Aggiorna materiale (admin)
catalogRouter.put("/materials/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare materiali" });
    }
    const parsed = updateMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.updateMaterial(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Materiale non trovato" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating material:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del materiale" });
  }
});

// DELETE /api/materials/:id - Elimina materiale (admin) — cascade sugli spessori
catalogRouter.delete("/materials/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare materiali" });
    }
    const deleted = await storage.deleteMaterial(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Materiale non trovato" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting material:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: il materiale è referenziato da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione del materiale" });
  }
});

// ============ SPESSORI MATERIALI ============

// POST /api/material-thicknesses - Crea spessore per un materiale (admin)
catalogRouter.post("/material-thicknesses", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare spessori" });
    }
    const parsed = insertMaterialThicknessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const material = await storage.getMaterial(parsed.data.materialId);
    if (!material) {
      return res.status(400).json({ message: "Materiale non trovato" });
    }
    const created = await storage.createMaterialThickness(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating material thickness:", error);
    res.status(500).json({ message: "Errore nella creazione dello spessore" });
  }
});

// PUT /api/material-thicknesses/:id - Aggiorna spessore (admin)
catalogRouter.put("/material-thicknesses/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare spessori" });
    }
    const parsed = updateMaterialThicknessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    if (parsed.data.materialId) {
      const material = await storage.getMaterial(parsed.data.materialId);
      if (!material) {
        return res.status(400).json({ message: "Materiale non trovato" });
      }
    }
    const updated = await storage.updateMaterialThickness(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Spessore non trovato" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating material thickness:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dello spessore" });
  }
});

// DELETE /api/material-thicknesses/:id - Elimina spessore (admin)
catalogRouter.delete("/material-thicknesses/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare spessori" });
    }
    const deleted = await storage.deleteMaterialThickness(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Spessore non trovato" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting material thickness:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: lo spessore è referenziato da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione dello spessore" });
  }
});

// ============ ARTICOLI (catalogo lattoneria) ============

// GET /api/catalog-articles - Lista articoli pre-acquistati
catalogRouter.get("/catalog-articles", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getCatalogArticles();
    res.json(items);
  } catch (error) {
    console.error("Error fetching catalog articles:", error);
    res.status(500).json({ message: "Errore nel recupero degli articoli" });
  }
});

// POST /api/catalog-articles - Crea articolo (admin)
catalogRouter.post("/catalog-articles", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare articoli" });
    }
    const parsed = insertCatalogArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const created = await storage.createCatalogArticle(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating catalog article:", error);
    res.status(500).json({ message: "Errore nella creazione dell'articolo" });
  }
});

// PUT /api/catalog-articles/:id - Aggiorna articolo (admin)
catalogRouter.put("/catalog-articles/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare articoli" });
    }
    const parsed = updateCatalogArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.updateCatalogArticle(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Articolo non trovato" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating catalog article:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'articolo" });
  }
});

// DELETE /api/catalog-articles/:id - Elimina articolo (admin)
catalogRouter.delete("/catalog-articles/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare articoli" });
    }
    const deleted = await storage.deleteCatalogArticle(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Articolo non trovato" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting catalog article:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: l'articolo è referenziato da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione dell'articolo" });
  }
});

// ============ MANODOPERA / GIORNATE ============

// GET /api/labor-rates - Lista voci manodopera
catalogRouter.get("/labor-rates", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getLaborRates();
    res.json(items);
  } catch (error) {
    console.error("Error fetching labor rates:", error);
    res.status(500).json({ message: "Errore nel recupero della manodopera" });
  }
});

// POST /api/labor-rates - Crea voce manodopera (admin)
catalogRouter.post("/labor-rates", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare voci di manodopera" });
    }
    const parsed = insertLaborRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const created = await storage.createLaborRate(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating labor rate:", error);
    res.status(500).json({ message: "Errore nella creazione della voce di manodopera" });
  }
});

// PUT /api/labor-rates/:id - Aggiorna voce manodopera (admin)
catalogRouter.put("/labor-rates/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare voci di manodopera" });
    }
    const parsed = updateLaborRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.updateLaborRate(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Voce di manodopera non trovata" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating labor rate:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento della voce di manodopera" });
  }
});

// DELETE /api/labor-rates/:id - Elimina voce manodopera (admin)
catalogRouter.delete("/labor-rates/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare voci di manodopera" });
    }
    const deleted = await storage.deleteLaborRate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Voce di manodopera non trovata" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting labor rate:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: la voce di manodopera è referenziata da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione della voce di manodopera" });
  }
});
