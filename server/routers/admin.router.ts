import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import {
  dailyAssignments,
  salPeriods as salPeriodsTable,
  salVoci as salVociTable,
  opportunities,
  leads as leadsTable,
  quotes,
  articles as articlesTable,
} from "@shared/schema";
import { requireProxitLock } from "../utils/proxit-helpers";

export const adminRouter = Router();

// ========== PROXIT - Workers API ==========

adminRouter.get("/workers", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const result = await storage.getWorkersByCompany(userCompany.companyId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching workers:", error);
    res.status(500).json({ message: "Errore nel recupero delle persone" });
  }
});

adminRouter.post("/workers", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { name, isCaposquadra, color, sortOrder, isInternal, defaultCapoId } = req.body;
    if (!name) return res.status(400).json({ message: "Nome obbligatorio" });
    const worker = await storage.createWorker({
      name,
      isCaposquadra: isCaposquadra === true,
      isInternal: isInternal !== false,
      defaultCapoId: defaultCapoId || null,
      color: color || "#4563FF",
      companyId: userCompany.companyId,
      isActive: true,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    });
    res.status(201).json(worker);
  } catch (error: any) {
    console.error("Error creating worker:", error?.message || error);
    res.status(500).json({ message: "Errore nella creazione della persona" });
  }
});

adminRouter.patch("/workers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { name, isCaposquadra, isActive, color, sortOrder, isInternal, defaultCapoId, city } = req.body;
    const allowedFields: Record<string, unknown> = {};
    if (name !== undefined) allowedFields.name = name;
    if (isCaposquadra !== undefined) allowedFields.isCaposquadra = isCaposquadra;
    if (isActive !== undefined) allowedFields.isActive = isActive;
    if (color !== undefined) allowedFields.color = color;
    if (sortOrder !== undefined) allowedFields.sortOrder = sortOrder;
    if (isInternal !== undefined) allowedFields.isInternal = isInternal;
    if ("defaultCapoId" in req.body) allowedFields.defaultCapoId = defaultCapoId || null;
    if ("city" in req.body) allowedFields.city = city || null;
    const worker = await storage.updateWorker(req.params.id, userCompany.companyId, allowedFields);
    if (!worker) return res.status(404).json({ message: "Persona non trovata" });
    res.json(worker);
  } catch (error) {
    console.error("Error updating worker:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento della persona" });
  }
});

adminRouter.post("/workers/reorder", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const companyId = userCompany.companyId;
    const { idA, idB } = req.body;
    if (!idA || !idB) return res.status(400).json({ message: "idA e idB sono obbligatori" });

    const [workerA, workerB] = await Promise.all([
      storage.getWorker(idA, companyId),
      storage.getWorker(idB, companyId),
    ]);
    if (!workerA || !workerB) return res.status(404).json({ message: "Una o entrambe le persone non trovate" });

    const orderA = workerA.sortOrder;
    const orderB = workerB.sortOrder;

    await Promise.all([
      storage.updateWorker(idA, companyId, { sortOrder: orderB } as any),
      storage.updateWorker(idB, companyId, { sortOrder: orderA } as any),
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error("Error reordering workers:", error);
    res.status(500).json({ message: "Errore nel riordinamento" });
  }
});

adminRouter.delete("/workers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const companyId = userCompany.companyId;
    const workerId = req.params.id;
    const allAssignments = await db
      .select({ id: dailyAssignments.id, workerAssignments: dailyAssignments.workerAssignments })
      .from(dailyAssignments)
      .where(eq(dailyAssignments.companyId, companyId));
    for (const assignment of allAssignments) {
      const wa = assignment.workerAssignments as Record<string, Record<string, string[]>> | null;
      if (!wa) continue;
      let changed = false;
      const newWA: Record<string, Record<string, string[]>> = {};
      for (const [dateStr, daySlot] of Object.entries(wa)) {
        if (!daySlot || typeof daySlot !== "object") {
          newWA[dateStr] = daySlot;
          continue;
        }
        const newDaySlot: Record<string, string[]> = {};
        for (const [capoId, workerIds] of Object.entries(daySlot)) {
          if (capoId === workerId) {
            changed = true;
          } else {
            const filtered = (workerIds || []).filter((id) => id !== workerId);
            if (filtered.length !== (workerIds || []).length) changed = true;
            newDaySlot[capoId] = filtered;
          }
        }
        newWA[dateStr] = newDaySlot;
      }
      if (changed) {
        await storage.updateDailyAssignment(assignment.id, companyId, { workerAssignments: newWA });
      }
    }
    const deleted = await storage.deleteWorker(workerId, companyId);
    if (!deleted) return res.status(404).json({ message: "Persona non trovata" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting worker:", error);
    res.status(500).json({ message: "Errore nell'eliminazione della persona" });
  }
});

// ========== Workers migrate-from-teams ==========

