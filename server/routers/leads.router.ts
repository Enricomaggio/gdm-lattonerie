import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, canAccessLeads } from "../auth";
import { db } from "../db";
import { eq, and, inArray, sql as drizzleSql } from "drizzle-orm";
import {
  opportunities,
  pipelineStages,
  leads as leadsTable,
  contactReferents,
  activityLogs as activityLogsTable,
  reminders as remindersTable,
  insertLeadSchema,
  insertLeadSourceSchema,
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { resolveUserCompany, buildAccessContext, validateUserInSameCompany } from "../utils/accessContext";

export const leadsRouter = Router();

// Normalizza il nome azienda rimuovendo suffissi legali e spazi
function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(s\.r\.l\.?|srl|s\.p\.a\.?|spa|snc|s\.n\.c\.?|sas|s\.a\.s\.?|soc|società|societa|di|del|della|dei|degli|delle|il|lo|la|i|gli|le|e|&)\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============ DEDUPLICAZIONE LEAD ============

// GET /api/leads/duplicates - Rileva coppie di lead duplicati
leadsRouter.get("/leads/duplicates", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const { companyId } = ctx;

    // Recupera i lead con rispetto del controllo accesso basato sui ruoli
    // (SALES_AGENT vede solo i propri lead assegnati, COMPANY_ADMIN/SUPER_ADMIN vedono tutto)
    const allLeads = await storage.getLeadsWithAccess(ctx);

    if (allLeads.length === 0) {
      return res.json([]);
    }

    const leadIds = allLeads.map((l) => l.id);

    // Recupera il conteggio delle opportunità per ogni lead (filtrato per lead accessibili)
    const leadIdsParam = leadIds.join(",");
    const oppCounts = await db
      .select({
        leadId: opportunities.leadId,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(opportunities)
      .where(drizzleSql`${opportunities.leadId} = ANY(string_to_array(${leadIdsParam}, ','))`)
      .groupBy(opportunities.leadId);

    const oppCountMap = new Map<string, number>();
    for (const row of oppCounts) {
      oppCountMap.set(row.leadId, row.count);
    }

    // Recupera gli utenti per l'azienda (companyId può essere null solo per SUPER_ADMIN senza company)
    const companyUsers = companyId ? await storage.getUsersByCompanyId(companyId) : [];
    const usersMap = new Map(companyUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    // Costruisce la lista arricchita di lead
    const enrichedLeads = allLeads.map((lead) => ({
      ...lead,
      opportunitiesCount: oppCountMap.get(lead.id) || 0,
      assignedToUserName: lead.assignedToUserId ? usersMap.get(lead.assignedToUserId) || null : null,
      normalizedName: normalizeName(lead.name || `${lead.firstName || ""} ${lead.lastName || ""}`),
    }));

    // Trova le coppie duplicate
    const pairs: Array<{ lead1: typeof enrichedLeads[0]; lead2: typeof enrichedLeads[0]; reason: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < enrichedLeads.length; i++) {
      for (let j = i + 1; j < enrichedLeads.length; j++) {
        const a = enrichedLeads[i];
        const b = enrichedLeads[j];
        const pairKey = [a.id, b.id].sort().join(":");
        if (seen.has(pairKey)) continue;

        let reason: string | null = null;

        // Stessa P.IVA (non vuota)
        if (a.vatNumber && b.vatNumber && a.vatNumber.trim() !== "" && b.vatNumber.trim() !== "" && a.vatNumber.trim().toLowerCase() === b.vatNumber.trim().toLowerCase()) {
          reason = "same_vat";
        }
        // Stessa email (non vuota)
        else if (a.email && b.email && a.email.trim() !== "" && b.email.trim() !== "" && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) {
          reason = "same_email";
        }
        // Stesso telefono (non vuoto)
        else if (a.phone && b.phone && a.phone.trim() !== "" && b.phone.trim() !== "" && a.phone.trim().replace(/\s/g, "") === b.phone.trim().replace(/\s/g, "")) {
          reason = "same_phone";
        }
        // Nome normalizzato uguale (non vuoto)
        else if (a.normalizedName && b.normalizedName && a.normalizedName.length > 2 && a.normalizedName === b.normalizedName) {
          reason = "same_name";
        }

        if (reason) {
          seen.add(pairKey);
          pairs.push({ lead1: a, lead2: b, reason });
        }
      }
    }

    res.json(pairs);
  } catch (error) {
    console.error("Error detecting duplicates:", error);
    res.status(500).json({ message: "Errore nel rilevamento dei duplicati" });
  }
});

// GET /api/leads/check-similar - Controlla se esistono contatti simili ai parametri forniti
leadsRouter.get("/leads/check-similar", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const { name, email, phone, vatNumber } = req.query as {
      name?: string;
      email?: string;
      phone?: string;
      vatNumber?: string;
    };

    const allLeads = await storage.getLeadsWithAccess(ctx);

    const normalizedInputName = normalizeName(name);

    const similar: Array<{ lead: (typeof allLeads)[0]; reason: string }> = [];

    for (const lead of allLeads) {
      let reason: string | null = null;

      if (
        vatNumber && vatNumber.trim() !== "" &&
        lead.vatNumber && lead.vatNumber.trim() !== "" &&
        vatNumber.trim().toLowerCase() === lead.vatNumber.trim().toLowerCase()
      ) {
        reason = "same_vat";
      } else if (
        email && email.trim() !== "" &&
        lead.email && lead.email.trim() !== "" &&
        email.trim().toLowerCase() === lead.email.trim().toLowerCase()
      ) {
        reason = "same_email";
      } else if (
        phone && phone.trim() !== "" &&
        lead.phone && lead.phone.trim() !== "" &&
        phone.trim().replace(/\s/g, "") === lead.phone.trim().replace(/\s/g, "")
      ) {
        reason = "same_phone";
      } else if (
        normalizedInputName && normalizedInputName.length > 2
      ) {
        const leadName = normalizeName(lead.name || `${lead.firstName || ""} ${lead.lastName || ""}`);
        if (leadName && leadName.length > 2 && leadName === normalizedInputName) {
          reason = "same_name";
        }
      }

      if (reason) {
        similar.push({ lead, reason });
      }
    }

    res.json(similar);
  } catch (error) {
    console.error("Error checking similar leads:", error);
    res.status(500).json({ message: "Errore nel controllo dei duplicati" });
  }
});

