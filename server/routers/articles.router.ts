import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { resolveUserCompany } from "../utils/accessContext";

export const articlesRouter = Router();

// Schema PATCH limitato ai soli campi della tab "Servizi aggiuntivi" in Settings.
const patchArticleSchema = z.object({
  serviceDescriptionMounting: z.string().nullable().optional(),
  serviceDescriptionRental: z.string().nullable().optional(),
}).strict();

// GET /api/articles - Lista articoli azienda (per Settings: tab "Servizi aggiuntivi")
articlesRouter.get("/articles", isAuthenticated, async (req, res) => {
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

// PATCH /api/articles/:id - Aggiornamento limitato (solo testi servizi aggiuntivi)
articlesRouter.patch("/articles/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare articoli" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const parsed = patchArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Solo i campi 'serviceDescriptionMounting' e 'serviceDescriptionRental' possono essere modificati",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const updated = await storage.updateArticle(req.params.id, userCompany.companyId, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Articolo non trovato" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error patching article:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'articolo" });
  }
});
