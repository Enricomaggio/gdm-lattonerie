import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated } from "../auth";
import { requireProxitLock } from "../utils/proxit-helpers";
import { db } from "../db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { dailyAssignments, opportunities, projects as projectsTable } from "@shared/schema";
import { z } from "zod";

export const assignmentsRouter = Router();

// ============ Helper interno ============

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

    const [currentOpp] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.id, project.opportunityId), eq(opportunities.companyId, companyId)));

    const updateFields: Record<string, unknown> = { estimatedStartDate: earliest, updatedAt: new Date() };

    const sq = currentOpp?.siteQuality;
    if (sq === "PHOTO_VIDEO" || sq === "PHOTO_ONLY") {
      const newScheduledAt = new Date(earliest);
      newScheduledAt.setDate(newScheduledAt.getDate() - 10);

      const prevScheduledAt = currentOpp?.photoNotificationScheduledAt;
      const isDateChanged = !prevScheduledAt || Math.abs(newScheduledAt.getTime() - new Date(prevScheduledAt).getTime()) > 0;

      if (isDateChanged) {
        updateFields.photoNotificationScheduledAt = newScheduledAt;
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

// ============ Worker assignment sub-handlers (condiviso fra due route) ============

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
    for (const [_dateStr, daySlot] of Object.entries(waObj)) {
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

assignmentsRouter.patch("/assignments/:id/worker-assignments", isAuthenticated, requireProxitLock, patchWorkerAssignmentsHandler);
assignmentsRouter.patch("/daily-assignments/:id/worker-assignments", isAuthenticated, requireProxitLock, patchWorkerAssignmentsHandler);

assignmentsRouter.patch("/assignments/:id/external-counts", isAuthenticated, requireProxitLock, async (req, res) => {
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

assignmentsRouter.patch("/assignments/:id/external-contacted", isAuthenticated, requireProxitLock, async (req, res) => {
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

assignmentsRouter.patch("/assignments/:id/team-departure-times", isAuthenticated, requireProxitLock, async (req, res) => {
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

assignmentsRouter.patch("/assignments/:id/team-free-numbers", isAuthenticated, requireProxitLock, async (req, res) => {
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

assignmentsRouter.patch("/assignments/:id/team-notes", isAuthenticated, requireProxitLock, async (req, res) => {
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

assignmentsRouter.patch("/assignments/:id/team-note-colors", isAuthenticated, requireProxitLock, async (req, res) => {
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

// GET /api/assignments/material-sigla
assignmentsRouter.get("/assignments/material-sigla", isAuthenticated, async (req, res) => {
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

// GET /api/assignments
assignmentsRouter.get("/assignments", isAuthenticated, async (req, res) => {
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

// POST /api/assignments
assignmentsRouter.post("/assignments", isAuthenticated, requireProxitLock, async (req, res) => {
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

// PATCH /api/assignments/reorder
assignmentsRouter.patch("/assignments/reorder", isAuthenticated, requireProxitLock, async (req, res) => {
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

// PATCH /api/assignments/:id/pre-padding
assignmentsRouter.patch("/assignments/:id/pre-padding", isAuthenticated, requireProxitLock, async (req, res) => {
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

// PATCH /api/assignments/:id
assignmentsRouter.patch("/assignments/:id", isAuthenticated, requireProxitLock, async (req, res) => {
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

// DELETE /api/assignments/:id
assignmentsRouter.delete("/assignments/:id", isAuthenticated, requireProxitLock, async (req, res) => {
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