// POST /api/leads/merge - Unisce due lead (il primario assorbe il duplicato)
leadsRouter.post("/leads/merge", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const { companyId } = ctx;
    const { primaryId, duplicateId } = z.object({
      primaryId: z.string().min(1),
      duplicateId: z.string().min(1),
    }).parse(req.body);

    if (primaryId === duplicateId) {
      return res.status(400).json({ message: "Il primario e il duplicato non possono essere lo stesso lead" });
    }

    // Verifica accesso a entrambi i lead rispettando il controllo accesso basato sui ruoli
    const [primaryLead, duplicateLead] = await Promise.all([
      storage.getLeadWithAccess(primaryId, ctx),
      storage.getLeadWithAccess(duplicateId, ctx),
    ]);

    if (!primaryLead || !duplicateLead) {
      return res.status(404).json({ message: "Lead non trovato o accesso negato" });
    }

    // Verifica che entrambi appartengano alla stessa azienda (del contesto utente)
    if (primaryLead.companyId !== companyId || duplicateLead.companyId !== companyId) {
      return res.status(403).json({ message: "Accesso negato: i lead devono appartenere alla stessa azienda" });
    }

    await db.transaction(async (tx) => {
      // 1. Ri-punta le opportunità dal duplicato al primario
      await tx
        .update(opportunities)
        .set({ leadId: primaryId, updatedAt: new Date() })
        .where(eq(opportunities.leadId, duplicateId));

      // 2. Ri-punta i referenti dal duplicato al primario
      await tx
        .update(contactReferents)
        .set({ contactId: primaryId })
        .where(eq(contactReferents.contactId, duplicateId));

      // 3. Ri-punta i creditsafe_reports dal duplicato al primario (raw SQL)
      await tx.execute(drizzleSql`UPDATE creditsafe_reports SET lead_id = ${primaryId} WHERE lead_id = ${duplicateId}`);

      // 4. Ri-punta i reminders dal duplicato al primario
      await tx
        .update(remindersTable)
        .set({ leadId: primaryId })
        .where(eq(remindersTable.leadId, duplicateId));

      // 5. Ri-punta i activity_logs dal duplicato al primario
      await tx
        .update(activityLogsTable)
        .set({ entityId: primaryId })
        .where(and(eq(activityLogsTable.entityType, "lead"), eq(activityLogsTable.entityId, duplicateId)));

      // 6. Unisci i campi null del primario con i valori del duplicato (il primario ha precedenza)
      const mergedFields: Record<string, unknown> = {};
      const fieldsToCopy: Array<keyof typeof primaryLead> = [
        "email", "phone", "vatNumber", "fiscalCode", "address", "city",
        "zipCode", "province", "country", "source", "notes", "pecEmail",
        "sdiCode", "ipaCode", "paymentMethodId", "firstName", "lastName", "name",
      ];

      for (const field of fieldsToCopy) {
        const primaryVal = primaryLead[field];
        const dupVal = duplicateLead[field];
        if ((primaryVal === null || primaryVal === undefined || primaryVal === "") && dupVal !== null && dupVal !== undefined && dupVal !== "") {
          mergedFields[field] = dupVal;
        }
      }

      if (Object.keys(mergedFields).length > 0) {
        mergedFields.updatedAt = new Date();
        await tx
          .update(leadsTable)
          .set(mergedFields)
          .where(eq(leadsTable.id, primaryId));
      }

      // 7. Elimina il duplicato
      await tx.delete(leadsTable).where(eq(leadsTable.id, duplicateId));
    });

    res.json({ success: true, message: "Unione completata con successo" });
  } catch (error) {
    console.error("Error merging leads:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    res.status(500).json({ message: "Errore durante la fusione dei lead" });
  }
});