adminRouter.post("/workers/migrate-from-teams", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Accesso riservato agli amministratori" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const companyId = userCompany.companyId;

    const existingWorkers = await storage.getWorkersByCompany(companyId);
    if (existingWorkers.length > 0) {
      return res.json({ message: "Migrazione già effettuata", count: 0 });
    }

    const teamsData = await storage.getTeamsByCompany(companyId);
    const membersData = await storage.getTeamMembersByCompany(companyId);

    let count = 0;
    const teamToWorkerMap = new Map<string, string>();

    for (const team of teamsData) {
      const worker = await storage.createWorker({
        name: team.name,
        isCaposquadra: true,
        color: team.color,
        companyId,
        isActive: team.isActive,
      });
      teamToWorkerMap.set(team.id, worker.id);
      count++;
    }

    for (const member of membersData) {
      await storage.createWorker({
        name: member.name,
        isCaposquadra: false,
        color: "#6B7280",
        companyId,
        isActive: member.isActive,
      });
      count++;
    }

    const allAssignments = await db
      .select()
      .from(dailyAssignments)
      .where(eq(dailyAssignments.companyId, companyId));

    for (const assignment of allAssignments) {
      const teamIds: string[] = (assignment.teamIds as string[]) || [];
      if (teamIds.length > 0) {
        const capoIds: string[] = [];
        for (const teamId of teamIds) {
          const workerId = teamToWorkerMap.get(teamId);
          if (workerId) capoIds.push(workerId);
        }
        if (capoIds.length > 0) {
          const dateVal = assignment.date as unknown as Date | string;
          const startStr = typeof dateVal === "string" ? (dateVal as string).slice(0, 10) : (dateVal as Date).toLocaleDateString("sv-SE");
          const endDateVal = assignment.endDate as unknown as Date | string | null;
          const endStr = endDateVal
            ? (typeof endDateVal === "string" ? (endDateVal as string).slice(0, 10) : (endDateVal as Date).toLocaleDateString("sv-SE"))
            : startStr;
          const workerAssignments: Record<string, Record<string, string[]>> = {};
          const [sy, sm, sd] = startStr.split("-").map(Number);
          const [ey, em, ed] = endStr.split("-").map(Number);
          const cursor = new Date(sy, sm - 1, sd);
          const end = new Date(ey, em - 1, ed);
          while (cursor <= end) {
            const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
            workerAssignments[dateStr] = {};
            for (const capoId of capoIds) {
              workerAssignments[dateStr][capoId] = [];
            }
            cursor.setDate(cursor.getDate() + 1);
          }
          await storage.updateDailyAssignment(assignment.id, companyId, { workerAssignments });
        }
      }
    }

    res.json({ message: "Migrazione completata", count, teamToWorkerMap: Object.fromEntries(teamToWorkerMap) });
  } catch (error) {
    console.error("Error migrating teams to workers:", error);
    res.status(500).json({ message: "Errore nella migrazione" });
  }
});

// ========== PROXIT - Teams API ==========

adminRouter.get("/teams", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const result = await storage.getTeamsByCompany(userCompany.companyId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ message: "Errore nel recupero delle squadre" });
  }
});

adminRouter.post("/teams", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { name, color, paese } = req.body;
    if (!name) return res.status(400).json({ message: "Nome squadra obbligatorio" });
    const team = await storage.createTeam({ name, color: color || "#4563FF", paese: paese || null, companyId: userCompany.companyId });
    res.status(201).json(team);
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ message: "Errore nella creazione della squadra" });
  }
});

adminRouter.patch("/teams/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const body = { ...req.body };
    if ('paese' in body) {
      body.paese = body.paese || null;
    }
    const team = await storage.updateTeam(req.params.id, userCompany.companyId, body);
    if (!team) return res.status(404).json({ message: "Squadra non trovata" });
    res.json(team);
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento della squadra" });
  }
});

adminRouter.delete("/teams/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const deleted = await storage.deleteTeam(req.params.id, userCompany.companyId);
    if (!deleted) return res.status(404).json({ message: "Squadra non trovata" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ message: "Errore nell'eliminazione della squadra" });
  }
});

// ========== PROXIT - Team Members API ==========

adminRouter.get("/team-members", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { teamId } = req.query;
    if (teamId) {
      const result = await storage.getTeamMembersByTeam(teamId as string, userCompany.companyId);
      return res.json(result);
    }
    const result = await storage.getTeamMembersByCompany(userCompany.companyId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ message: "Errore nel recupero dei componenti" });
  }
});

adminRouter.post("/team-members", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { teamId, name } = req.body;
    if (!teamId || !name) return res.status(400).json({ message: "teamId e name sono obbligatori" });
    const team = await storage.getTeam(teamId, userCompany.companyId);
    if (!team) return res.status(404).json({ message: "Squadra non trovata o non appartenente all'azienda" });
    const member = await storage.createTeamMember({ teamId, name, companyId: userCompany.companyId, isActive: true });
    res.status(201).json(member);
  } catch (error) {
    console.error("Error creating team member:", error);
    res.status(500).json({ message: "Errore nella creazione del componente" });
  }
});

adminRouter.patch("/team-members/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { name, isActive } = req.body;
    if (name === undefined && isActive === undefined) {
      return res.status(400).json({ message: "Almeno un campo tra name e isActive è richiesto" });
    }
    const member = await storage.updateTeamMember(req.params.id, userCompany.companyId, { name, isActive });
    if (!member) return res.status(404).json({ message: "Componente non trovato" });
    res.json(member);
  } catch (error) {
    console.error("Error updating team member:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del componente" });
  }
});

adminRouter.delete("/team-members/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const deleted = await storage.deleteTeamMember(req.params.id, userCompany.companyId);
    if (!deleted) return res.status(404).json({ message: "Componente non trovato" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting team member:", error);
    res.status(500).json({ message: "Errore nell'eliminazione del componente" });
  }
});

// ========== PROXIT - Drivers API ==========

