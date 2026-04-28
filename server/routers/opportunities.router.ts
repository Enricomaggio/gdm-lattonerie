import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, canAccessLeads } from "../auth";
import { insertOpportunitySchema, type InsertOpportunity, type InsertQuoteItem } from "@shared/schema";
import { z } from "zod";
import { resolveUserCompany, buildAccessContext } from "../utils/accessContext";
import { isUniqueConstraintError } from "../utils/errors";

export const opportunitiesRouter = Router();

// ============ PIPELINE STAGES ============
// IMPORTANTE: /stages/reorder PRIMA di /stages/:id per evitare conflitti di matching

// GET /api/stages - Lista fasi pipeline dell'azienda
opportunitiesRouter.get("/stages", isAuthenticated, async (req, res) => {
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
opportunitiesRouter.post("/stages", isAuthenticated, async (req, res) => {
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
// DEVE stare PRIMA di /stages/:id
opportunitiesRouter.put("/stages/reorder", isAuthenticated, async (req, res) => {
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
opportunitiesRouter.put("/stages/:id", isAuthenticated, async (req, res) => {
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
opportunitiesRouter.delete("/stages/:id", isAuthenticated, async (req, res) => {
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

// ============ OPPORTUNITIES ============

// GET /api/opportunities - Lista opportunità dell'azienda (con controllo accesso)
opportunitiesRouter.get("/opportunities", isAuthenticated, async (req, res) => {
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
    const referentIds = Array.from(new Set(opportunities.map(o => o.referentId).filter((id): id is string => id !== null)));
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

// GET /api/opportunities/:opportunityId/quotes - Lista preventivi di un'opportunità
opportunitiesRouter.get("/opportunities/:opportunityId/quotes", isAuthenticated, async (req, res) => {
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

// GET /api/opportunities/:id - Dettaglio singola opportunità
opportunitiesRouter.get("/opportunities/:id", isAuthenticated, async (req, res) => {
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
opportunitiesRouter.post("/opportunities", isAuthenticated, async (req, res) => {
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
opportunitiesRouter.patch("/opportunities/:id", isAuthenticated, async (req, res) => {
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

    // Note: storage type declares wonAt/lostAt as Date|undefined but runtime correctly handles null (clears DB field)
    const opportunity = await storage.updateOpportunity(req.params.id, userCompany.companyId, dataWithTimestamps as any);

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
opportunitiesRouter.put("/opportunities/:id/move", isAuthenticated, async (req, res) => {
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
opportunitiesRouter.post("/opportunities/:id/duplicate", isAuthenticated, async (req, res) => {
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
            pdfData: activeQuote.pdfData as any,
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
opportunitiesRouter.delete("/opportunities/:id", isAuthenticated, async (req, res) => {
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

// POST /api/opportunities/:id/create-project - Crea progetto manualmente da opportunità
opportunitiesRouter.post("/opportunities/:id/create-project", isAuthenticated, async (req, res) => {
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

// GET /api/opportunities/:id/site-details - Scheda Cantiere da opportunità
opportunitiesRouter.get("/opportunities/:id/site-details", isAuthenticated, async (req, res) => {
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
      const articleIds = Array.from(new Set(rawItems.map(i => i.articleId).filter((id): id is string => !!id)));
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
        mobile: (referent as any).mobile,
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

// POST /api/opportunities/:id/snooze-reminder - Posticipa il promemoria di N giorni
opportunitiesRouter.post("/opportunities/:id/snooze-reminder", isAuthenticated, async (req, res) => {
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
