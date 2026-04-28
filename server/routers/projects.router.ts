import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import { eq, desc, and, gte, inArray } from "drizzle-orm";
import {
  activityLogs as activityLogsTable,
  dailyAssignments,
  proxitPresence,
  userCompanies,
  users,
  type InsertProject,
} from "@shared/schema";
import { requireProxitLock, getProxitLockHolder } from "../utils/proxit-helpers";

export const projectsRouter = Router();

// ========== PROJECT STAGES ROUTES ==========

// GET /project-stages - Lista fasi progetto per azienda
projectsRouter.get("/project-stages", isAuthenticated, async (req, res) => {
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

// POST /project-stages - Crea un nuovo stage progetto (solo admin)
projectsRouter.post("/project-stages", isAuthenticated, async (req, res) => {
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

// PUT /project-stages/reorder - Riordina gli stage progetto (solo admin)
projectsRouter.put("/project-stages/reorder", isAuthenticated, async (req, res) => {
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

// PUT /project-stages/:id - Aggiorna uno stage progetto (solo admin)
projectsRouter.put("/project-stages/:id", isAuthenticated, async (req, res) => {
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

// DELETE /project-stages/:id - Elimina uno stage progetto (solo admin)
projectsRouter.delete("/project-stages/:id", isAuthenticated, async (req, res) => {
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

// GET /external-engineers
projectsRouter.get("/external-engineers", isAuthenticated, async (req, res) => {
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

// POST /external-engineers
projectsRouter.post("/external-engineers", isAuthenticated, async (req, res) => {
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

// PUT /external-engineers/:id
projectsRouter.put("/external-engineers/:id", isAuthenticated, async (req, res) => {
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

// DELETE /external-engineers/:id
projectsRouter.delete("/external-engineers/:id", isAuthenticated, async (req, res) => {
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

// GET /projects - Lista progetti per azienda (con tecnico assegnato)
projectsRouter.get("/projects", isAuthenticated, async (req, res) => {
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

// GET /projects/:id - Dettaglio progetto
projectsRouter.get("/projects/:id", isAuthenticated, async (req, res) => {
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

// GET /projects/:id/site-details - Scheda Cantiere completa
projectsRouter.get("/projects/:id/site-details", isAuthenticated, async (req, res) => {
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


// PATCH /projects/:id - Aggiorna progetto (incluso assegnazione tecnico)
projectsRouter.patch("/projects/:id", isAuthenticated, async (req, res) => {
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

// PUT /projects/:id/move - Sposta progetto in nuova fase (Kanban)
projectsRouter.put("/projects/:id/move", isAuthenticated, async (req, res) => {
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

// GET /projects/:projectId/cronistoria - Cronistoria eventi del progetto
projectsRouter.get("/projects/:projectId/cronistoria", isAuthenticated, async (req, res) => {
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

// GET /projects/:projectId/tasks - Lista attività per progetto
projectsRouter.get("/projects/:projectId/tasks", isAuthenticated, async (req, res) => {
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

// POST /projects/:projectId/tasks - Crea nuova attività
projectsRouter.post("/projects/:projectId/tasks", isAuthenticated, async (req, res) => {
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

// PATCH /projects/:projectId/tasks/:taskId - Aggiorna attività
projectsRouter.patch("/projects/:projectId/tasks/:taskId", isAuthenticated, async (req, res) => {
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

// DELETE /projects/:projectId/tasks/:taskId - Elimina attività
projectsRouter.delete("/projects/:projectId/tasks/:taskId", isAuthenticated, async (req, res) => {
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

// GET /projects/:projectId/deliveries
projectsRouter.get("/projects/:projectId/deliveries", isAuthenticated, async (req, res) => {
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

// ========== PROXIT - Presence / Lock API ==========

// GET /proxit/warehouse-balances - Recupera tutti i saldi magazzino per l'azienda
projectsRouter.get("/proxit/warehouse-balances", isAuthenticated, async (req, res) => {
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

// POST /proxit/warehouse-balances - Salva o aggiorna un saldo magazzino
projectsRouter.post("/proxit/warehouse-balances", isAuthenticated, async (req, res) => {
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

// DELETE /proxit/warehouse-balances - Elimina un saldo magazzino (per undo)
projectsRouter.delete("/proxit/warehouse-balances", isAuthenticated, async (req, res) => {
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

// GET /proxit/lock - Restituisce chi ha il lock
projectsRouter.get("/proxit/lock", isAuthenticated, async (req, res) => {
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

// POST /proxit/heartbeat - Upsert presenza per sessione (un record per sessionId)
projectsRouter.post("/proxit/heartbeat", isAuthenticated, async (req, res) => {
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

// DELETE /proxit/heartbeat - Rimuove presenza (solo se sessionId corrisponde)
projectsRouter.delete("/proxit/heartbeat", isAuthenticated, async (req, res) => {
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

// ========== PROXIT - Admin Priority API ==========

// GET /proxit/priority-list - Lista utenti della company ordinata per priorità
projectsRouter.get("/proxit/priority-list", isAuthenticated, async (req, res) => {
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

// PATCH /users/:id/proxit-priority - Imposta priorità Proxit (solo admin)
projectsRouter.patch("/users/:id/proxit-priority", isAuthenticated, async (req, res) => {
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

// POST /proxit/swap-priority - Scambia priorità tra due utenti (transazionale)
projectsRouter.post("/proxit/swap-priority", isAuthenticated, async (req, res) => {
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