adminRouter.get("/drivers", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const result = await storage.getDriversByCompany(userCompany.companyId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching drivers:", error);
    res.status(500).json({ message: "Errore nel recupero degli autisti" });
  }
});

adminRouter.post("/drivers", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { name, phone } = req.body;
    if (!name) return res.status(400).json({ message: "Nome autista obbligatorio" });
    const driver = await storage.createDriver({ name, phone: phone || null, companyId: userCompany.companyId });
    res.status(201).json(driver);
  } catch (error) {
    console.error("Error creating driver:", error);
    res.status(500).json({ message: "Errore nella creazione dell'autista" });
  }
});

adminRouter.patch("/drivers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const driver = await storage.updateDriver(req.params.id, userCompany.companyId, req.body);
    if (!driver) return res.status(404).json({ message: "Autista non trovato" });
    res.json(driver);
  } catch (error) {
    console.error("Error updating driver:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'autista" });
  }
});

adminRouter.delete("/drivers/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const deleted = await storage.deleteDriver(req.params.id, userCompany.companyId);
    if (!deleted) return res.status(404).json({ message: "Autista non trovato" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting driver:", error);
    res.status(500).json({ message: "Errore nell'eliminazione dell'autista" });
  }
});

// ========== PROXIT - Vehicles API ==========

adminRouter.get("/vehicles", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const result = await storage.getVehiclesByCompany(userCompany.companyId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    res.status(500).json({ message: "Errore nel recupero dei mezzi" });
  }
});

adminRouter.post("/vehicles", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const { name, plate, type } = req.body;
    if (!name) return res.status(400).json({ message: "Nome mezzo obbligatorio" });
    const vehicle = await storage.createVehicle({ name, plate: plate || null, type: type || null, companyId: userCompany.companyId });
    res.status(201).json(vehicle);
  } catch (error) {
    console.error("Error creating vehicle:", error);
    res.status(500).json({ message: "Errore nella creazione del mezzo" });
  }
});

adminRouter.patch("/vehicles/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const vehicle = await storage.updateVehicle(req.params.id, userCompany.companyId, req.body);
    if (!vehicle) return res.status(404).json({ message: "Mezzo non trovato" });
    res.json(vehicle);
  } catch (error) {
    console.error("Error updating vehicle:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del mezzo" });
  }
});

adminRouter.delete("/vehicles/:id", isAuthenticated, requireProxitLock, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    const deleted = await storage.deleteVehicle(req.params.id, userCompany.companyId);
    if (!deleted) return res.status(404).json({ message: "Mezzo non trovato" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json({ message: "Errore nell'eliminazione del mezzo" });
  }
});

// ============ SALES TARGETS (Obiettivi mensili per venditore) ============

