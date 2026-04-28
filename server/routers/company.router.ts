import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated, requireRole, getUserByEmail, sanitizeUser } from "../auth";
import { z } from "zod";

export const companyRouter = Router();

// ============================================
// SUPER ADMIN API Routes — /api/admin/companies
// ============================================

// GET /api/admin/companies - Lista tutte le aziende con conteggio utenti
companyRouter.get("/admin/companies", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const companies = await storage.getAllCompaniesWithUserCount();
    res.json(companies);
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({ message: "Errore nel recupero delle aziende" });
  }
});

// POST /api/admin/companies - Crea nuova azienda con primo admin (transazione atomica)
companyRouter.post("/admin/companies", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
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
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error creating company:", error);
    res.status(500).json({ message: "Errore nella creazione dell'azienda" });
  }
});

// PATCH /api/admin/companies/:id - Modifica azienda
companyRouter.patch("/admin/companies/:id", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
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
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating company:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'azienda" });
  }
});

// DELETE /api/admin/companies/:id - Elimina azienda (cascade su utenti e lead)
companyRouter.delete("/admin/companies/:id", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
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
companyRouter.post("/admin/sync-opportunity-assignments", isAuthenticated, async (req, res) => {
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
companyRouter.post("/admin/sync-missing-projects", isAuthenticated, async (req, res) => {
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

// ============================================
// TENANT SETTINGS — /api/company
// ============================================

// GET /api/company - Dati azienda corrente
companyRouter.get("/company", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }
    const company = await storage.getCompany(userCompany.companyId);
    if (!company) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }
    res.json(company);
  } catch (error) {
    console.error("Error fetching company:", error);
    res.status(500).json({ message: "Errore nel recupero dell'azienda" });
  }
});

// PATCH /api/company - Aggiorna impostazioni azienda (nome, logo, P.IVA, IBAN…)
companyRouter.patch("/company", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    // Solo COMPANY_ADMIN e SUPER_ADMIN possono modificare i dati azienda
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN") {
      return res.status(403).json({ message: "Accesso negato. Solo gli amministratori possono modificare i dati aziendali." });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

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

    const validatedData = updateCompanySchema.parse(req.body);

    // Filtra campi vuoti o undefined
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== undefined) {
        updateData[key] = value === "" ? null : value;
      }
    }

    const company = await storage.updateCompany(userCompany.companyId, updateData);

    if (!company) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }

    res.json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating company:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'azienda" });
  }
});

// ============================================
// BILLING PROFILES — /api/billing-profiles
// ============================================

// GET /api/billing-profiles - Lista profili fatturazione
companyRouter.get("/billing-profiles", isAuthenticated, async (req, res) => {
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
companyRouter.get("/billing-profiles/by-type/:type", isAuthenticated, async (req, res) => {
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
companyRouter.post("/billing-profiles", isAuthenticated, async (req, res) => {
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
companyRouter.put("/billing-profiles/:id", isAuthenticated, async (req, res) => {
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
companyRouter.delete("/billing-profiles/:id", isAuthenticated, async (req, res) => {
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