// ============ LEADS CRUD ============

// Solo SUPER_ADMIN, COMPANY_ADMIN e SALES_AGENT possono accedere ai lead
leadsRouter.get("/leads", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    // Verifica permessi: TECHNICIAN non può accedere ai lead
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato: i tecnici non possono visualizzare i lead" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const leads = await storage.getLeadsWithAccess(ctx);

    // Build opportunity summary map in a single aggregated query (avoid N+1)
    let opportunitySummaryMap = new Map<string, { total: number; wonCount: number; lostCount: number; activeCount: number }>();
    if (leads.length > 0 && ctx.companyId) {
      const leadIds = leads.map(l => l.id);
      // Get pipeline stages for this company to identify Vinto/Perso
      const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.companyId, ctx.companyId));
      const wonStageIds = new Set(stages.filter(s => s.name === "Vinto").map(s => s.id));
      const lostStageIds = new Set(stages.filter(s => s.name === "Perso").map(s => s.id));

      const opps = await db.select({ leadId: opportunities.leadId, stageId: opportunities.stageId })
        .from(opportunities)
        .where(inArray(opportunities.leadId, leadIds));

      for (const opp of opps) {
        const key = opp.leadId;
        if (!opportunitySummaryMap.has(key)) {
          opportunitySummaryMap.set(key, { total: 0, wonCount: 0, lostCount: 0, activeCount: 0 });
        }
        const summary = opportunitySummaryMap.get(key)!;
        summary.total += 1;
        if (opp.stageId && wonStageIds.has(opp.stageId)) {
          summary.wonCount += 1;
        } else if (opp.stageId && lostStageIds.has(opp.stageId)) {
          summary.lostCount += 1;
        } else {
          summary.activeCount += 1;
        }
      }
    }

    const leadsWithReferents = await Promise.all(
      leads.map(async (lead) => {
        const opportunitySummary = opportunitySummaryMap.get(lead.id) ?? { total: 0, wonCount: 0, lostCount: 0, activeCount: 0 };
        if (lead.entityType === "COMPANY") {
          const referents = await storage.getReferentsByContactId(lead.id);
          const firstRef = referents.length > 0 ? referents[0] : null;
          return {
            ...lead,
            firstReferentName: firstRef ? `${firstRef.firstName} ${firstRef.lastName}`.trim() : null,
            opportunitySummary,
          };
        }
        return { ...lead, firstReferentName: null, opportunitySummary };
      })
    );
    res.json(leadsWithReferents);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ message: "Errore nel recupero dei lead" });
  }
});