// GET /sales-targets?month=&year=
// Restituisce tutti i target del mese con totali reali calcolati da quotes e opportunities
// Solo admin può vedere i target di tutti i venditori
adminRouter.get("/sales-targets", isAuthenticated, async (req, res) => {
  try {
    // Solo admin può accedere ai target di tutti i venditori
    if (req.user!.role !== "COMPANY_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono vedere gli obiettivi del team" });
    }

    const userCompany = await storage.getUserCompany(req.user!.id);
    if (!userCompany?.companyId) {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }
    const companyId = userCompany.companyId;

    const monthParam = parseInt(req.query.month as string);
    const yearParam = parseInt(req.query.year as string);
    const startDateParam = req.query.startDate as string | undefined;
    const endDateParam = req.query.endDate as string | undefined;
    const proportionalParam = req.query.proportional === "true";
    const now = new Date();
    const month = isNaN(monthParam) ? now.getMonth() + 1 : monthParam;
    const year = isNaN(yearParam) ? now.getFullYear() : yearParam;

    // Recupera tutti i venditori (SALES_AGENT) dell'azienda
    const teamUsers = await storage.getUsersByCompanyId(companyId);
    const salesAgents = teamUsers.filter(u => u.role === "SALES_AGENT");

    // Calcola inizio e fine del mese (default per filtri mese singolo)
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const today = new Date();
    const monthDays = new Date(year, month, 0).getDate();
    const daysTotal = monthDays;
    const daysElapsed = today < startOfMonth
      ? 0
      : today > endOfMonth
        ? daysTotal
        : today.getDate();

    // Se startDate/endDate sono forniti, usarli per il calcolo degli effettivi
    let periodStart = startOfMonth;
    let periodEnd = endOfMonth;
    let periodDays = monthDays;

    if (startDateParam && endDateParam) {
      periodStart = new Date(startDateParam);
      periodEnd = new Date(endDateParam);
      // Normalize to midnight to avoid time-of-day skew
      const startMidnight = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
      const endMidnight = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
      const msPerDay = 1000 * 60 * 60 * 24;
      periodDays = Math.floor((endMidnight.getTime() - startMidnight.getTime()) / msPerDay) + 1;
    }

    // Recupera i target:
    // - proportional=true (quarter/year/custom): somma i target di tutti i mesi coperti,
    //   con proporzione per mesi parziali (giorni sovrapposti / giorni del mese).
    //   Questo include custom su singolo mese parziale.
    // - last-week / last-month: startDate/endDate presenti ma proportional=false;
    //   il backend restituisce il target mensile intero; il frontend scala per last-week.
    // - Altrimenti: usa getSalesTargets per il mese/anno selezionato (single-month exact).
    let targetsByUser: Map<string, { quoteTarget: number; wonTarget: number }>;

    if (proportionalParam && startDateParam && endDateParam) {
      const allRangeTargets = await storage.getSalesTargetsForRange(companyId, periodStart, periodEnd);
      targetsByUser = new Map();

      // For each month in the range, compute proportional contribution
      const cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
      const rangeEndMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
      while (cursor <= rangeEndMonth) {
        const curYear = cursor.getFullYear();
        const curMonth = cursor.getMonth() + 1;
        const daysInMonth = new Date(curYear, curMonth, 0).getDate();
        // Compute overlap between this calendar month and the requested period
        const monthStart = new Date(curYear, curMonth - 1, 1);
        const monthEnd = new Date(curYear, curMonth, 0, 23, 59, 59, 999);
        const overlapStart = periodStart > monthStart ? periodStart : monthStart;
        const overlapEnd = periodEnd < monthEnd ? periodEnd : monthEnd;
        // Compute overlap in whole days
        const overlapStartMidnight = new Date(overlapStart.getFullYear(), overlapStart.getMonth(), overlapStart.getDate());
        const overlapEndMidnight = new Date(overlapEnd.getFullYear(), overlapEnd.getMonth(), overlapEnd.getDate());
        const overlapDays = Math.floor((overlapEndMidnight.getTime() - overlapStartMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const proportion = daysInMonth > 0 ? Math.min(overlapDays, daysInMonth) / daysInMonth : 0;

        const monthTargets = allRangeTargets.filter(t => t.month === curMonth && t.year === curYear);
        for (const t of monthTargets) {
          const existing = targetsByUser.get(t.userId) ?? { quoteTarget: 0, wonTarget: 0 };
          existing.quoteTarget += parseFloat(t.quoteTarget ?? "0") * proportion;
          existing.wonTarget += parseFloat(t.wonTarget ?? "0") * proportion;
          targetsByUser.set(t.userId, existing);
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      // Single-month: recupera i target salvati per questo mese/anno
      const targets = await storage.getSalesTargets(companyId, month, year);
      targetsByUser = new Map(targets.map(t => ({
        [t.userId]: {
          quoteTarget: parseFloat(t.quoteTarget ?? "0"),
          wonTarget: parseFloat(t.wonTarget ?? "0"),
        }
      })).flatMap(o => Object.entries(o)) as [string, { quoteTarget: number; wonTarget: number }][]);
    }

    // Recupera tutte le opportunità dell'azienda per il calcolo dei totali
    const allOpportunities = await db
      .select({
        id: opportunities.id,
        value: opportunities.value,
        assignedToUserId: opportunities.assignedToUserId,
        stageId: opportunities.stageId,
        wonAt: opportunities.wonAt,
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .where(eq(opportunities.companyId, companyId));

    // Recupera gli stage per identificare "Vinto"
    const stages = await storage.getStagesByCompany(companyId);
    const vintoStage = stages.find(s => s.name.toLowerCase() === "vinto");

    // Recupera preventivi creati nel periodo per venditore
    const monthQuotes = await db
      .select({
        id: quotes.id,
        totalAmount: quotes.totalAmount,
        opportunityId: quotes.opportunityId,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(and(
        eq(quotes.companyId, companyId),
        gte(quotes.createdAt, periodStart),
        lte(quotes.createdAt, periodEnd)
      ));

    // Mappa opportunità per id per lookup veloce
    const oppMap = new Map(allOpportunities.map(o => [o.id, o]));

    // Calcola totali per venditore
    const sellerResults = salesAgents.map(agent => {
      const agentTargets = targetsByUser.get(agent.id) ?? { quoteTarget: 0, wonTarget: 0 };

      // Totale preventivi fatti (sum totalAmount dei quotes creati nel periodo per questo venditore)
      const agentQuotes = monthQuotes.filter(q => {
        const opp = oppMap.get(q.opportunityId);
        return opp?.assignedToUserId === agent.id;
      });
      const quotesTotal = agentQuotes.reduce((sum, q) => sum + parseFloat(q.totalAmount ?? "0"), 0);

      // Totale acquisiti (sum value delle opportunità vinte nel periodo per questo venditore)
      const wonTotal = allOpportunities
        .filter(o => {
          if (o.assignedToUserId !== agent.id) return false;
          if (!vintoStage || o.stageId !== vintoStage.id) return false;
          if (!o.wonAt) return false;
          const wonDate = new Date(o.wonAt);
          return wonDate >= periodStart && wonDate <= periodEnd;
        })
        .reduce((sum, o) => sum + parseFloat(o.value ?? "0"), 0);

      return {
        userId: agent.id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        displayName: agent.displayName,
        quoteTarget: Math.round(agentTargets.quoteTarget),
        wonTarget: Math.round(agentTargets.wonTarget),
        quotesTotal,
        wonTotal,
      };
    });

    res.json({
      month,
      year,
      daysElapsed,
      daysTotal,
      periodDays,
      monthDays,
      sellers: sellerResults,
    });
  } catch (error: any) {
    console.error("[sales-targets] GET error:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET /sales-targets/my - Target del venditore corrente per il mese corrente
adminRouter.get("/sales-targets/my", isAuthenticated, async (req, res) => {
  try {
    const userCompany = await storage.getUserCompany(req.user!.id);
    if (!userCompany?.companyId) {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }
    const companyId = userCompany.companyId;
    const userId = req.user!.id;

    const now = new Date();

    const parseLocalDate = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const customStart = req.query.startDate ? parseLocalDate(req.query.startDate as string) : null;
    const _endBase = req.query.endDate ? parseLocalDate(req.query.endDate as string) : null;
    const customEnd = _endBase ? new Date(_endBase.getFullYear(), _endBase.getMonth(), _endBase.getDate(), 23, 59, 59, 999) : null;

    const rangeStart = customStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = customEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // For multi-month ranges (quarter, year), use the current month if today
    // falls within the range; otherwise use the last month of the range.
    const targetRef = (now >= rangeStart && now <= rangeEnd) ? now : rangeEnd;
    const month = targetRef.getMonth() + 1;
    const year = targetRef.getFullYear();

    const startOfMonth = rangeStart;
    const endOfMonth = rangeEnd;
    const daysTotal = customStart && customEnd
      ? Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24))
      : new Date(year, month, 0).getDate();
    const daysElapsed = customStart && customEnd
      ? Math.min(daysTotal, Math.ceil((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)))
      : now.getDate();

    const target = await storage.getSalesTarget(companyId, userId, month, year);

    // Recupera stages per trovare "Vinto"
    const stages = await storage.getStagesByCompany(companyId);
    const vintoStage = stages.find(s => s.name.toLowerCase() === "vinto");

    // Quotes dell'utente nel mese corrente
    const userOpportunities = await db
      .select({ id: opportunities.id, value: opportunities.value, stageId: opportunities.stageId, wonAt: opportunities.wonAt })
      .from(opportunities)
      .where(and(eq(opportunities.companyId, companyId), eq(opportunities.assignedToUserId, userId)));

    const userOppIds = new Set(userOpportunities.map(o => o.id));

    const monthQuotes = await db
      .select({ id: quotes.id, totalAmount: quotes.totalAmount, opportunityId: quotes.opportunityId })
      .from(quotes)
      .where(and(
        eq(quotes.companyId, companyId),
        gte(quotes.createdAt, startOfMonth),
        lte(quotes.createdAt, endOfMonth)
      ));

    const quotesTotal = monthQuotes
      .filter(q => userOppIds.has(q.opportunityId))
      .reduce((sum, q) => sum + parseFloat(q.totalAmount ?? "0"), 0);

    const wonTotal = userOpportunities
      .filter(o => {
        if (!vintoStage || o.stageId !== vintoStage.id) return false;
        if (!o.wonAt) return false;
        const wonDate = new Date(o.wonAt);
        return wonDate >= startOfMonth && wonDate <= endOfMonth;
      })
      .reduce((sum, o) => sum + parseFloat(o.value ?? "0"), 0);

    res.json({
      month,
      year,
      daysElapsed,
      daysTotal,
      quoteTarget: parseFloat(target?.quoteTarget ?? "0"),
      wonTarget: parseFloat(target?.wonTarget ?? "0"),
      quotesTotal,
      wonTotal,
    });
  } catch (error: any) {
    console.error("[sales-targets] GET /my error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Shared handler for POST and PUT /sales-targets - Imposta o aggiorna un obiettivo (solo admin)
const upsertSalesTargetHandler = async (req: any, res: any) => {
  try {
    // Solo admin può scrivere
    if (req.user!.role !== "COMPANY_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono impostare gli obiettivi" });
    }

    const userCompany = await storage.getUserCompany(req.user!.id);
    if (!userCompany?.companyId) {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }

    const companyId = userCompany.companyId;
    const { userId, month, year, quoteTarget, wonTarget } = req.body;

    if (!userId || !month || !year) {
      return res.status(400).json({ message: "userId, month e year sono obbligatori" });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: "month deve essere un numero tra 1 e 12" });
    }
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({ message: "year non valido" });
    }

    // Verifica che userId appartenga alla stessa azienda e sia un venditore
    const teamUsers = await storage.getUsersByCompanyId(companyId);
    const targetUser = teamUsers.find(u => u.id === userId);
    if (!targetUser) {
      return res.status(400).json({ message: "Utente non trovato nell'azienda" });
    }
    if (targetUser.role !== "SALES_AGENT" && targetUser.role !== "COMPANY_ADMIN") {
      return res.status(400).json({ message: "Gli obiettivi possono essere impostati solo per venditori" });
    }

    const target = await storage.upsertSalesTarget({
      companyId,
      userId,
      month: monthNum,
      year: yearNum,
      quoteTarget: String(parseFloat(String(quoteTarget)) || 0),
      wonTarget: String(parseFloat(String(wonTarget)) || 0),
    });

    res.json(target);
  } catch (error: any) {
    console.error("[sales-targets] upsert error:", error);
    res.status(500).json({ message: error.message });
  }
};

adminRouter.post("/sales-targets", isAuthenticated, upsertSalesTargetHandler);
adminRouter.put("/sales-targets", isAuthenticated, upsertSalesTargetHandler);

// ============ SAL - Stato Avanzamento Lavori ============

const VALID_VAT_RATES = ["22", "10", "4", "RC"] as const;
type SalVatRate = typeof VALID_VAT_RATES[number];
function sanitizeVatRate(v: unknown): SalVatRate {
  const s = String(v || "22");
  return (VALID_VAT_RATES as readonly string[]).includes(s) ? (s as SalVatRate) : "22";
}

// GET /sal?period=YYYY-MM - Lista cantieri con attività nel mese + SAL status
adminRouter.get("/sal", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
    const companyId = userCompany.companyId;

    const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);
    const [year, month] = period.split("-").map(Number);
    const startOfPeriod = new Date(year, month - 1, 1);
    const endOfPeriod = new Date(year, month, 0, 23, 59, 59);



    // Recupera tutti i progetti dell'azienda
    const allProjects = await storage.getProjectsByCompany(companyId);

    // Recupera assignments nel periodo con dettagli per Proxit operations summary
    const assignmentsInPeriod = await db
      .select({
        projectId: dailyAssignments.projectId,
        date: dailyAssignments.date,
        activityType: dailyAssignments.activityType,
        teamIds: dailyAssignments.teamIds,
        notes: dailyAssignments.notes,
      })
      .from(dailyAssignments)
      .where(
        and(
          eq(dailyAssignments.companyId, companyId),
          gte(dailyAssignments.date, startOfPeriod),
          lte(dailyAssignments.date, endOfPeriod),
        )
      )
      .orderBy(dailyAssignments.date);

    const projectIdsWithAssignments = new Set(
      assignmentsInPeriod.map((a) => a.projectId).filter(Boolean)
    );

    // Recupera SAL periods esistenti per questo mese
    const existingSalPeriods = await db
      .select()
      .from(salPeriodsTable)
      .where(
        and(
          eq(salPeriodsTable.companyId, companyId),
          eq(salPeriodsTable.period, period)
        )
      );

    const salByProjectId = new Map(existingSalPeriods.map((s) => [s.projectId, s]));

    // Recupera totali voci SAL per tutti i SAL del mese
    const salIds = existingSalPeriods.map((s) => s.id);
    const salTotalsMap = new Map<string, number>();
    if (salIds.length > 0) {
      const vociRows = await db
        .select({
          salPeriodId: salVociTable.salPeriodId,
          total: salVociTable.total,
        })
        .from(salVociTable)
        .where(inArray(salVociTable.salPeriodId, salIds));
      for (const v of vociRows) {
        const current = salTotalsMap.get(v.salPeriodId) || 0;
        salTotalsMap.set(v.salPeriodId, current + parseFloat(String(v.total || "0")));
      }
    }

    // Raggruppa assignments Proxit per progetto con dettagli compatti
    const proxitOpsByProject = new Map<string, Array<{ date: string; activityType: string; teamCount: number; notes: string | null }>>();
    const proxitCountByProject = new Map<string, number>();
    for (const a of assignmentsInPeriod) {
      if (a.projectId) {
        proxitCountByProject.set(a.projectId, (proxitCountByProject.get(a.projectId) || 0) + 1);
        if (!proxitOpsByProject.has(a.projectId)) proxitOpsByProject.set(a.projectId, []);
        proxitOpsByProject.get(a.projectId)!.push({
          date: a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10),
          activityType: a.activityType,
          teamCount: (a.teamIds || []).length,
          notes: a.notes || null,
        });
      }
    }

    // Determina cantiereStatus per ogni progetto (replica logica esistente)
    const getCantiereStatus = (project: any): string => {
      if (project.cantiereStatusOverride) return project.cantiereStatusOverride;
      return "NON_AVVIATO";
    };

    const ACTIVE_STATUSES = ["IN_CORSO", "MONTAGGIO_IN_CORSO", "SMONTAGGIO_IN_CORSO", "MONTAGGIO_PIANIFICATO"];

    // Filtra progetti rilevanti: attivi nel mese o con assegnazioni nel mese
    const relevantProjects = allProjects.filter((p) => {
      const hasAssignment = projectIdsWithAssignments.has(p.id);
      const status = getCantiereStatus(p);
      const isActive = ACTIVE_STATUSES.includes(status);
      const hasSal = salByProjectId.has(p.id);
      return hasAssignment || isActive || hasSal;
    });

    // Recupera dati aggiuntivi (quote, lead, opportunity)
    const opportunityIds = relevantProjects.map((p) => p.opportunityId);
    let opportunities_data: any[] = [];
    let leads_data: any[] = [];
    let quotes_data: any[] = [];

    if (opportunityIds.length > 0) {
      opportunities_data = await db
        .select()
        .from(opportunities)
        .where(inArray(opportunities.id, opportunityIds));

      const leadIds = Array.from(new Set(opportunities_data.map((o) => o.leadId)));
      if (leadIds.length > 0) {
        leads_data = await db
          .select()
          .from(leadsTable)
          .where(inArray(leadsTable.id, leadIds));
      }

      const quoteIds = relevantProjects.map((p) => p.quoteId).filter(Boolean) as string[];
      if (quoteIds.length > 0) {
        quotes_data = await db
          .select()
          .from(quotes)
          .where(inArray(quotes.id, quoteIds));
      }
    }

    const oppById = new Map(opportunities_data.map((o) => [o.id, o]));
    const leadById = new Map(leads_data.map((l) => [l.id, l]));
    const quoteById = new Map(quotes_data.map((q) => [q.id, q]));

    const result = relevantProjects.map((p) => {
      const opp = oppById.get(p.opportunityId);
      const lead = opp ? leadById.get(opp.leadId) : null;
      const quote = p.quoteId ? quoteById.get(p.quoteId) : null;
      const sal = salByProjectId.get(p.id) || null;
      const status = getCantiereStatus(p);

      const clientName = lead
        ? lead.entityType === "COMPANY" ? lead.name : `${lead.firstName || ""} ${lead.lastName || ""}`.trim()
        : p.clientName;

      const salId = sal?.id || null;
      const salTotal = salId !== null ? (salTotalsMap.get(salId) ?? null) : null;
      const proxitCount = proxitCountByProject.get(p.id) || 0;
      const proxitOps = proxitOpsByProject.get(p.id) || [];

      return {
        projectId: p.id,
        clientName,
        siteAddress: p.siteAddress || opp?.siteAddress || null,
        quoteNumber: quote?.number || null,
        quoteId: p.quoteId || null,
        cantiereStatus: status,
        salId,
        salStatus: sal?.status || null,
        salTotal,
        proxitCount,
        proxitOps,
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error("[sal] GET error:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET /sal/:id - Dettaglio SAL period con voci
adminRouter.get("/sal/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
    const companyId = userCompany.companyId;



    const [salPeriod] = await db
      .select()
      .from(salPeriodsTable)
      .where(and(eq(salPeriodsTable.id, req.params.id), eq(salPeriodsTable.companyId, companyId)));

    if (!salPeriod) return res.status(404).json({ message: "SAL non trovato" });

    const voci = await db
      .select()
      .from(salVociTable)
      .where(eq(salVociTable.salPeriodId, salPeriod.id))
      .orderBy(salVociTable.sortOrder, salVociTable.createdAt);

    res.json({ ...salPeriod, voci });
  } catch (error: any) {
    console.error("[sal] GET/:id error:", error);
    res.status(500).json({ message: error.message });
  }
});

// POST /sal/initialize - Crea o recupera SAL period per un progetto e mese, auto-popola le voci
adminRouter.post("/sal/initialize", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
    const companyId = userCompany.companyId;

    const { projectId, period } = req.body;
    if (!projectId || !period) return res.status(400).json({ message: "projectId e period obbligatori" });



    // Verifica che il progetto esista e appartenga all'azienda
    const project = await storage.getProject(projectId, companyId);
    if (!project) return res.status(404).json({ message: "Progetto non trovato" });

    // Controlla se esiste già un SAL per questo progetto/periodo
    const [existing] = await db
      .select()
      .from(salPeriodsTable)
      .where(and(eq(salPeriodsTable.projectId, projectId), eq(salPeriodsTable.period, period)));

    if (existing) {
      const voci = await db
        .select()
        .from(salVociTable)
        .where(eq(salVociTable.salPeriodId, existing.id))
        .orderBy(salVociTable.sortOrder, salVociTable.createdAt);
      return res.json({ ...existing, voci });
    }

    // Crea nuovo SAL period
    const [newSal] = await db
      .insert(salPeriodsTable)
      .values({
        companyId,
        projectId,
        period,
        status: "BOZZA",
      })
      .returning();

    // Auto-popola le voci dal preventivo accettato
    const vociToInsert: any[] = [];
    let sortOrder = 0;

    if (project.quoteId) {
      const quoteItems_data = await storage.getQuoteItems(project.quoteId);
      const articleIds = quoteItems_data.map((qi) => qi.articleId);
      const articleMap = new Map<string, any>();

      if (articleIds.length > 0) {

        const articlesList = await db
          .select()
          .from(articlesTable)
          .where(inArray(articlesTable.id, articleIds));
        articlesList.forEach((a) => articleMap.set(a.id, a));
      }

      // Determina cantiereStatus per auto-inclusione noleggio
      const cantiereStatus = project.cantiereStatusOverride || "NON_AVVIATO";
      const NOLEGGIO_STATUSES = ["IN_CORSO", "MONTAGGIO_IN_CORSO", "SMONTAGGIO_IN_CORSO"];
      const includeNoleggio = NOLEGGIO_STATUSES.includes(cantiereStatus);

      const phaseOrder = ["DOCUMENTI", "TRASPORTO_ANDATA", "MOVIMENTAZIONE_MAGAZZINO", "MONTAGGIO", "NOLEGGIO", "SMONTAGGIO", "TRASPORTO_RITORNO"];
      const itemsByPhase = new Map<string, any[]>();
      phaseOrder.forEach((p) => itemsByPhase.set(p, []));

      for (const qi of quoteItems_data) {
        const phase = qi.phase || "NOLEGGIO";
        if (!itemsByPhase.has(phase)) itemsByPhase.set(phase, []);
        itemsByPhase.get(phase)!.push(qi);
      }

      let hasNoleggioItems = false;
      for (const phase of phaseOrder) {
        const items = itemsByPhase.get(phase) || [];
        if (phase === "NOLEGGIO" && !includeNoleggio) continue;

        for (const qi of items) {
          const article = articleMap.get(qi.articleId);
          const unitPrice = parseFloat(qi.unitPriceApplied || "0");
          const quantity = parseFloat(qi.quantity || "1");
          const total = unitPrice * quantity;

          if (phase === "NOLEGGIO") hasNoleggioItems = true;

          vociToInsert.push({
            salPeriodId: newSal.id,
            companyId,
            description: article?.name || qi.articleId,
            quantity: String(quantity),
            um: "cad",
            unitPrice: String(unitPrice),
            discountPercent: "0",
            total: String(total),
            vatRate: sanitizeVatRate(qi.vatRate),
            phase,
            sourceQuoteItemId: qi.id,
            sortOrder: sortOrder++,
          });
        }
      }

      // Se cantiere attivo ma il preventivo non ha voci NOLEGGIO, aggiungi voce vuota
      if (includeNoleggio && !hasNoleggioItems) {
        vociToInsert.push({
          salPeriodId: newSal.id,
          companyId,
          description: "Canone Noleggio",
          quantity: "1",
          um: "mese",
          unitPrice: "0",
          discountPercent: "0",
          total: "0",
          vatRate: "22",
          phase: "NOLEGGIO",
          sortOrder: sortOrder++,
        });
      }
    } else {
      // Nessun preventivo: inserisci una voce noleggio vuota se cantiere attivo
      const cantiereStatus = project.cantiereStatusOverride || "NON_AVVIATO";
      const NOLEGGIO_STATUSES = ["IN_CORSO", "MONTAGGIO_IN_CORSO", "SMONTAGGIO_IN_CORSO"];
      if (NOLEGGIO_STATUSES.includes(cantiereStatus)) {
        vociToInsert.push({
          salPeriodId: newSal.id,
          companyId,
          description: "Canone Noleggio",
          quantity: "1",
          um: "mese",
          unitPrice: "0",
          discountPercent: "0",
          total: "0",
          vatRate: "22",
          phase: "NOLEGGIO",
          sortOrder: sortOrder++,
        });
      }
    }

    let voci: any[] = [];
    if (vociToInsert.length > 0) {
      voci = await db.insert(salVociTable).values(vociToInsert).returning();
      voci.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    res.json({ ...newSal, voci });
  } catch (error: any) {
    console.error("[sal] POST initialize error:", error);
    res.status(500).json({ message: error.message });
  }
});

// PATCH /sal/:id - Aggiorna SAL period (status, notes, isFinalInvoice)
adminRouter.patch("/sal/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
    const companyId = userCompany.companyId;



    const [existing] = await db
      .select()
      .from(salPeriodsTable)
      .where(and(eq(salPeriodsTable.id, req.params.id), eq(salPeriodsTable.companyId, companyId)));

    if (!existing) return res.status(404).json({ message: "SAL non trovato" });

    const { status, notes, isFinalInvoice } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (isFinalInvoice !== undefined) updateData.isFinalInvoice = isFinalInvoice;
    if (status === "INVIATO" && existing.status !== "INVIATO") updateData.sentAt = new Date();

    const [updated] = await db
      .update(salPeriodsTable)
      .set(updateData)
      .where(eq(salPeriodsTable.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("[sal] PATCH error:", error);
    res.status(500).json({ message: error.message });
  }
});

// POST /sal/:id/voci - Aggiungi voce a SAL
adminRouter.post("/sal/:id/voci", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
    const companyId = userCompany.companyId;



    const [salPeriod] = await db
      .select()
      .from(salPeriodsTable)
      .where(and(eq(salPeriodsTable.id, req.params.id), eq(salPeriodsTable.companyId, companyId)));

    if (!salPeriod) return res.status(404).json({ message: "SAL non trovato" });

    const { description, quantity, um, unitPrice, discountPercent, total, vatRate, phase, sortOrder } = req.body;
    const qty = parseFloat(quantity || "1");
    const up = parseFloat(unitPrice || "0");
    const disc = parseFloat(discountPercent || "0");
    const computedTotal = qty * up * (1 - disc / 100);

    const [voce] = await db
      .insert(salVociTable)
      .values({
        salPeriodId: salPeriod.id,
        companyId,
        description: description || "Nuova voce",
        quantity: String(qty),
        um: um || "cad",
        unitPrice: String(up),
        discountPercent: String(disc),
        total: String(total !== undefined ? parseFloat(total) : computedTotal),
        vatRate: sanitizeVatRate(vatRate),
        phase: phase || "NOLEGGIO",
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    res.json(voce);
  } catch (error: any) {
    console.error("[sal] POST voci error:", error);
    res.status(500).json({ message: error.message });
  }
});

// PATCH /sal/:id/voci/:voceId - Aggiorna voce SAL
adminRouter.patch("/sal/:id/voci/:voceId", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
    const companyId = userCompany.companyId;



    const updateData: any = {};
    const { description, quantity, um, unitPrice, discountPercent, total, vatRate, phase } = req.body;
    if (description !== undefined) updateData.description = description;
    if (quantity !== undefined) updateData.quantity = String(parseFloat(quantity));
    if (um !== undefined) updateData.um = um;
    if (unitPrice !== undefined) updateData.unitPrice = String(parseFloat(unitPrice));
    if (discountPercent !== undefined) updateData.discountPercent = String(parseFloat(discountPercent));
    if (total !== undefined) updateData.total = String(parseFloat(total));
    if (vatRate !== undefined) updateData.vatRate = sanitizeVatRate(vatRate);
    if (phase !== undefined) updateData.phase = phase;

    const [updated] = await db
      .update(salVociTable)
      .set(updateData)
      .where(and(eq(salVociTable.id, req.params.voceId), eq(salVociTable.companyId, companyId)))
      .returning();

    if (!updated) return res.status(404).json({ message: "Voce non trovata" });
    res.json(updated);
  } catch (error: any) {
    console.error("[sal] PATCH voce error:", error);
    res.status(500).json({ message: error.message });
  }
});

// DELETE /sal/:id/voci/:voceId - Elimina voce SAL
adminRouter.delete("/sal/:id/voci/:voceId", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany?.companyId) return res.status(403).json({ message: "Nessuna azienda" });
    const companyId = userCompany.companyId;



    await db
      .delete(salVociTable)
      .where(and(eq(salVociTable.id, req.params.voceId), eq(salVociTable.companyId, companyId)));

    res.json({ success: true });
  } catch (error: any) {
    console.error("[sal] DELETE voce error:", error);
    res.status(500).json({ message: error.message });
  }
});