leadsRouter.get("/leads/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato: i tecnici non possono visualizzare i lead" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const lead = await storage.getLeadWithAccess(req.params.id, ctx);

    if (!lead) {
      return res.status(404).json({ message: "Lead non trovato" });
    }

    res.json(lead);
  } catch (error) {
    console.error("Error fetching lead:", error);
    res.status(500).json({ message: "Errore nel recupero del lead" });
  }
});

leadsRouter.post("/leads", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato: i tecnici non possono creare lead" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const validationSchema = insertLeadSchema.omit({ companyId: true });
    const validatedData = validationSchema.parse(req.body);

    // SUPER_ADMIN può specificare companyId nel body, altrimenti usa la propria azienda
    let companyId: string;
    if (role === "SUPER_ADMIN" && req.body.companyId) {
      // Valida che la company esista
      const targetCompany = await storage.getCompany(req.body.companyId);
      if (!targetCompany) {
        return res.status(400).json({ message: "Azienda specificata non trovata" });
      }
      companyId = req.body.companyId;
    } else if (ctx.companyId) {
      companyId = ctx.companyId;
    } else {
      return res.status(403).json({ message: "Impossibile determinare l'azienda per il lead" });
    }

    // Valida assignedToUserId se specificato
    if (validatedData.assignedToUserId) {
      const isValid = await validateUserInSameCompany(validatedData.assignedToUserId, companyId);
      if (!isValid) {
        return res.status(400).json({ message: "L'utente assegnatario non appartiene alla stessa azienda" });
      }
    }

    const lead = await storage.createLead({
      ...validatedData,
      companyId,
    });

    // Log creazione lead
    await storage.createActivityLog({
      companyId,
      userId,
      entityType: "lead",
      entityId: lead.id,
      action: "created",
      details: { firstName: lead.firstName, lastName: lead.lastName },
    });

    // Notifica al commerciale assegnato se richiesto
    if (req.body.notifyAssignee === true && lead.assignedToUserId) {
      try {
        const contactName = lead.entityType === "COMPANY"
          ? (lead.name || "Nuovo contatto")
          : `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Nuovo contatto";

        // Controlla preferenze notifiche dell'utente assegnato
        const prefs = await storage.getNotificationPreferences(lead.assignedToUserId);
        const pref = prefs.find(p => p.notificationType === "LEAD_CALL_REQUEST");
        const isEnabled = pref ? pref.enabled : true; // default abilitato

        if (isEnabled) {
          await storage.createNotification({
            userId: lead.assignedToUserId,
            companyId,
            type: "LEAD_CALL_REQUEST",
            title: "Nuovo contatto da chiamare",
            message: `${contactName}`,
            link: `/leads?open=${lead.id}`,
            isRead: false,
          });
        }
      } catch (notifErr) {
        console.error("Errore nella creazione notifica LEAD_CALL_REQUEST:", notifErr);
      }
    }

    res.status(201).json(lead);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: error.errors
      });
    }
    console.error("Error creating lead:", error);
    res.status(500).json({ message: "Errore nella creazione del lead" });
  }
});

leadsRouter.patch("/leads/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato: i tecnici non possono modificare lead" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const validationSchema = insertLeadSchema.omit({ companyId: true }).extend({
      firstName: z.string().nullable().optional(),
      lastName: z.string().nullable().optional(),
    }).partial();
    let validatedData = validationSchema.parse(req.body);

    // SALES_AGENT non può cambiare assignedToUserId (solo admin possono riassegnare)
    if (role === "SALES_AGENT" && validatedData.assignedToUserId !== undefined) {
      // SALES_AGENT può solo assegnarsi il lead (non riassegnarlo ad altri)
      if (validatedData.assignedToUserId !== userId && validatedData.assignedToUserId !== null) {
        return res.status(403).json({ message: "Non puoi riassegnare lead ad altri utenti" });
      }
    }

    // Valida assignedToUserId se specificato e l'utente ha i permessi
    if (validatedData.assignedToUserId && ctx.companyId) {
      const isValid = await validateUserInSameCompany(validatedData.assignedToUserId, ctx.companyId);
      if (!isValid) {
        return res.status(400).json({ message: "L'utente assegnatario non appartiene alla stessa azienda" });
      }
    }

    // Recupera lead esistente per log dei cambiamenti
    const existingLead = await storage.getLeadWithAccess(req.params.id, ctx);

    const lead = await storage.updateLeadWithAccess(req.params.id, ctx, validatedData as any);

    if (!lead) {
      return res.status(404).json({ message: "Lead non trovato o accesso negato" });
    }

    if (validatedData.assignedToUserId && validatedData.assignedToUserId !== existingLead?.assignedToUserId) {
      await storage.propagateAssignedUserToOpportunities(lead.id, validatedData.assignedToUserId);
    }

    // Log aggiornamento lead (usa companyId del lead per SUPER_ADMIN)
    const logCompanyId = ctx.companyId || existingLead?.companyId;
    if (existingLead && logCompanyId) {
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const key of Object.keys(validatedData) as (keyof typeof validatedData)[]) {
        if (existingLead[key] !== (validatedData as Record<string, unknown>)[key]) {
          changes[key] = { old: existingLead[key], new: (validatedData as Record<string, unknown>)[key] };
        }
      }
      if (Object.keys(changes).length > 0) {
        await storage.createActivityLog({
          companyId: logCompanyId,
          userId,
          entityType: "lead",
          entityId: lead.id,
          action: "updated",
          details: {
            firstName: lead.firstName,
            lastName: lead.lastName,
            changes,
          },
        });
      }
    }

    res.json(lead);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: error.errors
      });
    }
    console.error("Error updating lead:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del lead" });
  }
});

leadsRouter.delete("/leads/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato: i tecnici non possono eliminare lead" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    // Recupera lead prima dell'eliminazione per il log
    const existingLead = await storage.getLeadWithAccess(req.params.id, ctx);

    const deleted = await storage.deleteLeadWithAccess(req.params.id, ctx);

    if (!deleted) {
      return res.status(404).json({ message: "Lead non trovato o accesso negato" });
    }

    // Log eliminazione lead (usa companyId del lead per SUPER_ADMIN)
    const logCompanyId = ctx.companyId || existingLead?.companyId;
    if (existingLead && logCompanyId) {
      await storage.createActivityLog({
        companyId: logCompanyId,
        userId,
        entityType: "lead",
        entityId: req.params.id,
        action: "deleted",
        details: { firstName: existingLead.firstName, lastName: existingLead.lastName },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting lead:", error);
    res.status(500).json({ message: "Errore nell'eliminazione del lead" });
  }
});

// ============ LEAD SUB-RESOURCES ============

// GET /api/leads/:id/opportunities - Lista opportunità di un lead specifico (con controllo accesso)
leadsRouter.get("/leads/:id/opportunities", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const leadOpps = await storage.getOpportunitiesByLeadWithAccess(req.params.id, ctx);
    res.json(leadOpps);
  } catch (error) {
    console.error("Error fetching lead opportunities:", error);
    res.status(500).json({ message: "Errore nel recupero delle opportunità" });
  }
});

// GET /api/leads/:id/activities - Timeline attività di un lead (include opportunità del lead)
leadsRouter.get("/leads/:id/activities", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const activities = await storage.getActivitiesByLead(req.params.id, userCompany.companyId);
    res.json(activities);
  } catch (error) {
    console.error("Error fetching lead activities:", error);
    res.status(500).json({ message: "Errore nel recupero delle attività" });
  }
});

// GET /api/leads/:id/related-notes - Note correlate da opportunità e progetti collegati al lead
leadsRouter.get("/leads/:id/related-notes", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const leadOpportunities = await storage.getOpportunitiesByLead(req.params.id, userCompany.companyId);

    const relatedNotes: Array<{ type: "opportunity" | "project"; entityId: string; title: string; notes: string }> = [];

    for (const opp of leadOpportunities) {
      if (opp.description) {
        relatedNotes.push({
          type: "opportunity",
          entityId: opp.id,
          title: opp.title,
          notes: opp.description,
        });
      }

      const project = await storage.getProjectByOpportunity(opp.id, userCompany.companyId);
      if (project && project.notes) {
        relatedNotes.push({
          type: "project",
          entityId: project.id,
          title: project.clientName,
          notes: project.notes,
        });
      }
    }

    res.json(relatedNotes);
  } catch (error) {
    console.error("Error fetching lead related notes:", error);
    res.status(500).json({ message: "Errore nel recupero delle note correlate" });
  }
});

// ============ CONTACT REFERENTS ============

// GET /api/leads/:id/referents - Lista referenti di un contatto
leadsRouter.get("/leads/:id/referents", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    // Verifica che il contatto esista e appartenga alla stessa azienda
    const lead = await storage.getLead(req.params.id, userCompany.companyId);
    if (!lead) {
      return res.status(404).json({ message: "Contatto non trovato" });
    }

    const referents = await storage.getReferentsByContactId(req.params.id);
    res.json(referents);
  } catch (error) {
    console.error("Error fetching referents:", error);
    res.status(500).json({ message: "Errore nel recupero dei referenti" });
  }
});

// POST /api/leads/:id/referents - Crea nuovo referente
leadsRouter.post("/leads/:id/referents", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    // Verifica che il contatto esista e appartenga alla stessa azienda
    const lead = await storage.getLead(req.params.id, userCompany.companyId);
    if (!lead) {
      return res.status(404).json({ message: "Contatto non trovato" });
    }

    const referent = await storage.createReferent({
      ...req.body,
      contactId: req.params.id,
    });

    res.status(201).json(referent);
  } catch (error) {
    console.error("Error creating referent:", error);
    res.status(500).json({ message: "Errore nella creazione del referente" });
  }
});

// PATCH /api/referents/:id - Aggiorna referente
leadsRouter.patch("/referents/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const referent = await storage.updateReferent(req.params.id, req.body);
    if (!referent) {
      return res.status(404).json({ message: "Referente non trovato" });
    }

    res.json(referent);
  } catch (error) {
    console.error("Error updating referent:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del referente" });
  }
});

// DELETE /api/referents/:id - Elimina referente
leadsRouter.delete("/referents/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const deleted = await storage.deleteReferent(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Referente non trovato" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting referent:", error);
    res.status(500).json({ message: "Errore nell'eliminazione del referente" });
  }
});

// ============ LEAD SOURCES (Provenienze) ============

leadsRouter.get("/lead-sources", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
    let sources = await storage.getLeadSourcesByCompany(userCompany.companyId);
    if (sources.length === 0) {
      const defaultSources = [
        "Facebook", "Instagram", "Google", "LinkedIn", "Passaparola",
        "Newsletter", "CAF", "Cartellonistica", "Mondo Appalti",
        "Facebook Ads", "Instagram Ads", "Google Ads"
      ];
      for (let i = 0; i < defaultSources.length; i++) {
        await storage.createLeadSource({
          name: defaultSources[i],
          sortOrder: i,
          companyId: userCompany.companyId,
        });
      }
      sources = await storage.getLeadSourcesByCompany(userCompany.companyId);
    }
    res.json(sources);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

leadsRouter.post("/lead-sources", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN" && role !== "SALES_AGENT") return res.status(403).json({ message: "Non autorizzato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
    const parsed = insertLeadSourceSchema.omit({ companyId: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
    const source = await storage.createLeadSource({ ...parsed.data, companyId: userCompany.companyId });
    res.status(201).json(source);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

leadsRouter.patch("/lead-sources/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN" && role !== "SALES_AGENT") return res.status(403).json({ message: "Non autorizzato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Nome obbligatorio" });
    const source = await storage.updateLeadSource(req.params.id, userCompany.companyId, { name: name.trim() });
    if (!source) return res.status(404).json({ message: "Provenienza non trovata" });
    res.json(source);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

leadsRouter.delete("/lead-sources/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "SUPER_ADMIN" && role !== "COMPANY_ADMIN" && role !== "SALES_AGENT") return res.status(403).json({ message: "Non autorizzato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Nessuna azienda associata" });
    const deleted = await storage.deleteLeadSource(req.params.id, userCompany.companyId);
    if (!deleted) return res.status(404).json({ message: "Provenienza non trovata" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ============ IMPORTAZIONE CSV LEADS ============

leadsRouter.post("/import/leads/preview", isAuthenticated, csvUpload.single("file"), async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono importare contatti" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    let companyId: string;
    if (role === "SUPER_ADMIN" && req.body.companyId) {
      companyId = req.body.companyId;
    } else if (userCompany) {
      companyId = userCompany.companyId;
    } else {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }

    const csvContent = req.file.buffer.toString("utf-8");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter: [",", ";"],
      relax_column_count: true,
    });

    const paymentMethodsList = await storage.getPaymentMethodsByCompany(companyId);
    const existingLeads = await storage.getLeadsByCompany(companyId);
    const existingVatNumbers = new Set(existingLeads.filter(l => l.vatNumber).map(l => l.vatNumber!.trim().toUpperCase()));
    const existingFiscalCodes = new Set(existingLeads.filter(l => l.fiscalCode).map(l => l.fiscalCode!.trim().toUpperCase()));

    const countryMap: Record<string, string> = { "IT": "Italia", "DE": "Germania", "FR": "Francia", "ES": "Spagna", "CH": "Svizzera", "AT": "Austria" };

    const mappedRecords = (records as Record<string, string>[]).map((row: Record<string, string>, index: number) => {
      const ragioneSociale = row["RAGIONE SOCIALE"] || row["Ragione Sociale"] || row["ragione sociale"] || "";
      const vatNum = (row["Partita Iva"] || row["PARTITA IVA"] || row["P.IVA"] || row["partita iva"] || "").trim();
      const fiscCode = (row["COD. FISCALE"] || row["Codice Fiscale"] || row["CODICE FISCALE"] || row["cod. fiscale"] || "").trim();
      const clienteStato = (row["Cliente"] || row["CLIENTE"] || row["cliente"] || "").trim().toLowerCase();
      const nazione = (row["Nazione"] || row["NAZIONE"] || row["nazione"] || "IT").trim();
      const pagamento = (row["Pagamento"] || row["PAGAMENTO"] || row["pagamento"] || "").trim();
      const sdiCode = (row["SDI"] || row["sdi"] || row["Sdi"] || "").trim();
      const ipaCode = (row["Codice IPA"] || row["CODICE IPA"] || row["codice ipa"] || "").trim();

      let isDuplicate = false;
      if (vatNum && existingVatNumbers.has(vatNum.toUpperCase())) isDuplicate = true;
      if (!isDuplicate && fiscCode && existingFiscalCodes.has(fiscCode.toUpperCase())) isDuplicate = true;

      let matchedPaymentMethodId: string | null = null;
      if (pagamento) {
        const match = paymentMethodsList.find(pm =>
          pm.name.toLowerCase().trim() === pagamento.toLowerCase().trim() ||
          pm.name.toLowerCase().includes(pagamento.toLowerCase()) ||
          pagamento.toLowerCase().includes(pm.name.toLowerCase())
        );
        if (match) matchedPaymentMethodId = match.id;
      }

      return {
        rowIndex: index,
        name: ragioneSociale,
        address: (row["INDIRIZZO"] || row["Indirizzo"] || row["indirizzo"] || "").trim() || null,
        zipCode: (row["CAP"] || row["cap"] || "").trim() || null,
        city: (row["LOCALITÀ"] || row["Localita"] || row["Località"] || row["LOCALITA"] || row["localita"] || "").trim() || null,
        province: (row["Provincia"] || row["PROVINCIA"] || row["provincia"] || "").trim() || null,
        country: countryMap[nazione.toUpperCase()] || nazione || "Italia",
        phone: (row["Telefono"] || row["TELEFONO"] || row["telefono"] || "").trim() || null,
        email: (row["email"] || row["Email"] || row["EMAIL"] || row["E-mail"] || "").trim() || null,
        vatNumber: vatNum || null,
        fiscalCode: fiscCode || null,
        type: clienteStato === "cliente" ? "cliente" : "lead",
        paymentMethodId: matchedPaymentMethodId,
        paymentMethodName: pagamento || null,
        pecEmail: (row["PEC"] || row["pec"] || row["Pec"] || "").trim() || null,
        sdiCode: sdiCode === "0" ? null : sdiCode || null,
        ipaCode: ipaCode || null,
        iban: (row["IBAN"] || row["iban"] || row["Iban"] || "").trim() || null,
        isDuplicate,
        entityType: "COMPANY" as const,
      };
    });

    res.json({
      totalRows: mappedRecords.length,
      duplicates: mappedRecords.filter((r: any) => r.isDuplicate).length,
      newRecords: mappedRecords.filter((r: any) => !r.isDuplicate).length,
      paymentMethods: paymentMethodsList.map(pm => ({ id: pm.id, name: pm.name })),
      records: mappedRecords,
    });
  } catch (error: any) {
    console.error("CSV preview error:", error);
    res.status(500).json({ message: `Errore nella lettura del CSV: ${error.message}` });
  }
});

leadsRouter.post("/import/leads/confirm", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono importare contatti" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    let companyId: string;
    if (role === "SUPER_ADMIN" && req.body.companyId) {
      companyId = req.body.companyId;
    } else if (userCompany) {
      companyId = userCompany.companyId;
    } else {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }

    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: "Nessun record da importare" });
    }

    let imported = 0;
    let errors: string[] = [];

    for (const record of records) {
      try {
        await storage.createLead({
          entityType: "COMPANY",
          type: record.type || "lead",
          name: record.name || null,
          email: record.email || null,
          phone: record.phone || null,
          address: record.address || null,
          city: record.city || null,
          zipCode: record.zipCode || null,
          province: record.province || null,
          country: record.country || "Italia",
          vatNumber: record.vatNumber || null,
          fiscalCode: record.fiscalCode || null,
          sdiCode: record.sdiCode || null,
          ipaCode: record.ipaCode || null,
          pecEmail: record.pecEmail || null,
          paymentMethodId: record.paymentMethodId || null,
          companyId: companyId,
          companyNature: record.ipaCode ? "PUBLIC" : "PRIVATE",
        });
        imported++;
      } catch (err: any) {
        errors.push(`Riga "${record.name}": ${err.message}`);
      }
    }

    res.json({
      imported,
      errors: errors.length,
      errorDetails: errors.slice(0, 20),
      message: `Importati ${imported} contatti con successo${errors.length > 0 ? `. ${errors.length} errori.` : "."}`,
    });
  } catch (error: any) {
    console.error("CSV import error:", error);
    res.status(500).json({ message: `Errore nell'importazione: ${error.message}` });
  }
});
